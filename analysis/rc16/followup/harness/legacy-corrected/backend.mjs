import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fixtureProcess} from './process.mjs';
import {distribution,environment,numberOption,writeReport} from './metrics.mjs';

const out=resolve(process.env.KAIRO_PERF_OUTPUT||'performance-results');await mkdir(out,{recursive:true});
const iterations=numberOption('KAIRO_PERF_ITERATIONS',10,3,100),idleSeconds=numberOption('KAIRO_PERF_IDLE_SECONDS',35,5,600);
const selected=(process.env.KAIRO_PERF_PROFILES||'typical,stress').split(',');
const report={schemaVersion:1,suite:'backend',environment:environment(),settings:{iterations,warmups:3,idleSeconds,serialization:true,scope:'controlled-legacy-warm-cache-corrected-storms',newUniverseTicks:'enabled',datasetAutomaticStart:'deferred',network:'all worker fetch calls blocked; expect zero',publicFeedCaches:'thera/turnur/wormhole_types/combat empty arrays; storms {storms:[],points:[]}; all ready with +7-day expiry and next_at; real tick success audited'},profiles:[],complete:false};
try{
  for(const profile of selected){
    const worker=await fixtureProcess(profile,true),entry={profile,workload:worker.spec,startupMs:worker.startupMs,feedStateValidation:worker.feedStateValidation,operations:[]};report.profiles.push(entry);
    try{
      // Restored fresh snapshots keep real scheduler paths active with no EVE calls.
      await delay(1000);await worker.rpc('meter_start');await delay(idleSeconds*1000);entry.idle=await worker.rpc('meter_stop');assert.equal(entry.idle.networkAttempts,0);
      for(const name of ['opsec','state','journey','session','market_browse','market_report','imports_warm','imports_after_write']){
        const value=await worker.rpc('bench',{name,iterations,warmups:3,profilePath:process.env.KAIRO_PERF_CPU_PROFILE==='1'?join(out,profile+'-'+name+'.cpuprofile'):null});
        assert.equal(value.networkAttempts,0);entry.operations.push(value);console.log(`${profile}/${name}: p50 ${value.latencyMs.p50.toFixed(2)} ms; ${(value.responseBytes/1024).toFixed(1)} KiB`);
      }
      // Actual authenticated loopback HTTP, measured by a separate observer.
      const page=await fetch(worker.origin);assert.equal(page.status,200);await page.arrayBuffer();
      const cookie=page.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
      const samples=[];await worker.rpc('meter_start');
      for(let i=0;i<iterations+3;i++){
        const t=performance.now(),r=await fetch(worker.origin+'/api/state?character=42',{headers:{cookie}});assert.equal(r.status,200);const body=await r.json();assert.equal(body.data.assets.data.length,worker.spec.assets);if(i>=3)samples.push(performance.now()-t);
      }
      entry.http={name:'state_http',latencyMs:distribution(samples),server:await worker.rpc('meter_stop')};assert.equal(entry.http.server.networkAttempts,0);
    }finally{await worker.close();}
  }
  report.complete=true;
}finally{
  let md='# Kairo backend performance\n\nSynthetic data; Node CPU is expressed as a percentage of one logical core.\n\n';
  md+=`Commit: ${report.environment.commit} (dirty: ${report.environment.dirty}). Node ${report.environment.node}; ${report.environment.cpu}.\n\n`;
  for(const p of report.profiles){
    md+='| Profile / operation | p50 ms | p95 ms | Response KiB |\n|---|---:|---:|---:|\n';
    for(const op of p.operations)md+=`| ${p.profile} / ${op.name} | ${op.latencyMs.p50.toFixed(2)} | ${op.latencyMs.p95.toFixed(2)} | ${(op.responseBytes/1024).toFixed(1)} |\n`;
    if(p.idle)md+=`\n${p.profile} idle: ${p.idle.cpuPercentOneCore.toFixed(2)}% of one core over ${(p.idle.elapsedMs/1000).toFixed(1)} s; RSS ${(p.idle.rssAfterBytes/1048576).toFixed(1)} MiB; event loop p95 ${p.idle.eventLoopDelayP95Ms?.toFixed(2)} ms.\n\n`;
  }
  md+='\nElapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.\n';
  await writeReport('backend',report,md,out);
}
