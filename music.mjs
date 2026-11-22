// BasAkor Akademi — saf müzik/puanlama işlevleri; DOM veya cihaz bağımlılığı yok.
export const VERSION = '0.3.5';

const step=(kind,label,notes,options={})=>({kind,label,notes,...options});
export const noteName = n => {
  const names=['Do','Do♯','Re','Re♯','Mi','Fa','Fa♯','Sol','Sol♯','La','La♯','Si'];
  return names[((n%12)+12)%12]+(Math.floor(n/12)-1);
};
const bass=(label,note)=>step('bass',label,`${label} · ${noteName(note)}`,{midi:[note]});
const chord=(label,notes,midi)=>step('chord',label,notes,{midi});
const rest=()=>step('rest','ES','–');
const EM=()=>chord('Em','E4–G4–B4',[64,67,71]);
const AM=()=>chord('Am','A3–C4–E4',[57,60,64]);
const B7=()=>chord('B7','B3–D♯4–F♯4–A4',[59,63,66,69]);
export const LESSONS = [
  {id:'em-44',level:1,title:'Mi minör · İlk adım',meter:'4/4',grouping:[1,1,1,1],denominator:4,description:'DUM–ÇAK–DUM–ÇAK. Bas kök ve beşinci seste, akorlar ikinci ve dördüncü vuruşta.',defaultBpm:65,accent:[0,2],kickSteps:[0,2],snareSteps:[1,3],steps:[bass('Mİ',40),EM(),bass('Sİ',35),EM()]},
  {id:'em-44-variation',level:2,title:'4/4 · İkinci vuruş',meter:'4/4',grouping:[1,1,1,1],denominator:4,description:'Aynı 4/4 düzeninde bası Si’ye taşı; vuruşları sabit tut.',defaultBpm:85,accent:[0,2],kickSteps:[0,2],snareSteps:[1,3],steps:[bass('Mİ',40),EM(),bass('Sİ',35),EM()]},
  {id:'em-44-walk',level:3,title:'4/4 · Sekizlik bas yürüyüşü',meter:'4/4',grouping:[2,2,2,2],denominator:8,description:'Ölçü içinde daha hareketli bas çizgisi: Mi, Sol, Si, Re ve Fa♯ geçişlerini duy.',defaultBpm:72,accent:[0,2,4,6],kickSteps:[0,4],snareSteps:[2,6],steps:[bass('Mİ',40),bass('SOL',43),EM(),bass('Sİ',35),bass('Mİ',40),bass('RE',38),EM(),bass('FA♯',42)]},
  {id:'em-68',level:4,title:'6/8 · Üçlü akış',meter:'6/8',grouping:[3,3],denominator:8,description:'İki üçlü grubu say. Bas ilk grubu kökte, ikinciyi beşinci ve geçiş sesiyle taşır.',defaultBpm:84,accent:[0,3],kickSteps:[0],snareSteps:[3],steps:[bass('Mİ',40),rest(),EM(),bass('Sİ',35),bass('RE',38),EM()]},
  {id:'em-98',level:5,title:'9/8 · 2+2+2+3',meter:'9/8',grouping:[2,2,2,3],denominator:8,description:'Dokuz sekizlik sayımı: 2+2+2+3. Bas çizgisi Mi–Si–Re ile ölçüyü ileri taşır.',defaultBpm:90,accent:[0,2,4,6],kickSteps:[0,4],snareSteps:[2,6],steps:[bass('Mİ',40),rest(),EM(),bass('SOL',43),bass('Sİ',35),rest(),EM(),bass('RE',38),rest()]},
  {id:'em-98-reverse',level:6,title:'9/8 · 3+2+2+2',meter:'9/8',grouping:[3,2,2,2],denominator:8,description:'Dokuz sekizliği bu kez 3+2+2+2 grupla; bas ilk üçlüden sonra yeni vuruş gruplarını belirginleştirir.',defaultBpm:90,accent:[0,3,5,7],kickSteps:[0,5],snareSteps:[3,7],steps:[bass('Mİ',40),rest(),EM(),bass('SOL',43),bass('Sİ',35),EM(),bass('RE',38),bass('Mİ',40),rest()]},
  {id:'em-78',level:7,title:'7/8 · 2+2+3',meter:'7/8',grouping:[2,2,3],denominator:8,description:'Yedi sekizlik sayımı: 1-2 / 1-2 / 1-2-3. Bas Si ve Re geçişleriyle son gruba bağlanır.',defaultBpm:90,accent:[0,2,4],kickSteps:[0,4],snareSteps:[2],steps:[bass('Mİ',40),rest(),EM(),bass('Sİ',35),bass('RE',38),rest(),EM()]},
  {id:'em-78-reverse',level:8,title:'7/8 · 3+2+2',meter:'7/8',grouping:[3,2,2],denominator:8,description:'Yedi sekizliği 3+2+2 say. Mi–Sol–Si bas yürüyüşü grupları daha duyulur kılar.',defaultBpm:90,accent:[0,3,5],kickSteps:[0,5],snareSteps:[3],steps:[bass('Mİ',40),bass('SOL',43),EM(),bass('Sİ',35),bass('RE',38),EM(),bass('Mİ',40)]},
  {id:'em-58',level:9,title:'5/8 · 2+3',meter:'5/8',grouping:[2,3],denominator:8,description:'Beş sekizliği 2+3 say; bas ikinci grupta Si’ye geçer, son vuruş akora bağlanır.',defaultBpm:90,accent:[0,2],kickSteps:[0],snareSteps:[2],steps:[bass('Mİ',40),rest(),EM(),bass('Sİ',35),EM()]},
  {id:'em-58-reverse',level:10,title:'5/8 · 3+2',meter:'5/8',grouping:[3,2],denominator:8,description:'Aynı beş sekizlik ölçüyü 3+2 grupla; Si bası kısa ikinci grubu başlatır.',defaultBpm:90,accent:[0,3],kickSteps:[0],snareSteps:[3],steps:[bass('Mİ',40),rest(),EM(),bass('Sİ',35),bass('RE',38)]},
  {id:'em-128',level:11,title:'12/8 · Dörtlü üçleme',meter:'12/8',grouping:[3,3,3,3],denominator:8,description:'Dört üçlü grubu dolaş. Bas kök, beşinci ve geçiş sesleriyle her gruba yeni bir hareket verir.',defaultBpm:72,accent:[0,3,6,9],kickSteps:[0,6],snareSteps:[3,9],steps:[bass('Mİ',40),rest(),EM(),bass('Sİ',35),rest(),EM(),bass('Mİ',40),bass('RE',38),EM(),bass('Sİ',35),rest(),EM()]},
  {id:'em-am',level:12,title:'Em → Am · Akor değişimi',meter:'4/4',grouping:[2,2,2,2],denominator:8,description:'Bir ölçü Em, bir ölçü Am. Sol elde kök, beşinci ve geçiş sesleriyle çizgiyi değiştir; sağ elde akorları takip et.',defaultBpm:65,accent:[0,2,4,6],kickSteps:[0,4],snareSteps:[2,6],steps:[bass('Mİ',40),bass('Sİ',35),EM(),bass('Sİ',35),bass('Mİ',40),bass('SOL',43),EM(),bass('RE',38)],alternate:[bass('LA',33),bass('Mİ',40),AM(),bass('DO',36),bass('LA',33),bass('Sİ',35),AM(),bass('Mİ',40)]},
  {id:'em-b7',level:13,title:'Em → B7 · Basla dönüş',meter:'4/4',grouping:[2,2,2,2],denominator:8,description:'Em’den B7’ye geçerken Fa♯ ve Re♯ baslarıyla dönüşü hazırla; B7 akorunun dört sesini çal.',defaultBpm:60,accent:[0,2,4,6],kickSteps:[0,4],snareSteps:[2,6],steps:[bass('Mİ',40),bass('RE',38),EM(),bass('Sİ',35),bass('FA♯',42),EM(),bass('RE♯',39),bass('Sİ',35)],alternate:[bass('Sİ',35),bass('FA♯',42),B7(),bass('LA',45),bass('RE♯',39),bass('FA♯',42),B7(),bass('Sİ',35)]},
  {id:'am-em',level:14,title:'Am → Em · Ters dönüş',meter:'4/4',grouping:[2,2,2,2],denominator:8,description:'Am’den Em’e geri dön. La–Do–Mi bas hareketiyle başlayıp Mi minörün kök ve beşinci seslerine bağlan.',defaultBpm:68,accent:[0,2,4,6],kickSteps:[0,4],snareSteps:[2,6],steps:[bass('LA',33),bass('Mİ',40),AM(),bass('DO',36),bass('LA',33),bass('Sİ',35),AM(),bass('Mİ',40)],alternate:[bass('Mİ',40),bass('SOL',43),EM(),bass('Sİ',35),bass('Mİ',40),bass('RE',38),EM(),bass('FA♯',42)]}
];

export const getLesson = id=>LESSONS.find(l=>l.id===id)||LESSONS[0];
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
