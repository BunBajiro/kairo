import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startKairo} from '../../server/index.mjs';

async function partialSession(app, headers) {
    const received = Promise.withResolvers(), result = Promise.withResolvers();
    app.dashboard.prependOnceListener('request', incoming => incoming.once('data', received.resolve));
    const req = request(app.origin + '/api/session?character=42', {method: 'POST', headers}, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => result.resolve({status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString())}));
        response.on('error', result.reject);
    });
    req.on('error', result.reject); req.write('{"action":');
    await Promise.race([received.promise, result.promise.then(() => {throw new Error('Handler replied before the action body was complete');})]);
    return {finish: action => {req.end(JSON.stringify(action) + '}'); return result.promise;}, abort: () => req.destroy()};
}

test('Session start checks the selected connected pilot after HTTP body receipt', {timeout: 10000}, async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-session-http-'));
    const app = await startKairo({port: 19972, streamPort: 19973, dataDir: dir, noSync: true,
        fetcher: async () => {throw new Error('Offline best-effort revocation');}});
    t.after(async () => {await app.close(); await rm(dir, {recursive: true, force: true});});
    const connect = () => app.store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42, 'Pilot', '[]', '{}');
    connect();
    const cookie = (await fetch(app.origin)).headers.get('set-cookie').split(';')[0];
    const boot = await fetch(app.origin + '/api/bootstrap', {headers: {Cookie: cookie}}).then(response => response.json());
    const headers = {Cookie: cookie, Origin: app.origin, 'Content-Type': 'application/json', 'X-Kairo-CSRF': boot.csrf};
    const call = (path, method, body) => fetch(app.origin + '/api' + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)});
    await t.test('disconnect during a pending start cannot create an unreachable active Session or event', async () => {
        const pending = await partialSession(app, headers);
        try {
            assert.equal((await call('/characters/42', 'DELETE')).status, 200);
            const response = await pending.finish('start');
            t.diagnostic(JSON.stringify({status: response.status, connected: app.auth.characters().length,
                sessions: app.store.db.prepare('SELECT COUNT(*) n FROM sessions WHERE character_id=42').get().n,
                startedEvents: app.store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='session.started'").get().n}));
            assert.equal(response.status, 400);
            assert.match(response.body.error, /not connected/);
            assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM sessions WHERE character_id=42').get().n, 0);
            assert.equal(app.store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='session.started'").get().n, 0);
        } finally {pending.abort();}
    });
    await t.test('a freshly connected pilot can start/end normally and disconnected retries remain rejected', async () => {
        // Isolate the control from the pre-fix failed expectation's saved row.
        app.store.db.exec("DELETE FROM sessions; DELETE FROM events WHERE type LIKE 'session.%'");
        connect();
        const response = await call('/session?character=42', 'POST', {action: 'start', label: 'Fresh flight'});
        assert.equal(response.status, 200); const {id} = await response.json();
        assert.equal(app.store.db.prepare('SELECT label FROM sessions WHERE id=?').get(id).label, 'Fresh flight');
        assert.equal((await call('/session?character=42', 'POST', {action: 'end'})).status, 200);
        assert.ok(app.store.db.prepare('SELECT ended FROM sessions WHERE id=?').get(id).ended);
        assert.equal((await call('/characters/42', 'DELETE')).status, 200);
        assert.equal((await call('/session?character=42', 'POST', {action: 'start'})).status, 400);
        assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 1);
        assert.equal(app.store.db.prepare("SELECT COUNT(*) n FROM events WHERE type LIKE 'session.%'").get().n, 2);
    });
});
