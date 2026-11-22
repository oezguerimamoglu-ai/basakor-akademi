#!/usr/bin/env python3
"""Separate a song into stems, transcribe its bass, and estimate rhythm/chords."""

from __future__ import annotations

import argparse
import csv
import json
import shutil
import subprocess
import sys
from pathlib import Path

from music_metrics import estimate_chords, estimate_rhythm


def write_chord_outputs(output_root: Path, chords: list[dict[str, object]]) -> tuple[Path, Path]:
    csv_path = output_root / "chords.csv"
    text_path = output_root / "chords.txt"

    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=("start_seconds", "end_seconds", "chord", "template_similarity"),
        )
        writer.writeheader()
        writer.writerows(chords)

    with text_path.open("w", encoding="utf-8") as handle:
        handle.write("Akkordfolge (vorläufige Schätzung)\n")
        for chord in chords:
            start = float(chord["start_seconds"])
            minute, second = divmod(int(start), 60)
            handle.write(f"{minute:02d}:{second:02d}  {chord['chord']}\n")
    return csv_path, text_path


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Separate bass and accompaniment, transcribe the bass to MIDI, "
            "and estimate BPM, meter, and chords."
        )
    )
    parser.add_argument(
        "audio",
        type=Path,
        help="Input MP3, WAV, FLAC, or other ffmpeg-readable audio",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("analysis"),
        help="Directory for stems and analysis output (default: analysis/)",
    )
    parser.add_argument(
        "--chord-beats",
        type=int,
        default=2,
        help="Beat window used for each chord estimate before repeated chords are merged (default: 2)",
    )
    args = parser.parse_args()

    audio = args.audio.expanduser().resolve()
    if not audio.is_file():
        parser.error(f"Audio file not found: {audio}")
    if args.chord_beats < 1:
        parser.error("--chord-beats must be a positive integer")

    output_root = args.output.expanduser().resolve() / audio.stem
    stem_output = output_root / "stems"
    midi_output = output_root / "midi"
    expected_track_dir = stem_output / "htdemucs" / audio.stem
    bass_stem = expected_track_dir / "bass.wav"
    accompaniment_stem = expected_track_dir / "other.wav"

    # Replace only the generated outputs for this input song.
    shutil.rmtree(expected_track_dir, ignore_errors=True)
    shutil.rmtree(midi_output, ignore_errors=True)
    stem_output.mkdir(parents=True, exist_ok=True)
    midi_output.mkdir(parents=True, exist_ok=True)

    print(
        f"1/4 Demucs: separating bass, drums, vocals, and accompaniment from {audio.name} (CPU).",
        flush=True,
    )
    subprocess.run(
        [
            sys.executable,
            "-m",
            "demucs",
            "-d",
            "cpu",
            "-n",
            "htdemucs",
            "-o",
            str(stem_output),
            str(audio),
        ],
        check=True,
    )
    if not bass_stem.is_file():
        raise FileNotFoundError(f"Demucs finished but bass stem was not found: {bass_stem}")
    if not accompaniment_stem.is_file():
        raise FileNotFoundError(
            f"Demucs finished but accompaniment stem was not found: {accompaniment_stem}"
        )

    print("2/4 Basic Pitch: transcribing the separated bass stem to MIDI.", flush=True)
    subprocess.run(
        ["basic-pitch", str(midi_output), str(bass_stem)],
        check=True,
    )

    print("3/4 BeatNetLite: estimating beat grid, BPM, and beats per bar.", flush=True)
    rhythm = estimate_rhythm(audio)

    print("4/4 Librosa: estimating chords from Demucs' accompaniment stem.", flush=True)
    chords = estimate_chords(
        accompaniment_stem,
        rhythm["beat_grid"],
        beats_per_window=args.chord_beats,
    )
    csv_path, text_path = write_chord_outputs(output_root, chords)

    report = {
        "input_file": audio.name,
        "tempo_and_meter": {
            key: value
            for key, value in rhythm.items()
            if key != "beat_grid"
        },
        "chord_method": (
            "Harmonic chroma template matching on Demucs' other stem; "
            "major/minor triads and common seventh chords."
        ),
        "chord_segments": chords,
        "limitations": [
            "BPM and beats per bar are model estimates and can be ambiguous.",
            "The displayed time-signature denominator is mapped to common notation; confirm it by listening.",
            "Chord labels are first-pass estimates from the accompaniment stem, not a verified score.",
        ],
    }
    report_path = output_root / "music-analysis.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Done. Bass stem: {bass_stem}")
    print(f"Bass MIDI and related files: {midi_output}")
    print(f"Estimated tempo: {rhythm['tempo_bpm']} BPM")
    print(
        f"Estimated meter: {rhythm['time_signature_estimate']} "
        f"({rhythm['beats_per_bar']} beats per bar; preliminary)"
    )
    print(f"Chord report: {text_path}")
    print(f"Structured analysis: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
