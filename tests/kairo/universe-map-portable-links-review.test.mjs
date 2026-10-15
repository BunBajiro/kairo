import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createUniverse} from '../../server/universe.mjs';

const A=30000001,B=30000002,C=30000003,AT=Date.parse('2026-10-15T15:00:00Z');
const atlas={metadata:{},regions:[],constellations:[],systems:[A,B,C].map((system_id,index)=>({system_id,name:'System '+index,space:'known',security:-.2,x:index*1e10,y:0,z:0})),gates:[]};
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'kairo-portable-links-')),store=openStore(dir),auth={characters:()=>[{id:42,name:'Pilot',scopes:[]}]};
 const requests=[],denyExternal=async url=>{requests.push(String(url));throw new Error('Unexpected external request');};
 const service=createUniverse(store,auth,{}, {staticData:atlas,now:()=>AT,noSync:true,feeds:{noSync:true,fetcher:denyExternal},operations:{noSync:true,fetcher:denyExternal}});
 t.after(async()=>{await service.close();store.close();await rm(dir,{recursive:true,force:true});assert.deepEqual(requests,[],'Portable links use existing local metadata without provider lookups');});
 const cmd=(map,op,args={})=>service.jspace.command(42,map.id,{revision:map.revision,op,...args});
 let map=service.jspace.create(42,{name:'Private bridges'});
 for(const system_id of [A,B,C])map=cmd(map,'node.save',{node:{system_id}});
 return {store,service,api:service.jspace,cmd,map};
}

test('duplicating a private directed bridge preserves reported direction and endpoint identifiers without carrying route permission',async t=>{
 const f=await fixture(t);
 const original=f.cmd(f.map,'connection.save',{connection:{kind:'ansiblex',from_system_id:A,to_system_id:B,directional:true,structure_id:1023456789012,owner_alliance_id:99000001,capital_system_id:C,confirmed:true,accessible:true,notes:'Observed outbound bridge'}});
 const edge=original.connections[0];
 assert.equal(edge.directional,true);assert.equal(edge.structure_id,1023456789012);
 const duplicate=f.api.duplicate(42,original.id,{revision:original.revision,name:'Copied directed bridge'}),copied=duplicate.connections[0];
 assert.notEqual(copied.link_id,edge.link_id);
 assert.equal(copied.directional,true,'Duplicate must not turn a recorded one-way bridge into a reciprocal connection');
 assert.equal(copied.structure_id,1023456789012,'The reported endpoint is evidence, not an access grant');
 assert.equal(copied.owner_alliance_id,99000001);assert.equal(copied.capital_system_id,C);
 assert.equal(copied.confirmed,false);assert.equal(copied.accessible,false);assert.equal(copied.active,false);
 assert.equal(f.service.route(42,{map_id:duplicate.id,originId:A,destinationId:B,preferences:{useAnsiblex:true}}).status,'no_route');
 const reviewed=f.cmd(duplicate,'connection.save',{connection:{id:copied.id,confirmed:true,accessible:true}});
 assert.equal(f.service.route(42,{map_id:reviewed.id,originId:A,destinationId:B,preferences:{useAnsiblex:true}}).status,'ok');
 assert.equal(f.service.route(42,{map_id:reviewed.id,originId:B,destinationId:A,preferences:{useAnsiblex:true}}).status,'no_route','Reviewing forward access cannot invent a missing reverse bridge');
 assert.equal(f.api.map(42,original.id).connections[0].directional,true,'The original map remains intact');
});

test('native reciprocal bridge imports retain distinct endpoint evidence while discarding both access grants',async t=>{
 const f=await fixture(t);
 const original=f.cmd(f.map,'connection.save',{connection:{kind:'ansiblex',from_system_id:A,to_system_id:B,directional:false,structure_id:1023456789012,reverse_structure_id:1023456789013,owner_alliance_id:99000001,reverse_owner_alliance_id:99000002,capital_system_id:A,reverse_capital_system_id:C,confirmed:true,accessible:true,reverse_accessible:true}});
 const copy=f.api.importMap(42,{document:f.api.exportMap(42,original.id),name:'Imported reciprocal bridge'}),edge=copy.connections[0];
 assert.equal(edge.directional,false);
 assert.deepEqual([edge.structure_id,edge.reverse_structure_id],[1023456789012,1023456789013]);
 assert.deepEqual([edge.owner_alliance_id,edge.reverse_owner_alliance_id],[99000001,99000002]);
 assert.deepEqual([edge.capital_system_id,edge.reverse_capital_system_id],[A,C]);
 assert.equal(edge.confirmed,false);assert.equal(edge.accessible,false);assert.notEqual(edge.reverse_accessible,true);assert.equal(edge.active,false);
 assert.equal(f.service.route(42,{map_id:copy.id,originId:B,destinationId:A,preferences:{useAnsiblex:true}}).status,'no_route');
});

test('native configured bridge references remain shared and retain their current owner-controlled access',async t=>{
 const f=await fixture(t),shared=f.service.saveLink(42,{kind:'ansiblex',from_system_id:A,to_system_id:B,directional:true,structure_id:1023456789012,confirmed:true,accessible:true});
 const original=f.cmd(f.map,'connection.save',{connection:{kind:'ansiblex',link_id:shared.id}});
 const before=f.store.db.prepare("SELECT COUNT(*) n FROM universe_records WHERE kind='link'").get().n;
 const copy=f.api.importMap(42,{document:f.api.exportMap(42,original.id)});
 assert.equal(copy.connections[0].link_id,shared.id);assert.equal(copy.connections[0].directional,true);assert.equal(copy.connections[0].structure_id,1023456789012);
 assert.equal(copy.connections[0].confirmed,true);assert.equal(copy.connections[0].accessible,true);
 assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM universe_records WHERE kind='link'").get().n,before,'Portable shared references do not duplicate canonical network links');
});

test('Wanderer bridges without endpoint identifiers remain unconfirmed bidirectional observations',async t=>{
 const f=await fixture(t);
 const document={version:1,map:{name:'Wanderer map'},systems:[A,B].map(solar_system_id=>({solar_system_id,position:{x:0,y:0}})),connections:[{source:A,target:B,type:2}]};
 const copy=f.api.importMap(42,{document}),edge=copy.connections[0];
 assert.equal(edge.kind,'ansiblex');assert.equal(edge.directional,false);assert.equal(edge.structure_id,null);assert.equal(edge.reverse_structure_id,null);
 assert.equal(edge.confirmed,false);assert.equal(edge.accessible,false);assert.equal(edge.active,false);
});

test('legacy native bridges with omitted endpoint metadata retain the existing unknown defaults',async t=>{
 const f=await fixture(t),original=f.cmd(f.map,'connection.save',{connection:{kind:'ansiblex',from_system_id:A,to_system_id:B}}),document=f.api.exportMap(42,original.id);
 for(const field of ['directional','structure_id','reverse_structure_id','owner_alliance_id','reverse_owner_alliance_id','capital_system_id','reverse_capital_system_id'])delete document.map.connections[0][field];
 const edge=f.api.importMap(42,{document}).connections[0];
 assert.equal(edge.directional,false);assert.equal(edge.confirmed,false);assert.equal(edge.accessible,false);
 for(const field of ['structure_id','reverse_structure_id','owner_alliance_id','reverse_owner_alliance_id','capital_system_id','reverse_capital_system_id'])assert.equal(edge[field],null);
});

test('invalid portable direction and endpoint IDs are rejected before canonical or map rows change',async t=>{
 const f=await fixture(t),original=f.cmd(f.map,'connection.save',{connection:{kind:'ansiblex',from_system_id:A,to_system_id:B}}),exported=f.api.exportMap(42,original.id);
 const saved=()=>f.store.db.prepare("SELECT character_id,kind,id,body FROM universe_records ORDER BY character_id,kind,id").all();
 for(const patch of [{directional:'true'},{structure_id:1.5},{reverse_structure_id:-1},{owner_alliance_id:Infinity},{capital_system_id:'not-an-id'}]){
  const document=structuredClone(exported);Object.assign(document.map.connections[0],patch);const before=saved();
  assert.equal(f.api.previewImport(42,{document}).valid,false,JSON.stringify(patch));
  assert.throws(()=>f.api.importMap(42,{document}));assert.deepEqual(saved(),before,'Rejected metadata cannot partially persist a copied map or link');
 }
});
