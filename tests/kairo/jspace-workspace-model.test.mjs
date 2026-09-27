import test from 'node:test';
import assert from 'node:assert/strict';
import {groupSystemObservations,connectionEditorPayload,previewStructureScan,publicChainScene,drawnConnectionPayload,createLayoutSaveQueue,createLayoutSaveScope} from '../../components/kairo/jspace-workspace-model.mjs';

test('drawn connections use mapper defaults without granting route access; later condition edits preserve expiry',()=>{
 const edge=drawnConnectionPayload(31000111,31000222);
 assert.deepEqual(edge,{kind:'wormhole',from_system_id:31000111,to_system_id:31000222,confirmed:false,accessible:false,reverse_accessible:false,enabled:true,mass:'stable',life_status:'stable',duration_hours:16,max_ship_size:'large'});
 const saved={...edge,expires_at:'2026-09-26T20:12:34.123Z'};
 const edited=connectionEditorPayload({...saved,mass:'reduced'},'2026-09-26T20:12',saved);
 assert.equal(edited.expires_at,saved.expires_at);assert.equal('duration_hours' in edited,false);
 assert.equal(edited.confirmed,false);assert.equal(edited.accessible,false);
 const explicit=connectionEditorPayload({...saved,duration_hours:16,lifetime_edited:true},'',saved);
 assert.equal(explicit.duration_hours,16);assert.equal('expires_at' in explicit,false);assert.equal('lifetime_edited' in explicit,false);
 const legacy={expires_at:null,mass:'unknown',life_status:'unknown'};
 const unchanged=connectionEditorPayload({...legacy,duration_hours:null},'',legacy);
 assert.equal('duration_hours' in unchanged,false);assert.equal(unchanged.mass,'unknown');
});

test('consecutive drag saves wait for the accepted revision without dropping the later position',async()=>{
 const enqueue=createLayoutSaveQueue(),calls=[];let release,revision=7,position=0;
 const response=new Promise(resolve=>{release=resolve;});
 const save=value=>enqueue(async()=>{calls.push({revision,value});if(value===40)await response;position=value;revision++;return {revision,position};});
 const first=save(40),second=save(95);await Promise.resolve();
 assert.deepEqual(calls,[{revision:7,value:40}]);assert.equal(position,0);
 release();assert.deepEqual(await first,{revision:8,position:40});assert.deepEqual(await second,{revision:9,position:95});
 assert.deepEqual(calls,[{revision:7,value:40},{revision:8,value:95}]);
});

test('switching pilot or map cancels old queued drags while a failed old response cannot cancel the new workspace',async()=>{
 const old=createLayoutSaveScope('pilot-a:map-a');let releaseOld,releaseNew;const writes=[];
 const blocked=new Promise(resolve=>{releaseOld=resolve;}),nextBlocked=new Promise(resolve=>{releaseNew=resolve;});
 const oldFirst=old.run(async()=>{writes.push('old-start');await blocked;return null;});
 const oldSecond=old.run(async()=>{writes.push('old-queued');return true;});await Promise.resolve();old.cancel();
 const current=createLayoutSaveScope('pilot-b:map-b');
 const newFirst=current.run(async()=>{writes.push('new-start');await nextBlocked;return true;});
 const newSecond=current.run(async()=>{writes.push('new-queued');return true;});await Promise.resolve();
 releaseOld();await Promise.all([oldFirst,oldSecond]);assert.equal(current.pending,2);
 releaseNew();assert.deepEqual(await Promise.all([newFirst,newSecond]),[true,true]);
 assert.deepEqual(writes,['old-start','new-start','new-queued']);assert.equal(current.pending,0);
 const returned=createLayoutSaveScope('pilot-a:map-a');assert.equal(await returned.run(async()=>true),true);
 assert.equal(await old.run(async()=>{throw new Error('closed scope must never run');}),null);
});

test('a rejected revision cancels later gestures in that layout scope until a new gesture is made',async()=>{
 const scope=createLayoutSaveScope('pilot:map'),writes=[];
 const first=scope.run(async()=>{writes.push('conflict');return null;});
 const second=scope.run(async()=>{writes.push('stale-replay');return true;});
 assert.deepEqual(await Promise.all([first,second]),[null,null]);assert.deepEqual(writes,['conflict']);
 assert.equal(await scope.run(async()=>{writes.push('new-gesture');return true;}),true);
 assert.deepEqual(writes,['conflict','new-gesture']);
});

test('editing connection conditions preserves exact expiry and never sends a renewing duration',()=>{
 const connection={id:'old',expires_at:'2026-09-20T12:45:36.781Z',mass:'stable',confirmed:true};
 const value=connectionEditorPayload({duration_hours:16,...connection,mass:'critical'},'2026-09-20T12:45',connection);
 assert.equal(value.expires_at,connection.expires_at);
 assert.equal('duration_hours' in value,false);
 assert.equal(value.mass,'critical');
});
test('explicit UTC expiry wins without a competing default duration and fresh unknown connections stay unconfirmed',()=>{
 const value=connectionEditorPayload({duration_hours:16,confirmed:false,accessible:false,from_signature:' abc-123 '},'2026-09-26T19:31');
 assert.equal(value.expires_at,'2026-09-26T19:31:00.000Z');assert.equal('duration_hours' in value,false);
 assert.equal(value.confirmed,false);assert.equal(value.accessible,false);assert.equal(value.from_signature,'ABC-123');
 assert.equal(connectionEditorPayload({max_ship_size:''},'2026-09-26T19:31').max_ship_size,null);
 const relative=connectionEditorPayload({duration_hours:4,expires_at:'2026-09-20T12:00:00Z'},'');
 assert.equal(relative.duration_hours,4);assert.equal('expires_at' in relative,false);
});
test('three-line structure timers preserve UTC and do not invent type, ownership or power',()=>{
 const value=previewStructureScan('J225111 - Folgers\n1,475 km\nReinforced until 2026.09.26 23:51');
 assert.equal(value.valid,true);assert.equal(value.rows.length,1);assert.equal(value.rows[0].timer_at,'2026-09-26T23:51:00.000Z');assert.equal(value.rows[0].state,'reinforced');assert.equal(value.rows[0].type_name,'');assert.equal(value.rows[0].standing,'unknown');
 assert.equal(previewStructureScan('Tower\n1,475 km\nReinforced until 2026.02.30 23:51').valid,false);
});
test('Dscan preview recognizes numeric structure types without inventing powered state or translating private names',()=>{
 const value=previewStructureScan('\uFEFF35832\tJ225111 - Hidden Keep\tAstrahus\t1,475 km\r\n35826\tResearch & Production\tAzbel*\t609 м\r\n35832\tJ225111 - Hidden Keep\tAstrahus\t1,475 km\r\n587\tRifter\tRifter\t9 km');
 assert.equal(value.valid,true);assert.equal(value.rows.length,2);assert.equal(value.ignored.length,2);
 assert.equal(value.rows[0].title,'J225111 - Hidden Keep');assert.equal(value.rows[0].state,'');assert.equal(value.rows[0].standing,'unknown');assert.equal(value.rows[1].type_name,'Azbel');
});
test('unrecognized scans and oversized clipboard content cannot produce a misleading empty import',()=>{
 assert.equal(previewStructureScan('Name\tType\tDistance').valid,false);
 assert.equal(previewStructureScan('x'.repeat(512001)).valid,false);
 assert.deepEqual(previewStructureScan('587\tRifter\tRifter\t5 km').rows,[]);
});
test('public chain reports are explicit, ephemeral and cannot become trusted route edges',()=>{
 const now=Date.parse('2026-09-25T12:00:00Z'),systems=[{system_id:31000005,name:'Thera',space:'wormhole'},{system_id:30000142,name:'Jita',space:'known'}];
 const map={id:'map',nodes:[{system_id:30000142,x:0,y:0,alias:'Exit'}],connections:[]};
 const feeds={sources:{thera:{status:'ready'}},connections:[{id:'report',source:'thera',from_system_id:31000005,to_system_id:30000142,completed:true,reported:true,from_signature:'AAA-001',to_signature:'BBB-002',expires_at:'2026-09-25T13:00:00Z'}]};
 assert.equal(publicChainScene(map,feeds,systems,{},now).connections.length,0);
 const scene=publicChainScene(map,feeds,systems,{thera:true},now);assert.equal(scene.nodes.length,2);assert.equal(scene.connections.length,1);
 assert.equal(scene.connections[0].confirmed,false);assert.equal(scene.connections[0].accessible,false);assert.equal(scene.connections[0].enabled,false);assert.equal(scene.nodes[0].public_report,undefined);assert.equal(map.nodes.length,1);assert.equal(map.connections.length,0);
 assert.equal(publicChainScene(map,feeds,systems,{thera:true},now+3600000).connections.length,0);
 const stale=publicChainScene(map,{...feeds,sources:{thera:{status:'stale'}}},systems,{thera:true},now,scene);
 assert.equal(stale.connections.length,1);assert.equal(stale.connections[0].id,scene.connections[0].id);assert.equal(stale.connections[0].stale,true);assert.equal(stale.connections[0].active,false);
 assert.deepEqual(stale.nodes,scene.nodes);
 assert.equal(publicChainScene(map,{...feeds,connections:[]},systems,{thera:true},now,stale).connections.length,0,'A successful empty snapshot removes reports');
});

test('private connection lifetime ends at the exact boundary while unknown lifetimes and system cards remain',()=>{
 const now=Date.parse('2026-09-27T12:00:00Z'),nodes=[{system_id:1,x:0,y:0,locked:true},{system_id:2,x:300,y:0}],edge={from_system_id:1,to_system_id:2,kind:'wormhole'};
 const map={id:'private',nodes,connections:[{...edge,id:'current',expires_at:new Date(now+1).toISOString()},{...edge,id:'unknown',expires_at:null,confirmed:false},{...edge,id:'ended',expires_at:new Date(now).toISOString(),locked:true},{...edge,id:'collapsed',expires_at:new Date(now+1000).toISOString(),life_status:'collapsed'}]};
 const scene=publicChainScene(map,null,[],{},now);assert.deepEqual(scene.connections.map(row=>row.id),['current','unknown']);assert.deepEqual(scene.nodes,nodes);
 assert.deepEqual(publicChainScene(map,null,[],{},now+1).connections.map(row=>row.id),['unknown']);
});


test('structures remain structures with optional schedules and never inflate standalone timer counts',()=>{
 const structure={id:'keep',kind:'structure',timer_at:'2026-09-28T20:00:00.000Z'}, unscheduled={id:'tower',kind:'structure'}, timer={id:'operation',kind:'timer',timer_at:'2026-09-28T21:00:00.000Z'}, report={id:'hazard',kind:'hazard',timer_at:'2026-09-28T22:00:00.000Z'};
 const groups=groupSystemObservations([structure,unscheduled,timer,report]);
 assert.deepEqual(groups.structures,[structure,unscheduled]);assert.deepEqual(groups.timers,[timer]);assert.deepEqual(groups.reports,[report]);
 assert.equal(groups.structures[0].timer_at,structure.timer_at,'The structure keeps its own schedule');
 const imported=previewStructureScan('J225111 - Folgers\n1,475 km\nReinforced until 2026.09.28 23:51');
 assert.equal(groupSystemObservations(imported.rows).structures.length,1);assert.equal(groupSystemObservations(imported.rows).timers.length,0);
});
