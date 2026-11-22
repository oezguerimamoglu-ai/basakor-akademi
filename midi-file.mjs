// Browser-only Standard MIDI File reader and song-to-practice helpers.
const GM = [
  'Piyano','Parlak piyano','Elektrik piyano','Honky-tonk piyano','E-piyano 1','E-piyano 2','Harpsikord','Klavsen','Çelesta','Glockenspiel','Müzik kutusu','Vibrafon','Marimba','Ksilofon','Tübüler çan','Dulcimer',
  'Drawbar org','Percussive org','Rock org','Kilise orgu','Reed org','Akordeon','Harmonika','Tango akordeon','Naylon gitar','Çelik gitar','Caz elektro gitar','Temiz elektro gitar','Muted gitar','Overdrive gitar','Distortion gitar','Gitar harmonikleri',
  'Akustik bas','Parmak bas','Penayla bas','Fretless bas','Slap bas 1','Slap bas 2','Synth bas 1','Synth bas 2','Keman','Viyola','Çello','Kontrbas','Tremolo yaylılar','Pizzicato yaylılar','Arp','Timpani',
  'Yaylılar 1','Yaylılar 2','Synth yaylı 1','Synth yaylı 2','Koro','Vokal ooh','Synth vokal','Orkestra vuruşu','Trompet','Trombon','Tuba','Muted trompet','Korno','Pirinç bölüm','Synth pirinç 1','Synth pirinç 2',
  'Soprano saksofon','Alto saksofon','Tenor saksofon','Bariton saksofon','Obua','İngiliz kornosu','Fagot','Klarnet','Pikolo','Flüt','Recorder','Pan flüt','Üflenen şişe','Shakuhachi','Düdük','Ocarina',
  'Lead kare','Lead testere','Calliope lead','Chiff lead','Charang lead','Vokal lead','Beşli lead','Bas+lead','Pad new age','Pad sıcak','Pad polifonik','Pad koro','Pad yaylı','Pad metalik','Pad halo','Pad sweep',
  'FX yağmur','FX film','FX kristal','FX atmosfer','FX parlaklık','FX goblin','FX yankı','FX bilim kurgu','Sitar','Banjo','Shamisen','Koto','Kalimba','Gayda','Fiddle','Shanai',
  'Tinkle çan','Agogo','Çelik davul','Woodblock','Taiko davul','Melodik tom','Synth davul','Ters zil','Gitar fret sesi','Nefes sesi','Sahil','Kuş sesi','Telefon','Helikopter','Alkış','Silah sesi'
];
const NOTE_NAMES=['Do','Do♯','Re','Re♯','Mi','Fa','Fa♯','Sol','Sol♯','La','La♯','Si'];
const MAJOR=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const MINOR=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];

const u16=(a,i)=>(a[i]<<8)|a[i+1];
const u32=(a,i)=>(a[i]*0x1000000)+(a[i+1]<<16)+(a[i+2]<<8)+a[i+3];
function readVLQ(bytes,state){let value=0,count=0;while(state.i<bytes.length){const b=bytes[state.i++];value=(value<<7)|(b&127);if(!(b&128))return value;if(++count>3)throw new Error('MIDI zaman değeri bozuk.');}throw new Error('MIDI dosyası beklenmedik yerde bitti.');}
const signedByte=n=>n>127?n-256:n;
const pcName=pc=>NOTE_NAMES[((pc%12)+12)%12];

/** Parse Standard MIDI File 0/1. The source bytes are never modified or uploaded. */
export function parseMidiFile(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length<14||String.fromCharCode(...bytes.slice(0,4))!=='MThd')throw new Error('Geçerli bir Standard MIDI dosyası seç.');
  const headerLength=u32(bytes,4);if(headerLength<6||8+headerLength>bytes.length)throw new Error('MIDI başlığı okunamadı.');
  const format=u16(bytes,8),trackCount=u16(bytes,10),division=u16(bytes,12);
  if(format>1)throw new Error('Şimdilik Type 0 ve Type 1 MIDI dosyaları destekleniyor.');
  if(division&0x8000)throw new Error('SMPTE zaman kodlu MIDI dosyaları henüz desteklenmiyor.');
  if(!division)throw new Error('MIDI dosyasında zaman çözünürlüğü sıfır.');
  const tracks=[];let offset=8+headerLength;
  for(let ti=0;ti<trackCount;ti++){
    if(offset+8>bytes.length||String.fromCharCode(...bytes.slice(offset,offset+4))!=='MTrk')throw new Error(`MIDI ${ti+1}. parçası okunamadı.`);
    const len=u32(bytes,offset+4),end=offset+8+len;if(end>bytes.length)throw new Error('MIDI parçası dosya sonunda kesilmiş.');
    const data=bytes.subarray(offset+8,end),state={i:0},events=[];let tick=0,status=null,name='';
    const programs=new Map(),pending=new Map();
    while(state.i<data.length){
      tick+=readVLQ(data,state);let first=data[state.i++];
      if(first<0x80){if(status===null)throw new Error('MIDI running-status olayı çözümlenemedi.');state.i--;first=status;}
      if(first===0xff){const type=data[state.i++],size=readVLQ(data,state),payload=data.slice(state.i,state.i+size);state.i+=size;
        if(type===0x03)name=new TextDecoder().decode(payload);
        else if(type===0x51&&size===3){const micros=(payload[0]<<16)|(payload[1]<<8)|payload[2];if(micros)events.push({tick,type:'tempo',bpm:60000000/micros});}
        else if(type===0x58&&size>=2)events.push({tick,type:'meter',numerator:payload[0],denominator:2**payload[1],clocks:payload[2],thirtySeconds:payload[3]});
        else if(type===0x59&&size>=2)events.push({tick,type:'key',sf:signedByte(payload[0]),minor:payload[1]!==0});
        else if(type===0x06)events.push({tick,type:'marker',text:new TextDecoder().decode(payload)});
        if(type===0x2f)break;continue;
      }
      if(first===0xf0||first===0xf7){status=null;const size=readVLQ(data,state);state.i+=size;continue;}
      status=first;const command=first&0xf0,channel=first&0x0f,size=(command===0xc0||command===0xd0)?1:2;
      if(state.i+size>data.length)throw new Error('MIDI nota olayı yarım kalmış.');
      const a=data[state.i++],b=size===2?data[state.i++]:0;
      if(command===0xc0){programs.set(channel,a);events.push({tick,type:'program',channel,program:a});continue;}
      if(command===0x90&&b>0){const key=`${channel}:${a}`,queue=pending.get(key)||[];queue.push({tick,velocity:b,program:programs.get(channel)??null});pending.set(key,queue);continue;}
      if(command===0x80||(command===0x90&&b===0)){const key=`${channel}:${a}`,queue=pending.get(key)||[],start=queue.shift();if(start){events.push({tick:start.tick,type:'note',end:Math.max(start.tick+1,tick),channel,note:a,velocity:start.velocity,program:start.program});}continue;}
    }
    // Notes without Note Off still count as note events and end at their track end.
    for(const [key,queue] of pending)for(const start of queue){const [channel,note]=key.split(':').map(Number);events.push({tick:start.tick,type:'note',end:Math.max(start.tick+1,tick),channel,note,velocity:start.velocity,program:start.program});}
    events.sort((a,b)=>a.tick-b.tick);tracks.push({index:ti,name:name||`Parça ${ti+1}`,events,endTick:tick});offset=end;
  }
  const all=tracks.flatMap(track=>track.events.map(event=>({...event,trackIndex:track.index,trackName:track.name}))).sort((a,b)=>a.tick-b.tick);
  const tempoMap=all.filter(e=>e.type==='tempo').map(e=>({tick:e.tick,bpm:e.bpm}));if(!tempoMap.length)tempoMap.push({tick:0,bpm:120,defaulted:true});
  const meterMap=all.filter(e=>e.type==='meter').map(e=>({tick:e.tick,numerator:e.numerator,denominator:e.denominator}));if(!meterMap.length)meterMap.push({tick:0,numerator:4,denominator:4,defaulted:true});
  const keyMap=all.filter(e=>e.type==='key').map(e=>({tick:e.tick,sf:e.sf,minor:e.minor}));
  const channels=new Map();
  for(const event of all){if(event.type!=='program'&&event.type!=='note')continue;let c=channels.get(event.channel);if(!c){c={channel:event.channel+1,program:null,instrument:'Enstrüman belirtilmemiş',notes:[],noteCount:0,minNote:127,maxNote:0};channels.set(event.channel,c);}if(event.type==='program'){c.program=event.program;c.instrument=GM[event.program]||`Program ${event.program+1}`;}else{c.notes.push(event);c.noteCount++;c.minNote=Math.min(c.minNote,event.note);c.maxNote=Math.max(c.maxNote,event.note);}}
  const endTick=Math.max(0,...tracks.map(t=>t.endTick));
  return {format,trackCount,ppq:division,tracks,title:tracks.find(t=>t.name)?.name||'Yüklenen MIDI',events:all,channels:[...channels.values()].sort((a,b)=>a.channel-b.channel),tempoMap,meterMap,keyMap,endTick};
}

export function tempoAt(file,tick=0){return [...file.tempoMap].filter(e=>e.tick<=tick).at(-1)?.bpm||120;}
export function meterAt(file,tick=0){return [...file.meterMap].filter(e=>e.tick<=tick).at(-1)||{tick:0,numerator:4,denominator:4,defaulted:true};}
export function measureTicks(ppq,meter){return ppq*4*meter.numerator/meter.denominator;}
export function sourceDurationSeconds(file){let seconds=0,cursor=0,bpm=120;for(const e of file.tempoMap){if(e.tick>file.endTick)break;seconds+=(e.tick-cursor)*60/(file.ppq*bpm);cursor=e.tick;bpm=e.bpm;}seconds+=(file.endTick-cursor)*60/(file.ppq*bpm);return seconds;}
export function detectKey(file,channels=[]){
  const use=new Set(channels.map(n=>n-1)),hist=Array(12).fill(0);
  for(const c of file.channels){if(use.size&&!use.has(c.channel-1))continue;for(const n of c.notes){const duration=Math.max(1,n.end-n.tick);hist[n.note%12]+=duration*Math.max(.25,n.velocity/96);}}
  const total=hist.reduce((a,b)=>a+b,0);if(!total)return {tonic:0,mode:'major',name:'Do majör',confidence:0};
  const mean=hist.reduce((a,b)=>a+b,0)/12,center=hist.map(x=>x-mean),variance=Math.sqrt(center.reduce((a,b)=>a+b*b,0));
  let best={score:-Infinity,tonic:0,mode:'major'};const scores=[];
  for(let tonic=0;tonic<12;tonic++)for(const [mode,profile] of [['major',MAJOR],['minor',MINOR]]){const p=profile.map((_,i)=>profile[(i-tonic+12)%12]);const pm=p.reduce((a,b)=>a+b,0)/12,pc=p.map(x=>x-pm),pn=Math.sqrt(pc.reduce((a,b)=>a+b*b,0));const score=center.reduce((sum,x,i)=>sum+x*pc[i],0)/(variance*pn||1);scores.push(score);if(score>best.score)best={score,tonic,mode};}
  const next=scores.filter(x=>x<best.score).sort((a,b)=>b-a)[0]??best.score;
  const modeName=best.mode==='minor'?'minör':'majör';
  return {tonic:best.tonic,mode:best.mode,name:`${pcName(best.tonic)} ${modeName}`,confidence:Math.max(0,Math.min(1,(best.score-next)*3)),score:best.score};
}

const chordShapes=[
  {quality:'',intervals:[0,4,7],name:'majör'},{quality:'m',intervals:[0,3,7],name:'minör'},
  {quality:'dim',intervals:[0,3,6],name:'eksik beşli'},{quality:'aug',intervals:[0,4,8],name:'artık beşli'},
  {quality:'7',intervals:[0,4,7,10],name:'7'},{quality:'maj7',intervals:[0,4,7,11],name:'maj7'},
  {quality:'m7',intervals:[0,3,7,10],name:'m7'},{quality:'m7b5',intervals:[0,3,6,10],name:'m7♭5'}
];
function chordFromPitchClasses(input,shift=0){
  const pcs=[...new Set(input.map(n=>((n+shift)%12+12)%12))];if(pcs.length<3)return null;
  let best=null;for(let root=0;root<12;root++)for(const shape of chordShapes){const need=shape.intervals.map(i=>(root+i)%12),matches=need.filter(pc=>pcs.includes(pc)).length,extras=pcs.filter(pc=>!need.includes(pc)).length,score=matches*2-extras-(need.length-pcs.length)*.25;if(matches>=3&&(!best||score>best.score))best={root,shape,need,score};}
  if(!best)return null;
  const rootMidi=60+best.root;const notes=best.need.map(pc=>rootMidi+((pc-best.root+12)%12));
  return {label:`${pcName(best.root)}${best.shape.quality}`,notes,pcs:best.need};
}
const transpositionFor=(source,target)=>{let d=((target-source+12)%12);if(d>6)d-=12;return d;};
function activeNotes(channel,tick){return channel.notes.filter(n=>n.tick<=tick&&n.end>tick).map(n=>n.note);}
function makeStep(kind,label,notes,more={}){return {kind,label,notes:notes.join('–'),midi:notes,...more};}

/** Turn a selected MIDI section into a repeated, fixed-grid practice lesson. */
export function buildMidiLesson(file,{bassChannel,chordChannel=null,sourceKey=0,targetKey=4,startBar=1,barCount=2,bpm=null}={}){
  const meterSignatures=new Set(file.meterMap.map(({numerator,denominator})=>`${numerator}/${denominator}`));
  if(meterSignatures.size>1)throw new Error('Bu MIDI parçasında ölçü işareti değişiyor. Şimdilik çalışma hazırlamak için ölçüsü sabit bir bölüm seç.');
  const bass=file.channels.find(c=>c.channel===Number(bassChannel));if(!bass?.notes.length)throw new Error('Seçilen bas kanalında nota bulunamadı.');
  const startTick=Math.max(0,(Number(startBar)-1)*measureTicks(file.ppq,meterAt(file,0)));
  const meter=meterAt(file,startTick),barTicks=measureTicks(file.ppq,meter),stepTicks=file.ppq/4;
  if(!Number.isInteger(stepTicks)||!Number.isInteger(barTicks/stepTicks))throw new Error('Bu MIDI zaman çözünürlüğü 16’lık çalışma ızgarasına tam bölünmüyor.');
  const stepsPerBar=barTicks/stepTicks,stepsPerDenominator=16/meter.denominator;
  if(!Number.isInteger(stepsPerDenominator))throw new Error('Bu ölçünün paydası henüz desteklenmiyor.');
  const count=Math.max(1,Math.min(4,Number(barCount)||1)),shift=transpositionFor(Number(sourceKey),Number(targetKey));
  const chord=file.channels.find(c=>c.channel===Number(chordChannel)&&c.notes.length)||null;
  const sourceEventStart=startTick,sourceEventEnd=startTick+barTicks*count;
  if(sourceEventEnd>file.endTick+1)throw new Error('Seçilen ölçü aralığı MIDI dosyasının sonunu aşıyor.');
  const cycles=[];
  for(let bar=0;bar<count;bar++){
    const barStart=startTick+bar*barTicks,items=Array.from({length:stepsPerBar},()=>({bass:[],chord:null}));
    for(const note of bass.notes){if(note.tick<barStart||note.tick>=barStart+barTicks)continue;const index=Math.max(0,Math.min(stepsPerBar-1,Math.round((note.tick-barStart)/stepTicks)));items[index].bass.push(note.note+shift);}
    if(chord){let previous='';for(let i=0;i<stepsPerBar;i++){
      const at=barStart+i*stepTicks, sounding=activeNotes(chord,at);if(sounding.length<3){previous='';continue;}
      const chordGuess=chordFromPitchClasses(sounding,shift);if(!chordGuess)continue;
      const signature=chordGuess.label+':'+chordGuess.pcs.join(',');
      // Cue a chord only on a new harmony or after the previous chord releases.
      if(signature!==previous){items[i].chord=chordGuess;previous=signature;}
    }}
    const events=items.map(item=>{
      const bassNotes=[...new Set(item.bass)].sort((a,b)=>a-b).slice(0,1),chordInfo=item.chord;
      if(bassNotes.length&&chordInfo){const midi=[...bassNotes,...chordInfo.notes];return makeStep('combo',`${pcName(bassNotes[0]%12)} + ${chordInfo.label}`,midi,{bassMidi:bassNotes,chordMidi:chordInfo.notes,chordLabel:chordInfo.label});}
      if(bassNotes.length)return makeStep('bass',pcName(bassNotes[0]%12),bassNotes,{bassMidi:bassNotes});
      if(chordInfo)return makeStep('chord',chordInfo.label,chordInfo.notes,{chordMidi:chordInfo.notes});
      return {kind:'rest',label:'ES',notes:'–',midi:[]};
    });
    cycles.push(events);
  }
  const beatSteps=stepsPerDenominator,groups=Array.from({length:meter.numerator},()=>beatSteps);
  const beatsPerBar=barTicks/file.ppq;
  const kickSteps=[0];if(beatsPerBar>=3)kickSteps.push(Math.round(beatsPerBar/2*stepsPerDenominator));
  const snareSteps=beatsPerBar>=4?[stepsPerDenominator,3*stepsPerDenominator]:beatsPerBar>=2?[stepsPerDenominator]:[];
  const sourceName=file.title||'Yüklenen MIDI';
  return {
    id:'midi-import',level:99,title:`MIDI · ${sourceName} · ölçü ${startBar}–${startBar+count-1}`,
    meter:`${meter.numerator}/${meter.denominator}`,grouping:groups,groupingText:`${meter.numerator} vuruş · 16’lık ızgara`,denominator:16,
    description:`${sourceName}: kanal ${bass.channel} bas çizgisi ve ${chord?`kanal ${chord.channel} armonisi`:'bas çizgisi'} Mi kararına taşındı. ${count} ölçülük bölüm tekrar edilir.`,
    defaultBpm:bpm||tempoAt(file,sourceEventStart),accent:Array.from({length:meter.numerator},(_,i)=>i*stepsPerDenominator),kickSteps,snareSteps,beatSteps:stepsPerDenominator,
    steps:cycles[0],songCycle:cycles,gridStepTicks:stepTicks,sourceStartMeasure:Number(startBar),sourceBarCount:count,
    transposeSemitones:shift,targetKey:Number(targetKey),bassChannel:Number(bassChannel),chordChannel:chord?.channel??null
  };
}

export function suggestedChannels(file){
  const active=file.channels.filter(c=>c.noteCount>0);
  const bass=active.filter(c=>c.program!==null&&c.program>=32&&c.program<=39).sort((a,b)=>a.minNote-b.minNote)[0]||active.filter(c=>c.minNote<54).sort((a,b)=>a.minNote-b.minNote)[0]||null;
  const drums=active.find(c=>c.channel===10)||null;
  const piano=active.filter(c=>c.program!==null&&c.program<=5&&c.channel!==bass?.channel);
  const poly=active.filter(c=>c.channel!==bass?.channel&&c.channel!==drums?.channel).map(c=>({...c,polyScore:c.notes.length/(Math.max(1,c.maxNote-c.minNote+1))})).sort((a,b)=>b.polyScore-a.polyScore);
  const chord=piano[0]||poly.sort((a,b)=>((b.program>=24&&b.program<=31?100:b.program>=48&&b.program<=55?10:0)+b.polyScore)-((a.program>=24&&a.program<=31?100:a.program>=48&&a.program<=55?10:0)+a.polyScore))[0]||null;
  return {bass:bass?.channel??null,chord:chord?.channel??null,drums:drums?.channel??null,hasActivePiano:piano.length>0};
}

export const GM_INSTRUMENTS=GM;
export const MIDI_NOTE_NAMES=NOTE_NAMES;
export const midiPitchName=pcName;
