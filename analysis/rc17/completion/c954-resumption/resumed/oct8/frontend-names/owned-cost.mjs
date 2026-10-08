import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';

const [rootArg, variant, output] = process.argv.slice(2);
assert.ok(rootArg && ['baseline','candidate'].includes(variant) && output, 'root baseline|candidate output required');
const root = resolve(rootArg), modulePath = resolve(root, 'components/kairo/resource-state.mjs');
const hash = data => createHash('sha256').update(data).digest('hex');
const moduleBytes = await readFile(modulePath), harnessBytes = await readFile(fileURLToPath(import.meta.url));
const {retainValue, mergeResourceNames} = await import(pathToFileURL(modulePath));
const merge = variant === 'baseline' ? (previous, incoming) => retainValue(previous, {...previous, ...incoming}) : mergeResourceNames;
assert.equal(typeof merge, 'function');
const fixtures = [];
for (const size of [100,20000]) {
    const previous = Object.fromEntries(Array.from({length:size}, (_, index) => [String(index + 1), `Pilot ${index + 1}`]));
    for (const [label,incoming] of [
        ['full-unchanged', {...previous}],
        ['partial-unchanged', Object.fromEntries(Object.entries(previous).slice(0, Math.min(20,size)))],
        ['rename-first', {...previous, '1':'Renamed first'}],
        ['rename-last', {...previous, [size]:'Renamed last'}],
        ['addition', {...previous, [size+1]:'Added pilot'}],
        ['empty', {}],
    ]) fixtures.push({size,label,previous,incoming});
}
const result = {schemaVersion:1,startedAt:new Date().toISOString(),variant,root,node:process.version,
    moduleSha256:hash(moduleBytes),harnessSha256:hash(harnessBytes),fixtureSha256:hash(JSON.stringify(fixtures)),
    mode:'ordinary-owned-function',warmupCalls:10,callsPerSample:40,samplesPerCase:7,cases:[],complete:false,
    limitations:['Preparsed synthetic names isolate the synchronous merge owner; no JSON parse, server work, React, layout or whole-app responsiveness is measured.','No CPU sampling or forced garbage collection. Changed cases keep the same prior map so each measured call performs a real change.']};
let checksum = 0;
try {
    for (const fixture of fixtures) {
        const {size,label,previous,incoming} = fixture;
        const prior = JSON.stringify(previous), received = JSON.stringify(incoming);
        const expected = retainValue(previous, {...previous, ...incoming}), actual = merge(previous,incoming);
        assert.deepEqual(actual, expected); assert.equal(actual === previous, expected === previous);
        const sample = {size,label,outputSha256:hash(JSON.stringify(actual)),retainsPrevious:actual===previous,samplesMs:[]};
        for (let index=0;index<result.warmupCalls;index++) checksum += merge(previous,incoming)['1'].length;
        for (let round=0;round<result.samplesPerCase;round++) {
            const start=performance.now();
            for (let index=0;index<result.callsPerSample;index++) checksum += merge(previous,incoming)['1'].length;
            sample.samplesMs.push(performance.now()-start);
        }
        assert.equal(JSON.stringify(previous),prior); assert.equal(JSON.stringify(incoming),received);
        sample.medianPerCallMs = [...sample.samplesMs].sort((a,b)=>a-b)[Math.floor(sample.samplesMs.length/2)]/result.callsPerSample;
        result.cases.push(sample);
    }
    assert.equal(hash(await readFile(modulePath)),result.moduleSha256);
    assert.equal(hash(await readFile(fileURLToPath(import.meta.url))),result.harnessSha256);
    result.checksum=checksum;result.complete=true;
} catch (error) {result.failure=error.stack;throw error;}
finally {result.endedAt=new Date().toISOString();await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
