// External idle attribution only; imports the frozen corrected fixture unchanged.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {Session} from 'node:inspector';
import {DatabaseSync} from 'node:sqlite';
import {seedFixture} from '../harness/backend/fixture.mjs';
import {appModule} from '../harness/backend/target.mjs';
const {startKairo}=await appModule('server/index.mjs');
assert.equal(process.env.KAIRO_CPU_INVESTIGATION_LOCKED,'1','Use the locking CPU investigation runner');
const [mode,out,warmInput,windowInput,countInput]=process.argv.slice(2);
assert(['observe','profile','counts'].includes(mode));
const warmMs=Number(warmInput),windowMs=Number(windowInput),windowCount=Number(countInput);
assert.equal(warmMs,30000);assert.equal(windowMs,30000);assert.equal(windowCount,mode==='observe'?3:1);
const counters={},timings={},rejections=[];let app,networkAttempts=0,restorers=[],profileSession;
function add(key,amount=1){counters[key]=(counters[key]||0)+amount;}
function delta(before,after){return Object.fromEntries([...new Set([...Object.keys(before),...Object.keys(after)])].map(key=>[key,(after[key]||0)-(before[key]||0)]));}
function timing(key,start){const elapsed=performance.now()-start;timings[key]=(timings[key]||0)+elapsed;}
function wrap(object,key,label,{timed=false}={}){
 if(!object||typeof object[key]!=='function')return false;
 const original=object[key];object[key]=function(...args){add(label+'.calls');const start=timed?performance.now():0;
  try{return Reflect.apply(original,this,args);}finally{if(timed)timing(label,start);}
 };restorers.push(()=>{object[key]=original;});return true;
}
function installCounts(){
 // Diagnostic mode only: low-cardinality counts and aggregate synchronous time.
 for(const [object,key,label] of [[app.core.stream,'setBindings','stream.setBindings'],[app.core.stream,'config','stream.config'],[app.core.stream,'setOPSEC','stream.setOPSEC'],[app.auth,'characters','auth.characters'],[app.core.universe,'refreshPolitics','universe.refreshPolitics'],[app.core.universe.operations,'tick','universe.operations.tick'],[app.core.universe.feeds,'tick','universe.feeds.tick'],[app.core.universe.jspace,'cleanupSources','universe.jspace.cleanupSources'],[app.core.combat,'syncPublic','combat.syncPublic'],[app.core.sessionCombat,'syncRecent','sessionCombat.syncRecent']])wrap(object,key,label,{timed:true});
 for(const key of ['snapshot','snapshotMetadata','get'])if(typeof app.store[key]==='function'){
  const original=app.store[key];app.store[key]=function(...args){add('store.'+key+'.'+String(key==='get'?args[0]:args[1]));return Reflect.apply(original,this,args);};restorers.push(()=>{app.store[key]=original;});
 }
 const emit=app.core.bus.emit;app.core.bus.emit=function(event,...args){add('bus.emit.'+String(event?.type));return Reflect.apply(emit,this,[event,...args]);};restorers.push(()=>{app.core.bus.emit=emit;});
 const parse=JSON.parse;JSON.parse=function(value,...args){add('JSON.parse.calls');if(typeof value==='string')add('JSON.parse.inputCharacters',value.length);return Reflect.apply(parse,this,[value,...args]);};restorers.push(()=>{JSON.parse=parse;});
}
function installSQLCounts(){
 const original=DatabaseSync.prototype.prepare;
 DatabaseSync.prototype.prepare=function(sql,...args){const statement=Reflect.apply(original,this,[sql,...args]);return new Proxy(statement,{get(target,key){const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;if(!['get','all','run'].includes(key))return value.bind(target);return(...params)=>{add('sql.'+key+'.'+sql);return Reflect.apply(value,target,params);};}});};
 restorers.push(()=>{DatabaseSync.prototype.prepare=original;});
}
function politicsQueueCount(){return Number(app.store.db.prepare('SELECT COUNT(*) AS count FROM universe_politics_queue').get().count);}
function auditTicks(){
 const original=app.core.universe.tick;
 app.core.universe.tick=function(...args){add('universe.tick.started');add('universe.tick.pending');
  let result;try{result=Reflect.apply(original,this,args);}catch(error){add('universe.tick.pending',-1);add('universe.tick.rejected');rejections.push(String(error.stack||error));throw error;}
  return Promise.resolve(result).then(results=>{
   add('universe.tick.completed');add('universe.tick.pending',-1);assert.ok(Array.isArray(results));assert.equal(results.length,2,'Pinned Universe tick has operations and feeds subtasks');
   for(const [i,row] of results.entries()){add('universe.'+['operations','feeds'][i]+'.'+row.status);if(row.status==='rejected')rejections.push(String(row.reason?.stack||row.reason));}
   if(results.every(row=>row.status==='fulfilled'))add('universe.tick.successful');return results;
  },error=>{add('universe.tick.pending',-1);add('universe.tick.rejected');rejections.push(String(error.stack||error));throw error;});
 };
 restorers.push(()=>{app.core.universe.tick=original;});
}
const blockedFetch=async()=>{networkAttempts++;throw new Error('External requests forbidden in idle CPU investigation');};globalThis.fetch=blockedFetch;
async function port(){const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const value=server.address().port;await new Promise(resolve=>server.close(resolve));return value;}
const dir=await mkdtemp(join(tmpdir(),'kairo-cpu-idle-'));
const report={schemaVersion:1,mode,diagnosticOnly:mode!=='observe',profiled:mode==='profile',warmupMs:warmMs,windowTargetMs:windowMs,windowCount,
 measurementNote:mode==='observe'?'No Inspector, SQL, snapshot or binding instrumentation. Only the same low-frequency Universe tick completion audit used by the corrected baseline; window deltas replace cumulative counts.':'Attribution only: instrumentation overhead is included; do not mix these CPU/latency values with observation-mode evidence.',
 fixture:'Frozen analysis/rc17/harness/backend/fixture.mjs stress workload',scheduler:'Real application timers; no manual sync/tick invocation',network:'All fetch calls blocked; require zero attempts',datasetAutomaticStart:'deferred',clients:'No dashboard/OBS clients or requests',startedAt:new Date().toISOString(),windows:[],complete:false};
try{
 if(mode==='counts')installSQLCounts();
 report.spec=await seedFixture(join(dir,'data'),'stress');
 const dashboardPort=await port();let streamPort=await port();while(streamPort===dashboardPort)streamPort=await port();
 const start=performance.now();
 app=await startKairo({port:dashboardPort,streamPort,dataDir:join(dir,'data'),noSync:false,fetcher:blockedFetch,combatFetcher:blockedFetch,sessionFeedFetcher:blockedFetch,markets:{historyFetcher:blockedFetch},universe:{feeds:{fetcher:blockedFetch}},datasets:{fetcher:blockedFetch},deferDatasetStart:true});
 report.startupMs=performance.now()-start;
 const feeds=app.core.universe.feeds.state();assert.ok(Array.isArray(feeds.storms)&&Array.isArray(feeds.points));assert.equal(feeds.sources.storms.status,'ready');report.feedStateValidation={storms:feeds.storms.length,points:feeds.points.length,status:feeds.sources.storms.status};
 auditTicks();if(mode==='counts')installCounts();
 report.politicsQueueAtStartup=politicsQueueCount();
 const warmBefore={...counters};await delay(warmMs);report.warmup={tickAndTaskDeltas:delta(warmBefore,counters),networkAttempts};
 report.politicsQueueAfterWarmup=politicsQueueCount();assert.equal(report.politicsQueueAfterWarmup,0,'Steady-state diagnosis requires drained Politics startup backlog');
 assert.ok((counters['universe.tick.successful']||0)>=8,'Warm-up must exercise at least eight real scheduler ticks');assert.deepEqual(rejections,[]);assert.equal(networkAttempts,0);
 let post;
 if(mode==='profile'){
  profileSession=new Session();profileSession.connect();post=(method,params={})=>new Promise((resolve,reject)=>profileSession.post(method,params,(error,result)=>error?reject(error):resolve(result)));
  await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});await post('Profiler.start');
 }
 let previousEnd=null;
 for(let index=0;index<windowCount;index++){
  const loop=monitorEventLoopDelay({resolution:10});loop.enable();
  const memory=process.memoryUsage(),countsBefore={...counters},timingsBefore={...timings},pendingBefore=counters['universe.tick.pending']||0;
  let peakRssBytes=memory.rss;const sampler=setInterval(()=>{peakRssBytes=Math.max(peakRssBytes,process.memoryUsage().rss);},250);sampler.unref();
  const elu=performance.eventLoopUtilization(),cpu=process.cpuUsage(),wall=performance.now(),startedAt=new Date().toISOString();
  await delay(windowMs);
  const endWall=performance.now(),used=process.cpuUsage(cpu),endElu=performance.eventLoopUtilization(elu),elapsedMs=endWall-wall;
  clearInterval(sampler);loop.disable();const endMemory=process.memoryUsage();
  report.windows.push({index:index+1,startedAt,endedAt:new Date().toISOString(),elapsedMs,gapAfterPreviousWindowMs:previousEnd===null?null:wall-previousEnd,
   cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,cpuMs:(used.user+used.system)/1000,cpuPercentOneCore:(used.user+used.system)/elapsedMs/10,
   eventLoopUtilization:endElu.utilization,eventLoopDelaySamples:loop.count,eventLoopDelayP95Ms:loop.count?loop.percentile(95)/1e6:null,eventLoopDelayMaxMs:loop.count?loop.max/1e6:null,
   rssBeforeBytes:memory.rss,rssAfterBytes:endMemory.rss,peakRssBytes:Math.max(peakRssBytes,endMemory.rss),heapBeforeBytes:memory.heapUsed,heapAfterBytes:endMemory.heapUsed,
   counts:delta(countsBefore,counters),synchronousDurationMs:delta(timingsBefore,timings),pendingTicksBefore:pendingBefore,pendingTicksAfter:counters['universe.tick.pending']||0,
   pendingSemantic:app.core.bus.health?.()||null,networkAttempts});report.windows.at(-1).politicsQueueAfter=politicsQueueCount();previousEnd=endWall;
 }
 if(mode==='profile'){const {profile}=await post('Profiler.stop');report.profile={path:'idle.cpuprofile',samplingIntervalUs:1000,nodes:profile.nodes.length,samples:profile.samples?.length||0,durationUs:profile.endTime-profile.startTime};await writeFile(join(out,'idle.cpuprofile'),JSON.stringify(profile));profileSession.disconnect();profileSession=null;}
 for(const window of report.windows){assert.equal(window.networkAttempts,0);assert.ok(window.counts['universe.tick.successful']>=8,'Each window needs successful real ticks');assert.equal(window.counts['universe.operations.fulfilled'],window.counts['universe.tick.successful']);assert.equal(window.counts['universe.feeds.fulfilled'],window.counts['universe.tick.successful']);}
 assert.deepEqual(rejections,[]);report.tickRejections=rejections;report.finalClients={dashboard:app.core.uiClients.size,obs:app.core.stream.clients.size};assert.deepEqual(report.finalClients,{dashboard:0,obs:0});
 report.complete=true;
}catch(error){report.error=error.stack;throw error;}
finally{
 profileSession?.disconnect();for(const restore of restorers.reverse())restore();
 try{await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});report.cleanupComplete=true;}catch(error){report.cleanupError=error.stack;report.complete=false;throw error;}
 finally{report.finishedAt=new Date().toISOString();await mkdir(out,{recursive:true});await writeFile(join(out,'idle.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({mode,complete:report.complete,output:out,windows:report.windows.length,networkAttempts}));}
}
