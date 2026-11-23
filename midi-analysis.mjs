// MIDI song analysis and exercise preparation (Phase 2+)
// Provides enhanced UI for section selection, track auto-detection, and exercise setup
import {extractSongSections, detectPracticeTracks, suggestedChannels, tempoAt, meterAt, measureTicks} from './midi-file.mjs';

/** Render song structure visualization showing all sections and their markers */
export function renderSongStructure(file) {
  const sections = extractSongSections(file);
  if (!sections.length) return null;
  
  const html = sections.map(section => {
    const timeStart = formatTime(midiTickToSeconds(file, section.startTick));
    const timeEnd = formatTime(midiTickToSeconds(file, section.endTick));
    const duration = section.durationSeconds;
    const measures = Math.round(section.loopTicks / measureTicks(file.ppq, meterAt(file, section.startTick)));
    
    return `
      <div class="section-item" data-section-id="${section.id}" data-start-tick="${section.startTick}">
        <div class="section-header">
          <strong>${section.name}</strong>
          <span class="section-time">${timeStart}–${timeEnd} (${formatDuration(duration)})</span>
        </div>
        <div class="section-meta">
          <span class="measures">${measures} ölçü</span>
          <span class="tempo">${Math.round(tempoAt(file, section.startTick))} BPM</span>
        </div>
      </div>
    `;
  }).join('');
  
  return html;
}

/** Render track/channel analysis showing which are suitable for bass, chord, drums */
export function renderTrackAnalysis(file, userPrefs = {}) {
  const tracks = detectPracticeTracks(file, userPrefs);
  
  const bassHtml = `
    <div class="track-role bass-track">
      <h4>🎸 Bas (Sol El)</h4>
      <div class="track-detail">
        <span class="channel">Kanal ${tracks.bass.channel}</span>
        <span class="instrument">${tracks.bass.instrument}</span>
        <span class="range">Not aralığı: ${noteName(tracks.bass.minNote)} – ${noteName(tracks.bass.maxNote)}</span>
        <span class="count">${tracks.bass.noteCount} nota</span>
      </div>
    </div>
  `;
  
  const chordHtml = tracks.chord.channel ? `
    <div class="track-role chord-track">
      <h4>🎹 Akor (Sağ El)</h4>
      <div class="track-detail">
        <span class="channel">Kanal ${tracks.chord.channel}</span>
        <span class="instrument">${tracks.chord.instrument}</span>
        <span class="range">Not aralığı: ${noteName(tracks.chord.minNote)} – ${noteName(tracks.chord.maxNote)}</span>
        <span class="count">${tracks.chord.noteCount} nota</span>
      </div>
    </div>
  ` : '';
  
  const drumsHtml = tracks.drums.active ? `
    <div class="track-role drums-track">
      <h4>🥁 Davul</h4>
      <div class="track-detail">
        <span class="channel">Kanal 10</span>
        <span class="status">Aktif</span>
      </div>
    </div>
  ` : '';
  
  return bassHtml + chordHtml + drumsHtml;
}

/** Format time in MM:SS */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** Format duration as "1 min 23 sec" or "45 sec" */
function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)} san`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs ? `${mins} dk ${secs} san` : `${mins} dk`;
}

/** Convert MIDI tick to seconds (same logic as in midi-player.mjs) */
function midiTickToSeconds(file, tick) {
  let seconds = 0, cursor = 0, bpm = tempoAt(file, 0);
  for (const tempo of file.tempoMap) {
    if (tempo.tick > tick) break;
    seconds += (tempo.tick - cursor) * 60 / (file.ppq * bpm);
    cursor = tempo.tick;
    bpm = tempo.bpm;
  }
  seconds += (tick - cursor) * 60 / (file.ppq * bpm);
  return seconds;
}

/** Get readable note name from MIDI note number */
function noteName(note) {
  if (note < 0 || note > 127) return '–';
  const names = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
  return names[note % 12] + (Math.floor(note / 12) - 1);
}

/** Build exercise configuration from selected section and user preferences */
export function buildExerciseConfig(file, options = {}) {
  const {
    sectionIndex = 0,
    transpose = 0,
    tempoFactor = 1.0,
    userPlayChannel = null,
    listenChannels = []
  } = options;
  
  const sections = extractSongSections(file);
  if (!sections.length) throw new Error('Şarkı bölümü bulunamadı.');
  if (sectionIndex >= sections.length) throw new Error('Geçersiz bölüm indeksi.');
  
  const section = sections[sectionIndex];
  const baseMeter = meterAt(file, section.startTick);
  const baseBpm = tempoAt(file, section.startTick);
  const adjustedBpm = baseBpm * tempoFactor;
  
  const tracks = detectPracticeTracks(file);
  const playChannel = userPlayChannel ?? tracks.bass.channel;
  const hearChannels = listenChannels.length ? listenChannels : [tracks.chord.channel].filter(Boolean);
  
  return {
    file,
    section,
    playChannel,          // Which channel user plays
    hearChannels,         // Which channels are heard
    transpose,            // Semitones
    tempoFactor,          // 0.5 = 50%, 1.0 = normal, 2.0 = double
    bpm: adjustedBpm,
    originalBpm: baseBpm,
    meter: baseMeter,
    sectionName: section.name,
    sectionTick: section.startTick,
    sectionEndTick: section.endTick,
    loopTicks: section.loopTicks
  };
}
