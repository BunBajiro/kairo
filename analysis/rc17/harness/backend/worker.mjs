// IPC-controlled, disposable server. The observer runs in a different process.
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {performance} from 'node:perf_hooks';
import {Session} from 'node:inspector';
import {appModule} from './target.mjs';
const {startKairo}=await appModule('server/index.mjs');
const {sessionReport}=await appModule('server/history.mjs');
const {journeyData}=await appModule('server/places.mjs');
import {seedFixture,PILOT,DESTINATION} from './fixture.mjs';
import {distribution,startMeter} from './metrics.mjs';

const dir=await mkdtemp(join(tmpdir(),'kairo-perf-'));
if(process.env.KAIRO_LEGACY_CORRECTED_LOCKED!=='1')throw Error('Use the self-locking corrected legacy runner.');
let app,spec,meter,networkAttempts=0,mutation=0;
const tickAudit={applicable:false,calls:0,successes:0,rejections:[]};
let feedStateValidation={applicable:false,reason:'v0.7.3 has no Universe collector service'};
async function blockedFetch(url){networkAttempts++;throw new Error('External requests are blocked by the performance fixture.');}
globalThis.fetch=blockedFetch;
// Ports are OS-selected and checked again by startKairo. A collision fails visibly.
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const operations = {
  opsec:()=>{app.core.refreshOPSEC();return app.core.stream.getOPSEC();},
  state:()=>({data:app.core.snapshots(PILOT),names:app.core.names()}),
  journey:()=>journeyData(app.store,PILOT),
  session:()=>sessionReport(app.store,'benchmark-session',PILOT),
  market_browse:()=>app.core.markets.browse(DESTINATION,{category:'all'}),
  market_report:()=>app.core.markets.report(DESTINATION),
  imports_warm:()=>app.core.markets.imports.analyse(DESTINATION),
  // An unrelated setting update exposes overly broad cache invalidation.
  imports_after_write:()=>{app.store.set('benchmark:unrelated',++mutation);return app.core.markets.imports.analyse(DESTINATION);},
};
function validate(name,value){
  if(name==='state')assert.equal(value.data.assets.data.length,spec.assets);
  if(name==='journey')assert.equal(value.visits.length,Math.min(spec.visits,500));
  if(name==='session'){assert.equal(value.stats.events,spec.events);assert.equal(value.personalCombat.items.length,spec.combat);assert.ok(value.allianceCombat.items.length>0);}
  if(name==='market_browse'){assert.equal(value.total,spec.marketTypes);assert.equal(value.rows.length,60);}
  if(name==='market_report')assert.equal(value.items,spec.marketTypes);
  if(name.startsWith('imports')){assert.equal(value.screened,spec.marketTypes);assert.ok(value.groups.some(g=>g.qualified>0),'Import fixture must exercise successful opportunities.');}
}
async function bench({name,iterations,warmups,profilePath}){
  const operation=operations[name];if(!operation)throw new Error('Unknown operation: '+name);
  for(let i=0;i<warmups;i++)validate(name,await operation());
  const elapsed=[],cpu=[],sizes=[];
  // Include full JSON serialization, as the HTTP response path does.
  for(let i=0;i<iterations;i++){
    const c=process.cpuUsage(),t=performance.now(),value=await operation(),serialized=JSON.stringify(value),used=process.cpuUsage(c);
    elapsed.push(performance.now()-t);cpu.push((used.user+used.system)/1000);sizes.push(Buffer.byteLength(serialized));validate(name,value);
    await new Promise(setImmediate);
  }
  if(profilePath){
    const s=new Session();s.connect();const post=(m,p={})=>new Promise((r,j)=>s.post(m,p,(e,v)=>e?j(e):r(v)));
    try{await post('Profiler.enable');await post('Profiler.start');for(let i=0;i<3;i++)await operation();const {profile}=await post('Profiler.stop');await writeFile(profilePath,JSON.stringify(profile));}finally{s.disconnect();}
  }
  return {name,iterations,warmups,latencyMs:distribution(elapsed),cpuMs:distribution(cpu),responseBytes:Math.max(...sizes),memory:process.memoryUsage(),networkAttempts};
}
async function close(){if(app){await app.close();app=null;}await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
process.on('disconnect',()=>close().finally(()=>process.exit()));
process.on('message',async message=>{
  try{
    let result;
    if(message.action==='init'){
      spec=await seedFixture(join(dir,'data'),message.profile);
      const port1=await port();let port2=await port();while(port2===port1)port2=await port();
      const t=performance.now();
      app=await startKairo({port:port1,streamPort:port2,dataDir:join(dir,'data'),noSync:!message.scheduler,fetcher:blockedFetch,combatFetcher:blockedFetch,sessionFeedFetcher:blockedFetch,markets:{historyFetcher:blockedFetch},universe:{feeds:{fetcher:blockedFetch}},datasets:{fetcher:blockedFetch},deferDatasetStart:true});
      const startupMs=performance.now()-t;
      if(app.core.universe){
        const state=app.core.universe.feeds.state();assert.ok(Array.isArray(state.storms));assert.ok(Array.isArray(state.points));assert.equal(state.sources.storms.status,'ready');
        feedStateValidation={applicable:true,passed:true,storms:state.storms.length,points:state.points.length,sourceStatus:state.sources.storms.status};tickAudit.applicable=true;
        const originalTick=app.core.universe.tick;
        app.core.universe.tick=async(...args)=>{tickAudit.calls++;try{const results=await originalTick(...args);assert.ok(Array.isArray(results));const rejected=results.map((r,i)=>r.status==='rejected'?{index:i,error:String(r.reason?.stack||r.reason)}:null).filter(Boolean);if(rejected.length)tickAudit.rejections.push(...rejected);else tickAudit.successes++;return results;}catch(e){tickAudit.rejections.push({error:e.stack});throw e;}};
      }
      result={origin:app.origin,streamOrigin:app.streamOrigin,spec,startupMs,feedStateValidation};
    }else if(message.action==='bench')result=await bench(message);
    else if(message.action==='probe'){
      const original=app.store.snapshot,reads={};
      app.store.snapshot=(id,key)=>{const value=original(id,key),row=reads[key]??={calls:0,jsonBytes:0};row.calls++;row.jsonBytes+=Buffer.byteLength(JSON.stringify(value));return value;};
      try{
        if(message.scheduler){const tasks=[app.core.syncProtection(),app.core.sync(0),...app.auth.characters().map(c=>app.core.sync(c.id))];app.core.refreshOPSEC();await Promise.all(tasks);}
        else app.core.refreshOPSEC();
        result={snapshotReads:reads,networkAttempts};
      }finally{app.store.snapshot=original;}
    }
    else if(message.action==='meter_start'){assert.ok(!meter);meter=startMeter();result={};}
    else if(message.action==='meter_stop'){assert.ok(meter);result={...meter(),networkAttempts,tickAudit:structuredClone(tickAudit)};meter=null;assert.equal(tickAudit.rejections.length,0,'Universe tick subtask rejected');if(tickAudit.applicable)assert.ok(tickAudit.successes>=1,'No successful real scheduler ticks');}
    else if(message.action==='stream'){
      const config=app.core.stream.config();config.elements=Array.from({length:message.widgets},(_,i)=>({id:'benchmark-'+i,kind:i%2?'clock':'text',name:'Synthetic widget '+i,text:'Benchmark',label:'Synthetic',visible:true,x:i*20,y:i*20,width:350,height:100,fontSize:24,opacity:.7,color:'#97ebce',binding:'none'}));app.core.stream.save(config);result={};
    }else if(message.action==='close'){await close();process.send({id:message.id,result:{}});process.disconnect();return;}
    else throw new Error('Unknown worker action');
    process.send({id:message.id,result});
  }catch(error){process.send({id:message.id,error:error.stack});}
});
