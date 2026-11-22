import test from 'node:test';
import assert from 'node:assert/strict';
import {LESSONS,getLesson,getSteps,matchEvent,msPerStep,nearestStep,timingGrade,currentEvent,countableEvents} from './music.mjs';
import {parseMidiFile,suggestedChannels,buildMidiLesson,tempoAt,meterAt} from './midi-file.mjs';
import {MidiFilePlayer,midiTickToSeconds,midiPlaybackEvents} from './midi-player.mjs';

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
test('MIDI player follows tempo changes and supports channel selection and instrument overrides',()=>{const file=parseMidiFile(midiFixture());file.tempoMap.push({tick:96,bpm:60});assert.equal(midiTickToSeconds(file,384),3.5);const events=midiPlaybackEvents(file);assert.equal(events[0].startSeconds,0);assert.equal(events.find(e=>e.channel===5).startSeconds,.5);const player=new MidiFilePlayer(file,{contextProvider:()=>{throw new Error('Audio context must start only after a user gesture.')}});assert.equal(player.snapshot().enabledChannels.size,2);assert.equal(player.programFor(5,4),4);player.setChannelProgram(5,73);assert.equal(player.programFor(5,4),73);assert.equal(player.snapshot().programOverrides.get(5),73);player.setChannelProgram(5,null);assert.equal(player.programFor(5,4),4);player.soloChannel(5);assert.deepEqual([...player.snapshot().enabledChannels],[5]);player.selectChannels([2]);assert.deepEqual([...player.snapshot().enabledChannels],[2]);player.setChannelEnabled(2,false);assert.equal(player.snapshot().enabledChannels.size,0);});
test('combined bass and piano chord require both hands',()=>{const expected={kind:'combo',bassMidi:[40],chordMidi:[64,67,71]};assert.equal(matchEvent(expected,[40,64,67,71]).ok,true);assert.equal(matchEvent(expected,[40,64,67]).ok,false);assert.equal(matchEvent(expected,[41,64,67,71]).ok,false);});
