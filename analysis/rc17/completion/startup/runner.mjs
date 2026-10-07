// Standalone external ABBA attribution. It never edits measured runtime sources.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {access, mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {loadSourceManifest, verifySource} from '../../harness/source-manifest.mjs';
import {digest, distribution} from './fixture.mjs';
const self = fileURLToPath(import.meta.url), here = dirname(self);
if (process.env.KAIRO_STARTUP_ABBA_LOCKED !== '1') {
    const code = await new Promise((done, reject) => {
        const child = spawn('flock', ['-x', '/tmp/kairo-rc16-benchmark.lock', process.execPath, self, ...process.argv.slice(2)],
            {stdio: 'inherit', env: {...process.env, KAIRO_STARTUP_ABBA_LOCKED: '1'}});
        child.on('error', reject); child.on('exit', code => done(code ?? 1));
    });
    process.exit(code);
}
const [rc16Manifest, fa6Manifest, variantManifest, outputArg, cyclesArg = '3', selected = 'all'] = process.argv.slice(2);
assert.ok(rc16Manifest && fa6Manifest && variantManifest && outputArg,
    'runner.mjs <rc16-manifest> <fa6-manifest> <two-file-variant-manifest> <output> [timing-cycles=3] [all|timing|heap|counters]');
const cycles = Number(cyclesArg);
assert.ok(Number.isSafeInteger(cycles) && cycles >= 1 && cycles <= 10);
assert.ok(['all', 'timing', 'heap', 'counters'].includes(selected));
const manifestInputs = {rc16: resolve(rc16Manifest), fa6: resolve(fa6Manifest), variant: resolve(variantManifest)};
const sources = {}, manifestBytes = {};
for (const [name, path] of Object.entries(manifestInputs)) {
    sources[name] = await loadSourceManifest(path);
    manifestBytes[name] = await readFile(path);
}
assert.equal(sources.rc16.sourceCommit, '57c8dcc7fbd8fc2b62129498d1819050c78381a1');
assert.equal(sources.fa6.sourceCommit, 'fa6e852b76089b51cd552fa202de85ad6948b0ec');
const before = new Map(sources.fa6.files.map(file => [file.path, file]));
const after = new Map(sources.variant.files.map(file => [file.path, file]));
const changed = [...new Set([...before.keys(), ...after.keys()])].filter(path => JSON.stringify(before.get(path)) !== JSON.stringify(after.get(path))).sort();
assert.deepEqual(changed, ['server/market-categories.mjs', 'server/universe-intel.mjs'], 'Ablation changes exactly the two startup index implementations');
assert.ok(sources.fa6.builtFiles.length, 'Pin existing fa6 compiled browser assets');
assert.deepEqual(sources.variant.builtFiles, sources.fa6.builtFiles, 'The two-file backend ablation must use identical fa6 browser assets');
for (const name of ['universe.json.gz', 'market-categories.json']) {
    const path = 'server/data/' + name;
    const hashes = Object.values(sources).map(source => source.files.find(file => file.path === path)?.sha256);
    assert.ok(hashes.every(hash => hash && hash === hashes[0]), 'All builds must use the identical ' + name + ' fixture');
}
const harnessPaths = ['runner.mjs', 'worker.mjs', 'fixture.mjs', '../../harness/source-manifest.mjs'];
const harnessHashes = {};
for (const path of harnessPaths) harnessHashes[path] = digest(await readFile(join(here, path)));
const destination = resolve(outputArg);
await mkdir(destination, {recursive: true});
const completePath = join(destination, 'startup-abba-completed.json'), progressPath = join(destination, 'startup-abba-progress.json');
try { await access(completePath); throw Error('Refusing to replace completed evidence: ' + completePath); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const copiedManifests = {};
for (const name of Object.keys(sources)) {
    copiedManifests[name] = join(destination, name + '-source.json');
    await writeFile(copiedManifests[name], manifestBytes[name]);
}
const results = [], semantic = new Map();
const report = {schemaVersion: 1, runId: randomUUID(), startedAt: new Date().toISOString(),
    diagnosticAblation: true, productionAcceptance: false, complete: false, selected, timingCycles: cycles,
    lock: '/tmp/kairo-rc16-benchmark.lock', order: 'fa6/variant ABBA, then RC16/variant ABBA; each lane uses fresh children; forced-GC and counters separate',
    unchangedBrowserAssets: true, variantChangedFiles: changed, harnessHashes,
    sources: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, {root: source.root, sourceCommit: source.sourceCommit,
        fingerprint: source.fingerprint, dirty: source.dirty, manifest: name + '-source.json', manifestSha256: digest(manifestBytes[name])}])), results};
async function save() {
    const path = progressPath + '.' + process.pid + '.tmp';
    await writeFile(path, JSON.stringify(report, null, 2) + '\n'); await rename(path, progressPath);
}
const jobs = [];
if (selected !== 'counters') for (const [comparison, baseline] of [['ablation', 'fa6'], ['rc16-comparison', 'rc16']]) {
    for (const lane of ['core', 'taxonomy', 'intel']) for (const mode of ['timing', 'heap']) {
        if (selected !== 'all' && selected !== mode) continue;
        for (let cycle = 0; cycle < (mode === 'timing' ? cycles : 1); cycle++) {
            for (const [position, build] of [baseline, 'variant', 'variant', baseline].entries()) jobs.push({comparison, baseline, lane, mode, cycle: cycle + 1, position: position + 1, build});
        }
    }
}
if (['all', 'counters'].includes(selected)) for (const build of ['fa6', 'variant', 'rc16']) jobs.push({comparison: 'index-counters', lane: 'indexes', mode: 'counters', cycle: 1, position: 1, build});
await save();
try {
    for (const job of jobs) {
        // Re-check outside the child and outside measured phases so any accidental
        // source mutation cannot be silently attributed to the pinned candidate.
        await verifySource(sources[job.build]);
        const name = `${job.comparison}-${job.lane}-${job.mode}-${job.cycle}-${job.position}-${job.build}.json`;
        const launchedAt = new Date().toISOString();
        const result = spawnSync(process.execPath, [...(job.mode === 'heap' ? ['--expose-gc'] : []), join(here, 'worker.mjs'), sources[job.build].root, copiedManifests[job.build], job.lane, job.mode],
            {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120000, env: process.env});
        await writeFile(join(destination, name), result.stdout || '');
        if (result.stderr) await writeFile(join(destination, name.replace('.json', '.stderr.log')), result.stderr);
        const row = {...job, result: name, launchedAt, finishedAt: new Date().toISOString(), exitCode: result.status, sha256: digest(result.stdout || ''), complete: false};
        results.push(row);
        if (result.status !== 0 || result.error) throw Error(`Failed ${name}: ${result.error || result.stderr}`);
        const parsed = JSON.parse(result.stdout);
        assert.equal(parsed.complete, true); assert.equal(parsed.endVerified, true); assert.equal(parsed.networkAttempts, 0);
        assert.equal(parsed.source.commit, sources[job.build].sourceCommit);
        assert.equal(parsed.source.fingerprint, sources[job.build].fingerprint);
        assert.equal(parsed.source.manifestSha256, digest(manifestBytes[job.build]));
        assert.equal(parsed.forcedGC, job.mode === 'heap');
        for (const [key, value] of Object.entries(parsed.semantic)) {
            if (semantic.has(key)) assert.equal(value, semantic.get(key), `${key} output changed between builds or modes`);
            semantic.set(key, value);
        }
        row.complete = true; row.semantic = parsed.semantic; row.timings = parsed.timings; row.heap = parsed.heap;
        if (job.mode === 'counters') row.counters = {taxonomy: parsed.taxonomy, intel: parsed.intel};
        await save(); process.stderr.write(name + ' complete\n');
    }
    const summary = {};
    for (const row of results.filter(row => row.mode === 'timing')) {
        const group = summary[row.comparison + '/' + row.lane + '/' + row.build] ||= {};
        for (const [metric, value] of Object.entries(row.timings)) {
            if (typeof value === 'number') (group[metric] ||= []).push(value);
            else {
                (group[metric + '.perRunP50'] ||= []).push(value.p50);
                (group[metric + '.perRunP95'] ||= []).push(value.p95);
            }
        }
    }
    report.summary = Object.fromEntries(Object.entries(summary).map(([key, metrics]) => [key, Object.fromEntries(Object.entries(metrics).map(([metric, values]) => [metric, distribution(values)]))]));
    report.semanticDigests = Object.fromEntries(semantic);
    for (const source of Object.values(sources)) await verifySource(source);
    for (const [path, expected] of Object.entries(harnessHashes)) assert.equal(digest(await readFile(join(here, path))), expected, path + ' changed during measurement');
    report.endVerified = true; report.complete = true; report.finishedAt = new Date().toISOString();
    await writeFile(completePath, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
} catch (error) { report.error = error.stack; throw error; }
finally { await save(); }
