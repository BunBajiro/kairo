import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildGateGraph, routeWatchDistances, tacticalLayout, operationalSystems, observationAge, projectedHull, feedSystems, matchingReachability, usablePublicConnections} from '../../components/kairo/universe-map-operations.mjs';

test('route watch is an undirected gate-only shortest-path model, independent of supplied ordering', () => {
 const gates = [{from_system_id:1,to_system_id:2},{from_system_id:2,to_system_id:3},{from_system_id:3,to_system_id:4},{from_system_id:1,to_system_id:4,kind:'wormhole'}];
 const graph = buildGateGraph(gates), watch = routeWatchDistances(graph,[4,1],2);
 assert.equal(watch.get(2).distance,1); assert.equal(watch.get(3).nearestRouteSystemId,4);
 assert.equal(routeWatchDistances(graph,[1],2).has(4),false);
 assert.deepEqual([...buildGateGraph([...gates].reverse())],[...graph]);
 assert.deepEqual([...routeWatchDistances(graph,[1,4],2)],[...watch]);
});
test('radar includes cross-region gate neighbours and regional schematic retains disconnected systems', () => {
 const systems = [1,2,3,4].map(system_id=>({system_id,space:'known',region_id:system_id===3?20:10,map_x:system_id,map_y:0}));
 const graph = buildGateGraph([{from_system_id:1,to_system_id:2},{from_system_id:2,to_system_id:3}]);
 const radar=tacticalLayout(systems,graph,{mode:'radar',centerSystemId:1,hops:2});
 assert.deepEqual(new Set(radar.points.map(p=>p.system.system_id)),new Set([1,2,3]));
 const regional=tacticalLayout(systems,graph,{mode:'schematic',centerSystemId:1});
 assert.deepEqual(new Set(regional.points.map(p=>p.system.system_id)),new Set([1,2,4]));
 assert.deepEqual(tacticalLayout([...systems].reverse(),graph,{mode:'radar',centerSystemId:1,hops:2}).points,radar.points);
 assert.equal(new Set(regional.points.map(p=>`${p.x}:${p.y}`)).size,3);
});
test('radar reports a bounded truncation rather than silently pretending the whole neighbourhood is visible', () => {
 const systems=Array.from({length:301},(_,i)=>({system_id:i+1,space:'known',region_id:1,map_x:i,map_y:0}));
 const graph=buildGateGraph(systems.slice(1).map(s=>({from_system_id:1,to_system_id:s.system_id})));
 const result=tacticalLayout(systems,graph,{centerSystemId:1,hops:1});
 assert.equal(result.points.length,240); assert.equal(result.total,301); assert.equal(result.limited,true);
});
test('report phases have absolute ages and expiration is exact, including future/unknown timestamps', () => {
 const now=Date.parse('2026-09-25T12:00:00Z'), at=seconds=>new Date(now-seconds*1000).toISOString();
 assert.equal(observationAge({observed_at:at(29)},now),'fresh');
 assert.equal(observationAge({observed_at:at(30)},now),'recent');
 assert.equal(observationAge({observed_at:at(150)},now),'older');
 assert.equal(observationAge({observed_at:at(5),expires_at:at(0)},now),'expired');
 assert.equal(observationAge({observed_at:at(-120)},now),'unknown');
});
test('clear supersedes only its channel and system; expired intel is absent and fleet/pilot duplicates are removed', () => {
 const now=Date.parse('2026-09-25T12:00:00Z'), t=n=>new Date(now+n).toISOString();
 const report=(id,system_ids,kind,channel,delta)=>({id,system_ids,kind,channel,source:'chat_log',observed_at:t(delta),expires_at:t(60000)});
 const result=operationalSystems({intel:[report('a',[1,2],'hostile','a',-20000),report('b',[1],'clear','a',-10000),report('c',[1],'hostile','b',-5000),{...report('d',[3],'hostile','a',-20000),expires_at:t(0)}],pilots:[{character_id:7,system_id:1,updated_at:t(-1000),expires_at:t(60000)}],fleet:{status:'ready',updated_at:t(-1000),expires_at:t(60000),members:[{character_id:7,system_id:1},{character_id:8,system_id:1}]}},now);
 assert.deepEqual(result.get(1).reports.map(r=>r.id),['c','b']);
 assert.deepEqual(result.get(2).reports.map(r=>r.id),['a']); assert.equal(result.has(3),false);
 assert.equal(result.get(1).fleet.length,1); assert.equal(result.get(1).pilots[0].stale,false);
});
test('feed footprints cross region boundaries; stale wormholes are never rendered as usable connections', () => {
 const now=Date.parse('2026-09-25T12:00:00Z');
 const result=feedSystems({storms:[{system_id:1,type:'Electric',strong_system_ids:[1,2],weak_system_ids:[3],source:'manual'}],connections:[{from_system_id:4,to_system_id:5,source:'thera',expires_at:new Date(now-1).toISOString()}]},now);
 assert.equal(result.get(1).length,1); assert.equal(result.get(2)[0].detail,'Strong area'); assert.equal(result.get(3)[0].detail,'Weak area'); assert.equal(result.has(4),false);
});
test('projected hull removes internal points and duplicates without claiming reachability for its interior', () => {
 const hull=projectedHull([{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2},{x:1,y:1},{x:0,y:0}]);
 assert.equal(hull.length,4); assert.equal(hull.some(p=>p.x===1&&p.y===1),false);
});
test('disabled operations retain notes without resurfacing old live intel or presence', () => {
 const result=operationalSystems({config:{enabled:false},intel:[{id:'a',kind:'hostile',system_ids:[1],observed_at:new Date().toISOString()}],pilots:[{character_id:1,system_id:1}],signatures:[{id:'sig',system_id:2,signature_id:'ABC-123'}]});
 assert.equal(result.has(1),false); assert.equal(result.get(2).signatures.length,1);
});
test('a response for different origin/range cannot turn stale range dots into verified destinations', () => {
 const origins=[{systemId:1,rangeLy:7},{systemId:2,rangeLy:8}], response={status:'ok',origins:[...origins].reverse(),unionSystemIds:[3],overlapSystemIds:[]};
 assert.equal(matchingReachability(origins,response),true);
 assert.equal(matchingReachability([{systemId:1,rangeLy:7.5},{systemId:2,rangeLy:8}],response),false);
 assert.equal(matchingReachability(origins,{...response,status:'invalid'}),false);
 assert.equal(matchingReachability(origins,{unionSystemIds:[3]}),false);
});
test('a pilot appears at only the freshest independently observed position across fleet and pilot sources', () => {
 const now=Date.parse('2026-09-25T12:00:00Z'), at=delta=>new Date(now+delta).toISOString();
 const result=operationalSystems({pilots:[{character_id:7,system_id:1,status:'ready',updated_at:at(-1000),expires_at:at(60000)},{character_id:8,system_id:1,status:'ready',updated_at:at(-10000),expires_at:at(60000)}],fleet:{status:'ready',updated_at:at(-5000),expires_at:at(60000),members:[{character_id:7,system_id:2},{character_id:8,system_id:2}]}},now);
 assert.deepEqual(result.get(1).pilots.map(p=>p.character_id),[7]); assert.deepEqual(result.get(2).fleet.map(p=>p.character_id),[8]);
});
test('hub discovery accepts only completed unexpired public reports from a fresh source', () => {
 const now=Date.parse('2026-09-25T12:00:00Z'), row={id:'a',source:'thera',completed:true,reported:true,from_system_id:1,to_system_id:2,expires_at:new Date(now+60000).toISOString()};
 assert.equal(usablePublicConnections({connections:[row],sources:{thera:{status:'ready'}}},now).length,1);
 assert.equal(usablePublicConnections({connections:[row],sources:{thera:{status:'stale'}}},now).length,0);
 assert.equal(usablePublicConnections({connections:[{...row,completed:false}]},now).length,0);
 assert.equal(usablePublicConnections({connections:[{...row,expires_at:new Date(now).toISOString()}]},now).length,0);
});
