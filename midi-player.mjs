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

export function midiPlaybackNote(note,channel,semitones=0,transposeEnabled=false){
  return note+(transposeEnabled&&Number(channel)!==10?(Number(semitones)||0):0);
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
export function playProgramNote(context,note,program,when=context.currentTime+.001,duration=.35,volume=.1,output=context.destination){
  const shape=instrumentShape(program),start=Math.max(when,context.currentTime+.001),end=start+Math.max(.025,duration);
  const attack=Math.min(shape.attack,Math.max(.003,(end-start)*.35)),oscillator=context.createOscillator(),filter=context.createBiquadFilter(),gain=context.createGain();
  oscillator.type=shape.wave;oscillator.frequency.setValueAtTime(frequencyForMidi(note),start);
  filter.type='lowpass';filter.frequency.setValueAtTime(shape.cutoff,start);filter.Q.value=.45;
  const amplitude=clamp(volume,.015,.22);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(amplitude,start+attack);
  const decayAt=Math.min(end,start+attack+.075);if(decayAt<end)gain.gain.exponentialRampToValueAtTime(Math.max(.0002,amplitude*shape.sustain),decayAt);
  const releaseStart=Math.max(start,end-Math.min(.035,(end-start)*.2));gain.gain.setValueAtTime(Math.max(.0002,amplitude*shape.sustain),releaseStart);
  const releaseEnd=end+shape.release;gain.gain.exponentialRampToValueAtTime(.0001,releaseEnd);
  oscillator.connect(filter).connect(gain).connect(output);oscillator.start(start);oscillator.stop(releaseEnd+.01);
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
  constructor(file,{contextProvider,onUpdate=()=>{},onError=()=>{}}={}){
    this.file=file;this.events=midiPlaybackEvents(file);this.duration=midiTickToSeconds(file,file.endTick);
    const toSeconds=createTickConverter(file);
    this.outputEvents=(file.midiEvents||[]).map(event=>({...event,seconds:toSeconds(event.tick)}));
    this.drumChannels=new Set([10,...this.outputEvents.filter(e=>e.bytes[0]>>4===11&&e.bytes[1]===0&&e.bytes[2]===120).map(e=>e.channel+1)]);
    this.channels=file.channels.filter(c=>c.noteCount>0).map(c=>({...c}));
    this.enabledChannels=new Set(this.channels.map(c=>c.channel));this.programOverrides=new Map();this.contextProvider=contextProvider||(()=>new (window.AudioContext||window.webkitAudioContext)());
    this.onUpdate=onUpdate;this.onError=onError;this.output=null;this.outputUsed=false;this.context=null;this.master=null;this.position=0;this.rate=1;this.transposeSemitones=0;this.transposeEnabled=false;this.playing=false;this.anchor=0;this.cursor=0;this.timer=null;this.lastUiUpdate=0;
  }

  static SectionPlayer=class{
    constructor(file,lesson,{context,output=null,channels=[],volumes=new Map(),bpm,onError=()=>{}}){
      this.file=file;this.lesson=lesson;this.context=context;this.output=output;this.channels=new Set(channels);
      this.volumes=new Map(volumes);this.channelGains=new Map();
      this.bpm=bpm;this.onError=onError;this.timer=null;this.playing=false;this.anchor=0;this.loop=0;this.cursor=0;
      this.ticksPerSecond=file.ppq*bpm/60;
      this.drumChannels=new Set([10,...(file.midiEvents||[]).filter(e=>e.bytes[0]>>4===11&&e.bytes[1]===0&&e.bytes[2]===120).map(e=>e.channel+1)]);
      this.timeline=output
        ?(file.midiEvents||[]).filter(e=>e.tick>=lesson.sectionStartTick&&e.tick<lesson.sectionEndTick).map(e=>({...e,offset:e.tick-lesson.sectionStartTick}))
        :file.events.filter(e=>e.type==='note'&&e.tick>=lesson.sectionStartTick&&e.tick<lesson.sectionEndTick).map(e=>({...e,offset:e.tick-lesson.sectionStartTick}));
      this.master=context.createGain();this.master.gain.value=.72;this.master.connect(context.destination);
      if(!output)for(const channel of file.channels){const gain=context.createGain();gain.gain.value=(this.volumes.get(channel.channel)??100)/100;gain.connect(this.master);this.channelGains.set(channel.channel,gain);}
    };
    volumeMessage(channel,tick){let base=100;for(const event of this.file.midiEvents||[]){if(event.tick>=tick)break;if(event.channel+1===channel&&event.bytes[0]>>4===11&&event.bytes[1]===7)base=event.bytes[2];}return [0xb0+channel-1,7,Math.round(base*(this.volumes.get(channel)??100)/100)];}
    scaled(message){if(message[0]>>4===11&&message[1]===7)return [message[0],7,Math.round(message[2]*(this.volumes.get((message[0]&15)+1)??100)/100)];return message;}
    stateMessages(tick){
      const states=new Map();
      for(const event of this.file.midiEvents||[]){
        if(event.tick>=tick)break;
        const channel=event.channel+1;if(!this.channels.has(channel))continue;
        if(!states.has(channel))states.set(channel,{bank:new Map(),program:null,controls:new Map(),pitch:null,pressure:null});
        const state=states.get(channel),[status,a]=event.bytes,command=status>>4;
        if(command===11&&a<120){if(a===0||a===32)state.bank.set(a,event.bytes);else state.controls.set(a,event.bytes);}
        else if(command===12)state.program={bytes:event.bytes,bank:new Map(state.bank)};
        else if(command===14)state.pitch=event.bytes;
        else if(command===13)state.pressure=event.bytes;
      }
      const messages=[];
      for(const state of states.values()){
        if(state.program){messages.push(...state.program.bank.values(),state.program.bytes);}
        messages.push(...state.bank.values(),...state.controls.values());if(state.pitch)messages.push(state.pitch);if(state.pressure)messages.push(state.pressure);
      }
      return messages;
    }
    panic(timestamp){
      if(!this.output)return;
      for(const channel of this.file.channels.filter(c=>c.noteCount).map(c=>c.channel)){
        this.output.send([0xb0+channel-1,64,0],timestamp);this.output.send([0xb0+channel-1,120,0],timestamp);this.output.send([0xb0+channel-1,123,0],timestamp);
      }
    }
    start(delay=.32){
      this.anchor=this.context.currentTime+delay;this.loop=0;this.cursor=-1;this.playing=true;
      try{this.pump();this.timer=setInterval(()=>{try{this.pump();}catch(error){this.fail(error);}},25);}catch(error){this.fail(error);throw error;}
    }
    fail(error){try{this.stop();}catch(cleanupError){console.error('MIDI eşliği susturulamadı:',cleanupError);}this.onError(error);}
    stop(){
      this.playing=false;clearInterval(this.timer);this.timer=null;
      if(this.output){this.output.clear();this.panic();}
      for(const voice of [...activeVoices])stopVoice(this.context,voice);
    }
    setVolume(channel,volume){this.volumes.set(channel,Math.max(0,Math.min(100,Number(volume))));if(this.output)this.setChannels(this.channels,true);else{const gain=this.channelGains.get(channel);if(gain)gain.gain.value=this.volumes.get(channel)/100;}}
    setChannels(channels,force=false){
      const next=new Set(channels);if(!force&&next.size===this.channels.size&&[...next].every(channel=>this.channels.has(channel)))return;
      if(!this.playing){this.channels=next;return;}
      const elapsed=Math.max(0,(this.context.currentTime-this.anchor)*this.ticksPerSecond),length=this.lesson.sectionTicks;
      if(this.output){this.output.clear();this.panic();}
      for(const voice of [...activeVoices])stopVoice(this.context,voice);
      this.channels=next;if(this.context.currentTime<this.anchor){this.loop=0;this.cursor=-1;this.pump();return;}
      this.loop=Math.floor(elapsed/length);const offset=elapsed%length;
      this.cursor=this.timeline.findIndex(event=>event.offset>offset);
      if(this.cursor<0)this.cursor=this.timeline.length;
      if(this.output){const tick=this.lesson.sectionStartTick+offset;for(const message of this.stateMessages(tick))this.output.send(this.scaled(message));for(const channel of this.channels)this.output.send(this.volumeMessage(channel,tick));}
      this.pump();
    }
    pump(){
      if(!this.playing)return;
      const horizon=this.context.currentTime+.18,length=this.lesson.sectionTicks;
      while(true){
        const event=this.cursor<0?null:this.timeline[this.cursor],offset=this.cursor<0?0:event?.offset;
        if(offset===undefined){this.loop++;this.cursor=-1;continue;}
        const when=this.anchor+(this.loop*length+offset)/this.ticksPerSecond;if(when>horizon)break;
        const timestamp=performance.now()+Math.max(0,when-this.context.currentTime)*1000;
        if(this.cursor<0){if(this.output){if(this.loop>0)this.panic(timestamp);for(const message of this.stateMessages(this.lesson.sectionStartTick))this.output.send(this.scaled(message),timestamp);for(const channel of this.channels)if((this.volumes.get(channel)??100)!==100)this.output.send(this.volumeMessage(channel,this.lesson.sectionStartTick),timestamp);}this.cursor=0;continue;}
        this.cursor++;
        const channel=event.channel+1;if(!this.channels.has(channel))continue;
        const shift=this.drumChannels.has(channel)?0:this.lesson.transposeSemitones;
        if(this.output){
          const bytes=[...event.bytes],command=bytes[0]>>4;if(command===8||command===9||command===10){bytes[1]+=shift;if(bytes[1]<0||bytes[1]>127)throw new Error(`Kanal ${channel}: transpozisyon nota aralığını aşıyor.`);}
          this.output.send(this.scaled(bytes),timestamp);
        }else{
          const note=event.note+shift;if(note<0||note>127)throw new Error(`Kanal ${channel}: transpozisyon nota aralığını aşıyor.`);
          const duration=(Math.min(event.end,this.lesson.sectionEndTick)-event.tick)/this.ticksPerSecond;
          const output=this.channelGains.get(channel)||this.master;
          if(this.drumChannels.has(channel))scheduleDrum(this.context,output,{...event,note,channel},when,duration);
          else schedulePitched(this.context,output,{...event,note,channel},when,duration);
        }
      }
    }
  }
  snapshot(){return {position:this.position,duration:this.duration,rate:this.rate,transposeSemitones:this.transposeSemitones,transposeEnabled:this.transposeEnabled,playing:this.playing,enabledChannels:new Set(this.enabledChannels),programOverrides:new Map(this.programOverrides),channels:this.channels};}
  emit(){this.onUpdate(this.snapshot());}
  findCursor(position){const events=this.output?this.outputEvents:this.events;let low=0,high=events.length;while(low<high){const mid=(low+high)>>1;if((this.output?events[mid].seconds:events[mid].startSeconds)<position-1e-6)low=mid+1;else high=mid;}return low;}
  setOutput(output){if(this.output===output)return;this.stop();this.output=output;this.cursor=0;this.emit();}
  restoreOutputState(position){
    if(!this.output||position<=0)return;
    this.outputUsed=true;
    const states=new Map();
    for(const event of this.outputEvents){
      if(event.seconds>=position-1e-6)break;
      const channel=event.channel+1;if(!this.enabledChannels.has(channel))continue;
      if(!states.has(channel))states.set(channel,{bank:new Map(),program:null,controls:new Map(),pitch:null,pressure:null});
      const state=states.get(channel),[status,a]=event.bytes,command=status>>4;
      if(command===11&&a<120){if(a===0||a===32)state.bank.set(a,event.bytes);else state.controls.set(a,event.bytes);}
      else if(command===12)state.program={bytes:event.bytes,bank:new Map(state.bank)};
      else if(command===14)state.pitch=event.bytes;
      else if(command===13)state.pressure=event.bytes;
    }
    for(const state of states.values()){
      if(state.program){for(const message of state.program.bank.values())this.output.send(message);this.output.send(state.program.bytes);}
      for(const message of state.bank.values())this.output.send(message);
      for(const message of state.controls.values())this.output.send(message);
      if(state.pitch)this.output.send(state.pitch);if(state.pressure)this.output.send(state.pressure);
    }
  }
  currentPosition(){return this.playing&&this.context?clamp((this.context.currentTime-this.anchor)*this.rate,0,this.duration):this.position;}
  ensureAudio(){if(!this.context){this.context=this.contextProvider();this.master=this.context.createGain();this.master.gain.value=.72;this.master.connect(this.context.destination);}return this.context;}
  async play(){
    if(this.playing)return;const context=this.ensureAudio();if(context.state==='suspended')await context.resume();
    if(this.position>=this.duration)this.position=0;this.anchor=context.currentTime-this.position/this.rate;this.cursor=this.findCursor(this.position);
    this.outputUsed=!!this.output;
    try{this.restoreOutputState(this.position);this.playing=true;this.timer=setInterval(()=>{try{this.pump();}catch(error){this.fail(error);}},25);this.pump();}
    catch(error){this.fail(error);throw error;}this.emit();
  }
  fail(error){this.playing=false;clearInterval(this.timer);this.timer=null;try{this.stopVoices();}catch(cleanupError){console.error('MIDI çıkışı susturulamadı:',cleanupError);}this.emit();this.onError(error);}
  pause(){if(!this.playing)return;this.position=this.currentPosition();this.playing=false;clearInterval(this.timer);this.timer=null;this.stopVoices();this.emit();}
  stop(){if(this.playing){this.playing=false;clearInterval(this.timer);this.timer=null;}this.position=0;this.cursor=0;this.stopVoices();this.emit();}
  seek(seconds){const wasPlaying=this.playing;if(wasPlaying){this.position=this.currentPosition();this.stopVoices();}this.position=clamp(Number(seconds)||0,0,this.duration);this.cursor=this.findCursor(this.position);if(wasPlaying&&this.context){this.anchor=this.context.currentTime-this.position/this.rate;this.restoreOutputState(this.position);this.pump();}this.emit();}
  setRate(rate){const next=clamp(Number(rate)||1,.5,1.5);if(next===this.rate)return;const wasPlaying=this.playing;if(wasPlaying){this.position=this.currentPosition();this.stopVoices();}this.rate=next;this.cursor=this.findCursor(this.position);if(wasPlaying&&this.context){this.anchor=this.context.currentTime-this.position/this.rate;this.restoreOutputState(this.position);this.pump();}this.emit();}
  refreshPlayback(){if(this.playing&&this.context){this.position=this.currentPosition();this.stopVoices();this.anchor=this.context.currentTime-this.position/this.rate;this.cursor=this.findCursor(this.position);this.restoreOutputState(this.position);this.pump();}this.emit();}
  setTransposeSemitones(semitones){this.transposeSemitones=clamp(Math.round(Number(semitones)||0),-12,12);this.refreshPlayback();}
  setTransposeEnabled(enabled){this.transposeEnabled=Boolean(enabled);this.refreshPlayback();}
  setChannelEnabled(channel,enabled){const value=Number(channel);if(enabled)this.enabledChannels.add(value);else{this.enabledChannels.delete(value);if(this.context&&!this.output)for(const voice of [...activeVoices])if(voice.channel===value)stopVoice(this.context,voice);}if(this.output)this.refreshPlayback();else this.emit();}
  programFor(channel,sourceProgram=null){const value=Number(channel);if(this.programOverrides.has(value))return this.programOverrides.get(value);return sourceProgram??this.channels.find(c=>c.channel===value)?.program??0;}
  setChannelProgram(channel,program){const value=Number(channel);if(program===null||program==='')this.programOverrides.delete(value);else this.programOverrides.set(value,clamp(Math.round(Number(program)||0),0,127));if(this.context)for(const voice of [...activeVoices])if(voice.channel===value)stopVoice(this.context,voice);this.emit();}
  soloChannel(channel){this.selectChannels([Number(channel)]);}
  selectChannels(channels){this.enabledChannels=new Set(channels.map(Number));if(this.output){this.refreshPlayback();return;}if(this.context)for(const voice of [...activeVoices])if(!this.enabledChannels.has(voice.channel))stopVoice(this.context,voice);this.emit();}
  stopVoices(){if(this.output&&this.outputUsed){this.outputUsed=false;this.output.clear();for(const {channel} of this.channels){this.output.send([0xb0+channel-1,64,0]);this.output.send([0xb0+channel-1,120,0]);this.output.send([0xb0+channel-1,123,0]);}}if(!this.context)return;for(const voice of [...activeVoices])stopVoice(this.context,voice);}
  pump(){
    if(!this.playing||!this.context)return;const context=this.context;this.position=this.currentPosition();
    const horizon=context.currentTime+.18;
    if(this.output){
      this.outputUsed=true;
      while(this.cursor<this.outputEvents.length){
        const event=this.outputEvents[this.cursor],when=this.anchor+event.seconds/this.rate;if(when>horizon)break;this.cursor++;
        if(!this.enabledChannels.has(event.channel+1))continue;
        const bytes=[...event.bytes],command=bytes[0]>>4,channel=event.channel+1;
        if((command===8||command===9)&&this.transposeEnabled&&!this.drumChannels.has(channel)){bytes[1]+=this.transposeSemitones;if(bytes[1]<0||bytes[1]>127)continue;}
        this.output.send(bytes,performance.now()+Math.max(0,when-context.currentTime)*1000);
      }
      if(this.position>=this.duration){this.playing=false;clearInterval(this.timer);this.timer=null;this.position=this.duration;this.stopVoices();this.emit();return;}
      const now=performance.now();if(now-this.lastUiUpdate>65){this.lastUiUpdate=now;this.emit();}return;
    }
    while(this.cursor<this.events.length){
      const event=this.events[this.cursor],when=this.anchor+event.startSeconds/this.rate;if(when>horizon)break;this.cursor++;
      if(!this.enabledChannels.has(event.channel))continue;
      const end=this.anchor+event.endSeconds/this.rate,start=Math.max(when,context.currentTime+.001),duration=end-start;
      if(duration<=.015)continue;
      if(event.channel===10&&!this.programOverrides.has(10))scheduleDrum(context,this.master,event,start,duration);else{const note=midiPlaybackNote(event.note,event.channel,this.transposeSemitones,this.transposeEnabled);schedulePitched(context,this.master,{...event,note,program:this.programFor(event.channel,event.program)},start,duration);}
    }
    if(this.position>=this.duration){this.playing=false;clearInterval(this.timer);this.timer=null;this.position=this.duration;this.stopVoices();this.emit();return;}
    const now=performance.now();if(now-this.lastUiUpdate>65){this.lastUiUpdate=now;this.emit();}
  }
  dispose(){this.stop();this.onUpdate=()=>{};}
}

export const MidiSectionPlayer=MidiFilePlayer.SectionPlayer;
