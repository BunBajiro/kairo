// Untimed attribution; requires explicit runtime grant and the shared flock.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadSourceManifest,verifySource} from '../../../../../../harness/source-manifest.mjs';
assert.equal(process.env.KAIRO_MODELS_LOCKED,'1');
assert.ok(process.argv[2],'Choose a new output directory');
const here=dirname(fileURLToPath(import.meta.url)),out=resolve(process.argv[2]);
await mkdir(out,{recursive:false});
const hash=b=>createHash('sha256').update(b).digest('hex'),stamp=()=>new Date().toISOString();
const prep=JSON.parse(await readFile(resolve(here,'PREPARED.json')));
const receipt={schemaVersion:1,kind:'untimed-pointer-attribution',startedAt:stamp(),complete:false,releaseReady:false,node:process.version,runs:[],sourceGuards:[]};
const sources={};
async function run(args,cwd,log){
 return new Promise((accept,reject)=>{
  const child=spawn(args[0],args.slice(1),{cwd,env:process.env,stdio:['ignore','pipe','pipe']});let text='';
  child.stdout.on('data',b=>text+=b);child.stderr.on('data',b=>text+=b);child.on('error',reject);
  child.on('close',async(code,signal)=>{await writeFile(log,text,{flag:'wx'});code===0?accept():reject(Error(`Worker exited ${code}/${signal}: ${args.join(' ')}`));});
 });
}
async function guards(label){
 for(const [variant,source]of Object.entries(sources)){await verifySource(source);receipt.sourceGuards.push({label,variant,complete:true,fingerprint:source.fingerprint});}
 for(const [path,digest]of Object.entries(prep.files))assert.equal(hash(await readFile(resolve(here,path))),digest,path);
 assert.equal(hash(await readFile(process.env.KAIRO_CHROME_PATH)),prep.chromeSha256);
}
try{
 for(const [variant,saved]of Object.entries(prep.variants)){
  assert.equal(hash(await readFile(resolve(here,saved.manifest))),saved.manifestSha256);
  const source=await loadSourceManifest(resolve(here,saved.manifest),saved.root);
  assert.equal(source.sourceCommit,prep.sourceCommit);assert.equal(source.fingerprint,saved.fingerprint);sources[variant]=source;
 }
 await guards('initial');
 for(const [index,arm]of prep.arms.entries()){
  const filename=`${index+1}-${arm.variant}-${arm.moveButton}.json`,path=resolve(out,filename),saved=prep.variants[arm.variant];
  await run([process.execPath,resolve(here,'pointer-diagnostic.mjs'),saved.root,path,resolve(here,saved.manifest),arm.moveButton],saved.root,path+'.log');
  const bytes=await readFile(path),result=JSON.parse(bytes);
  assert.equal(result.complete,true);assert.equal(result.sourceVerified,true);assert.equal(result.cleanupVerified,true);
  assert.equal(result.source.fingerprint,saved.fingerprint);assert.equal(result.harnessSha256,prep.files['pointer-diagnostic.mjs']);
  assert.equal(result.browser.product,prep.chromeProduct);assert.equal(result.browser.revision,prep.chromeRevision);
  assert.equal(result.moveButton,arm.moveButton);assert.equal(result.commands.length,42);
  assert.equal(result.fixture.observed.items,2880);assert.equal(result.savedGeometryUnchanged,true);
  assert.equal(result.errors.length,0);assert.equal(result.external.length,0);assert.ok(result.events.length);
  receipt.runs.push({...arm,filename,sha256:hash(bytes),geometryMatchesExpected:result.geometryMatchesExpected,stageSizeStable:result.stageSizeStable,sameDOMElement:result.sameDOMElement,
   expected:result.expected,actual:{x:result.after.draftX,y:result.after.draftY},events:result.events.length,cleanup:result.cleanup});
  await guards(filename);await writeFile(resolve(out,'progress.json'),JSON.stringify(receipt,null,2)+'\n');
 }
 receipt.sourceVerified=true;receipt.harnessVerified=true;receipt.complete=true;
}catch(error){receipt.failure=error.stack;process.exitCode=1;}
finally{
 try{await guards('final');receipt.finalGuardsVerified=true;}catch(error){receipt.finalGuardFailure=error.stack;receipt.complete=false;process.exitCode=1;}
 receipt.endedAt=stamp();await writeFile(resolve(out,'completed.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({complete:receipt.complete,out,failure:receipt.failure}));
}
