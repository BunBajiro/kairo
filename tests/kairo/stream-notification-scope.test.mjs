import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createBus} from '../../server/bus.mjs';
import {createStream,defaultStream} from '../../server/stream.mjs';

function fixture(t,{characterId=0,delay=0}={}){
 t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.parse('2026-10-13T16:00:00Z')});
 const settings=new Map(),store={get:(key,fallback)=>settings.get(key)??fallback,set:(key,value)=>settings.set(key,value)};
 const stream=createStream(store,createBus()),messages=[],response=new EventEmitter();
 response.write=chunk=>{messages.push(chunk.toString());return true;};response.end=()=>response.emit('finish');
 t.after(()=>stream.close());
 const config=defaultStream();Object.assign(config.rules.find(rule=>rule.event==='skill.completed'),{enabled:true,characterId,delay,cooldown:0});
 stream.save(config);stream.connect(response);
 return {stream,messages,setPilot(characterId){const config=stream.config();config.rules.find(rule=>rule.event==='skill.completed').characterId=characterId;stream.save(config);},emit(characterId){return stream.emit({type:'skill.completed',characterId,payload:{skill_name:'Pilot '+characterId+' skill',level:5}});}};
}

test('saved pilot filter removes visible toasts for other pilots and retains matching notifications',t=>{
 const f=fixture(t);f.emit(42);f.emit(43);
 assert.equal(f.stream.state().toasts.length,2);
 f.setPilot(43);
 assert.deepEqual(f.stream.state().toasts.map(toast=>toast.message),['Pilot 43 skill trained to level 5.']);
 assert.deepEqual(JSON.parse(f.messages.at(-1).split('data: ')[1]).toasts.map(toast=>toast.message),['Pilot 43 skill trained to level 5.'],'connected renderers receive the filtered current state immediately');
 assert.equal(f.emit(42),false);assert.equal(f.emit(43),true);
});

test('a delayed toast cannot publish after its pilot is excluded by a saved rule',t=>{
 const f=fixture(t,{characterId:42,delay:2});assert.equal(f.emit(42),true);
 f.setPilot(43);assert.equal(f.emit(43),true);f.messages.length=0;
 t.mock.timers.tick(2000);
 const delivered=f.messages.filter(frame=>frame.startsWith('event: toast\n')).map(frame=>JSON.parse(frame.split('data: ')[1]));
 assert.deepEqual(delivered.map(toast=>toast.message),['Pilot 43 skill trained to level 5.']);
 assert.deepEqual(f.stream.state().toasts.map(toast=>toast.message),['Pilot 43 skill trained to level 5.']);
});

test('removing a pilot restriction keeps queued matching events and explicit test previews',t=>{
 const f=fixture(t,{characterId:42,delay:2});f.emit(42);
 f.setPilot(0);assert.equal(f.emit(43),true);assert.equal(f.stream.emit('skill.completed',true),true);
 f.setPilot(42);t.mock.timers.tick(2000);
 assert.deepEqual(f.stream.state().toasts.map(toast=>toast.message),['Pilot 42 skill trained to level 5.','Heavy Assault Cruisers trained to level V.']);
});

test('saving an unchanged pilot scope preserves the queued toast and its original delivery time',t=>{
 const f=fixture(t,{characterId:42,delay:2});f.emit(42);t.mock.timers.tick(1000);
 f.setPilot(42);assert.equal(f.stream.state().toasts.length,0);t.mock.timers.tick(1000);
 assert.deepEqual(f.stream.state().toasts.map(toast=>toast.message),['Pilot 42 skill trained to level 5.']);
});

test('allowing a previously excluded pilot again cannot resurrect a removed delayed toast',t=>{
 const f=fixture(t,{characterId:42,delay:2});f.emit(42);f.setPilot(43);f.setPilot(42);f.messages.length=0;
 t.mock.timers.tick(2000);
 assert.deepEqual(f.stream.state().toasts,[]);
 assert.equal(f.messages.some(frame=>frame.startsWith('event: toast\n')),false);
 assert.equal(f.emit(42),true);t.mock.timers.tick(2000);
 assert.deepEqual(f.stream.state().toasts.map(toast=>toast.message),['Pilot 42 skill trained to level 5.']);
});
