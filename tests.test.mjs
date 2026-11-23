import test from 'node:test';
import assert from 'node:assert/strict';
import {LESSONS,getLesson,getSteps,matchEvent,msPerStep,nearestStep,timingGrade,currentEvent,countableEvents} from './music.mjs';
import {parseMidiFile,suggestedChannels,buildMidiLesson,buildMidiSectionLesson,styleSections,tempoAt,meterAt,GM_INSTRUMENTS} from './midi-file.mjs';
import {MidiFilePlayer,MidiSectionPlayer,midiTickToSeconds,midiPlaybackEvents,midiPlaybackNote} from './midi-player.mjs';

function vlq(value){let buffer=value&0x7f;while((value>>=7)){buffer<<=8;buffer|=(value&0x7f)|0x80;}const out=[];while(true){out.push(buffer&255);if(buffer&0x80)buffer>>=8;else break;}return out;}
function midiFixture(){
  const track=[0,0xff,0x03,4,84,69,83,84,0,0xff,0x58,4,4,2,24,8,0,0xff,0x51,3,7,0xa1,0x20,
    0,0xc1,33,0,0x91,40,100,...vlq(96),0x81,40,0,
    0,0xc4,4,0,0x94,60,100,0,0x94,64,100,0,0x94,67,100,
    ...vlq(96),0x84,60,0,0,0x84,64,0,0,0x84,67,0,
    ...vlq(192),0xff,0x2f,0];
  return new Uint8Array([...Array.from('MThd',c=>c.charCodeAt(0)),0,0,0,6,0,0,0,1,0,96,
    ...Array.from('MTrk',c=>c.charCodeAt(0)),(track.length>>>24)&255,(track.length>>>16)&255,(track.length>>>8)&255,track.length&255,...track]);
}
test('all lesson meters and groupings agree',()=>{for(const l of LESSONS){assert.equal(l.steps.length,l.grouping.reduce((a,b)=>a+b,0),l.id);if(l.alternate)assert.equal(l.alternate.length,l.steps.length);assert.ok(l.steps.some(e=>e.kind==='bass'));assert.ok(l.steps.some(e=>e.kind==='chord'));}});
test('first measure left-hand bass and right-hand chord',()=>{const l=getLesson('em-44');assert.deepEqual(l.steps.map(x=>x.kind),['bass','chord','bass','chord']);assert.deepEqual(l.steps[0].midi,[40]);assert.deepEqual(l.steps[1].midi,[64,67,71]);assert.equal(countableEvents(l,2),8)});
test('alternating chords depend on measure',()=>{const l=getLesson('em-am');assert.equal(getSteps(l,0)[2].label,'Em');assert.equal(getSteps(l,1)[2].label,'Am');assert.equal(currentEvent(l,l.steps.length+2).label,'Am');});
test('chord recognition matches inversion and disallows incomplete chords',()=>{const e=getLesson('em-44').steps[1];assert.equal(matchEvent(e,[59,52,55]).ok,true);assert.equal(matchEvent(e,[64,67,71]).ok,true);assert.equal(matchEvent(e,[52,55]).ok,false);assert.equal(matchEvent(e,[52,55,58]).ok,false)});
test('B7 requires seventh pitch class',()=>{const e=getLesson('em-b7').alternate[2];assert.equal(matchEvent(e,[47,51,54,57]).ok,true);assert.equal(matchEvent(e,[47,51,54]).ok,false)});
test('bass octave rule optional',()=>{const e=getLesson('em-44').steps[0];assert.equal(matchEvent(e,[52]).ok,true);assert.equal(matchEvent(e,[40],{strictBassOctave:true}).ok,true);assert.equal(matchEvent(e,[52],{strictBassOctave:true}).ok,false);assert.equal(matchEvent(e,[64],{strictBassOctave:true}).ok,false);assert.equal(matchEvent(e,[40,44]).ok,false)});
test('9/8 unit is eighth note, 4/4 unit is quarter',()=>{assert.equal(msPerStep(60,4),1000);assert.equal(msPerStep(60,8),500)});
test('expanded catalog has 14 patterns and a moving bass line',()=>{assert.equal(LESSONS.length,14);const walk=getLesson('em-44-walk');assert.equal(walk.steps.length,8);assert.ok(new Set(walk.steps.filter(s=>s.kind==='bass').map(s=>s.midi[0])).size>=5);assert.equal(getLesson('em-98-reverse').grouping.join('+'),'3+2+2+2');assert.equal(getLesson('em-128').steps.length,12);});
test('nearest beat and grade',()=>{const r=nearestStep({eventMs:2090,originMs:1000,stepMs:500,stepsPerMeasure:4});assert.equal(r.absolute,2);assert.equal(r.step,2);assert.ok(Math.abs(r.deviationMs-90)<.001);assert.equal(timingGrade(r.deviationMs,500),'perfect');assert.equal(timingGrade(210,500),'off');});
test('SMF analyzer separates channels and prepares an E-centered practice loop',()=>{
  const file=parseMidiFile(midiFixture());assert.equal(file.format,0);assert.equal(file.trackCount,1);assert.equal(file.ppq,96);assert.equal(tempoAt(file),120);assert.deepEqual([meterAt(file).numerator,meterAt(file).denominator],[4,4]);
  const roles=suggestedChannels(file);assert.equal(roles.bass,2);assert.equal(roles.chord,5);assert.equal(roles.hasActivePiano,true);
  const lesson=buildMidiLesson(file,{bassChannel:2,chordChannel:5,sourceKey:0,targetKey:4,startBar:1,barCount:1});assert.equal(lesson.transposeSemitones,4);assert.equal(lesson.steps.length,16);assert.equal(lesson.songCycle.length,1);assert.deepEqual(lesson.steps[0].midi,[44]);assert.equal(lesson.steps[4].kind,'chord');assert.deepEqual(lesson.steps[4].midi,[64,68,71]);
});
test('MIDI lesson preparation rejects changing time signatures',()=>{const file=parseMidiFile(midiFixture());file.meterMap.push({tick:384,numerator:3,denominator:4});assert.throws(()=>buildMidiLesson(file,{bassChannel:2,chordChannel:5}),/ölçü işareti değişiyor/i);});
test('MIDI player follows tempo changes and supports channel selection, instrument overrides, and transposition',()=>{const file=parseMidiFile(midiFixture());file.tempoMap.push({tick:96,bpm:60});assert.equal(midiTickToSeconds(file,384),3.5);const events=midiPlaybackEvents(file);assert.equal(events[0].startSeconds,0);assert.equal(events.find(e=>e.channel===5).startSeconds,.5);const player=new MidiFilePlayer(file,{contextProvider:()=>{throw new Error('Audio context must start only after a user gesture.')}});assert.equal(player.snapshot().enabledChannels.size,2);assert.equal(player.programFor(5,4),4);player.setChannelProgram(5,73);assert.equal(player.programFor(5,4),73);assert.equal(player.snapshot().programOverrides.get(5),73);player.setChannelProgram(5,null);assert.equal(player.programFor(5,4),4);player.setTransposeSemitones(5);player.setTransposeEnabled(true);assert.equal(player.snapshot().transposeEnabled,true);assert.equal(midiPlaybackNote(40,2,5,true),45);assert.equal(midiPlaybackNote(36,10,5,true),36,'percussion channel stays unchanged');player.setTransposeEnabled(false);assert.equal(midiPlaybackNote(40,2,5,false),40);player.soloChannel(5);assert.deepEqual([...player.snapshot().enabledChannels],[5]);player.selectChannels([2]);assert.deepEqual([...player.snapshot().enabledChannels],[2]);player.setChannelEnabled(2,false);assert.equal(player.snapshot().enabledChannels.size,0);});
test('MIDI output preserves channel messages, drum notes, and cancels queued playback',async()=>{
  const track=[0,0xb1,0,121,0,0xb1,32,65,0,0xc1,8,0,0xb1,11,100,0,0xe1,0,64,
    0,0xba,0,120,0,0xba,32,64,0,0xca,1,0,0x91,40,90,0,0x9a,36,95,
    ...vlq(96),0x81,40,0,0,0x8a,36,0,...vlq(96),0xff,0x2f,0];
  const bytes=new Uint8Array([...Array.from('MThd',c=>c.charCodeAt(0)),0,0,0,6,0,0,0,1,0,96,
    ...Array.from('MTrk',c=>c.charCodeAt(0)),0,0,0,track.length,...track]);
  const file=parseMidiFile(bytes),sent=[],output={send:message=>sent.push([...message]),clear(){sent.push('clear');}};
  const context={currentTime:0,state:'running',destination:{},createGain:()=>({gain:{},connect(){}})};
  const player=new MidiFilePlayer(file,{contextProvider:()=>context});player.setOutput(output);player.setTransposeSemitones(5);player.setTransposeEnabled(true);
  await player.play();
  assert.ok(sent.some(m=>Array.isArray(m)&&m.join(',')==='177,0,121'));
  assert.ok(sent.some(m=>Array.isArray(m)&&m.join(',')==='177,32,65'));
  assert.ok(sent.some(m=>Array.isArray(m)&&m.join(',')==='193,8'));
  assert.ok(sent.some(m=>Array.isArray(m)&&m.join(',')==='225,0,64'));
  assert.ok(sent.some(m=>Array.isArray(m)&&m.join(',')==='145,45,90'));
  assert.ok(sent.some(m=>Array.isArray(m)&&m.join(',')==='154,36,95'),'Korg drum channel 11 is not transposed');
  context.currentTime=.5;player.pump();
  assert.ok(sent.some(m=>Array.isArray(m)&&m.join(',')==='129,45,0'),'transposed notes receive the matching note-off');
  assert.ok(sent.some(m=>Array.isArray(m)&&m.join(',')==='138,36,0'));
  player.pause();assert.ok(sent.includes('clear'));assert.ok(sent.some(m=>Array.isArray(m)&&m.join(',')==='186,120,0'));
  sent.length=0;player.seek(.25);await player.play();
  assert.ok(sent.some(m=>Array.isArray(m)&&m.join(',')==='177,0,121'),'seek restores the bank');
  assert.ok(sent.some(m=>Array.isArray(m)&&m.join(',')==='193,8'),'seek restores the program');
  assert.ok(sent.some(m=>Array.isArray(m)&&m.join(',')==='177,11,100'),'seek restores controllers');
  player.stop();
});
test('style markers include intro and variations and section lessons retain fast note onsets',()=>{
  const file=parseMidiFile(midiFixture());
  file.events.push({type:'marker',text:'i1cv1',tick:0},{type:'marker',text:'v1cv2',tick:384});
  file.endTick=768;file.channels.find(c=>c.channel===2).notes.push({type:'note',channel:1,note:41,tick:20,end:30,velocity:90},{type:'note',channel:1,note:43,tick:40,end:50,velocity:90});
  const sections=styleSections(file);assert.deepEqual(sections.map(s=>s.label),['Intro 1 · CV 1','Variation 1 · CV 2']);
  const lesson=buildMidiSectionLesson(file,{section:sections[0],bassChannel:2,chordChannel:5,sourceKey:0,targetKey:2});
  assert.deepEqual(lesson.performanceEvents.filter(e=>e.kind==='bass').map(e=>[e.tick,e.midi[0]]),[[0,42],[20,43],[40,45]]);
  assert.deepEqual(lesson.performanceEvents.find(e=>e.kind==='chord').midi,[62,66,69]);
  file.tempoMap.push({tick:96,bpm:90});assert.throws(()=>buildMidiSectionLesson(file,{section:sections[0],bassChannel:2}),/tempo değişiyor/);
});
test('section accompaniment loops at lesson tempo, transposes, and applies channel mute and volume',()=>{
  const file=parseMidiFile(midiFixture()),section={label:'Intro 1',startTick:0,endTick:384};
  const lesson=buildMidiSectionLesson(file,{section,bassChannel:2,chordChannel:5,sourceKey:0,targetKey:2});
  const sent=[],output={send:message=>sent.push([...message]),clear(){sent.push('clear');}},context={currentTime:0,destination:{},createGain:()=>({gain:{},connect(){}})};
  const player=new MidiSectionPlayer(file,lesson,{context,output,channels:[2,5],bpm:120});player.start(0);
  assert.ok(sent.some(m=>Array.isArray(m)&&m.join(',')==='145,42,100'));
  player.setVolume(2,50);assert.ok(sent.some(m=>Array.isArray(m)&&m.join(',')==='177,7,50'));
  player.setChannels([5]);assert.ok(sent.includes('clear'));
  sent.length=0;context.currentTime=2.4;player.pump();
  assert.ok(sent.some(m=>Array.isArray(m)&&m[0]===148),'next loop schedules selected chord channel');
  assert.ok(!sent.some(m=>Array.isArray(m)&&m[0]===145),'muted bass stays muted on the next loop');
  player.stop();assert.ok(sent.includes('clear'));
});
test('the shared instrument list contains all 128 General MIDI programs',()=>{assert.equal(GM_INSTRUMENTS.length,128);assert.equal(GM_INSTRUMENTS[0],'Piyano');assert.equal(GM_INSTRUMENTS[127],'Silah sesi');});
test('combined bass and piano chord require both hands',()=>{const expected={kind:'combo',bassMidi:[40],chordMidi:[64,67,71]};assert.equal(matchEvent(expected,[40,64,67,71]).ok,true);assert.equal(matchEvent(expected,[40,64,67]).ok,false);assert.equal(matchEvent(expected,[41,64,67,71]).ok,false);});
