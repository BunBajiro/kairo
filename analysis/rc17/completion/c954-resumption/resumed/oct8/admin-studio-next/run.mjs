// Runtime grant required. Run under flock /tmp/kairo-performance.lock.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {captureSource,verifySource} from '../../../../../harness/source-manifest.mjs';

assert.equal(process.env.KAIRO_MODELS_LOCKED,'1');
const here=dirname(fileURLToPath(import.meta.url)),out=resolve(process.argv[2]);
assert.ok(process.argv[2],'Choose a new attempt output directory');
await mkdir(out,{recursive:false});
const prep=JSON.parse(await readFile(resolve(here,'PREPARATION.json'))),expectedCommit=prep.sourceCommit;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const stamp=()=>new Date().toISOString();
const files=['run.mjs','populated-cost-next.mjs','PREPARATION.json','PLAN.md','legacy-admin-studio-ablation.patch',
    '../../../../../harness/source-manifest.mjs','../../../../../../rc16/historical/tests/performance/chrome.mjs',
    '../../../../studio-stream/populated-cost.mjs','../../../../frontend-models/legacy-ui-ablation.patch'];
const harnesses=Object.fromEntries(await Promise.all(files.map(async path=>[path,hash(await readFile(resolve(here,path)))])));
const receipt={schemaVersion:1,startedAt:stamp(),node:process.version,expectedCommit,sourceTree:prep.sourceTree,complete:false,releaseReady:false,
    harnesses,builds:[],runs:[],nativeRecovery:[],order:['baseline','candidate','candidate','baseline']};
const manifests={};
const progress=()=>writeFile(resolve(out,'progress.json'),JSON.stringify(receipt,null,2)+'\n');
async function command(args,cwd,log){
    return new Promise((accept,reject)=>{
        const child=spawn(args[0],args.slice(1),{cwd,env:process.env,stdio:['ignore','pipe','pipe']});let output='';
        child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);
        child.on('close',async code=>{await writeFile(log,output,{flag:'wx'});code===0?accept():reject(Error(`Exit ${code}: ${args.join(' ')}`));});
    });
}
async function worker(variant,mode,filename){
    const path=resolve(out,filename),root=prep.roots[variant].root;
    await verifySource(manifests[variant]);
    await command([process.execPath,resolve(here,'populated-cost-next.mjs'),root,path,resolve(out,variant+'-source.json'),mode],root,path+'.log');
    const bytes=await readFile(path),result=JSON.parse(bytes);
    assert.equal(result.complete,true);assert.equal(result.sourceVerified,true);assert.equal(result.cleanupVerified,true);
    assert.equal(result.mode,mode);assert.equal(result.harnessSha256,harnesses['populated-cost-next.mjs']);
    assert.equal(result.source.fingerprint,manifests[variant].fingerprint);
    assert.equal(result.errors.length,0);assert.equal(result.external.length,0);assert.ok(result.checks.every(c=>c.passed));
    assert.equal(result.samples.length,mode==='ordinary'?12:2);
    const row={variant,mode,filename,sha256:hash(bytes),checks:result.checks.length,phaseCount:result.samples.length};
    (mode==='ordinary'?receipt.runs:receipt.nativeRecovery).push(row);await progress();
    console.log(JSON.stringify(row));
}
try{
    receipt.chrome={path:process.env.KAIRO_CHROME_PATH,sha256:hash(await readFile(process.env.KAIRO_CHROME_PATH))};
    assert.equal(receipt.chrome.sha256,'7ddc6837ec0e0c9ff488cf8c8fa64d8eef71cc3fa7c79752c52367bddbfe94dd');
    const initial={};
    for(const variant of ['baseline','candidate']){
        const saved=prep.roots[variant],source=await captureSource(saved.root,{expectedCommit,requireClean:variant==='candidate'});
        assert.deepEqual(source.files,saved.files);assert.equal(source.status,saved.status);assert.equal(source.builtFiles.length,0,'Fresh isolated build roots required');
        initial[variant]=source;
    }
    await writeFile(resolve(out,'initial-source.json'),JSON.stringify(initial,null,2)+'\n',{flag:'wx'});
    for(const variant of ['baseline','candidate']){
        const root=prep.roots[variant].root,build={variant,root,startedAt:stamp(),complete:false,commands:[]};receipt.builds.push(build);await progress();
        for(const args of [['npm','run','check:kairo'],['npm','run','build']]){
            const filename=variant+'-'+args.at(-1).replace(':','-')+'.log';
            await command(args,root,resolve(out,filename));
            build.commands.push({args,exitCode:0,filename,sha256:hash(await readFile(resolve(out,filename)))});await progress();
        }
        const source=await captureSource(root,{expectedCommit,requireClean:variant==='candidate'});
        assert.deepEqual(source.files,initial[variant].files);assert.equal(source.status,initial[variant].status);assert.ok(source.builtFiles.length);
        manifests[variant]=source;
        await writeFile(resolve(out,variant+'-source.json'),JSON.stringify(source,null,2)+'\n',{flag:'wx'});
        Object.assign(build,{complete:true,completedAt:stamp(),sourceFingerprint:source.fingerprint,assets:source.builtFiles.length,exitCode:0,buildCommand:'npm run build',buildLog:resolve(out,variant+'-build.log'),logSha256:hash(await readFile(resolve(out,variant+'-build.log')))});
        await writeFile(resolve(out,variant+'-build-receipt.json'),JSON.stringify(build,null,2)+'\n',{flag:'wx'});await progress();
    }
    for(const [i,variant]of receipt.order.entries())await worker(variant,'ordinary',`${i+1}-${variant}.json`);
    await worker('candidate','native-recovery','5-candidate-native-recovery.json');
    for(const source of Object.values(manifests))await verifySource(source);
    for(const [path,digest]of Object.entries(harnesses))assert.equal(hash(await readFile(resolve(here,path))),digest);
    assert.equal(hash(await readFile(receipt.chrome.path)),receipt.chrome.sha256);
    receipt.sourceVerified=true;receipt.harnessVerified=true;receipt.complete=true;
}catch(error){receipt.failure=error.stack;process.exitCode=1;}
finally{receipt.endedAt=stamp();await writeFile(resolve(out,'completed.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({complete:receipt.complete,output:out,failure:receipt.failure}));}
