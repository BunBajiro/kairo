// Isolated route comparison child; fixture setup and diagnostics stay outside timing samples.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {appModule} from './backend/target.mjs';
import {seedFixture} from './backend/fixture.mjs';

const mode=process.argv[2];assert.ok(['diagnostics','timings'].includes(mode));
const reverse=process.argv.includes('--reverse');
const [{openStore},{createUniverse},{getUniverseStatic},{allScopes}]=await Promise.all(['server/store.mjs','server/universe.mjs','server/universe-static.mjs','server/modules/catalog.mjs'].map(appModule));
const AT=Date.parse('2026-09-30T09:00:00Z'),originId=30000142,destinations=[30002187,30002659,30002510,30002053];
const warmups=2,samples=9,counts=reverse?[50,10,1]:[1,10,50];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
let networkAttempts=0,active=null;
const forbidden=async()=>{networkAttempts++;throw new Error('External IO is forbidden in the isolated route comparison.');};
globalThis.fetch=forbidden;
if(mode==='diagnostics'){
 const prepare=DatabaseSync.prototype.prepare;
 DatabaseSync.prototype.prepare=function(sql,...args){const statement=prepare.call(this,sql,...args);return new Proxy(statement,{get(target,key){const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;if(!['get','all','run'].includes(key))return value.bind(target);return(...params)=>{
  const result=value.apply(target,params);
  if(active){const metric=active.sql[sql]||={calls:0,rows:0,jsonBytes:0};metric.calls++;for(const row of key==='all'?result:key==='get'&&result?[result]:[]){metric.rows++;for(const field of ['body','value','raw'])if(typeof row[field]==='string')metric.jsonBytes+=Buffer.byteLength(row[field]);}}
  return result;
 };}});};
}
const dir=await mkdtemp(join(tmpdir(),'kairo-route-comparison-'));let store,universe;
const output={schemaVersion:1,suite:'isolated-route-scaling',mode,node:process.version,clock:new Date(AT).toISOString(),warmups:mode==='timings'?warmups:0,samples:mode==='timings'?samples:1,cases:[],complete:false};
try{
 output.fixture=await seedFixture(dir,'stress',AT);store=openStore(dir);
 const sourceAtlas=getUniverseStatic(),characters=Array.from({length:4},(_,i)=>({id:42+i,scopes:allScopes}));
 let graphBuilds=0;
 // The application deliberately freezes its catalogue. Diagnostic-only wrapping
 // observes this exact gate array without assigning to it or touching other arrays.
 const atlas=mode==='diagnostics'?{...sourceAtlas,gates:new Proxy(sourceAtlas.gates,{get(target,key,receiver){
  if(key===Symbol.iterator)return function*(){if(active)graphBuilds++;yield* target;};
  return Reflect.get(target,key,receiver);
 }})}:sourceAtlas;
 universe=createUniverse(store,{characters:()=>characters},{request:forbidden},{staticData:atlas,now:()=>AT,noSync:true});
 for(const count of counts){
  // Every case starts at the same persisted revision. Plan saves do not change it.
  store.db.prepare('DELETE FROM settings WHERE key=?').run('universe:navigation:42');
  const itinerary={originId,followLocation:false,kind:'gate',preferences:{mode:'shortest',useAnsiblex:false,useWormholes:false,useThera:false,useTurnur:false,useZarzakh:false},stops:Array.from({length:count},(_,i)=>({id:'mixed-stop-'+i,systemId:destinations[i%destinations.length]}))};
  universe.navigation.saveItinerary(42,itinerary);
  const validity=result=>{
   assert.equal(result.status,'ok');assert.equal(result.segments.length,count);assert.equal(result.systemIds[0],originId);assert.equal(result.systemIds.at(-1),itinerary.stops.at(-1).systemId);assert.equal(result.revision,1);
   for(const [i,segment]of result.segments.entries()){assert.equal(segment.status,'ok');assert.equal(segment.toSystemId,itinerary.stops[i].systemId);assert.equal(segment.stopId,itinerary.stops[i].id);assert.equal(segment.systemIds[0],i?itinerary.stops[i-1].systemId:originId);assert.equal(segment.systemIds.at(-1),itinerary.stops[i].systemId);}
   assert.equal(networkAttempts,0);return hash(result);
  };
  const entry={stops:count,fixtureDigest:hash(itinerary),semanticDigest:null,latencyMs:[],diagnostics:null};
  for(let i=0;i<(mode==='timings'?warmups:0);i++)validity(await universe.navigation.plan(42));
  if(mode==='diagnostics')active={sql:{}};
  const startBuilds=graphBuilds;
  for(let i=0;i<(mode==='timings'?samples:1);i++){
   const started=mode==='timings'?performance.now():null;
   const result=await universe.navigation.plan(42);
   if(mode==='timings')entry.latencyMs.push(performance.now()-started);
   const digest=validity(result);if(entry.semanticDigest)assert.equal(digest,entry.semanticDigest,'Repeated plan semantics changed');else entry.semanticDigest=digest;
   entry.hops=result.hops;
  }
  if(mode==='diagnostics'){entry.diagnostics={...active,graphBuilds:graphBuilds-startBuilds};active=null;}
  output.cases.push(entry);
 }
 output.networkAttempts=networkAttempts;output.complete=true;
}finally{active=null;await universe?.close();store?.close();await rm(dir,{recursive:true,force:true});}
console.log(JSON.stringify(output));
