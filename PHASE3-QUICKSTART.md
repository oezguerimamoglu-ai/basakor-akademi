# Phase 3: Exercise Engine - Quick Start Guide

## What This Phase Delivers

**Live learning mode**: Upload a MIDI song → Select a section → Practice with real-time control

### Before Phase 3
```
❌ No song structure recognition
❌ No backing track playback
❌ No real-time transpose/tempo
```

### After Phase 3
```
✅ Upload MIDI → Auto-detect sections (Intro, Verse, Chorus)
✅ Select section + choose which tracks to hear
✅ Press Start → Backing tracks play
✅ Play along on keyboard/MIDI device
✅ Real-time control:
   • ← → Transpose (semitones)
   • ↑ ↓ Tempo (10% steps)
   • 1-9 Mute/unmute tracks
✅ Scoring: Hits, misses, accuracy %
```

---

## Implementation Roadmap

### Step 1: Keyboard Shortcuts (Day 1 - 2-3 hours)
**Goal**: React to keyboard input during practice

```javascript
// In app.mjs, inside queuedAudio() or new keydownListener
document.addEventListener('keydown', (e) => {
  if (!state.playing) return;
  
  switch(e.key) {
    case 'ArrowLeft': setTranspose(-1); break;
    case 'ArrowRight': setTranspose(1); break;
    case 'ArrowUp': setTempoFactor(1.1); break;
    case 'ArrowDown': setTempoFactor(0.9); break;
    case ' ': stop(); break;
    case '1': toggleTrack(11); break; // Channel 11, etc.
    // ... 2-9 for channels 12-19
  }
});

function setTranspose(semitones) {
  if (!state.currentExercise) return;
  state.currentExercise.transpose += semitones;
  // Clamp to ±12
  state.currentExercise.transpose = Math.max(-12, Math.min(12, state.currentExercise.transpose));
  updateFeedback(`Transpose: ${state.currentExercise.transpose > 0 ? '+' : ''}${state.currentExercise.transpose}`);
}

function setTempoFactor(factor) {
  if (!state.currentExercise) return;
  state.currentExercise.tempoFactor *= factor;
  state.currentExercise.tempoFactor = Math.max(0.5, Math.min(2.0, state.currentExercise.tempoFactor));
  state.currentExercise.bpm = state.currentExercise.originalBpm * state.currentExercise.tempoFactor;
  updateFeedback(`Tempo: ${Math.round(state.currentExercise.tempoFactor * 100)}%`);
}

function toggleTrack(channel) {
  // Find volume for this channel
  let vol = state.channelVolumes.get(channel) || 100;
  vol = vol ? 0 : 100; // Toggle
  state.channelVolumes.set(channel, vol);
  state.sectionPlayer?.setVolume(channel, vol);
}
```

### Step 2: Create SectionPlayer (Day 2 - 2-3 hours)
**Goal**: Play backing tracks with tempo/transpose

```javascript
// In midi-player.mjs
export class SectionPlayer {
  constructor(context, file, section, options = {}) {
    this.context = context;
    this.file = file;
    this.section = section;
    this.options = options;
    this.activeVoices = new Map();
    this.channelVolumes = new Map();
    
    // Filter events to section only
    this.events = midiPlaybackEvents(file)
      .filter(e => e.startSeconds >= tickToSeconds(file, section.startTick) &&
                   e.startSeconds < tickToSeconds(file, section.endTick));
  }
  
  play(startTime = this.context.currentTime) {
    // Schedule all events with current tempo
    this.stop(); // Clear previous
    
    const baseTime = startTime;
    const factor = this.options.tempoFactor || 1.0;
    
    for (const event of this.events) {
      const adjustedTime = baseTime + (event.startSeconds / factor);
      const volume = this.channelVolumes.get(event.channel) ?? 100;
      
      if (volume === 0) continue; // Skip muted channels
      
      const transpose = this.options.transpose || 0;
      const note = event.note + transpose;
      
      this.scheduleNote(note, event.channel, adjustedTime, event.endSeconds - event.startSeconds);
    }
  }
  
  scheduleNote(note, channel, when, duration) {
    // Use existing playProgramNote() or oscillator
    // Clamp note to 0-127
    if (note < 0 || note > 127) return;
    
    const program = /* ... program for channel ... */;
    playProgramNote(this.context, note, program, when, duration, 0.1);
  }
  
  setTranspose(semitones) {
    this.options.transpose = semitones;
    // Restart playback with new transpose
    this.play(this.context.currentTime);
  }
  
  setTempoFactor(factor) {
    this.options.tempoFactor = factor;
    this.play(this.context.currentTime);
  }
  
  setVolume(channel, percent) {
    this.channelVolumes.set(channel, Math.max(0, Math.min(100, percent)));
  }
  
  stop() {
    // Stop all active voices
    for (const voice of this.activeVoices.values()) {
      voice.finish?.();
    }
    this.activeVoices.clear();
  }
}
```

### Step 3: Integrate into Exercise (Day 3 - 1-2 hours)
**Goal**: Load section and run full practice

```javascript
// Modify start() function in app.mjs
function start() {
  if (state.playing) return;
  if (!state.importedMidi && state.lesson.id !== 'midi-import') {
    // Use existing lesson
    // ...existing code...
  } else if (state.importedMidi) {
    // NEW: Use MIDI section
    if (!state.currentExercise) {
      setFeedback('Önce bir bölüm seç.', 'bad');
      return;
    }
    
    // Create SectionPlayer
    state.sectionPlayer = new SectionPlayer(audio(), state.importedMidi, 
      state.currentExercise.section, {
        transpose: state.currentExercise.transpose || 0,
        tempoFactor: state.currentExercise.tempoFactor || 1.0
      });
    
    // Start playback
    state.sectionPlayer.play(audio().currentTime);
    
    // Reset scoring
    state.evaluated.clear();
    state.hits = 0;
    state.misses = 0;
    state.judged = 0;
    
    // Start timing
    state.originMs = performance.now();
    state.audioStart = audio().currentTime;
  }
  
  state.playing = true;
  state.demo = false;
  $('play').disabled = true;
  $('stop').disabled = false;
  
  // Activate keyboard listener
  document.addEventListener('keydown', handleKeyboardControl);
}
```

### Step 4: Real-Time Feedback (Day 3 - 1 hour)
**Goal**: Show what's happening

```javascript
function updateFeedback(message, style = 'info') {
  const $fb = $('feedback');
  $fb.textContent = message;
  $fb.className = `feedback ${style}`;
  
  // Auto-clear after 2s if not critical
  if (style === 'info') {
    setTimeout(() => {
      if ($fb.textContent === message) $fb.textContent = '...';
    }, 2000);
  }
}
```

---

## Testing Checklist

### Manual Testing
- [ ] Upload MIDI file with markers
- [ ] Sections appear in dropdown
- [ ] Select section → shows preview
- [ ] Press Start
- [ ] ← → changes transpose display
- [ ] ↑ ↓ changes tempo display
- [ ] 1-9 toggles track on/off
- [ ] Audio plays during practice
- [ ] User MIDI input scores

### Unit Tests (tests.test.mjs)
```javascript
test('setTranspose clamps to ±12', () => {
  const ex = buildExerciseConfig(...);
  ex.transpose = 10;
  setTranspose(5); // Would be 15
  assert.equal(ex.transpose, 12);
});

test('setTempoFactor clamps to 0.5-2.0', () => {
  const ex = buildExerciseConfig(...);
  ex.tempoFactor = 1.5;
  setTempoFactor(2.0); // Would be 3.0
  assert.equal(ex.tempoFactor, 2.0);
});
```

---

## UI Changes Required

### Add to "02 Ritmi takip et" panel:

```html
<!-- Real-time control status -->
<div id="exerciseStatus" class="exercise-status" hidden>
  <div class="control-info">
    <span id="transposeDisplay">Transpose: 0</span>
    <span id="tempoDisplay">Tempo: 100%</span>
  </div>
  <div class="track-status" id="trackStatus"></div>
  <div class="keyboard-hints">
    <small>← → Transpose | ↑ ↓ Tempo | 1-9 Spuren | SPACE Durdur</small>
  </div>
</div>
```

### CSS
```css
.exercise-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: rgba(165, 237, 199, 0.08);
  border-radius: 10px;
  margin-bottom: 15px;
  font-size: 12px;
  color: #c4d1e5;
}

.control-info span {
  margin-right: 20px;
  font-weight: 600;
  color: #a5edc7;
}

.control-info span.active {
  color: #fff;
  font-size: 13px;
}

.track-status {
  display: flex;
  gap: 8px;
  font-size: 10px;
}

.track-status .channel {
  padding: 2px 6px;
  background: #354860;
  border-radius: 4px;
  opacity: 0.6;
}

.track-status .channel.active {
  background: #9be4bc;
  color: #0c1224;
  opacity: 1;
}
```

---

## Common Pitfalls

❌ **Don't**: Restart audio playback on every transpose change
✅ **Do**: Adjust note values on-the-fly or reschedule current events

❌ **Don't**: Use `state.sectionPlayer` before creating it
✅ **Do**: Check if exercise is loaded before starting playback

❌ **Don't**: Clamp transpose after scheduling
✅ **Do**: Clamp before applying to notes

❌ **Don't**: Play all channels at once
✅ **Do**: Respect channel volumes and muting

---

## Estimated Timeline

- Keyboard shortcuts: 2-3 hours
- SectionPlayer implementation: 2-3 hours
- Exercise integration: 1-2 hours
- Testing & polish: 1-2 hours

**Total: 6-10 hours for working Phase 3**

Good luck! 🎹✨

