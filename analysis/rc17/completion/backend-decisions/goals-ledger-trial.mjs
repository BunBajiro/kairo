// Source-pinned Goals retained-ledger trial. Default is a non-timed diagnostic.
// KAIRO_DECISION_TIMED=1 requires the coordinator's exclusive timing slot.
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const repo=resolve(process.env.KAIRO_BENCH_REPO||'.'),timed=process.env.KAIRO_DECISION_TIMED==='1',output=process.env.KAIRO_DECISION_OUTPUT||'goals-ledger-trial.json';
const {openStore}=await import(pathToFileURL(join(repo,'server/store.mjs'))),{createGoals}=await import(pathToFileURL(join(repo,'server/goals.mjs'))),{allScopes}=await import(pathToFileURL(join(repo,'server/modules/catalog.mjs')));
const hash=v=>createHash('sha256').update(v).digest('hex'),result={kind:timed?'ordinary-goal-ledger-timings':'deterministic-goal-ledger-diagnostic',sourceCommit:process.env.KAIRO_BENCH_SOURCE_COMMIT||null,node:process.version,sourceHashes:{},harnessSha256:hash(await readFile(new URL(import.meta.url))),cases:[],limits:['Synthetic retained income-credit ledgers:100/10000/100000 rows;100000 is a stress scenario, not a typical player claim.','50 recent records remain in the source window while older credits are retained. No production aggregate introduced.','Diagnostic SQL wrappers are absent from ordinary timing mode. Compare matched immutable source candidates in ABBA order.']};
for(const file of ['server/goals.mjs','server/store.mjs'])result.sourceHashes[file]=hash(await readFile(join(repo,file)));
for(const retained of [100,10000,100000]){
 const dir=await mkdtemp(join(tmpdir(),'kairo-ledger-trial-')),store=openStore(dir),now=Date.now(),iso=t=>new Date(t).toISOString(),published=[];
 try{
  store.db.prepare('INSERT INTO goals VALUES(?,42,?,?,?,?,0,?)').run('income','Income',retained+1000000,retained,'esi',iso(now-365*86400000));
  store.db.prepare('INSERT INTO goal_tracking(goal_id,source) VALUES(?,?)').run('income','wallet.income');
  const put=store.db.prepare('INSERT INTO goal_progress_entries VALUES(?,?,?,?)');store.db.exec('BEGIN');for(let i=1;i<=retained;i++)put.run('income','journal:'+i,1,1);store.db.exec('COMMIT');
  const recent=Array.from({length:50},(_,i)=>({id:retained-49+i,amount:1,date:iso(now-1000)})),sample=data=>({status:'ready',data,updatedAt:iso(now),expiresAt:iso(now+3600000)});
  store.saveSnapshot(42,'journal',sample(recent));
  let sums=0,lookups=0,writes=0;
  if(!timed){const prepare=store.db.prepare.bind(store.db);store.db.prepare=sql=>{const stmt=prepare(sql);for(const method of ['get','run'])if(typeof stmt[method]==='function'){const operation=stmt[method].bind(stmt);stmt[method]=(...args)=>{if(/SUM\(credited\)/.test(sql))sums++;if(/^SELECT observed,credited/.test(sql))lookups++;if(/^INSERT INTO goal_progress_entries/.test(sql))writes++;return operation(...args);};}return stmt;};}
  const service=createGoals(store,{characters:()=>[{id:42,scopes:allScopes}]},event=>published.push(event));service.refresh(42,'journal');sums=lookups=writes=0;
  const shape=()=>({progress:store.db.prepare("SELECT progress FROM goals WHERE id='income'").get().progress,rows:store.db.prepare('SELECT count(*) n FROM goal_progress_entries').get().n,total:store.db.prepare('SELECT SUM(credited) n FROM goal_progress_entries').get().n});
  const before=shape(),changes=()=>store.db.prepare('SELECT total_changes() n').get().n,unchangedWrites=changes(),loops=timed?100:3,start=timed?performance.now():0,cpu=timed?process.cpuUsage():null;
  sums=lookups=writes=0;
  for(let i=0;i<loops;i++)assert.equal(service.refresh(42,'journal'),0);
  const unchanged=timed?{loops,elapsedMs:performance.now()-start,cpu:process.cpuUsage(cpu)}:{loops,sumQueries:sums,entryLookups:lookups,ledgerWrites:writes};unchanged.databaseWrites=changes()-unchangedWrites;assert.equal(unchanged.databaseWrites,0);
  const newRows=recent.map((row,i)=>({...row,amount:i===0?3:row.amount}));for(let i=1;i<=10;i++)newRows.push({id:retained+i,amount:5,date:iso(now-1000)});store.saveSnapshot(42,'journal',sample(newRows));sums=lookups=writes=0;
  const newStart=timed?performance.now():0;assert.equal(service.refresh(42,'journal'),1);const addition=timed?{elapsedMs:performance.now()-newStart}:{sumQueries:sums,entryLookups:lookups,ledgerWrites:writes};
  const after=shape();assert.deepEqual(after,{progress:retained+52,rows:retained+10,total:retained+52});assert.equal(published.length,0);assert.equal(service.refresh(42,'journal'),0);
  const ledger=store.db.prepare('SELECT entry_key,observed,credited FROM goal_progress_entries ORDER BY entry_key').all();
  result.cases.push({retained,currentWindow:50,before,unchanged,addition,after,ledgerSha256:hash(JSON.stringify(ledger)),publishedEvents:published.length});
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
}
await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,kind:result.kind,cases:result.cases.length}));
