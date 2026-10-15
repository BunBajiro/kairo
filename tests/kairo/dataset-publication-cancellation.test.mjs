import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join, basename} from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createDatasetService, prepareDatasetRuntime} from '../../server/datasets.mjs';

const base = JSON.parse(await fs.readFile(new URL('../../server/data/universe-provenance.json', import.meta.url))).build;
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; }
async function generation({outputDir, expectedBuild}) {
    await fs.mkdir(outputDir, {recursive: true});
    const payloads = {
        'universe.json.gz': gzipSync(JSON.stringify({metadata: {build: expectedBuild}})),
        'universe-provenance.json': Buffer.from(JSON.stringify({build: expectedBuild})),
        'market-categories.json': Buffer.from(JSON.stringify({build: expectedBuild, groups: [], volumes: {}})),
        'npc-market-owners.json': Buffer.from(JSON.stringify({build: expectedBuild, corporations: []})),
        'universe-details-000.bin': gzipSync('{}'),
    };
    const files = [];
    for (const [name, data] of Object.entries(payloads)) {
        await fs.writeFile(join(outputDir, name), data);
        files.push({name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex')});
    }
    return {schema: 1, build: expectedBuild, files};
}
async function fixture(t, options = {}) {
    const directory = await fs.mkdtemp(join(tmpdir(), 'kairo-dataset-publication-')), root = join(directory, 'datasets');
    const activeDirectory = join(root, `build-${base}-${randomUUID()}`);
    const manifest = await generation({outputDir: activeDirectory, expectedBuild: base});
    await fs.writeFile(join(activeDirectory, 'manifest.json'), JSON.stringify(manifest));
    const pointer = {schema: 1, directory: basename(activeDirectory), build: base};
    await fs.writeFile(join(root, 'active.json'), JSON.stringify(pointer));
    const requests = [], ready = [], services = [];
    const make = () => {
        const service = createDatasetService({dataDir: directory, automatic: false, activeDirectory,
            fetcher: async url => { requests.push(url); return url.endsWith('latest.jsonl')
                ? new Response(JSON.stringify({_key: 'sde', buildNumber: base + 1}))
                : new Response('synthetic archive'); },
            build: generation, onReady: selected => ready.push(selected), readAvailable: async () => Number.MAX_SAFE_INTEGER, ...options});
        services.push(service); return service;
    };
    const service = make(); await service.ready;
    t.after(async () => { for (const instance of services) await instance.close(); await fs.rm(directory, {recursive: true, force: true}); });
    return {directory, root, service, make, requests, ready, pointer, activeDirectory};
}

for (const [boundary, locked] of [['generation', false], ['pointer', false], ['pointer', true]]) test(`close while the ${boundary} rename is pending cannot publish a cancelled dataset${locked ? ' even when cleanup is locked' : ''}`, {timeout: 5000}, async t => {
    const remove = async (path, options) => {
        if (locked && (basename(path) === 'pending.json' || basename(path).startsWith(`build-${base + 1}-`))) throw Object.assign(new Error('Synthetic Windows file lock'), {code: 'EPERM'});
        return fs.rm(path, options);
    };
    const f = await fixture(t, {remove}), entered = deferred(), release = deferred(), original = fs.rename;
    let intercepted = false, closeFinished = false;
    fs.rename = async (from, to) => {
        const match = boundary === 'generation' ? basename(String(from)).startsWith('staging-') : String(to) === join(f.root, 'pending.json');
        if (match && !intercepted) { intercepted = true; entered.resolve(); await release.promise; }
        return original(from, to);
    };
    syncBuiltinESMExports();
    try {
        const install = f.service.install(); await entered.promise;
        const close = f.service.close().then(() => { closeFinished = true; });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(closeFinished, false, 'Shutdown must await the filesystem operation it already owns');
        release.resolve(); await Promise.all([install, close]);
    } finally { release.resolve(); fs.rename = original; syncBuiltinESMExports(); }
    assert.deepEqual(JSON.parse(await fs.readFile(join(f.root, 'active.json'))), f.pointer, 'An aborted preparation cannot change the active generation');
    assert.equal(f.requests.length, 2, 'One requested install makes one metadata request and one download');
    assert.equal(f.ready.length, 0, 'A service that is closing cannot notify a new ready generation');
    assert.equal(f.service.status().restartRequired, false);
    const entries = await fs.readdir(f.root);
    if (!locked) {
        assert.equal(entries.includes('pending.json'), false, 'The aborted install must not be selected on next startup');
        assert.deepEqual(entries.filter(name => /^(build-|staging-|download-)/.test(name)), [basename(f.activeDirectory)], 'Owned temporary and cancelled generation files are removed, preserving active files');
    } else {
        assert.equal(entries.includes('pending.json'), true, 'The test retains the actual locked pointer');
        assert.ok(f.service.status().cleanupWarning?.failures.some(row => row.path === 'pending.json'));
    }
    const selected = await prepareDatasetRuntime(f.directory, {remove});
    assert.equal(selected.directory, f.activeDirectory); assert.equal(selected.pending, false);
    const cache = JSON.parse(await fs.readFile(join(f.root, 'state.json')));
    assert.equal(cache.failedBuild ?? null, null, 'Cancellation is not an activation failure that suppresses a fresh automatic attempt');
    assert.equal(cache.activationError ?? null, null);
    const next = f.make(); await next.ready; await next.check({install: true});
    assert.equal(next.status().restartRequired, true, 'A new service can prepare the same build after cancellation');
    assert.equal(f.ready.length, 1);
    assert.equal(f.requests.length, 3, 'The replacement service reuses valid metadata and performs one new download');
});

test('uninterrupted dataset publication preserves active data and publishes one verified pending generation', async t => {
    const f = await fixture(t); await f.service.install();
    assert.equal(f.ready.length, 1); assert.equal(f.requests.length, 2);
    assert.equal(f.service.status().restartRequired, true);
    assert.deepEqual(JSON.parse(await fs.readFile(join(f.root, 'active.json'))), f.pointer);
    const selected = await prepareDatasetRuntime(f.directory);
    assert.equal(selected.pending, true); assert.equal(selected.manifest.build, base + 1);
    assert.equal(selected.directory, f.ready[0].directory);
    await f.service.close();
    assert.equal(f.ready.length, 1, 'Closing an already prepared service does not re-notify the owner');
    assert.equal((await prepareDatasetRuntime(f.directory)).directory, selected.directory, 'A preparation completed before close remains ready for activation');
});

test('cancellation before publishing a pointer leaves a previous attempt pointer byte-for-byte unchanged', {timeout: 5000}, async t => {
    const f = await fixture(t), entered = deferred(), release = deferred(), original = fs.rename;
    const priorDirectory = `build-${base + 1}-${randomUUID()}`;
    const prior = JSON.stringify({schema: 1, directory: priorDirectory, build: base + 1});
    // A previously refused attempt can leave a locked pointer until maintenance.
    await fs.writeFile(join(f.root, 'pending.json'), prior);
    await fs.writeFile(join(f.root, `activation-rejected-${priorDirectory}.json`), JSON.stringify({schema: 1, build: base + 1}));
    fs.rename = async (from, to) => {
        if (basename(String(from)).startsWith('staging-')) { entered.resolve(); await release.promise; }
        return original(from, to);
    };
    syncBuiltinESMExports();
    try {
        const install = f.service.install(); await entered.promise;
        const close = f.service.close(); release.resolve(); await Promise.all([install, close]);
    } finally { release.resolve(); fs.rename = original; syncBuiltinESMExports(); }
    assert.equal(await fs.readFile(join(f.root, 'pending.json'), 'utf8'), prior, 'This attempt never owned the previous pointer');
    assert.equal(f.ready.length, 0); assert.equal(f.requests.length, 2);
    assert.deepEqual(JSON.parse(await fs.readFile(join(f.root, 'active.json'))), f.pointer);
});
