import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {distribution,numberOption} from './metrics.mjs';
import {compareReports} from './compare.mjs';
import {seedFixture,workload} from './fixture.mjs';
import {openStore} from '../../server/store.mjs';

test('nearest-rank quantiles preserve the slow tail and reject empty/nonfinite samples',()=>{
  const d=distribution(Array.from({length:20},(_,i)=>i+1));assert.equal(d.p50,10);assert.equal(d.p95,19);assert.equal(d.max,20);assert.throws(()=>distribution([]));assert.throws(()=>distribution([NaN]));
});
function report(){return {schemaVersion:1,complete:true,suite:'browser',settings:{seconds:35},environment:{cpu:'test',logicalCpus:4,platform:'linux',arch:'x64',node:'v24',runner:'local'},workload:{fingerprint:'same'},browser:{product:'test'},scenarios:[{name:'idle',rendererBusyPercent:1,server:{cpuPercentOneCore:1},requestsPerMinute:0,domNodes:100}]};}
test('comparison reports increases and handles a zero baseline without Infinity',()=>{
  const a=report(),b=report();b.scenarios[0].rendererBusyPercent=2;b.scenarios[0].requestsPerMinute=3;const r=compareReports(a,b);assert.equal(r[0].percent,100);assert.equal(r.find(v=>v.metric.endsWith('requestsPerMinute')).percent,null);
});
test('comparison refuses incomplete data, different machines, workloads, settings and browsers',()=>{
  for(const mutate of [b=>b.complete=false,b=>b.environment.cpu='other',b=>b.workload.fingerprint='other',b=>b.settings.seconds=5,b=>b.browser.product='other',b=>b.scenarios=[]]){const b=report();mutate(b);assert.throws(()=>compareReports(report(),b));}
});
test('comparison rejects corrupt metrics rather than claiming success',()=>{
  const b=report();b.scenarios[0].rendererBusyPercent=NaN;assert.throws(()=>compareReports(report(),b),/Invalid metric/);
});
test('synthetic profiles have stable identities and reject unknown profile names',()=>{
  assert.deepEqual(workload('typical'),workload('typical'));assert.notEqual(workload('typical').fingerprint,workload('stress').fingerprint);assert.throws(()=>workload('../actual-data'));
});
test('duration controls cannot disable an observation window or run unbounded',()=>{
  const key='KAIRO_TEST_DURATION';try{for(const value of ['0','-5','Infinity','oops','10001']){process.env[key]=value;assert.throws(()=>numberOption(key,35,5,600));}}finally{delete process.env[key];}
});
test('fixture contains the declared data and exclusively valued kills/losses',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'kairo-perf-test-'));let store;
  try{
    const spec=await seedFixture(dir,'typical',Date.parse('2026-09-14T12:00:00Z'));store=openStore(dir);
    for(const [table,count] of [['events',spec.events],['visits',spec.visits],['sessions',spec.sessions],['market_types',spec.marketTypes],['combat_records',spec.combat]])assert.equal(store.db.prepare('SELECT COUNT(*) n FROM '+table).get().n,count);
    const records=store.db.prepare('SELECT result,COUNT(*) n FROM combat_records GROUP BY result').all();assert.deepEqual(Object.fromEntries(records.map(r=>[r.result,r.n])),{kill:480,loss:120});assert.equal(store.snapshot(42,'assets').data.length,spec.assets);
  }finally{store?.close();await rm(dir,{recursive:true,force:true});}
});
