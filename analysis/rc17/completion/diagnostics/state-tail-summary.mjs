// Independently recompute each process/window. Never pool correlated windows
// or substitute this diagnostic distribution for original benchmark acceptance.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]||''),hash=value=>createHash('sha256').update(value).digest('hex');
assert.ok(process.argv[2],'Provide a completed diagnostic run directory');
const completionBytes=await readFile(join(root,'completion.json')),completion=JSON.parse(completionBytes);
assert.equal(completion.complete,true);assert.equal(completion.endVerified,true);
const distribution=values=>{assert.ok(values.every(Number.isFinite));if(!values.length)return{count:0};const sorted=[...values].sort((a,b)=>a-b),q=p=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];return{count:sorted.length,p50:q(.5),p95:q(.95),max:sorted.at(-1)};};
const sum=values=>values.reduce((a,b)=>a+b,0),summary={schemaVersion:2,diagnosticOnly:true,performanceAcceptance:false,completionHash:hash(completionBytes),processes:[],limitations:['Each process and each correlated window remain separate observations.','GC/tick overlap is association, not allocation-owner attribution.','Instrumented phase durations are not original unchanged-backend performance acceptance.']};
for(const child of completion.children){
  assert.equal(child.complete,true);const bytes=await readFile(join(root,child.scheduler,`${child.name}-${child.index}`,'diagnostic.json'));assert.equal(hash(bytes),child.sha256,'Child evidence changed');const value=JSON.parse(bytes);
  assert.equal(value.complete,true);assert.equal(value.cleanupComplete,true);assert.equal(value.sourceVerified,true);assert.equal(value.externalAttempts,0);
  assert.equal(value.responseBefore.digest,completion.responseIdentity.digest);assert.equal(value.responseBefore.bytes,completion.responseIdentity.bytes);
  const process={name:child.name,repetition:child.index,scheduler:child.scheduler,source:value.source,response:value.responseBefore,windows:[],ticks:value.ticks.length};
  for(const window of value.windows){
    assert.equal(window.iterations.length,completion.config.samples??25);
    const rows=window.iterations,withGc=rows.filter(row=>row.gc.length),withoutGc=rows.filter(row=>!row.gc.length),reads={};
    for(const row of rows){assert.ok(row.startTime<=row.projectedAt&&row.projectedAt<=row.serializedAt&&row.serializedAt<=row.endTime);for(const[key,counts]of Object.entries(row.reads)){const aggregate=reads[key]||={calls:0,elapsedMs:0};aggregate.calls+=counts.calls;aggregate.elapsedMs+=counts.elapsedMs;}}
    const report={index:window.index,all:distribution(rows.map(row=>row.totalMs)),projection:distribution(rows.map(row=>row.projectionMs)),serialization:distribution(rows.map(row=>row.serializationMs)),cpu:distribution(rows.map(row=>row.cpuMs)),gcOverlap:distribution(withGc.map(row=>row.totalMs)),noGcOverlap:distribution(withoutGc.map(row=>row.totalMs)),gcOverlapMs:sum(rows.flatMap(row=>row.gc.map(event=>event.duration))),tickOverlapCount:rows.filter(row=>row.tickOverlap.length).length,reads,memoryBefore:window.memoryBefore,memoryAfter:window.memoryAfter};
    assert.deepEqual(report.all,window.summary.all,'Stored percentile differs from independent recomputation');process.windows.push(report);
  }
  summary.processes.push(process);
}
assert.equal(summary.processes.length,completion.config.order.length*completion.config.schedulers.length);
await writeFile(join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({diagnosticOnly:true,processes:summary.processes.length,completionHash:summary.completionHash,output:join(root,'summary.json')}));
