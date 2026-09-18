// Three builds run sequentially in ABC/CBA order, never concurrently.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const [basePath,predbPath,rcPath,output]=process.argv.slice(2);
assert.ok(basePath&&predbPath&&rcPath&&output);
const paths={baseline:resolve(basePath),predb:resolve(predbPath),candidate:resolve(rcPath)},out=resolve(output),here=dirname(fileURLToPath(import.meta.url));
await mkdir(out,{recursive:true});
const revision=p=>execFileSync('git',['-C',p,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const provenance={harnessCommit:revision(join(here,'../..')),checkouts:{},order:['baseline-1','predb-1','candidate-1','candidate-2','predb-2','baseline-2'],note:'Tracked application files are clean. The same external harness is copied untracked into disposable measurement checkouts; it is excluded from the RC.',runUrl:process.env.GITHUB_RUN_ID?`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`:null};
for(const [name,path] of Object.entries(paths)){
    execFileSync('git',['-C',path,'diff','--exit-code']);
    provenance.checkouts[name]={commit:revision(path),tree:execFileSync('git',['-C',path,'rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim()};
}
await writeFile(join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
const run=(args,cwd=process.cwd(),env={})=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{cwd,env:{...process.env,...env},stdio:'inherit'});p.on('error',reject);p.on('exit',(code,signal)=>code===0?resolve():reject(new Error(`${args[0]} failed: ${code??signal}`)));});
for(const base of ['baseline','predb'])await run([join(here,'equivalence.mjs'),paths[base],paths.candidate,join(out,'equivalence-'+base)]);
for(const name of provenance.order){
    const key=name.replace(/-[12]$/,'');
    console.log('Backend: '+name);
    await run(['tests/performance/backend.mjs'],paths[key],{KAIRO_PERF_OUTPUT:join(out,name)});
}
for(const name of provenance.order){
    console.log('Database: '+name);
    await run([join(here,'rc-database.mjs'),paths[name.replace(/-[12]$/,'')],join(out,name)]);
}
await run([join(here,'verify-rc.mjs'),out]);
