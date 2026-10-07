// Deterministic replay work diagnostic, no host elapsed/CPU or browser claims.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const repo=resolve(process.env.KAIRO_BENCH_REPO||'../kairo-rc17-completion');
const modulePath=join(repo,'components/kairo/session-replay-timeline.mjs');
const {prepareReplayTimeline}=await import(pathToFileURL(modulePath));
const epoch=Date.parse('2026-10-07T00:00:00Z'),iso=t=>new Date(epoch+t).toISOString(),hash=s=>createHash('sha256').update(s).digest('hex');
const result={kind:'deterministic-row-timestamp-read-counts',node:process.version,harnessSha256:hash(readFileSync(new URL(import.meta.url))),sourceSha256:hash(readFileSync(modulePath)),measurements:[],limits:['Timestamp getter reads are actual property accesses, not total operations or CPU costs. Private numeric tree/prefix-array accesses are not included.','No host timing, preparation-cost, retained-memory or compiled-browser acceptance claim.']};
for(const [visitCount,geography,eventCount] of [[1000,11,200],[1000,1000,10000],[4000,4000,10000]]){
 const data={startedAt:iso(0),endedAt:iso(visitCount*60000),visits:Array.from({length:visitCount},(_,i)=>({id:i,systemId:i%geography,entered:iso(i*60000),exited:iso((i+1)*60000)})),events:Array.from({length:eventCount},(_,i)=>({id:i,type:'ship.changed',at:iso(i/eventCount*visitCount*60000)})),travel:Array.from({length:visitCount-1},(_,i)=>({id:i,at:iso((i+1)*60000)})),coverage:{gaps:[]}};
 const old=prepareReplayTimeline(data),current=prepareReplayTimeline(data);let oldReads=0,currentReads=0,oldDateParses=0,oldTotal=0,currentTotal=0;
 for(const [timeline,add] of [[old,()=>oldReads++],[current,()=>currentReads++]])for(const row of [...timeline.visits,...timeline.events])for(const key of ['start','end','time'])if(key in row){const value=row[key];Object.defineProperty(row,key,{get(){add();return value;}});}
 const times=Array.from({length:1201},(_,i)=>epoch+i*100*60).concat([epoch+visitCount*60000,epoch+2000,epoch+visitCount*30000,epoch]);
 for(const time of times){
  oldReads=0;currentReads=0;
  const baseline={currentVisit:[...old.visits].reverse().find(v=>v.start<=time&&(time<v.end||time===v.end&&time===old.end))||null,nextVisit:old.visits.find(v=>v.start>time)||null,previousVisit:[...old.visits].reverse().find(v=>v.start<time-1000)||null,recentEvents:old.events.filter(e=>e.time<=time).slice(-5).reverse(),previousEvent:[...old.events].reverse().find(e=>e.time<time),nextEvent:old.events.find(e=>e.time>time),trailSystemIds:[...new Set(old.visits.filter(v=>v.start<=time).map(v=>v.systemId))],travel:data.travel.filter(t=>{oldDateParses++;return Date.parse(t.at)<=time;}),gap:null};
  const indexed=current.at(time);oldTotal+=oldReads;currentTotal+=currentReads;
  assert.deepEqual(indexed,baseline);
 }
 result.measurements.push({visits:visitCount,distinctSystems:geography,events:eventCount,ticksAndSeeks:times.length,baselineTimestampReads:oldTotal,indexedTimestampReads:currentTotal,baselineTickTravelDateParses:oldDateParses,indexedTickTravelDateParses:0,outputsEqual:true});
}
const output=process.argv[2];if(output)writeFileSync(output,JSON.stringify(result,null,2)+'\n');else console.log(JSON.stringify(result,null,2));
