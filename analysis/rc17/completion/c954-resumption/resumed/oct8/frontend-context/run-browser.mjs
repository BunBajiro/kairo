// Coordinator grants the runtime slot; invoke through flock /tmp/kairo-performance.lock.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {captureSource,verifySource} from '../../../../../harness/source-manifest.mjs';

assert.equal(process.env.KAIRO_MODELS_LOCKED,'1');
const [baseArg,trialArg,outArg]=process.argv.slice(2);assert.ok(baseArg&&trialArg&&outArg);
const roots={baseline:resolve(baseArg),candidate:resolve(trialArg)},out=resolve(outArg),here=dirname(fileURLToPath(import.meta.url));
const hash=data=>createHash('sha256').update(data).digest('hex');
const expectedCommit='22773cc7cb6e83ac51e412565ba65c101613536a';
await mkdir(out,{recursive:false});
const receipt={schemaVersion:1,startedAt:new Date().toISOString(),node:process.version,expectedCommit,complete:false,releaseReady:false,builds:[],diagnostics:[],runs:[]};
const harnesses={};for(const name of ['run-browser.mjs','browser-names.mjs','browser-names-semantics.mjs'])harnesses[name]=hash(await readFile(resolve(here,name)));receipt.harnesses=harnesses;
async function command(args,cwd,log){await new Promise((accept,reject)=>{const child=spawn(args[0],args.slice(1),{cwd,env:process.env,stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',b=>text+=b);child.stderr.on('data',b=>text+=b);child.on('error',reject);child.on('close',async code=>{await writeFile(log,text,{flag:'wx'});code===0?accept():reject(Error(`Exit ${code}: ${args.join(' ')}`));});});}
const manifests={};
try {
    const initial={};for(const [variant,root]of Object.entries(roots))initial[variant]=await captureSource(root,{expectedCommit,requireClean:variant==='baseline'});
    const allowed=['components/kairo/operations.tsx'];
    assert.deepEqual(initial.baseline.files.map(x=>x.path),initial.candidate.files.map(x=>x.path));
    assert.deepEqual(initial.baseline.files.filter((x,i)=>x.sha256!==initial.candidate.files[i].sha256).map(x=>x.path),allowed);
    await writeFile(resolve(out,'initial-source.json'),JSON.stringify(initial,null,2)+'\n',{flag:'wx'});
    for(const [variant,root]of Object.entries(roots)) {
        const build={variant,root,startedAt:new Date().toISOString(),commands:[],complete:false};receipt.builds.push(build);
        assert.equal(initial[variant].builtFiles.length,0,'Use a fresh isolated build root');
        for(const args of [['npm','run','check:kairo'],['npm','run','build']]){
            const log=resolve(out,`${variant}-${args.at(-1).replace(':','-')}.log`);await command(args,root,log);build.commands.push({args,exitCode:0,log:log.slice(out.length+1)});
        }
        const source=await captureSource(root,{expectedCommit,requireClean:variant==='baseline'});
        assert.deepEqual(source.files,initial[variant].files);assert.equal(source.status,initial[variant].status);assert.ok(source.builtFiles.length);
        manifests[variant]=source;await writeFile(resolve(out,`${variant}-source.json`),JSON.stringify(source,null,2)+'\n',{flag:'wx'});
        build.fingerprint=source.fingerprint;build.assets=source.builtFiles.length;build.complete=true;build.endedAt=new Date().toISOString();
        await writeFile(resolve(out,'progress.json'),JSON.stringify(receipt,null,2)+'\n');
    }
    for(const variant of ['baseline','candidate']){
        const filename=`${variant}-semantics.json`,path=resolve(out,filename);
        await command([process.execPath,resolve(here,'browser-names-semantics.mjs'),roots[variant],path,resolve(out,`${variant}-source.json`)],roots[variant],path+'.log');
        const bytes=await readFile(path),result=JSON.parse(bytes);assert.equal(result.complete,true);assert.equal(result.sourceVerified,true);assert.equal(result.harnessSha256,harnesses['browser-names-semantics.mjs']);
        assert.equal(result.mode,'diagnostic-counts');assert.equal(result.errors.length,0);assert.equal(result.external.length,0);assert.ok(result.checks.every(x=>x.passed));
        receipt.diagnostics.push({variant,filename,sha256:hash(bytes),checks:result.checks.length});
        await writeFile(resolve(out,'progress.json'),JSON.stringify(receipt,null,2)+'\n');
    }
    // Both variants retain the current implementation; do not pass the old --baseline ablation flag.
    for(const [index,variant]of ['baseline','candidate','candidate','baseline'].entries()){
        const filename=`${index+1}-${variant}.json`,path=resolve(out,filename);
        await command([process.execPath,resolve(here,'browser-names.mjs'),roots[variant],path,resolve(out,`${variant}-source.json`),'--timing'],roots[variant],path+'.log');
        const bytes=await readFile(path),result=JSON.parse(bytes);assert.equal(result.complete,true);assert.equal(result.sourceVerified,true);assert.equal(result.harnessSha256,harnesses['browser-names.mjs']);
        assert.equal(result.mode,'timing');assert.equal(result.errors.length,0);assert.equal(result.external.length,0);assert.ok(result.checks.every(x=>x.passed));
        receipt.runs.push({index:index+1,variant,filename,sha256:hash(bytes),checks:result.checks.length});
        await writeFile(resolve(out,'progress.json'),JSON.stringify(receipt,null,2)+'\n');
    }
    for(const source of Object.values(manifests))await verifySource(source);
    for(const [name,digest]of Object.entries(harnesses))assert.equal(hash(await readFile(resolve(here,name))),digest);
    receipt.sourceVerified=true;receipt.complete=true;
}catch(error){receipt.failure=error.stack;throw error;}
finally{receipt.endedAt=new Date().toISOString();await writeFile(resolve(out,'completed.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});}
