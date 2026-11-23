import {VERSION,LESSONS,getLesson,getSteps,msPerStep,noteName,matchEvent,nearestStep,timingGrade,currentEvent,handName} from './music.mjs';
import {parseMidiFile,tempoAt,meterAt,measureTicks,sourceDurationSeconds,detectKey,buildMidiSectionLesson,styleSections,suggestedChannels,GM_INSTRUMENTS,MIDI_NOTE_NAMES} from './midi-file.mjs';
import {MidiFilePlayer,MidiSectionPlayer,playProgramNote} from './midi-player.mjs';

const $ = id=>document.getElementById(id);
const KEY='basakor-akademi-progress-v2';
const MIX_KEY='basakor-akademi-mix-v1';
const runLength=8;
const LESSON_GROUPS=[
  {id:'beginner',label:'Başlangıç',levels:[1,2,3,4]},
  {id:'meters',label:'Orta · Ritim kalıpları',levels:[5,6,7,8,9,10,11]},
  {id:'chords',label:'İleri · Akor geçişleri',levels:[12,13,14]},
  {id:'all',label:'Tüm seviyeler',levels:null}
];
const state={
  lesson:LESSONS[0],levelGroup:'all',bpm:65,mode:'app',ctx:null,bassMixGain:null,chordMixGain:null,bassVolume:100,chordVolume:100,playing:false,waitingClock:false,demo:false,strict:false,bassTone:'finger',epianoTone:'ep1',bassBuffers:{},epianoBuffers:{},bassLoading:null,
  originMs:0,audioStart:0,nextScheduled:0,timer:null,raf:null,sessionId:0,
  evaluated:new Map(),nextMiss:0,hits:0,misses:0,judged:0,visualBeat:-1,
  midi:null,midiInput:null,midiCluster:null,midiClusterTimer:null,midiNotes:new Map(),
  clock:{armed:false,running:false,ticks:0,lastTickMs:0,avgTickMs:0,pulseTimes:[],sourceId:null},
  tapTimes:[],records:{},mutedPage:false,importedMidi:null,importedLesson:null,importedKey:null,midiPlayer:null,midiPracticeChannels:[],midiSections:[],sectionPlayer:null,channelVolumes:new Map(),practiceClusters:new Map()
};
try{const old=JSON.parse(localStorage.getItem(KEY)||'{}');if(old&&typeof old==='object')state.records=old;}catch{}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state.records));}catch{}};
const clampVolume=value=>{const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(100,Math.round(number))):100;};
function loadMixSettings(){try{const settings=JSON.parse(localStorage.getItem(MIX_KEY)||'{}');state.bassVolume=clampVolume(settings.bassVolume??100);state.chordVolume=clampVolume(settings.chordVolume??100);}catch{}}
function saveMixSettings(){try{localStorage.setItem(MIX_KEY,JSON.stringify({bassVolume:state.bassVolume,chordVolume:state.chordVolume}));}catch{}}
function setMixVolume(instrument,value){
  const volume=clampVolume(value);state[`${instrument}Volume`]=volume;
  const input=$(`${instrument}Volume`),output=$(`${instrument}VolumeValue`);
  if(input){input.value=String(volume);input.setAttribute('aria-valuetext',`${volume}%`);}
  if(output)output.textContent=`${volume}%`;
  const bus=state[`${instrument}MixGain`];if(bus){const level=volume/100;if(typeof bus.gain.setTargetAtTime==='function')bus.gain.setTargetAtTime(level,state.ctx.currentTime,.015);else bus.gain.value=level;}
  saveMixSettings();
}
function initializeMixControls(){for(const instrument of ['bass','chord']){setMixVolume(instrument,state[`${instrument}Volume`]);$(`${instrument}Volume`).addEventListener('input',event=>setMixVolume(instrument,event.target.value));}}
loadMixSettings();

// Web Audio — ağdan ses dosyası indirmez; bağlantısız çalışır.
function audio(){if(!state.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw new Error('Tarayıcın ses üretimini desteklemiyor.');state.ctx=new C();state.bassMixGain=state.ctx.createGain();state.chordMixGain=state.ctx.createGain();state.bassMixGain.gain.value=state.bassVolume/100;state.chordMixGain.gain.value=state.chordVolume/100;state.bassMixGain.connect(state.ctx.destination);state.chordMixGain.connect(state.ctx.destination);}return state.ctx;}
function oscillator(freq,t,length,volume,type='sine',output=null){
  if(!state.ctx)return;const c=state.ctx,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),t+.014);g.gain.exponentialRampToValueAtTime(.0001,t+length);o.connect(g).connect(output||c.destination);o.start(t);o.stop(t+length+.018);
}
function toneFromMidi(note,t,length=.24,volume=.12,type='triangle',output=null) {oscillator(440*Math.pow(2,(note-69)/12),t,length,volume,type,output)}
const BASS_SAMPLES={finger:[{root:33,file:'finger-A.wav'},{root:35,file:'finger-B.wav'},{root:39,file:'finger-Dsharp.wav'}],pick:[{root:33,file:'pick-A.wav'},{root:35,file:'pick-B.wav'},{root:40,file:'pick-E2.wav'}]};
const EPIANO_SAMPLES={ep1:[{root:60,file:'ep1-C4.wav'},{root:66,file:'ep1-Fsharp4.wav'},{root:72,file:'ep1-C5.wav'}],ep2:[{root:60,file:'ep2-C4.wav'},{root:66,file:'ep2-Fsharp4.wav'},{root:72,file:'ep2-C5.wav'}]};
async function loadBassSamples(){if(state.bassLoading)return state.bassLoading;state.bassLoading=(async()=>{const c=audio();await Promise.all([['bass',BASS_SAMPLES,'./assets/bass/'],['epiano',EPIANO_SAMPLES,'./assets/epiano/']].map(async([kind,banks,path])=>{const target=kind==='bass'?state.bassBuffers:state.epianoBuffers;for(const [tone,entries] of Object.entries(banks)){target[tone]={};await Promise.all(entries.map(async entry=>{try{const response=await fetch(path+entry.file);if(!response.ok)throw new Error();target[tone][entry.root]=await c.decodeAudioData(await response.arrayBuffer());}catch{target[tone]={};}}));}}));})();return state.bassLoading;}
const selectedGmProgram=value=>String(value).startsWith('gm:')?Number(String(value).slice(3)):null;
function playBass(note,t){const c=state.ctx,output=state.bassMixGain||c.destination,program=selectedGmProgram(state.bassTone);if(program!==null){playProgramNote(c,note,program,t,.34,.12,output);return;}const samples=state.bassBuffers[state.bassTone];if(!samples){toneFromMidi(note,t,.32,.15,'triangle',output);return;}const roots=Object.keys(samples).map(Number),root=roots.reduce((a,b)=>Math.abs(b-note)<Math.abs(a-note)?b:a);const src=c.createBufferSource(),gain=c.createGain();src.buffer=samples[root];src.playbackRate.setValueAtTime(Math.pow(2,(note-root)/12),t);gain.gain.setValueAtTime(.72,t);gain.gain.setTargetAtTime(.0001,t+.32,.4);src.connect(gain).connect(output);src.start(t);src.stop(t+1.8);}
function playEPiano(note,t){const c=state.ctx,output=state.chordMixGain||c.destination,program=selectedGmProgram(state.epianoTone);if(program!==null){playProgramNote(c,note,program,t,.46,.085,output);return;}const samples=state.epianoBuffers[state.epianoTone];if(!samples||!Object.keys(samples).length){toneFromMidi(note,t,.32,.08,'triangle',output);return;}const roots=Object.keys(samples).map(Number),root=roots.reduce((a,b)=>Math.abs(a-note)<Math.abs(b-note)?a:b);const src=c.createBufferSource(),gain=c.createGain();src.buffer=samples[root];src.playbackRate.setValueAtTime(Math.pow(2,(note-root)/12),t);gain.gain.setValueAtTime(.62,t);gain.gain.setTargetAtTime(.0001,t+.48,.45);src.connect(gain).connect(output);src.start(t);src.stop(t+2.08);}
function playNotes(notes,at=null){try{const c=audio();const t=at??c.currentTime+.002;notes.forEach((n,i)=>{if(notes.length===1)playBass(n,t);else playEPiano(n,t+i*.004)});}catch{}}
function kick(t){const c=state.ctx,o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(130,t);o.frequency.exponentialRampToValueAtTime(44,t+.14);g.gain.setValueAtTime(.28,t);g.gain.exponentialRampToValueAtTime(.0001,t+.17);o.connect(g).connect(c.destination);o.start(t);o.stop(t+.19)}
function noise(t,duration=.06,level=.075,cutoff=2300){const c=state.ctx,size=Math.ceil(c.sampleRate*duration),buffer=c.createBuffer(1,size,c.sampleRate),d=buffer.getChannelData(0);for(let i=0;i<size;i++)d[i]=Math.random()*2-1;const o=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();o.buffer=buffer;f.type='highpass';f.frequency.value=cutoff;g.gain.setValueAtTime(level,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(f).connect(g).connect(c.destination);o.start(t);o.stop(t+duration+.001)}
function drums(t,step){const l=state.lesson,accent=l.accent.includes(step),kickSteps=l.kickSteps||[0],snareSteps=l.snareSteps||l.accent.filter(i=>i!==0);
  if(l.gridStepTicks&&step%l.beatSteps!==0)return;
  if(kickSteps.includes(step))kick(t);
  if(snareSteps.includes(step))noise(t,.095,.11,1400);
  noise(t,.035,accent?.04:.021,4200);
}
function setFeedback(message,type=''){const el=$('feedback');el.className='feedback'+(type?' '+type:'');el.textContent=message;}
function setStatus(message,playing=false){$('statusPill').textContent=message;$('statusPill').classList.toggle('playing',playing)}
function showMeasure(num){const l=state.lesson,bar=l.songCycle?.length?l.sourceStartMeasure+(num%l.songCycle.length):num+1;$('measure').textContent=l.songCycle?.length?`MIDI ölçü ${bar}`:`Ölçü ${bar}`;$('measureProgress').textContent=l.performanceEvents?`Döngü ${Math.floor(num/l.sourceBarCount)+1} · ${num%l.sourceBarCount+1} / ${l.sourceBarCount}`:`${Math.min(num+1,runLength)} / ${runLength}`;}
function describeExpected(expected){if(!expected)return;$('actionType').textContent=handName(expected.kind);$('actionType').className='actiontype '+expected.kind;$('actionNote').textContent=expected.label;$('actionDetail').textContent=expected.notes;const activeNotes=expected.midi||[];document.querySelectorAll('.key').forEach(key=>key.classList.toggle('expect',activeNotes.includes(Number(key.dataset.note))));}
function lessonsForGroup(groupId=state.levelGroup){const group=LESSON_GROUPS.find(g=>g.id===groupId)||LESSON_GROUPS[0],list=group.levels?LESSONS.filter(l=>group.levels.includes(l.level)):[...LESSONS];if(!group.levels&&state.importedLesson)list.push(state.importedLesson);return list;}
function updateLevelTag(){const group=LESSON_GROUPS.find(g=>g.id===state.levelGroup)||LESSON_GROUPS[0],list=lessonsForGroup(),index=list.findIndex(l=>l.id===state.lesson.id);$('levelTag').textContent=`${group.label} · ${Math.max(1,index+1)}/${list.length} kalıp`;}
function patternName(lesson){const names={'em-44':'4/4 · Temel bas–akor'};return names[lesson.id]||lesson.title;}
function fillLessonOptions(preferredId=state.lesson.id){const list=lessonsForGroup(),select=$('lesson');select.replaceChildren();for(const l of list){const opt=document.createElement('option');opt.value=l.id;opt.textContent=patternName(l);select.appendChild(opt);}const selected=list.some(l=>l.id===preferredId)?preferredId:list[0].id;select.value=selected;return selected;}
function lessonMarkup(){const l=state.lesson;$('meterTag').textContent=`${l.meter}${l.groupingText?` · ${l.groupingText}`:` · ${l.grouping.join('+')}`}`;updateLevelTag();$('lessonDescription').textContent=l.description;$('grouping').textContent=l.groupingText||l.grouping.join(' + ');
  const hints=l.steps.map((s,i)=>`<li><span class="highlight">${i+1}. adım:</span> ${s.kind==='rest'?'Es (çalma)':s.kind==='bass'?`Sol el bas ${s.label} · ${s.notes}`:s.kind==='combo'?`Sol el bas + sağ el akor ${s.label} · ${s.notes}`:`Sağ el akor ${s.label} · ${s.notes}`}</li>`);
  $('instructions').innerHTML=hints.join('');
  drawBeats(0);renderPads();showMeasure(0);describeExpected(l.steps[0]);updateScore();
}
function drawBeats(measure){const l=state.lesson,steps=getSteps(l,measure);const beatArea=$('beats');beatArea.style.setProperty('--cols',steps.length);beatArea.className='beatgrid'+(steps.length>4?' long':'')+(steps.length>9?' extra-long':'')+(l.gridStepTicks?' song-grid':'');let groupStart=0;const starts=new Set(l.grouping.map(group=>{const i=groupStart;groupStart+=group;return i;}));
  beatArea.innerHTML=steps.map((s,i)=>`<div class="beat ${s.kind} ${starts.has(i)?'group-start':''}" id="beat-${i}" data-step="${i}"><div class="ord">${i+1}</div><div class="type">${s.kind==='bass'?'SOL BAS':s.kind==='chord'?'SAĞ AKOR':s.kind==='combo'?'BAS + AKOR':'ES'}</div><div class="note">${s.label}</div></div>`).join('');
}
function relevantPads(){const actions=new Map(),events=state.lesson.performanceEvents|| (state.lesson.songCycle?state.lesson.songCycle.flat():[...state.lesson.steps,...(state.lesson.alternate||[])]);for(const e of events)if(e.kind!=='rest')actions.set(e.kind+':'+e.midi.join(','),e);return [...actions.values()];}
function playExpected(event,at){const c=audio(),t=at??c.currentTime+.002;if(event.kind==='bass')playBass(event.bassMidi?.[0]??event.midi[0],t);else if(event.kind==='combo'){for(const n of event.bassMidi||[])playBass(n,t);for(const [i,n] of (event.chordMidi||[]).entries())playEPiano(n,t+i*.004);}else if(event.kind==='chord')for(const [i,n] of event.midi.entries())playEPiano(n,t+i*.004);}
function renderPads(){const items=relevantPads();$('pads').innerHTML=items.map((s,i)=>`<button class="pad ${s.kind}" data-index="${i}" aria-label="${s.kind==='bass'?'Sol el bas':s.kind==='combo'?'Bas ve akor':'Sağ el akor'} ${s.label}">${s.label}<small>${s.kind==='bass'?'SOL EL · BAS':s.kind==='combo'?'SOL EL + SAĞ EL':'SAĞ EL · AKOR'} · ${s.notes}</small></button>`).join('');
  $('pads').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{const e=items[Number(b.dataset.index)];playExpected(e);evaluate(e.midi,performance.now(),'ekran');flashKeys(e.midi)}));
}
function drawKeyboard(){const board=$('keyboard');const low=33,high=83;const whites=[];for(let n=low;n<=high;n++)if(![1,3,6,8,10].includes(n%12))whites.push(n);
  board.innerHTML=whites.map(n=>`<div class="key white" id="key-${n}" data-note="${n}"><span class="key-id">${n}</span><span class="key-label">${n%12===0?'Do':n%12===4?'Mi':n%12===9?'La':n%12===11?'Si':''}</span></div>`).join('');
  for(let n=low;n<=high;n++){if([1,3,6,8,10].includes(n%12)){const prev=whites.filter(x=>x<n).length;const left=(prev-0.3)/whites.length*100;const key=document.createElement('div');key.className='key black';key.dataset.note=n;key.id='key-'+n;key.style.left=left+'%';board.appendChild(key);}}
}
function flashKeys(notes){for(const n of notes){const el=$('key-'+n);if(el){el.classList.add('on');setTimeout(()=>el.classList.remove('on'),180)}}}
function updateScore(){const total=runLength*state.lesson.steps.length;
  $('success').textContent=state.hits;$('mistakes').textContent=state.misses;$('accuracy').textContent=state.judged?`${Math.round(state.hits/state.judged*100)}%`:'–';
  if(state.lesson.performanceEvents){$('progressFill').style.width='0%';$('completedMessage').textContent='Bölüm durdurana kadar tekrar eder.';return;}
  const done=state.playing?Math.min(state.nextMiss,total):0;
  $('progressFill').style.width=(100*done/total)+'%';
  const rec=state.records[state.lesson.id];$('completedMessage').textContent=rec?`Kişisel rekor: %${rec.bestPercent} · ${rec.completed} tamamlanan çalışma`:'Sekiz ölçü çalışıp sonucunu gör.';
}
function getBpm(){return Number($('bpm').value)}
function setBpm(value){state.bpm=Math.round(Math.max(45,Math.min(160,value)));$('bpm').value=String(state.bpm);$('tempoValue').textContent=state.bpm+' BPM'}
function resetSession(){state.sessionId++;for(const cluster of state.practiceClusters.values())clearTimeout(cluster.timer);state.practiceClusters.clear();state.evaluated.clear();state.nextMiss=0;state.hits=0;state.misses=0;state.judged=0;state.visualBeat=-1;showMeasure(0);drawBeats(0);describeExpected(state.lesson.performanceEvents?.[0]||state.lesson.steps[0]);updateScore()}
function queuedAudio(){if(!state.playing || state.mode!=='app'||!state.ctx)return;const c=state.ctx,len=state.lesson.steps.length,unit=msPerStep(state.bpm,state.lesson.denominator)/1000;
  while(state.nextScheduled<runLength*len && state.audioStart+state.nextScheduled*unit<c.currentTime+.18){const absolute=state.nextScheduled,step=absolute%len,measure=Math.floor(absolute/len),at=state.audioStart+absolute*unit,event=getSteps(state.lesson,measure)[step];drums(at,step);if(state.demo&&event.midi?.length)playExpected(event,at);state.nextScheduled++;}
}
function clockPosition(now=performance.now()) {const c=state.clock;if(!c.running||!c.lastTickMs)return null;const pulsesPerStep=96/state.lesson.denominator;const tickMs=c.avgTickMs||60000/state.bpm/24;
  const fractional=(c.ticks+Math.max(0,Math.min(now-c.lastTickMs,tickMs*1.4))/tickMs)/pulsesPerStep;
  return {fractional,stepMs:tickMs*pulsesPerStep};
}
function beatPosition(now=performance.now()) {
  if(state.mode==='clock'){const pos=clockPosition(now);if(!pos)return null;const absolute=Math.round(pos.fractional);return {absolute,measure:Math.floor(absolute/state.lesson.steps.length),step:absolute%state.lesson.steps.length,deviationMs:(pos.fractional-absolute)*pos.stepMs,stepMs:pos.stepMs,continuous:pos.fractional};}
  const unit=msPerStep(state.bpm,state.lesson.denominator),hit=nearestStep({eventMs:now,originMs:state.originMs,stepMs:unit,stepsPerMeasure:state.lesson.steps.length});if(!hit)return null;return {...hit,stepMs:unit,continuous:(now-state.originMs)/unit};
}
function markMissed(upto){const max=runLength*state.lesson.steps.length;while(state.nextMiss<Math.min(max,upto)){const n=state.nextMiss++;const ev=currentEvent(state.lesson,n);if(ev.kind==='rest'||state.evaluated.has(n))continue;state.evaluated.set(n,'miss');state.misses++;state.judged++;if(n===state.visualBeat)paintStep(n,'miss');}updateScore();}
function paintStep(absolute,type){const index=absolute%state.lesson.steps.length;const el=$('beat-'+index);if(el)el.classList.add(type)}
function practiceTicks(time){return (time-state.originMs)*state.bpm*state.lesson.ppq/60000;}
function practiceCandidate(notes,time){
  const lesson=state.lesson,events=lesson.performanceEvents,count=events.length,tick=practiceTicks(time),loop=Math.floor(tick/lesson.sectionTicks),limit=state.bpm*lesson.ppq*.15/60,candidates=[];
  for(let cycle=Math.max(0,loop-1);cycle<=loop+1;cycle++)for(let i=0;i<count;i++){
    const key=cycle*count+i,event=events[i],delta=tick-(cycle*lesson.sectionTicks+event.tick);if(Math.abs(delta)>limit||state.evaluated.has(key))continue;
    const matches=notes.some(n=>event.midi.some(expected=>n%12===expected%12));
    candidates.push({key,event,delta,matches});
  }
  candidates.sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta)||(Number(b.matches)-Number(a.matches)));
  if(candidates.length>1&&Math.abs(Math.abs(candidates[0].delta)-Math.abs(candidates[1].delta))<state.bpm*lesson.ppq*.02/60)candidates.sort((a,b)=>Number(b.matches)-Number(a.matches)||Math.abs(a.delta)-Math.abs(b.delta));
  return candidates[0]||null;
}
function judgePractice(candidate,notes,source){
  if(!state.playing||state.evaluated.has(candidate.key))return;
  const check=matchEvent(candidate.event,notes,{strictBassOctave:state.strict});state.evaluated.set(candidate.key,check.ok?'hit':'miss');state.judged++;
  if(check.ok){state.hits++;setFeedback(`✓ Doğru: ${candidate.event.label} · ${source}`,'good');}else{state.misses++;setFeedback(`✕ Beklenen: ${candidate.event.label} (${candidate.event.notes})`,'bad');}
  const step=Math.floor(candidate.event.tick/state.lesson.gridStepTicks)%state.lesson.steps.length;paintStep(step,check.ok?'hit':'miss');updateScore();
}
function markPracticeMissed(time){
  const lesson=state.lesson,events=lesson.performanceEvents,count=events.length,tick=practiceTicks(time),limit=state.bpm*lesson.ppq*.15/60;
  while(true){const key=state.nextMiss,cycle=Math.floor(key/count),event=events[key%count];if(cycle*lesson.sectionTicks+event.tick+limit>=tick||state.practiceClusters.has(key))break;
    state.nextMiss++;if(!state.evaluated.has(key)){state.evaluated.set(key,'miss');state.misses++;state.judged++;}if(key>count*2)state.evaluated.delete(key-count*2);
  }
  updateScore();
}
function evaluatePractice(notes,time,source){
  const candidate=practiceCandidate(notes,time);if(!candidate){setFeedback('Bu anda beklenen nota yok veya zamanlama kaçtı.','bad');return;}
  judgePractice(candidate,notes,source);
}
function evaluate(notes,time,source){if(!state.playing || state.waitingClock){setFeedback(state.waitingClock?'Pa4X’te Style START tuşuna bas. MIDI Clock sinyali bekleniyor.':'Önce Başlat tuşuna bas.');return;}
  if(state.lesson.performanceEvents){evaluatePractice(notes,time,source);return;}
  const pos=beatPosition(time);if(!pos || pos.absolute>=runLength*state.lesson.steps.length)return;
  const grade=timingGrade(pos.deviationMs,pos.stepMs);
  if(grade==='off'){setFeedback('Zamanlama kaçtı. Vuruşların başlangıcında basmayı dene.','bad');return;}
  if(state.evaluated.has(pos.absolute)){setFeedback('Bu vuruş zaten değerlendirildi; sonraki vuruşu bekle.');return;}
  // Yakın vuruşa gelindiğinde, çoktan kapanmış önceki vuruşlar kaçırılmış olarak işaretlenir.
  markMissed(pos.absolute);
  const exp=currentEvent(state.lesson,pos.absolute),check=matchEvent(exp,notes,{strictBassOctave:state.strict});
  state.evaluated.set(pos.absolute,check.ok?'hit':'miss');state.judged++;
  if(check.ok){state.hits++;const qualifier=grade==='perfect'?'Tam zamanında':'Çok yakın';setFeedback(`✓ ${qualifier}! ${exp.label} · ${source} · ${pos.deviationMs<0?'erken':'geç'} ${Math.abs(Math.round(pos.deviationMs))} ms`,'good');paintStep(pos.absolute,'hit');}
  else{state.misses++;setFeedback(`✕ ${exp.kind==='rest'?'Bu vuruş es. Çalma!':`Bu vuruşta ${exp.label} (${exp.notes}) bekleniyor.`}`,'bad');paintStep(pos.absolute,'miss');}
  updateScore();
}
function animate(){if(!state.playing)return;const pos=beatPosition(),l=state.lesson,len=l.steps.length,total=runLength*len;
  if(l.performanceEvents){
    const now=performance.now(),tick=practiceTicks(now);if(tick>=0){markPracticeMissed(now);const absolute=Math.floor(tick/l.gridStepTicks),measure=Math.floor(absolute/len),step=absolute%len;
      if(state.visualBeat!==absolute){if(state.visualBeat<0||Math.floor(state.visualBeat/len)!==measure)drawBeats(measure);state.visualBeat=absolute;document.querySelectorAll('.beat').forEach(el=>el.classList.toggle('active',Number(el.dataset.step)===step));showMeasure(measure);}
      const offset=tick%l.sectionTicks,cycle=Math.floor(tick/l.sectionTicks),limit=state.bpm*l.ppq*.15/60;
      const index=l.performanceEvents.findIndex((event,i)=>event.tick+limit>=offset&&!state.evaluated.has(cycle*l.performanceEvents.length+i));
      describeExpected(index<0?l.performanceEvents[0]:l.performanceEvents[index]);
    }state.raf=requestAnimationFrame(animate);return;
  }
  if(pos){const absolute=Math.floor(pos.continuous);if(absolute>=0){
      markMissed(absolute);if(absolute>=total){complete();return;}
      const measure=Math.floor(absolute/len),step=absolute%len;
      if(state.visualBeat!==absolute){const prevMeasure=state.visualBeat<0?-1:Math.floor(state.visualBeat/len);if(prevMeasure!==measure){drawBeats(measure);}state.visualBeat=absolute;document.querySelectorAll('.beat').forEach(el=>el.classList.toggle('active',Number(el.dataset.step)===step));
        for(let i=0;i<=step;i++){const result=state.evaluated.get(measure*len+i);if(result)paintStep(measure*len+i,result==='hit'?'hit':'miss');}
        showMeasure(measure);describeExpected(getSteps(l,measure)[step]);}
    }}state.raf=requestAnimationFrame(animate);
}
async function start(){if(state.playing)return;if(state.midiPlayer?.playing)state.midiPlayer.pause();try{await audio().resume();}catch(e){setFeedback('Ses açılamadı: '+e.message,'bad');return;}await loadBassSamples();
  state.mode=$('sync').value;state.demo=$('demo').checked;state.strict=$('strict').checked;resetSession();state.playing=true;
  $('play').disabled=true;$('stop').disabled=false;$('lesson').disabled=true;$('sync').disabled=true;$('bpm').disabled=true;$('tap').disabled=true;
  if(state.mode==='app'){
    state.waitingClock=false;state.originMs=performance.now()+320;state.audioStart=state.ctx.currentTime+.320;state.nextScheduled=0;
    if(state.lesson.performanceEvents){
      try{state.sectionPlayer=new MidiSectionPlayer(state.importedMidi,state.lesson,{context:state.ctx,output:state.midiPlayer?.output||null,channels:state.midiPlayer?.enabledChannels||[],volumes:state.channelVolumes,bpm:state.bpm,onError:error=>{stop();setFeedback(`MIDI eşlik hatası: ${error.message||error}`,'bad');}});state.sectionPlayer.start(.32);}
      catch(error){stop();setFeedback(`MIDI eşlik başlatılamadı: ${error.message||error}`,'bad');return;}
      $('midiOutput').disabled=true;$('midiPlayerPlay').disabled=true;$('midiPlayerPause').disabled=true;$('midiPlayerStop').disabled=true;
      setStatus('● Bölüm tekrarlanıyor',true);setFeedback('Eşliği dinle; bas ve sağ el notalarını çal. Kanalları oynatıcıdan açıp kapatabilirsin.');
    }else{state.timer=setInterval(queuedAudio,25);queuedAudio();setStatus('● Alıştırma çalıyor',true);setFeedback('Hazır! Davulu dinle; bası sol elinle, akoru sağ elinle çal.');}
  }else{
    state.waitingClock=true;state.clock={armed:true,running:false,ticks:0,lastTickMs:0,avgTickMs:0,pulseTimes:[],sourceId:null};setStatus('◌ Pa4X bekleniyor');setFeedback('Pa4X’te MIDI Clock Send aç ve Style START tuşuna bas. Uygulama kendi davulunu çalmayacak.');
  }
  state.raf=requestAnimationFrame(animate);
}
function stop(completed=false){if(!state.playing)return;const completeRun=completed;state.playing=false;state.waitingClock=false;state.clock.armed=false;clearInterval(state.timer);cancelAnimationFrame(state.raf);state.timer=null;state.raf=null;
  if(state.sectionPlayer){const player=state.sectionPlayer;state.sectionPlayer=null;try{player.stop();}catch(error){$('midiOutputStatus').textContent=`MIDI eşliği durdurulamadı: ${error.message||error}`;}}
  for(const cluster of state.practiceClusters.values())clearTimeout(cluster.timer);state.practiceClusters.clear();
  $('midiOutput').disabled=false;if(state.midiPlayer)updateMidiPlayerUI(state.midiPlayer.snapshot());
  $('play').disabled=false;$('stop').disabled=true;$('lesson').disabled=false;$('sync').disabled=!!state.lesson.performanceEvents;$('bpm').disabled=false;$('tap').disabled=false;setStatus('● Hazır');
  document.querySelectorAll('.beat').forEach(el=>el.classList.remove('active'));
  if(!completeRun){setFeedback('Çalışma durduruldu. Başlat ile yeniden dene.');$('progressFill').style.width='0%';}
}
function complete(){const total=runLength*state.lesson.steps.length;markMissed(total);const percent=state.judged?Math.round(state.hits/state.judged*100):0;
  const prev=state.records[state.lesson.id]||{bestPercent:0,completed:0};state.records[state.lesson.id]={bestPercent:Math.max(prev.bestPercent,percent),completed:prev.completed+1,lastPercent:percent};save();
  stop(true);$('progressFill').style.width='100%';updateScore();setFeedback(`🏁 8 ölçü tamamlandı! Başarı: %${percent} (${state.hits} doğru / ${state.misses} hata veya kaçan). ${percent>=80?'Yeni derse geçmeye hazırsın!':'Bir tur daha dene; hızını yavaşlatabilirsin.'}`,percent>=80?'good':'');
}
function changeLesson(id){if(state.playing)return;state.lesson=state.importedLesson?.id===id?state.importedLesson:getLesson(id);const isMidi=!!state.lesson.performanceEvents;$('sync').disabled=isMidi;$('lessonFields').toggleAttribute('data-midi',isMidi);$('goal').textContent=isMidi?'Sürekli döngü':'Hedef: 8 ölçü';if(isMidi)$('sync').value='app';selectSync();setBpm(state.lesson.defaultBpm);resetSession();lessonMarkup();}
function changeLevelGroup(id){if(state.playing)return;state.levelGroup=id;const selected=fillLessonOptions(state.lesson.id);if(selected!==state.lesson.id)changeLesson(selected);else updateLevelTag();}
function handleClock(data,time,portId=null){const c=state.clock;if(!state.playing||state.mode!=='clock'||!c.armed)return;
  if(c.sourceId && portId && c.sourceId!==portId)return;
  if(data===0xfa){if(!c.sourceId)c.sourceId=portId;c.running=true;c.ticks=0;c.lastTickMs=0;c.avgTickMs=0;c.pulseTimes=[];state.waitingClock=true;resetSession();setStatus('● Pa4X START alındı',true);setFeedback('Pa4X START algılandı. MIDI Clock darbeleri bekleniyor.');return;}
  if(data===0xfb){c.running=true;state.waitingClock=false;setStatus('● Pa4X çalıyor',true);return;}
  if(data===0xfc){if(c.running){markMissed(Math.max(0,Math.floor((clockPosition(time)?.fractional||0))));c.running=false;state.waitingClock=true;setStatus('◌ Pa4X durdu');setFeedback('Pa4X Style durduruldu. Yeniden START ile başlayabilirsin.');}return;}
  if(data!==0xf8||!c.running)return;
  if(c.lastTickMs){const delta=time-c.lastTickMs;if(delta>3&&delta<130){c.pulseTimes.push(delta);if(c.pulseTimes.length>36)c.pulseTimes.shift();const sorted=[...c.pulseTimes].sort((a,b)=>a-b);const median=sorted[Math.floor(sorted.length/2)];c.avgTickMs=median;}}
  c.lastTickMs=time;if(c.ticks!==0)c.ticks++;else if(c.pulseTimes.length)c.ticks++; // İlk clock darbesi 0 sayılır
  state.waitingClock=false;
  const bpm=c.avgTickMs?Math.round(60000/(c.avgTickMs*24)):state.bpm;$('clockStatus').textContent=`Pa4X Clock: ${bpm} BPM · ${c.ticks} darbe`;setStatus('● Pa4X ile senkron',true);
}
function midiInputChanged(){for(const p of state.midi?.inputs.values()||[])p.onmidimessage=null;state.midiCluster=null;clearTimeout(state.midiClusterTimer);state.midiNotes.clear();const id=$('device').value;state.midiInput=state.midi?.inputs.get(id)||null;
  // Pa4X farklı USB portlarında KEYBOARD notaları ve SOUND/Clock mesajları yayınlayabilir.
  // Clock bütün portlardan dinlenir; notalar yalnızca seçili giriş portundan alınır.
  for(const p of state.midi?.inputs.values()||[])p.onmidimessage=ev=>{const status=ev.data?.[0];if(status>=0xf8)handleClock(status,performance.now(),p.id);else if(p.id===state.midiInput?.id)handleMidi(ev);};
  $('midiStatus').textContent=state.midiInput?`Nota girişi: ${state.midiInput.name||'MIDI cihazı'}. Clock mesajları tüm giriş portlarında izlenir.`:'MIDI izni verildi; aktif nota girişi seçilmedi.';
}
function refreshMidiOutputs(){
  const select=$('midiOutput'),current=select.value,ports=[...(state.midi?.outputs?.values()||[])].filter(port=>port.state!=='disconnected');
  addSelectOptions(select,[{value:'',label:'Tarayıcı sesi'},...ports.map(port=>({value:port.id,label:port.name||'MIDI çıkışı'}))],current);
  if(current&&!ports.some(port=>port.id===current)){
    if(state.sectionPlayer){stop();setFeedback('MIDI çıkışı bağlantısı kesildi; çalışma durduruldu.','bad');}
    if(state.midiPlayer){try{state.midiPlayer.stop();}catch(error){console.error('MIDI çıkışı durdurulamadı:',error);}state.midiPlayer.output=null;state.midiPlayer.outputUsed=false;}
    select.value='';updateOutputControls();
    $('midiOutputStatus').textContent='MIDI çıkışı bağlantısı kesildi; çalma durduruldu. Yeniden bağlanıp çıkışı seç.';
  }else if(!current)$('midiOutputStatus').textContent=ports.length?'Pa4X sesleri için bir MIDI çıkış portu seç.':'MIDI çıkışı bulunamadı; bağlantıyı açıp cihazı kontrol et.';
}
function midiOutputChanged(){
  const id=$('midiOutput').value,previous=state.midiPlayer?.output?.id||'',output=id?state.midi?.outputs?.get(id):null;
  if(id&&(!output||output.state==='disconnected')){$('midiOutputStatus').textContent='Seçilen MIDI çıkışı kullanılamıyor.';return;}
  try{state.midiPlayer?.setOutput(output||null);$('midiOutputStatus').textContent=output?`${output.name||'MIDI çıkışı'} seçildi. Ses Pa4X üzerinden çalınır.`:'Tarayıcı sesi seçildi.';updateOutputControls();}
  catch(error){$('midiOutput').value=previous;updateOutputControls();$('midiOutputStatus').textContent=`MIDI çıkışı değiştirilemedi: ${error.message||error}`;}
}
function updateOutputControls(){const external=!!$('midiOutput').value;$('midiPlayerChannels').querySelectorAll('[data-player-program]').forEach(select=>{select.disabled=external;});}
function midiPlayerAction(action){try{action();if(state.sectionPlayer&&state.midiPlayer)state.sectionPlayer.setChannels(state.midiPlayer.enabledChannels);}catch(error){if(state.sectionPlayer){stop();$('midiOutputStatus').textContent=`MIDI eşlik hatası: ${error.message||error}`;}else if(state.midiPlayer)state.midiPlayer.fail(error);else $('midiOutputStatus').textContent=`MIDI oynatma hatası: ${error.message||error}`;}}
function refreshMidi(){if(!state.midi)return;const input=$('device'),ports=[...state.midi.inputs.values()],current=input.value;input.innerHTML=ports.length?ports.map(p=>{const opt=document.createElement('option');opt.value=p.id;opt.textContent=p.name||'MIDI cihazı';return opt.outerHTML;}).join(''):'<option value="">Giriş bulunamadı</option>';input.disabled=ports.length===0;
  if(ports.length){const preferred=ports.find(p=>/pa4x.*keyboard|keyboard.*pa4x/i.test(p.name||''))||ports.find(p=>/pa4x/i.test(p.name||''))||ports[0];input.value=ports.some(p=>p.id===current)?current:preferred.id;}
  midiInputChanged();refreshMidiOutputs();
}
async function connect(){if(!navigator.requestMIDIAccess){$('midiStatus').textContent='Web MIDI desteklenmiyor. Windows Chrome veya Edge ile HTTPS / localhost kullan.';return;}
  try{state.midi=await navigator.requestMIDIAccess({sysex:false});refreshMidi();state.midi.onstatechange=refreshMidi;$('connect').textContent='✓ MIDI girişlerini yenile';}catch(e){$('midiStatus').textContent='MIDI bağlantı hatası: '+(e.message||String(e));}
}
function handleMidi(ev){const d=ev.data,now=performance.now();if(!d||!d.length)return;const status=d[0];if(status>=0xf8){handleClock(status,now);return;}
  if((status&0xf0)!==0x90&&(status&0xf0)!==0x80)return;
  const channel=(status&0x0f)+1,requested=$('channel').value;if(requested!=='all'&&Number(requested)!==channel)return;
  const note=d[1],velocity=d[2]||0;if(note>Number($('maxnote').value))return;
  if((status&0xf0)===0x80||velocity===0){state.midiNotes.delete(note);return;}
  state.midiNotes.set(note,now);$('midiLast').textContent=`${noteName(note)} · ${note} · Kanal ${channel}`;flashKeys([note]);
  if(state.playing&&state.lesson.performanceEvents){
    const candidate=practiceCandidate([note],now);if(!candidate){setFeedback('Bu anda beklenen nota yok veya zamanlama kaçtı.','bad');return;}
    if(candidate.event.kind==='bass'){judgePractice(candidate,[note],'Pa4X MIDI');return;}
    let cluster=state.practiceClusters.get(candidate.key);
    if(!cluster){cluster={notes:[],candidate,timer:null};state.practiceClusters.set(candidate.key,cluster);}
    if(!cluster.notes.includes(note))cluster.notes.push(note);clearTimeout(cluster.timer);
    const flush=()=>{state.practiceClusters.delete(candidate.key);judgePractice(candidate,cluster.notes,'Pa4X MIDI');};
    if(matchEvent(candidate.event,cluster.notes,{strictBassOctave:state.strict}).ok)flush();else cluster.timer=setTimeout(flush,65);
    return;
  }
  // Aynı anda basılan 3/4 notayı tek akor kabul et. İlk notanın zaman damgasını koru.
  if(!state.midiCluster)state.midiCluster={notes:[],firstMs:now};
  if(!state.midiCluster.notes.includes(note))state.midiCluster.notes.push(note);
  clearTimeout(state.midiClusterTimer);const clusterId=state.sessionId;
  const flush=()=>{if(clusterId!==state.sessionId)return;const cluster=state.midiCluster;state.midiCluster=null;if(cluster?.notes?.length)evaluate(cluster.notes,cluster.firstMs,'Pa4X MIDI');};
  const elapsed=now-state.midiCluster.firstMs;
  state.midiClusterTimer=setTimeout(flush,Math.max(10,Math.min(110,190-elapsed)));
}
function selectSync(){state.mode=$('sync').value;const clock=state.mode==='clock';$('sourceHint').textContent=state.lesson.performanceEvents?'Seçilen MIDI bölümü tekrar eder; çıkış ve kanal sesleri MIDI oynatıcıdan seçilir.':clock?'Pa4X’in kendi davulu çalar. Clock Send ve MIDI bağlantısı gerekir; cihazda test edilmelidir.':'Uygulamanın davulu çalar. Pa4X bağlantısı olmasa da çalışır.';$('clockStatus').textContent=clock?'Pa4X START/Clock bekleniyor':'MIDI Clock beklenmiyor';}
function tapTempo(){const now=performance.now();state.tapTimes=state.tapTimes.filter(t=>now-t<3500);state.tapTimes.push(now);if(state.tapTimes.length>=3){const intervals=state.tapTimes.slice(1).map((t,i)=>t-state.tapTimes[i]);const average=intervals.reduce((a,b)=>a+b,0)/intervals.length;setBpm(60000/average);setFeedback(`Tempo: ${state.bpm} BPM. Üç veya daha fazla kez düzenli dokun.`);}else setFeedback('Dört eşit aralıklı vuruşla temponu belirle.');}
const notePitch=n=>`${MIDI_NOTE_NAMES[n%12]}${Math.floor(n/12)-1}`;
function addSelectOptions(select,items,selected){select.replaceChildren();for(const item of items){const option=document.createElement('option');option.value=String(item.value);option.textContent=item.label;select.appendChild(option);}if(selected!==undefined&&items.some(item=>String(item.value)===String(selected)))select.value=String(selected);}
function appendGeneralMidiOptions(select){const divider=document.createElement('option');divider.value='gm-bank-heading';divider.disabled=true;divider.textContent='— General MIDI · 128 ses —';select.appendChild(divider);GM_INSTRUMENTS.forEach((name,program)=>{const option=document.createElement('option');option.value=`gm:${program}`;option.textContent=`GM ${String(program+1).padStart(3,'0')} · ${name}`;select.appendChild(option);});}
function updateMidiMappingHint(){if(!state.importedMidi)return;const from=Number($('midiSourceKey').value),to=Number($('midiTargetKey').value);let semitones=(to-from+12)%12;if(semitones>6)semitones-=12;const sign=semitones>0?'+':'';const confidence=state.importedKey?.confidence<.2?' · Tahmin güveni düşük; kaynak kararı kontrol et.':'';const move=`Kaynak ton tahmini: ${state.importedKey?.name||'belirsiz'}${confidence} · Transpozisyon: ${sign}${semitones} yarım ses · Davul kanalı değişmeden kalır.`;$('midiMappingHint').textContent=state.importedPianoWarning?`${state.importedPianoWarning} ${move}`:move;$('prepareMidiLesson').textContent=`${MIDI_NOTE_NAMES[to]} karar çalışmasını hazırla`;$('midiTransposeLabel').textContent=`Şarkıyı ${MIDI_NOTE_NAMES[to]} kararına ${sign}${semitones} yarım ses transpoze dinle`;midiPlayerAction(()=>state.midiPlayer?.setTransposeSemitones(semitones));}
function channelLabel(ch){return `Kanal ${ch.channel} · ${ch.instrument} · ${ch.noteCount} nota`}
function renderMidiChannels(){const list=$('midiChannelSummary');list.replaceChildren();for(const ch of state.importedMidi.channels.filter(c=>c.noteCount)){const row=document.createElement('div');row.className='channel-row';row.textContent=`${channelLabel(ch)} · ${notePitch(ch.minNote)}–${notePitch(ch.maxNote)}`;list.appendChild(row);}}
function playerTime(seconds){const total=Math.max(0,Math.floor(seconds||0));return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;}
function updateMidiPlayerUI(snapshot){
  const seek=$('midiSeek');seek.max='1000';seek.value=String(snapshot.duration?Math.round(snapshot.position/snapshot.duration*1000):0);seek.disabled=!snapshot.duration;
  $('midiTime').textContent=`${playerTime(snapshot.position)} / ${playerTime(snapshot.duration)}`;
  $('midiPlayerPlay').disabled=snapshot.playing||!!state.sectionPlayer;$('midiPlayerPause').disabled=!snapshot.playing||!!state.sectionPlayer;
  $('midiPlayerStop').disabled=!!state.sectionPlayer||(!snapshot.playing&&snapshot.position<.001);$('midiPlayerRate').value=String(snapshot.rate);
  $('midiTransposePlayback').checked=snapshot.transposeEnabled;
  $('midiPlayerChannelCount').textContent=`${snapshot.enabledChannels.size}/${snapshot.channels.length} kanal açık`;
  $('midiPlayerChannels').querySelectorAll('[data-player-channel]').forEach(input=>{input.checked=snapshot.enabledChannels.has(Number(input.dataset.playerChannel));});
  $('midiPlayerChannels').querySelectorAll('[data-player-program]').forEach(select=>{const channel=Number(select.dataset.playerProgram);select.value=snapshot.programOverrides.has(channel)?String(snapshot.programOverrides.get(channel)):'';});
}
function setupMidiPlayer(file,suggestions){
  state.midiPlayer?.dispose();state.channelVolumes.clear();state.midiPracticeChannels=[suggestions.bass,suggestions.chord].filter(Boolean);
  const player=new MidiFilePlayer(file,{contextProvider:audio,onUpdate:updateMidiPlayerUI,onError:error=>{$('midiOutputStatus').textContent=`MIDI oynatma hatası: ${error.message||error}`;}});state.midiPlayer=player;
  const outputId=$('midiOutput').value;if(outputId){const output=state.midi?.outputs?.get(outputId);if(output&&output.state!=='disconnected')player.setOutput(output);else{$('midiOutput').value='';$('midiOutputStatus').textContent='MIDI çıkışı bulunamadı; yeniden seç.';}}
  const list=$('midiPlayerChannels');list.replaceChildren();
  for(const channel of player.channels){
    const row=document.createElement('div');row.className='midi-player-channel';
    const label=document.createElement('label');label.className='midi-player-channel-label';
    const input=document.createElement('input');input.type='checkbox';input.checked=true;input.dataset.playerChannel=String(channel.channel);input.setAttribute('aria-label',`Kanal ${channel.channel} ${channel.instrument}`);
    input.addEventListener('change',()=>midiPlayerAction(()=>player.setChannelEnabled(channel.channel,input.checked)));
    const name=document.createElement('span');name.textContent=`Kanal ${channel.channel} · ${channel.instrument}`;label.append(input,name);
    const instrument=document.createElement('select');instrument.className='midi-player-instrument';instrument.dataset.playerProgram=String(channel.channel);instrument.setAttribute('aria-label',`Kanal ${channel.channel} enstrümanı`);
    const sourceOption=document.createElement('option');sourceOption.value='';sourceOption.textContent='MIDI kaynağı';instrument.appendChild(sourceOption);
    GM_INSTRUMENTS.forEach((title,program)=>{const option=document.createElement('option');option.value=String(program);option.textContent=title;instrument.appendChild(option);});
    instrument.addEventListener('change',()=>player.setChannelProgram(channel.channel,instrument.value));
    const solo=document.createElement('button');solo.type='button';solo.className='midi-solo';solo.textContent='Solo';solo.setAttribute('aria-label',`Yalnızca kanal ${channel.channel} çalsın`);solo.addEventListener('click',()=>midiPlayerAction(()=>player.soloChannel(channel.channel)));
    const volumeLabel=document.createElement('label');volumeLabel.className='midi-channel-volume';volumeLabel.textContent='Ders sesi ';
    const volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='100';volume.value='100';volume.setAttribute('aria-label',`Kanal ${channel.channel} ders sesi`);
    const value=document.createElement('output');value.textContent='100%';
    volume.addEventListener('input',()=>{const level=Number(volume.value);state.channelVolumes.set(channel.channel,level);value.textContent=`${level}%`;midiPlayerAction(()=>state.sectionPlayer?.setVolume(channel.channel,level));});
    volumeLabel.append(volume,value);row.append(label,instrument,solo,volumeLabel);list.appendChild(row);
  }
  $('midiPlayer').hidden=false;updateMidiPlayerUI(player.snapshot());updateOutputControls();
}
function loadMidiAnalysis(file,uploadedName){
  if(state.lesson.id==='midi-import'){state.importedLesson=null;state.levelGroup='all';$('levelGroup').value='all';fillLessonOptions(LESSONS[0].id);changeLesson(LESSONS[0].id);}state.importedMidi=file;file.uploadedName=uploadedName;
  const suggestions=suggestedChannels(file);if(!suggestions.bass)throw new Error('Dosyada nota içeren bir bas kanalı bulunamadı.');
  const analysisChannels=[suggestions.bass,suggestions.chord].filter(Boolean);state.importedKey=detectKey(file,analysisChannels);
  const active=file.channels.filter(c=>c.noteCount),bars=Math.min(500,Math.floor(file.endTick/measureTicks(file.ppq,meterAt(file,0)))),variableMeter=new Set(file.meterMap.map(m=>`${m.numerator}/${m.denominator}`)).size>1;
  const firstBass=active.find(c=>c.channel===suggestions.bass)?.notes.reduce((min,n)=>Math.min(min,n.tick),Infinity)??0;
  const firstBassBar=Math.max(1,Math.floor(firstBass/measureTicks(file.ppq,meterAt(file,0)))+1),defaultBar=Math.min(Math.max(1,firstBassBar),Math.max(1,bars));
  addSelectOptions($('midiBassChannel'),active.map(c=>({value:c.channel,label:channelLabel(c)})),suggestions.bass);
  const chordOptions=[{value:'',label:'Yok · yalnızca bas çalış'}].concat(active.map(c=>({value:c.channel,label:channelLabel(c)})));
  addSelectOptions($('midiChordChannel'),chordOptions,suggestions.chord??'');
  const keyOptions=MIDI_NOTE_NAMES.map((name,value)=>({value,label:name}));
  addSelectOptions($('midiSourceKey'),keyOptions,state.importedKey.tonic);addSelectOptions($('midiTargetKey'),keyOptions,state.importedKey.tonic);
  addSelectOptions($('midiStartBar'),Array.from({length:Math.max(1,bars)},(_,i)=>({value:i+1,label:`Ölçü ${i+1}`})),defaultBar);
  state.midiSections=styleSections(file);
  addSelectOptions($('midiSection'),state.midiSections.length?state.midiSections.map((section,i)=>({value:i,label:section.label})):[{value:'',label:'İşaret bulunamadı · ölçü seç'}]);
  $('midiStartBarField').hidden=!!state.midiSections.length;$('midiBarCountField').hidden=!!state.midiSections.length;
  const duration=sourceDurationSeconds(file),meter=meterAt(file,0),bpm=tempoAt(file,0);
  file.title=file.title&&file.title!=='Yüklenen MIDI'?file.title:uploadedName.replace(/\.midi?$/i,'');
  const summary=document.createElement('div');summary.className='summary-card';
  const displayTitle=file.title&&file.title!=='Yüklenen MIDI'?`${uploadedName} · ${file.title}`:uploadedName;
  const metaKey=file.keyMap[0]?` · Anahtar imi ${file.keyMap[0].sf} diyez/bemol${file.keyMap[0].minor?' · minör':' · majör'}`:'';
  summary.textContent=`${displayTitle} · Type ${file.format} · ${file.trackCount} parça · ${active.length} etkin kanal · ${meter.numerator}/${meter.denominator} · ${Math.round(bpm)} BPM${file.tempoMap.length>1?' (tempo haritası var)':''} · ≈${Math.ceil(bars)} ölçü · ${Math.floor(duration/60)}:${String(Math.round(duration%60)).padStart(2,'0')}${metaKey}`;
  $('midiSummary').replaceChildren(summary);renderMidiChannels();setupMidiPlayer(file,suggestions);
  state.importedPianoWarning='Korg ses adları General MIDI adlarından farklı olabilir; bas ve sağ el kanalını kontrol et.';
  $('midiAnalysis').hidden=false;updateMidiMappingHint();$('prepareMidiLesson').disabled=false;
  $('midiImportStatus').textContent=`${uploadedName} tarayıcıda analiz edildi. ${state.midiSections.length?`${state.midiSections.length} style bölümü bulundu.`:'Style işareti bulunamadı; ölçü seçebilirsin.'}${variableMeter?' Seçilen bölümde ölçü sabit olmalı.':''}`;
  $('midiImportStatus').classList.remove('good','bad','warn');$('midiImportStatus').classList.add('good');
}
async function handleMidiFile(event){const file=event.target.files?.[0];if(!file)return;if(state.playing)stop();state.midiPlayer?.dispose();state.midiPlayer=null;if(state.lesson.id==='midi-import'){state.importedLesson=null;state.levelGroup='all';$('levelGroup').value='all';fillLessonOptions(LESSONS[0].id);changeLesson(LESSONS[0].id);}state.importedMidi=null;$('midiPlayer').hidden=true;$('midiImportStatus').classList.remove('good','bad','warn');$('midiImportStatus').textContent='MIDI dosyası analiz ediliyor…';try{const parsed=parseMidiFile(await file.arrayBuffer());loadMidiAnalysis(parsed,file.name);}catch(error){$('midiAnalysis').hidden=true;$('midiImportStatus').classList.add('bad');$('midiImportStatus').textContent=error.message||'MIDI dosyası okunamadı.';}}
function prepareMidiLesson(){if(!state.importedMidi)return;if(state.playing){setFeedback('Yeni bölüm hazırlamadan önce çalışmayı durdur.','bad');return;}try{
  const file=state.importedMidi,barTicks=measureTicks(file.ppq,meterAt(file,0)),startTick=(Number($('midiStartBar').value)-1)*barTicks;
  const section=state.midiSections.length?state.midiSections[Number($('midiSection').value)]:{label:`Ölçü ${$('midiStartBar').value}`,startTick,endTick:startTick+Number($('midiBarCount').value)*barTicks};
  if(!section||section.endTick>file.endTick+barTicks*.05)throw new Error('Seçilen bölüm MIDI dosyasının sonunu aşıyor.');
  const lesson=buildMidiSectionLesson(file,{section,bassChannel:$('midiBassChannel').value,chordChannel:$('midiChordChannel').value||null,sourceKey:$('midiSourceKey').value,targetKey:$('midiTargetKey').value});
  state.importedLesson=lesson;state.levelGroup='all';$('levelGroup').value='all';fillLessonOptions(lesson.id);changeLesson(lesson.id);$('maxnote').value='127';$('sync').value='app';selectSync();
  const drums=new Set([10,...(file.midiEvents||[]).filter(e=>e.bytes[0]>>4===11&&e.bytes[1]===0&&e.bytes[2]===120).map(e=>e.channel+1)]);
  state.midiPracticeChannels=[lesson.bassChannel,lesson.chordChannel].filter(Boolean);
  state.midiPlayer.selectChannels(state.midiPlayer.channels.filter(c=>drums.has(c.channel)||state.midiPracticeChannels.includes(c.channel)).map(c=>c.channel));
  setFeedback(`✓ ${section.label} hazır. Bas, seçilen sağ el ve davul kanalları eşlikte açık; kanalları oynatıcıdan değiştirebilirsin.`,'good');
  $('midiImportStatus').classList.remove('bad');
}catch(error){$('midiImportStatus').classList.add('bad');$('midiImportStatus').textContent=error.message||'Bu MIDI için çalışma oluşturulamadı.';}}
function initialize(){drawKeyboard();$('levelGroup').value=state.levelGroup;fillLessonOptions();appendGeneralMidiOptions($('bassTone'));appendGeneralMidiOptions($('epianoTone'));initializeMixControls();for(let ch=1;ch<=16;ch++){const opt=document.createElement('option');opt.value=String(ch);opt.textContent='Kanal '+ch;$('channel').appendChild(opt)}
  $('play').addEventListener('click',start);$('stop').addEventListener('click',()=>stop());$('levelGroup').addEventListener('change',ev=>changeLevelGroup(ev.target.value));$('lesson').addEventListener('change',ev=>changeLesson(ev.target.value));$('bpm').addEventListener('input',ev=>setBpm(Number(ev.target.value)));$('sync').addEventListener('change',selectSync);$('demo').addEventListener('change',ev=>state.demo=ev.target.checked);$('strict').addEventListener('change',ev=>state.strict=ev.target.checked);$('tap').addEventListener('click',tapTempo);$('connect').addEventListener('click',()=>state.midi?refreshMidi():connect());$('device').addEventListener('change',midiInputChanged);$('bassTone').addEventListener('change',ev=>{state.bassTone=ev.target.value;});$('epianoTone').addEventListener('change',ev=>{state.epianoTone=ev.target.value;});
  $('midiFile').addEventListener('change',handleMidiFile);$('midiSourceKey').addEventListener('change',updateMidiMappingHint);$('midiTargetKey').addEventListener('change',updateMidiMappingHint);$('prepareMidiLesson').addEventListener('click',prepareMidiLesson);
  $('midiOutput').addEventListener('change',midiOutputChanged);
  $('midiPlayerPlay').addEventListener('click',async()=>{if(!state.midiPlayer)return;if(state.playing)stop();try{await state.midiPlayer.play();}catch(error){setFeedback(`MIDI sesi açılamadı: ${error.message||error}`,'bad');}});
  $('midiPlayerPause').addEventListener('click',()=>midiPlayerAction(()=>state.midiPlayer?.pause()));$('midiPlayerStop').addEventListener('click',()=>midiPlayerAction(()=>state.midiPlayer?.stop()));
  $('midiSeek').addEventListener('change',event=>midiPlayerAction(()=>{if(state.midiPlayer)state.midiPlayer.seek(state.midiPlayer.duration*Number(event.target.value)/1000);}));
  $('midiPlayerRate').addEventListener('change',event=>midiPlayerAction(()=>state.midiPlayer?.setRate(event.target.value)));
  $('midiTransposePlayback').addEventListener('change',event=>midiPlayerAction(()=>state.midiPlayer?.setTransposeEnabled(event.target.checked)));
  $('midiPlayerAll').addEventListener('click',()=>midiPlayerAction(()=>state.midiPlayer?.selectChannels(state.midiPlayer.channels.map(ch=>ch.channel))));
  $('midiPlayerPractice').addEventListener('click',()=>midiPlayerAction(()=>state.midiPlayer?.selectChannels(state.midiPracticeChannels)));
  $('midiPlayerMute').addEventListener('click',()=>midiPlayerAction(()=>state.midiPlayer?.selectChannels([])));
  $('reset').addEventListener('click',()=>{if(!window.confirm('Bu dersin yerel başarı kaydı sıfırlansın mı?'))return;delete state.records[state.lesson.id];save();resetSession();setFeedback('Bu dersin ilerleme kaydı sıfırlandı.');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state.midiPlayer?.playing)state.midiPlayer.pause();if(state.playing&&state.mode==='app'){stop();setFeedback('Sekme arka plana geçtiği için ritim durduruldu. Tekrar başlatabilirsin.');}}});
  window.addEventListener('pagehide',()=>{stop();state.midiPlayer?.dispose();});
  setBpm(state.lesson.defaultBpm);lessonMarkup();selectSync();
  if('serviceWorker' in navigator && /^https?:/.test(location.protocol))navigator.serviceWorker.register('./sw.js').catch(()=>{});
  window.basakorDebug={version:VERSION,getState:()=>({playing:state.playing,lesson:state.lesson.id,levelGroup:state.levelGroup,mode:state.mode,bpm:state.bpm,bassVolume:state.bassVolume,chordVolume:state.chordVolume,hits:state.hits,misses:state.misses,imported:!!state.importedMidi}),simulateMidi:bytes=>handleMidi({data:new Uint8Array(bytes)})};
}
initialize();
