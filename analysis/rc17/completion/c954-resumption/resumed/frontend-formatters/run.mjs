// Coordinator-granted exclusive slot only; invoke through flock /tmp/kairo-performance.lock.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {captureSource, loadSourceManifest, verifySource} from '../../../../harness/source-manifest.mjs';
assert.equal(process.env.KAIRO_MODELS_LOCKED, '1');
const [baselineArg, candidateArg, outputArg] = process.argv.slice(2), baseline = resolve(baselineArg), candidate = resolve(candidateArg), output = resolve(outputArg);
const here = fileURLToPath(new URL('.', import.meta.url)), legacy = resolve(here, '../../../frontend-models'), worker = join(legacy, 'formatter-cost.mjs'), semanticsWorker = join(here, 'semantics.mjs');
const expectedCandidate = 'f01072674c044f39badc5e5e56c0c3d676621c07', c954 = 'c954c0d808847f249df0659ed15fdce2e89f84c4';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = async () => Object.fromEntries(await Promise.all([fileURLToPath(import.meta.url), worker, semanticsWorker, resolve(here, '../../../../harness/source-manifest.mjs')].map(async file => [file, hash(await readFile(file))])));
const progress = {schemaVersion:1, startedAt:new Date().toISOString(), complete:false, order:[], failure:null};
await mkdir(output, {recursive:false});
async function save(name, value) {await writeFile(join(output, name), JSON.stringify(value, null, 2) + '\n');}
async function child(args, prefix) {
  await new Promise((accept, reject) => {
    const run = spawn(process.execPath, args, {env:process.env, stdio:['ignore','pipe','pipe']});
    let stdout = '', stderr = '';
    run.stdout.on('data', bytes => stdout += bytes); run.stderr.on('data', bytes => stderr += bytes);
    run.on('error', reject);
    run.on('close', async code => {await writeFile(prefix + '.stdout.log', stdout); await writeFile(prefix + '.stderr.log', stderr); code === 0 ? accept() : reject(Error('Child exited ' + code + ': ' + args[0]));});
  });
}
const median = values => {const a = [...values].sort((a,b) => a-b); return (a[(a.length-1)>>1] + a[a.length>>1]) / 2;};
const stats = values => ({median:median(values), min:Math.min(...values), max:Math.max(...values), values});
try {
  const sourceA = await loadSourceManifest(join(legacy, 'ablation-source.json'), baseline), sourceB = await captureSource(candidate, {expectedCommit:expectedCandidate, requireClean:true});
  const manifestA = join(output, 'baseline-source.json'), manifestB = join(output, 'candidate-source.json');
  await save('baseline-source.json', sourceA); await save('candidate-source.json', sourceB);
  const originalModel = await readFile(join(baseline, 'components/kairo/model.ts'), 'utf8'), currentModel = await readFile(join(candidate, 'components/kairo/model.ts'), 'utf8');
  const originalLines = originalModel.split('\n'), expectedModel = originalLines.filter(line => !line.startsWith('export const stamp =')).map(line => line.startsWith('export const isk =') ? "export { isk, stamp } from './formatters.mjs';" : line).join('\n');
  assert.equal(currentModel, expectedModel, 'Imported model differs only in original per-cell formatter definitions versus lazy exports');
  const closure = [];
  for (const path of ['components/kairo/model.ts', 'components/kairo/formatters.mjs', 'components/kairo/workspace-navigation.mjs']) {
    const bytes = await readFile(join(candidate, path)), prior = execFileSync('git', ['-C', candidate, 'show', c954 + ':' + path]);
    assert.deepEqual(bytes, prior, 'Current formatter import closure must match c954: ' + path); closure.push({path, candidateSha256:hash(bytes), matchesC954:true});
  }
  assert.deepEqual(await readFile(join(baseline,'components/kairo/workspace-navigation.mjs')), await readFile(join(candidate,'components/kairo/workspace-navigation.mjs')));
  progress.sources = {baseline:{commit:sourceA.sourceCommit, fingerprint:sourceA.fingerprint, dirty:sourceA.dirty}, candidate:{commit:sourceB.sourceCommit, fingerprint:sourceB.fingerprint, dirty:sourceB.dirty}};
  progress.importClosure = closure; progress.harnessHashes = await hashes(); await save('progress.json', progress);
  const semanticsFile = join(output,'semantics.json'); await child([semanticsWorker, manifestA, manifestB, semanticsFile], semanticsFile);
  const semantic = JSON.parse(await readFile(semanticsFile)); assert.equal(semantic.complete,true); assert.equal(semantic.sourceVerified,true);
  const results = [];
  for (let cycle = 1; cycle <= 3; cycle++) for (const [position, variant] of ['baseline','candidate','candidate','baseline'].entries()) {
    const name = `${cycle}-${position+1}-${variant}`, resultFile = join(output, name+'.json');
    await child([worker, variant==='baseline'?baseline:candidate, resultFile, variant==='baseline'?manifestA:manifestB], resultFile);
    const result = JSON.parse(await readFile(resultFile)); assert.equal(result.sourceVerified,true); assert.equal(result.harnessSha256,progress.harnessHashes[worker]);
    assert.deepEqual(result.cold.outputs,['1,235','1.23k','7 Oct, 10:20 EVE']);
    assert.equal(result.warm.length,5); assert.ok(result.warm.every(row => row.calls===30000 && row.outputCharacters===semantic.representative.outputCharacters));
    progress.order.push({cycle,position:position+1,variant,file:name+'.json',sha256:hash(await readFile(resultFile))}); results.push({variant,...result}); await save('progress.json',progress);
    console.log(name+' complete');
  }
  await Promise.all([verifySource(sourceA),verifySource(sourceB)]); assert.deepEqual(await hashes(),progress.harnessHashes,'Harnesses changed during run');
  const comparison = {schemaVersion:1, sources:progress.sources, complete:true, method:'Three sequential ABBA cycles; six fresh processes per variant. Warm statistics aggregate per-process medians of five retained windows, including round zero.', semanticSha256:hash(await readFile(semanticsFile)), variants:{}, limitations:['Actual UI exports under Node 24; not Chromium, end-user startup, browser frame time or whole-app CPU.','Cold is the ordered first decimal/compact/date triplet; first-use costs are not omitted from import+cold.','Descriptive medians/ranges; within-process warm windows are not independent fresh-process replications.']};
  for (const variant of ['baseline','candidate']) {const rows=results.filter(r=>r.variant===variant); comparison.variants[variant]={processes:rows.length,importMs:stats(rows.map(r=>r.importMs)),firstValidThreeMs:stats(rows.map(r=>r.cold.ms)),importPlusFirstUseMs:stats(rows.map(r=>r.importMs+r.cold.ms)),warm30kPerProcessMedianMs:stats(rows.map(r=>median(r.warm.map(w=>w.ms)))),allWarmWindowsMs:rows.map(r=>r.warm.map(w=>w.ms))};}
  await save('comparison.json',comparison); progress.complete=true; progress.endedAt=new Date().toISOString(); progress.sourceVerified=true; progress.harnessVerified=true; await save('completed.json',progress);
} catch(error) {progress.failure=error.stack;progress.endedAt=new Date().toISOString();process.exitCode=1;} finally {await save('progress.json',progress);}
