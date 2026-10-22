import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {startKairo} from '../../server/index.mjs';
import {sessionReport} from '../../server/history.mjs';
import {sessionReplay} from '../../server/session-replay.mjs';
import {recordSessionObservation} from '../../server/session-travel.mjs';
import {rememberSystem, savePlaceNote} from '../../server/places.mjs';

const at = second => new Date(Date.UTC(2026, 9, 22) + second * 1000).toISOString();
const A = 30000142, B = 30000144, C = 30000145;

test('retired Journey HTTP calls have no work; private Places and modern export remain available', {timeout: 15000}, async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-journey-retirement-')), calls = [];
    const deny = async url => {calls.push(String(url)); throw new Error('Unexpected provider request');};
    const app = await startKairo({port: 19982, streamPort: 19983, dataDir: dir, noSync: true, fetcher: deny,
        datasets: {fetcher: deny}, universe: {operations: {noSync: true, fetcher: deny}, feeds: {noSync: true, fetcher: deny}}});
    t.after(async () => {await app.close(); await rm(dir, {recursive: true, force: true});});
    app.store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42, 'Synthetic pilot', '[]', 'unused');
    app.store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)')
        .run('owned', 42, 'Owned flight', at(0), at(20), JSON.stringify({capturedAt: at(0), system: {id: A, name: 'Jita'}}), '{}');
    // Both legacy contamination and valid owned evidence make the removed routes
    // meaningful on the before build; the production owner never writes null IDs.
    const put = app.store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)');
    put.run(42, A, 'Unowned A', at(-2), null);
    const oldId = Number(put.run(42, B, 'Unowned B', at(-1), null).lastInsertRowid);
    const ownedId = Number(put.run(42, B, 'Perimeter', at(10), 'owned').lastInsertRowid);
    const cookie = (await fetch(app.origin)).headers.get('set-cookie').split(';')[0];
    const boot = await fetch(app.origin + '/api/bootstrap', {headers: {Cookie: cookie}}).then(r => r.json());
    const headers = {Cookie: cookie, Origin: app.origin, 'Content-Type': 'application/json', 'X-Kairo-CSRF': boot.csrf};
    const call = (path, method = 'GET', body) => fetch(app.origin + '/api' + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)});
    for (const [path, method, body] of [['/journey?character=42', 'GET'], ['/journey/connections/' + oldId + '?character=42', 'PUT', {hidden: true}], ['/journey/enrich?character=42', 'POST', {}]]) {
        await t.test(method + ' ' + path, async () => {
            const before = app.store.db.prepare('SELECT total_changes() n').get().n, requests = calls.length;
            const response = await call(path, method, body);
            const observed = {status: response.status, writes: app.store.db.prepare('SELECT total_changes() n').get().n - before, providers: calls.length - requests};
            t.diagnostic(JSON.stringify({path, ...observed}));
            assert.deepEqual(observed, {status: 404, writes: 0, providers: 0});
        });
    }
    await t.test('fresh schema and export exclude Journey-only storage', async () => {
        const exported = await call('/export').then(r => r.json());
        assert.equal(Object.hasOwn(exported, 'hiddenJourneyLinks'), false);
        assert.equal(app.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='journey_hidden_links'").get(), undefined);
        assert.ok(exported.visits.some(row => row.id === ownedId && row.session_id === 'owned'));
        assert.ok(exported.sessions.some(row => row.id === 'owned'));
    });
    await t.test('private notes, metadata and modern Session routes need no Journey service', async () => {
        const before = calls.length;
        rememberSystem(app.store, {system_id: A, name: 'Jita', constellation_id: 20000020, security_status: .9, position: {x: 1, y: 2, z: 3}}, {name: 'Kimotoro', region_id: 10000002}, {name: 'The Forge'});
        const privateText = 'Private approach note';
        assert.equal((await call('/places/system/' + A, 'PUT', {name: 'Jita', body: privateText, tags: ['home'], status: 'home'})).status, 200);
        assert.equal((await call('/places/system/' + A).then(r => r.json())).body, privateText);
        assert.ok((await call('/export').then(r => r.json())).places.some(row => row.body === privateText));
        const report = await call('/sessions/owned?character=42').then(r => r.json());
        assert.deepEqual(report.route.map(row => row.systemId), [A, B]);
        assert.equal(JSON.stringify(await fetch(app.streamOrigin + '/state').then(r => r.json())).includes(privateText), false);
        assert.equal((await fetch(app.streamOrigin + '/api/places/system/' + A)).status, 404);
        assert.equal(calls.length - before, 0);
    });
});

test('Session movement/report/replay own their evidence without lifetime Journey fallback', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-retired-travel-')), store = openStore(dir);
    t.after(async () => {store.close(); await rm(dir, {recursive: true, force: true});});
    store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)')
        .run('owned', 42, 'Owned flight', at(0), null, '{}', '{}');
    const put = store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)');
    put.run(42, A, 'Unowned prior', at(-1), null);
    put.run(42, B, 'Unowned current', at(1), null);
    put.run(42, C, 'Foreign session', at(2), 'other');
    const result = recordSessionObservation(store, {characterId: 42, systemId: B, name: 'Perimeter', at: at(3)});
    assert.equal(result?.sessionId, 'owned', 'Unowned history cannot suppress the first accepted owned sample');
    store.db.prepare('UPDATE sessions SET ended=? WHERE id=?').run(at(10), 'owned');
    for (const [name, read] of [['report', () => sessionReport(store, 'owned', 42)], ['replay', () => sessionReplay(store, 'owned', 42)]]) {
        let windows = 0; const prepare = store.db.prepare.bind(store.db);
        store.db.prepare = sql => {if (/FROM visits v LEFT JOIN universe_systems/s.test(sql)) windows++; return prepare(sql);};
        let data; try {data = read();} finally {store.db.prepare = prepare;}
        const rows = name === 'report' ? data.route : data.visits;
        t.diagnostic(JSON.stringify({projection: name, visitWindows: windows, systems: rows.map(row => row.systemId)}));
        assert.deepEqual(rows.map(row => row.systemId), [B]);
        assert.equal(rows[0].entered, at(3)); assert.equal(rows[0].inferred, false);
        assert.equal(windows, 1);
    }
    assert.equal(recordSessionObservation(store, {characterId: 42, systemId: C, at: at(11)}), null);
    savePlaceNote(store, 'system', B, {body: 'Retained independent note'});
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM visits WHERE session_id=?').get('owned').n, 1);
});
