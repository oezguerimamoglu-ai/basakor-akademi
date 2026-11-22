#!/usr/bin/env python3
"""Beat/meter and chord estimates for the experimental MP3 workflow."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import librosa
import numpy as np


BEATNET_CACHE = Path.home() / ".cache" / "basakor-akademi" / "beatnetlite"
BEATS_PER_BAR_CANDIDATES = [2, 3, 4, 5, 6, 7, 8, 9]
PITCH_CLASSES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
CHORD_QUALITIES = {
    "": (0, 4, 7),
    "m": (0, 3, 7),
    "7": (0, 4, 7, 10),
    "maj7": (0, 4, 7, 11),
    "m7": (0, 3, 7, 10),
}


def _load_beatnetlite() -> Any:
    source_file = BEATNET_CACHE / "BeatNetLite.py"
    if not source_file.is_file():
        raise RuntimeError(
            "BeatNetLite is not installed in this Codespace. "
            "Run: bash scripts/setup-beatnetlite.sh"
        )

    cache_path = str(BEATNET_CACHE)
    if cache_path not in sys.path:
        sys.path.insert(0, cache_path)

    from BeatNetLite import BeatNetLite

    # The Viterbi matrices scale with audio length and meter states. Keep
    # the tempo grid compact so long songs fit within a Codespace's memory.
    return BeatNetLite(
        1,
        beats_per_bar=BEATS_PER_BAR_CANDIDATES,
        min_bpm=55.0,
        max_bpm=215.0,
        num_tempi=16,
    )


def _time_signature_label(beats_per_bar: int) -> str:
    if beats_per_bar in (5, 7, 9):
        return f"{beats_per_bar}/8"
    if beats_per_bar == 6:
        return "6/8"
    if beats_per_bar == 8:
        return "8/8"
    return f"{beats_per_bar}/4"


def estimate_rhythm(audio_path: Path) -> dict[str, Any]:
    """Use BeatNetLite to estimate tempo and beats per bar.

    BeatNetLite estimates the number of beats per bar. The displayed denominator
    is mapped to common notation and is therefore a preliminary suggestion.
    """
    tracker = _load_beatnetlite()
    raw_result = tracker.process(str(audio_path))
    decoded = json.loads(raw_result) if isinstance(raw_result, str) else raw_result

    beat_grid = sorted(
        (
            {"time_seconds": float(time_seconds), "beat_in_bar": int(beat_number)}
            for time_seconds, beat_number in decoded.items()
        ),
        key=lambda beat: beat["time_seconds"],
    )
    if len(beat_grid) < 4:
        raise RuntimeError("BeatNetLite did not find enough beats to estimate tempo.")

    times = np.asarray([beat["time_seconds"] for beat in beat_grid], dtype=float)
    beat_numbers = np.asarray([beat["beat_in_bar"] for beat in beat_grid], dtype=int)
    intervals = np.diff(times)

    # Ignore large gaps and implausibly short detections when possible.
    plausible = intervals[(intervals >= 60.0 / 215.0) & (intervals <= 60.0 / 55.0)]
    if plausible.size < 3:
        plausible = intervals[intervals > 0]
    if plausible.size == 0:
        raise RuntimeError("BeatNetLite returned an unusable beat grid.")

    tempo_bpm = round(float(60.0 / np.median(plausible)), 1)
    beats_per_bar = int(np.max(beat_numbers))
    if beats_per_bar not in BEATS_PER_BAR_CANDIDATES:
        raise RuntimeError(f"Unexpected meter candidate from BeatNetLite: {beats_per_bar}")

    expected_next = (beat_numbers[:-1] % beats_per_bar) + 1
    meter_consistency = float(np.mean(beat_numbers[1:] == expected_next))

    alternatives = sorted(
        {
            round(candidate, 1)
            for candidate in (tempo_bpm / 2.0, tempo_bpm, tempo_bpm * 2.0)
            if 40.0 <= candidate <= 240.0
        }
    )
    denominator_note = (
        "Beats per bar are model-estimated; the denominator is mapped to common notation "
        "and should be confirmed by listening."
    )

    return {
        "tempo_bpm": tempo_bpm,
        "tempo_alternatives_bpm": alternatives,
        "beats_per_bar": beats_per_bar,
        "time_signature_estimate": _time_signature_label(beats_per_bar),
        "meter_tracking_consistency": round(meter_consistency, 3),
        "meter_note": denominator_note,
        "beat_count": len(beat_grid),
        "beat_grid": [
            {
                "time_seconds": round(beat["time_seconds"], 3),
                "beat_in_bar": beat["beat_in_bar"],
            }
            for beat in beat_grid
        ],
    }


def _chord_templates() -> list[tuple[str, np.ndarray]]:
    templates: list[tuple[str, np.ndarray]] = []
    for root_index, root_name in enumerate(PITCH_CLASSES):
        for quality, intervals in CHORD_QUALITIES.items():
            template = np.zeros(12, dtype=float)
            template[(root_index + np.asarray(intervals)) % 12] = 1.0
            template /= np.linalg.norm(template)
            templates.append((f"{root_name}{quality}", template))
    return templates


def _classify_chord(chroma_vector: np.ndarray) -> tuple[str, float]:
    norm = float(np.linalg.norm(chroma_vector))
    if norm < 1e-8:
        return "N", 0.0

    normalized = chroma_vector / norm
    scores = [
        (float(np.dot(normalized, template)), chord_name)
        for chord_name, template in _chord_templates()
    ]
    similarity, chord_name = max(scores)
    if similarity < 0.40:
        return "N", similarity
    return chord_name, similarity


def estimate_chords(
    accompaniment_path: Path,
    beat_grid: list[dict[str, Any]],
    beats_per_window: int = 2,
) -> list[dict[str, Any]]:
    """Estimate chord names in beat-aligned windows using chroma templates."""
    if beats_per_window < 1:
        raise ValueError("beats_per_window must be at least 1")

    signal, sample_rate = librosa.load(
        str(accompaniment_path),
        sr=22_050,
        mono=True,
    )
    if signal.size == 0:
        raise RuntimeError(f"Empty accompaniment stem: {accompaniment_path}")

    harmonic_signal = librosa.effects.harmonic(signal, margin=4.0)
    hop_length = 512
    chroma = librosa.feature.chroma_cqt(
        y=harmonic_signal,
        sr=sample_rate,
        hop_length=hop_length,
    )
    beat_times = [
        float(beat["time_seconds"])
        for beat in beat_grid
        if float(beat["time_seconds"]) < len(signal) / sample_rate
    ]
    if len(beat_times) < 2:
        raise RuntimeError("Not enough beat times for chord alignment.")

    duration = len(signal) / sample_rate
    raw_segments: list[dict[str, Any]] = []

    for beat_index in range(0, len(beat_times), beats_per_window):
        start_seconds = beat_times[beat_index]
        next_index = beat_index + beats_per_window
        end_seconds = beat_times[next_index] if next_index < len(beat_times) else duration
        start_frame = max(0, int(round(start_seconds * sample_rate / hop_length)))
        end_frame = min(chroma.shape[1], int(round(end_seconds * sample_rate / hop_length)))
        if end_frame <= start_frame:
            continue

        chroma_vector = np.mean(chroma[:, start_frame:end_frame], axis=1)
        chord_name, similarity = _classify_chord(chroma_vector)
        raw_segments.append(
            {
                "start_seconds": round(start_seconds, 3),
                "end_seconds": round(end_seconds, 3),
                "chord": chord_name,
                "template_similarity": round(similarity, 3),
            }
        )

    # Join adjacent windows with the same estimate to produce a readable progression.
    merged: list[dict[str, Any]] = []
    for segment in raw_segments:
        if (
            merged
            and merged[-1]["chord"] == segment["chord"]
            and segment["start_seconds"] <= merged[-1]["end_seconds"] + 0.08
        ):
            previous = merged[-1]
            old_length = previous["end_seconds"] - previous["start_seconds"]
            new_length = segment["end_seconds"] - segment["start_seconds"]
            total_length = old_length + new_length
            if total_length > 0:
                previous["template_similarity"] = round(
                    (
                        previous["template_similarity"] * old_length
                        + segment["template_similarity"] * new_length
                    )
                    / total_length,
                    3,
                )
            previous["end_seconds"] = segment["end_seconds"]
        else:
            merged.append(segment)

    return merged
