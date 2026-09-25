import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionEditorPayload,previewStructureScan,publicChainScene} from '../../components/kairo/jspace-workspace-model.mjs';

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
 assert.equal(publicChainScene(map,{...feeds,sources:{thera:{status:'stale'}}},systems,{thera:true},now).connections.length,0);
});
