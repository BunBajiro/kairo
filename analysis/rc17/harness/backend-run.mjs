// Corrected warm-cache backend comparison. Historical harnesses stay frozen.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadSourceManifest, verifySource} from './source-manifest.mjs';

const self=fileURLToPath(import.meta.url), here=dirname(self);
if(process.env.KAIRO_LEGACY_CORRECTED_LOCKED!=='1') {
  const code=await new Promise((done,reject)=>{
    const child=spawn('flock',['-x','/tmp/kairo-rc16-benchmark.lock',process.execPath,self,...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,KAIRO_LEGACY_CORRECTED_LOCKED:'1'}});
    child.on('error',reject);child.on('exit',code=>done(code??1));
  });
  process.exit(code);
}
const [baselineArg,candidateArg,outputArg]=process.argv.slice(2);
assert.ok(baselineArg&&candidateArg&&outputArg,'Usage: node backend-run.mjs <rc16-root> <candidate-root> <output>');
const paths={baseline:resolve(baselineArg),candidate:resolve(candidateArg)},out=resolve(outputArg);
const source={
  baseline:await loadSourceManifest(process.env.KAIRO_BASELINE_MANIFEST,paths.baseline),
  candidate:await loadSourceManifest(process.env.KAIRO_CANDIDATE_MANIFEST,paths.candidate),
};
for(const manifest of Object.values(source))assert.ok(manifest.builtFiles.some(f=>f.path==='dist/client/index.html'),'Both applications must be built before HTTP benchmarks');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const harnessFiles=['backend-run.mjs','source-manifest.mjs','legacy-discovery-fixture.mjs',...(await readdir(join(here,'backend'))).filter(f=>f.endsWith('.mjs')).map(f=>'backend/'+f)];
const harnessHashes={};for(const file of harnessFiles)harnessHashes[file]=hash(await readFile(join(here,file)));
const provenance={schemaVersion:1,startedAt:new Date().toISOString(),order:['baseline-1','candidate-1','candidate-2','baseline-2'],
  source:Object.fromEntries(Object.entries(source).map(([key,value])=>[key,{commit:value.sourceCommit,root:value.root,dirty:value.dirty,fingerprint:value.fingerprint,verifiedFiles:value.files.length,verifiedBuildFiles:value.builtFiles.length}])),
  harnessHashes,node:process.version,scope:'Corrected storms object; real Universe tick successful-subtask audit; backend only; controlled warm cache; real scheduler; SDE automatic start deferred; zero external requests.',
  intentionalContractChange:'Journey lifetime logging/UI is retired. The preserved journey operation measures only the cold legacy compatibility reader, using the same seeded legacy rows. Session history, combat attribution, market and state assertions remain unchanged.',
  runUrl:process.env.GITHUB_RUN_ID?`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`:null,complete:false};
await mkdir(out,{recursive:true});
const save=()=>writeFile(join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
await save();
try {
  for(const name of provenance.order) {
    const key=name.replace(/-[12]$/,'');console.log('BACKEND '+name);
    await new Promise((accept,reject)=>{
      const child=spawn(process.execPath,[join(here,'backend/backend.mjs')],{cwd:paths[key],env:{...process.env,KAIRO_PERF_APP_ROOT:paths[key],KAIRO_PERF_APP_REF:source[key].sourceCommit,KAIRO_PERF_OUTPUT:join(out,name)},stdio:'inherit'});
      child.on('error',reject);child.on('exit',(code,signal)=>code===0?accept():reject(Error('Backend '+name+' failed: '+(signal||code))));
    });
  }
  for(const [name,expected] of Object.entries(harnessHashes))assert.equal(hash(await readFile(join(here,name))),expected,name+' harness changed during measurement');
  for(const manifest of Object.values(source))await verifySource(manifest);
  provenance.endVerified=true;provenance.finishedAt=new Date().toISOString();provenance.complete=true;
} catch(error) {provenance.error=error.stack;throw error;}
finally {await save();}
