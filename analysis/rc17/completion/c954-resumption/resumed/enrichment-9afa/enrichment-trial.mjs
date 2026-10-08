// Actual Core enrichment through actual ESI limiter; no external network.
// Default: deterministic immediate-response counts. Timed mode requires lock.
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
const repo=resolve(process.env.KAIRO_BENCH_REPO||'.'),timed=process.env.KAIRO_DECISION_TIMED==='1',delayMs=timed?Number(process.env.KAIRO_ENRICHMENT_DELAY_MS||50):0,output=process.env.KAIRO_DECISION_OUTPUT||'enrichment-trial.json';
const {openStore}=await import(pathToFileURL(join(repo,'server/store.mjs'))),{createCore}=await import(pathToFileURL(join(repo,'server/core.mjs'))),{createESI}=await import(pathToFileURL(join(repo,'server/esi.mjs'))),{catalog}=await import(pathToFileURL(join(repo,'server/modules/catalog.mjs')));
const hash=v=>createHash('sha256').update(v).digest('hex'),result={kind:timed?'ordinary-core-enrichment-trial':'deterministic-core-enrichment-diagnostic',sourceCommit:process.env.KAIRO_BENCH_SOURCE_COMMIT||null,node:process.version,sourceHashes:{},harnessSha256:hash(await readFile(new URL(import.meta.url))),delayMs,cases:[],limits:['Synthetic responses; no external providers/credentials. Delay models transport/response wait, not measured real provider latency.','Each lane exercises real Core.sync/requestSync, cache, name resolution and the four-request ESI limiter.','50 PI planets is an explicit stress case beyond ordinary single-pilot holdings, not typical usage.','No production concurrency change is implied; compare immutable source candidates with identical cases and ABBA ordering.']};
for(const file of ['server/core.mjs','server/asset-locations.mjs','server/esi.mjs','server/store.mjs'])result.sourceHashes[file]=hash(await readFile(join(repo,file)));
try{result.sourceHashes['server/enrichment.mjs']=hash(await readFile(join(repo,'server/enrichment.mjs')));}catch(error){if(error.code!=='ENOENT')throw error;result.sourceHashes['server/enrichment.mjs']=null;}
const kinds=(process.env.KAIRO_ENRICHMENT_KIND||'stations,structures,planets').split(','),cardinalities=(process.env.KAIRO_ENRICHMENT_COUNTS||'0,1,10,50').split(',').map(Number);
for(const kind of kinds)for(const count of cardinalities){
 const dir=await mkdtemp(join(tmpdir(),'kairo-enrich-trial-')),store=openStore(dir);let core,esi;
 try{
  for(const module of catalog)store.set('module:'+module.id,module.id===(kind==='planets'?'industry':'hangar'));
  const scopes=kind==='planets'?['esi-planets.manage_planets.v1']:['esi-assets.read_assets.v1',...(kind==='structures'?['esi-universe.read_structures.v1']:[])];
  const auth={characters:()=>[{id:42,name:'Synthetic',scopes}],access:async()=> 'synthetic-unusable'};
  const locations=Array.from({length:count},(_,i)=>(kind==='structures'?1000000000000:60000000)+i),items=kind==='planets'?Array.from({length:count},(_,i)=>({planet_id:40000000+i})):locations.map((location_id,i)=>({item_id:1000+i,location_id,quantity:1}));
  const calls=[],active={value:0,max:0};let phase='cold';
  esi=createESI(store,auth,{fetcher:async(url,options)=>{const path=new URL(url).pathname;calls.push({phase,path,method:options.method});active.value++;active.max=Math.max(active.max,active.value);try{
   if(delayMs)await delay(delayMs);else await Promise.resolve();
   let body;if(path==='/characters/42/assets'||path==='/characters/42/planets')body=items;
   else if(path==='/universe/names')body=[]; // Force representative unresolved-location fallback.
   else if(path.startsWith('/universe/stations/')||path.startsWith('/universe/structures/'))body={name:'Location '+path.split('/').at(-1)};
   else if(/^\/characters\/42\/planets\/\d+$/.test(path))body={pins:[{pin_id:Number(path.split('/').at(-1)),contents:[]}]};
   else throw Error('Unexpected external route '+path);
   return Response.json(body,{headers:{'cache-control':'max-age=3600','x-pages':'1'}});
  }finally{active.value--;}}});
  core=await createCore(store,auth,esi,dir,{noSync:true});core.quiesce();
  const key=kind==='planets'?'planets':'assets',start=timed?performance.now():0,cpu=timed?process.cpuUsage():null;await core.sync(42);const cold=store.snapshot(42,key);
  const measurement=timed?{coldMs:performance.now()-start,coldCPU:process.cpuUsage(cpu)}:{};
  assert.equal(cold.status,'ready');assert.equal(cold.data.length,count);assert.ok(active.max<=4,'actual ESI network slot limit');
  if(kind==='planets')assert.deepEqual(cold.data,items.map(p=>({...p,details:{pins:[{pin_id:p.planet_id,contents:[]}]}})));
  else assert.deepEqual(cold.data,items.map(p=>({...p,root_location_id:p.location_id,location_name:'Location '+p.location_id})));
  const coldHealth=esi.health(),coldMax=active.max;phase='warm';active.max=0;const warmStart=timed?performance.now():0;await core.requestSync(42);if(timed)measurement.warmMs=performance.now()-warmStart;
  const warm=store.snapshot(42,key);assert.deepEqual(warm.data,cold.data);assert.equal(calls.filter(c=>c.phase==='warm').length,0,'warm cached data/names need no provider calls');
  result.cases.push({kind,count,measurement,coldProviderCalls:calls.filter(c=>c.phase==='cold').length,warmProviderCalls:0,maxConcurrentCold:coldMax,maxConcurrentWarm:active.max,coldHealth,warmHealth:esi.health(),calls,dataSha256:hash(JSON.stringify(cold.data)),equal:true});
 }finally{await core?.close();await esi?.close();store.close();await rm(dir,{recursive:true,force:true});}
}
await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,kind:result.kind,cases:result.cases.length}));
