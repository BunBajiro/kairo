import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setImmediate as turn} from 'node:timers/promises';
import {mapEnrichment,enrichPlanets} from '../../server/enrichment.mjs';
import {enrichAssetLocations} from '../../server/asset-locations.mjs';
import {createESI} from '../../server/esi.mjs';
import {openStore} from '../../server/store.mjs';
import {createCore} from '../../server/core.mjs';
import {catalog} from '../../server/modules/catalog.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function storage(t){const dir=await mkdtemp(join(tmpdir(),'kairo-enrichment-')),store=openStore(dir);t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});return {dir,store};}

test('bounded mapping preserves input order and drains accepted siblings before propagating failure',async()=>{
 const gates=Array.from({length:6},deferred),started=[];let finished=false;
 const work=mapEnrichment([0,1,2,3,4,5],async n=>{started.push(n);return gates[n].promise;});work.catch(()=>{finished=true;});
 assert.deepEqual(started,[0,1,2,3]);gates[1].resolve('one');await turn();assert.deepEqual(started,[0,1,2,3,4]);
 const failure=new Error('fatal admission');gates[4].reject(failure);await turn();assert.equal(finished,false);assert.equal(started.includes(5),false);
 gates[3].resolve('three');gates[0].resolve('zero');gates[2].resolve('two');await assert.rejects(work,error=>error===failure);
 assert.equal(finished,true);assert.deepEqual(await mapEnrichment([],()=>assert.fail('empty worker')),[]);
 const ordered=await mapEnrichment([3,2,1],async n=>n*2);assert.deepEqual(ordered,[6,4,2]);
});

test('asset enrichment checks fresh names at admission and retains denial/cancel fallbacks with ordered rows',async()=>{
 const ids=Array.from({length:7},(_,i)=>60000001+i),gates=new Map(),started=[],names={};let complete=false;
 const work=enrichAssetLocations(ids.map((location_id,i)=>({item_id:i,location_id})),{names,rememberNames:v=>Object.assign(names,v),characterId:42,canReadStructures:false,esi:{names:async()=>({}),request:async path=>{const id=Number(path.split('/').at(-1)),gate=deferred();started.push(id);gates.set(id,gate);return gate.promise;}}});work.then(()=>{complete=true;});
 await turn();assert.deepEqual(started,ids.slice(0,4));names[ids[4]]='Fresh competing name';
 gates.get(ids[1]).reject(new DOMException('Network cancelled','AbortError'));await turn();assert.equal(started.includes(ids[4]),false);assert.ok(started.includes(ids[5]));
 gates.get(ids[2]).reject(Object.assign(new Error('Denied'),{status:403}));await turn();assert.ok(started.includes(ids[6]));
 assert.equal(complete,false);
 for(const id of [ids[6],ids[3],ids[5],ids[0]])gates.get(id).resolve({data:{name:'Name '+id}});
 const rows=await work;assert.deepEqual(rows.map(r=>r.location_name),['Name '+ids[0],String(ids[1]),String(ids[2]),'Name '+ids[3],'Fresh competing name','Name '+ids[5],'Name '+ids[6]]);
});

test('planet enrichment preserves order and failed original rows across out-of-order completion',async()=>{
 const planets=Array.from({length:7},(_,i)=>({planet_id:i+1,name:'Planet '+i})),gates=new Map(),calls=[];
 const work=enrichPlanets(planets,{request:async(path,options)=>{calls.push([path,options]);const gate=deferred();gates.set(Number(path.split('/').at(-1)),gate);return gate.promise;}},42);
 assert.equal(calls.length,4);gates.get(3).resolve({data:{pins:[3]}});await turn();gates.get(1).reject(new DOMException('Cancelled','AbortError'));await turn();gates.get(5).resolve({data:{pins:[5]}});await turn();
 for(const id of [7,6,4,2])gates.get(id).resolve({data:{pins:[id]}});
 const rows=await work;assert.strictEqual(rows[0],planets[0]);assert.deepEqual(rows,planets.map(p=>p.planet_id===1?p:{...p,details:{pins:[p.planet_id]}}));
 assert.ok(calls.every(([,options])=>options.characterId===42&&options.ttl===600));
});

test('enrichment shares real ESI capacity, gives priority callers the next slot and drains on close',async t=>{
 const {store}=await storage(t),started=[],releases=new Map();let active=0,maximum=0,autoRelease=false;
 const esi=createESI(store,{access:async()=> 'test-token'},{fetcher:async url=>{const path=new URL(url).pathname,gate=deferred();started.push(path);releases.set(path,()=>gate.resolve(Response.json({name:path})));if(autoRelease)releases.get(path)();active++;maximum=Math.max(maximum,active);try{return await gate.promise;}finally{active--;}}});
 t.after(async()=>{for(const release of releases.values())release();await esi.close();});
 const planets=Array.from({length:8},(_,i)=>({planet_id:i+1}));const work=enrichPlanets(planets,esi,42);await turn();assert.equal(started.length,4);
 const ordinary=esi.request('/ordinary'),priority=esi.request('/priority',{priority:true});await turn();
 releases.get('/characters/42/planets/1')();await turn();assert.equal(started[4],'/priority');assert.ok(maximum<=4);
 releases.get('/priority')();await turn();assert.equal(started[5],'/ordinary');
 // ESI shutdown refuses future admissions, while already accepted reads drain.
 const closing=esi.close();let drained=false;closing.then(()=>{drained=true;});await turn();assert.equal(drained,false);
 autoRelease=true;for(const release of releases.values())release();await Promise.all([work,ordinary,priority,closing]);
 assert.equal(esi.health().active,0);assert.ok(maximum<=4);assert.equal((await work).length,8);
});

test('real ESI rate-limit response blocks subsequent enrichment admissions while retaining accepted results',async t=>{
 const {store}=await storage(t),gates=new Map(),started=[];
 const esi=createESI(store,{access:async()=> 'test-token'},{fetcher:async url=>{const id=Number(new URL(url).pathname.split('/').at(-1)),gate=deferred();started.push(id);gates.set(id,gate);return gate.promise;}});t.after(()=>esi.close());
 const work=enrichPlanets(Array.from({length:10},(_,i)=>({planet_id:i+1})),esi,42);await turn();assert.equal(started.length,4);
 gates.get(1).resolve(new Response('',{status:429,headers:{'retry-after':'60'}}));await turn();
 for(const id of [2,3,4])gates.get(id).resolve(Response.json({pins:[id]}));
 const rows=await work;assert.deepEqual(started,[1,2,3,4]);assert.deepEqual(rows.map(p=>!!p.details),[false,true,true,true,false,false,false,false,false,false]);assert.equal(esi.health().active,0);
});

test('Core close drains the whole accepted parallel planet dataset before dependent shutdown',async t=>{
 const {store,dir}=await storage(t),gates=new Map(),started=[],planets=Array.from({length:8},(_,i)=>({planet_id:i+1}));
 for(const module of catalog)store.set('module:'+module.id,module.id==='industry');
 const sample=data=>({data,headers:{},updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()});
 const core=await createCore(store,{characters:()=>[{id:42,scopes:['esi-planets.manage_planets.v1']}]},{health:()=>({}),names:async()=>({}),request:async path=>{if(path==='/characters/42/planets')return sample(planets);const id=Number(path.split('/').at(-1)),gate=deferred();started.push(id);gates.set(id,gate);return gate.promise;}},dir,{noSync:true});
 t.after(async()=>{for(const gate of gates.values())gate.resolve(sample({pins:[]}));await core.close();});
 const work=core.sync(42);await turn();assert.deepEqual(started,[1,2,3,4]);let stopped=false;const original=core.universe.close;core.universe.close=async()=>{stopped=true;await original();};const closing=core.close();
 for(const id of [1,2,3,4])gates.get(id).resolve(sample({pins:[id]}));await turn();assert.equal(stopped,false);assert.deepEqual(started,[1,2,3,4,5,6,7,8]);
 for(const id of [8,7,6,5])gates.get(id).resolve(sample({pins:[id]}));await Promise.all([work,closing]);assert.equal(stopped,true);
 assert.deepEqual(store.snapshot(42,'planets').data,planets.map(p=>({...p,details:{pins:[p.planet_id]}})));
});
