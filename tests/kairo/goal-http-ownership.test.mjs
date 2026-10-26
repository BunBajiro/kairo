import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startKairo} from '../../server/index.mjs';

// The partial body reaches the real handler before another operation proceeds.
// This proves an overlapping accepted write without relying on wall-clock sleeps.
async function pendingProgress(app, headers, id) {
    const received = Promise.withResolvers(), result = Promise.withResolvers();
    app.dashboard.prependOnceListener('request', incoming => incoming.once('data', received.resolve));
    const req = request(app.origin + '/api/goals/' + id, {method: 'PUT', headers}, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => result.resolve({status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString())}));
        response.on('error', result.reject);
    });
    req.on('error', result.reject);
    req.write('{"progress":');
    await Promise.race([received.promise, result.promise.then(() => {throw new Error('Handler replied before progress body was complete');})]);
    return {finish: value => {req.end(JSON.stringify(value) + '}'); return result.promise;}, abort: () => req.destroy()};
}

test('manual goal writes use current identity and completion state when the HTTP body is complete', {timeout: 15000}, async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-goal-http-'));
    const app = await startKairo({port: 19970, streamPort: 19971, dataDir: dir, noSync: true,
        fetcher: async () => assert.fail('Manual goals must not request ESI data')});
    t.after(async () => {await app.close(); await rm(dir, {recursive: true, force: true});});
    const cookie = (await fetch(app.origin)).headers.get('set-cookie').split(';')[0];
    const boot = await fetch(app.origin + '/api/bootstrap', {headers: {Cookie: cookie}}).then(r => r.json());
    const headers = {Cookie: cookie, Origin: app.origin, 'Content-Type': 'application/json', 'X-Kairo-CSRF': boot.csrf};
    const call = (path, method = 'GET', body) => fetch(app.origin + '/api' + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)});
    const create = async () => {const response = await call('/goals', 'POST', {title: 'Manual objective', target: 10}); assert.equal(response.status, 201); return (await response.json()).id;};
    const events = id => app.store.db.prepare("SELECT type,payload FROM events WHERE type IN ('goal.completed','goal.updated') AND json_extract(payload,'$.goal_id')=? ORDER BY id").all(id);
    const goal = id => app.store.db.prepare('SELECT progress,done FROM goals WHERE id=?').get(id);

    await t.test('deleting a goal fences a pending progress write and its completion event', async () => {
        const id = await create(), pending = await pendingProgress(app, headers, id);
        try {
            assert.equal((await call('/goals/' + id, 'DELETE')).status, 200);
            const response = await pending.finish(10);
            assert.equal(response.status, 400, 'A removed goal cannot accept completion');
            assert.match(response.body.error, /Goal not found/);
            assert.equal(goal(id), undefined);
            assert.deepEqual(events(id), [], 'No completion can be announced for a removed goal');
        } finally {pending.abort();}
    });

    await t.test('overlapping completion writes emit exactly one completion', async () => {
        const id = await create(), first = await pendingProgress(app, headers, id), second = await pendingProgress(app, headers, id);
        try {
            assert.equal((await first.finish(10)).status, 200);
            assert.equal((await second.finish(10)).status, 200);
            assert.deepEqual({...goal(id)}, {progress: 10, done: 1});
            assert.equal(events(id).length, 1, 'The second completion must see that the first already completed');
            assert.equal(events(id)[0].type, 'goal.completed');
        } finally {first.abort(); second.abort();}
    });

    await t.test('a pending reopen publishes its actual change after another request completes', async () => {
        const id = await create(), pending = await pendingProgress(app, headers, id);
        try {
            assert.equal((await call('/goals/' + id, 'PUT', {progress: 10})).status, 200);
            assert.equal((await pending.finish(0)).status, 200);
            assert.deepEqual({...goal(id)}, {progress: 0, done: 0});
            assert.deepEqual(events(id).map(e => e.type), ['goal.completed', 'goal.updated']);
            assert.equal(JSON.parse(events(id)[1].payload).progress, 0, 'Activity and goal resources receive the reopening');
        } finally {pending.abort();}
    });

    await t.test('healthy progress, clamping, repeat completion and reopening retain their existing behavior', async () => {
        const id = await create();
        assert.equal((await call('/goals/' + id, 'PUT', {progress: 4})).status, 200);
        assert.deepEqual({...goal(id)}, {progress: 4, done: 0});
        assert.equal((await call('/goals/' + id, 'PUT', {progress: 11})).status, 200);
        assert.equal((await call('/goals/' + id, 'PUT', {progress: 10})).status, 200);
        assert.deepEqual({...goal(id)}, {progress: 10, done: 1});
        assert.equal((await call('/goals/' + id, 'PUT', {progress: -1})).status, 200);
        assert.deepEqual({...goal(id)}, {progress: 0, done: 0});
        assert.deepEqual(events(id).map(e => e.type), ['goal.updated', 'goal.completed', 'goal.updated']);
        assert.equal((await call('/goals/' + id, 'PUT', {progress: 'invalid'})).status, 400);
        assert.deepEqual({...goal(id)}, {progress: 0, done: 0});
    });
});
