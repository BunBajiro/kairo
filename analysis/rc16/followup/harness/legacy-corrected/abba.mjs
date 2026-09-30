// Internal checkpoint runner: does not write into either measured application.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
if(process.env.KAIRO_LEGACY_CORRECTED_LOCKED!=='1')throw Error('Use legacy-corrected-run.mjs to acquire flock.');
const [baselineArg,candidateArg,outputArg]=process.argv.slice(2);
assert.ok(baselineArg&&candidateArg&&outputArg,'Usage: node abba.mjs <v073-root> <rc16-root> <output>');
const here=dirname(fileURLToPath(import.meta.url)), analysis=resolve(here,'../../..');
const paths={baseline:resolve(baselineArg),candidate:resolve(candidateArg)}, out=resolve(outputArg);
const stableManifest=JSON.parse(await readFile(join(analysis,'historical/retrieval-manifest.json'),'utf8')).stableTree;
const candidateManifest=JSON.parse(await readFile(join(analysis,'rc16-source-manifest.json'),'utf8'));
const manifests={baseline:{sourceCommit:'239794774320fcdebaa1d76ce8a77c5c25cfc48c',files:stableManifest.tree.filter(x=>x.type==='blob')},candidate:candidateManifest};
const hash=(data,type='sha256')=>createHash(type).update(data).digest('hex');
const source={};
for(const [key,manifest] of Object.entries(manifests)){
  const exemptions=key==='candidate'?['AGENTS.md','.github/workflows/test-build.yml']:[];
  for(const item of manifest.files){
    if(exemptions.includes(item.path))continue;
    const bytes=await readFile(join(paths[key],item.path));
    assert.equal(hash(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes]),'sha1'),item.sha,key+'/'+item.path+' source mismatch');
  }
  source[key]={commit:manifest.sourceCommit,verifiedFiles:manifest.files.length-exemptions.length,permittedInvestigationOnlyExemptions:exemptions,root:paths[key]};
}
const harnessHashes={};for(const name of (await readdir(here)).filter(x=>x.endsWith('.mjs')).sort())harnessHashes[name]=hash(await readFile(join(here,name)));
harnessHashes['../legacy-corrected-run.mjs']=hash(await readFile(join(here,'../legacy-corrected-run.mjs')));
const provenance={schemaVersion:1,startedAt:new Date().toISOString(),order:['baseline-1','candidate-1','candidate-2','baseline-2'],source,harnessHashes,node:process.version,scope:'corrected storms object; real Universe tick successful-subtask audit; backend only; controlled legacy warm-cache; real scheduler and new Universe ticks; SDE automatic start deferred; zero external requests',runUrl:process.env.GITHUB_RUN_ID?`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`:null};
await mkdir(out,{recursive:true});await writeFile(join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
async function run(args,cwd,env){await new Promise((accept,reject)=>{const child=spawn(process.execPath,args,{cwd,env:{...process.env,...env},stdio:'inherit'});child.on('error',reject);child.on('exit',(code,signal)=>code===0?accept():reject(new Error(args[0]+' failed: '+(signal||code))));});}
for(const name of provenance.order){
  const key=name.replace(/-[12]$/,'');console.log('BACKEND '+name);
  await run([join(here,'backend.mjs')],paths[key],{KAIRO_PERF_APP_ROOT:paths[key],KAIRO_PERF_APP_REF:source[key].commit,KAIRO_PERF_OUTPUT:join(out,name)});
}
for(const [name,expected] of Object.entries(harnessHashes))assert.equal(hash(await readFile(join(here,name))),expected,name+' harness changed during measurement');
for(const [key,manifest] of Object.entries(manifests))for(const item of manifest.files){
  if(source[key].permittedInvestigationOnlyExemptions.includes(item.path))continue;
  const bytes=await readFile(join(paths[key],item.path));
  assert.equal(hash(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes]),'sha1'),item.sha,key+'/'+item.path+' changed during measurement');
}
provenance.endVerified=true;provenance.finishedAt=new Date().toISOString();provenance.complete=true;
await writeFile(join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
