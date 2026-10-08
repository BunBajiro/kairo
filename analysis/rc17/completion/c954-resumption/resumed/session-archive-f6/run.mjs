import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {captureSource,verifySource} from '../../../../harness/source-manifest.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(process.argv[2]||'/workspace/scratch/a2f3334402fc/kairo-archive-227-frozen'),out=resolve(process.argv[3]||join(here,'attempt1'));
assert.equal(process.env.KAIRO_ARCHIVE_LOCKED,'1');await mkdir(out,{recursive:false});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),source=await captureSource(root,{expectedCommit:'22773cc7cb6e83ac51e412565ba65c101613536a',requireClean:true});assert.equal(source.fingerprint,'2c72fd451304d300e05a57d9b4eecc8bd906233c65c9478ad353e4578a474872');
const manifest=join(out,'source.json');await writeFile(manifest,JSON.stringify(source,null,2)+'\n',{flag:'wx'});
const harnesses={};for(const file of ['run.mjs','browser-cardinality.mjs'])harnesses[file]=hash(await readFile(join(here,file)));
const report={complete:false,productionAcceptance:false,sourceFingerprint:source.fingerprint,startedAt:new Date().toISOString(),harnesses,runs:[]};
try{for(let i=1;i<=3;i++){
 const output=join(out,`run-${i}.json`),child=spawnSync(process.execPath,[join(here,'browser-cardinality.mjs'),root,output,manifest],{encoding:'utf8',timeout:300000,maxBuffer:10000000,env:{...process.env,KAIRO_CHROME_PATH:'/tmp/kairo-chrome-runtime/chromium'}});await writeFile(join(out,`run-${i}.log`),(child.stdout||'')+(child.stderr||''),{flag:'wx'});assert.equal(child.status,0,child.error?.stack||child.stderr);const bytes=await readFile(output),value=JSON.parse(bytes);assert.equal(value.complete,true);assert.equal(value.sourceVerified,true);assert.equal(value.cleanupVerified,true);assert.equal(value.contractAcceptance,false);assert.ok(value.checks.filter(check=>check.gate==='hard').every(check=>check.passed));report.runs.push({index:i,file:output,sha256:hash(bytes),checks:value.checks.length,hardChecksPassed:value.checks.filter(check=>check.gate==='hard').every(check=>check.passed),knownFindings:value.knownFindings,contractAcceptance:value.contractAcceptance,fixtureSha256:value.fixtureSha256});await writeFile(join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');
 }await verifySource(source);for(const[file,digest]of Object.entries(harnesses))assert.equal(hash(await readFile(join(here,file))),digest);report.complete=true;report.endedAt=new Date().toISOString();await writeFile(join(out,'completed.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}catch(error){report.failure=error.stack;throw error;}finally{await writeFile(join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');}
