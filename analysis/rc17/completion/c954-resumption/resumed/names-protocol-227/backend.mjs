// Actual Core directory publication. Root grants runtime; run.py owns the shared lock.
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {captureSource,verifySource} from '../../../../harness/source-manifest.mjs';
const repo=resolve(process.env.KAIRO_BENCH_REPO), output=resolve(process.env.KAIRO_DECISION_OUTPUT), timed=process.env.KAIRO_DECISION_TIMED==='1';
const source=await captureSource(repo,{expectedCommit:process.env.KAIRO_BENCH_SOURCE_COMMIT,requireClean:false});
const hash=v=>createHash('sha256').update(v).digest('hex'), load=p=>import(pathToFileURL(join(repo,p)));
const [{openStore},{createCore},{catalog,allScopes}]=await Promise.all(['server/store.mjs','server/core.mjs','server/modules/catalog.mjs'].map(load));
const originalNow=Date.now, base=Number(process.env.KAIRO_FIXTURE_NOW); assert.ok(Number.isFinite(base)); Date.now=()=>base;
const iso=offset=>new Date(base+offset).toISOString(), sample=data=>({status:'ready',data,headers:{},updatedAt:iso(-1000),expiresAt:iso(3600000),refreshAt:iso(3600000)});
const directory=n=>Object.fromEntries(Array.from({length:n},(_,i)=>{const second=i>=n/2,index=second?i-n/2:i;return [(second?4300000:4200000)+index,(second?'Second Asset ':'Asset ')+String(index).padStart(5,'0')];}));
const result={schema:1,mode:timed?'ordinary-timing':'untimed-counters',node:process.version,fixtureNow:base,source:{commit:source.sourceCommit,fingerprint:source.fingerprint,dirty:source.dirty},harnessSha256:hash(await readFile(new URL(import.meta.url))),cases:[],limits:[
 'Synthetic local SQLite, two pilots and immediate Wallet ESI responses; no external service or private pilot data.',
 'Production Core, Store and SSE queue/encoding run unchanged. Consuming in-memory sinks exclude TCP and browser parsing/render costs.',
 'Directory sizes 100/1000/10000/20000 and audiences 0/1/3 are declared controlled cardinalities, not typical-user claims.',
 'Ordinary timing uses no stringify wrapper or frame retention. Counters and domain checks are separate, untimed operations.',
 'Initial and reconnect candidate bootstrap adds a full map beyond /state. Both that cost and changed-map costs are reported.',
 'Full-state serialization measures the actual Core snapshot and names fields, not HTTP routing/health/session overhead.',
 'Domain comparison removes only intentional names wire envelope differences and random process epoch prefixes, preserving directory values, snapshot metadata and revision counters.',
 'These baseline/candidate roots omit the later Assets boundary; final combined browser acceptance must include it.'
]};
function sink(capture=!timed){const client=new EventEmitter();client.frames=[];client.bytes=0;client.writes=0;client.capture=capture;client.write=chunk=>{if(client.capture)client.frames.push(chunk);client.bytes+=chunk.length;client.writes++;return true;};client.end=()=>{client.writableEnded=true;client.emit('finish');};client.destroy=()=>{client.destroyed=true;client.emit('close');};client.clear=()=>{client.frames=[];client.bytes=0;client.writes=0;};return client;}
const packets=client=>Buffer.concat(client.frames).toString().split('\n\n').filter(frame=>frame.startsWith('event:')).map(frame=>({type:frame.split('\n')[0].slice(7),data:JSON.parse(frame.slice(frame.indexOf('\ndata: ')+7))}));
function stats(values){const sorted=[...values].sort((a,b)=>a-b);return {n:sorted.length,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],maxMs:sorted.at(-1),sumMs:sorted.reduce((a,b)=>a+b,0)};}
async function fixture(namesCount,clients){
 const dir=await mkdtemp(join(tmpdir(),'kairo-names-protocol-')),store=openStore(dir);let core,requests=0,mutation=0;
 store.set('names',directory(namesCount));for(const module of catalog)store.set('module:'+module.id,module.id==='wallet');
 const auth={characters:()=>[42,43].map(id=>({id,name:'Synthetic '+id,scopes:allScopes}))};
 const esi={health:()=>({}),names:async()=>({}),cachedNames:()=>({}),request:async(path)=>{requests++;assert.ok(['/characters/42/wallet','/characters/42/wallet/journal','/characters/42/wallet/transactions','/characters/42/orders'].includes(path),path);return sample(path.endsWith('/wallet')?123498.78:[]);}};esi.paged=esi.request;
 try {
  core=await createCore(store,auth,esi,dir,{noSync:true});core.quiesce();await core.requestSync(42);
  const protocol=typeof core.connectUI==='function',live=[];
  const attach=(capture=!timed)=>{const c=sink(capture);live.push(c);if(protocol)assert.equal(core.connectUI(c),true);else{core.uiClients.add(c);c.once('close',()=>core.uiClients.delete(c));}return c;};
  const detach=c=>{c.emit('close');const index=live.indexOf(c);if(index>=0)live.splice(index,1);};
  const mutate=count=>{mutation++;for(let i=0;i<count;i++)core.rememberNames({[4200000+i]:'Mutation '+mutation+' name '+i});};
  const fullState=()=>JSON.stringify({data:core.snapshots(42),...(protocol?core.namesSnapshot():{names:core.names()})});
  return {core,store,protocol,live,attach,detach,mutate,fullState,clients,requests:()=>requests,async close(){await core.close();store.close();await rm(dir,{recursive:true,force:true});}};
 } catch(error){await core?.close();store.close();await rm(dir,{recursive:true,force:true});throw error;}
}
async function measured(f,operation,repetitions){
 const times=[],startCalls=f.requests(),cpu=timed?process.cpuUsage():null;
 for(const c of f.live)c.clear();
 const count={snapshotEncodes:0,namesEncodes:0,embeddedNamesEncodes:0,namesJsonBytes:0};
 const stringify=JSON.stringify;
 if(!timed)JSON.stringify=function(value,...rest){const serialized=stringify(value,...rest);if(value&&typeof value==='object'){
  if(value.snapshot&&'characterId'in value&&'key'in value){count.snapshotEncodes++;if(value.names){count.embeddedNamesEncodes++;count.namesJsonBytes+=Buffer.byteLength(stringify(value.names));}}
  else if(value.names&&typeof value.namesRevision==='string'){count.namesEncodes++;count.namesJsonBytes+=Buffer.byteLength(stringify(value.names));}
 }return serialized;};
 try{for(let i=0;i<repetitions;i++){const start=timed?performance.now():0;await operation();if(timed)times.push(performance.now()-start);}}finally{JSON.stringify=stringify;}
 return {repetitions,...(timed?{timing:stats(times),cpu:process.cpuUsage(cpu)}:{counts:count}),providerCalls:f.requests()-startCalls,bytesPerClient:f.live.map(c=>c.bytes),writesPerClient:f.live.map(c=>c.writes)};
}
function normalizedSnapshot(value){const {names,namesRevision,...frame}=value;return {...frame,snapshot:{...frame.snapshot,dataRevision:frame.snapshot.dataRevision?.split(':').slice(1).join(':')}};}
function verifyDelivery(f,initialNames,expectedNamesEvents=0){
 const all=f.live.map(c=>packets(c)),results=[];
 for(const events of all){let names=initialNames;const snapshots=[];
  for(const event of events){if(event.type==='names')names=event.data.names;if(event.type==='snapshot'){if(event.data.names)names={...names,...event.data.names};assert.deepEqual(names,f.core.names(),'Every dataset publication sees the current authoritative directory');snapshots.push(normalizedSnapshot(event.data));}}
  assert.equal(snapshots.length,4);assert.equal(events.filter(e=>e.type==='names').length,f.protocol?expectedNamesEvents:0);
  assert.equal(events.filter(e=>e.type==='snapshot'&&e.data.names!==undefined).length,f.protocol?0:4);
  if(f.protocol&&expectedNamesEvents)assert.equal(events[0].type,'names');
  results.push(hash(JSON.stringify({names,snapshots})));
 }
 assert.ok(results.every(digest=>digest===results[0]));return {perClientDomainSha256:results,packetsPerClient:all.map(events=>events.map(e=>e.type)),bytesPerClient:f.live.map(c=>c.bytes)};
}
try{
 for(const namesCount of [100,1000,10000,20000])for(const clients of [0,1,3]){
  const f=await fixture(namesCount,clients),row={namesCount,clients,protocol:f.protocol,namesJsonBytes:Buffer.byteLength(JSON.stringify(f.core.names()))};
  try{
   if(namesCount===20000)assert.equal(row.namesJsonBytes,550001);
   const initialNames=structuredClone(f.core.names());
   // First attachment is separately measured. Bootstrap frames are parsed later.
   const firstTimes=[];for(let i=0;i<clients;i++){const start=performance.now();f.attach(!timed);firstTimes.push(performance.now()-start);}
   row.firstConnect={clients,sampling:'One initial observation per configured client (1 or 3), correlated within this process; not an independent performance distribution.',bytesPerClient:f.live.map(c=>c.bytes),...(timed&&clients?{timing:stats(firstTimes)}:{})};
   if(timed){for(const c of [...f.live])f.detach(c);for(let i=0;i<clients;i++)f.attach(true);}
   for(const c of f.live){const events=packets(c);assert.equal(events.length,f.protocol?1:0);if(f.protocol){assert.equal(events[0].type,'names');assert.deepEqual(events[0].data.names,initialNames);}c.capture=!timed;}
   row.unchanged=await measured(f,()=>f.core.requestSync(42),timed?12:2);
   assert.equal(row.unchanged.providerCalls,row.unchanged.repetitions*4);
   if(!timed){assert.equal(row.unchanged.counts.snapshotEncodes,clients?8:0);assert.equal(row.unchanged.counts.namesEncodes,0);assert.equal(row.unchanged.counts.embeddedNamesEncodes,clients&&!f.protocol?8:0);}
   // One untimed verification burst follows ordinary work in both arms.
   for(const c of f.live){c.clear();c.capture=true;}await f.core.requestSync(42);row.unchangedDelivery=verifyDelivery(f,initialNames);
   for(const c of f.live)c.capture=!timed;
   row.oneChange=await measured(f,async()=>{f.mutate(1);await f.core.requestSync(42);},timed?8:2);
   assert.equal(row.oneChange.providerCalls,row.oneChange.repetitions*4);
   if(!timed){assert.equal(row.oneChange.counts.snapshotEncodes,clients?8:0);assert.equal(row.oneChange.counts.namesEncodes,clients&&f.protocol?2:0);assert.equal(row.oneChange.counts.embeddedNamesEncodes,clients&&!f.protocol?8:0);}
   const beforeBatch=structuredClone(f.core.names());for(const c of f.live){c.clear();c.capture=true;}f.mutate(8);assert.ok(f.live.every(c=>c.bytes===0),'rememberNames calls must not broadcast individually');await f.core.requestSync(42);row.batchDelivery=verifyDelivery(f,beforeBatch,1);
   for(const c of f.live)c.capture=!timed;
   row.batchEight=await measured(f,async()=>{f.mutate(8);await f.core.requestSync(42);},timed?8:2);
   assert.equal(row.batchEight.providerCalls,row.batchEight.repetitions*4);
   if(!timed){assert.equal(row.batchEight.counts.snapshotEncodes,clients?8:0);assert.equal(row.batchEight.counts.namesEncodes,clients&&f.protocol?2:0);assert.equal(row.batchEight.counts.embeddedNamesEncodes,clients&&!f.protocol?8:0);}
   row.reconnect=await measured(f,()=>{for(const c of [...f.live])f.detach(c);for(let i=0;i<clients;i++)f.attach();},timed?8:2);
   // Only the last repeated connection remains; measured bytes are per reconnect.
   row.reconnect.byteAccounting='Final reconnect per-client bytes; each repetition reconnects the entire declared audience.';
   if(!timed){assert.equal(row.reconnect.counts.namesEncodes,f.protocol?clients*2:0);assert.equal(row.reconnect.counts.snapshotEncodes,0);}
   for(const c of f.live){c.capture=true;c.clear();}for(const c of [...f.live])f.detach(c);for(let i=0;i<clients;i++)f.attach(true);
   for(const c of f.live){const events=packets(c);assert.equal(events.length,f.protocol?1:0);if(f.protocol)assert.deepEqual(events[0].data.names,f.core.names());}
   // The names/state component still costs a full map in both arms.
   const stateTimes=[],stateBytes=[];for(let i=0;i<(timed?12:1);i++){const start=timed?performance.now():0;const body=f.fullState();if(timed)stateTimes.push(performance.now()-start);stateBytes.push(Buffer.byteLength(body));if(!i)assert.deepEqual(JSON.parse(body).names,f.core.names());}
   row.stateComponent={bytes:stateBytes[0],...(timed?{timing:stats(stateTimes)}:{})};assert.ok(stateBytes.every(value=>value===stateBytes[0]));
   if(!clients)for(const key of ['unchanged','oneChange','batchEight','reconnect']){assert.equal(row[key].bytesPerClient.length,0);if(!timed)assert.equal(row[key].counts.namesEncodes+row[key].counts.embeddedNamesEncodes+row[key].counts.snapshotEncodes,0);}
   row.finalNamesSha256=hash(JSON.stringify(f.core.names()));result.cases.push(row);
  }finally{await f.close();}
 }
 await verifySource(source);assert.equal(hash(await readFile(new URL(import.meta.url))),result.harnessSha256);result.sourceVerified=true;result.complete=true;
}finally{Date.now=originalNow;await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({output,complete:result.complete,cases:result.cases.length}));
