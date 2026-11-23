// BasAkor Akademi — saf müzik/puanlama işlevleri; DOM veya cihaz bağımlılığı yok.
export const VERSION = '0.3.6';

const step=(kind,label,notes,options={})=>({kind,label,notes,...options});
export const noteName = n => {
  const names=['Do','Do♯','Re','Re♯','Mi','Fa','Fa♯','Sol','Sol♯','La','La♯','Si'];
  return names[((n%12)+12)%12]+(Math.floor(n/12)-1);
};
export const LESSONS = [];

export const getLesson = id=>LESSONS.find(l=>l.id===id)||null;
export const getSteps = (lesson, measure=0)=>lesson.songCycle?.length ? lesson.songCycle[measure%lesson.songCycle.length] : lesson.alternate && measure%2===1 ? lesson.alternate : lesson.steps;
export const msPerStep = (bpm,denominator=4)=>60000/Math.max(1,bpm)*(4/denominator);
export const pitchClass=n=>((n%12)+12)%12;
export const expectedMidi = event=>Array.isArray(event?.midi)?event.midi:[];
export const handName = kind=>kind==='bass'?'SOL EL · BAS':kind==='chord'?'SAĞ EL · AKOR':kind==='combo'?'SOL EL · BAS + SAĞ EL · AKOR':'ES';

// Bas için nota sınıfı ve yaklaşık oktav, akor için tüm bileşen sesler gerekir.
export function matchEvent(expected, actual, {strictBassOctave=false}={}) {
  if (!expected || expected.kind==='rest') return {ok:false,reason:'es'};
  if (!Array.isArray(actual) || actual.length===0) return {ok:false,reason:'empty'};
  if(expected.kind==='combo') {
    const bassNote=expected.bassMidi?.[0];
    const bassIndex=actual.findIndex(n=>pitchClass(n)===pitchClass(bassNote)&&(!strictBassOctave||n===bassNote));
    if(bassIndex<0)return {ok:false,reason:'wrong-bass'};
    const chordNeed=new Set((expected.chordMidi||[]).map(pitchClass));
    const chordHave=new Set(actual.filter((_,i)=>i!==bassIndex).map(pitchClass));
    const ok=chordNeed.size===chordHave.size&&[...chordNeed].every(pc=>chordHave.has(pc));
    return {ok,reason:ok?'ok':'wrong-chord'};
  }
  if(expected.kind==='bass') {
    if(actual.length!==1) return {ok:false,reason:'one-note'};
    const samePitch=pitchClass(actual[0])===pitchClass(expected.midi[0]);
    const sameRange=actual[0]===expected.midi[0];
    return {ok:samePitch && (!strictBassOctave||sameRange),reason:!samePitch?'wrong-note':!sameRange&&strictBassOctave?'wrong-octave':'ok'};
  }
  if(expected.kind==='chord') {
    const need=new Set(expected.midi.map(pitchClass));
    const have=new Set(actual.map(pitchClass));
    const ok=need.size===have.size && [...need].every(pc=>have.has(pc));
    return {ok,reason:ok?'ok':'wrong-chord'};
  }
  return {ok:false,reason:'unknown'};
}

export function nearestStep({eventMs,originMs,stepMs,stepsPerMeasure}){
  if(!Number.isFinite(eventMs)||!Number.isFinite(originMs)||!Number.isFinite(stepMs)||stepMs<=0) return null;
  const fractional=(eventMs-originMs)/stepMs;
  const absolute=Math.round(fractional);
  if(absolute<0) return null;
  const deviationMs=(fractional-absolute)*stepMs;
  return {absolute,measure:Math.floor(absolute/stepsPerMeasure),step:absolute%stepsPerMeasure,deviationMs};
}

export function timingGrade(deltaMs,stepMs){
  const d=Math.abs(deltaMs);
  if(d<=Math.min(140,stepMs*.20))return 'perfect';
  if(d<=Math.min(250,stepMs*.39))return 'close';
  return 'off';
}

export function currentEvent(lesson,absolute) {
  const measure=Math.floor(absolute/lesson.steps.length);
  return getSteps(lesson,measure)[absolute%lesson.steps.length];
}

export function countableEvents(lesson,measureCount){let n=0;for(let i=0;i<measureCount;i++)n+=getSteps(lesson,i).filter(s=>s.kind!=='rest').length;return n;}
