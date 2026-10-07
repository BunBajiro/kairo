// Separate cold/warm formatter worker. Run fresh baseline/candidate processes in ABBA order.
// KAIRO_MODELS_LOCKED=1 node formatter-cost.mjs <app-root> <output.json> <manifest.json>
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {loadSourceManifest,verifySource} from '../../harness/source-manifest.mjs';
assert.equal(process.env.KAIRO_MODELS_LOCKED,'1','Coordinator must grant exclusive runtime slot');
const [rootArg,outputArg,manifestArg]=process.argv.slice(2),root=resolve(rootArg),output=resolve(outputArg),source=await loadSourceManifest(manifestArg,root);
const imported=performance.now();
// Node 24 native type stripping imports the actual fixed UI formatter implementations.
const {isk,stamp}=await import(pathToFileURL(join(root,'components/kairo/model.ts')));
const importMs=performance.now()-imported,date='2026-10-07T10:20:00Z',value=1234.56;
const coldStart=performance.now(),coldOutputs=[isk(value),isk(value,true),stamp(date)],coldMs=performance.now()-coldStart;
const expected=[new Intl.NumberFormat('en-GB',{maximumFractionDigits:0,notation:'standard'}).format(value),new Intl.NumberFormat('en-GB',{maximumFractionDigits:2,notation:'compact'}).format(value),new Date(date).toLocaleString('en-GB',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'})+' EVE'];
assert.deepEqual(coldOutputs,expected);
const samples=[];
for(let round=0;round<5;round++){let outputCharacters=0;const start=performance.now();for(let i=0;i<10000;i++){outputCharacters+=isk(i*1234.56).length;outputCharacters+=isk(i*1234.56,true).length;outputCharacters+=stamp(date).length;}samples.push({round,calls:30000,ms:performance.now()-start,outputCharacters});}
assert.ok(samples.every(s=>s.outputCharacters===samples[0].outputCharacters));await verifySource(source);
const result={schemaVersion:1,source:{commit:source.sourceCommit,fingerprint:source.fingerprint,dirty:source.dirty},harnessSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),node:process.version,importMs,cold:{calls:3,ms:coldMs,outputs:coldOutputs},warm:samples,sourceVerified:true,limitations:['Actual UI formatter exports executed by Node 24, not Chromium; this isolates formatter cost and does not establish browser frame/CPU improvement.','Cold first-call cost is retained separately; import-time changes are reported.','Run matched fresh processes ABBA under the same runtime lock; first warm round is retained, not discarded.']};await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');
