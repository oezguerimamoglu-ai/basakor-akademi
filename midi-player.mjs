// Browser-only MIDI preview synthesizer. The source file is never uploaded.
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const frequencyForMidi=n=>440*Math.pow(2,(n-69)/12);

function createTickConverter(file){
  const events=[...file.tempoMap].sort((a,b)=>a.tick-b.tick),points=[{tick:0,seconds:0,microsPerQuarter:500000}];
  let cursor=0,seconds=0,microsPerQuarter=500000;
  for(const event of events){
    seconds+=(event.tick-cursor)*microsPerQuarter/(1_000_000*file.ppq);
    cursor=event.tick;microsPerQuarter=60_000_000/event.bpm;
    points.push({tick:cursor,seconds,microsPerQuarter});
  }
  return tick=>{
    let low=0,high=points.length;
    while(low<high){const mid=(low+high)>>1;if(points[mid].tick<=tick)low=mid+1;else high=mid;}
    const point=points[Math.max(0,low-1)];
    return point.seconds+Math.max(0,tick-point.tick)*point.microsPerQuarter/(1_000_000*file.ppq);
  };
}

/** Convert a MIDI tick to wall-clock seconds using the file's tempo map. */
export function midiTickToSeconds(file,tick){
  return createTickConverter(file)(tick);
}

/** Flatten parsed note events into a stable, tempo-aware playback timeline. */
export function midiPlaybackEvents(file){
  const toSeconds=createTickConverter(file);
  return file.events.filter(e=>e.type==='note').map(event=>({
    ...event,channel:event.channel+1,startSeconds:toSeconds(event.tick),endSeconds:toSeconds(event.end)
  })).sort((a,b)=>a.startSeconds-b.startSeconds||a.channel-b.channel||a.note-b.note);
}

const noiseBuffers=new WeakMap();
function noiseBuffer(context){
  let buffer=noiseBuffers.get(context);if(buffer)return buffer;
  const size=context.sampleRate;
  buffer=context.createBuffer(1,size,context.sampleRate);
  const data=buffer.getChannelData(0);for(let i=0;i<size;i++)data[i]=Math.random()*2-1;
  noiseBuffers.set(context,buffer);return buffer;
}

function instrumentShape(program){
  const p=clamp(Math.round(Number(program)||0),0,127),member=p%8,tint=[0,.13,-.08,.2,-.14,.08,.17,-.18][member];
  const shape=(wave,attack,release,sustain,cutoff)=>({wave,attack:Math.max(.002,attack*(1+tint)),release:Math.max(.04,release*(1-tint)),sustain:clamp(sustain+tint*.16,.08,.82),cutoff:Math.max(600,cutoff*(1+tint*1.8))});
  if(p<=7)return shape(['triangle','sine','triangle','sawtooth','sine','triangle','square','sawtooth'][member],.008,.18,.28,5200);
  if(p<=15)return shape(['sine','triangle','sine','triangle','sine','triangle','sine','triangle'][member],.004,.09,.32,6500);
  if(p<=23)return shape(['square','sawtooth','square','triangle','square','sawtooth','triangle','square'][member],.012,.1,.7,2800);
  if(p<=31)return shape(['triangle','sawtooth','triangle','sine','triangle','sawtooth','square','triangle'][member],.003,.12,.12,4300);
  if(p<=39)return shape(['triangle','sawtooth','triangle','square','triangle','sine','sawtooth','square'][member],.004,.13,.55,1900);
  if(p<=47)return shape(['sawtooth','triangle','sawtooth','triangle','sawtooth','sine','triangle','sine'][member],member===5?.004:.075,.24,.68,3000);
  if(p<=55)return shape(['sawtooth','triangle','sawtooth','triangle','sawtooth','sine','triangle','sine'][member],.075,.24,.68,3000);
  if(p<=63)return shape(['sawtooth','square','sawtooth','triangle','sawtooth','square','triangle','sawtooth'][member],.025,.13,.72,3200);
  if(p<=79)return shape(['triangle','sine','triangle','sine','triangle','sawtooth','sine','triangle'][member],.018,.12,.62,3600);
  if(p<=95)return shape(['sawtooth','square','sawtooth','triangle','sawtooth','square','triangle','sine'][member],.01,.13,.63,4000);
  return shape(['sine','triangle','sine','sawtooth','triangle','sine','square','triangle'][member],.025,.25,.5,4500);
}

/** Play one short General MIDI-style note through an existing AudioContext. */
export function playProgramNote(context,note,program,when=context.currentTime+.001,duration=.35,volume=.1){
  const shape=instrumentShape(program),start=Math.max(when,context.currentTime+.001),end=start+Math.max(.025,duration);
  const attack=Math.min(shape.attack,Math.max(.003,(end-start)*.35)),oscillator=context.createOscillator(),filter=context.createBiquadFilter(),gain=context.createGain();
  oscillator.type=shape.wave;oscillator.frequency.setValueAtTime(frequencyForMidi(note),start);
  filter.type='lowpass';filter.frequency.setValueAtTime(shape.cutoff,start);filter.Q.value=.45;
  const amplitude=clamp(volume,.015,.22);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(amplitude,start+attack);
  const decayAt=Math.min(end,start+attack+.075);if(decayAt<end)gain.gain.exponentialRampToValueAtTime(Math.max(.0002,amplitude*shape.sustain),decayAt);
  const releaseStart=Math.max(start,end-Math.min(.035,(end-start)*.2));gain.gain.setValueAtTime(Math.max(.0002,amplitude*shape.sustain),releaseStart);
  const releaseEnd=end+shape.release;gain.gain.exponentialRampToValueAtTime(.0001,releaseEnd);
  oscillator.connect(filter).connect(gain).connect(context.destination);oscillator.start(start);oscillator.stop(releaseEnd+.01);
}

function addVoice(context,master,channel,sourceNodes,gainNode){
  const voice={channel,sources:sourceNodes,gain:gainNode};
  voice.finish=()=>activeVoices.delete(voice);
  for(const source of sourceNodes)source.addEventListener?.('ended',voice.finish,{once:true});
  activeVoices.add(voice);return voice;
}
const activeVoices=new Set();

function schedulePitched(context,master,event,when,duration){
  const program=event.program??0,shape=instrumentShape(program),start=Math.max(when,context.currentTime+.001);
  const end=start+Math.max(.025,duration),attack=Math.min(shape.attack,Math.max(.003,(end-start)*.35));
  const oscillator=context.createOscillator(),filter=context.createBiquadFilter(),gain=context.createGain();
  oscillator.type=shape.wave;oscillator.frequency.setValueAtTime(frequencyForMidi(event.note),start);
  filter.type='lowpass';filter.frequency.setValueAtTime(shape.cutoff,start);filter.Q.value=.45;
  const velocity=clamp(event.velocity??85,1,127)/127,amplitude=.105*velocity;
  gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(amplitude,start+attack);
  const decayAt=Math.min(end,start+attack+.075);
  if(decayAt<end)gain.gain.exponentialRampToValueAtTime(Math.max(.0002,amplitude*shape.sustain),decayAt);
  const releaseStart=Math.max(start,end-Math.min(.035,(end-start)*.2));
  gain.gain.setValueAtTime(Math.max(.0002,amplitude*shape.sustain),releaseStart);
  const releaseEnd=end+shape.release;gain.gain.exponentialRampToValueAtTime(.0001,releaseEnd);
  oscillator.connect(filter).connect(gain).connect(master);oscillator.start(start);oscillator.stop(releaseEnd+.01);
  return addVoice(context,master,event.channel,[oscillator],gain);
}

function scheduleDrum(context,master,event,when,duration){
  const start=Math.max(when,context.currentTime+.001),note=event.note,velocity=clamp(event.velocity??85,1,127)/127;
  const gain=context.createGain(),sources=[];gain.connect(master);
  const kick=note===35||note===36, tom=note>=41&&note<=50;
  if(kick||tom){
    const osc=context.createOscillator();sources.push(osc);osc.type='sine';
    const base=kick?125:Math.max(70,190-(note-41)*9),end=start+Math.min(duration||.16,kick?.25:.2);
    osc.frequency.setValueAtTime(base,start);osc.frequency.exponentialRampToValueAtTime(kick?42:Math.max(55,base*.62),end);
    gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.18*velocity,start+.005);gain.gain.exponentialRampToValueAtTime(.0001,end+.04);
    osc.connect(gain);osc.start(start);osc.stop(end+.045);
  }else{
    const source=context.createBufferSource(),filter=context.createBiquadFilter();sources.push(source);
    source.buffer=noiseBuffer(context);filter.type=note>=42&&note<=59?'highpass':'bandpass';
    filter.frequency.setValueAtTime(note>=42&&note<=59?6500:1700,start);filter.Q.value=note>=42&&note<=59?.7:.8;
    const length=note>=42&&note<=59?.095:.14,end=start+Math.min(Math.max(.045,duration),length);
    gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime((note>=42&&note<=59?.065:.11)*velocity,start+.003);gain.gain.exponentialRampToValueAtTime(.0001,end);
    source.connect(filter).connect(gain);source.start(start);source.stop(end+.005);
  }
  return addVoice(context,master,event.channel,sources,gain);
}

function stopVoice(context,voice){
  try{const now=context.currentTime;voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setTargetAtTime(.0001,now,.012);for(const source of voice.sources)source.stop(now+.045);}catch{}
}

/** Lightweight in-browser MIDI preview with seeking, tempo scaling, channel solo/mute, and instrument overrides. */
export class MidiFilePlayer{
  constructor(file,{contextProvider,onUpdate=()=>{}}={}){
    this.file=file;this.events=midiPlaybackEvents(file);this.duration=midiTickToSeconds(file,file.endTick);
    this.channels=file.channels.filter(c=>c.noteCount>0).map(c=>({...c}));
    this.enabledChannels=new Set(this.channels.map(c=>c.channel));this.programOverrides=new Map();this.contextProvider=contextProvider||(()=>new (window.AudioContext||window.webkitAudioContext)());
    this.onUpdate=onUpdate;this.context=null;this.master=null;this.position=0;this.rate=1;this.playing=false;this.anchor=0;this.cursor=0;this.timer=null;this.lastUiUpdate=0;
  }
  snapshot(){return {position:this.position,duration:this.duration,rate:this.rate,playing:this.playing,enabledChannels:new Set(this.enabledChannels),programOverrides:new Map(this.programOverrides),channels:this.channels};}
  emit(){this.onUpdate(this.snapshot());}
  findCursor(position){let low=0,high=this.events.length;while(low<high){const mid=(low+high)>>1;if(this.events[mid].startSeconds<position-1e-6)low=mid+1;else high=mid;}return low;}
  currentPosition(){return this.playing&&this.context?clamp((this.context.currentTime-this.anchor)*this.rate,0,this.duration):this.position;}
  ensureAudio(){if(!this.context){this.context=this.contextProvider();this.master=this.context.createGain();this.master.gain.value=.72;this.master.connect(this.context.destination);}return this.context;}
  async play(){
    if(this.playing)return;const context=this.ensureAudio();if(context.state==='suspended')await context.resume();
    if(this.position>=this.duration)this.position=0;this.anchor=context.currentTime-this.position/this.rate;this.cursor=this.findCursor(this.position);this.playing=true;
    this.timer=setInterval(()=>this.pump(),25);this.pump();this.emit();
  }
  pause(){if(!this.playing)return;this.position=this.currentPosition();this.playing=false;clearInterval(this.timer);this.timer=null;this.stopVoices();this.emit();}
  stop(){if(this.playing){this.playing=false;clearInterval(this.timer);this.timer=null;}this.position=0;this.cursor=0;this.stopVoices();this.emit();}
  seek(seconds){const wasPlaying=this.playing;if(wasPlaying){this.position=this.currentPosition();this.stopVoices();}this.position=clamp(Number(seconds)||0,0,this.duration);this.cursor=this.findCursor(this.position);if(wasPlaying&&this.context){this.anchor=this.context.currentTime-this.position/this.rate;this.pump();}this.emit();}
  setRate(rate){const next=clamp(Number(rate)||1,.5,1.5);if(next===this.rate)return;const wasPlaying=this.playing;if(wasPlaying){this.position=this.currentPosition();this.stopVoices();}this.rate=next;this.cursor=this.findCursor(this.position);if(wasPlaying&&this.context){this.anchor=this.context.currentTime-this.position/this.rate;this.pump();}this.emit();}
  setChannelEnabled(channel,enabled){const value=Number(channel);if(enabled)this.enabledChannels.add(value);else{this.enabledChannels.delete(value);if(this.context)for(const voice of [...activeVoices])if(voice.channel===value)stopVoice(this.context,voice);}this.emit();}
  programFor(channel,sourceProgram=null){const value=Number(channel);if(this.programOverrides.has(value))return this.programOverrides.get(value);return sourceProgram??this.channels.find(c=>c.channel===value)?.program??0;}
  setChannelProgram(channel,program){const value=Number(channel);if(program===null||program==='')this.programOverrides.delete(value);else this.programOverrides.set(value,clamp(Math.round(Number(program)||0),0,127));if(this.context)for(const voice of [...activeVoices])if(voice.channel===value)stopVoice(this.context,voice);this.emit();}
  soloChannel(channel){this.enabledChannels=new Set([Number(channel)]);if(this.context)for(const voice of [...activeVoices])if(voice.channel!==Number(channel))stopVoice(this.context,voice);this.emit();}
  selectChannels(channels){this.enabledChannels=new Set(channels.map(Number));if(this.context)for(const voice of [...activeVoices])if(!this.enabledChannels.has(voice.channel))stopVoice(this.context,voice);this.emit();}
  stopVoices(){if(!this.context)return;for(const voice of [...activeVoices])stopVoice(this.context,voice);}
  pump(){
    if(!this.playing||!this.context)return;const context=this.context;this.position=this.currentPosition();
    const horizon=context.currentTime+.18;
    while(this.cursor<this.events.length){
      const event=this.events[this.cursor],when=this.anchor+event.startSeconds/this.rate;if(when>horizon)break;this.cursor++;
      if(!this.enabledChannels.has(event.channel))continue;
      const end=this.anchor+event.endSeconds/this.rate,start=Math.max(when,context.currentTime+.001),duration=end-start;
      if(duration<=.015)continue;
      if(event.channel===10&&!this.programOverrides.has(10))scheduleDrum(context,this.master,event,start,duration);else schedulePitched(context,this.master,{...event,program:this.programFor(event.channel,event.program)},start,duration);
    }
    if(this.position>=this.duration){this.playing=false;clearInterval(this.timer);this.timer=null;this.position=this.duration;this.stopVoices();this.emit();return;}
    const now=performance.now();if(now-this.lastUiUpdate>65){this.lastUiUpdate=now;this.emit();}
  }
  dispose(){this.stop();this.onUpdate=()=>{};}
}
