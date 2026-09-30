// Same-fixture dashboard comparison. Both repositories must already be compiled.
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {resolve} from 'node:path';
const current=resolve(process.env.KAIRO_BENCH_CANDIDATE||'.');
const stable=resolve(process.env.KAIRO_BENCH_BASELINE||'../kairo-v073');
const phases=[['baseline',1,stable,'239794774320fcdebaa1d76ce8a77c5c25cfc48c'],['candidate',1,current,'57c8dcc7fbd8fc2b62129498d1819050c78381a1'],['candidate',2,current,'57c8dcc7fbd8fc2b62129498d1819050c78381a1'],['baseline',2,stable,'239794774320fcdebaa1d76ce8a77c5c25cfc48c']];
for(const [name,repeat,repo,sourceCommit] of phases){
 const output=resolve(current,`analysis/rc16/raw/frontend-overview-${name}-${repeat}.json`);
 const log=createWriteStream(output.replace('.json','.log'));
 const child=spawn(process.execPath,[resolve(current,'analysis/rc16/harness/frontend-browser.mjs')],{cwd:current,env:{...process.env,KAIRO_FRONTEND_OVERVIEW:'1',KAIRO_FRONTEND_SMOKE:'0',KAIRO_BENCH_REPO:repo,KAIRO_BENCH_SOURCE_COMMIT:sourceCommit,KAIRO_FRONTEND_OUTPUT:output},stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(log);child.stderr.pipe(log);
 const code=await new Promise((res,rej)=>{child.on('exit',res);child.on('error',rej);});
 log.end();if(code!==0)throw Error(`Overview ${name}-${repeat} failed (${code}); see ${output}`);
 console.log(`Completed overview ${name}-${repeat}: ${output}`);
}
