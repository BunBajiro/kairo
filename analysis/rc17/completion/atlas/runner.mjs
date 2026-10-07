import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {access,mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {loadSourceManifest,verifySource} from '../../harness/source-manifest.mjs';
import {digest,distribution} from '../startup/fixture.mjs';
const here=dirname(fileURLToPath(import.meta.url));
if(process.env.KAIRO_ATLAS_LOCKED!=='1'){
 const code=await new Promise((done,reject)=>{const child=spawn('flock',['-x','/tmp/kairo-rc16-benchmark.lock',process.execPath,fileURLToPath(import.meta.url),...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,KAIRO_ATLAS_LOCKED:'1'}});child.on('error',reject);child.on('exit',code=>done(code??1));});process.exit(code);
}
const [configPath,outputArg,cyclesArg='3',only='all']=process.argv.slice(2);assert.ok(configPath&&outputArg,'runner <source-config.json> <output> [cycles=3] [all|atlas|format]');assert.ok(['all','atlas','format'].includes(only));
const config=JSON.parse(await readFile(configPath)),destination=resolve(outputArg),cycles=Number(cyclesArg);assert.ok(Number.isInteger(cycles)&&cycles>=1&&cycles<=8);
const sources={},paths={};for(const [name,path]of Object.entries(config)){paths[name]=resolve(path);sources[name]=await loadSourceManifest(paths[name]);}
for(const key of ['a27','trial','rc16','fa6'])assert.ok(sources[key],key+' manifest required');
assert.equal(sources.a27.sourceCommit,'a27d36c602435ce220452b5d45b0109d30efa533');
assert.equal(sources.rc16.sourceCommit,'57c8dcc7fbd8fc2b62129498d1819050c78381a1');assert.equal(sources.fa6.sourceCommit,'fa6e852b76089b51cd552fa202de85ad6948b0ec');
const before=new Map(sources.a27.files.map(f=>[f.path,f])),after=new Map(sources.trial.files.map(f=>[f.path,f]));
const changed=[...new Set([...before.keys(),...after.keys()])].filter(path=>JSON.stringify(before.get(path))!==JSON.stringify(after.get(path))).sort();
assert.deepEqual(changed,['server/universe-intel.mjs','server/universe-navigation.mjs','server/universe-operations.mjs','server/universe-static.mjs','server/universe.mjs']);
for(const s of Object.values(sources))assert.equal(s.files.find(f=>f.path==='server/data/universe.json.gz').sha256,sources.a27.files.find(f=>f.path==='server/data/universe.json.gz').sha256);
await mkdir(destination,{recursive:true});const completePath=join(destination,'conditional-completed.json'),progressPath=join(destination,'conditional-progress.json');
try{await access(completePath);throw Error('Refusing to overwrite completed evidence');}catch(error){if(error.code!=='ENOENT')throw error;}
const harness={};for(const path of ['runner.mjs','worker.mjs','../startup/fixture.mjs','../../harness/source-manifest.mjs'])harness[path]=digest(await readFile(join(here,path)));
const copied={};for(const name of Object.keys(sources)){copied[name]=join(destination,name+'-source.json');await writeFile(copied[name],await readFile(paths[name]));}
const results=[],report={schemaVersion:1,runId:randomUUID(),startedAt:new Date().toISOString(),complete:false,productionAcceptance:false,cycles,changed,harness,sources:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,{root:v.root,commit:v.sourceCommit,fingerprint:v.fingerprint,dirty:v.dirty}])),results};
async function save(){const tmp=progressPath+'.tmp';await writeFile(tmp,JSON.stringify(report,null,2)+'\n');await rename(tmp,progressPath);}
const jobs=[];for(const [lane,baseline] of [['atlas','a27'],['format','rc16'],['format','fa6']]){if(only!=='all'&&only!==lane)continue;for(const mode of ['timing','heap'])for(let cycle=1;cycle<=(mode==='timing'?cycles:1);cycle++)for(const [position,build]of [baseline,'trial','trial',baseline].entries())jobs.push({lane,baseline,mode,cycle,position:position+1,build});}
for(const [lane,builds]of [['atlas',['a27','trial']],['format',['rc16','fa6','trial']]])if(only==='all'||only===lane)for(const build of builds)jobs.push({lane,mode:'counters',cycle:1,position:1,build});
const semantics=new Map();await save();
try{
 for(const job of jobs){await verifySource(sources[job.build]);const name=[job.lane,job.baseline||'counters',job.mode,job.cycle,job.position,job.build].join('-')+'.json';const run=spawnSync(process.execPath,[...(job.mode==='heap'?['--expose-gc']:[]),join(here,'worker.mjs'),sources[job.build].root,copied[job.build],job.lane,job.mode],{encoding:'utf8',timeout:120000,maxBuffer:10*1024*1024});
  await writeFile(join(destination,name),run.stdout||'');if(run.stderr)await writeFile(join(destination,name+'.stderr.log'),run.stderr);const row={...job,file:name,sha256:digest(run.stdout||''),complete:false,exitCode:run.status};results.push(row);
  if(run.status!==0||run.error)throw Error(name+': '+(run.error||run.stderr));const data=JSON.parse(run.stdout);assert.equal(data.complete,true);assert.equal(data.endVerified,true);assert.equal(data.networkAttempts,0);assert.equal(data.source.fingerprint,sources[job.build].fingerprint);
  for(const [key,value]of Object.entries(data.semantic)){if(semantics.has(key))assert.equal(value,semantics.get(key),key+' output mismatch');semantics.set(key,value);}
  Object.assign(row,{complete:true,timings:data.timings,heap:data.heap,counters:data.counters,semantic:data.semantic});await save();process.stderr.write(name+' complete\n');
 }
 const summary={};for(const row of results.filter(r=>r.mode==='timing')){const group=summary[[row.lane,row.baseline,row.build].join('/')]||={};for(const [metric,value]of Object.entries(row.timings)){if(typeof value==='number')(group[metric]||=[]).push(value);else{(group[metric+'.runP50']||=[]).push(value.p50);(group[metric+'.runP95']||=[]).push(value.p95);}}}
 report.summary=Object.fromEntries(Object.entries(summary).map(([k,v])=>[k,Object.fromEntries(Object.entries(v).map(([metric,values])=>[metric,distribution(values)]))]));
 for(const source of Object.values(sources))await verifySource(source);for(const [path,hash]of Object.entries(harness))assert.equal(digest(await readFile(join(here,path))),hash);
 report.complete=true;report.endVerified=true;report.finishedAt=new Date().toISOString();await writeFile(completePath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}catch(error){report.error=error.stack;throw error;}finally{await save();}
