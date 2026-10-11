// Offline owner assertions over preserved worker output. No Kairo imports/runtime.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
const raw='/tmp/kairo-final-matrix-public-20261011/attempt1/ui/completion-ui/session-replay-repeat-small/result.json';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const original=await readFile(join(here,'original-ui-ci-lane.mjs'),'utf8');
const proposed=await readFile(join(here,'proposed-ui-ci-lane.mjs'),'utf8');
assert.equal(proposed,original.replace('assert.equal(result.smoke,false)','assert.equal(result.environment?.smoke,false)'));
const begin="assert.ok(!result.failure,'Harness recorded a failure');assert.deepEqual(result.errors,[]);";
function validator(text){
 const code=text.slice(text.indexOf(begin),text.indexOf(' }else{',text.indexOf(begin)))+' }';
 assert.ok(code.includes('if(spec.replayCase)')&&code.includes('measuredCycles,12'));
 const fn=new Function('assert','result','manifest','spec','receipt',code);
 return result=>fn(assert,result,{sourceCommit:'70cd12f9a4d014e7e2cf931b9681c4bdc7f18789'},{replayCase:'repeat-small'},{});
}
const bytes=await readFile(raw),result=JSON.parse(bytes),oldValidate=validator(original),validate=validator(proposed),checks=[];
assert.throws(()=>oldValidate(result),/undefined/);checks.push('Original wrapper reproduces the exact undefined-versus-false schema failure');
validate(result);checks.push('Corrected complete replay branch accepts the actual completed worker record');
for(const [label,change] of [
 ['smoke true',x=>{x.environment.smoke=true;}],
 ['missing nested smoke with misleading top-level false',x=>{delete x.environment.smoke;x.smoke=false;}],
 ['missing environment',x=>{delete x.environment;}],
 ['numeric smoke zero',x=>{x.environment.smoke=0;}],
 ['string smoke false',x=>{x.environment.smoke='false';}],
 ['null smoke',x=>{x.environment.smoke=null;}],
 ['object smoke',x=>{x.environment.smoke={};}],
 ['null environment',x=>{x.environment=null;}],
 ['string environment',x=>{x.environment='false';}],
 ['incomplete cycle count',x=>{x.retentionMethod.measuredCycles=11;}],
 ['wrong source identity',x=>{x.sourceCommit='wrong-source';}],
 ['wrong replay case',x=>{x.replayCase='distinct-cap';}],
 ['renderer error',x=>{x.errors=['synthetic error'];}],
 ['external response',x=>{x.controls.successfulBrowserExternalResponses=1;}],
 ['missing middle-playback sample',x=>{x.samples=x.samples.filter(s=>s.name!=='replay-playback-middle-60x');}],
 ['extra EventSource',x=>{x.eventSourceRequests.push({synthetic:true});}],
 ['missing completion time',x=>{delete x.endedAt;}],
]){const value=structuredClone(result);change(value);assert.throws(()=>validate(value));checks.push('Rejects '+label);}
const report={complete:true,scope:'Offline assertion-only schema controls; no application or browser execution',checks,
 bindings:{originalOwner:{path:join(here,'original-ui-ci-lane.mjs'),sha256:hash(original)},proposedOwner:{path:join(here,'proposed-ui-ci-lane.mjs'),sha256:hash(proposed)},raw:{path:raw,bytes:bytes.length,sha256:hash(bytes)}},
 originalAttemptRemainsFailed:true,measurementRerun:false};
await writeFile(join(here,'OWNER-SCHEMA-CONTROLS.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({complete:true,checks:checks.length,noApplicationRuntime:true}));
