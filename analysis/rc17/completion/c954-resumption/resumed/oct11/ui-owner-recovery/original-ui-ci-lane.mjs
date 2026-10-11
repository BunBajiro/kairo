// External CI owner for exact-source UI evidence. No application imports or edits.
// node ui-ci-lane.mjs <lane> <candidate-root> <source-manifest.json> <evidence-root>
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {loadSourceManifest,verifySource} from '../harness/source-manifest.mjs';
const [lane,rootArg,manifestArg,evidenceArg]=process.argv.slice(2),root=resolve(rootArg),manifestPath=resolve(manifestArg),evidence=resolve(evidenceArg);
const checkpoint=resolve(fileURLToPath(new URL('../../../',import.meta.url))),harnessRoot=join(checkpoint,'analysis/rc17/completion');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const out=join(evidence,lane),resultPath=join(out,'result.json'),logPath=join(out,'harness.log');
const cases=['repeat-small','repeat-cap','distinct-cap'];
const specifications={
 'frontend-refresh':{file:'frontend-refresh/browser-acceptance.mjs',args:[root,resultPath,manifestPath],env:{KAIRO_REFRESH_LOCKED:'1'}},
 'admin-polling':{file:'admin-polling/browser-acceptance.mjs',args:[root,resultPath]},
 'frontend-models':{file:'frontend-models/browser-acceptance.mjs',args:[root,resultPath,manifestPath],env:{KAIRO_MODELS_LOCKED:'1',KAIRO_MODEL_ROWS:'10000'}},
 'studio-stream':{file:'studio-stream/browser-acceptance.mjs',args:[],env:{KAIRO_BENCH_REPO:root,KAIRO_BROWSER_OUTPUT:out,KAIRO_BUILD_RECEIPT:join(evidence,'build-receipt.json')}},
 ...Object.fromEntries(cases.map(value=>['session-replay-'+value,{file:'session-replay/compiled-replay-trial.mjs',args:[],replayCase:value,env:{KAIRO_BENCH_REPO:root,KAIRO_REPLAY_CASE:value,KAIRO_FOLLOWUP_FRONTEND_OUTPUT:resultPath,KAIRO_FOLLOWUP_SMOKE:'0'}}])),
};
const spec=specifications[lane];assert.ok(spec,'Unknown completion UI lane');
await mkdir(out,{recursive:true});
const receipt={schemaVersion:1,lane,startedAt:new Date().toISOString(),sourceManifest:manifestPath,sourceVerifiedBefore:false,sourceVerifiedAfter:false,complete:false,reviewReady:false,limitations:spec.replayCase?['Single-candidate compiled replay/ownership evidence; no matched ABBA performance closure.']:['Diagnostic UI request/publication checks; no elapsed-time improvement claim.']};
let manifest,log,child,timeout,killer;
function signalGroup(signal) {if (!child?.pid) return false;try {process.kill(-child.pid,signal);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
try{
 manifest=await loadSourceManifest(manifestPath,root);assert.equal(manifest.dirty,false);assert.ok(manifest.builtFiles.length);
 assert.equal(manifest.sourceCommit,process.env.CANDIDATE_SHA,'Request, checkout and manifest sourceCommit must agree');
 receipt.sourceCommit=manifest.sourceCommit;receipt.sourceFingerprint=manifest.fingerprint;receipt.sourceTree=execFileSync('git',['-C',root,'rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim();receipt.sourceVerifiedBefore=true;
 const script=join(harnessRoot,spec.file),args=[script,...spec.args];
 receipt.command=[process.execPath,...args];receipt.environment={...spec.env,KAIRO_BENCH_SOURCE_COMMIT:manifest.sourceCommit,KAIRO_SOURCE_MANIFEST:manifestPath,KAIRO_CHROME_PATH:process.env.KAIRO_CHROME_PATH};
 receipt.harnessSha256=sha256(await readFile(script));receipt.ownerSha256=sha256(await readFile(new URL(import.meta.url)));
 log=createWriteStream(logPath,{flags:'wx'});
 child=spawn(process.execPath,args,{cwd:checkpoint,env:{...process.env,...receipt.environment},detached:true,stdio:['ignore','pipe','pipe']});
 for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{log.write(bytes);process.stdout.write(bytes);});
 timeout=setTimeout(()=>{receipt.timedOut=true;signalGroup('SIGTERM');killer=setTimeout(()=>signalGroup('SIGKILL'),10000);},600000);
 const exit=await new Promise((done,fail)=>{child.once('error',fail);child.once('close',(code,signal)=>done({code,signal}));});
 receipt.exitCode=exit.code;receipt.signal=exit.signal;clearTimeout(timeout);clearTimeout(killer);
 await new Promise((done,fail)=>{log.once('error',fail);log.end(done);});log=null;
 assert.equal(exit.code,0,'Harness process failed');
 const result=JSON.parse(await readFile(resultPath,'utf8'));
 assert.ok(!result.failure,'Harness recorded a failure');assert.deepEqual(result.errors,[]);
 if(spec.replayCase){
  assert.equal(result.sourceCommit,manifest.sourceCommit);assert.equal(result.replayCase,spec.replayCase);assert.equal(result.smoke,false);assert.ok(result.endedAt);
  assert.deepEqual(result.controls,{successfulBrowserExternalResponses:0,rendererExceptions:0,deniedBackendFetchAttempts:0});
  assert.ok(result.samples.some(value=>value.name==='replay-playback-middle-60x'));assert.equal(result.retentionMethod.measuredCycles,12);assert.equal(result.eventSourceRequests.length,1);
  receipt.provenanceBoundary='Replay harness receives source SHA by environment; this external owner verifies the complete source/build manifest before and after.';
 }else{
  assert.equal(result.complete,true);assert.ok(result.checks.length);assert.ok(result.checks.every(value=>typeof value==='string'||value.passed===true));assert.deepEqual(result.external,[]);
  assert.equal(result.source?.commit||result.sourceCommit,manifest.sourceCommit);assert.equal(result.source?.fingerprint||result.sourceFingerprint,manifest.fingerprint);
 }
 receipt.resultValidated=true;
}catch(error){receipt.failure=error.stack||String(error);process.exitCode=1;}
finally{
 clearTimeout(timeout);clearTimeout(killer);
 try{if(signalGroup('SIGTERM')){await delay(1500);signalGroup('SIGKILL');}receipt.processGroupCleaned=true;}catch(error){receipt.cleanupFailure=error.stack||String(error);process.exitCode=1;}
 if(log)await new Promise(done=>log.end(done));
 if(manifest)try{await verifySource(manifest);receipt.sourceVerifiedAfter=true;}catch(error){receipt.sourceFailure=error.stack||String(error);process.exitCode=1;}
 receipt.complete=!!(receipt.resultValidated&&receipt.sourceVerifiedBefore&&receipt.sourceVerifiedAfter&&!receipt.failure&&!receipt.sourceFailure&&!receipt.cleanupFailure);
 receipt.completedAt=new Date().toISOString();receipt.files=[];
 async function inventory(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())await inventory(path);else if(entry.isFile()&&entry.name!=='lane-receipt.json'){const bytes=await readFile(path);receipt.files.push({path:relative(out,path),bytes:bytes.length,sha256:sha256(bytes)});}}}
 await inventory(out);receipt.files.sort((a,b)=>a.path.localeCompare(b.path));await writeFile(join(out,'lane-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 if(!receipt.complete)process.exitCode=1;
 console.log(JSON.stringify({lane,complete:receipt.complete,output:out,failure:receipt.failure,sourceFailure:receipt.sourceFailure}));
}
