import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, open, readdir} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {freezeSources} from './freeze-sources.mjs';
import {verifySource} from '../../../../../harness/source-manifest.mjs';

const self = fileURLToPath(import.meta.url), here = dirname(self);
if (process.env.KAIRO_M9_MATCHED_LOCK_HELD !== '1') {
    const child = spawn('flock', ['-x', '/tmp/kairo-performance.lock', 'flock', '-x', '/tmp/kairo-rc16-benchmark.lock', process.execPath, self, ...process.argv.slice(2)], {
        stdio: 'inherit', env: {...process.env, KAIRO_M9_MATCHED_LOCK_HELD: '1'},
    });
    process.exit(await new Promise((done, fail) => { child.once('error', fail); child.once('exit', code => done(code ?? 1)); }));
}
assert.equal(process.argv.length, 3, 'Supply a new, nonexisting output directory');
const output = resolve(process.argv[2]);
await mkdir(output, {recursive: false});
const maps = resolve(here, '../../../../maps-final'), harness = resolve(here, '../../../../../harness');
const paths = [self, join(here, 'freeze-sources.mjs'), join(here, 'mutation-guards.mjs'),
    join(here, 'prototype-files.json'), join(here, 'prototype.patch'),
    join(maps, 'summary-workload.mjs'), join(maps, 'summary-runner.mjs'), join(maps, 'maps-runner.mjs'),
    ...['source-manifest.mjs', 'maps-scaling.mjs', 'maps-equivalence.mjs'].map(file => join(harness, file))];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function hashes() { return Object.fromEntries(await Promise.all(paths.map(async path => [path, hash(await readFile(path))]))); }
const pinned = await hashes(), result = {schemaVersion: 1, startedAt: new Date().toISOString(), complete: false,
    internalDecisionEvidence: true, releaseReady: false, harnessHashes: pinned,
    locks: ['/tmp/kairo-performance.lock', '/tmp/kairo-rc16-benchmark.lock'], children: []};
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const saveProgress = () => writeFile(join(output, 'progress.json'), JSON.stringify(result, null, 2) + '\n');
async function child(name, file, args, environment = {}) {
    await saveProgress();
    const logPath = join(output, name + '.log'), log = await open(logPath, 'wx');
    const startedAt = new Date().toISOString();
    let code;
    try {
        const processChild = spawn(process.execPath, [file, ...args], {
            stdio: ['ignore', log.fd, log.fd], env: {...process.env, ...environment},
        });
        code = await new Promise((done, fail) => { processChild.once('error', fail); processChild.once('exit', status => done(status ?? 1)); });
    } finally { await log.close(); }
    const receipt = {name, command: [process.execPath, file, ...args], startedAt, endedAt: new Date().toISOString(), exitCode: code,
        logPath, logSha256: hash(await readFile(logPath))};
    result.children.push(receipt); await saveProgress();
    assert.deepEqual(await hashes(), pinned, 'Harness or proposal changed during the run');
    assert.equal(code, 0, name + ' failed; preserve this attempt and inspect its raw output');
    process.stdout.write(JSON.stringify({child: name, complete: true}) + '\n');
}
let sources;
try {
    sources = await freezeSources(output);
    result.sources = Object.fromEntries(Object.entries(sources).map(([role, value]) => [role, {commit: value.sourceCommit, fingerprint: value.fingerprint}]));
    const manifest = role => join(output, role + '-source.json');
    for (const role of ['baseline', 'candidate']) {
        await child('guards-' + role, join(here, 'mutation-guards.mjs'), [manifest(role), join(output, 'guards-' + role + '.json')]);
    }
    const guards = await Promise.all(['baseline', 'candidate'].map(role => json(join(output, 'guards-' + role + '.json'))));
    assert.ok(guards.every(value => value.complete && value.sourceVerified && value.disconnectedOwnerReadAndMutationRejected && value.external === 0));
    assert.equal(guards[0].fixtureSha256, guards[1].fixtureSha256);
    assert.equal(guards[0].phases.length, 15); assert.equal(guards[1].phases.length, 15);
    for (let i = 0; i < guards[0].phases.length; i++) {
        const a = guards[0].phases[i], b = guards[1].phases[i];
        for (const key of ['name', 'value', 'outputSha256', 'outputBytes', 'stored', 'storedSha256', 'authoritativeRecordChanges', 'authoritativeMapWrites']) assert.deepEqual(b[key], a[key], a.name + ': ' + key);
        assert.equal(b.databaseChanges - a.databaseChanges, 2 * b.authoritativeMapWrites, a.name + ': audited existing-map derivative delete/insert writes');
    }
    result.mutationParity = {complete: true, phases: 15, fixtureSha256: guards[0].fixtureSha256, metadataWriteAudit: guards[0].phases.map((row,i)=>({name:row.name,baselineTotalChanges:row.databaseChanges,candidateTotalChanges:guards[1].phases[i].databaseChanges,authoritativeMapWrites:row.authoritativeMapWrites}))};
    for (const role of ['baseline', 'candidate']) {
        await child('summary-counts-' + role, join(maps, 'summary-workload.mjs'), [manifest(role), join(output, 'summary-counts-' + role + '.json'), 'diagnostics'], {KAIRO_SUMMARY_LOCKED: '1'});
    }
    const counts = await Promise.all(['baseline', 'candidate'].map(role => json(join(output, 'summary-counts-' + role + '.json'))));
    assert.ok(counts.every(value => value.complete && value.sourceVerified && value.mode === 'diagnostics' && value.cases.length === 27));
    for (let i = 0; i < 27; i++) {
        const [a, b] = counts.map(value => value.cases[i]);
        assert.deepEqual(a.fixture, b.fixture); assert.equal(a.action, b.action);
        assert.equal(a.samples[0].outputSha256, b.samples[0].outputSha256);
        assert.equal(a.samples[0].outputBytes, b.samples[0].outputBytes);
    }
    result.countParity = {complete: true, cases: 27};
    await child('summary-abba', join(maps, 'summary-runner.mjs'), [manifest('baseline'), manifest('candidate'), join(output, 'summary-abba')], {KAIRO_SUMMARY_ABBA_LOCKED: '1'});
    const summary = await json(join(output, 'summary-abba/provenance.json'));
    assert.ok(summary.complete); assert.deepEqual(summary.order, ['baseline-1', 'candidate-1', 'candidate-2', 'baseline-2']);
    for (const label of summary.order) {
        const value = await json(join(output, 'summary-abba', label + '.json'));
        assert.ok(value.complete && value.sourceVerified && value.cases.length === 27);
        assert.ok(value.cases.every(row => row.samples.length === 5 && row.samples.every(sample => sample.diagnostics === null)));
    }
    await child('maps-matrix', join(maps, 'maps-runner.mjs'), [manifest('baseline'), manifest('candidate'), join(output, 'maps-matrix')], {KAIRO_MAPS_FINAL_LOCKED: '1'});
    assert.ok((await json(join(output, 'maps-matrix/provenance.json'))).complete);
    for (const label of ['baseline-1', 'candidate-1', 'candidate-2', 'baseline-2']) {
        const file = label.endsWith('-2') ? 'maps-timings-reverse.json' : 'maps-timings.json';
        const value = await json(join(output, 'maps-matrix', label, file));
        assert.ok(value.sourceAndHarnessStableDuringRun && value.results.length === 21);
        assert.ok(value.results.every(row => row.samples.length === 7));
    }
    assert.ok((await json(join(output, 'maps-matrix/equivalence/comparison.json'))).equalIgnoringObjectKeyOrder);
    for (const source of Object.values(sources)) await verifySource(source);
    assert.deepEqual(await hashes(), pinned);
    const artifacts = [];
    async function inventory(relative = '') {
        for (const entry of await readdir(join(output, relative), {withFileTypes: true})) {
            const path = join(relative, entry.name);
            if (entry.isDirectory()) await inventory(path);
            else if (entry.isFile() && path !== 'progress.json') {
                const bytes = await readFile(join(output, path)); artifacts.push({path, bytes: bytes.length, sha256: hash(bytes)});
            }
        }
    }
    await inventory(); result.artifacts = artifacts.sort((a, b) => a.path.localeCompare(b.path));
    result.sourceAndHarnessVerified = true; result.complete = true;
} catch (error) { result.failure = error.stack; throw error; }
finally {
    result.endedAt = new Date().toISOString();
    await writeFile(join(output, result.complete ? 'completed.json' : 'failed.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
    await saveProgress();
}
