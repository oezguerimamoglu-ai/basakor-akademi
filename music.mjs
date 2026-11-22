// BasAkor Akademi — saf müzik/puanlama işlevleri; DOM veya cihaz bağımlılığı yok.
export const VERSION = '0.2.4';

const step=(kind,label,notes,options={})=>({kind,label,notes,...options});
export const LESSONS = [
  {
    id:'em-44', level:1, title:'Mi minör · İlk adım', meter:'4/4', grouping:[1,1,1,1], denominator:4,
    description:'DUM–ÇAK–DUM–ÇAK. Sol elde birinci ve üçüncü vuruşta bas; sağ elde ikinci ve dördüncüde akor.',
    defaultBpm:65, accent:[0,2],
    steps:[step('bass','Mİ','E2',{midi:[40]}),step('chord','Em','E4–G4–B4',{midi:[64,67,71]}),step('bass','Sİ','B1',{midi:[35]}),step('chord','Em','E4–G4–B4',{midi:[64,67,71]})]
  },
  {
    id:'em-44-variation', level:2, title:'4/4 · İkinci vuruş', meter:'4/4', grouping:[1,1,1,1], denominator:4,
    description:'Mi basıyla başla, ikinci bası Si’ye kaydır; düzeni 8 ölçü boyunca koru.',defaultBpm:85,accent:[0,2],
    steps:[step('bass','Mİ','E2',{midi:[40]}),step('chord','Em','E4–G4–B4',{midi:[64,67,71]}),step('bass','Sİ','B1',{midi:[35]}),step('chord','Em','E4–G4–B4',{midi:[64,67,71]})]
  },
  {
    id:'em-98',level:3,title:'9/8 · 2+2+2+3',meter:'9/8',grouping:[2,2,2,3],denominator:8,
    description:'Dokuz sekizlik: 2+2+2+3. Bu sadece koordinasyon kalıbıdır; yöresel ritim iddiası yoktur.',defaultBpm:90,accent:[0,2,4,6],
    steps:[step('bass','Mİ','E2',{midi:[40]}),step('rest','ES','–'),step('chord','Em','E4–G4–B4',{midi:[64,67,71]}),step('rest','ES','–'),step('bass','Sİ','B1',{midi:[35]}),step('rest','ES','–'),step('chord','Em','E4–G4–B4',{midi:[64,67,71]}),step('rest','ES','–'),step('rest','ES','–')]
  },
  {
    id:'em-78',level:4,title:'7/8 · 2+2+3',meter:'7/8',grouping:[2,2,3],denominator:8,
    description:'Yedi sekizlik sayımı: 1-2 / 1-2 / 1-2-3. Son grubun uzunluğunu hisset.',defaultBpm:90,accent:[0,2,4],
    steps:[step('bass','Mİ','E2',{midi:[40]}),step('rest','ES','–'),step('chord','Em','E4–G4–B4',{midi:[64,67,71]}),step('rest','ES','–'),step('bass','Sİ','B1',{midi:[35]}),step('rest','ES','–'),step('chord','Em','E4–G4–B4',{midi:[64,67,71]})]
  },
  {
    id:'em-58',level:5,title:'5/8 · 2+3',meter:'5/8',grouping:[2,3],denominator:8,
    description:'Beş sekizlik sayımı: 1-2 / 1-2-3. Sol el basını ve sağ el akorunu ritimde tut.',defaultBpm:90,accent:[0,2],
    steps:[step('bass','Mİ','E2',{midi:[40]}),step('rest','ES','–'),step('chord','Em','E4–G4–B4',{midi:[64,67,71]}),step('rest','ES','–'),step('chord','Em','E4–G4–B4',{midi:[64,67,71]})]
  },
  {
    id:'em-am',level:6,title:'Em → Am · Akor değişimi',meter:'4/4',grouping:[1,1,1,1],denominator:4,
    description:'Bir ölçü Em, ardından bir ölçü Am. Bas sol elde, akor sağ elde; iki ölçüde akoru değiştir.',defaultBpm:65,accent:[0,2],
    steps:[step('bass','Mİ','E2',{midi:[40]}),step('chord','Em','E4–G4–B4',{midi:[64,67,71]}),step('bass','Sİ','B1',{midi:[35]}),step('chord','Em','E4–G4–B4',{midi:[64,67,71]})],
    alternate:[step('bass','LA','A1',{midi:[33]}),step('chord','Am','A3–C4–E4',{midi:[57,60,64]}),step('bass','Mİ','E2',{midi:[40]}),step('chord','Am','A3–C4–E4',{midi:[57,60,64]})]
  },
  {
    id:'em-b7',level:7,title:'Em → B7 · Dönüş',meter:'4/4',grouping:[1,1,1,1],denominator:4,
    description:'Em ve B7 arasında iki ölçülük alıştırma. B7 için dört ses gereklidir.',defaultBpm:60,accent:[0,2],
    steps:[step('bass','Mİ','E2',{midi:[40]}),step('chord','Em','E4–G4–B4',{midi:[64,67,71]}),step('bass','Sİ','B1',{midi:[35]}),step('chord','Em','E4–G4–B4',{midi:[64,67,71]})],
    alternate:[step('bass','Sİ','B1',{midi:[35]}),step('chord','B7','B3–D♯4–F♯4–A4',{midi:[59,63,66,69]}),step('bass','FA♯','F♯2',{midi:[42]}),step('chord','B7','B3–D♯4–F♯4–A4',{midi:[59,63,66,69]})]
  }
];

export const getLesson = id=>LESSONS.find(l=>l.id===id)||LESSONS[0];
export const getSteps = (lesson, measure=0)=>lesson.alternate && measure%2===1 ? lesson.alternate : lesson.steps;
export const msPerStep = (bpm,denominator=4)=>60000/Math.max(1,bpm)*(4/denominator);
export const noteName = n => {
  const names=['Do','Do♯','Re','Re♯','Mi','Fa','Fa♯','Sol','Sol♯','La','La♯','Si'];
  return names[((n%12)+12)%12]+(Math.floor(n/12)-1);
};
export const pitchClass=n=>((n%12)+12)%12;
export const expectedMidi = event=>Array.isArray(event?.midi)?event.midi:[];
export const handName = kind=>kind==='bass'?'SOL EL · BAS':kind==='chord'?'SAĞ EL · AKOR':'ES';

// Bas için nota sınıfı ve yaklaşık oktav, akor için tüm bileşen sesler gerekir.
export function matchEvent(expected, actual, {strictBassOctave=false}={}) {
  if (!expected || expected.kind==='rest') return {ok:false,reason:'es'};
  if (!Array.isArray(actual) || actual.length===0) return {ok:false,reason:'empty'};
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
