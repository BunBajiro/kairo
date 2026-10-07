import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {captureSource,verifySource} from '../../harness/source-manifest.mjs';
const self=fileURLToPath(import.meta.url),here=dirname(self);
const run=(command,args,env=process.env)=>new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',env});child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolve():reject(Error(command+' failed: '+(signal||code))));});
if(process.env.KAIRO_ROUTE_LOCKED!=='1'){await run('flock',['-x','/tmp/kairo-performance.lock',process.execPath,self,...process.argv.slice(2)],{...process.env,KAIRO_ROUTE_LOCKED:'1'});process.exit();}
const [baselineArg,candidateArg,outputArg]=process.argv.slice(2);assert.ok(baselineArg&&candidateArg&&outputArg,'Usage: run.mjs baseline-root candidate-root output-directory');
const roots={baseline:resolve(baselineArg),candidate:resolve(candidateArg)},output=resolve(outputArg),source={baseline:await captureSource(roots.baseline),candidate:await captureSource(roots.candidate)};
const pinned='a27d36c602435ce220452b5d45b0109d30efa533';for(const manifest of Object.values(source))assert.equal(manifest.sourceCommit,pinned,'Pin both source roots to a27');assert.equal(source.baseline.dirty,false,'Fresh baseline must be clean');
const baselineFiles=new Map(source.baseline.files.map(file=>[file.path,file.sha256])),candidateFiles=new Map(source.candidate.files.map(file=>[file.path,file.sha256]));const differences=[...new Set([...baselineFiles.keys(),...candidateFiles.keys()])].filter(path=>baselineFiles.get(path)!==candidateFiles.get(path)).sort();assert.deepEqual(differences,['components/kairo/dashboard.tsx','components/kairo/deferred-page.tsx'],'Only intended source boundaries may differ');
assert.equal(await realpath(join(roots.baseline,'node_modules')),await realpath(join(roots.candidate,'node_modules')),'Both trials must use the same installed dependency tree');
for(const manifest of Object.values(source))assert.ok(manifest.builtFiles.some(file=>file.path==='dist/client/index.html'),'Fresh-build both roots with identical configuration first');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),harness={};for(const file of ['run.mjs','browser-worker.mjs','bundle-inventory.mjs'])harness[file]=sha(await readFile(join(here,file)));
const result={schemaVersion:1,startedAt:new Date().toISOString(),complete:false,order:['baseline-1','candidate-1','candidate-2','baseline-2'],harness,source:Object.fromEntries(Object.entries(source).map(([key,value])=>[key,{root:value.root,commit:value.sourceCommit,fingerprint:value.fingerprint,dirty:value.dirty}])),method:'Matched a27 sources except isolated route boundaries; identical package lock/build config/dependency installation; fresh backend/browser per ABBA entry; all measured observations precede fault/draft/detached diagnostics.'};
await mkdir(output,{recursive:true});for(const [kind,manifest] of Object.entries(source))await writeFile(join(output,kind+'-source.json'),JSON.stringify(manifest,null,2)+'\n');await writeFile(join(output,'candidate-dashboard.patch'),execFileSync('git',['-C',roots.candidate,'diff','--no-ext-diff','--','components/kairo/dashboard.tsx']));await writeFile(join(output,'candidate-deferred-page.tsx'),await readFile(join(roots.candidate,'components/kairo/deferred-page.tsx')));const save=()=>writeFile(join(output,'provenance.json'),JSON.stringify(result,null,2)+'\n');await save();
try{
 await run(process.execPath,[join(here,'bundle-inventory.mjs'),roots.baseline,roots.candidate,join(output,'bundle-inventory.json')]);
 for(const label of result.order)await run(process.execPath,[join(here,'browser-worker.mjs'),roots[label.split('-')[0]],join(output,label+'.json'),label]);
 const runs=await Promise.all(result.order.map(label=>readFile(join(output,label+'.json'),'utf8').then(JSON.parse)));
 assert.ok(runs.every(run=>run.complete&&run.sourceVerified));assert.equal(new Set(runs.map(run=>run.fixture.digest)).size,1);assert.equal(new Set(runs.map(run=>JSON.stringify(run.environment.browser))).size,1);
 const median=values=>values.reduce((total,value)=>total+value,0)/values.length;
 result.comparison=runs[0].samples.map(sample=>{const forKind=kind=>runs.filter(run=>run.label.startsWith(kind)).map(run=>run.samples.find(value=>value.name===sample.name));const a=forKind('baseline'),b=forKind('candidate');return {name:sample.name,baseline:a.map(value=>({readyMs:value.readyMs,taskMs:value.taskMs,scriptMs:value.scriptMs,assets:value.assets})),candidate:b.map(value=>({readyMs:value.readyMs,taskMs:value.taskMs,scriptMs:value.scriptMs,assets:value.assets})),medianDelta:{readyMs:median(b.map(value=>value.readyMs))-median(a.map(value=>value.readyMs)),taskMs:median(b.map(value=>value.taskMs))-median(a.map(value=>value.taskMs))}};});
 for(const [file,expected] of Object.entries(harness))assert.equal(sha(await readFile(join(here,file))),expected,'Harness changed during run');for(const manifest of Object.values(source))await verifySource(manifest);result.complete=true;
}catch(error){result.failure=error.stack;throw error;}finally{result.endedAt=new Date().toISOString();await save();}
