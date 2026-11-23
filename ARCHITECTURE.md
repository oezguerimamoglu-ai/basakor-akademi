# BasAkor Akademi - MIDI Learning App Architecture

## User Flow

### 1. MIDI Upload & Analysis
- User uploads MIDI file
- App parses: tracks, channels, markers (Intro, Verse, Chorus), key, meter, tempo
- Displays full song structure with identified sections

### 2. Section & Track Selection
- User selects song section (Intro 1, Verse, etc. from MIDI markers)
- App auto-detects bass (lowest channel) + chord (highest channel)
- User can override selection
- Choose which tracks to hear while playing

### 3. Exercise Setup
- Transpose: Set via keyboard (or dedicated buttons)
- Tempo: Adjust live
- Track switch: Toggle which tracks to hear
- Start/Stop: Begin exercise

### 4. Live Exercise
- Backing tracks play (selected spuren)
- User plays along (bass/chord)
- Scoring: Real-time feedback (perfect/close/off timing + accuracy %)
- Keyboard shortcuts: Transpose, Tempo, Track switch during play

## Data Structure

### MidiFile (from parseMidiFile)
```
{
  format, trackCount, ppq,
  tracks: [{index, name, events, endTick}],
  events: [all notes with track info],
  midiEvents: [raw MIDI bytes],
  channels: [{channel, program, instrument, notes, ...}],
  tempoMap: [{tick, bpm}],
  meterMap: [{tick, numerator, denominator}],
  keyMap: [{tick, sf, minor}],
  endTick
}
```

### SongSection (detected from markers)
```
{
  id: "intro-1",          // from marker text or index
  name: "Intro 1",
  startTick: 0,
  endTick: 1920,
  loopTicks: 1920,        // for practice cycles
  markers: [{text, tick}] // "Intro", "Verse", etc.
}
```

### ExerciseConfig
```
{
  section: SongSection,
  playTracks: [1, 2, 3],       // which channels to hear
  userTrack: 1,                // which channel user plays
  bassFeel: "finger|pick|gm:33",
  chordFeel: "ep1|ep2|gm:0",
  transpose: 0,                // semitones
  tempoFactor: 1.0,            // 0.5 = 50%, 1.0 = 100%, etc.
  bpm: 100,                    // calculated from file + tempo factor
  strict: false,               // octave matching
  measureLength: 8             // how many beats to loop in practice
}
```

## UI Sections

### 01 MIDI Upload & Analysis
- File picker
- Summary: Title, BPM, Meter, Key, Duration
- Channel list with auto-detection (bass/chord highlight)

### 02 Choose Section
- Dropdown: Song sections from markers
- Preview: Section timing, loop length
- Track selection (which to hear while playing)

### 03 Exercise Settings (Real-time)
- Transpose slider/keyboard
- Tempo slider
- Track toggles (mute/unmute)
- Start/Stop button
- Keyboard shortcuts display

### 04 Exercise Display
- Now playing: Current action (bass note, chord)
- Beat grid: Show measure progress
- Score: Hits, misses, accuracy %
- Keyboard/controller feedback

## Implementation Phases

### Phase 1: Song Analysis (Priority)
- Enhance MIDI parser to extract markers
- Detect bass/chord channels automatically
- Build SongSection detection

### Phase 2: Section Selection UI
- Add section chooser (after upload)
- Display song structure visually
- Allow manual track override

### Phase 3: Exercise Engine
- Load section into practice mode
- Transpose + tempo handling
- Track muting/selection

### Phase 4: Keyboard Control
- Keyboard shortcuts during play
- Real-time transpose/tempo/track changes
- Display keyboard commands
