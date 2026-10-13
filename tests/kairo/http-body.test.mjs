import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startKairo} from '../../server/index.mjs';

// Wait for each piece to reach the real server before sending the next one.
// A client-side write callback alone does not establish a decoder boundary.
async function postChunks(app, headers, chunks) {
    const received = [], result = Promise.withResolvers();
    let sent = 0, seen = 0, acknowledge;
    app.dashboard.prependOnceListener('request', incoming => incoming.on('data', chunk => {
        received.push(Buffer.from(chunk)); seen += chunk.length;
        if (seen === sent) acknowledge?.();
    }));
    const req = request(app.origin + '/api/notes', {method: 'POST', headers}, res => {
        const response = [];
        res.on('data', chunk => response.push(chunk));
        res.on('end', () => result.resolve({status: res.statusCode, body: JSON.parse(Buffer.concat(response).toString())}));
        res.on('error', result.reject);
    });
    req.on('error', result.reject);
    for (const chunk of chunks) {
        const receipt = Promise.withResolvers(); acknowledge = receipt.resolve;
        sent += chunk.length; req.write(chunk);
        await Promise.race([receipt.promise, result.promise.then(() => { throw new Error('Response preceded complete request'); })]);
    }
    req.end();
    return {...await result.promise, received};
}

test('HTTP JSON body decoding preserves split UTF-8 and existing request guards', {timeout: 10000}, async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-http-body-'));
    const app = await startKairo({port: 19942, streamPort: 19943, dataDir: dir, noSync: true,
        fetcher: async () => assert.fail('Body parsing must not request external data.')});
    t.after(async () => { await app.close(); await rm(dir, {recursive: true, force: true}); });
    const cookie = (await fetch(app.origin)).headers.get('set-cookie').split(';')[0];
    const boot = await fetch(app.origin + '/api/bootstrap', {headers: {Cookie: cookie}}).then(res => res.json());
    const headers = {Cookie: cookie, Origin: app.origin, 'Content-Type': 'application/json', 'X-Kairo-CSRF': boot.csrf};
    const post = (body, override = {}) => fetch(app.origin + '/api/notes', {method: 'POST', headers: {...headers, ...override}, body});

    await t.test('two-, three- and four-byte characters survive every internal byte boundary', async () => {
        const content = 'Réserve 猫 🚀', bytes = Buffer.from(JSON.stringify({body: content}));
        const cuts = [0];
        for (const character of ['é', '猫', '🚀']) {
            const encoded = Buffer.from(character), start = bytes.indexOf(encoded);
            for (let i = 1; i < encoded.length; i++) cuts.push(start + i);
        }
        cuts.push(bytes.length);
        const chunks = cuts.slice(1).map((end, i) => bytes.subarray(cuts[i], end));
        const response = await postChunks(app, headers, chunks);
        assert.equal(response.status, 201);
        assert.deepEqual(response.received, chunks, 'The server actually received the intended split UTF-8 buffers');
        const notes = await fetch(app.origin + '/api/notes', {headers}).then(res => res.json());
        assert.equal(notes.find(note => note.id === response.body.id)?.body, content, 'Saved and returned note text must retain the exact Unicode');
        assert.equal(app.store.db.prepare('SELECT body FROM notes WHERE id=?').get(response.body.id).body, content);
    });

    await t.test('the byte limit remains inclusive and counts multibyte input bytes', async () => {
        const payload = length => {
            const spare = length - Buffer.byteLength(JSON.stringify({body: 'Byte cap', padding: ''}));
            const value = JSON.stringify({body: 'Byte cap', padding: 'é'.repeat(Math.floor(spare / 2)) + 'x'.repeat(spare % 2)});
            assert.equal(Buffer.byteLength(value), length);
            return value;
        };
        assert.equal((await post(payload(150000))).status, 201);
        const before = app.store.db.prepare('SELECT COUNT(*) n FROM notes').get().n;
        const tooLarge = await post(payload(150001));
        assert.equal(tooLarge.status, 400); assert.match((await tooLarge.json()).error, /Request is too large/);
        assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM notes').get().n, before);
    });

    await t.test('invalid JSON, non-JSON and missing CSRF never persist a note', async () => {
        const before = app.store.db.prepare('SELECT COUNT(*) n FROM notes').get().n;
        assert.equal((await post('{"body":"unfinished"')).status, 400);
        const wrongType = await post('{"body":"plain"}', {'Content-Type': 'text/plain'});
        assert.equal(wrongType.status, 400); assert.match((await wrongType.json()).error, /JSON is required/);
        assert.equal((await post('{"body":"unauthorized"}', {'X-Kairo-CSRF': ''})).status, 403);
        assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM notes').get().n, before);
    });
});
