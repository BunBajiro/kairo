import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from '../../server/store.mjs';
import {createUniverseNavigation,WAYPOINT_SCOPE,BRIDGE_SEARCH_SCOPE} from '../../server/universe-navigation.mjs';
import {planRoute,planJumpRoute,LY_METRES,jumpRangeForShip,jumpReachability,alternateJumpMidpoints,estimateJumpFuel} from '../../server/universe-routing.mjs';
const systems=[1,2,3,4,5].map(id=>({system_id:id,name:'System '+id,x:(id-1)*LY_METRES,y:0,z:0,security:-.2,space:'known',region_id:1,standing:id===3?-5:0}));
const gates=[1,2,3].map(id=>({from_system_id:id,to_system_id:id+1}));
async function fixture(t,overrides={}){
 const dir=await mkdtemp(join(tmpdir(),'kairo-nav-')),store=openStore(dir),characters=[{id:42,scopes:[WAYPOINT_SCOPE,BRIDGE_SEARCH_SCOPE,'esi-universe.read_structures.v1']},{id:43,scopes:[WAYPOINT_SCOPE]}],calls=[];
 let connections=[],feeds={},now=Date.parse('2026-09-25T12:00:00Z');
 const esi={mutate:async(path,options)=>{calls.push({path,options});return {status:204};},request:async()=>({data:{}})};
 const options={atlas:{systems,gates},now:()=>now,planRoute:(id,input)=>planRoute({systems,gates,connections:[...connections,...input.extraConnections||[]],now,...input}),planJump:(id,input)=>planJumpRoute({systems,...input}),getFeeds:()=>feeds,getRouteSystems:()=>systems,...overrides};
 const nav=createUniverseNavigation(store,{characters:()=>characters},esi,options);
 t.after(async()=>{await nav.close();store.close();await rm(dir,{recursive:true,force:true});});
 return {nav,store,characters,calls,esi,options,setConnections:v=>connections=v,setFeeds:v=>feeds=v,setNow:v=>now=v};
}
test('ordered planning persists per pilot, joins segments and reports an unreachable leg without claiming a partial route',async t=>{
 const {nav,store,options}=await fixture(t);const saved=nav.saveItinerary(42,{originId:1,stops:[{systemId:3},{systemId:2},{systemId:4}]});
 const planned=await nav.plan(42);assert.deepEqual(planned.systemIds,[1,2,3,2,3,4]);assert.equal(planned.segments.length,3);
 assert.equal(nav.state(43).itinerary.stops.length,0);assert.equal(store.get('universe:navigation:42').itinerary.stops.length,3);
 assert.throws(()=>nav.saveItinerary(42,{revision:saved.itinerary.revision-1,stops:[]}),/changed/);
 nav.saveItinerary(42,{stops:[{systemId:2},{systemId:5}]});const broken=await nav.plan(42);assert.equal(broken.status,'no_route');assert.deepEqual(broken.systemIds,[]);assert.equal(broken.failedSegment,1);
 assert.throws(()=>nav.state(999),/connected/);
});
test('progress consumes only the next occurrence, retains future revisits, and ignores stale observations',async t=>{
 const {nav}=await fixture(t);nav.saveItinerary(42,{originId:1,stops:[{id:'a',systemId:2},{id:'b',systemId:1},{id:'c',systemId:2}]});
 nav.observeLocation(42,2);assert.deepEqual(nav.state(42).itinerary.progress.completedStopIds,['a']);nav.observeLocation(42,2);assert.deepEqual(nav.state(42).itinerary.progress.completedStopIds,['a']);
 nav.observeLocation(42,{system_id:1,status:'stale'});assert.deepEqual(nav.state(42).itinerary.progress.completedStopIds,['a']);
 nav.observeLocation(42,1);assert.deepEqual(nav.state(42).itinerary.progress.completedStopIds,['a','b']);
 assert.deepEqual((await nav.plan(42)).systemIds,[1,2]);nav.observeLocation(42,2);assert.deepEqual(nav.state(42).itinerary.progress.completedStopIds,['a','b','c']);
 assert.equal(nav.state(42).itinerary.stops.length,3);
});
test('following location requires a fresh canonical source and never falls back to persisted progress',async t=>{
 let operations={location:{system_id:4,status:'ready',expires_at:'2026-09-25T12:05:00Z'}};
 const {nav,setNow}=await fixture(t,{getOperations:()=>operations});nav.saveItinerary(42,{originId:1,stops:[{systemId:3}],followLocation:true});nav.observeLocation(42,2);
 assert.deepEqual((await nav.plan(42)).systemIds,[4,3]);
 operations={location:{...operations.location,status:'stale'}};assert.equal((await nav.plan(42)).status,'invalid');assert.match(nav.state(42).plan.explanation,/manual origin/);
 operations={location:{...operations.location,status:'ready',expires_at:'invalid'}};assert.equal((await nav.plan(42)).status,'invalid');
 operations={location:{...operations.location,expires_at:'2026-09-25T12:05:00Z'}};setNow(Date.parse('2026-09-25T12:05:00Z'));assert.equal((await nav.plan(42)).status,'invalid');
 operations=null;assert.equal((await nav.plan(42)).status,'invalid');nav.saveItinerary(42,{followLocation:false});assert.deepEqual((await nav.plan(42)).systemIds,[1,2,3]);
});
test('a navigation integration without operations can follow a recent explicit observation only',async t=>{
 const {nav,setNow}=await fixture(t);nav.saveItinerary(42,{originId:1,stops:[{systemId:3}],followLocation:true});assert.equal((await nav.plan(42)).status,'invalid');
 nav.observeLocation(42,2);assert.deepEqual((await nav.plan(42)).systemIds,[2,3]);setNow(Date.parse('2026-09-25T12:05:00Z'));assert.equal((await nav.plan(42)).status,'invalid');
});
test('stop reorder is a complete permutation, remove and clear remain local',async t=>{
 const {nav,calls}=await fixture(t);nav.saveItinerary(0,{originId:1,stops:[{id:'a',systemId:2},{id:'b',systemId:3}]});
 assert.throws(()=>nav.reorderStops(0,['a','a']),/every stop/);nav.reorderStops(0,['b','a']);assert.deepEqual(nav.state(0).itinerary.stops.map(s=>s.id),['b','a']);
 nav.removeStop(0,'b');assert.equal(nav.state(0).itinerary.stops.length,1);nav.clearItinerary(0);assert.equal(nav.state(0).itinerary.stops.length,0);assert.equal(calls.length,0);
});
test('waypoint sends require scope and explicit append/replace, serialize without coalescing and report partial failure',async t=>{
 const {nav,esi,calls,characters}=await fixture(t);nav.saveItinerary(42,{originId:1,stops:[{systemId:3}]});
 assert.throws(()=>nav.sendWaypoints(42,{}),/Explicitly/);characters[0].scopes=[];await assert.rejects(nav.sendWaypoints(42,{replace:false}),/scopes/);characters[0].scopes=[WAYPOINT_SCOPE];
 let active=0,max=0;esi.mutate=async(path,options)=>{active++;max=Math.max(max,active);await new Promise(r=>setImmediate(r));calls.push({path,options});active--;return {status:204};};
 const output=await Promise.all([nav.sendWaypoints(42,{replace:true}),nav.sendWaypoints(42,{replace:false})]);assert.ok(output.every(r=>r.status==='sent'));assert.equal(calls.length,4);assert.equal(max,1);
 assert.equal(new URL('http://local'+calls[0].path).searchParams.get('clear_other_waypoints'),'true');assert.ok(calls.slice(1).every(c=>c.path.includes('clear_other_waypoints=false')));
 let n=0;esi.mutate=async()=>{if(++n===2)throw Object.assign(new Error('timeout'),{uncertain:true});return {status:204};};
 const partial=await nav.sendWaypoints(42,{replace:false});assert.equal(partial.status,'partial');assert.equal(partial.sent,1);assert.equal(partial.failedIndex,1);assert.equal(partial.uncertain,true);
});
test('reverse Ansiblex export targets the departure structure at that endpoint',async t=>{
 const {nav,setConnections,calls}=await fixture(t);setConnections([{id:'bridge',kind:'ansiblex',from_system_id:1,to_system_id:4,structure_id:1000000000001,reverse_structure_id:1000000000004,enabled:true,accessible:true}]);
 nav.saveItinerary(42,{originId:4,stops:[{systemId:1}],preferences:{useAnsiblex:true,ansiblexRules:'current'}});const result=await nav.sendWaypoints(42,{replace:false});
 assert.equal(result.targets[0].destinationId,1000000000004);assert.equal(new URL('http://local'+calls[0].path).searchParams.get('destination_id'),'1000000000004');
});
test('editing during a waypoint command stops remaining commands and preserves the edited itinerary',async t=>{
 const {nav,esi}=await fixture(t);nav.saveItinerary(42,{originId:1,stops:[{systemId:4}]});let calls=0;
 esi.mutate=async()=>{calls++;nav.saveItinerary(42,{stops:[{id:'new',systemId:2}]});return {status:204};};
 const result=await nav.sendWaypoints(42,{replace:false});assert.equal(result.status,'partial');assert.equal(result.sent,1);assert.equal(calls,1);assert.match(result.error,/changed/);assert.equal(nav.state(42).itinerary.stops[0].id,'new');
});
test('shutdown finishes the in-flight command but stops further and queued commands',async t=>{
 const {nav,esi}=await fixture(t);nav.saveItinerary(42,{originId:1,stops:[{systemId:4}]});let begin,release,calls=0;
 const started=new Promise(resolve=>begin=resolve),paused=new Promise(resolve=>release=resolve);
 esi.mutate=async()=>{calls++;begin();await paused;return {status:204};};
 const first=nav.sendWaypoints(42,{replace:false});const queued=nav.sendWaypoints(42,{replace:false}).then(()=>null,error=>error);await started;
 const closing=nav.close();release();const result=await first;await closing;
 assert.equal(result.status,'partial');assert.equal(calls,1);assert.match((await queued).message,/stopping/);assert.throws(()=>nav.sendWaypoints(42,{replace:false}),/stopping/);
});
test('bridge discovery uses scoped current ESI candidates and does not infer access or accept false origins',async t=>{
 const {nav,esi}=await fixture(t);const requested=[];
 esi.request=async path=>{requested.push(path);if(path.includes('/search?'))return {data:{structure:[1001,1002,1003,1004]}};
  const id=Number(path.split('/').at(-1));return {data:id===1004?{type_id:1}:{type_id:35841,solar_system_id:id===1002?2:1,name:id===1002?'System 2 » System 1 - Return':id===1003?'System 3 » System 4 - Wrong origin':'System 1 » System 2 - Forward'}};};
 const result=await nav.discoverBridges(42);assert.equal(result.links.length,1);assert.equal(result.links[0].directional,false);assert.equal(result.links[0].structure_id,1001);assert.equal(result.links[0].reverse_structure_id,1002);assert.equal(result.links[0].accessible,false);assert.equal(result.valid,false);assert.equal(result.issues.length,1);assert.match(result.issues[0].message,/origin differs/);
 assert.equal(new URL('http://local'+requested[0]).searchParams.get('categories'),'structure');
 esi.request=async()=>({data:{structure:[1001]},stale:true});await assert.rejects(nav.discoverBridges(42),/cached matches/);
 await assert.rejects(nav.discoverBridges(43),/scopes/);
});
test('location observations notify the local state stream without creating navigation activity events',async t=>{
 const {store,characters,esi,options}=await fixture(t);const changes=[],events=[];
 const nav=createUniverseNavigation(store,{characters:()=>characters},esi,{...options,onChange:id=>changes.push(id),publish:event=>events.push(event)});t.after(()=>nav.close());
 nav.observeLocation(42,null);nav.observeLocation(42,1);assert.deepEqual(changes,[42]);assert.deepEqual(events,[]);
 nav.saveItinerary(42,{originId:1,stops:[{systemId:2}],preferences:{useZarzakh:true}});assert.equal(events.length,1);assert.equal(nav.state(42).itinerary.preferences.useZarzakh,true);
});
test('public wormhole routing respects explicit source, freshness, expiry and reported ship limit',async t=>{
 const {nav,setFeeds}=await fixture(t);const connection={id:'thera:1',source:'thera',from_system_id:1,to_system_id:5,reported:true,completed:true,max_ship_size:'medium',expires_at:'2026-09-25T13:00:00Z'};
 setFeeds({sources:{thera:{status:'ready'}},connections:[connection]});nav.saveItinerary(42,{originId:1,stops:[{systemId:5}],preferences:{useThera:true,shipSize:'large'}});assert.equal((await nav.plan(42)).status,'no_route');
 nav.saveItinerary(42,{preferences:{shipSize:'small'}});const good=await nav.plan(42);assert.equal(good.status,'ok');assert.equal(good.edges[0].accessible,false);assert.equal(good.edges[0].access_basis,'public_report');
 nav.saveItinerary(42,{preferences:{shipSize:null}});assert.equal((await nav.plan(42)).status,'no_route');assert.equal(nav.state(42).itinerary.preferences.shipSize,null);
 setFeeds({sources:{thera:{status:'stale'}},connections:[connection]});assert.equal((await nav.plan(42)).status,'no_route');
});
test('alternate midpoints retain segment identity on revisits and never replace an explicit itinerary stop',async t=>{
 const {nav}=await fixture(t);nav.saveItinerary(42,{originId:1,kind:'jump',rangeLy:2,stops:[{id:'first',systemId:3},{id:'second',systemId:5}]});
 assert.deepEqual((await nav.plan(42)).alternateMidpoints,[]);
 nav.saveItinerary(42,{rangeLy:1.5,stops:[{id:'out',systemId:5},{id:'back',systemId:1}]});const mids=(await nav.plan(42)).alternateMidpoints;
 assert.equal(mids.length,6);assert.ok(mids.slice(0,3).every(row=>row.stopId==='out'&&row.segmentIndex===0));assert.ok(mids.slice(3).every(row=>row.stopId==='back'&&row.segmentIndex===1));
 assert.deepEqual(mids.map(row=>row.routeIndex),[1,2,3,1,2,3]);assert.ok(!mids.some(row=>row.midpointSystemId===1||row.midpointSystemId===5));
});
test('promoting a report into a private wormhole preserves its recorded ship-size restriction',async t=>{
 const {nav,setConnections}=await fixture(t);setConnections([{id:'private',kind:'wormhole',from_system_id:1,to_system_id:5,enabled:true,accessible:true,max_ship_size:'medium',expires_at:'2026-09-25T13:00:00Z',reported_source:'thera'}]);
 nav.saveItinerary(42,{originId:1,stops:[{systemId:5}],preferences:{useWormholes:true,shipSize:'large'}});assert.equal((await nav.plan(42)).status,'no_route');
 nav.saveItinerary(42,{preferences:{shipSize:'small'}});assert.equal((await nav.plan(42)).status,'ok');
});
test('XL public wormholes need actual mass and fresh nominal limits; nominal capacity is never remaining mass',async t=>{
 const {nav,setFeeds}=await fixture(t);const connection={id:'thera:XL',source:'thera',from_system_id:1,to_system_id:5,reported:true,completed:true,max_ship_size:'xlarge',max_jump_mass_kg:1e9,type_status:'ready',remaining_mass_kg:null,expires_at:'2026-09-25T13:00:00Z'};
 setFeeds({sources:{thera:{status:'ready'}},connections:[connection]});nav.saveItinerary(42,{originId:1,stops:[{systemId:5}],preferences:{useThera:true,shipSize:'large'}});assert.equal((await nav.plan(42)).status,'no_route');
 nav.saveItinerary(42,{preferences:{shipMassKg:1e9}});const good=await nav.plan(42);assert.equal(good.status,'ok');assert.equal(good.edges[0].remaining_mass_kg,null);
 nav.saveItinerary(42,{preferences:{shipMassKg:1e9+1}});assert.equal((await nav.plan(42)).status,'no_route');
 nav.saveItinerary(42,{preferences:{shipMassKg:1}});setFeeds({sources:{thera:{status:'ready'}},connections:[{...connection,type_status:'stale'}]});assert.equal((await nav.plan(42)).status,'no_route');
 setFeeds({sources:{thera:{status:'ready'}},connections:[connection]});nav.saveItinerary(42,{preferences:{shipSize:'supercapital'}});assert.equal((await nav.plan(42)).status,'no_route');
 nav.saveItinerary(42,{preferences:{shipSize:'capital',shipClass:'rorqual'}});assert.equal((await nav.plan(42)).status,'no_route');
 nav.saveItinerary(42,{preferences:{shipClass:'freighter'}});assert.equal((await nav.plan(42)).status,'ok');
 assert.throws(()=>nav.saveItinerary(42,{preferences:{shipMassKg:-1}}),/mass above zero/);
});
test('jump presets apply exact JDC levels; reachability/overlap and alternatives retain Y axis and restrictions',()=>{
 assert.equal(jumpRangeForShip({shipClass:'command_carrier',jumpDriveCalibration:5}).rangeLy,7.5);assert.equal(jumpRangeForShip({shipClass:'command_carrier',jumpDriveCalibration:4}).rangeLy,6.75);assert.equal(jumpRangeForShip({shipClass:'rorqual'}).rangeLy,10);
 const sample=[...systems,{...systems[0],system_id:9,x:0,y:5*LY_METRES}];const result=jumpReachability({systems:sample,origins:[{systemId:1,rangeLy:3},{systemId:5,rangeLy:3}],preferences:{avoidHostile:true}});
 assert.deepEqual(result.overlapSystemIds,[2,4]);assert.ok(!result.unionSystemIds.includes(9));assert.deepEqual(alternateJumpMidpoints({systems:sample,originId:1,destinationId:5,rangeLy:3,preferences:{avoidHostile:true}}).map(s=>s.systemId),[2,4]);
});
test('fuel estimate uses explicit rate and multiplier, rounds each leg and exposes assumptions',()=>{
 const fuel=estimateJumpFuel([{kind:'jump',distance_ly:1.1},{kind:'jump',distance_ly:1.1}],{isotopeUnitsPerLy:3,consumptionMultiplier:.5,reservePercent:10,unitPriceISK:20,unitVolumeM3:.15});
 assert.equal(fuel.units,4);assert.equal(fuel.withReserve,5);assert.equal(fuel.costISK,100);assert.equal(fuel.volumeM3,.75);assert.throws(()=>estimateJumpFuel([]),/positive/);
});
