// Diagnostic-only single quiet window; copied from the frozen original mixed harness.
// ServerResponse write/destroy/drain observation perturbs all timing: do not compare performance.
// KAIRO_PERF_APP_ROOT is required. This entry point obtains flock itself.
import assert from 'node:assert/strict';
import {fork,spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {cpus} from 'node:os';
const self=fileURLToPath(import.meta.url),here=dirname(self);
if(process.env.KAIRO_MIXED_LOCKED!=='1'){
  const code=await new Promise((done,reject)=>{const child=spawn('flock',['-x','/tmp/kairo-rc16-benchmark.lock',process.execPath,self,...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,KAIRO_MIXED_LOCKED:'1'}});child.on('error',reject);child.on('exit',code=>done(code??1));});process.exit(code);
}
assert.ok(process.env.KAIRO_PERF_APP_ROOT,'KAIRO_PERF_APP_ROOT is required for the nested diagnostic harness');
const root=resolve(process.env.KAIRO_PERF_APP_ROOT),out=resolve(process.argv[2]||join(root,'analysis/rc16/raw/followup/mixed-diagnostic'));
const order=['quiet-diagnostic'],WINDOW=28000;
const source=JSON.parse(await readFile(join(root,'analysis/rc16/rc16-source-manifest.json'),'utf8'));
for(const f of source.files){if(['AGENTS.md','.github/workflows/test-build.yml'].includes(f.path))continue;const b=await readFile(join(root,f.path));assert.equal(createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex'),f.sha,f.path);}
const harnessHashes={};for(const f of ['mixed-run.mjs','mixed-worker.mjs','../../../harness/legacy/fixture.mjs','../../../harness/legacy/metrics.mjs','../../../harness/legacy/target.mjs'])harnessHashes[f]=createHash('sha256').update(await readFile(join(here,f))).digest('hex');
await mkdir(out,{recursive:true});
const report={schemaVersion:1,suite:'mixed-sse-backpressure-diagnostic',diagnosticOnly:true,sourceCommit:source.sourceCommit,harnessHashes,environment:{node:process.version,cpu:cpus()[0].model,logicalCpus:cpus().length,runUrl:process.env.GITHUB_RUN_ID?`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`:null},settings:{instrumentation:'Dashboard ServerResponse write/destroy/drain trace with pre/post queued bytes. No write admission, buffering, event content, reconnect or continuity assertion changes. All timings diagnostic only.',order,nominalWindowMs:WINDOW,protocolOnly:true,providerLatencyMs:50,assetsLatencyMs:250,commonStatePollMs:2000,commonStreamPollMs:1000,loadedNavigationOffsetsMs:[2000,8000,14000,20000],loadedBurstOffsetsMs:[4000,10000,16000,24000],providerPhases:[{atMs:0,mode:'fresh-highsec'},{atMs:2000,mode:'fresh-hostile'},{atMs:8000,mode:'fresh-highsec'},{atMs:14000,mode:'unavailable-503'},{atMs:20000,mode:'recovered-highsec'}],clock:'Request durations use observer monotonic clock; cross-process event/receipt times use the same-host Date.now epoch clock, millisecond resolution.',scope:'Real server, scheduler, auth-vault/ESI path and SSE protocol clients; no browser, physical OBS, GPU, internet or real player data. Legacy session backfill held fresh; live feed cursor enabled.'},runs:[],complete:false};
const save=()=>writeFile(join(out,'mixed-diagnostic.json'),JSON.stringify(report,null,2)+'\n');
const stats=values=>{const a=[...values].sort((a,b)=>a-b);return {n:a.length,p50:a[Math.ceil(a.length*.5)-1]??null,p95:a[Math.ceil(a.length*.95)-1]??null,max:a.at(-1)??null};};
async function worker(){const child=fork(join(here,'mixed-worker.mjs'),[],{stdio:['ignore','ignore','pipe','ipc'],env:{...process.env,KAIRO_PERF_APP_ROOT:root,KAIRO_MIXED_LOCKED:'1',KAIRO_DATA_DIR:'',KAIRO_PORT:'',KAIRO_STREAM_PORT:''}});let seq=0,stderr='';const pending=new Map();child.stderr.on('data',b=>{stderr=(stderr+b).slice(-12000);});child.on('message',m=>{const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error)):p.resolve(m.result);});child.on('exit',(code,signal)=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Worker exit '+(signal||code)+' '+stderr));}pending.clear();});return {child,rpc(action){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Worker timeout '+action+' '+stderr));},90000);pending.set(id,{resolve,reject,timer});child.send({id,action});});},stderr:()=>stderr};}
async function sse(url,headers,label,events){const controller=new AbortController(),response=await fetch(url,{headers,signal:controller.signal});assert.equal(response.status,200);const reader=response.body.getReader();let buffer='',closing=false;const state={label,bytes:0,events:0,unexpectedEnd:false,error:null};const task=(async()=>{try{while(true){const r=await reader.read();if(r.done){state.unexpectedEnd=!closing;break;}state.bytes+=r.value.length;buffer+=Buffer.from(r.value).toString('utf8');let cut;while((cut=buffer.indexOf('\n\n'))>=0){const chunk=buffer.slice(0,cut);buffer=buffer.slice(cut+2);const lines=chunk.split('\n'),type=lines.find(x=>x.startsWith('event: '))?.slice(7)||'heartbeat',data=lines.filter(x=>x.startsWith('data: ')).map(x=>x.slice(6)).join('\n');let body;try{body=data?JSON.parse(data):null;}catch{throw Error('Invalid SSE JSON');}state.events++;const clean=body&&type==='state'?{...body,serverTime:undefined,version:undefined}:body;events.push({client:label,type,receivedAt:Date.now(),bytes:Buffer.byteLength(chunk)+2,hash:data?createHash('sha256').update(JSON.stringify(clean)).digest('hex'):null,serverTime:body?.serverTime,version:body?.version,opsec:type==='opsec'?body:body?.opsec,characterId:body?.characterId,snapshot:type==='snapshot'?{key:body.key,status:body.snapshot?.status,updatedAt:body.snapshot?.updatedAt,expiresAt:body.snapshot?.expiresAt,errorStatus:body.snapshot?.errorStatus,systemId:body.snapshot?.data?.solar_system_id,dataHash:createHash('sha256').update(JSON.stringify(body.snapshot?.data??null)).digest('hex')}:undefined});}}}catch(e){if(!closing)state.error=e.message;}})();return {state,async close(){closing=true;controller.abort();await task;}};}
try{
for(const name of order){console.log('MIXED '+name);const w=await worker(),entry={name,loaded:name.startsWith('loaded'),requests:[],sse:[],complete:false};report.runs.push(entry);let dashboard,stream;const observerDelay=monitorEventLoopDelay({resolution:10});observerDelay.enable();
try{
 const info=await w.rpc('init');entry.fixture=info.fixture;
 const page=await fetch(info.origin);assert.equal(page.status,200);await page.arrayBuffer();const cookie=page.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
 const bootstrap=await (await fetch(info.origin+'/api/bootstrap',{headers:{cookie}})).json();assert.ok(bootstrap.csrf);
 const headers={cookie,'Content-Type':'application/json','X-Kairo-CSRF':bootstrap.csrf};
 dashboard=await sse(info.origin+'/api/events',headers,'dashboard',entry.sse);stream=await sse(info.streamOrigin+'/events',{},'obs-protocol',entry.sse);
 const begin=await w.rpc('begin');entry.startedAt=begin.startedAt;entry.initial=begin.initial;const origin=entry.startedAt;observerDelay.reset();
 async function request(path,{method='GET',body,scheduledAt=Date.now(),label=path,streamPort=false}={}){const started=performance.now(),row={label,path,method,scheduledAt,dispatchedAt:Date.now()};entry.requests.push(row);try{const r=await fetch((streamPort?info.streamOrigin:info.origin)+path,{method,headers:streamPort?{}:headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});row.status=r.status;const text=await r.text();row.bytes=Buffer.byteLength(text);row.finishedAt=Date.now();row.latencyMs=performance.now()-started;assert.equal(r.status,200,label+': '+text.slice(0,180));const value=JSON.parse(text);if(path.startsWith('/api/state'))assert.equal(value.data.assets.data.length,20000);if(label==='navigation'){assert.equal(value.status,'ok');assert.equal(value.segments.length,50);row.segments=value.segments.length;row.routeSystems=value.systemIds?.length??value.systems?.length;}return value;}catch(e){row.error=e.message;row.finishedAt=Date.now();row.latencyMs=performance.now()-started;throw e;}}
 const at=(offset,fn)=>delay(Math.max(0,origin+offset-Date.now())).then(()=>fn(origin+offset));const tasks=[];
 for(let t=0;t<WINDOW;t+=2000)for(const id of [42,43])tasks.push(at(t,scheduledAt=>request('/api/state?character='+id,{scheduledAt,label:'dashboard-state-'+id})));
 for(let t=0;t<WINDOW;t+=1000)tasks.push(at(t,scheduledAt=>request('/state',{scheduledAt,label:'stream-state',streamPort:true})));
 if(entry.loaded){
   for(const t of report.settings.loadedNavigationOffsetsMs)tasks.push(at(t,scheduledAt=>request('/api/universe/navigation/plan?character=42',{method:'POST',body:{},scheduledAt,label:'navigation'})));
   for(const [i,t] of report.settings.loadedBurstOffsetsMs.entries())tasks.push(at(t,async scheduledAt=>{
     const map=await request('/api/universe/jspace/maps/mixed-map-0?character=42',{scheduledAt,label:'map-before-edit'});assert.equal(map.nodes.length,100);
     const changed=await request('/api/universe/jspace/maps/mixed-map-0/commands?character=42',{method:'POST',body:{op:'map.update',revision:map.revision,name:'Synthetic edit '+i},scheduledAt,label:'map-edit'});assert.equal(changed.name,'Synthetic edit '+i);
     await Promise.all(['/api/universe?character=42','/api/universe/jspace?character=42','/api/universe/jspace/maps/mixed-map-0?character=42','/api/universe/jspace/maps/mixed-map-7?character=42','/api/sessions/benchmark-session?character=42','/api/state?character=43'].map(path=>request(path,{scheduledAt,label:'map-burst'})));
   }));
 }
 const results=await Promise.allSettled([...tasks,delay(Math.max(0,origin+WINDOW-Date.now()))]);entry.taskFailures=results.filter(x=>x.status==='rejected').map(x=>x.reason.message);
 entry.observationEnd=Date.now();entry.server=await w.rpc('finish');entry.sseStatus={dashboard:dashboard.state,stream:stream.state};
 assert.equal(entry.requests.length,entry.loaded?92:56);assert.equal(entry.taskFailures.length,0,entry.taskFailures.join('; '));
 assert.equal(entry.server.sseTraceDropped,0,'SSE diagnostic trace must not truncate');assert.equal(entry.server.forbiddenAttempts,0);assert.equal(entry.server.unexpected.length,0);assert.equal(entry.server.activeSessions,1);assert.equal(entry.server.sseClients.dashboard,1);assert.equal(entry.server.sseClients.stream,1);
 const selected=entry.server.transport.filter(x=>x.characterId===42);assert.ok(selected.some(x=>x.status===503),'Actual fake503 must occur');assert.ok(selected.some(x=>x.phase==='recovered-highsec'&&x.status===200),'Actual recovery must occur');
 assert.ok(entry.server.locations.some(x=>x.characterId===42&&x.status==='stale'),'Stale location must reach production store');
 assert.ok(entry.server.protection.some(x=>x.state==='hostile'&&x.hidden),'Hostile observation must be classified');assert.ok(entry.server.protection.some(x=>x.state==='unknown'&&x.hidden),'Unavailable highsec must fail closed');
 entry.unsafeEmissions=entry.server.protection.filter(x=>!x.hidden&&(x.state!=='highsec'||x.sourceStatus!=='ready'||x.sourceSystemId!==info.HIGH||x.sourceAgeMs>=30000||x.validUntil<=x.at));
 assert.equal(entry.unsafeEmissions.length,0,'Unsafe accepted OPSEC emission');
 for(const state of Object.values(entry.sseStatus)){assert.equal(state.unexpectedEnd,false);assert.equal(state.error,null);}
 const streamStates=entry.sse.filter(x=>x.client==='obs-protocol'&&x.type==='state');let previous;entry.streamDuplicateStates=0;for(const x of streamStates){if(x.hash===previous)entry.streamDuplicateStates++;previous=x.hash;}
 entry.wireUnhideValidation=streamStates.filter(x=>x.serverTime>=entry.startedAt&&!x.opsec?.hidden).map(x=>{const accepted=entry.server.protection.findLast(p=>p.at<=x.serverTime);return {serverTime:x.serverTime,receivedAt:x.receivedAt,acceptedAt:accepted?.at,valid:!!accepted&&!accepted.hidden&&accepted.sourceStatus==='ready'&&accepted.state==='highsec'&&accepted.validUntil>x.serverTime};});
 assert.ok(entry.wireUnhideValidation.length,'Recovered highsec must reach stream client');assert.ok(entry.wireUnhideValidation.every(x=>x.valid),'Stream unhide must match accepted fresh highsec producer state');
 const recovered=entry.server.locations.find(x=>x.characterId===42&&x.at>=entry.startedAt+20000&&x.status==='ready');assert.ok(recovered,'Recovery must reach the production location store');assert.ok(streamStates.some(x=>x.receivedAt>=recovered.at&&x.opsec?.state==='highsec'&&!x.opsec.hidden),'Recovery must reach stream SSE');
 entry.metrics={requestLatencyMs:stats(entry.requests.map(x=>x.latencyMs)),commonDashboardMs:stats(entry.requests.filter(x=>x.label.startsWith('dashboard-state')).map(x=>x.latencyMs)),commonStreamMs:stats(entry.requests.filter(x=>x.label==='stream-state').map(x=>x.latencyMs)),navigationMs:stats(entry.requests.filter(x=>x.label==='navigation').map(x=>x.latencyMs)),dispatchLatenessMs:stats(entry.requests.map(x=>x.dispatchedAt-x.scheduledAt)),streamStateDeliveryMs:stats(streamStates.filter(x=>Number.isFinite(x.serverTime)).map(x=>x.receivedAt-x.serverTime)),streamStateEvents:streamStates.length,sseBytes:entry.sse.reduce((n,x)=>n+x.bytes,0),observedWindowMs:entry.observationEnd-origin};entry.complete=true;
}catch(e){entry.error=e.stack;throw e;}finally{observerDelay.disable();entry.observerLoopMaxMs=observerDelay.max/1e6;await dashboard?.close();await stream?.close();try{entry.cleanup=await w.rpc('close');}catch(e){entry.cleanupError=e.message;w.child.kill('SIGKILL');}entry.stderr=w.stderr();await save();}
assert.ok(entry.cleanup&&!entry.cleanupError,'Worker cleanup must complete');assert.equal(entry.cleanup.inflight,0);assert.equal(entry.cleanup.forbiddenAttempts,0);
console.log(JSON.stringify({name,complete:entry.complete,commonState:entry.metrics?.commonDashboardMs,loopMax:entry.server?.meter.eventLoopDelayMaxMs,cpu:entry.server?.meter.cpuPercentOneCore,duplicateStreamStates:entry.streamDuplicateStates}));
}
report.complete=true;
}finally{
  report.endedAt=new Date().toISOString();
  try{
    for(const f of source.files){if(['AGENTS.md','.github/workflows/test-build.yml'].includes(f.path))continue;const b=await readFile(join(root,f.path));assert.equal(createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex'),f.sha,f.path);}
    for(const [f,expected] of Object.entries(harnessHashes))assert.equal(createHash('sha256').update(await readFile(join(here,f))).digest('hex'),expected,f);
    report.sourceAndHarnessEndVerified=true;
  }catch(error){report.sourceAndHarnessEndVerified=false;report.endVerificationError=error.stack;report.complete=false;process.exitCode=1;}
  await save();
}
