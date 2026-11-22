#!/usr/bin/env python3
"""Separate a song's bass stem with Demucs, then transcribe it with Basic Pitch."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract a bass stem with Demucs and convert it to MIDI with Basic Pitch."
    )
    parser.add_argument("audio", type=Path, help="Input MP3, WAV, FLAC, or other ffmpeg-readable audio")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("analysis"),
        help="Directory for separated stems and MIDI output (default: analysis/)",
    )
    args = parser.parse_args()

    audio = args.audio.expanduser().resolve()
    if not audio.is_file():
        parser.error(f"Audio file not found: {audio}")

    output_root = args.output.expanduser().resolve() / audio.stem
    stem_output = output_root / "stems"
    midi_output = output_root / "midi"
    expected_track_dir = stem_output / "htdemucs" / audio.stem
    bass_stem = expected_track_dir / "bass.wav"

    # Keep reruns predictable without asking Demucs to overwrite unrelated files.
    shutil.rmtree(expected_track_dir, ignore_errors=True)
    stem_output.mkdir(parents=True, exist_ok=True)
    midi_output.mkdir(parents=True, exist_ok=True)

    print(f"1/2 Demucs: separating bass from {audio.name} (CPU; this can take a while).")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "demucs",
            "-d",
            "cpu",
            "-n",
            "htdemucs",
            "--two-stems",
            "bass",
            "-o",
            str(stem_output),
            str(audio),
        ],
        check=True,
    )
    if not bass_stem.is_file():
        raise FileNotFoundError(f"Demucs finished but bass stem was not found: {bass_stem}")

    print("2/2 Basic Pitch: transcribing the isolated bass stem to MIDI.")
    subprocess.run(
        ["basic-pitch", str(midi_output), str(bass_stem)],
        check=True,
    )

    print(f"Done. Bass stem: {bass_stem}")
    print(f"Basic Pitch outputs: {midi_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
