// Fresh child per observation. No measurement shares a process with provenance IO.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {access, mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {loadSourceManifest, verifySource} from './source-manifest.mjs';
const self=fileURLToPath(import.meta.url), here=dirname(self);
if(process.env.KAIRO_MEMORY_LOCKED!=='1') {
  const code=await new Promise((done,reject)=>{
    const child=spawn('flock',['-x','/tmp/kairo-rc16-benchmark.lock',process.execPath,self,...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,KAIRO_MEMORY_LOCKED:'1'}});
    child.on('error',reject);child.on('exit',code=>done(code??1));
  });process.exit(code);
}
const [baselineArg,candidateArg,outputArg,lane='all']=process.argv.slice(2);
assert.ok(baselineArg&&candidateArg&&outputArg,'memory-runner.mjs <rc16-root> <candidate-root> <output> [all|residency|sessions]');
assert.ok(['all','residency','sessions'].includes(lane));
const destination=resolve(outputArg), sources={
  baseline:await loadSourceManifest(process.env.KAIRO_BASELINE_MANIFEST,baselineArg),
  candidate:await loadSourceManifest(process.env.KAIRO_CANDIDATE_MANIFEST,candidateArg),
};
assert.equal(sources.baseline.sourceCommit,'57c8dcc7fbd8fc2b62129498d1819050c78381a1','Fresh RC16 baseline required');
const sha=data=>createHash('sha256').update(data).digest('hex');
const harnessHashes={};
for(const name of ['memory-runner.mjs','memory-common.mjs','memory-residency.mjs','memory-sessions.mjs','source-manifest.mjs','legacy-discovery-fixture.mjs'])harnessHashes[name]=sha(await readFile(join(here,name)));
const jobs=[];
if(lane!=='sessions')for(const mode of ['ordinary','retention'])for(const [index,build] of ['baseline','candidate','candidate','baseline'].entries())jobs.push({script:'memory-residency.mjs',build,mode,index});
if(lane!=='residency') {
  for(const [index,build] of ['baseline','candidate','candidate','baseline'].entries())jobs.push({script:'memory-sessions.mjs',build,mode:'timings',index});
  for(const [index,build] of ['baseline','candidate'].entries())jobs.push({script:'memory-sessions.mjs',build,mode:'diagnostics',index});
}
await mkdir(destination,{recursive:true});
const progressPath=join(destination,'memory-'+lane+'-run.json');
const completionName='memory-'+lane+'-completed.json', completionPath=join(destination,completionName);
try { await access(completionPath); throw Error('Refusing to replace completed evidence: '+completionPath); }
catch(error) { if(error.code!=='ENOENT')throw error; }
for(const [name,manifest] of Object.entries(sources))await writeFile(join(destination,name+'-source.json'),JSON.stringify(manifest,null,2)+'\n');
const results=[],sessionSemantics=new Map();
const report={schemaVersion:2,runId:randomUUID(),completionRecord:completionName,startedAt:new Date().toISOString(),lane,lock:'/tmp/kairo-rc16-benchmark.lock',lockAcquisition:'Runner acquires one flock around all sequential fresh children; do not wrap in another flock.',order:'ABBA per comparable lane; SQL diagnostics separately',harnessHashes,
  sources:Object.fromEntries(Object.entries(sources).map(([key,source])=>[key,{sourceCommit:source.sourceCommit,fingerprint:source.fingerprint,dirty:source.dirty,manifest:key+'-source.json'}])),
  semanticFixtureComparisons:0,results,complete:false};
// Progress is replaceable diagnostic state. Only the separate write-once record
// published after every final guard can certify completion for this run.
const save=async()=>{
  const temporary=progressPath+'.'+process.pid+'.tmp';
  await writeFile(temporary,JSON.stringify(report,null,2)+'\n');
  await rename(temporary,progressPath);
};
await save();
try {
  for(const job of jobs) {
    const launchedAt=new Date().toISOString();
    const result=spawnSync(process.execPath,[...(job.mode==='retention'?['--expose-gc']:[]),join(here,job.script),job.build,job.mode],{
      encoding:'utf8',maxBuffer:12*1024*1024,timeout:120000,
      env:{...process.env,KAIRO_MEMORY_BASELINE_ROOT:sources.baseline.root,KAIRO_MEMORY_CANDIDATE_ROOT:sources.candidate.root},
    });
    const name=`memory-${job.script.includes('sessions')?'sessions':'residency'}-${job.mode}-${job.build}-${job.index+1}.json`;
    await writeFile(join(destination,name),result.stdout||'');
    if(result.stderr)await writeFile(join(destination,name.replace('.json','.stderr.log')),result.stderr);
    const row={...job,launchedAt,finishedAt:new Date().toISOString(),result:name,sha256:sha(result.stdout||''),exitCode:result.status,complete:false};
    results.push(row);
    if(result.status!==0||result.error)throw Error(`Failed ${name}: ${result.error||result.stderr}`);
    const parsed=JSON.parse(result.stdout);
    assert.equal(parsed.sourceCommit,sources[job.build].sourceCommit);assert.equal(parsed.sourceFingerprint,sources[job.build].fingerprint);
    assert.equal(parsed.complete,true);assert.equal(parsed.endVerified,true);assert.equal(parsed.networkAttempts,0);
    if(job.script.includes('sessions'))for(const entry of parsed.results) {
      const key=JSON.stringify(entry.fixture),actual=JSON.stringify({routeLength:entry.routeLength,groupCount:entry.groupCount,semantic:entry.semantic});
      if(sessionSemantics.has(key))assert.equal(actual,sessionSemantics.get(key),'Session timing/presence/combat group semantics must match');
      sessionSemantics.set(key,actual);
    }
    Object.assign(row,{complete:true,networkAttempts:parsed.networkAttempts});
    report.semanticFixtureComparisons=sessionSemantics.size;await save();
    process.stderr.write(name+' complete\n');
  }
  for(const source of Object.values(sources))await verifySource(source);
  for(const [name,expected] of Object.entries(harnessHashes))assert.equal(sha(await readFile(join(here,name))),expected,name+' changed during measurement');
  report.endVerified=true;report.finishedAt=new Date().toISOString();report.complete=true;
  await writeFile(completionPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}catch(error){report.error=error.stack;throw error;}
finally{await save();}
