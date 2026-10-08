import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';

const [baseArg, trialArg, outputArg] = process.argv.slice(2);
assert.ok(baseArg && trialArg && outputArg,'baselineRoot trialRoot outputDir required');
const baseline=resolve(baseArg),candidate=resolve(trialArg),out=resolve(outputArg),here=dirname(fileURLToPath(import.meta.url));
const sha=data=>createHash('sha256').update(data).digest('hex');
const allowed=['components/kairo/dashboard.tsx','components/kairo/resource-state.d.mts','components/kairo/resource-state.mjs','tests/kairo/resource-state.test.mjs'].sort();
async function capture(root) {
    const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
    assert.equal(head,'9afa9a7197fa6b5a802e9efdaa322dedf2439150');
    const paths=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).sort();
    const files=[];for(const path of paths){const data=await readFile(resolve(root,path));files.push({path,bytes:data.length,sha256:sha(data)});}
    return {root,head,files,fingerprint:sha(JSON.stringify(files))};
}
await mkdir(out,{recursive:false});
const sources={baseline:await capture(baseline),candidate:await capture(candidate)};
assert.deepEqual(sources.baseline.files.map(x=>x.path),sources.candidate.files.map(x=>x.path));
assert.deepEqual(sources.baseline.files.filter((x,i)=>x.sha256!==sources.candidate.files[i].sha256).map(x=>x.path),allowed);
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:baseline,encoding:'utf8'}).trim(),'');
const harnesses={};for(const path of ['owned-cost.mjs','run-owned.mjs'])harnesses[path]=sha(await readFile(resolve(here,path)));
await writeFile(resolve(out,'sources.json'),JSON.stringify(sources,null,2)+'\n',{flag:'wx'});
const result={schemaVersion:1,startedAt:new Date().toISOString(),node:process.version,complete:false,sourceVerified:false,harnesses,order:[],runs:[],releaseReady:false};
const run=(variant,file)=>new Promise((resolveRun,reject)=>{
    const child=spawn(process.execPath,[resolve(here,'owned-cost.mjs'),variant==='baseline'?baseline:candidate,variant,file],{stdio:['ignore','pipe','pipe']});
    let log='';child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
    child.on('error',reject);child.on('close',async(code)=>{await writeFile(file+'.log',log,{flag:'wx'});code===0?resolveRun():reject(new Error(`${variant} exited ${code}`));});
});
try {
    for(let cycle=1;cycle<=3;cycle++)for(const [arm,variant] of ['baseline','candidate','candidate','baseline'].entries()) {
        const name=`cycle-${cycle}-${arm+1}-${variant}.json`,path=resolve(out,name);
        result.order.push({cycle,arm:arm+1,variant,name});await run(variant,path);
        const bytes=await readFile(path),record=JSON.parse(bytes);assert.equal(record.complete,true);
        result.runs.push({name,sha256:sha(bytes),bytes:bytes.length});
        await writeFile(resolve(out,'progress.json'),JSON.stringify(result,null,2)+'\n');
    }
    const runs=await Promise.all(result.order.map(async row=>({...row,result:JSON.parse(await readFile(resolve(out,row.name)))})));
    const canonical=runs[0].result;
    for(const {result:r} of runs){assert.equal(r.fixtureSha256,canonical.fixtureSha256);assert.equal(r.checksum,canonical.checksum);assert.deepEqual(r.cases.map(({size,label,outputSha256,retainsPrevious})=>({size,label,outputSha256,retainsPrevious})),canonical.cases.map(({size,label,outputSha256,retainsPrevious})=>({size,label,outputSha256,retainsPrevious})));}
    const after={baseline:await capture(baseline),candidate:await capture(candidate)};assert.deepEqual(after,sources);
    for(const [path,digest] of Object.entries(harnesses))assert.equal(sha(await readFile(resolve(here,path))),digest);
    result.sourceVerified=true;result.complete=true;
} catch(error){result.failure=error.stack;throw error;}
finally{result.endedAt=new Date().toISOString();await writeFile(resolve(out,'completed.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
