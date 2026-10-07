// Reconstructed 7 October 2026. External attribution, not performance acceptance.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir, cpus} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {performance, PerformanceObserver} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {Session} from 'node:inspector';
import {loadSourceManifest, verifySource} from '../../harness/source-manifest.mjs';

const [rootArg, outputArg, manifestArg, scheduler='active', fixtureNowArg, windowsArg='4', samplesArg='25', warmupSecondsArg='36']=process.argv.slice(2);
assert.ok(rootArg&&outputArg&&manifestArg&&['active','nosync'].includes(scheduler));
assert.equal(process.env.KAIRO_STATE_TAIL_LOCKED,'1','Use the runner and shared runtime lock');
const root=resolve(rootArg),output=resolve(outputArg),source=await loadSourceManifest(manifestArg,root);
await mkdir(output,{recursive:true});
const windows=Number(windowsArg),samples=Number(samplesArg),warmupSeconds=Number(warmupSecondsArg),fixtureNow=Number(fixtureNowArg);
assert.ok(Number.isFinite(fixtureNow)&&Number.isInteger(windows)&&windows>0&&Number.isInteger(samples)&&samples>=10&&Number.isFinite(warmupSeconds)&&warmupSeconds>=1);
process.env.KAIRO_PERF_APP_ROOT=root;
const moduleAt=path=>import(pathToFileURL(join(root,path)).href),hash=value=>createHash('sha256').update(value).digest('hex');
const harnessPaths=['state-tail-worker.mjs','../../harness/source-manifest.mjs','../../harness/backend/fixture.mjs','../../harness/backend/target.mjs','../../harness/legacy-discovery-fixture.mjs'];
const harnessHashes={};for(const path of harnessPaths)harnessHashes[path]=hash(await readFile(new URL(path,import.meta.url)));
const report={schemaVersion:2,reconstructedHarness:true,diagnosticOnly:true,performanceAcceptance:false,startedAt:new Date().toISOString(),
    source:{commit:source.sourceCommit,fingerprint:source.fingerprint,dirty:source.dirty},harnessHashes,
    environment:{node:process.version,cpu:cpus()[0]?.model,logicalCpus:cpus().length,timeOrigin:performance.timeOrigin},
    settings:{scheduler,fixture:'stress',fixtureNow,windows,samples,warmupsPerWindow:3,warmupSeconds,forcedGc:false,cpuProfilerDuringWindows:false,perIterationHash:false,perIterationByteWalk:false},
    limitations:['GC observation and phase timestamps are diagnostic instrumentation, not original backend acceptance timings.',
        'Windows in one process are correlated; fresh processes remain separate observations.',
        'GC overlap is association and does not identify the owner responsible for allocation.',
        'Active and noSync variants use the same supported setting across sources; no modern-only quiesce API is called.',
        'Reconstructed harness has a new identity; lost earlier measurements are not recreated.'],
    windows:[],gc:[],ticks:[],complete:false};
let external=0,app,lastJson,snapshotOriginal,activeReads=null;
const denied=async()=>{external++;throw Error('External IO forbidden in state-tail diagnostics');};globalThis.fetch=denied;
const observeGc=entries=>{for(const entry of entries)report.gc.push({startTime:entry.startTime,endTime:entry.startTime+entry.duration,duration:entry.duration,kind:entry.detail?.kind,flags:entry.detail?.flags});};
const gcObserver=new PerformanceObserver(list=>observeGc(list.getEntries()));gcObserver.observe({entryTypes:['gc']});
async function port(){const server=createServer();await new Promise((ok,bad)=>server.once('error',bad).listen(0,'127.0.0.1',ok));const value=server.address().port;await new Promise(ok=>server.close(ok));return value;}
const nextTurn=()=>new Promise(setImmediate),memory=()=>{const{rss,heapUsed,heapTotal,external,arrayBuffers}=process.memoryUsage();return{rss,heapUsed,heapTotal,external,arrayBuffers};};
const dir=await mkdtemp(join(tmpdir(),'kairo-state-tail-'));
function overlap(a,b){return Math.max(0,Math.min(a.endTime,b.endTime)-Math.max(a.startTime,b.startTime));}
function distribution(values){if(!values.length)return{count:0};const sorted=[...values].sort((a,b)=>a-b),q=p=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];return{count:values.length,p50:q(.5),p95:q(.95),max:sorted.at(-1)};}
try{
    const{startKairo}=await moduleAt('server/index.mjs');
    const{seedFixture,PILOT}=await import('../../harness/backend/fixture.mjs');
    report.workload=await seedFixture(join(dir,'data'),'stress',fixtureNow);
    const first=await port();let second=await port();while(second===first)second=await port();
    const startupStart=performance.now();
    app=await startKairo({port:first,streamPort:second,dataDir:join(dir,'data'),noSync:scheduler==='nosync',fetcher:denied,combatFetcher:denied,sessionFeedFetcher:denied,markets:{historyFetcher:denied},universe:{feeds:{fetcher:denied}},datasets:{fetcher:denied},deferDatasetStart:true});
    report.startup={startTime:startupStart,endTime:performance.now()};
    const originalTick=app.core.universe.tick;
    app.core.universe.tick=async(...args)=>{const tick={startTime:performance.now(),endTime:null,success:false};report.ticks.push(tick);try{const result=await originalTick(...args);assert.ok(Array.isArray(result));assert.ok(result.every(row=>row.status==='fulfilled'),'Real Universe subtasks must succeed');tick.success=true;return result;}finally{tick.endTime=performance.now();}};
    report.warmup={startTime:performance.now()};await delay(warmupSeconds*1000);report.warmup.endTime=performance.now();
    const feedState=app.core.universe.feeds.state();assert.ok(Array.isArray(feedState.storms)&&Array.isArray(feedState.points));assert.equal(feedState.sources.storms.status,'ready');
    if(scheduler==='active')assert.ok(report.ticks.some(tick=>tick.success),'Active warmup must contain real successful ticks');
    // Reproduce original 3 + 10 OPSEC calls before state as allocation context.
    for(let i=0;i<13;i++){app.core.refreshOPSEC();const value=app.core.stream.getOPSEC();if(i>=3)JSON.stringify(value);await nextTurn();}
    snapshotOriginal=app.store.snapshot;
    app.store.snapshot=(id,key)=>{if(!activeReads)return snapshotOriginal(id,key);const startTime=performance.now(),value=snapshotOriginal(id,key),endTime=performance.now();const row=activeReads[key]||={calls:0,elapsedMs:0};row.calls++;row.elapsedMs+=endTime-startTime;return value;};
    const operation=(reads=null)=>{const previous=activeReads;activeReads=reads;try{return{data:app.core.snapshots(PILOT),names:app.core.names()};}finally{activeReads=previous;}};
    {const initial=operation();assert.equal(initial.data.assets.data.length,report.workload.assets);const json=JSON.stringify(initial);report.responseBefore={bytes:Buffer.byteLength(json),digest:hash(json),assetCount:initial.data.assets.data.length};}
    for(let windowIndex=0;windowIndex<windows;windowIndex++){
        const window={index:windowIndex,startTime:performance.now(),memoryBefore:memory(),warmupIterations:[],iterations:[]};report.windows.push(window);
        for(let i=0;i<3;i++){const startTime=performance.now(),value=await operation(),endTime=performance.now();assert.equal(value.data.assets.data.length,report.workload.assets);window.warmupIterations.push({startTime,endTime});}
        window.measureStart=performance.now();
        for(let i=0;i<samples;i++){
            const reads={},cpuBefore=process.cpuUsage(),startTime=performance.now();
            const value=await operation(reads),projectedAt=performance.now(),json=JSON.stringify(value),serializedAt=performance.now(),cpu=process.cpuUsage(cpuBefore),endTime=performance.now();
            assert.equal(value.data.assets.data.length,report.workload.assets);
            window.iterations.push({index:i,startTime,projectedAt,serializedAt,endTime,projectionMs:projectedAt-startTime,serializationMs:serializedAt-projectedAt,totalMs:endTime-startTime,cpuMs:(cpu.user+cpu.system)/1000,reads});
            if(windowIndex===windows-1&&i===samples-1)lastJson=json;
            // No per-sample hashing, byte walk, forced GC or sampling profiler.
            await nextTurn();
        }
        window.measureEnd=performance.now();window.memoryAfter=memory();window.endTime=performance.now();await nextTurn();
    }
    report.responseAfter={bytes:Buffer.byteLength(lastJson),digest:hash(lastJson)};
    assert.deepEqual(report.responseAfter,{bytes:report.responseBefore.bytes,digest:report.responseBefore.digest},'State output changed during diagnostic');
    app.store.snapshot=snapshotOriginal;snapshotOriginal=null;
    if(process.env.KAIRO_STATE_CPU_PROFILE==='1'){
        const session=new Session();session.connect();const post=(method,params={})=>new Promise((ok,bad)=>session.post(method,params,(error,value)=>error?bad(error):ok(value)));
        try{await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:100});await post('Profiler.start');report.cpuProfilePhase={startTime:performance.now(),iterations:30};for(let i=0;i<30;i++){JSON.stringify(await operation());await nextTurn();}report.cpuProfilePhase.endTime=performance.now();const{profile}=await post('Profiler.stop');await writeFile(join(output,'state-projection.cpuprofile'),JSON.stringify(profile));}finally{session.disconnect();}
    }
    await nextTurn();await nextTurn();observeGc(gcObserver.takeRecords());
    for(const window of report.windows){
        for(const iteration of window.iterations){
            iteration.gc=report.gc.flatMap((event,index)=>{const duration=overlap(iteration,event);return duration?[{event:index,duration,projectionMs:overlap({startTime:iteration.startTime,endTime:iteration.projectedAt},event),serializationMs:overlap({startTime:iteration.projectedAt,endTime:iteration.serializedAt},event)}]:[];});
            iteration.tickOverlap=report.ticks.flatMap((event,index)=>overlap(iteration,{startTime:event.startTime,endTime:event.endTime??window.measureEnd})>0?[index]:[]);
        }
        window.summary={all:distribution(window.iterations.map(row=>row.totalMs)),gcOverlap:distribution(window.iterations.filter(row=>row.gc.length).map(row=>row.totalMs)),noGcOverlap:distribution(window.iterations.filter(row=>!row.gc.length).map(row=>row.totalMs)),tickOverlapCount:window.iterations.filter(row=>row.tickOverlap.length).length};
    }
    assert.equal(external,0);await verifySource(source);
    for(const[path,expected]of Object.entries(harnessHashes))assert.equal(hash(await readFile(new URL(path,import.meta.url))),expected,'Harness changed');
    report.sourceVerified=true;report.complete=true;
}catch(error){report.failure=error.stack;throw error;}
finally{
    if(snapshotOriginal&&app)app.store.snapshot=snapshotOriginal;
    try{await app?.close();assert.equal(external,0,'External request during cleanup');report.cleanupComplete=true;}catch(error){report.cleanupFailure=error.stack;report.complete=false;}
    await nextTurn();gcObserver.disconnect();report.externalAttempts=external;report.endedAt=new Date().toISOString();
    await writeFile(join(output,'diagnostic.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
assert.equal(report.complete,true,'Diagnostic or cleanup failed; retained diagnostic.json records the failure');
console.log(JSON.stringify({complete:report.complete,source:report.source.commit,scheduler,windows:report.windows.map(row=>row.summary),externalAttempts:external}));
