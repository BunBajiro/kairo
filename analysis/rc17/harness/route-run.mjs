// Balanced whole-itinerary route timings and separately instrumented preparation counts.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {loadSourceManifest,verifySource} from './source-manifest.mjs';
const self=fileURLToPath(import.meta.url),here=dirname(self);
if(process.env.KAIRO_ROUTE_COMPARISON_LOCKED!=='1'){
 const code=await new Promise((accept,reject)=>{const child=spawn('flock',['-x','/tmp/kairo-rc16-benchmark.lock',process.execPath,self,...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,KAIRO_ROUTE_COMPARISON_LOCKED:'1'}});child.on('error',reject);child.on('exit',code=>accept(code??1));});process.exit(code);
}
const [baselineArg,candidateArg,outputArg]=process.argv.slice(2);
assert.ok(baselineArg&&candidateArg&&outputArg,'Usage: node route-run.mjs <rc16-root> <candidate-root> <output-directory>');
const roots={baseline:resolve(baselineArg),candidate:resolve(candidateArg)},out=resolve(outputArg);
const manifests={baseline:await loadSourceManifest(process.env.KAIRO_BASELINE_MANIFEST,roots.baseline),candidate:await loadSourceManifest(process.env.KAIRO_CANDIDATE_MANIFEST,roots.candidate)};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const harnessFiles=['route-run.mjs','route-worker.mjs','source-manifest.mjs','legacy-discovery-fixture.mjs',...(await readdir(join(here,'backend'))).filter(name=>name.endsWith('.mjs')).map(name=>'backend/'+name)];
const harnessHashes=Object.fromEntries(await Promise.all(harnessFiles.map(async path=>[path,hash(await readFile(join(here,path)))])));
const report={schemaVersion:1,suite:'isolated-route-scaling',scope:'Standalone production Universe navigation, full static atlas and identical corrected stress database; no Core scheduler, HTTP, browser or external IO. Diagnostic counts are not latency measurements. Fixed clock makes the complete plan result directly comparable without masked fields.',
 source:Object.fromEntries(Object.entries(manifests).map(([name,m])=>[name,{commit:m.sourceCommit,fingerprint:m.fingerprint,dirty:m.dirty}])),harnessHashes,
 environment:{node:process.version,cpu:cpus()[0].model,logicalCpus:cpus().length,runUrl:process.env.GITHUB_RUN_ID?`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`:null},
 settings:{stops:[1,10,50],order:['baseline-1','candidate-1','candidate-2','baseline-2'],warmupsPerCase:2,samplesPerCase:9,timingIncludes:'Complete navigation.plan computation, final validation, persisted plan save and returned structured clone; excludes fixture setup, itinerary edits, source hashing and output assertions.'},runs:[],complete:false};
await mkdir(out,{recursive:true});
const save=()=>writeFile(join(out,'results.json'),JSON.stringify(report,null,2)+'\n');await save();
async function worker(name,mode,reverse=false){
 let stdout='',stderr='';
 await new Promise((accept,reject)=>{const child=spawn(process.execPath,[join(here,'route-worker.mjs'),mode,...reverse?['--reverse']:[]],{cwd:roots[name],env:{...process.env,KAIRO_PERF_APP_ROOT:roots[name]},stdio:['ignore','pipe','pipe']});child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.on('error',reject);child.on('exit',(code,signal)=>code===0?accept():reject(Error(`Route ${name}/${mode} failed (${signal||code}): ${stderr}`)));});
 const value=JSON.parse(stdout);assert.equal(value.complete,true);assert.equal(value.networkAttempts,0);
 assert.equal(value.fixture.discoveryPreparation.expectedMemberships,100,'The stress fixture preserves all 100 distinct legacy discoveries');
 assert.equal(value.fixture.discoveryPreparation.available,name==='candidate','Only the candidate owns a separate discovery membership table');
 if(name==='candidate')assert.equal(value.fixture.discoveryPreparation.seededMemberships,100,'Candidate discovery must represent a real upgrade');
 return {value,stderr};
}
try{
 for(const name of ['baseline','candidate']){
  const {value,stderr}=await worker(name,'diagnostics');
  for(const row of value.cases)assert.equal(row.diagnostics.graphBuilds,name==='baseline'?row.stops:1,name+' graph preparation count for '+row.stops+' stops');
  await writeFile(join(out,name+'-diagnostics.stderr.log'),stderr);report.runs.push({name:name+'-diagnostics',variant:name,...value});await save();
 }
 const expected=new Map(report.runs[0].cases.map(row=>[row.stops,row]));
 function check(run){for(const row of run.cases){const base=expected.get(row.stops);assert.equal(row.fixtureDigest,base.fixtureDigest);assert.equal(row.semanticDigest,base.semanticDigest,run.name+' changed preserved plan semantics');}}
 check(report.runs[1]);
 for(const name of report.settings.order){const variant=name.replace(/-[12]$/,''),{value,stderr}=await worker(variant,'timings',name.endsWith('-2'));const run={name,variant,...value};check(run);report.runs.push(run);await writeFile(join(out,name+'.stderr.log'),stderr);await save();}
 const percentile=(rows,q)=>{const sorted=[...rows].sort((a,b)=>a-b);return sorted[Math.ceil(sorted.length*q)-1];};
 report.summary=[1,10,50].map(stops=>({stops,...Object.fromEntries(['baseline','candidate'].map(variant=>{const runs=report.runs.filter(row=>row.mode==='timings'&&row.variant===variant).map(run=>({name:run.name,...run.cases.find(row=>row.stops===stops)}));return[variant,runs.map(row=>({run:row.name,n:row.latencyMs.length,medianMs:percentile(row.latencyMs,.5),p95Ms:percentile(row.latencyMs,.95),minMs:Math.min(...row.latencyMs),maxMs:Math.max(...row.latencyMs)}))];}))}));
 for(const [file,expectedHash]of Object.entries(harnessHashes))assert.equal(hash(await readFile(join(here,file))),expectedHash,file+' changed during measurement');
 for(const manifest of Object.values(manifests))await verifySource(manifest);
 report.sourceAndHarnessEndVerified=true;report.complete=true;
}catch(error){report.error=error.stack;throw error;}finally{await save();}
