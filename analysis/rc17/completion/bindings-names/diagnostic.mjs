// Actual Core binding boundaries and UI snapshot transport. Synthetic local data only.
// Timed runs must hold /tmp/kairo-performance.lock. Counter wrappers are untimed.
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {captureSource,verifySource} from '../../harness/source-manifest.mjs';

const repo=resolve(process.env.KAIRO_BENCH_REPO),output=resolve(process.env.KAIRO_DECISION_OUTPUT),timed=process.env.KAIRO_DECISION_TIMED==='1';
const source=await captureSource(repo,{expectedCommit:process.env.KAIRO_BENCH_SOURCE_COMMIT,requireClean:process.env.KAIRO_ALLOW_DIRTY!=='1'});
const hash=v=>createHash('sha256').update(v).digest('hex');
const load=p=>import(pathToFileURL(join(repo,p)));
const [{openStore},{createCore},{catalog,allScopes},{defaultStream},{bindingProjections}]=await Promise.all(['server/store.mjs','server/core.mjs','server/modules/catalog.mjs','server/stream.mjs','server/projections.mjs'].map(load));
const result={schema:1,mode:timed?'ordinary-timing':'untimed-counters',node:process.version,source:{commit:source.sourceCommit,fingerprint:source.fingerprint,dirty:source.dirty},harnessSha256:hash(await readFile(new URL(import.meta.url))),cases:[],controls:[],limits:['Synthetic local SQLite and immediate ESI adapter; no external service or real pilot data.','Core, projections, stream sanitization and SSE encoding/chunking are the actual production implementations.','Client sinks model consuming local SSE clients, not browser parsing/layout or TCP backpressure.','100/1000/10000 directory entries and 10/50 configured widgets are declared small/populated/stress fixtures, not claims about a typical user.','Frozen Date.now keeps no-work projection values stable; explicit freshness controls advance it separately.','Counter wrappers never run inside ordinary timing; elapsed numbers are diagnostic component costs, not end-user FPS or whole-app CPU.']};
const actualNow=Date.now,base=actualNow();let now=base;Date.now=()=>now;
const iso=offset=>new Date(base+offset).toISOString(),sample=data=>({status:'ready',data,updatedAt:iso(-1000),expiresAt:iso(3600000),refreshAt:iso(3600000)});
function sink(){const r=new EventEmitter();r.frames=[];r.bytes=0;r.writes=0;r.capture=!timed;r.write=b=>{if(r.capture)r.frames.push(b);r.bytes+=b.length;r.writes++;return true;};r.end=()=>{r.writableEnded=true;r.emit('finish');};r.destroy=()=>{r.destroyed=true;r.emit('close');};r.clear=()=>{r.frames=[];r.bytes=0;r.writes=0;};return r;}
function counterStore(store,counts){return {...store,get(k,f){counts.settings[k]=(counts.settings[k]||0)+1;return store.get(k,f);},snapshot(id,key){counts.snapshots[id+':'+key]=(counts.snapshots[id+':'+key]||0)+1;return store.snapshot(id,key);},db:new Proxy(store.db,{get(target,key){if(key==='prepare')return sql=>{counts.sql[sql]=(counts.sql[sql]||0)+1;return target.prepare(sql);};const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}})};}
const blank=()=>({settings:{},snapshots:{},sql:{},roster:0});
function resetCounts(c){Object.assign(c,blank());}
const directory=n=>Object.fromEntries(Array.from({length:n},(_,i)=>[100000+i,'Synthetic EVE object '+i.toString().padStart(5,'0')]));
const kinds=['wallet.balance','pilot.ship','training.remaining','industry.next','goal.progress','session.elapsed','session.report','goals.completed'];
async function fixture(namesCount,elementCount,visibility,clients,{walletOnly=false}={}){
 const dir=await mkdtemp(join(tmpdir(),'kairo-bindings-names-')),store=openStore(dir),counts=blank();let core;
 const chars=[42,43].map(id=>({id,name:'Synthetic '+id,scopes:allScopes}));
 const auth={characters(){if(!timed)counts.roster++;return chars;},access:async()=>{throw Error('No auth transport permitted');}};
 const names=directory(namesCount);store.set('names',names);
 for(const module of catalog)store.set('module:'+module.id,walletOnly?module.id==='wallet':['pilot','training','wallet','industry'].includes(module.id));
 for(const id of [42,43]){
  for(const module of catalog)for(const d of module.datasets)store.saveSnapshot(id,d.key,sample([]));
  store.saveSnapshot(id,'profile',sample({character_id:id,corporation_id:98000000}));
  store.saveSnapshot(id,'location',sample({solar_system_id:30000142,system:{name:'Jita',security_status:0.9}}));
  store.saveSnapshot(id,'wallet',sample(123456.78+id));store.saveSnapshot(id,'ship',sample({ship_type_id:100000}));
  store.saveSnapshot(id,'queue',sample(Array.from({length:50},(_,i)=>({skill_id:100000+i,queue_position:i,finished_level:4,start_date:iso(-3600000),finish_date:iso(3600000+i*60000)}))));
  store.saveSnapshot(id,'jobs',sample(Array.from({length:100},(_,i)=>({job_id:i,product_type_id:100000+i,status:'active',runs:2,start_date:iso(-3600000),end_date:iso(3600000+i*60000)}))));
  store.db.prepare('INSERT INTO sessions(id,character_id,label,started) VALUES(?,?,?,?)').run('session-'+id,id,'Synthetic session',iso(-10000));
  for(let i=0;i<50;i++)store.db.prepare('INSERT INTO goals(id,character_id,title,target,progress,kind,done,created) VALUES(?,?,?,?,?,?,?,?)').run('goal-'+id+'-'+i,id,'Synthetic Goal '+i,1000,i,'manual',0,iso(-10000));
 }
 const elements=Array.from({length:elementCount},(_,i)=>({id:'widget-'+i,kind:'text',visible:visibility==='all'||visibility==='half'&&i%2===0,binding:kinds[i%kinds.length],characterId:i%2?43:42,sourceId:'goal-'+(i%2?43:42)+'-'+i,text:'',name:'Synthetic widget '+i}));
 store.set('stream',{...defaultStream(),elements});
 let requests=0;
 const esi={health:()=>({}),names:async()=>({}),cachedNames:()=>({}),request:async(path)=>{requests++;assert.ok(walletOnly,'Unexpected transport in no-work binding fixture: '+path);assert.ok(['/characters/42/wallet','/characters/42/wallet/journal','/characters/42/wallet/transactions','/characters/42/orders'].includes(path),path);return {...sample(path.endsWith('/wallet')?123498.78:[]),headers:{}};},paged:async(path)=>esi.request(path)};
 try{core=await createCore(timed?store:counterStore(store,counts),auth,esi,dir,{noSync:true});core.quiesce();
  const streamClients=Array.from({length:clients},()=>{const c=sink();core.stream.connect(c);return c;}),uiClients=Array.from({length:clients},()=>{const c=sink();core.uiClients.add(c);return c;});
  return {store,core,auth,counts,chars,elements,names,streamClients,uiClients,requests:()=>requests,clear(){resetCounts(counts);for(const c of [...streamClients,...uiClients])c.clear();},async close(){await core.close();store.close();await rm(dir,{recursive:true,force:true});}};
 }catch(e){await core?.close();store.close();await rm(dir,{recursive:true,force:true});throw e;}
}
function summarize(times){const values=[...times].sort((a,b)=>a-b);return {n:values.length,medianMs:values[Math.floor(values.length/2)],p95Ms:values[Math.min(values.length-1,Math.floor(values.length*.95))],maxMs:values.at(-1),sumMs:values.reduce((a,b)=>a+b,0)};}
async function runOperation(f,operation,repetitions){const values=[],cpu=timed?process.cpuUsage():null;f.clear();for(let i=0;i<repetitions;i++){const start=timed?performance.now():0;await operation();if(timed)values.push(performance.now()-start);}return {repetitions,...(timed?{timing:summarize(values),cpu:process.cpuUsage(cpu)}:{counts:structuredClone(f.counts)}),streamBytes:f.streamClients.map(c=>c.bytes),streamWrites:f.streamClients.map(c=>c.writes),uiBytes:f.uiClients.map(c=>c.bytes),providerCalls:f.requests()};}
try{
 for(const namesCount of [100,1000,10000])for(const elementCount of [0,10,50])for(const visibility of elementCount?['all','none']:['none'])for(const clients of [0,1,3]){
  const f=await fixture(namesCount,elementCount,visibility,clients);
  try{
   for(let i=0;i<5;i++)f.core.updateBindings();
   const initial=f.core.stream.state();assert.equal(initial.elements.length,visibility==='all'?elementCount:0);
   const updateBindings=await runOperation(f,()=>f.core.updateBindings(),timed?40:3);
   assert.equal(updateBindings.providerCalls,0);assert.ok(updateBindings.streamBytes.every(n=>n===0),'No-work stable values must not publish');
   const noWorkSync=await runOperation(f,()=>f.core.sync(42),timed?15:3);
   assert.equal(noWorkSync.providerCalls,0);assert.ok(noWorkSync.streamBytes.every(n=>n===0));assert.ok(noWorkSync.uiBytes.every(n=>n===0));
   result.cases.push({kind:'binding-boundaries',namesCount,elementCount,visibility,clients,updateBindings,noWorkSync,stateSha256:hash(JSON.stringify(initial.elements))});
  }finally{await f.close();}
 }
 for(const namesCount of [100,1000,10000])for(const clients of [0,1,3]){
  const f=await fixture(namesCount,0,'none',clients,{walletOnly:true});
  try{
   const lane=await runOperation(f,()=>f.core.requestSync(42),timed?12:2);
   if(timed){f.clear();for(const client of f.uiClients)client.capture=true;await f.core.requestSync(42);}
   const frames=f.uiClients.map(c=>Buffer.concat(c.frames).toString().split('\n\n').filter(x=>x.startsWith('event: snapshot')).map(x=>JSON.parse(x.split('\ndata: ')[1])));
   const first=frames[0]||[];for(const frame of first){assert.deepEqual(frame.names,f.names);assert.equal(frame.snapshot.status,'ready');}
   if(clients)assert.equal(first.length,(timed?1:lane.repetitions)*4,'Wallet module emits balance, journal, transaction and order snapshots');
   for(const other of frames.slice(1))assert.deepEqual(other,first,'All UI clients receive identical names and data');
   result.cases.push({kind:'full-name-snapshots',namesCount,clients,...lane,measuredFramesPerClient:clients?lane.repetitions*4:0,verifiedFramesPerClient:first.length,averageFrameBytes:first.length?f.uiClients[0].bytes/first.length:0,namesJsonBytes:Buffer.byteLength(JSON.stringify(f.names)),equivalentData:clients?hash(JSON.stringify(first.map(({names,...frame})=>frame))):null});
  }finally{await f.close();}
 }
 const f=await fixture(1000,50,'all',1);
 try{
  f.clear();const before=f.core.stream.state();f.store.saveSnapshot(42,'wallet',{...sample(1),expiresAt:new Date(now).toISOString()});f.core.updateBindings();
  assert.equal(f.core.stream.state().elements.find(e=>e.id==='widget-0').bindingStatus,'unavailable');result.controls.push('Exact-expiry wallet transitions to unavailable through Core updateBindings');
  f.store.saveSnapshot(42,'wallet',sample(54321));f.core.updateBindings();assert.equal(f.core.stream.state().elements.find(e=>e.id==='widget-0').text,'54,321 ISK');result.controls.push('Fresh changed wallet publishes immediately through Core updateBindings');
  const reconnect=sink();reconnect.capture=true;f.core.stream.connect(reconnect);const fresh=JSON.parse(Buffer.concat(reconnect.frames).toString().split('data: ')[1]);assert.equal(fresh.elements.find(e=>e.id==='widget-0').text,'54,321 ISK');result.controls.push('New stream client immediately receives current binding state');
  f.core.stream.setOPSEC({state:'blue-space',hidden:false});f.clear();f.core.stream.setOPSEC({state:'unknown',hidden:true});assert.ok(f.streamClients[0].bytes>0);assert.equal(f.core.stream.state().opsec.hidden,true);result.controls.push('Protection changes publish immediately and independently from binding changes');
  const hidden=f.core.stream.config();hidden.elements=hidden.elements.map(e=>({...e,visible:false}));f.core.stream.save(hidden,bindingProjections(f.store,f.auth,hidden.elements));f.core.updateBindings();assert.equal(f.core.stream.state().elements.length,0);
  f.clear();const hiddenVersion=f.core.stream.state().version;now+=1000;f.core.updateBindings();result.hiddenTimeAdvance={configured:50,visible:0,advancedMs:1000,streamBytes:f.streamClients[0].bytes,versionDelta:f.core.stream.state().version-hiddenVersion};
  f.store.saveSnapshot(42,'wallet',sample(99));f.core.updateBindings();hidden.elements[0].visible=true;f.core.stream.save(hidden,bindingProjections(f.store,f.auth,hidden.elements));assert.equal(f.core.stream.state().elements[0].text,'99 ISK');result.controls.push('Showing a formerly hidden widget recomputes its current value using the actual save-route projection contract');
  result.controls.push('No changes to private source selection or public sanitized stream output');assert.ok(before.elements.every(e=>!('characterId' in e)&&!('sourceId' in e)&&!('binding' in e)));
 }finally{await f.close();}
 await verifySource(source);assert.equal(hash(await readFile(new URL(import.meta.url))),result.harnessSha256,'Harness did not change during the run');result.sourceVerified=true;result.complete=true;
}finally{Date.now=actualNow;await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({output,complete:result.complete,cases:result.cases.length,controls:result.controls.length}));
