// Coordinator only. Invoke after independent review and the root's runtime grant.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,open,readdir,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {freezeSources} from './freeze-sources.mjs';
import {verifySource} from '../../../../../harness/source-manifest.mjs';

const self=fileURLToPath(import.meta.url),here=dirname(self),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
if(process.env.KAIRO_M9_MATCHED_LOCK_HELD!=='1'){
    const child=spawn('flock',['-x','/tmp/kairo-performance.lock','flock','-x','/tmp/kairo-rc16-benchmark.lock',process.execPath,self,...process.argv.slice(2)],
        {stdio:'inherit',env:{...process.env,KAIRO_M9_MATCHED_LOCK_HELD:'1'}});
    let failure;child.once('error',error=>{failure=error;});
    const code=await new Promise(done=>child.once('close',code=>done(code??1)));
    if(failure)throw failure;process.exit(code);
}
assert.equal(process.argv.length,3,'Supply one new output directory');
const output=resolve(process.argv[2]);await mkdir(output,{recursive:false});
const paths=['run-screen.mjs','screen-worker.mjs','freeze-sources.mjs','prototype-files.json','prototype.patch','SCREEN-PLAN.md','SCREEN-ADDENDUM-1.md',
    '../maps-summary-next/persistence-fixtures.mjs','../../../../../harness/source-manifest.mjs'].map(path=>resolve(here,path));
const hashes=async()=>Promise.all(paths.map(async path=>{const bytes=await readFile(path);return {path,bytes:bytes.length,sha256:hash(bytes)};}));
const result={schemaVersion:1,complete:false,sourceAndHarnessVerified:false,releaseReady:false,startedAt:new Date().toISOString(),
    order:['baseline-1','candidate-1','candidate-2','baseline-2'],cases:['plain-1','plain-24','wide-1','wide-24','dense-notes-1','dense-notes-8','primitive-fallback-8','wide-source-1'],
    children:[],cleanupFailures:[],limits:['Small miss-only screen; no historical arm or log is reconstructed or reused.',
        'A dedicated seed process precedes all four fresh measurement processes. One copied fixture per shape per arm; no expanded matrix.',
        'Both shared benchmark locks are held by the coordinator. No automatic adoption or production read/write ratio is implied.']};
let sources,pinned,seedDirectory;
const save=()=>writeFile(join(output,'progress.json'),JSON.stringify(result,null,2)+'\n');
async function guard(){assert.deepEqual(await hashes(),pinned,'Screen harness changed');for(const source of Object.values(sources||{}))await verifySource(source);}
async function durableLog(path,chunks){
    const bytes=Buffer.concat(chunks),handle=await open(path,'wx');
    try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    const saved=await readFile(path);assert.equal(saved.length,bytes.length);assert.equal(hash(saved),hash(bytes));
    return {path:path.slice(output.length+1),bytes:saved.length,sha256:hash(saved)};
}
async function child(label,role,mode){
    await guard();
    const target=join(output,label+'.json'),args=[join(here,'screen-worker.mjs'),join(output,'baseline-source.json'),join(output,role+'-source.json'),target,seedDirectory,mode,join(output,'harness-source.json')];
    const receipt={label,role,mode,command:[process.execPath,...args],startedAt:new Date().toISOString(),logs:[]};
    result.activeChild=label;await save();process.stdout.write(JSON.stringify({starting:label})+'\n');
    const processChild=spawn(process.execPath,args,{stdio:['ignore','pipe','pipe'],env:{...process.env,KAIRO_M9_MATCHED_LOCK_HELD:'1'}});
    const stdout=[],stderr=[];let spawnFailure;
    processChild.stdout.on('data',bytes=>stdout.push(Buffer.from(bytes)));
    processChild.stderr.on('data',bytes=>stderr.push(Buffer.from(bytes)));
    processChild.once('error',error=>{spawnFailure=error;});
    const exit=await new Promise(done=>processChild.once('close',(code,signal)=>done({code,signal})));
    // 'close' follows process exit and stdio closure. Each raw stream is then
    // finalized once, synced, read back and hashed; no inherited live log fd.
    receipt.exitCode=exit.code;receipt.signal=exit.signal;receipt.endedAt=new Date().toISOString();
    if(spawnFailure)receipt.spawnFailure=spawnFailure.stack;
    for(const [stream,chunks]of [['stdout',stdout],['stderr',stderr]]){
        try{receipt.logs.push(await durableLog(join(output,label+'.'+stream+'.log'),chunks));}
        catch(error){(receipt.logFailures??=[]).push({stream,error:error.stack});}
    }
    result.children.push(receipt);delete result.activeChild;await save();
    assert.equal(receipt.logFailures,undefined,'Log finalization failed');assert.equal(spawnFailure,undefined);assert.equal(exit.code,0,label+' failed; retain this attempt');
    const bytes=await readFile(target),value=JSON.parse(bytes);receipt.output={path:label+'.json',bytes:bytes.length,sha256:hash(bytes)};
    assert.equal(value.complete,true);assert.equal(value.sourceVerified,true);assert.equal(value.harnessFingerprint,hash(JSON.stringify(pinned)));
    assert.equal(value.source.fingerprint,sources[role].fingerprint);assert.equal(value.external,0);
    await guard();await save();process.stdout.write(JSON.stringify({completed:label})+'\n');return value;
}
try{
    pinned=await hashes();result.harnessFiles=pinned;
    await writeFile(join(output,'harness-source.json'),JSON.stringify({schemaVersion:1,files:pinned},null,2)+'\n',{flag:'wx'});
    sources=await freezeSources(output);
    result.sources=Object.fromEntries(Object.entries(sources).map(([role,value])=>[role,{commit:value.sourceCommit,fingerprint:value.fingerprint}]));
    seedDirectory=await mkdtemp(join(tmpdir(),'kairo-m9-lazy-screen-seeds-'));result.seedDirectory=seedDirectory;
    const seed=await child('seed-preparation','baseline','seed-only');assert.deepEqual(seed.cases.map(row=>row.id),result.cases);
    const arms={};for(const label of result.order)arms[label]=await child(label,label.startsWith('baseline')?'baseline':'candidate','measure');
    const reference=arms['baseline-1'];assert.deepEqual(reference.cases.map(row=>row.id),result.cases);
    for(const label of result.order){assert.deepEqual(arms[label].cases.map(row=>row.id),result.cases);for(let i=0;i<result.cases.length;i++){
        const row=arms[label].cases[i];assert.ok(row.parity,'Explicit parity boundary missing');assert.deepEqual(row.parity,reference.cases[i].parity,label+': '+row.id+' authority/output mismatch');
        assert.equal(row.noPersistentEagerBackfill,true);
        assert.equal(row.phases.filter(phase=>phase.name.startsWith('steady-summary-')).length,5);
        assert.ok(row.phases.filter(phase=>phase.name.startsWith('steady-summary-')).every(phase=>phase.databaseChanges===0));
    }}
    await guard();result.parity={complete:true,cases:result.cases.length,arms:result.order.length};result.complete=true;
}catch(error){result.failure=error.stack;process.exitCode=1;}
finally{
    result.finalGuardComplete=false;result.sourceAndHarnessVerified=false;
    try{assert.ok(pinned&&sources,'Source/harness freeze did not finish');await guard();result.finalGuardComplete=true;result.sourceAndHarnessVerified=true;}
    catch(error){result.finalGuardError=error.stack;result.complete=false;process.exitCode=1;}
    if(result.complete&&seedDirectory){try{await rm(seedDirectory,{recursive:true,force:true});result.seedDirectoryRemoved=true;}catch(error){result.cleanupFailures.push({owner:'seeds',error:error.stack});result.complete=false;process.exitCode=1;}}
    result.artifacts=[];result.artifactInventoryFailures=[];
    async function inventory(relative=''){
        for(const entry of await readdir(join(output,relative),{withFileTypes:true})){
            const path=join(relative,entry.name);if(entry.isDirectory())await inventory(path);
            else if(entry.isFile()&&!['progress.json','completed.json','failed.json'].includes(path)){
                try{const bytes=await readFile(join(output,path));result.artifacts.push({path,bytes:bytes.length,sha256:hash(bytes)});}
                catch(error){result.artifactInventoryFailures.push({path,error:error.stack});}
            }
        }
    }
    try{await inventory();}catch(error){result.artifactInventoryFailures.push({error:error.stack});}
    if(result.artifactInventoryFailures.length){result.complete=false;process.exitCode=1;}
    result.endedAt=new Date().toISOString();await writeFile(join(output,result.complete?'completed.json':'failed.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});await save();
}
