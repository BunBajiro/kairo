import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareMapGroup} from '../../components/kairo/map-group-placement.mjs';
import {connectionEditorPayload} from '../../components/kairo/jspace-workspace-model.mjs';
const atlas={regions:[{region_id:10,name:'Region'}],constellations:[{constellation_id:20,name:'Constellation'}],systems:[1,2,3].map(id=>({system_id:id,region_id:10,constellation_id:20,space:'known',schematic_x:id*4,schematic_y:id===3?5:0})),gates:[{from_system_id:1,to_system_id:2},{from_system_id:2,to_system_id:1},{from_system_id:2,to_system_id:3}]};
test('group preview preserves official angles, stages absent nodes and deduplicates internal gates without mutating map',()=>{
 const map={nodes:[{system_id:1,x:400,y:100}],connections:[]},before=JSON.stringify(map);
 const result=prepareMapGroup(atlas,map,[{id:'bridge',kind:'ansiblex',from_system_id:2,to_system_id:3},{id:'private',kind:'ansiblex',map_id:'other',from_system_id:2,to_system_id:3}], 'constellation',20);
 assert.equal(JSON.stringify(map),before);assert.equal(result.source,'sde');assert.equal(result.existing,1);assert.deepEqual(result.nodes.map(n=>n.system_id),[2,3]);assert.deepEqual(result.connections.map(n=>n.kind),['gate','ansiblex']);
 assert.ok(result.nodes[0].x>400+264);assert.equal((result.nodes[1].y-result.nodes[0].y)/(result.nodes[1].x-result.nodes[0].x),5/4);
 assert.equal(prepareMapGroup(atlas,{nodes:[],connections:[]},[],'region',10).connections.length,2);
});
test('permanent editor payloads never send WH conditions or alter a shared bridge access decision',()=>{
 const draft={id:'edge',link_id:'bridge',kind:'ansiblex',from_system_id:1,to_system_id:2,mass:'stable',duration_hours:16,life_status:'stable',expires_at:null,max_ship_size:'large',wh_type:'K162',from_signature:'A',to_signature:'B',notes:'gate camp',confirmed:true,accessible:true,enabled:true,from_port:'top',to_port:'bottom'};
 const shared=connectionEditorPayload(draft,'',{kind:'ansiblex'});
 assert.deepEqual(Object.keys(shared).sort(),['id','link_id','kind','from_system_id','to_system_id','notes','from_port','to_port'].sort());
 const privateBridge=connectionEditorPayload(draft,'',{kind:'ansiblex',map_id:'ours'});assert.equal(privateBridge.confirmed,true);assert.equal(privateBridge.accessible,true);assert.equal(privateBridge.expires_at,undefined);
 const gate=connectionEditorPayload({...draft,kind:'gate'},'');assert.equal(gate.life_status,undefined);assert.equal(gate.from_signature,undefined);
});
