// Independent CPU investigation lane. Existing accepted harnesses stay frozen.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {cpus,availableParallelism} from 'node:os';
import {loadSourceManifest,verifySource} from '../harness/source-manifest.mjs';
const self=fileURLToPath(import.meta.url),here=dirname(self),harness=resolve(here,'../harness');
const [mode,baselineArg,candidateArg,outputArg]=process.argv.slice(2);
assert(['observe','profile','counts'].includes(mode)&&baselineArg&&candidateArg&&outputArg,'Use idle-run.mjs observe|profile|counts <rc16-root> <candidate-root> <new-output-directory>');
async function child(command,args,options={}){await new Promise((resolve,reject)=>{const worker=spawn(command,args,{stdio:'inherit',...options});worker.once('error',reject);worker.once('exit',(code,signal)=>code===0?resolve():reject(Error(command+' failed: '+(signal||code))));});}
if(process.env.KAIRO_CPU_INVESTIGATION_LOCKED!=='1'){
 await child('flock',['-n','/tmp/kairo-rc16-benchmark.lock',process.execPath,self,...process.argv.slice(2)],{env:{...process.env,KAIRO_CPU_INVESTIGATION_LOCKED:'1'}});process.exit(0);
}
const roots={baseline:resolve(baselineArg),candidate:resolve(candidateArg)},out=resolve(outputArg);
const sources={baseline:await loadSourceManifest(process.env.KAIRO_BASELINE_MANIFEST,roots.baseline),candidate:await loadSourceManifest(process.env.KAIRO_CANDIDATE_MANIFEST,roots.candidate)};
assert.equal(sources.baseline.sourceCommit,'57c8dcc7fbd8fc2b62129498d1819050c78381a1','Use canonical RC16');
for(const value of Object.values(sources))assert.equal(value.dirty,false,'Freeze application checkouts before observing CPU');
await mkdir(dirname(out),{recursive:true});await mkdir(out); // Existing evidence cannot be overwritten.
const files=[join(here,'idle-run.mjs'),join(here,'idle-worker.mjs'),join(here,'README.md'),join(harness,'source-manifest.mjs'),join(harness,'legacy-discovery-fixture.mjs'),...(await readdir(join(harness,'backend'))).filter(f=>f.endsWith('.mjs')).map(f=>join(harness,'backend',f))];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fingerprints=async()=>Object.fromEntries(await Promise.all(files.map(async path=>[path,sha(await readFile(path))])));
const hashes=await fingerprints(),order=mode==='observe'?['baseline-1','candidate-1','candidate-2','baseline-2']:['baseline-1','candidate-1'];
const report={schemaVersion:1,mode,diagnosticOnly:mode!=='observe',order,startedAt:new Date().toISOString(),warmupSeconds:30,windowSeconds:30,windowsPerRun:mode==='observe'?3:1,
 cpu:{node:process.version,platform:process.platform,arch:process.arch,model:cpus()[0]?.model,visibleLogicalCpus:cpus().length,availableParallelism:availableParallelism()},
 source:Object.fromEntries(Object.entries(sources).map(([key,value])=>[key,{root:value.root,commit:value.sourceCommit,fingerprint:value.fingerprint,dirty:value.dirty}])),harnessHashes:hashes,runs:[],complete:false};
const save=()=>writeFile(join(out,'provenance.json'),JSON.stringify(report,null,2)+'\n');await save();
try{
 for(const name of order){
  const role=name.replace(/-[12]$/,''),target=join(out,name);await verifySource(sources[role]);assert.deepEqual(await fingerprints(),hashes);await mkdir(target);
  const entry={name,role,startedAt:new Date().toISOString(),complete:false};report.runs.push(entry);await save();console.log('IDLE CPU '+mode+' '+name+' warm-up30s, '+report.windowsPerRun+'×30s window(s)');
  await child(process.execPath,[join(here,'idle-worker.mjs'),mode,target,'30000','30000',String(report.windowsPerRun)],{cwd:roots[role],env:{...process.env,KAIRO_PERF_APP_ROOT:roots[role],KAIRO_PERF_APP_REF:sources[role].sourceCommit,KAIRO_DATA_DIR:'',KAIRO_PORT:'',KAIRO_STREAM_PORT:''}});
  const result=JSON.parse(await readFile(join(target,'idle.json'),'utf8'));assert.equal(result.complete,true);assert.equal(result.cleanupComplete,true);assert.equal(result.windows.length,report.windowsPerRun);
  for(const window of result.windows)assert.equal(window.networkAttempts,0);
  await verifySource(sources[role]);assert.deepEqual(await fingerprints(),hashes);entry.finishedAt=new Date().toISOString();entry.sourceEndVerified=true;entry.complete=true;await save();
 }
 assert.equal(new Set(await Promise.all(order.map(async name=>JSON.parse(await readFile(join(out,name,'idle.json'),'utf8')).spec.fingerprint))).size,1,'All observations use the exact corrected stress workload');
 for(const manifest of Object.values(sources))await verifySource(manifest);assert.deepEqual(await fingerprints(),hashes);report.complete=true;report.sourceAndHarnessEndVerified=true;
}catch(error){report.error=error.stack;throw error;}
finally{report.finishedAt=new Date().toISOString();await save();}
console.log(JSON.stringify({mode,complete:report.complete,output:out,order}));
