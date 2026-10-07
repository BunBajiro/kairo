import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest} from '../startup/fixture.mjs';
const output=resolve(process.argv[2]),here=dirname(fileURLToPath(import.meta.url)),sourceRoot='/workspace/scratch/a2f3334402fc';await mkdir(output,{recursive:true});
const report={complete:false,productionAcceptance:false,startedAt:new Date().toISOString(),hashes:{runner:digest(await readFile(fileURLToPath(import.meta.url))),worker:digest(await readFile(join(here,'lazy-browser.mjs')))},results:[]};
try{for(const [index,kind]of ['baseline','trial','trial','baseline'].entries()){
 const folder=join(output,`${index+1}-${kind}`),child=spawnSync(process.execPath,[join(here,'lazy-browser.mjs')],{encoding:'utf8',timeout:180000,env:{...process.env,KAIRO_BENCH_REPO:join(sourceRoot,'kairo-rc17-atlas-lazy-'+kind),KAIRO_BROWSER_OUTPUT:folder,KAIRO_BROWSER_PORT:'18934',KAIRO_BUILD_RECEIPT:join(here,'lazy-trial-20261007',kind+'-build-receipt.json')}});await writeFile(join(output,`${index+1}-${kind}.log`),(child.stdout||'')+(child.stderr||''));assert.equal(child.status,0,child.stderr||child.error?.message);const bytes=await readFile(join(folder,'result.json')),data=JSON.parse(bytes);assert.equal(data.complete,true);assert.equal(data.sourceVerified,true);report.results.push({index:index+1,kind,file:join(folder,'result.json'),sha256:digest(bytes),...data});await writeFile(join(output,'progress.json'),JSON.stringify(report,null,2));process.stderr.write(kind+' complete\n');
 }report.complete=true;report.endedAt=new Date().toISOString();await writeFile(join(output,'completed.json'),JSON.stringify(report,null,2),{flag:'wx'});
}catch(error){report.failure=error.stack;throw error;}finally{await writeFile(join(output,'progress.json'),JSON.stringify(report,null,2));}
