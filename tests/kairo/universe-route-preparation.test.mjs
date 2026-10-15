import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createUniverse,sourceMetadata} from '../../server/universe.mjs';
import {createRoutePlanner,createJumpPlanner,planRoute,planJumpRoute,alternateJumpMidpoints,LY_METRES} from '../../server/universe-routing.mjs';

const AT=Date.parse('2026-09-25T12:00:00Z'),A=30000001,B=30000002,C=30000003,W=31000001;
const publicSources=['sovereignty','kills','jumps','fw','incursions','industry_systems','sovereignty_structures','sovereignty_campaigns'];
const privateSources=['profile','location','contacts','corporation_contacts','alliance_contacts','calendar','mining'];
const sample=(data,extra={})=>({status:'ready',data,updatedAt:new Date(AT).toISOString(),expiresAt:new Date(AT+3600000).toISOString(),...extra});
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'kairo-route-preparation-')),store=openStore(dir);
 const characters=[{id:42,scopes:['esi-universe.read_structures.v1']},{id:43,scopes:[]}],auth={characters:()=>characters};
 const systems=[A,B,C,W].map((system_id,i)=>({system_id,name:['Alpha','Beta','Gamma','J000001'][i],x:i*LY_METRES,y:0,z:0,security:-.2,space:system_id===W?'wormhole':'known',region_id:system_id===W?11000001:10000001,constellation_id:20000001}));
 const gates=[{from_system_id:A,to_system_id:B}],atlas={systems,gates,regions:[],constellations:[],metadata:{}};
 for(const key of publicSources)store.saveSnapshot(0,key,sample([]));
 for(const id of [42,43])for(const key of privateSources)store.saveSnapshot(id,key,sample(key==='profile'?{corporation_id:98,alliance_id:99}:[],key==='corporation_contacts'?{ownerId:98}:key==='alliance_contacts'?{ownerId:99}:{}));
 let time=AT;
 const service=createUniverse(store,auth,{}, {staticData:atlas,now:()=>time,noSync:true});
 t.after(async()=>{await service.close();store.close();await rm(dir,{recursive:true,force:true});});
 return {service,store,characters,atlas,setTime:value=>time=value};
}

test('prepared gate and jump planners preserve per-leg results while reusing one graph or grid',()=>{
 const systems=[1,2,3,4,5].map((system_id,i)=>({system_id,x:i*LY_METRES,y:0,z:0,security:-.2,space:'known',standing:system_id===3?-5:0}));
 const gates=[1,2,3,4].map(id=>({from_system_id:id,to_system_id:id+1}));
 let gateScans=0,systemMaps=0;
 gates[Symbol.iterator]=function*(){gateScans++;yield* Array.prototype.values.call(this);};
 systems.map=function(...args){systemMaps++;return Array.prototype.map.apply(this,args);};
 const gatePlanner=createRoutePlanner({systems,gates,preferences:{mode:'safer'},now:AT});
 const jumpPlanner=createJumpPlanner({systems,rangeLy:1.5,preferences:{mode:'safer'}});
 assert.equal(gateScans,1);assert.equal(systemMaps,2);
 const endpoints=[{originId:1,destinationId:5},{originId:5,destinationId:1},{originId:1,destinationId:1}];
 const gateResults=endpoints.map(gatePlanner),jumpResults=endpoints.map(jumpPlanner);
 const alternatives=jumpPlanner.alternateMidpoints({originId:2,destinationId:4});
 assert.equal(gateScans,1);assert.equal(systemMaps,2,'Legs and alternatives must not reconstruct the system lookup/grid');
 for(const [i,ends]of endpoints.entries()){
  assert.deepEqual(gateResults[i],planRoute({systems,gates,preferences:{mode:'safer'},now:AT,...ends}));
  assert.deepEqual(jumpResults[i],planJumpRoute({systems,rangeLy:1.5,preferences:{mode:'safer'},...ends}));
 }
 assert.deepEqual(alternatives,alternateJumpMidpoints({systems,rangeLy:1.5,preferences:{mode:'safer'},originId:2,destinationId:4}));
 assert.deepEqual(jumpResults[0].systemIds,[1,2,3,4,5]);
 assert.deepEqual(alternatives.map(row=>row.systemId),[3]);
});

test('a fifty-stop production itinerary reads one computational snapshot projection and builds one graph',async t=>{
 const {service,store,atlas}=await fixture(t);
 service.navigation.saveItinerary(42,{originId:A,stops:Array.from({length:50},(_,i)=>({systemId:i%2?A:B}))});
 let graphScans=0,projections=0,validations=0;
 atlas.gates[Symbol.iterator]=function*(){graphScans++;yield* Array.prototype.values.call(this);};
 const prepare=store.db.prepare;
 store.db.prepare=function(sql){
  assert.doesNotMatch(sql,/\bvisits\b|\bplace_notes\b|\bpolitics_/i,'Routes must not construct lifetime history or display-only overlays');
  if(sql.includes('END raw'))projections++;
  if(sql.includes('SELECT character_id,key,body FROM snapshots'))validations++;
  return prepare.call(this,sql);
 };
 t.after(()=>{store.db.prepare=prepare;});
 const result=await service.navigation.plan(42);
 assert.equal(result.status,'ok');assert.equal(result.segments.length,50);assert.equal(result.hops,50);
 assert.deepEqual([projections,validations,graphScans],[1,1,1]);
 await service.navigation.plan(42);
 assert.deepEqual([projections,validations,graphScans],[2,2,2],'A later request gets fresh evidence');
});

test('route badges preserve all source metadata without unrelated body decoding',async t=>{
 const {service,store}=await fixture(t);
 const cases={jumps:sample([{system_id:A,ship_jumps:3}],{stale:true,retryAt:'later'}),fw:sample([],{truncated:true}),incursions:{status:'error',data:null,error:'Unavailable'},industry_systems:sample({value:1}),sovereignty_structures:sample([]),sovereignty_campaigns:sample(false),location:sample({solar_system_id:A}),calendar:sample([], {scope:'calendar',refreshAt:'next'}),mining:sample(0)};
 for(const [key,value]of Object.entries(cases))store.saveSnapshot(publicSources.includes(key)?0:42,key,value);
 const result=service.route(42,{originId:A,destinationId:B});
 assert.equal(Object.keys(result.sources).length,publicSources.length+privateSources.length);
 for(const [key,value]of Object.entries(cases))assert.deepEqual(result.sources[key],sourceMetadata(value,AT),key);
 store.set('module:industry',false);assert.equal(service.route(42,{originId:A,destinationId:B}).sources.mining.status,'disabled');
});

test('production itinerary acceptance rejects routing evidence changes but permits unrelated writes',async t=>{
 const mutations=[
  ['kill data',({store})=>store.saveSnapshot(0,'kills',sample([{system_id:A,ship_kills:1}]))],
  ['standings',({store})=>store.saveSnapshot(42,'contacts',sample([{contact_type:'alliance',contact_id:99,standing:-5}]))],
  ['pilot reauthorisation',({characters})=>{characters[0].needsReauth=true;}],
  ['pilot scopes',({characters})=>{characters[0].scopes=[];}],
  ['module policy',({store})=>store.set('module:opsec',false)],
  ['source expiry',({setTime})=>setTime(AT+3600000)],
 ];
 for(const [label,mutate]of mutations)await t.test(label,async t=>{
  const f=await fixture(t);f.service.navigation.saveItinerary(42,{originId:A,stops:[{systemId:B}]});
  const pending=f.service.navigation.plan(42);mutate(f);
  await assert.rejects(pending,error=>error.status===409&&/evidence changed/.test(error.message));
  assert.equal(f.store.get('universe:navigation:42').plan,null);
 });
 await t.test('unrelated pilot, display data and settings',async t=>{
  const {service,store}=await fixture(t);service.navigation.saveItinerary(42,{originId:A,stops:[{systemId:B}]});
  const pending=service.navigation.plan(42);
  store.saveSnapshot(43,'contacts',sample([{contact_id:99,standing:-10}]));store.saveSnapshot(42,'mining',sample([{quantity:99}]));store.set('names',{99:'Alliance'});store.set('module:comms',false);
  assert.equal((await pending).status,'ok');
 });
});

test('used private connection access, size, expiry and list evidence is revalidated before save',async t=>{
 for(const [label,change]of [['access',{accessible:false}],['confirmation',{confirmed:false}],['size',{max_ship_size:'small'}],['mass',{mass:'critical'}]])await t.test(label,async t=>{
  const {service,store}=await fixture(t),map=service.jspace.create(42,{name:'Chain'});
  const link=service.saveLink(42,{kind:'wormhole',map_id:map.id,from_system_id:A,to_system_id:W,max_ship_size:'large'});
  service.navigation.saveItinerary(42,{map_id:map.id,originId:A,stops:[{systemId:W}],preferences:{useWormholes:true,shipSize:'medium'}});
  const pending=service.navigation.plan(42,{map_id:map.id});service.saveLink(42,{id:link.id,...change});
  await assert.rejects(pending,error=>error.status===409&&/Connections changed/.test(error.message));assert.equal(store.get('universe:navigation:42:'+map.id).plan,null);
 });
 await t.test('used list becomes disabled',async t=>{
  const {service}=await fixture(t),list=service.saveLinkList(42,{name:'Network',text:'From,To,Structure ID\nAlpha,Gamma,1000000000001'});
  service.saveLink(42,{id:list.links[0].id,accessible:true});service.navigation.saveItinerary(42,{originId:A,stops:[{systemId:C}],preferences:{useAnsiblex:true,ansiblexRules:'current'}});
  const pending=service.navigation.plan(42);service.saveLinkList(42,{id:list.id,enabled:false});
  await assert.rejects(pending,error=>error.status===409&&/Connections changed/.test(error.message));
 });
 await t.test('used connection expires while source snapshots remain fresh',async t=>{
  const {service,setTime}=await fixture(t),map=service.jspace.create(42,{name:'Expiring chain'});
  service.saveLink(42,{kind:'wormhole',map_id:map.id,from_system_id:A,to_system_id:W,expires_at:new Date(AT+60000).toISOString()});
  service.navigation.saveItinerary(42,{map_id:map.id,originId:A,stops:[{systemId:W}],preferences:{useWormholes:true}});
  const pending=service.navigation.plan(42,{map_id:map.id});setTime(AT+60000);
  await assert.rejects(pending,error=>error.status===409&&/Connections changed/.test(error.message));
 });
 await t.test('map removal cannot recreate a saved route',async t=>{
  const {service,store}=await fixture(t),map=service.jspace.create(42,{name:'Removed chain'});
  service.navigation.saveItinerary(42,{map_id:map.id,originId:A,stops:[{systemId:B}]});
  const pending=service.navigation.plan(42,{map_id:map.id});store.db.prepare("DELETE FROM universe_records WHERE character_id=? AND kind='jspace_map' AND id=?").run(42,map.id);
  await assert.rejects(pending,/private chain map/);assert.equal(store.get('universe:navigation:42:'+map.id).plan,null);
 });
 await t.test('another map connection changes',async t=>{
  const {service}=await fixture(t),map=service.jspace.create(42,{name:'Other'}),link=service.saveLink(42,{kind:'wormhole',map_id:map.id,from_system_id:A,to_system_id:W});
  service.navigation.saveItinerary(42,{originId:A,stops:[{systemId:B}]});const pending=service.navigation.plan(42);service.saveLink(42,{id:link.id,mass:'critical'});
  assert.equal((await pending).status,'ok');
 });
});

test('used public reports and nominal limits retain freshness and mutation guards',async t=>{
 for(const kind of ['unchanged','report changed','type changed','feed expired','camel timestamps'])await t.test(kind,async t=>{
  const {service,store,setTime}=await fixture(t),report={id:'thera:1',source:'thera',from_system_id:A,to_system_id:W,reported:true,completed:true,max_ship_size:'medium',expires_at:new Date(AT+7200000).toISOString()};
  const timestamps=kind==='camel timestamps'?{updatedAt:new Date(AT).toISOString(),expiresAt:new Date(AT+60000).toISOString()}:{updated_at:new Date(AT).toISOString(),expires_at:new Date(AT+60000).toISOString()};
  store.set('universe:feeds:thera',{status:'ready',data:[report],...timestamps});
  store.set('universe:feeds:wormhole_types',{status:'ready',data:[],...timestamps});
  service.navigation.saveItinerary(42,{originId:A,stops:[{systemId:W}],preferences:{useThera:true,shipSize:'small'}});
  const pending=service.navigation.plan(42);
  if(kind==='report changed')store.set('universe:feeds:thera',{status:'ready',data:[{...report,max_ship_size:'small'}],...timestamps});
  if(kind==='type changed')store.set('universe:feeds:wormhole_types',{status:'ready',data:[{identifier:'K162',max_jump_mass_kg:100}],...timestamps});
  if(kind==='feed expired')setTime(AT+60000);
  if(['unchanged','camel timestamps'].includes(kind))assert.equal((await pending).status,'ok');
  else await assert.rejects(pending,error=>error.status===409&&/Public route evidence changed/.test(error.message));
 });
});
