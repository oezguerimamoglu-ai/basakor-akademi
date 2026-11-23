# Phase 2: Integration der Song-Analyse in UI

## Status: Fertig ✅
- ✅ `extractSongSections()` - Marker-basierte Bölüm-Erkennung
- ✅ `detectPracticeTracks()` - Auto-Detection von Bas/Akkord-Spuren
- ✅ `buildExerciseConfig()` - Übungs-Konfiguration aus Auswahl
- ✅ CSS-Styling für Visualisierung

## Nächste Schritte für PHASE 3: Exercise Engine

### 3.1 Keyboard-Steuerung während der Übung
**Anforderung:** Während der Übung können mit dem Keyboard folgende Aktionen durchgeführt werden:
- **Transpose**: ← →  (Halbtonschritte +/-)
- **Tempo**: ↑ ↓  (10% schneller/langsamer)
- **Track Toggle**: 1-9 (Spuren ein/aus)
- **Start/Stop**: SPACE oder ENTER

**Implementierung:**
1. Globale `keydown` Listener hinzufügen (nur während `state.playing`)
2. `setTranspose(semitones)` - MIDI-Noten in Echtzeit transponieren
3. `setTempoFactor(factor)` - BPM anpassen (0.5 bis 2.0)
4. `toggleTrack(channel)` - Spur stummschalten/aktivieren
5. UI-Overlay mit Keyboard-Shortcuts anzeigen

### 3.2 Echtzeit-Analyse von Spieler-Input
**Anforderung:** App erkennt und bewertet, was Spieler macht

**Implementierung:**
1. Existing `matchEvent()` von music.mjs verwenden
2. `midiPlaybackEvents()` aus midi-player.mjs als "backing track"
3. User-Input (von MIDI oder UI-Buttons) gegen Expected Notes prüfen
4. Score im bestehenden System akkumulieren (hits/misses/accuracy%)

### 3.3 Multi-Track Playback mit Spur-Kontrolle
**Anforderung:** Bestimmte Spuren abspielen, Benutzer spielt die andere

**Implementierung:**
1. `midiPlaybackEvents()` filtern nach `section.startTick` bis `section.endTick`
2. Nach Kanal/Spur sortieren
3. Web Audio mit "loop until end of section" abspielen
4. Volume + Transpose pro Spur anpassen
5. Bei Noten-Hit des Users: Feedback (visual + audio)

## Datenfluss Phase 3

```
1. MIDI Upload → loadMidiAnalysis()
                 ↓
2. User wählt Section + Tracks
                 ↓
3. buildExerciseConfig() → state.currentExercise
                 ↓
4. start() aufgerufen
   ├─ midiPlaybackEvents() filtern
   ├─ Audio-Playback starten
   └─ Keyboard-Listener aktivieren
                 ↓
5. User spielt → MIDI Input empfangen
   ├─ matchEvent() gegen Expected
   ├─ Scoring aktualisieren
   └─ Score anzeigen
                 ↓
6. Keyboard: Transpose/Tempo/Tracks ändern
   ├─ Audio-Playback anpassen
   └─ Noten-Mapping aktualisieren
                 ↓
7. Section zu Ende → Ergebnisse anzeigen
```

## Code-Struktur Phase 3

### app.mjs Erweiterungen:
```javascript
// New state properties
state.currentExercise = null;
state.keyboardBindings = {
  'ArrowLeft': () => setTranspose(-1),
  'ArrowRight': () => setTranspose(+1),
  'ArrowUp': () => setTempoFactor(1.1),
  'ArrowDown': () => setTempoFactor(0.9),
  ' ': () => state.playing ? stop() : start(),
  '1-9': (n) => toggleTrack(10 + n) // Channels 11-19
};

function setTranspose(semitones) {
  if (!state.currentExercise) return;
  state.currentExercise.transpose = semitones;
  updateMidiTransposition();
  showKeyboardFeedback('Transpose: ' + (semitones > 0 ? '+' : '') + semitones);
}

function setTempoFactor(factor) {
  if (!state.currentExercise) return;
  state.currentExercise.tempoFactor = factor;
  state.currentExercise.bpm = state.currentExercise.originalBpm * factor;
  updatePlaybackSpeed();
  showKeyboardFeedback('Tempo: ' + Math.round(factor * 100) + '%');
}

function toggleTrack(channel) {
  // Mute/unmute in audio playback
  state.sectionPlayer?.setVolume(channel, 
    state.sectionPlayer.getVolume(channel) ? 0 : 100
  );
}
```

### midi-player.mjs Erweiterungen:
```javascript
// New class: SectionPlayer
export class SectionPlayer {
  constructor(context, file, section, options) {
    this.context = context;
    this.file = file;
    this.section = section;
    this.events = midiPlaybackEvents(file)
      .filter(e => e.startSeconds >= tickToSeconds(section.startTick));
    this.activeVoices = new Map();
    this.channelVolumes = new Map();
    this.transposition = options.transpose || 0;
    this.tempoFactor = options.tempoFactor || 1.0;
  }
  
  play(startTime = this.context.currentTime) {
    // Schedule all events with current tempo/transpose
  }
  
  setTranspose(semitones) {
    // Update all scheduled events
  }
  
  setTempoFactor(factor) {
    // Reschedule with new timing
  }
  
  setVolume(channel, percent) {
    // Update gain for channel
  }
}
```

## Testing Phase 3

### Unit Tests (tests.test.mjs):
```javascript
test('setTranspose changes MIDI note mapping', () => {
  // Create exercise with transpose=-2
  // Verify: input note 60 → output 58
});

test('setTempoFactor adjusts playback speed', () => {
  // Create exercise with tempoFactor=0.5
  // Verify: event at 1 sec → plays at 2 sec
});

test('toggleTrack mutes/unmutes channel', () => {
  // Start playback with channel 1 muted
  // Verify: no audio output from channel 1
});
```

### UI Tests (tests-ui.test.mjs):
```javascript
test('Keyboard shortcut ArrowRight increases transpose', async () => {
  // Start exercise
  // Send ArrowRight key
  // Verify: UI shows +1 transpose
});

test('Keyboard shortcut ArrowUp increases tempo', async () => {
  // Start exercise  
  // Send ArrowUp key (3x)
  // Verify: BPM display increases by ~30%
});
```

## UI Changes Phase 3

### Exercise Stage Panel
Modify "02 Ritmi takip et" to show:
1. Keyboard shortcuts overlay (top-right corner)
2. Current transpose: `+2` (green if active)
3. Current tempo: `110 BPM` (yellow if changed)
4. Track status icons: 🎙️(1) 🎸(2) 🥁(3) with mute state

### New Feedback Display
- Keyboard action feedback: slides in top-left, disappears after 1s
- Example: "Transpose +2 | Tempo 90% | Track 2 muted"

## Estimated Timeline
- 3.1 Keyboard control: 2-3 hours
- 3.2 Real-time analysis: 1-2 hours (reuse existing matchEvent logic)
- 3.3 Multi-track playback: 2-3 hours (most complex)
- Testing: 1-2 hours
- UI polish: 1 hour

**Total Phase 3: ~10-14 Stunden**
