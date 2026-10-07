// Reconstructed fresh-process crossover. Instrumented attribution, not acceptance.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadSourceManifest,verifySource} from '../../harness/source-manifest.mjs';
const self=fileURLToPath(import.meta.url),here=dirname(self);
if(process.env.KAIRO_STATE_TAIL_LOCKED!=='1'){
    const code=await new Promise((done,bad)=>{const child=spawn('flock',['/tmp/kairo-performance.lock',process.execPath,self,...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,KAIRO_STATE_TAIL_LOCKED:'1'}});child.on('error',bad);child.on('exit',code=>done(code??1));});process.exit(code);
}
const[configArg,outputArg]=process.argv.slice(2);assert.ok(configArg&&outputArg,'Provide configuration JSON and output directory');
const configPath=resolve(configArg),configBytes=await readFile(configPath),config=JSON.parse(configBytes),output=resolve(outputArg);
assert.ok(Array.isArray(config.order)&&config.order.length>=2&&Array.isArray(config.schedulers)&&config.schedulers.every(value=>['active','nosync'].includes(value)));
const manifests={};for(const[name,entry]of Object.entries(config.sources))manifests[name]=await loadSourceManifest(entry.manifest,entry.root);assert.ok(config.order.every(name=>manifests[name]));
const hash=value=>createHash('sha256').update(value).digest('hex'),hashes={};
for(const path of ['state-tail-run.mjs','state-tail-worker.mjs','../../harness/source-manifest.mjs','../../harness/backend/fixture.mjs','../../harness/backend/target.mjs','../../harness/legacy-discovery-fixture.mjs'])hashes[path]=hash(await readFile(join(here,path)));
const provenance={schemaVersion:2,reconstructedHarness:true,diagnosticOnly:true,performanceAcceptance:false,configPath,configHash:hash(configBytes),config,hashes,startedAt:new Date().toISOString(),fixtureNow:config.fixtureNow??Date.now(),sources:Object.fromEntries(Object.entries(manifests).map(([name,value])=>[name,{commit:value.sourceCommit,fingerprint:value.fingerprint,dirty:value.dirty,root:value.root}])),children:[],complete:false};
await mkdir(dirname(output),{recursive:true});await mkdir(output);
// Progress may change; completion is written once only after every child and
// final source/harness check succeeds. Never reuse an existing output directory.
const save=()=>writeFile(join(output,'progress.json'),JSON.stringify(provenance,null,2)+'\n');await save();
let responseIdentity=null;
try{
    for(const scheduler of config.schedulers){const repetitions={};for(const name of config.order){
        const index=repetitions[name]=(repetitions[name]||0)+1,childOut=join(output,scheduler,`${name}-${index}`),entry=config.sources[name];
        const record={name,index,scheduler,output:childOut,startedAt:new Date().toISOString()};provenance.children.push(record);await save();console.log(`STATE DIAGNOSTIC ${scheduler} ${name}-${index}`);
        await new Promise((done,bad)=>{const child=spawn(process.execPath,[join(here,'state-tail-worker.mjs'),entry.root,childOut,entry.manifest,scheduler,String(provenance.fixtureNow),String(config.windows??4),String(config.samples??25),String(config.warmupSeconds??36)],{stdio:'inherit',env:{...process.env,KAIRO_STATE_CPU_PROFILE:config.cpuProfile?'1':'0'}});child.on('error',bad);child.on('exit',(code,signal)=>code===0?done():bad(Error(`${name}-${index} exited ${code??signal}`)));});
        const bytes=await readFile(join(childOut,'diagnostic.json')),result=JSON.parse(bytes);assert.equal(result.complete,true);assert.equal(result.cleanupComplete,true);assert.equal(result.sourceVerified,true);assert.equal(result.externalAttempts,0);
        const response={bytes:result.responseBefore.bytes,digest:result.responseBefore.digest,assetCount:result.responseBefore.assetCount};
        if(responseIdentity)assert.deepEqual(response,responseIdentity,'Cross-source or scheduler state response changed');else responseIdentity=response;
        record.completedAt=new Date().toISOString();record.sha256=hash(bytes);record.source=result.source;record.response=response;record.complete=true;await save();
    }}
    for(const manifest of Object.values(manifests))await verifySource(manifest);assert.equal(hash(await readFile(configPath)),provenance.configHash);
    for(const[path,expected]of Object.entries(hashes))assert.equal(hash(await readFile(join(here,path))),expected,'Harness changed');provenance.endVerified=true;provenance.complete=true;
    provenance.endedAt=new Date().toISOString();provenance.responseIdentity=responseIdentity;
    await writeFile(join(output,'completion.json'),JSON.stringify(provenance,null,2)+'\n',{flag:'wx'});
}catch(error){provenance.failure=error.stack;throw error;}
finally{provenance.endedAt=new Date().toISOString();await save();}
