import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startKairo} from '../../server/index.mjs';
import {DATASET_TEST_BUILD, deferred, writeDatasetFixture} from '../helpers/dataset-fixture.mjs';

async function until(predicate, message) {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) { if (await predicate()) return; await delay(10); }
    assert.fail('Timed out waiting for ' + message);
}

test('Client ID saves and bootstrap reads cannot finish or abort an in-flight dataset download or build', {timeout: 30000}, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-dataset-settings-'));
    const archiveGate = deferred(), archiveStarted = deferred(), buildGate = deferred(), buildStarted = deferred();
    const requests = [], prepared = [], external = [];
    let cancelled = false, builds = 0, app;
    const deny = async url => { external.push(String(url)); throw new Error('Unexpected external request: ' + url); };
    app = await startKairo({port: 19364, streamPort: 19365, dataDir: directory, noSync: true, fetcher: deny,
        universe: {operations: {noSync: true, fetcher: deny}, feeds: {noSync: true, fetcher: deny}},
        datasets: {
            fetcher: async url => {
                requests.push(String(url));
                if (String(url).endsWith('/latest.jsonl')) return new Response(JSON.stringify({_key: 'sde', buildNumber: DATASET_TEST_BUILD}));
                assert.match(String(url), new RegExp(`eve-online-static-data-${DATASET_TEST_BUILD}-jsonl\\.zip$`));
                return new Response(new ReadableStream({
                    start(controller) {
                        controller.enqueue(Buffer.from('archive start'));
                        archiveStarted.resolve();
                        void archiveGate.promise.then(() => { if (!cancelled) { controller.enqueue(Buffer.from(' archive finish')); controller.close(); } });
                    },
                    cancel() { cancelled = true; },
                }));
            },
            build: async input => { builds++; buildStarted.resolve(); await buildGate.promise; return writeDatasetFixture(input); },
            readAvailable: async () => Number.MAX_SAFE_INTEGER,
        },
        onDatasetsReady: selected => prepared.push(selected),
    });
    t.after(async () => { archiveGate.resolve(); buildGate.resolve(); await app.close(); await rm(directory, {recursive: true, force: true}); });
    const initial = await fetch(app.origin); await initial.arrayBuffer();
    const cookie = initial.headers.get('set-cookie').split(';')[0];
    const boot = await fetch(app.origin + '/api/bootstrap', {headers: {Cookie: cookie}}).then(response => response.json());
    const headers = {Cookie: cookie, Origin: app.origin, 'Content-Type': 'application/json', 'X-Kairo-CSRF': boot.csrf};
    async function request(path, method = 'GET', body) {
        const response = await fetch(app.origin + '/api' + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)});
        return {status: response.status, body: await response.json()};
    }
    assert.equal((await request('/datasets/install', 'POST', {})).status, 202);
    await archiveStarted.promise;
    for (const [phase, clientId] of [['downloading', 'client-download-fixture'], ['building', 'client-building-fixture']]) {
        if (phase === 'building') { archiveGate.resolve(); await buildStarted.promise; }
        const before = (await request('/datasets')).body;
        assert.equal(before.phase, phase); assert.equal(before.busy, true);
        assert.equal((await request('/settings', 'PUT', {clientId})).status, 200);
        const reloaded = (await request('/bootstrap')).body;
        assert.equal(reloaded.clientId, clientId); assert.equal(reloaded.configured, true);
        assert.equal(reloaded.datasetRevision, boot.datasetRevision, 'Saving a Client ID does not select another dataset generation');
        const after = (await request('/datasets')).body;
        assert.equal(after.phase, phase, 'The dataset remains in its actual incomplete phase after settings/bootstrap traffic');
        assert.equal(after.busy, true); assert.equal(after.restartRequired, false);
        assert.equal(cancelled, false); assert.equal(prepared.length, 0);
        assert.equal(requests.length, 2, 'Settings traffic neither duplicates nor cancels the existing metadata/download requests');
        assert.equal(builds, phase === 'building' ? 1 : 0);
        await assert.rejects(readFile(join(directory, 'datasets', 'pending.json')), {code: 'ENOENT'});
    }
    buildGate.resolve();
    await until(() => prepared.length === 1, 'the completed generation readiness callback');
    assert.equal(app.datasets.status().phase, 'ready');
    assert.equal(prepared[0].manifest.build, DATASET_TEST_BUILD);
    assert.equal(JSON.parse(await readFile(join(directory, 'datasets', 'pending.json'))).build, DATASET_TEST_BUILD);
    assert.equal(app.store.get('clientId'), 'client-building-fixture');
    assert.equal(builds, 1); assert.equal(requests.length, 2); assert.equal(cancelled, false);
    assert.deepEqual(external, []);
});
