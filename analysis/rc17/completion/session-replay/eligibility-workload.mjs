// Ordinary host measurements must run alone under /tmp/kairo-rc16-benchmark.lock.
// KAIRO_SESSION_DIAGNOSTIC=1 simulates time and counts SQL; never compare its timings.
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
const repo=resolve(process.env.KAIRO_BENCH_REPO||'.'),output=resolve(process.env.KAIRO_SESSION_OUTPUT||'session-eligibility-workload.json');
const diagnostic=process.env.KAIRO_SESSION_DIAGNOSTIC==='1',archived=Number(process.env.KAIRO_SESSION_ARCHIVED||10000),pilots=Number(process.env.KAIRO_SESSION_PILOTS||4);
const {openStore}=await import(pathToFileURL(join(repo,'server/store.mjs'))),{createSessionCombat}=await import(pathToFileURL(join(repo,'server/session-combat.mjs')));
const dir=await mkdtemp(join(tmpdir(),'kairo-session-workload-')),store=openStore(dir),epoch=Date.parse('2026-10-07T10:00:00Z'),day=86400000,iso=n=>new Date(n).toISOString();let clock=epoch,collector;
const counts={ticks:0,syncRecentCalls:0,eligibilityQueries:0,returnedEligibleIds:0,sessionReads:0,routeQueries:0,routeRows:0,historyProviderCalls:0,liveProviderCalls:0};
const sourceHashes={};for(const file of ['server/session-combat.mjs','server/session-live.mjs','server/session-details.mjs','server/store.mjs'])sourceHashes[file]=createHash('sha256').update(await readFile(join(repo,file))).digest('hex');
const result={kind:diagnostic?'simulated-two-minute-diagnostic':'ordinary-two-minute-synthetic-workload',sourceCommit:process.env.KAIRO_BENCH_SOURCE_COMMIT||null,sourceHashes,harnessSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),node:process.version,archivedPerPilot:archived,pilots,cadenceMs:3000,intervalMs:120000,counts,actualTickOffsetsMs:[],eligibleIds:[],limits:['No external providers or real player data. Fixed synthetic responses preserve cadence and acknowledgement controls.','Diagnostic instrumentation counts returned rows, not internal SQLite rows examined.','A full suite of cardinalities requires six separate invocations per candidate, followed by matched ABBA ordinary runs.']};
try{
 const put=store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)'),putVisit=store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)');
 store.db.exec('BEGIN');for(let pilot=1;pilot<=pilots;pilot++){
  const startContext=JSON.stringify({system:{id:1,name:'Alpha'},alliance:{id:77,name:'Synthetic'}});
  for(let i=0;i<archived;i++)put.run(`${pilot}-old-${i}`,pilot,'old',iso(epoch-(i+3)*day),iso(epoch-(i+3)*day+3600000),startContext,'{}');
  for(const [id,start,end] of [['active',epoch-5*day,null],['recent1',epoch-400000,epoch-300000],['recent2',epoch-400000,epoch-200000],['boundary',epoch-2*day,epoch-day],['near-boundary',epoch-2*day,epoch-day+60000]]){
   const key=`${pilot}-${id}`;put.run(key,pilot,id,iso(start),end===null?null:iso(end),startContext,'{}');
   const count=id==='active'?1000:2;for(let i=0;i<count;i++)putVisit.run(pilot,1+i%11,'System '+(1+i%11),iso(start+i*(id==='active'?400000:1000)),key);
  }
 }store.db.exec('COMMIT; ANALYZE');
 let observedStore=store;
 if(diagnostic){const wrapped=new Proxy(store.db,{get(target,key){if(key!=='prepare'){const value=target[key];return typeof value==='function'?value.bind(target):value;}return sql=>{const stmt=target.prepare(sql);return new Proxy(stmt,{get(statement,method){const value=statement[method];if(typeof value!=='function')return value;return (...args)=>{const rows=value.apply(statement,args);if(method==='all'&&/SELECT id FROM/.test(sql)&&/ended>\?/.test(sql)){counts.eligibilityQueries++;counts.returnedEligibleIds+=rows.length;result.eligibleIds.push({clock,pilot:args[0],ids:rows.map(r=>r.id)});}if(method==='get'&&/SELECT \* FROM sessions WHERE id=/.test(sql))counts.sessionReads++;if(method==='all'&&/FROM visits/.test(sql)){counts.routeQueries++;counts.routeRows+=rows.length;}return rows;};}});};}});observedStore={...store,db:wrapped};}
 collector=createSessionCombat(observedStore,{characters:()=>Array.from({length:pilots},(_,i)=>({id:i+1}))},{request:async()=>{throw Error('No synthetic packet should require verification');}},{publicPage:async()=>{counts.historyProviderCalls++;return {refs:[],expiresAt:iso(epoch+3600000)};}},{now:()=>clock,feedOptions:{spacingMs:0},feedFetcher:async url=>{counts.liveProviderCalls++;return url.endsWith('sequence.json')?Response.json({sequence:100}):new Response('',{status:404});}});
 const start=performance.now(),cpu=process.cpuUsage(),loop=monitorEventLoopDelay({resolution:10});if(!diagnostic)loop.enable();
 for(let tick=0;tick<=120000;tick+=3000){if(!diagnostic)await delay(Math.max(0,start+tick-performance.now()));clock=epoch+(diagnostic?tick:Math.round(performance.now()-start));counts.ticks++;result.actualTickOffsetsMs.push(clock-epoch);for(let pilot=1;pilot<=pilots;pilot++){counts.syncRecentCalls++;await collector.syncRecent(pilot);}}
 if(!diagnostic){loop.disable();result.measurement={elapsedMs:performance.now()-start,cpu:process.cpuUsage(cpu),eventLoop:{p50Ms:loop.percentile(50)/1e6,p95Ms:loop.percentile(95)/1e6,maxMs:loop.max/1e6},memory:process.memoryUsage()};}
 result.liveState=store.get('session:live-feed',null);result.sessionStates=store.db.prepare("SELECT key,value FROM settings WHERE key LIKE 'session:combat:%' ORDER BY key").all().map(r=>({key:r.key,value:JSON.parse(r.value)}));
 result.databasePages=store.db.prepare('PRAGMA page_count').get().page_count;result.pageSize=store.db.prepare('PRAGMA page_size').get().page_size;
 await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,kind:result.kind,counts}));
}finally{await collector?.close();store.close();await rm(dir,{recursive:true,force:true});}
