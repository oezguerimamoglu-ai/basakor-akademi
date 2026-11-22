import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';

// Minimal DOM smoke test: çalıştırma/başlat/durdur ve MIDI veri yolu bir tarayıcı olmadan doğrulanır.
class MockElement{
  constructor(id=''){this.id=id;this.value='';this.disabled=false;this.dataset={};this.children=[];this.events={};this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};this.textContent='';this.innerHTML='';this.attributes={};}
  addEventListener(name,callback){this.events[name]=callback}
  appendChild(node){this.children.push(node);return node}
  setAttribute(k,v){this.attributes[k]=v}
  querySelectorAll(){return []}
  get outerHTML(){return `<option value="${this.value}">${this.textContent}</option>`}
}
const ids='statusPill levelTag lesson tempoValue bpm sync demo strict play stop tap sourceHint meterTag measure measureProgress actionType actionNote actionDetail lessonDescription grouping beats feedback pads keyboard success mistakes accuracy progressFill completedMessage reset midiStatus connect device channel maxnote midiLast clockStatus instructions'.split(' ');
const nodes=Object.fromEntries(ids.map(id=>[id,new MockElement(id)]));
nodes.maxnote.value='83';nodes.channel.value='all';nodes.sync.value='app';
globalThis.document={getElementById:id=>nodes[id]||null,querySelectorAll:()=>[],createElement:()=>new MockElement(),addEventListener(){},hidden:false};
globalThis.window={AudioContext:class{currentTime=0;resume(){return Promise.resolve()}},addEventListener(){},confirm:()=>true};
globalThis.localStorage={getItem:()=>null,setItem(){}};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});globalThis.location={protocol:'file:'};
globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
await import('./app.mjs?test-ui');
test('UI initializes and populates seven lessons and MIDI channels',()=>{
  assert.equal(nodes.lesson.children.length,7);assert.equal(nodes.channel.children.length,16);
  assert.match(nodes.beats.innerHTML,/beat-0/);assert.match(nodes.pads.innerHTML,/Em/);
  assert.equal(window.basakorDebug.getState().lesson,'em-44');
});
test('start, simulated MIDI bass, stop, next lesson',async()=>{
  await nodes.play.events.click();assert.equal(window.basakorDebug.getState().playing,true);
  await sleep(342);window.basakorDebug.simulateMidi([0x90,40,100]);await sleep(155);
  assert.equal(window.basakorDebug.getState().hits,1,'MIDI bass E2 must be recognized');
  await sleep(740);
  window.basakorDebug.simulateMidi([0x90,64,100]);
  window.basakorDebug.simulateMidi([0x90,67,100]);
  window.basakorDebug.simulateMidi([0x90,71,100]);
  await sleep(155);
  assert.equal(window.basakorDebug.getState().hits,2,'MIDI Em chord E4/G4/B4 must be recognized');
  nodes.stop.events.click();assert.equal(window.basakorDebug.getState().playing,false);
  nodes.lesson.value='em-98';nodes.lesson.events.change({target:nodes.lesson});
  assert.equal(window.basakorDebug.getState().lesson,'em-98');assert.match(nodes.meterTag.textContent,/9\/8/);
});
test('separate Pa4X KEYBOARD note port and SOUND MIDI Clock port',async()=>{
  const keyboard={id:'kbd',name:'Pa4X KEYBOARD',onmidimessage:null};
  const sound={id:'snd',name:'Pa4X SOUND',onmidimessage:null};
  navigator.requestMIDIAccess=async()=>({inputs:new Map([[keyboard.id,keyboard],[sound.id,sound]]),onstatechange:null});
  await nodes.connect.events.click();
  assert.equal(nodes.device.value,'kbd');
  assert.equal(typeof keyboard.onmidimessage,'function');assert.equal(typeof sound.onmidimessage,'function');
  const before=nodes.midiLast.textContent;
  sound.onmidimessage({data:new Uint8Array([0x90,40,90])});
  assert.equal(nodes.midiLast.textContent,before,'unselected note port must not score notes');
  keyboard.onmidimessage({data:new Uint8Array([0x90,40,90])});
  assert.match(nodes.midiLast.textContent,/Mi2/);
  nodes.sync.value='clock';nodes.sync.events.change();await nodes.play.events.click();
  sound.onmidimessage({data:new Uint8Array([0xfa])});sound.onmidimessage({data:new Uint8Array([0xf8])});
  assert.match(nodes.clockStatus.textContent,/Pa4X Clock/,'clock from second port must be detected');
  sound.onmidimessage({data:new Uint8Array([0xfc])});nodes.stop.events.click();
});
