import test from 'node:test';
import assert from 'node:assert/strict';
import {createJSpaceClock} from '../../components/kairo/jspace-clock.mjs';

function fixture(){
 let now=Date.parse('2026-09-25T12:00:00Z'),id=0,visible=true;const timers=new Map(),ticks=[];
 const schedule=(fn,delay,period=0)=>{timers.set(++id,{fn,at:now+delay,period});return id;};
 const clock=createJSpaceClock({onTick:value=>ticks.push(value),readNow:()=>now,isVisible:()=>visible,setRepeating:(fn,delay)=>schedule(fn,delay,delay),clearRepeating:key=>timers.delete(key),setDeadline:(fn,delay)=>schedule(fn,delay),clearDeadline:key=>timers.delete(key)});
 function advance(amount){const target=now+amount;while(true){const next=[...timers].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);if(next[1].period)timers.set(next[0],{...next[1],at:now+next[1].period});next[1].fn();}now=target;}
 return {clock,ticks,timers,advance,now:()=>now,hide:()=>{visible=false;},show:()=>{visible=true;clock.visible();}};
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
