import test from 'node:test';
import assert from 'node:assert/strict';
import {createJSpaceClock} from '../../components/kairo/jspace-clock.mjs';

function fixture(){
 let now=Date.parse('2026-09-25T12:00:00Z'),id=0,visible=true;const timers=new Map(),ticks=[];
 const schedule=(fn,delay,period=0)=>{timers.set(++id,{fn,at:now+delay,period});return id;};
 const clock=createJSpaceClock({onTick:value=>ticks.push(value),readNow:()=>now,isVisible:()=>visible,setRepeating:(fn,delay)=>schedule(fn,delay,delay),clearRepeating:key=>timers.delete(key),setDeadline:(fn,delay)=>schedule(fn,delay),clearDeadline:key=>timers.delete(key)});
 function advance(amount){const target=now+amount;while(true){const next=[...timers].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);if(next[1].period)timers.set(next[0],{...next[1],at:now+next[1].period});next[1].fn();}now=target;}
 return {clock,ticks,timers,advance,now:()=>now,setWallTime:value=>{now=value;},hide:()=>{visible=false;},show:()=>{visible=true;clock.visible();}};
}
test('continuous scene refreshes publish current time without postponing the independent age cadence',()=>{
 const f=fixture(),start=f.now();f.clock.refresh([]);
 f.advance(10000);f.clock.refresh([]);f.advance(10000);f.clock.refresh([]);
 f.advance(10000);assert.ok(f.ticks.includes(start+30000),'30-second age tick survives updates at 10 and 20 seconds');
 f.advance(5000);f.clock.refresh([]);assert.equal(f.ticks.at(-1),start+35000,'new snapshot refreshes now immediately');
 f.clock.close();assert.equal(f.timers.size,0);
});
test('report expiry retains its absolute deadline across frequent updates and visibility resumes immediately',()=>{
 const f=fixture(),start=f.now(),report={expires_at:new Date(start+45000).toISOString()};f.clock.refresh([report]);
 f.advance(40000);f.clock.refresh([report]);f.advance(5010);assert.equal(f.ticks.at(-1),start+45010);
 f.hide();const count=f.ticks.length;f.advance(90000);f.clock.refresh([{expires_at:new Date(f.now()-1000).toISOString()}]);assert.equal(f.ticks.length,count);
 f.show();assert.equal(f.ticks.at(-1),f.now());f.clock.close();assert.equal(f.timers.size,0);
});
test('a snapshot that already rendered current time does not publish a redundant tick or postpone age cadence',()=>{
 const f=fixture(),start=f.now();f.clock.refresh([],f.now());assert.deepEqual(f.ticks,[]);
 f.advance(10000);f.clock.refresh([],f.now());f.advance(10000);f.clock.refresh([],f.now());assert.deepEqual(f.ticks,[]);
 f.advance(10000);assert.deepEqual(f.ticks,[start+30000]);f.clock.close();assert.equal(f.timers.size,0);
});
test('rendered refreshes keep absolute deadlines and retire records already consumed at render time',()=>{
 const f=fixture(),start=f.now(),report={expires_at:new Date(start+45000).toISOString()};f.clock.refresh([report],f.now());
 f.advance(40000);f.clock.refresh([report],f.now());f.advance(5009);assert.equal(f.ticks.at(-1),start+30000);
 f.advance(1);assert.equal(f.ticks.at(-1),start+45010);
 f.clock.refresh([report],f.now());assert.equal([...f.timers.values()].filter(timer=>!timer.period).length,0);f.clock.close();
});
test('an expiry crossing the render-to-effect gap triggers an immediate freshness tick',()=>{
 const f=fixture(),start=f.now(),renderedAt=f.now(),report={expires_at:new Date(start+5).toISOString()};
 f.advance(20);f.clock.refresh([report],renderedAt);assert.deepEqual(f.ticks,[]);
 f.advance(1);assert.deepEqual(f.ticks,[start+21]);assert.equal([...f.timers.values()].filter(timer=>!timer.period).length,0);f.clock.close();
});
test('the latest complete record set replaces old deadlines even without a tick',()=>{
 const f=fixture(),start=f.now();f.clock.refresh([{expires_at:new Date(start+20000).toISOString()}],f.now());
 f.advance(1000);f.clock.refresh([{expires_at:new Date(start+5000).toISOString()}],f.now());
 f.advance(4010);assert.deepEqual(f.ticks,[start+5010]);
 f.clock.refresh([],f.now());f.advance(20000);assert.equal(f.ticks.length,1);f.clock.close();
});
test('rendered refreshes while hidden clear deadlines and visibility publishes actual wall time',()=>{
 const f=fixture(),start=f.now(),report={expires_at:new Date(start+45000).toISOString()};f.clock.refresh([report],f.now());f.hide();
 f.clock.refresh([report],f.now());assert.equal([...f.timers.values()].filter(timer=>!timer.period).length,0);
 f.advance(90000);assert.deepEqual(f.ticks,[]);f.show();assert.deepEqual(f.ticks,[start+90000]);
 f.clock.close();f.clock.refresh([report],f.now());f.clock.visible();assert.equal(f.timers.size,0);assert.equal(f.ticks.length,1);
});
test('legacy or invalid rendered times still publish immediately and wall-clock rollback remains observable',()=>{
 const f=fixture(),start=f.now();f.clock.refresh([],NaN);f.advance(1000);f.clock.refresh([],Infinity);
 f.setWallTime(start-1000);f.clock.refresh([]);assert.deepEqual(f.ticks,[start,start+1000,start-1000]);
 f.clock.refresh([{expires_at:new Date(start+1000).toISOString()}],start+2000);assert.equal(f.ticks.at(-1),start-1000,'a rollback after rendering is published immediately');
 f.advance(2010);assert.equal(f.ticks.at(-1),start+1010);f.clock.close();
});
