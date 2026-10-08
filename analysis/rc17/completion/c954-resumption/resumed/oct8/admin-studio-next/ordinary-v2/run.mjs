// Requires runtime grant and flock /tmp/kairo-performance.lock. Never overwrites an attempt.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadSourceManifest,verifySource} from '../../../../../../harness/source-manifest.mjs';
assert.equal(process.env.KAIRO_MODELS_LOCKED,'1');assert.ok(process.argv[2],'Choose a new output directory');
const here=dirname(fileURLToPath(import.meta.url)),out=resolve(process.argv[2]);await mkdir(out,{recursive:false});
const hash=b=>createHash('sha256').update(b).digest('hex'),stamp=()=>new Date().toISOString();
const prep=JSON.parse(await readFile(resolve(here,'PREPARED.json'))),manifests={};
const receipt={schemaVersion:2,kind:'admin-studio-ordinary-v2',startedAt:stamp(),complete:false,releaseReady:false,node:process.version,
 sourceCommit:prep.sourceCommit,sourceTree:prep.sourceTree,order:prep.order,buildsReused:prep.variants,runs:[],nativeRecovery:[],guards:[],harnesses:prep.files};
async function guard(label){
 for(const [variant,source]of Object.entries(manifests)){await verifySource(source);receipt.guards.push({label,variant,fingerprint:source.fingerprint,verified:true});}
 for(const [path,digest]of Object.entries(prep.files))assert.equal(hash(await readFile(resolve(here,path))),digest,path);
 assert.equal(hash(await readFile(process.env.KAIRO_CHROME_PATH)),prep.chromeSha256);
}
async function command(args,cwd,log){
 return new Promise((accept,reject)=>{
  const child=spawn(args[0],args.slice(1),{cwd,env:process.env,stdio:['ignore','pipe','pipe']});let output='';
  child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);
  child.on('close',async(code,signal)=>{await writeFile(log,output,{flag:'wx'});code===0?accept():reject(Error(`Exit ${code}/${signal}: ${args.join(' ')}`));});
 });
}
async function worker(variant,mode,filename){
 const path=resolve(out,filename),saved=prep.variants[variant];await guard('before-'+filename);
 await command([process.execPath,resolve(here,'populated-cost.mjs'),saved.root,path,resolve(here,saved.manifest),mode],saved.root,path+'.log');
 const bytes=await readFile(path),result=JSON.parse(bytes);
 assert.equal(result.complete,true);assert.equal(result.sourceVerified,true);assert.equal(result.cleanupVerified,true);
 assert.equal(result.mode,mode);assert.equal(result.inputRevision,'explicit-left-v2');
 assert.equal(result.harnessSha256,prep.files['populated-cost.mjs']);assert.equal(result.source.fingerprint,saved.fingerprint);
 assert.equal(result.browser.product,prep.chromeProduct);assert.equal(result.browser.revision,prep.chromeRevision);
 assert.equal(result.errors.length,0);assert.equal(result.external.length,0);assert.ok(result.checks.every(c=>c.passed));
 assert.equal(result.samples.length,mode==='ordinary'?12:2);
 const row={variant,mode,filename,sha256:hash(bytes),checks:result.checks.length,phaseCount:result.samples.length};
 (mode==='ordinary'?receipt.runs:receipt.nativeRecovery).push(row);await guard('after-'+filename);
 await writeFile(resolve(out,'progress.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(row));
}
try{
 for(const [variant,saved]of Object.entries(prep.variants)){
  assert.equal(hash(await readFile(resolve(here,saved.manifest))),saved.manifestSha256);
  assert.equal(hash(await readFile(resolve(here,saved.buildReceipt))),saved.buildReceiptSha256);
  const source=await loadSourceManifest(resolve(here,saved.manifest),saved.root);
  assert.equal(source.sourceCommit,prep.sourceCommit);assert.equal(source.fingerprint,saved.fingerprint);assert.equal(source.builtFiles.length,20);manifests[variant]=source;
 }
 await guard('initial');
 for(const [i,variant]of prep.order.entries())await worker(variant,'ordinary',`${i+1}-${variant}.json`);
 await worker('candidate','native-recovery','5-candidate-native-recovery.json');
 receipt.sourceVerified=true;receipt.harnessVerified=true;receipt.complete=true;
}catch(error){receipt.failure=error.stack;process.exitCode=1;}
finally{
 try{await guard('final');receipt.finalGuardsVerified=true;}catch(error){receipt.finalGuardFailure=error.stack;receipt.complete=false;process.exitCode=1;}
 receipt.endedAt=stamp();await writeFile(resolve(out,'completed.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({complete:receipt.complete,output:out,failure:receipt.failure}));
}
