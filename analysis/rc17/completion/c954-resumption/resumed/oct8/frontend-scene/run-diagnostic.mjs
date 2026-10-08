// Run only after the coordinator grants the exclusive runtime lane.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {captureSource,verifySource} from '../../../../../harness/source-manifest.mjs';
assert.equal(process.env.KAIRO_MODELS_LOCKED,'1');
const [rootArg,outArg]=process.argv.slice(2);assert.ok(rootArg&&outArg);const root=resolve(rootArg),out=resolve(outArg),here=dirname(fileURLToPath(import.meta.url)),expectedCommit='a7b1bf97b0073695926c443e52d523638e59e48d',hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(out,{recursive:false});const receipt={schemaVersion:1,diagnosticOnly:true,performanceAcceptance:false,startedAt:new Date().toISOString(),expectedCommit,node:process.version,commands:[],workers:[],complete:false};
const harnesses={};for(const name of ['scene-diagnostic.mjs','run-diagnostic.mjs'])harnesses[name]=hash(await readFile(resolve(here,name)));receipt.harnesses=harnesses;
async function command(args,log){const code=await new Promise((accept,reject)=>{const child=spawn(args[0],args.slice(1),{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',b=>text+=b);child.stderr.on('data',b=>text+=b);child.on('error',reject);child.on('close',async code=>{await writeFile(resolve(out,log),text,{flag:'wx'});accept(code);});});receipt.commands.push({args,log,exitCode:code});await writeFile(resolve(out,'progress.json'),JSON.stringify(receipt,null,2)+'\n');assert.equal(code,0,log);}
try{
 const initial=await captureSource(root,{expectedCommit,requireClean:true});assert.equal(initial.builtFiles.length,0,'Require a fresh independent build');await writeFile(resolve(out,'initial-source.json'),JSON.stringify(initial,null,2)+'\n',{flag:'wx'});
 await command([process.execPath,'--check',resolve(here,'scene-diagnostic.mjs')],'syntax-worker.log');
 await command(['npm','run','check:kairo'],'types.log');await command(['npm','run','build'],'build.log');
 const source=await captureSource(root,{expectedCommit,requireClean:true});assert.deepEqual(source.files,initial.files);assert.ok(source.builtFiles.length);await writeFile(resolve(out,'source.json'),JSON.stringify(source,null,2)+'\n',{flag:'wx'});receipt.fingerprint=source.fingerprint;receipt.clientAssets=source.builtFiles.length;
 for(const mode of ['coverage','cpu']){
  const path=resolve(out,mode+'.json');await command([process.execPath,resolve(here,'scene-diagnostic.mjs'),root,path,resolve(out,'source.json'),mode],mode+'.log');const bytes=await readFile(path),result=JSON.parse(bytes);assert.equal(result.complete,true);assert.equal(result.sourceVerified,true);assert.equal(result.mode,mode);assert.equal(result.harnessSha256,harnesses['scene-diagnostic.mjs']);receipt.workers.push({mode,sha256:hash(bytes),samples:result.samples.length,checks:result.checks.length});
 }
 await verifySource(source);for(const[name,digest]of Object.entries(harnesses))assert.equal(hash(await readFile(resolve(here,name))),digest);receipt.complete=true;receipt.sourceVerified=true;
}catch(error){receipt.failure=error.stack;throw error;}
finally{receipt.endedAt=new Date().toISOString();await writeFile(resolve(out,'completed.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});}
