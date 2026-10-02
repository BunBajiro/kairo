// External RC16/RC17 camera comparison; never imported by Kairo.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSourceManifest,verifySource} from './source-manifest.mjs';

const self=fileURLToPath(import.meta.url),here=dirname(self);
if(process.env.KAIRO_CAMERA_LOCKED!=='1'){
  const code=await new Promise((done,reject)=>{const child=spawn('flock',['-x','/tmp/kairo-rc16-benchmark.lock',process.execPath,self,...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,KAIRO_CAMERA_LOCKED:'1'}});child.on('error',reject);child.on('exit',code=>done(code??1));});process.exit(code);
}
const [baselineArg,candidateArg,outputArg]=process.argv.slice(2);
assert.ok(baselineArg&&candidateArg&&outputArg,'Usage: browser-camera-run.mjs <baseline-root> <candidate-root> <output-dir>');
const roots={baseline:resolve(baselineArg),candidate:resolve(candidateArg)},output=resolve(outputArg);
const manifests={baseline:await loadSourceManifest(process.env.KAIRO_BASELINE_MANIFEST,roots.baseline),candidate:await loadSourceManifest(process.env.KAIRO_CANDIDATE_MANIFEST,roots.candidate)};
for(const manifest of Object.values(manifests))assert.ok(manifest.builtFiles.some(file=>file.path==='dist/client/index.html'),'Both sources must be built');
const files=['browser-camera-run.mjs','browser-camera-worker.mjs','browser-camera-summary.mjs','source-manifest.mjs'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),harness={};for(const file of files)harness[file]=hash(await readFile(join(here,file)));
const result={schemaVersion:1,startedAt:new Date().toISOString(),complete:false,order:['baseline-1','candidate-1','candidate-2','baseline-2'],harness,
  source:Object.fromEntries(Object.entries(manifests).map(([name,m])=>[name,{root:m.root,commit:m.sourceCommit,fingerprint:m.fingerprint,dirty:m.dirty}])),
  method:'Fresh process/browser for every ABBA entry; 100/600-node real-gate fixtures; pair two reverses map-size order. Timings precede style-mutation and forced-GC diagnostics.',
  runUrl:process.env.GITHUB_RUN_ID?`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`:null};
await mkdir(output,{recursive:true});const save=()=>writeFile(join(output,'provenance.json'),JSON.stringify(result,null,2)+'\n');await save();
try{
 for(const name of result.order){const target=name.split('-')[0],manifest=target==='baseline'?process.env.KAIRO_BASELINE_MANIFEST:process.env.KAIRO_CANDIDATE_MANIFEST;
  await new Promise((accept,reject)=>{const child=spawn(process.execPath,[join(here,'browser-camera-worker.mjs'),roots[target],join(output,name+'.json'),manifest,...(name.endsWith('-2')?['--reverse']:[])],{stdio:'inherit',env:{...process.env,KAIRO_CAMERA_RUN:name}});child.on('error',reject);child.on('exit',(code,signal)=>code===0?accept():reject(Error(name+' failed: '+(signal||code))));});
 }
 const runs=await Promise.all(result.order.map(name=>readFile(join(output,name+'.json'),'utf8').then(JSON.parse)));
 assert.ok(runs.every(run=>run.complete&&run.sourceVerified),'All four browser entries must complete');
 assert.equal(new Set(runs.map(run=>run.fixture.digest)).size,1,'Canonical graph must match across applications and repetitions');
 assert.equal(new Set(runs.map(run=>JSON.stringify(run.environment.browser))).size,1,'All entries must use the same Chrome build');
 for(const nodes of [100,600])assert.equal(new Set(runs.map(run=>JSON.stringify(run.samples.find(sample=>sample.nodes===nodes&&sample.name==='zoom').mapViewport))).size,1,'Selected map viewport dimensions must match across runs');
 for(const nodes of [100,600])assert.equal(new Set(runs.map(run=>JSON.stringify(run.samples.find(sample=>sample.nodes===nodes&&sample.name==='pan').gestureOrigin))).size,1,'Viewport-relative pan gesture origin must match across runs');
 for(const [file,expected] of Object.entries(harness))assert.equal(hash(await readFile(join(here,file))),expected,'Harness changed: '+file);
 for(const manifest of Object.values(manifests))await verifySource(manifest);
 result.fixtureDigest=runs[0].fixture.digest;result.endVerified=true;result.complete=true;
}catch(error){result.failure=error.stack;throw error;}finally{result.endedAt=new Date().toISOString();await save();}
