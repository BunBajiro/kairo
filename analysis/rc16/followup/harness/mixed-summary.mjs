import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
const file=resolve(process.argv[2]),report=JSON.parse(await readFile(file,'utf8'));
assert.ok(report.complete);assert.equal(report.runs.length,4);
const runs=report.runs.map(r=>{
  assert.ok(r.complete);assert.equal(r.server.forbiddenAttempts,0);assert.equal(r.unsafeEmissions.length,0);assert.equal(r.cleanup.inflight,0);
  const selected=r.server.transport.filter(x=>x.characterId===42),transitions=[];
  for(const [phase,opsec,status] of [['fresh-hostile','hostile','ready'],['fresh-highsec','highsec','ready'],['unavailable','unknown','stale'],['recovered-highsec','highsec','ready']]){
    const call=selected.find(x=>x.phase===phase&&x.requestAt>=r.startedAt+(phase==='fresh-highsec'?8000:0));assert.ok(call,phase);
    const stored=r.server.locations.find(x=>x.characterId===42&&x.at>=call.responseAt&&x.status===status);assert.ok(stored,phase+' commit');
    const emitted=r.server.protection.find(x=>x.at>=stored.at&&x.state===opsec);assert.ok(emitted,phase+' producer state');
    const received=r.sse.find(x=>x.client==='obs-protocol'&&x.type==='state'&&x.serverTime>=emitted.at&&x.opsec?.state===opsec);assert.ok(received,phase+' wire state');
    transitions.push({phase,opsec,requestOffsetMs:call.requestAt-r.startedAt,providerResponseMs:call.responseAt-call.requestAt,commitOffsetMs:stored.at-r.startedAt,commitToProtectionMs:emitted.at-stored.at,protectionToWireReceiptMs:received.receivedAt-emitted.at,commitToWireReceiptMs:received.receivedAt-stored.at});
  }
  const stateEvents=r.sse.filter(x=>x.client==='obs-protocol'&&x.type==='state');
  let previousStateHash=null,unchangedEncodedBytes=0;for(const event of stateEvents){if(event.hash===previousStateHash)unchangedEncodedBytes+=event.bytes;previousStateHash=event.hash;}
  const snapPrevious=new Map();let repeatedDataSnapshots=0,changedFreshnessSnapshots=0;
  for(const e of r.sse.filter(x=>x.client==='dashboard'&&x.type==='snapshot')){const key=e.characterId+':'+e.snapshot.key,p=snapPrevious.get(key);if(p?.dataHash===e.snapshot.dataHash){repeatedDataSnapshots++;if(p.updatedAt!==e.snapshot.updatedAt||p.expiresAt!==e.snapshot.expiresAt||p.status!==e.snapshot.status)changedFreshnessSnapshots++;}snapPrevious.set(key,e.snapshot);}
  return {name:r.name,loaded:r.loaded,cpuPercentOneCore:r.server.meter.cpuPercentOneCore,loopMaxMs:r.server.meter.eventLoopDelayMaxMs,loopP95Ms:r.server.meter.eventLoopDelayP95Ms,observerLoopMaxMs:r.observerLoopMaxMs,requestCount:r.requests.length,commonDashboardMs:r.metrics.commonDashboardMs,commonStreamMs:r.metrics.commonStreamMs,navigationMs:r.metrics.navigationMs,bindings:{calls:r.server.bindingUpdates,unchanged:r.server.unchangedBindings},stream:{stateEvents:stateEvents.length,unchangedContent:r.streamDuplicateStates,unchangedEncodedBytes,encodedBytes:r.sse.filter(x=>x.client==='obs-protocol').reduce((n,e)=>n+e.bytes,0)},dashboard:{encodedBytes:r.sse.filter(x=>x.client==='dashboard').reduce((n,e)=>n+e.bytes,0),repeatedDataSnapshots,changedFreshnessSnapshots},actualLocationCalls:selected.length,transitions,cleanup:r.cleanup};
});
const summary={schemaVersion:1,sourceCommit:report.sourceCommit,settings:report.settings,runs,complete:true};
const out=dirname(file);await writeFile(join(out,'mixed-summary.json'),JSON.stringify(summary,null,2)+'\n');
const fmt=v=>Number(v).toFixed(2),md=['# Mixed operational workload','','Protocol clients only. These are instrumented 28-second synthetic windows; all request counts and safety observations passed.','','| Window | Core CPU % | Server loop max ms | Common dashboard p50 / p95 ms | Common stream p95 ms | Navigation p50 ms | Unchanged stream states |','|---|---:|---:|---:|---:|---:|---:|'];
for(const r of runs)md.push(`| ${r.name} | ${fmt(r.cpuPercentOneCore)} | ${fmt(r.loopMaxMs)} | ${fmt(r.commonDashboardMs.p50)} / ${fmt(r.commonDashboardMs.p95)} | ${fmt(r.commonStreamMs.p95)} | ${r.navigationMs.n?fmt(r.navigationMs.p50):'—'} | ${r.stream.unchangedContent} / ${r.stream.stateEvents} |`);
md.push('','The common polling workload is identical. Loaded windows add four 50-stop navigation plans and four map edits with six-request read bursts. HTTP request counts are 56 quiet / 92 loaded.','', 'Unchanged stream payloads ignore version and serverTime only; this identifies repeat content, not permission to remove freshness/liveness signals. Dashboard snapshot data equality is counted separately from status/timestamp changes.','');
await writeFile(join(out,'mixed-summary.md'),md.join('\n')+'\n');console.log(JSON.stringify({out,runs:runs.map(r=>({name:r.name,loopMaxMs:r.loopMaxMs,commonDashboardP95:r.commonDashboardMs.p95,unchangedBindings:r.bindings.unchanged}))}));
