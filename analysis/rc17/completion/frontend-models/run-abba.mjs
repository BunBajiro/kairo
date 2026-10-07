// Invoke through flock /tmp/kairo-performance.lock; fresh workers and browsers.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const [baseline,requestedCandidate,outArg]=process.argv.slice(2),output=resolve(outArg);
// A byte-identical frozen copy allows the coordinator to integrate later patches.
const frozenManifest=resolve("analysis/rc17/completion/frontend-models/frozen-candidate-source.json"),frozen=JSON.parse(await readFile(frozenManifest));
const original=JSON.parse(await readFile(resolve("analysis/rc17/completion/frontend-models/candidate-source.json")));assert.equal(frozen.fingerprint,original.fingerprint);assert.equal(resolve(requestedCandidate),original.root);const candidate=frozen.root;
assert.equal(process.env.KAIRO_MODELS_LOCKED,'1');await mkdir(output,{recursive:true});
const lane=resolve('analysis/rc17/completion/frontend-models'),summary={startedAt:new Date().toISOString(),requestedCandidate,frozenCandidate:candidate,fingerprint:frozen.fingerprint,order:[],complete:false};
async function run(args,log){await new Promise((accept,reject)=>{const child=spawn(process.execPath,args,{env:process.env,stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',b=>text+=b);child.stderr.on('data',b=>text+=b);child.on('error',reject);child.on('close',async code=>{await writeFile(log,text);code===0?accept():reject(Error('Worker exit '+code+': '+args.join(' ')));});});}
try{for(const [index,variant]of ['baseline','candidate','candidate','baseline'].entries()){
 const repo=variant==='baseline'?baseline:candidate,manifest=variant==='baseline'?join(lane,'ablation-source.json'):frozenManifest,prefix=`${index+1}-${variant}`;
 for(const kind of ['models','formatters','studio-admin']){
  const file=join(output,prefix+'-'+kind+'.json'),script=kind==='models'?join(lane,'browser-acceptance.mjs'):kind==='formatters'?join(lane,'formatter-cost.mjs'):resolve('analysis/rc17/completion/studio-stream/populated-cost.mjs');
  const args=[script,repo,file,manifest,...(kind==='models'?['--timing',...(variant==='baseline'?['--baseline']:[])]:[])];
  const harnessSha256=createHash('sha256').update(await readFile(script)).digest('hex');await run(args,file+'.log');const result=JSON.parse(await readFile(file));assert.ok(result.complete||kind==='formatters'&&result.sourceVerified);assert.equal(result.harnessSha256,harnessSha256);summary.order.push({index:index+1,variant,kind,file,harnessSha256});await writeFile(join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(prefix+' '+kind+' complete');
 }
}summary.complete=true;}catch(error){summary.failure=error.stack;process.exitCode=1;}finally{summary.endedAt=new Date().toISOString();await writeFile(join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');}
