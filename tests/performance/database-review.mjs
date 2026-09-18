// Internal review only: imports application code read-only and creates disposable
// synthetic databases. Experimental indexes/projections never touch the app tree.
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir,cpus,totalmem,platform,arch} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {seedFixture,PILOT,DESTINATION} from './fixture.mjs';

const root=resolve(process.argv[2]),out=resolve(process.argv[3]||'performance-results/database-review');
const app=path=>import(pathToFileURL(join(root,'server',path)).href);
const [{openStore},{createMarkets},{sessionReport},{journeyData},{saveHistory}]=await Promise.all(['store.mjs','markets.mjs','history.mjs','places.mjs','market-history.mjs'].map(app));
const NOW=Date.parse('2026-09-18T12:00:00Z'),DAY=86400000;
const dir=await mkdtemp(join(tmpdir(),'kairo-database-review-'));
await mkdir(out,{recursive:true});
const report={schemaVersion:1,application:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),harnessBase:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),environment:{node:process.version,sqlite:process.versions.sqlite,platform:platform(),arch:arch(),cpu:cpus()[0].model,logicalCpus:cpus().length,totalMemoryBytes:totalmem(),runner:process.env.GITHUB_ACTIONS?'github-actions':'workspace',runUrl:process.env.GITHUB_RUN_ID?`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`:null},fixedTime:new Date(NOW).toISOString(),notes:['Synthetic review probes, not a replacement for the full app performance suite.','The baseline fixture creates the unchanged persistent v0.7.2/v0.7.3 schema; all measured functions come from the specified application checkout.','SQL profiling is diagnostic and separate from timed comparisons. Experimental database objects exist only in the disposable fixture.']};
const stats=samples=>({samples,p50:[...samples].sort((a,b)=>a-b)[Math.floor(samples.length/2)],max:Math.max(...samples)});
async function measure(fn,n=5){await fn();const times=[];let value;for(let i=0;i<n;i++){const t=performance.now();value=await fn();times.push(performance.now()-t);}return {ms:stats(times),value};}
let store,markets;
try{
 console.log('Seeding unchanged larger fixture');await seedFixture(dir,'stress',NOW);
 store=openStore(dir);const db=store.db;
 const auth={characters:()=>db.prepare('SELECT id,name,scopes,reauth FROM characters ORDER BY name').all().map(c=>({...c,scopes:JSON.parse(c.scopes),needsReauth:!!c.reauth}))};
 markets=createMarkets(store,auth,{request:async()=>{throw new Error('External network forbidden');}},{autoUpgrade:false,now:()=>NOW});
 const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
 report.database={pragmas:Object.fromEntries(['journal_mode','synchronous','foreign_keys','busy_timeout','page_size','wal_autocheckpoint'].map(p=>[p,Object.values(db.prepare('PRAGMA '+p).get())[0]])),schema,tables:[]};
 for(const row of schema.filter(r=>r.type==='table'))report.database.tables.push({name:row.name,rows:db.prepare('SELECT COUNT(*) n FROM "'+row.name+'"').get().n});
 report.database.integrity=db.prepare('PRAGMA quick_check').get().quick_check;
 const original=db.prepare.bind(db);
 function sqlProfile(fn){
  const queries=new Map();
  db.prepare=sql=>{
   const t=performance.now(),statement=original(sql),elapsed=performance.now()-t;
   let row=queries.get(sql);if(!row){row={sql,prepares:0,prepareMs:0,executions:0,executeMs:0,rows:0};queries.set(sql,row);}row.prepares++;row.prepareMs+=elapsed;
   return new Proxy(statement,{get(target,key){const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;if(!['all','get','run'].includes(key))return value.bind(target);return (...args)=>{row.args??=args;const t=performance.now(),result=value.apply(target,args);row.executeMs+=performance.now()-t;row.executions++;row.rows+=Array.isArray(result)?result.length:result?1:0;return result;};}});
  };
  try{fn();}finally{db.prepare=original;}
  for(const q of queries.values()){try{q.plan=original('EXPLAIN QUERY PLAN '+q.sql).all(...q.args);}catch(e){q.planError=e.message;}}
  return [...queries.values()].sort((a,b)=>b.executeMs-a.executeMs);
 }
 console.log('Inspecting actual session, journey and market query plans');
 report.sqlProfiles={session:sqlProfile(()=>sessionReport(store,'benchmark-session',PILOT)),journey:sqlProfile(()=>journeyData(store,PILOT)),marketReport:sqlProfile(()=>markets.report(DESTINATION))};
 const session=()=>JSON.stringify(sessionReport(store,'benchmark-session',PILOT));
 let reference;
 report.eventIndex={index:'CREATE INDEX review_events_character_type_at ON events(character_id,type,at)',runs:[]};
 for(const mode of ['existing','experimental-index','experimental-index','existing']){
  if(mode==='experimental-index'&&!db.prepare("SELECT name FROM sqlite_schema WHERE name='review_events_character_type_at'").get())db.exec(report.eventIndex.index);
  if(mode==='existing')db.exec('DROP INDEX IF EXISTS review_events_character_type_at');
  const sample=await measure(session);reference??=sample.value;assert.equal(sample.value,reference);
  report.eventIndex.runs.push({mode,ms:sample.ms,responseBytes:Buffer.byteLength(sample.value)});
  if(mode==='experimental-index'&&!report.eventIndex.queryPlans)report.eventIndex.queryPlans=sqlProfile(()=>sessionReport(store,'benchmark-session',PILOT));
 }
 report.eventIndex.outputsEqual=true;
 console.log('Checking large-snapshot metadata without changing the persistent schema');
 const current=await measure(()=>store.snapshotMetadata(PILOT,'assets'),15);
 db.exec("CREATE TEMP TABLE review_snapshot_metadata AS SELECT character_id,key,json_extract(body,'$.status') status,json_extract(body,'$.scope') scope,json_extract(body,'$.ownerId') ownerId,json_extract(body,'$.refreshAt') refreshAt,json_extract(body,'$.expiresAt') expiresAt,json_extract(body,'$.retryAt') retryAt FROM snapshots; CREATE UNIQUE INDEX review_metadata_key ON review_snapshot_metadata(character_id,key)");
 const typed=db.prepare('SELECT status,scope,ownerId,refreshAt,expiresAt,retryAt FROM review_snapshot_metadata WHERE character_id=? AND key=?');
 const separated=await measure(()=>typed.get(PILOT,'assets'),15);assert.deepEqual(current.value,separated.value);
 report.snapshotMetadata={assets:20000,bodyBytes:db.prepare('SELECT length(body) n FROM snapshots WHERE character_id=? AND key=?').get(PILOT,'assets').n,currentMs:current.ms,experimentalSeparateMetadataMs:separated.ms,outputsEqual:true,note:'Read microbenchmark only. No synchronisation/invalidation or migration implemented; not an end-to-end idle-CPU claim.'};
 db.exec('DROP TABLE review_snapshot_metadata');
 console.log('Measuring history growth: 30 days, 365 days, then 30 days again');
 const first=db.prepare('SELECT body FROM market_history LIMIT 1').get().body,recent=JSON.parse(first);
 const old=Array.from({length:335},(_,i)=>({...recent[0],date:new Date(NOW-(31+i)*DAY).toISOString().slice(0,10)})).reverse();
 report.historyGrowth={types:db.prepare('SELECT COUNT(*) n FROM market_history').get().n,runs:[]};
 let cold=0,historyReference;
 for(const days of [30,365,30]){
  const body=days===30?first:JSON.stringify([...old,...recent]);db.prepare('UPDATE market_history SET body=?').run(body);
  const sample=await measure(async()=>{store.set('market:imports:review-invalidation',++cold);return JSON.stringify(await markets.imports.analyse(DESTINATION));},3);
  historyReference??=sample.value;assert.equal(sample.value,historyReference);
  report.historyGrowth.runs.push({days,storedJsonBytes:body.length*report.historyGrowth.types,coldAnalysisMs:sample.ms,responseBytes:Buffer.byteLength(sample.value)});
 }
 report.historyGrowth.outputsEqual=true;
 console.log('Comparing current history writes with 100-type transactional batches');
 const ids=db.prepare('SELECT type_id FROM market_history ORDER BY type_id LIMIT 1000').all().map(r=>r.type_id);
 report.historyWrites={types:ids.length,daysPerType:30,runs:[],note:'Same saveHistory function in both cases; each run yields every 100 types. Current code autocommits both rows per type; experimental batches use a transaction around each 100-type group. No durability settings changed.'};
 for(const mode of ['existing','experimental-batch','experimental-batch','existing']){
  const started=performance.now(),blocks=[];
  for(let offset=0;offset<ids.length;offset+=100){const t=performance.now();if(mode==='experimental-batch')db.exec('BEGIN IMMEDIATE');try{for(const id of ids.slice(offset,offset+100))saveHistory(store,10000043,id,recent,new Date(NOW).toISOString(),new Date(NOW+DAY).toISOString(),'EVE Ref',NOW);if(mode==='experimental-batch')db.exec('COMMIT');}catch(e){if(mode==='experimental-batch')db.exec('ROLLBACK');throw e;}blocks.push(performance.now()-t);await delay(0);}
  const totalMs=performance.now()-started;
  const rows=db.prepare('SELECT h.type_id,h.body,h.daily_volume,h.average,h.reported_days,m.source FROM market_history h JOIN market_history_meta m USING(region_id,type_id) WHERE h.type_id IN (SELECT value FROM json_each(?)) ORDER BY h.type_id').all(JSON.stringify(ids));
  report.historyWrites.reference??=JSON.stringify(rows);assert.equal(JSON.stringify(rows),report.historyWrites.reference);
  report.historyWrites.runs.push({mode,totalMs,synchronousBlockMs:stats(blocks)});
 }
 delete report.historyWrites.reference;report.historyWrites.outputsEqual=true;
 report.complete=true;
 await writeFile(join(out,'database-review.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({complete:true,output:join(out,'database-review.json'),sessionIndex:report.eventIndex.runs.map(r=>[r.mode,r.ms.p50]),historyGrowth:report.historyGrowth.runs.map(r=>[r.days,r.coldAnalysisMs.p50]),historyWrites:report.historyWrites.runs.map(r=>[r.mode,r.totalMs,r.synchronousBlockMs.max])}));
}finally{await markets?.close();store?.close();await rm(dir,{recursive:true,force:true});}
