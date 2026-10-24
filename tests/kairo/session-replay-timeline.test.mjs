import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareReplayTimeline} from '../../components/kairo/session-replay-timeline.mjs';
const epoch=Date.parse('2026-10-07T00:00:00Z'),iso=n=>new Date(epoch+n).toISOString();
const visit=(id,start,end,extra={})=>({id,systemId:id,entered:iso(start),exited:iso(end),...extra});
const event=(id,time,extra={})=>({id,type:'ship.changed',at:iso(time),...extra});
function snapshot(extra={}){return {startedAt:iso(0),endedAt:iso(10000),visits:[],events:[],travel:[],coverage:{gaps:[]},...extra};}
// The previous UI's direct scans are the behavioral oracle, including equal
// timestamps and input travel order. This is independent of the new index.
function original(data,time){
 const visits=data.visits.map(v=>({...v,start:Date.parse(v.entered),end:v.exited?Date.parse(v.exited):Date.parse(data.endedAt)})).sort((a,b)=>a.start-b.start);
 const events=data.events.filter(e=>!['system.entered','location.changed'].includes(e.type)&&!e.type.startsWith('opsec.')&&e.module!=='opsec').map(e=>({...e,time:Date.parse(e.at)})).sort((a,b)=>a.time-b.time);
 return {currentVisit:[...visits].reverse().find(v=>v.start<=time&&(time<v.end||(time===v.end&&time===Date.parse(data.endedAt))))||null,nextVisit:visits.find(v=>v.start>time)||null,previousVisit:[...visits].reverse().find(v=>v.start<time-1000)||null,recentEvents:events.filter(e=>e.time<=time).slice(-5).reverse(),previousEvent:[...events].reverse().find(e=>e.time<time),nextEvent:events.find(e=>e.time>time),trailSystemIds:[...new Set(visits.filter(v=>v.start<=time).map(v=>v.systemId))],travel:data.travel.filter(t=>Date.parse(t.at)<=time),gap:data.coverage.gaps.find(g=>Date.parse(g.from)<=time&&Date.parse(g.to)>time)||null};
}
test('indexed replay preserves current/recent/next/previous rules across equal times, gaps, overlaps and arbitrary seeks',()=>{
 const data=snapshot({visits:[visit(1,0,3000),visit(2,3000,3000),visit(3,3000,5000,{coordinates_available:false,sovereignty_at_visit:{id:77}}),visit(4,6000,10000),visit(5,10000,10000),visit(6,1000,2500),visit(7,3000,4000)],events:[event('a',3000),event('b',3000),event('c',4000),event('d',9000),event('e',10000),event('routine',1,{type:'system.entered'}),event('private',1,{module:'opsec'}),event('private2',1,{type:'opsec.lock'})],travel:[{at:iso(8000),id:3},{at:iso(3000),id:1},{at:iso(3000),id:2}],coverage:{gaps:[{from:iso(5000),to:iso(6000),reason:'gap'}]}});
 const saved=JSON.stringify(data),timeline=prepareReplayTimeline(data);
 for(const t of [0,1,999,1000,2499,2500,2999,3000,3999,4000,4999,5000,5999,6000,9999,10000,7000,1000,3000,0,10000])assert.deepEqual(timeline.at(epoch+t),original(data,epoch+t),'at '+t);
 assert.equal(JSON.stringify(data),saved,'preparation and scrubbing never mutate the fixed snapshot');
 assert.deepEqual(timeline.events.map(e=>e.id),['a','b','c','d','e']);
 assert.equal(timeline.at(epoch+3500).currentVisit.id,7,'last matching equal-time visit wins');
 assert.equal(timeline.at(epoch+4500).currentVisit.id,3,'earlier overlapping visit remains eligible after last ends');
 assert.equal(timeline.at(epoch+10000).currentVisit.id,5,'zero-duration final visit wins at exact replay end');
});
test('a fixed snapshot retains discovered geography and reuses unchanged trail/travel boundaries while rewinding correctly',()=>{
 const data=snapshot({visits:[visit(1,0,5000),visit(2,5000,10000),visit(3,9000,10000,{systemId:1})],travel:[{at:iso(5000),id:'out'},{at:iso(9000),id:'back'}]});
 const timeline=prepareReplayTimeline(data),first=timeline.at(epoch+100),same=timeline.at(epoch+200),later=timeline.at(epoch+9500),back=timeline.at(epoch+100);
 assert.strictEqual(first.trailSystemIds,same.trailSystemIds);assert.strictEqual(first.travel,same.travel);
 assert.deepEqual(later.trailSystemIds,[1,2]);assert.deepEqual(later.travel.map(t=>t.id),['out','back']);
 assert.deepEqual(back.trailSystemIds,[1]);assert.deepEqual(back.travel,[]);assert.deepEqual(timeline.discoveredSystemIds,[1,2]);
});
test('near-cap activity and large geography remain equivalent across playback and backwards jumps',()=>{
 const data=snapshot({endedAt:iso(1000000),visits:Array.from({length:1000},(_,i)=>visit(i,i*1000,(i+1)*1000)),events:Array.from({length:10000},(_,i)=>event(i,Math.floor(i/2)*200)),travel:Array.from({length:999},(_,i)=>({at:iso((i+1)*1000),id:i}))});
 const timeline=prepareReplayTimeline(data);let reads=0;
 for(const row of [...timeline.visits,...timeline.events])for(const key of ['start','time'])if(key in row){const value=row[key];Object.defineProperty(row,key,{get(){reads++;return value;}});}
 for(const t of [0,100,300000,990000,1000000,700000,100000,0]){const before=reads;assert.deepEqual(timeline.at(epoch+t),original(data,epoch+t));assert.ok(reads-before<180,'boundaries inspect logarithmic row timestamps');}
 assert.ok(timeline.ticks.length<=120);assert.equal(timeline.discoveredSystemIds.length,1000);
});
test('empty data and overlapping legacy coverage preserve honest gaps',()=>{
 assert.equal(prepareReplayTimeline(null).at(0).currentVisit,null);
 const data=snapshot({coverage:{gaps:[{from:iso(2000),to:iso(8000),reason:'first'},{from:iso(0),to:iso(10000),reason:'second'}]}});
 const timeline=prepareReplayTimeline(data);for(const t of [0,3000,9000,10000])assert.equal(timeline.at(epoch+t).gap?.reason,original(data,epoch+t).gap?.reason);
});
