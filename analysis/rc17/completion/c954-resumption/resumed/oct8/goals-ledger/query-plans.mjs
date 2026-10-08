// Untimed real-SQLite plan/cadence supplement; run only in the assigned slot.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const repo=resolve(process.env.KAIRO_BENCH_REPO), output=process.env.KAIRO_DECISION_OUTPUT;
const {openStore}=await import(pathToFileURL(join(repo,'server/store.mjs')));
const {goalSources}=await import(pathToFileURL(join(repo,'server/goals.mjs')));
const {pollIntervals,pollingBatches}=await import(pathToFileURL(join(repo,'server/polling.mjs')));
const source=await readFile(join(repo,'server/goals.mjs'),'utf8');
const keyed=source.match(/const entries = store\.db\.prepare\('([^']+)'\)/)?.[1];
const total=source.match(/const total = store\.db\.prepare\('([^']+)'\)/)?.[1];
assert.ok(keyed&&total, 'Exact prepared SQL could not be extracted');
const dir=await mkdtemp(join(tmpdir(),'kairo-goals-plans-')),store=openStore(dir);
try {
  const insert=store.db.prepare('INSERT INTO goals(id,character_id,title,target,progress,kind,done,created) VALUES(?,?,?,?,?,?,?,?)');
  for(const [id,progress] of [['income',100],['other',200]]) insert.run(id,42,id,1000000,progress,'esi',0,'2026-01-01T00:00:00.000Z');
  const put=store.db.prepare('INSERT INTO goal_progress_entries VALUES(?,?,?,?)');
  store.db.exec('BEGIN');
  for(let i=1;i<=100;i++){put.run('income','journal:'+i,1,1);put.run('other','journal:'+i,2,2);}
  store.db.exec('COMMIT');
  assert.equal(store.db.prepare(total).get('income').value,100);
  assert.equal(store.db.prepare(total).get('other').value,200);
  assert.deepEqual({...store.db.prepare(keyed).get('income','journal:1')},{observed:1,credited:1});
  const sourceHashes={};
  for(const file of ['server/goals.mjs','server/store.mjs','server/core.mjs','server/index.mjs','server/polling.mjs','server/modules/catalog.mjs']) sourceHashes[file]=createHash('sha256').update(await readFile(join(repo,file))).digest('hex');
  const result={kind:'untimed-real-sqlite-goals-query-plan',sourceCommit:process.env.KAIRO_BENCH_SOURCE_COMMIT,node:process.version,sourceHashes,
    sqlite:store.db.prepare('SELECT sqlite_version() version').get(),
    table:store.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='goal_progress_entries'").get(),
    indexes:store.db.prepare("PRAGMA index_list('goal_progress_entries')").all(),
    indexColumns:store.db.prepare("PRAGMA index_info('sqlite_autoindex_goal_progress_entries_1')").all(),
    queries:[{sql:total,args:['income'],plan:store.db.prepare('EXPLAIN QUERY PLAN '+total).all('income')},{sql:keyed,args:['income','journal:1'],plan:store.db.prepare('EXPLAIN QUERY PLAN '+keyed).all('income','journal:1')}],
    isolation:{incomeTotal:100,otherTotal:200,sharedEntryKey:'journal:1',passed:true},
    cadence:goalSources.filter(s=>['wallet.income','mining.quantity','industry.runs'].includes(s.id)).map(s=>({source:s.id,dataset:s.key,defaultSeconds:pollIntervals[s.key],supportedSeconds:pollingBatches[s.key].choices})),
    limits:['Source-policy defaults are not a hard cap: manual/creation/forced refresh paths exist.','This diagnostic has no elapsed-time acceptance claim.','Query plans show the existing schema, not a proposed aggregate/index.']};
  await writeFile(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({output,queries:result.queries.length,kind:result.kind}));
} finally {store.close();await rm(dir,{recursive:true,force:true});}
