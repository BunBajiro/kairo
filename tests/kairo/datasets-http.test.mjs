import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {startKairo} from '../../server/index.mjs';
import {DATASET_TEST_BUILD, DATASET_TEST_RELEASE, DATASET_TEST_NOW, deferred, writeDatasetFixture} from '../helpers/dataset-fixture.mjs';

async function until(condition, message = 'condition', timeout = 8000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await condition()) return; await delay(15); }
    throw new Error('Timed out waiting for ' + message);
}
async function stream(origin, cookie) {
    const controller = new AbortController(), events = [];
    const response = await fetch(origin + '/api/events', {headers: {Cookie: cookie}, signal: controller.signal});
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const reading = (async () => {
        const decoder = new TextDecoder(); let text = '';
        try { while (true) {
            const {done, value} = await reader.read(); if (done) break;
            text += decoder.decode(value, {stream: true});
            let boundary;
            while ((boundary = text.indexOf('\n\n')) >= 0) {
                const item = text.slice(0, boundary); text = text.slice(boundary + 2);
                const name = item.match(/^event: (.+)$/m)?.[1], data = item.match(/^data: (.+)$/m)?.[1];
                if (name && data) events.push({name, data: JSON.parse(data)});
            }
        } } catch (error) { if (!controller.signal.aborted) throw error; }
    })();
    return {events, async close() { controller.abort(); await reading; }};
}
async function paths(directory, prefix = '') {
    const result = [];
    for (const entry of await readdir(directory, {withFileTypes: true})) {
        const path = join(prefix, entry.name);
        result.push(path);
        if (entry.isDirectory()) result.push(...await paths(join(directory, entry.name), path));
    }
    return result;
}

test('Dataset HTTP workflow preserves the local session through safe staged updates', {timeout: 60000}, async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-dataset-http-'));
    let clock = DATASET_TEST_NOW, mode = 'fresh', app, source, prepared, buildCalls = 0;
    const metadataGate = deferred(), buildGate = deferred(), calls = [];
    let gateMetadata = true;
    const fetcher = async (url, options = {}) => {
        calls.push({url: String(url), headers: new Headers(options.headers)});
        if (String(url).endsWith('/latest.jsonl')) {
            if (gateMetadata) await metadataGate.promise;
            if (mode === 'offline') throw new Error('Synthetic CCP outage');
            if (mode === 'cached') return new Response(null, {status: 304, headers: {'Cache-Control': 'max-age=300', ETag: '"fixture-sde"'}});
            return new Response(JSON.stringify({_key: 'sde', buildNumber: DATASET_TEST_BUILD, releaseDate: DATASET_TEST_RELEASE}) + '\n', {headers: {'Cache-Control': 'max-age=300', ETag: '"fixture-sde"', 'Last-Modified': 'Mon, 28 Sep 2026 11:12:00 GMT'}});
        }
        assert.ok(String(url).endsWith(`eve-online-static-data-${DATASET_TEST_BUILD}-jsonl.zip`));
        return new Response('synthetic archive handled only by the injected test builder');
    };
    const build = async (input, callbacks = input) => {
        const {onProgress} = callbacks;
        buildCalls++;
        onProgress?.({message: 'Validating test generation', percent: 45});
        await buildGate.promise;
        return writeDatasetFixture(input);
    };
    const options = {port: 19250, streamPort: 19251, dataDir: dir, noSync: true, datasets: {fetcher, build, now: () => clock}, onDatasetsReady: ready => { prepared = ready; }};
    app = await startKairo(options);
    t.after(async () => { metadataGate.resolve(); buildGate.resolve(); await source?.close(); await app?.close(); await rm(dir, {recursive: true, force: true}); });
    const page = await fetch(app.origin); await page.arrayBuffer();
    const cookie = page.headers.get('set-cookie').split(';')[0];
    const boot = await fetch(app.origin + '/api/bootstrap', {headers: {Cookie: cookie}}).then(r => r.json());
    const headers = {Cookie: cookie, Origin: app.origin, 'Content-Type': 'application/json', 'X-Kairo-CSRF': boot.csrf};
    async function request(path, method = 'GET', body, customHeaders = headers) {
        const response = await fetch(app.origin + '/api' + path, {method, headers: customHeaders, body: body === undefined ? undefined : JSON.stringify(body)});
        const text = await response.text();
        return {status: response.status, data: text ? JSON.parse(text) : null};
    }

    await t.test('inventory is authenticated, manual writes require CSRF, and noSync makes no external request', async () => {
        assert.equal((await request('/datasets', 'GET', undefined, {})).status, 401);
        for (const path of ['/datasets/check', '/datasets/install']) assert.equal((await request(path, 'POST', {}, {Cookie: cookie, 'Content-Type': 'application/json'})).status, 403);
        const inventory = await request('/datasets');
        assert.equal(inventory.status, 200); assert.equal(inventory.data.managedRestart, true);
        assert.ok(inventory.data.datasets.length >= 5);
        assert.equal(inventory.data.datasets.filter(row => row.automatic).length, 3);
        assert.ok(inventory.data.datasets.every(row => row.name && row.provider && row.version));
        const isolated = await fetch(app.streamOrigin + '/api/datasets'); await isolated.arrayBuffer();
        assert.equal(isolated.status, 404);
        assert.deepEqual(calls, [], 'Test/offline starts do not contact CCP');
    });

    await t.test('concurrent manual checks return immediately and share one cache-aware request', async () => {
        source = await stream(app.origin, cookie);
        await until(() => source.events.some(event => event.name === 'dataset-revision'), 'initial revision');
        assert.equal(source.events.find(event => event.name === 'dataset-revision').data.revision, boot.datasetRevision);
        const results = await Promise.all(Array.from({length: 4}, () => request('/datasets/check', 'POST', {})));
        assert.ok(results.every(result => result.status === 202));
        assert.equal(calls.length, 1); assert.equal(buildCalls, 0);
        gateMetadata = false; metadataGate.resolve();
        await until(() => !app.datasets.status().busy, 'metadata completion');
        assert.equal(app.datasets.status().available.build, DATASET_TEST_BUILD);
        await request('/datasets/check', 'POST', {}); await until(() => !app.datasets.status().busy);
        assert.equal(calls.length, 1, 'A manual click still respects the server cache deadline');
        mode = 'cached'; clock += 61 * 60000;
        await request('/datasets/check', 'POST', {}); await until(() => !app.datasets.status().busy);
        assert.equal(calls.length, 2);
        assert.equal(calls[1].headers.get('if-none-match'), '"fixture-sde"');
        assert.equal(app.datasets.status().available.build, DATASET_TEST_BUILD, '304 preserves the known newer build');
    });

    await t.test('failed metadata checks retain installed datasets and can recover', async () => {
        const before = app.datasets.status().datasets;
        mode = 'offline'; clock += 61 * 60000;
        await request('/datasets/check', 'POST', {}); await until(() => !app.datasets.status().busy);
        assert.equal(app.datasets.status().phase, 'error');
        assert.deepEqual(app.datasets.status().datasets, before);
        mode = 'fresh'; clock += 61 * 60000;
        await request('/datasets/check', 'POST', {}); await until(() => !app.datasets.status().busy);
        assert.equal(app.datasets.status().available.build, DATASET_TEST_BUILD);
    });

    await t.test('installation is single-flight, reports phases over SSE, and stages a coherent generation', async () => {
        const started = await Promise.all([request('/datasets/install', 'POST', {}), request('/datasets/install', 'POST', {})]);
        assert.ok(started.every(result => result.status === 202));
        await until(() => buildCalls === 1, 'builder');
        assert.equal(app.datasets.status().phase, 'building');
        assert.equal(prepared, undefined, 'Readers stay on their current generation while the worker builds');
        buildGate.resolve();
        await until(() => prepared, 'managed restart callback', 15000);
        assert.equal(prepared.manifest.build, DATASET_TEST_BUILD);
        assert.ok(prepared.directory);
        await until(() => source.events.some(event => event.name === 'dataset-restarting'), 'restart announcement');
        const phases = source.events.filter(event => event.name === 'datasets').map(event => event.data.phase);
        for (const phase of ['checking', 'downloading', 'building', 'ready']) assert.ok(phases.includes(phase), 'SSE includes ' + phase);
        const restart = source.events.find(event => event.name === 'dataset-restarting').data;
        assert.equal(restart.build, DATASET_TEST_BUILD); assert.ok(Date.parse(restart.startedAt));
        assert.equal(buildCalls, 1);
    });

    await t.test('manual staging removes downloaded archives and temporary build debris', async () => {
        const files = await paths(dir);
        assert.ok(!files.some(path => /\.(zip|part|partial)$/i.test(path)), 'No downloaded archive remains after preparation: ' + files.join(', '));
        assert.ok(files.some(path => path.endsWith('universe.json.gz')));
    });

    await t.test('cancelled activation clears the restart gate and new SSE clients receive the current revision', async () => {
        app.cancelDatasetRestart('Synthetic activation postponed');
        await until(() => source.events.some(event => event.name === 'dataset-restart-cancelled'), 'restart cancellation');
        await source.close(); source = await stream(app.origin, cookie);
        await until(() => source.events.some(event => event.name === 'dataset-revision'), 'reconnected SSE');
        assert.equal(source.events.find(event => event.name === 'dataset-revision').data.revision, boot.datasetRevision);
        assert.equal((await request('/settings', 'PUT', {theme: 'ice'})).status, 200);
    });

    await t.test('graceful replacement preserves the cookie, CSRF token and persisted workspace settings', async () => {
        await source.close(); source = null;
        const sessions = app.exportSessions();
        await app.close(); app = null;
        app = await startKairo({...options, initialSessions: sessions});
        const resumed = await request('/bootstrap');
        assert.equal(resumed.status, 200); assert.equal(resumed.data.csrf, boot.csrf);
        assert.equal(resumed.data.settings.theme, 'ice');
        assert.equal((await request('/settings', 'PUT', {theme: 'mint'})).status, 200);
        source = await stream(app.origin, cookie);
        await until(() => source.events.some(event => event.name === 'dataset-revision'), 'replacement SSE');
    });
});
