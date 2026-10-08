import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,open,readdir,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {freezeSources} from './freeze-sources.mjs';
import {verifySource} from '../../../../../harness/source-manifest.mjs';

const self=fileURLToPath(import.meta.url),here=dirname(self);
if(process.env.KAIRO_M9_MATCHED_LOCK_HELD!=='1'){
    const processChild=spawn('flock',['-x','/tmp/kairo-performance.lock','flock','-x','/tmp/kairo-rc16-benchmark.lock',process.execPath,self,...process.argv.slice(2)],
        {stdio:'inherit',env:{...process.env,KAIRO_M9_MATCHED_LOCK_HELD:'1'}});
    process.exit(await new Promise((done,fail)=>{processChild.once('error',fail);processChild.once('exit',code=>done(code??1));}));
}
assert.equal(process.argv.length,3,'Supply a new output directory');
const output=resolve(process.argv[2]);await mkdir(output,{recursive:false});
const seedDirectory=await mkdtemp(join(tmpdir(),'kairo-m9-persistence-seeds-'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=[self,join(here,'freeze-sources.mjs'),join(here,'prototype-files.json'),join(here,'prototype.patch'),
    join(here,'persistence-workload.mjs'),join(here,'persistence-fixtures.mjs'),resolve(here,'../../../../../harness/source-manifest.mjs')];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,hash(await readFile(file))])));
const pinned=await hashes(),result={schemaVersion:1,complete:false,releaseReady:false,startedAt:new Date().toISOString(),
    order:['baseline-1','candidate-1','candidate-2','baseline-2'],seedDirectory,harnessHashes:pinned,children:[],
    limitations:['Fresh SQLite handles and identical database copies are used; OS page cache is not forced cold.',
        'Worker process maxRSS is a cumulative high-water mark, not a per-case retained-memory measurement.']};
const save=()=>writeFile(join(output,'progress.json'),JSON.stringify(result,null,2)+'\n');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
let sources;
async function child(label,role,mode){
    const target=join(output,label+'.json'),logPath=join(output,label+'.log'),log=await open(logPath,'wx');
    const args=[join(here,'persistence-workload.mjs'),join(output,'baseline-source.json'),join(output,role+'-source.json'),target,seedDirectory,mode];
    const receipt={label,role,mode,command:[process.execPath,...args],startedAt:new Date().toISOString()};
    await save();
    try{const processChild=spawn(process.execPath,args,{stdio:['ignore',log.fd,log.fd],env:{...process.env,KAIRO_M9_MATCHED_LOCK_HELD:'1'}});
        receipt.exitCode=await new Promise((done,fail)=>{processChild.once('error',fail);processChild.once('exit',code=>done(code??1));});
    }finally{await log.close();receipt.endedAt=new Date().toISOString();receipt.logSha256=hash(await readFile(logPath));result.children.push(receipt);await save();}
    assert.deepEqual(await hashes(),pinned,'Persistence harness changed during the run');
    assert.equal(receipt.exitCode,0,label+' failed; preserve this attempt');
    const value=await json(target);assert.ok(value.complete&&value.sourceVerified,label+' incomplete or source-unverified');
    process.stdout.write(JSON.stringify({child:label,complete:true})+'\n');
    return value;
}
try{
    sources=await freezeSources(output);
    result.sources=Object.fromEntries(Object.entries(sources).map(([role,value])=>[role,{commit:value.sourceCommit,fingerprint:value.fingerprint}]));
    const seed=await child('seed-preparation','baseline','seed-only');
    result.seedPreparation={complete:seed.complete,outputSha256:hash(await readFile(join(output,'seed-preparation.json')))};
    const arms={};
    for(const label of result.order)arms[label]=await child(label,label.startsWith('baseline')?'baseline':'candidate','measure');
    // The worker publishes the stable semantic/fixture comparison separately
    // from ordinary samples and variant-specific derivative/storage costs.
    assert.ok(arms['baseline-1'].cases.length>0);
    for(const label of result.order){
        assert.deepEqual(arms[label].cases.map(row=>row.id),arms['baseline-1'].cases.map(row=>row.id),label+' case order');
        for(let i=0;i<arms[label].cases.length;i++){
            const row=arms[label].cases[i],reference=arms['baseline-1'].cases[i];
            assert.ok(row.parity&&reference.parity,'Worker must expose an explicit stable parity boundary');
            assert.deepEqual(row.parity,reference.parity,label+': '+row.id+' authoritative/fixture/output parity');
        }
    }
    result.parity={complete:true,cases:arms['baseline-1'].cases.length};
    for(const source of Object.values(sources))await verifySource(source);
    assert.deepEqual(await hashes(),pinned);
    const artifacts=[];
    async function inventory(relative=''){
        for(const entry of await readdir(join(output,relative),{withFileTypes:true})){
            const path=join(relative,entry.name);
            if(entry.isDirectory())await inventory(path);
            else if(entry.isFile()&&path!=='progress.json'){
                const bytes=await readFile(join(output,path));artifacts.push({path,bytes:bytes.length,sha256:hash(bytes)});
            }
        }
    }
    await inventory();result.artifacts=artifacts.sort((a,b)=>a.path.localeCompare(b.path));
    result.sourceAndHarnessVerified=true;result.complete=true;
}catch(error){result.failure=error.stack;throw error;}
finally{
    result.endedAt=new Date().toISOString();
    if(result.complete){await rm(seedDirectory,{recursive:true,force:true});result.seedDirectoryRemoved=true;}
    await writeFile(join(output,result.complete?'completed.json':'failed.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    await save();
}
