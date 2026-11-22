import {VERSION,LESSONS,getLesson,getSteps,msPerStep,noteName,matchEvent,nearestStep,timingGrade,currentEvent,handName} from './music.mjs';

const $ = id=>document.getElementById(id);
const KEY='basakor-akademi-progress-v2';
const runLength=8;
const state={
  lesson:LESSONS[0],bpm:65,mode:'app',ctx:null,playing:false,waitingClock:false,demo:false,strict:false,bassTone:'finger',epianoTone:'ep1',bassBuffers:{},epianoBuffers:{},bassLoading:null,
  originMs:0,audioStart:0,nextScheduled:0,timer:null,raf:null,sessionId:0,
  evaluated:new Map(),nextMiss:0,hits:0,misses:0,judged:0,visualBeat:-1,
  midi:null,midiInput:null,midiCluster:null,midiClusterTimer:null,midiNotes:new Map(),
  clock:{armed:false,running:false,ticks:0,lastTickMs:0,avgTickMs:0,pulseTimes:[],sourceId:null},
  tapTimes:[],records:{},mutedPage:false
};
try{const old=JSON.parse(localStorage.getItem(KEY)||'{}');if(old&&typeof old==='object')state.records=old;}catch{}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state.records));}catch{}};

// Web Audio — ağdan ses dosyası indirmez; bağlantısız çalışır.
function audio(){if(!state.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw new Error('Tarayıcın ses üretimini desteklemiyor.');state.ctx=new C();}return state.ctx;}
function oscillator(freq,t,length,volume,type='sine'){
  if(!state.ctx)return;const c=state.ctx,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),t+.014);g.gain.exponentialRampToValueAtTime(.0001,t+length);o.connect(g).connect(c.destination);o.start(t);o.stop(t+length+.018);
}
function toneFromMidi(note,t,length=.24,volume=.12,type='triangle') {oscillator(440*Math.pow(2,(note-69)/12),t,length,volume,type)}
const BASS_SAMPLES={finger:[{root:33,file:'finger-A.wav'},{root:35,file:'finger-B.wav'},{root:39,file:'finger-Dsharp.wav'}],pick:[{root:33,file:'pick-A.wav'},{root:35,file:'pick-B.wav'},{root:40,file:'pick-E2.wav'}]};
const EPIANO_SAMPLES={ep1:[{root:60,file:'ep1-C4.wav'},{root:66,file:'ep1-Fsharp4.wav'},{root:72,file:'ep1-C5.wav'}],ep2:[{root:60,file:'ep2-C4.wav'},{root:66,file:'ep2-Fsharp4.wav'},{root:72,file:'ep2-C5.wav'}]};
async function loadBassSamples(){if(state.bassLoading)return state.bassLoading;state.bassLoading=(async()=>{const c=audio();await Promise.all([['bass',BASS_SAMPLES,'./assets/bass/'],['epiano',EPIANO_SAMPLES,'./assets/epiano/']].map(async([kind,banks,path])=>{const target=kind==='bass'?state.bassBuffers:state.epianoBuffers;for(const [tone,entries] of Object.entries(banks)){target[tone]={};await Promise.all(entries.map(async entry=>{try{const response=await fetch(path+entry.file);if(!response.ok)throw new Error();target[tone][entry.root]=await c.decodeAudioData(await response.arrayBuffer());}catch{target[tone]={};}}));}}));})();return state.bassLoading;}
function playBass(note,t){const c=state.ctx;const samples=state.bassBuffers[state.bassTone];if(!samples){toneFromMidi(note,t,.32,.15,'triangle');return;}const roots=Object.keys(samples).map(Number),root=roots.reduce((a,b)=>Math.abs(b-note)<Math.abs(a-note)?b:a);const src=c.createBufferSource(),gain=c.createGain();src.buffer=samples[root];src.playbackRate.setValueAtTime(Math.pow(2,(note-root)/12),t);gain.gain.setValueAtTime(.72,t);gain.gain.setTargetAtTime(.0001,t+.32,.4);src.connect(gain).connect(c.destination);src.start(t);src.stop(t+1.8);}
function playEPiano(note,t){const c=state.ctx,samples=state.epianoBuffers[state.epianoTone];if(!samples||!Object.keys(samples).length){toneFromMidi(note,t,.32,.08,'triangle');return;}const roots=Object.keys(samples).map(Number),root=roots.reduce((a,b)=>Math.abs(b-note)<Math.abs(a-note)?b:a);const src=c.createBufferSource(),gain=c.createGain();src.buffer=samples[root];src.playbackRate.setValueAtTime(Math.pow(2,(note-root)/12),t);gain.gain.setValueAtTime(.62,t);gain.gain.setTargetAtTime(.0001,t+.48,.45);src.connect(gain).connect(c.destination);src.start(t);src.stop(t+2.08);}
function playNotes(notes,at=null){try{const c=audio();const t=at??c.currentTime+.002;notes.forEach((n,i)=>{if(notes.length===1)playBass(n,t);else playEPiano(n,t+i*.004)});}catch{}}
function kick(t){const c=state.ctx,o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(130,t);o.frequency.exponentialRampToValueAtTime(44,t+.14);g.gain.setValueAtTime(.28,t);g.gain.exponentialRampToValueAtTime(.0001,t+.17);o.connect(g).connect(c.destination);o.start(t);o.stop(t+.19)}
function noise(t,duration=.06,level=.075,cutoff=2300){const c=state.ctx,size=Math.ceil(c.sampleRate*duration),buffer=c.createBuffer(1,size,c.sampleRate),d=buffer.getChannelData(0);for(let i=0;i<size;i++)d[i]=Math.random()*2-1;const o=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();o.buffer=buffer;f.type='highpass';f.frequency.value=cutoff;g.gain.setValueAtTime(level,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(f).connect(g).connect(c.destination);o.start(t);o.stop(t+duration+.001)}
function drums(t,step){const l=state.lesson;const start=l.accent.includes(step);const strong=step===0;
  if(strong || (l.denominator===4&&step===2) || (l.denominator===8&&step===4))kick(t);
  if(!strong && (l.denominator===4 ? step%2===1 : start))noise(t,.095,.11,1400);
  noise(t,.035,start?.04:.021,4200);
}
function setFeedback(message,type=''){const el=$('feedback');el.className='feedback'+(type?' '+type:'');el.textContent=message;}
function setStatus(message,playing=false){$('statusPill').textContent=message;$('statusPill').classList.toggle('playing',playing)}
function showMeasure(num){$('measure').textContent=`Ölçü ${num+1}`;$('measureProgress').textContent=`${Math.min(num+1,runLength)} / ${runLength}`;}
function describeExpected(expected){if(!expected)return;$('actionType').textContent=handName(expected.kind);$('actionType').className='actiontype '+expected.kind;$('actionNote').textContent=expected.label;$('actionDetail').textContent=expected.notes;const activeNotes=expected.midi||[];document.querySelectorAll('.key').forEach(key=>key.classList.toggle('expect',activeNotes.includes(Number(key.dataset.note))));}
function lessonMarkup(){const l=state.lesson;$('meterTag').textContent=`${l.meter} · ${l.grouping.join('+')}`;$('levelTag').textContent=`Ders ${l.level} / ${LESSONS.length}`;$('lessonDescription').textContent=l.description;$('grouping').textContent=l.grouping.join(' + ');
  const hints=l.steps.map((s,i)=>`<li><span class="highlight">${i+1}. vuruş:</span> ${s.kind==='rest'?'Es (çalma)':s.kind==='bass'?`Sol el bas ${s.label} · ${s.notes}`:`Sağ el akor ${s.label} · ${s.notes}`}</li>`);
  $('instructions').innerHTML=hints.join('');
  drawBeats(0);renderPads();showMeasure(0);describeExpected(l.steps[0]);updateScore();
}
function drawBeats(measure){const l=state.lesson,steps=getSteps(l,measure);const beatArea=$('beats');beatArea.style.setProperty('--cols',steps.length);beatArea.className='beatgrid'+(steps.length>4?' long':'');let groupStart=0;const starts=new Set(l.grouping.map(group=>{const i=groupStart;groupStart+=group;return i;}));
  beatArea.innerHTML=steps.map((s,i)=>`<div class="beat ${s.kind} ${starts.has(i)?'group-start':''}" id="beat-${i}" data-step="${i}"><div class="ord">${i+1}</div><div class="type">${s.kind==='bass'?'SOL BAS':s.kind==='chord'?'SAĞ AKOR':'ES'}</div><div class="note">${s.label}</div></div>`).join('');
}
function relevantPads(){const actions=new Map();for(const e of [...state.lesson.steps,...(state.lesson.alternate||[])])if(e.kind!=='rest')actions.set(e.kind+':'+e.midi.join(','),e);return [...actions.values()];}
function renderPads(){const items=relevantPads();$('pads').innerHTML=items.map((s,i)=>`<button class="pad ${s.kind}" data-index="${i}" aria-label="${s.kind==='bass'?'Sol el bas':'Sağ el akor'} ${s.label}">${s.label}<small>${s.kind==='bass'?'SOL EL · BAS':'SAĞ EL · AKOR'} · ${s.notes}</small></button>`).join('');
  $('pads').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{const e=items[Number(b.dataset.index)];playNotes(e.midi);evaluate(e.midi,performance.now(),'ekran');flashKeys(e.midi)}));
}
function drawKeyboard(){const board=$('keyboard');const low=33,high=83;const whites=[];for(let n=low;n<=high;n++)if(![1,3,6,8,10].includes(n%12))whites.push(n);
  board.innerHTML=whites.map(n=>`<div class="key white" id="key-${n}" data-note="${n}"><span class="key-id">${n}</span><span class="key-label">${n%12===0?'Do':n%12===4?'Mi':n%12===9?'La':n%12===11?'Si':''}</span></div>`).join('');
  for(let n=low;n<=high;n++){if([1,3,6,8,10].includes(n%12)){const prev=whites.filter(x=>x<n).length;const left=(prev-0.3)/whites.length*100;const key=document.createElement('div');key.className='key black';key.dataset.note=n;key.id='key-'+n;key.style.left=left+'%';board.appendChild(key);}}
}
function flashKeys(notes){for(const n of notes){const el=$('key-'+n);if(el){el.classList.add('on');setTimeout(()=>el.classList.remove('on'),180)}}}
function updateScore(){const total=runLength*state.lesson.steps.length;
  $('success').textContent=state.hits;$('mistakes').textContent=state.misses;$('accuracy').textContent=state.judged?`${Math.round(state.hits/state.judged*100)}%`:'–';
  const done=state.playing?Math.min(state.nextMiss,total):0;
  $('progressFill').style.width=(100*done/total)+'%';
  const rec=state.records[state.lesson.id];$('completedMessage').textContent=rec?`Kişisel rekor: %${rec.bestPercent} · ${rec.completed} tamamlanan çalışma`:'Sekiz ölçü çalışıp sonucunu gör.';
}
function getBpm(){return Number($('bpm').value)}
function setBpm(value){state.bpm=Math.round(Math.max(45,Math.min(160,value)));$('bpm').value=String(state.bpm);$('tempoValue').textContent=state.bpm+' BPM'}
function resetSession(){state.sessionId++;state.evaluated.clear();state.nextMiss=0;state.hits=0;state.misses=0;state.judged=0;state.visualBeat=-1;showMeasure(0);drawBeats(0);describeExpected(state.lesson.steps[0]);updateScore()}
function queuedAudio(){if(!state.playing || state.mode!=='app'||!state.ctx)return;const c=state.ctx,len=state.lesson.steps.length,unit=msPerStep(state.bpm,state.lesson.denominator)/1000;
  while(state.nextScheduled<runLength*len && state.audioStart+state.nextScheduled*unit<c.currentTime+.18){const absolute=state.nextScheduled,step=absolute%len,measure=Math.floor(absolute/len),at=state.audioStart+absolute*unit,event=getSteps(state.lesson,measure)[step];drums(at,step);if(state.demo&&event.midi)playNotes(event.midi,at);state.nextScheduled++;}
}
function clockPosition(now=performance.now()) {const c=state.clock;if(!c.running||!c.lastTickMs)return null;const pulsesPerStep=state.lesson.denominator===4?24:12;const tickMs=c.avgTickMs||60000/state.bpm/24;
  const fractional=(c.ticks+Math.max(0,Math.min(now-c.lastTickMs,tickMs*1.4))/tickMs)/pulsesPerStep;
  return {fractional,stepMs:tickMs*pulsesPerStep};
}
function beatPosition(now=performance.now()) {
  if(state.mode==='clock'){const pos=clockPosition(now);if(!pos)return null;const absolute=Math.round(pos.fractional);return {absolute,measure:Math.floor(absolute/state.lesson.steps.length),step:absolute%state.lesson.steps.length,deviationMs:(pos.fractional-absolute)*pos.stepMs,stepMs:pos.stepMs,continuous:pos.fractional};}
  const unit=msPerStep(state.bpm,state.lesson.denominator),hit=nearestStep({eventMs:now,originMs:state.originMs,stepMs:unit,stepsPerMeasure:state.lesson.steps.length});if(!hit)return null;return {...hit,stepMs:unit,continuous:(now-state.originMs)/unit};
}
function markMissed(upto){const max=runLength*state.lesson.steps.length;while(state.nextMiss<Math.min(max,upto)){const n=state.nextMiss++;const ev=currentEvent(state.lesson,n);if(ev.kind==='rest'||state.evaluated.has(n))continue;state.evaluated.set(n,'miss');state.misses++;state.judged++;if(n===state.visualBeat)paintStep(n,'miss');}updateScore();}
function paintStep(absolute,type){const index=absolute%state.lesson.steps.length;const el=$('beat-'+index);if(el)el.classList.add(type)}
function evaluate(notes,time,source){if(!state.playing || state.waitingClock){setFeedback(state.waitingClock?'Pa4X’te Style START tuşuna bas. MIDI Clock sinyali bekleniyor.':'Önce Başlat tuşuna bas.');return;}
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
  if(pos){const absolute=Math.floor(pos.continuous);if(absolute>=0){
      markMissed(absolute);if(absolute>=total){complete();return;}
      const measure=Math.floor(absolute/len),step=absolute%len;
      if(state.visualBeat!==absolute){const prevMeasure=state.visualBeat<0?-1:Math.floor(state.visualBeat/len);if(prevMeasure!==measure){drawBeats(measure);}state.visualBeat=absolute;document.querySelectorAll('.beat').forEach(el=>el.classList.toggle('active',Number(el.dataset.step)===step));
        for(let i=0;i<=step;i++){const result=state.evaluated.get(measure*len+i);if(result)paintStep(measure*len+i,result==='hit'?'hit':'miss');}
        showMeasure(measure);describeExpected(getSteps(l,measure)[step]);}
    }}state.raf=requestAnimationFrame(animate);
}
async function start(){if(state.playing)return;try{await audio().resume();}catch(e){setFeedback('Ses açılamadı: '+e.message,'bad');return;}await loadBassSamples();
  state.mode=$('sync').value;state.demo=$('demo').checked;state.strict=$('strict').checked;resetSession();state.playing=true;
  $('play').disabled=true;$('stop').disabled=false;$('lesson').disabled=true;$('sync').disabled=true;$('bpm').disabled=true;$('tap').disabled=true;
  if(state.mode==='app'){
    state.waitingClock=false;state.originMs=performance.now()+320;state.audioStart=state.ctx.currentTime+.320;state.nextScheduled=0;
    state.timer=setInterval(queuedAudio,25);queuedAudio();setStatus('● Alıştırma çalıyor',true);setFeedback('Hazır! Davulu dinle; bası sol elinle, akoru sağ elinle çal.');
  }else{
    state.waitingClock=true;state.clock={armed:true,running:false,ticks:0,lastTickMs:0,avgTickMs:0,pulseTimes:[],sourceId:null};setStatus('◌ Pa4X bekleniyor');setFeedback('Pa4X’te MIDI Clock Send aç ve Style START tuşuna bas. Uygulama kendi davulunu çalmayacak.');
  }
  state.raf=requestAnimationFrame(animate);
}
function stop(completed=false){if(!state.playing)return;const completeRun=completed;state.playing=false;state.waitingClock=false;state.clock.armed=false;clearInterval(state.timer);cancelAnimationFrame(state.raf);state.timer=null;state.raf=null;
  $('play').disabled=false;$('stop').disabled=true;$('lesson').disabled=false;$('sync').disabled=false;$('bpm').disabled=false;$('tap').disabled=false;setStatus('● Hazır');
  document.querySelectorAll('.beat').forEach(el=>el.classList.remove('active'));
  if(!completeRun){setFeedback('Çalışma durduruldu. Başlat ile yeniden dene.');$('progressFill').style.width='0%';}
}
function complete(){const total=runLength*state.lesson.steps.length;markMissed(total);const percent=state.judged?Math.round(state.hits/state.judged*100):0;
  const prev=state.records[state.lesson.id]||{bestPercent:0,completed:0};state.records[state.lesson.id]={bestPercent:Math.max(prev.bestPercent,percent),completed:prev.completed+1,lastPercent:percent};save();
  stop(true);$('progressFill').style.width='100%';updateScore();setFeedback(`🏁 8 ölçü tamamlandı! Başarı: %${percent} (${state.hits} doğru / ${state.misses} hata veya kaçan). ${percent>=80?'Yeni derse geçmeye hazırsın!':'Bir tur daha dene; hızını yavaşlatabilirsin.'}`,percent>=80?'good':'');
}
function changeLesson(id){if(state.playing)return;state.lesson=getLesson(id);setBpm(state.lesson.defaultBpm);resetSession();lessonMarkup();}
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
function refreshMidi(){if(!state.midi)return;const input=$('device'),ports=[...state.midi.inputs.values()],current=input.value;input.innerHTML=ports.length?ports.map(p=>{const opt=document.createElement('option');opt.value=p.id;opt.textContent=p.name||'MIDI cihazı';return opt.outerHTML;}).join(''):'<option value="">Giriş bulunamadı</option>';input.disabled=ports.length===0;
  if(ports.length){const preferred=ports.find(p=>/pa4x.*keyboard|keyboard.*pa4x/i.test(p.name||''))||ports.find(p=>/pa4x/i.test(p.name||''))||ports[0];input.value=ports.some(p=>p.id===current)?current:preferred.id;}
  midiInputChanged();
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
  // Aynı anda basılan 3/4 notayı tek akor kabul et. İlk notanın zaman damgasını koru.
  if(!state.midiCluster)state.midiCluster={notes:[],firstMs:now};
  if(!state.midiCluster.notes.includes(note))state.midiCluster.notes.push(note);
  clearTimeout(state.midiClusterTimer);const clusterId=state.sessionId;
  const flush=()=>{if(clusterId!==state.sessionId)return;const cluster=state.midiCluster;state.midiCluster=null;if(cluster?.notes?.length)evaluate(cluster.notes,cluster.firstMs,'Pa4X MIDI');};
  const elapsed=now-state.midiCluster.firstMs;
  state.midiClusterTimer=setTimeout(flush,Math.max(10,Math.min(110,190-elapsed)));
}
function selectSync(){state.mode=$('sync').value;const clock=state.mode==='clock';$('sourceHint').textContent=clock?'Pa4X’in kendi davulu çalar. Clock Send ve MIDI bağlantısı gerekir; cihazda test edilmelidir.':'Uygulamanın davulu çalar. Pa4X bağlantısı olmasa da çalışır.';$('clockStatus').textContent=clock?'Pa4X START/Clock bekleniyor':'MIDI Clock beklenmiyor';}
function tapTempo(){const now=performance.now();state.tapTimes=state.tapTimes.filter(t=>now-t<3500);state.tapTimes.push(now);if(state.tapTimes.length>=3){const intervals=state.tapTimes.slice(1).map((t,i)=>t-state.tapTimes[i]);const average=intervals.reduce((a,b)=>a+b,0)/intervals.length;setBpm(60000/average);setFeedback(`Tempo: ${state.bpm} BPM. Üç veya daha fazla kez düzenli dokun.`);}else setFeedback('Dört eşit aralıklı vuruşla temponu belirle.');}
function initialize(){drawKeyboard();for(const l of LESSONS){const opt=document.createElement('option');opt.value=l.id;opt.textContent=`${l.level}. ${l.title}`;$('lesson').appendChild(opt)}for(let ch=1;ch<=16;ch++){const opt=document.createElement('option');opt.value=String(ch);opt.textContent='Kanal '+ch;$('channel').appendChild(opt)}
  $('play').addEventListener('click',start);$('stop').addEventListener('click',()=>stop());$('lesson').addEventListener('change',ev=>changeLesson(ev.target.value));$('bpm').addEventListener('input',ev=>setBpm(Number(ev.target.value)));$('sync').addEventListener('change',selectSync);$('demo').addEventListener('change',ev=>state.demo=ev.target.checked);$('strict').addEventListener('change',ev=>state.strict=ev.target.checked);$('tap').addEventListener('click',tapTempo);$('connect').addEventListener('click',()=>state.midi?refreshMidi():connect());$('device').addEventListener('change',midiInputChanged);$('bassTone').addEventListener('change',ev=>{state.bassTone=ev.target.value;});$('epianoTone').addEventListener('change',ev=>{state.epianoTone=ev.target.value;});
  $('reset').addEventListener('click',()=>{if(!window.confirm('Bu dersin yerel başarı kaydı sıfırlansın mı?'))return;delete state.records[state.lesson.id];save();resetSession();setFeedback('Bu dersin ilerleme kaydı sıfırlandı.');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.playing&&state.mode==='app'){stop();setFeedback('Sekme arka plana geçtiği için ritim durduruldu. Tekrar başlatabilirsin.');}});
  window.addEventListener('pagehide',()=>stop());
  setBpm(state.lesson.defaultBpm);lessonMarkup();selectSync();
  if('serviceWorker' in navigator && /^https?:/.test(location.protocol))navigator.serviceWorker.register('./sw.js').catch(()=>{});
  window.basakorDebug={version:VERSION,getState:()=>({playing:state.playing,lesson:state.lesson.id,mode:state.mode,bpm:state.bpm,hits:state.hits,misses:state.misses}),simulateMidi:bytes=>handleMidi({data:new Uint8Array(bytes)})};
}
initialize();
