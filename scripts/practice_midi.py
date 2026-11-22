#!/usr/bin/env python3
"""Build an app-ready practice MIDI from transcribed bass and estimated chords."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import mido

from music_metrics import CHORD_QUALITIES, PITCH_CLASSES


_CHORD = re.compile(r"^([A-G](?:#|b)?)(m7|maj7|m|7)?$")
_PITCH_INDEX = {name: index for index, name in enumerate(PITCH_CLASSES)}
_PITCH_INDEX.update({"Db": 1, "Eb": 3, "Gb": 6, "Ab": 8, "Bb": 10})


def _is_note_off(message: mido.Message) -> bool:
    return message.type == "note_off" or (
        message.type == "note_on" and message.velocity == 0
    )


def _append_events(track: mido.MidiTrack, events: list[tuple[int, int, mido.Message]]) -> None:
    previous_tick = 0
    for tick, _priority, message in sorted(events, key=lambda item: (item[0], item[1])):
        absolute_tick = max(previous_tick, tick)
        track.append(message.copy(time=absolute_tick - previous_tick))
        previous_tick = absolute_tick


def _chord_notes(label: str) -> list[int]:
    match = _CHORD.fullmatch(label)
    if not match:
        return []

    root_name, quality = match.groups()
    root = _PITCH_INDEX.get(root_name)
    intervals = CHORD_QUALITIES.get(quality or "")
    if root is None or intervals is None:
        return []

    # C4–B4 roots keep the generated piano voicings in the app's right-hand range.
    base = 60 + root
    return [base + interval for interval in intervals]


def make_practice_midi(
    bass_midi_path: Path,
    output_path: Path,
    *,
    tempo_bpm: float,
    time_signature: str,
    chords: list[dict[str, Any]],
) -> Path:
    """Combine Basic Pitch bass notes with beat-aligned piano chord estimates."""
    source = mido.MidiFile(str(bass_midi_path))
    ppq = source.ticks_per_beat or 480

    try:
        numerator_text, denominator_text = time_signature.split("/", maxsplit=1)
        numerator, denominator = int(numerator_text), int(denominator_text)
    except (ValueError, AttributeError):
        numerator, denominator = 4, 4
    if numerator < 1 or denominator not in (1, 2, 4, 8, 16):
        numerator, denominator = 4, 4

    # BeatNet tracks the denominator-note pulse. MIDI tempo is expressed in
    # quarter notes per minute, so convert eighth-note pulse estimates for /8.
    quarter_bpm = max(1.0, float(tempo_bpm) * 4.0 / denominator)
    tempo = round(60_000_000 / quarter_bpm)

    midi = mido.MidiFile(type=1, ticks_per_beat=ppq)
    meta = mido.MidiTrack()
    meta.append(mido.MetaMessage("track_name", name="Tempo ve ölçü", time=0))
    meta.append(mido.MetaMessage("set_tempo", tempo=tempo, time=0))
    meta.append(
        mido.MetaMessage(
            "time_signature",
            numerator=numerator,
            denominator=denominator,
            clocks_per_click=24,
            notated_32nd_notes_per_beat=8,
            time=0,
        )
    )
    midi.tracks.append(meta)

    bass_track = mido.MidiTrack()
    bass_track.append(mido.MetaMessage("track_name", name="Bas · Basic Pitch", time=0))
    bass_track.append(mido.Message("program_change", channel=0, program=33, time=0))
    bass_events: list[tuple[int, int, mido.Message]] = []
    source_tempo = 500_000
    elapsed_seconds = 0.0

    for message in source.merged_track:
        elapsed_seconds += mido.tick2second(message.time, ppq, source_tempo)
        if message.type == "set_tempo":
            source_tempo = message.tempo
            continue
        if message.type not in ("note_on", "note_off"):
            continue

        target_tick = round(mido.second2tick(elapsed_seconds, ppq, tempo))
        note_message = message.copy(channel=0, time=0)
        priority = 0 if _is_note_off(note_message) else 1
        bass_events.append((target_tick, priority, note_message))

    _append_events(bass_track, bass_events)
    midi.tracks.append(bass_track)

    chord_track = mido.MidiTrack()
    chord_track.append(mido.MetaMessage("track_name", name="Akor · E-Piano (tahmin)", time=0))
    chord_track.append(mido.Message("program_change", channel=1, program=4, time=0))
    chord_events: list[tuple[int, int, mido.Message]] = []

    for segment in chords:
        notes = _chord_notes(str(segment.get("chord", "")))
        if not notes:
            continue
        start = max(0.0, float(segment["start_seconds"]))
        end = max(start + 0.02, float(segment["end_seconds"]))
        start_tick = round(mido.second2tick(start, ppq, tempo))
        end_tick = max(start_tick + 1, round(mido.second2tick(end, ppq, tempo)))
        for note in notes:
            chord_events.append(
                (start_tick, 1, mido.Message("note_on", channel=1, note=note, velocity=76, time=0))
            )
            chord_events.append(
                (end_tick, 0, mido.Message("note_off", channel=1, note=note, velocity=0, time=0))
            )

    _append_events(chord_track, chord_events)
    midi.tracks.append(chord_track)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    midi.save(str(output_path))
    return output_path
