import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createESI} from '../../server/esi.mjs';

const path = '/markets/10000002/orders?order_type=all&page=1';
const key = '0:GET:' + path + ':';
const good = [{order_id: 1, price: 12}];
const json = (data, headers = {}) => Response.json(data, {headers: {'Cache-Control': 'max-age=300', ETag: '"orders"', ...headers}});
const validate = result => { if (!Array.isArray(result.data) || result.data.some(row => !Number.isFinite(row.price))) throw new Error('Malformed order page.'); };
const invalid = error => error.code === 'ESI_INVALID_RESPONSE';
async function fixture(t, fetcher, auth = {}) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-esi-validation-')), store = openStore(dir), calls = [];
    const esi = createESI(store, auth, {fetcher: async (url, options) => { calls.push({url, headers: {...options.headers}}); return fetcher(url, options); }});
    t.after(async () => { await esi.close(); store.close(); await rm(dir, {recursive: true, force: true}); });
    return {esi, store, calls};
}

test('validated malformed fresh reads reject before cache admission and recover through ordinary paced transport', async t => {
    let attempt = 0, clock = Date.now(); const waits = [];
    const f = await fixture(t, () => json(++attempt === 1 ? {unexpected: true} : good));
    const read = f.esi.paced({spacingMs: 250, now: () => clock, wait: async ms => { waits.push(ms); clock += ms; }});
    await assert.rejects(read(path, {validate}), invalid);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM cache').get().n, 0);
    assert.deepEqual((await read(path, {validate})).data, good);
    assert.deepEqual(waits, [250]);
    assert.equal(f.calls[1].headers['If-None-Match'], undefined);
    await read(path, {validate});
    assert.equal(f.calls.length, 2, 'Healthy warm data adds no request or pacing wait');
});

test('malformed warm and expired cached bodies are evicted before they can be reused or revalidated with 304', async t => {
    for (const expired of [false, true]) await t.test(expired ? 'expired' : 'warm', async t => {
        let attempt = 0;
        const f = await fixture(t, (_url, options) => ++attempt === 1 ? json({unexpected: true}) : options.headers['If-None-Match'] ? new Response(null, {status: 304}) : json(good));
        await f.esi.request(path);
        if (expired) f.store.db.prepare('UPDATE cache SET expires=0 WHERE key=?').run(key);
        await assert.rejects(f.esi.request(path, {validate}), invalid);
        assert.equal(f.calls.length, 1, 'An invalid cached representation never reaches conditional transport');
        assert.equal(f.store.db.prepare('SELECT * FROM cache WHERE key=?').get(key), undefined);
        assert.deepEqual((await f.esi.request(path, {validate})).data, good);
        assert.equal(f.calls[1].headers['If-None-Match'], undefined);
    });
});

test('a validated consumer independently rejects an unvalidated shared response without failing its other consumer', async t => {
    const gate = Promise.withResolvers(), arrived = Promise.withResolvers(); let attempt = 0;
    const f = await fixture(t, async () => { if (++attempt === 1) { arrived.resolve(); await gate.promise; return json({unexpected: true}); } return json(good); });
    const raw = f.esi.request(path); await arrived.promise;
    const checked = assert.rejects(f.esi.request(path, {validate}), invalid);
    gate.resolve(); assert.deepEqual((await raw).data, {unexpected: true}); await checked;
    assert.equal(f.calls.length, 1); assert.equal(f.esi.health().coalesced, 1);
    assert.equal(f.store.db.prepare('SELECT * FROM cache WHERE key=?').get(key), undefined);
    assert.deepEqual((await f.esi.request(path, {validate})).data, good);
});

test('rejecting an observed cache row never deletes a newer replacement', async t => {
    const f = await fixture(t, () => json({unexpected: true})); await f.esi.request(path);
    await assert.rejects(f.esi.request(path, {validate() {
        // Simulate another owner publishing after this reader captured the row.
        f.store.db.prepare('UPDATE cache SET body=?,updated=updated+1 WHERE key=?').run(JSON.stringify(good), key);
        throw new Error('Rejected the earlier representation.');
    }}), invalid);
    assert.deepEqual(JSON.parse(f.store.db.prepare('SELECT body FROM cache WHERE key=?').get(key).body), good);
    assert.deepEqual((await f.esi.request(path, {validate})).data, good); assert.equal(f.calls.length, 1);
});

test('invalid network replacement preserves a good previous observation and can safely revalidate it', async t => {
    let attempt = 0;
    const f = await fixture(t, () => ++attempt === 1 ? json(good) : attempt === 2 ? json({unexpected: true}, {ETag: '"bad"'}) : new Response(null, {status: 304}));
    const first = await f.esi.request(path, {validate});
    f.store.db.prepare('UPDATE cache SET expires=0 WHERE key=?').run(key);
    const before = {...f.store.db.prepare('SELECT * FROM cache WHERE key=?').get(key)};
    await assert.rejects(f.esi.request(path, {validate}), invalid);
    assert.deepEqual({...f.store.db.prepare('SELECT * FROM cache WHERE key=?').get(key)}, before);
    assert.deepEqual((await f.esi.request(path, {validate})).data, first.data);
    assert.equal(f.calls[2].headers['If-None-Match'], '"orders"');
});

test('invalid JSON is a rejected representation without synthetic retry cooldown', async t => {
    let attempt = 0;
    const f = await fixture(t, () => ++attempt === 1 ? new Response('{', {headers: {'Cache-Control': 'max-age=300'}}) : json(good));
    await assert.rejects(f.esi.request(path, {validate}), invalid);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM cache').get().n, 0);
    assert.deepEqual((await f.esi.request(path, {validate})).data, good); assert.equal(f.calls.length, 2);
});

test('malformed responses preserve explicit Retry-After and shared low-budget cooldowns', async t => {
    for (const headers of [{'Retry-After': '90'}, {'X-Ratelimit-Group': 'markets', 'X-Ratelimit-Remaining': '9', 'Retry-After': '90'}]) await t.test(JSON.stringify(headers), async t => {
        let clock = Date.UTC(2026, 9, 21), attempt = 0; t.mock.method(Date, 'now', () => clock);
        const f = await fixture(t, () => ++attempt === 1 ? json({unexpected: true}, headers) : json(good));
        await assert.rejects(f.esi.request(path, {validate}), error => invalid(error) && Date.parse(error.retryAt) === clock + 90000);
        await assert.rejects(f.esi.request(path, {validate}), error => Date.parse(error.retryAt) === clock + 90000);
        assert.equal(f.calls.length, 1);
        clock += 90001;
        assert.deepEqual((await f.esi.request(path, {validate})).data, good); assert.equal(f.calls.length, 2);
    });
});

test('a cancelled retry cannot send or poison another eligible validated caller', async t => {
    let attempt = 0, clock = Date.now(), cancelled = false;
    const f = await fixture(t, () => json(++attempt === 1 ? {unexpected: true} : good));
    const read = f.esi.paced({spacingMs: 250, now: () => clock, wait: async ms => { clock += ms; cancelled = true; }});
    await assert.rejects(read(path, {validate}), invalid);
    await assert.rejects(read(path, {validate}, () => { if (cancelled) throw new Error('Cancelled'); }), /Cancelled/);
    assert.equal(f.calls.length, 1);
    assert.deepEqual((await f.esi.request(path, {validate})).data, good);
});

test('a late private validated consumer cannot invalidate a replacement connection cache', async t => {
    const gate = Promise.withResolvers(), arrived = Promise.withResolvers(); let revision = 0, validations = 0;
    const f = await fixture(t, async (_url, options) => { if (options.headers.Authorization === 'Bearer old') { arrived.resolve(); await gate.promise; return json({unexpected: true}); } return json(good); }, {connectionRevision: () => revision, access: async () => revision ? 'new' : 'old'});
    const privatePath = '/markets/structures/1000000000001?page=1';
    const old = f.esi.request(privatePath, {characterId: 42, validate(result) { validations++; validate(result); }}).catch(error => error); await arrived.promise;
    revision++;
    assert.deepEqual((await f.esi.request(privatePath, {characterId: 42, validate})).data, good);
    gate.resolve(); assert.match((await old).message, /connection changed/); assert.equal(validations, 0);
    assert.deepEqual((await f.esi.request(privatePath, {characterId: 42, validate})).data, good); assert.equal(f.calls.length, 2);
});

test('a validated join classifies malformed JSON from an unvalidated flight without synthetic backoff', async t => {
    const gate = Promise.withResolvers(), arrived = Promise.withResolvers(); let attempt = 0;
    const f = await fixture(t, async () => { if (++attempt === 1) { arrived.resolve(); await gate.promise; return new Response('{'); } return json(good); });
    const raw = f.esi.request(path).catch(error => error); await arrived.promise;
    const checked = assert.rejects(f.esi.request(path, {validate}), invalid);
    gate.resolve(); assert.equal((await raw).code, 'ESI_INVALID_RESPONSE'); await checked;
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM cache').get().n, 0);
    assert.deepEqual((await f.esi.request(path, {validate})).data, good); assert.equal(f.calls.length, 2);
});

test('rejected warm and coalesced unvalidated responses preserve their provider Retry-After', async t => {
    for (const shared of [false, true]) await t.test(shared ? 'coalesced' : 'warm', async t => {
        let clock = Date.UTC(2026, 9, 21), attempt = 0; t.mock.method(Date, 'now', () => clock);
        const gate = Promise.withResolvers(), arrived = Promise.withResolvers();
        const fetcher = async () => { if (++attempt === 1) { arrived.resolve(); if (shared) await gate.promise; return json({unexpected: true}, {'Retry-After': '90'}); } return json(good); };
        const f = await fixture(t, fetcher); let reader = f.esi;
        const raw = f.esi.request(path); await arrived.promise;
        if (!shared) {
            await raw; await f.esi.close();
            reader = createESI(f.store, {}, {fetcher}); t.after(() => reader.close());
        }
        const checked = assert.rejects(reader.request(path, {validate}), error => invalid(error) && Date.parse(error.retryAt) === clock + 90000 && error.serverRetryAfter);
        gate.resolve(); assert.deepEqual((await raw).data, {unexpected: true}); await checked;
        await assert.rejects(reader.request(path, {validate}), error => invalid(error) && Date.parse(error.retryAt) === clock + 90000 && error.serverRetryAfter);
        assert.equal(attempt, 1);
        clock += 90001;
        assert.deepEqual((await reader.request(path, {validate})).data, good); assert.equal(attempt, 2);
    });
});

test('unexpected 304 without a reusable representation rejects and recovers with a full read', async t => {
    let attempt = 0;
    const f = await fixture(t, () => ++attempt === 1 ? new Response(null, {status: 304}) : json(good));
    await assert.rejects(f.esi.request(path, {validate}), invalid);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM cache').get().n, 0);
    assert.deepEqual((await f.esi.request(path, {validate})).data, good);
    assert.equal(f.calls[1].headers['If-None-Match'], undefined);
});

test('validated fetch and body transport failures retain ordinary backoff without classifying auth errors as retryable', async t => {
    for (const source of ['fetch', 'body', 'timeout', 'body-timeout']) await t.test(source, async t => {
        let clock = Date.UTC(2026, 9, 21), attempt = 0; t.mock.method(Date, 'now', () => clock);
        const f = await fixture(t, () => {
            if (++attempt > 1) return json(good);
            if (source === 'fetch') throw new TypeError('Network disconnected');
            if (source === 'timeout') throw new DOMException('The operation timed out', 'TimeoutError');
            return {ok: true, status: 200, headers: new Headers(), json: async () => {
                if (source === 'body-timeout') throw new DOMException('The operation timed out', 'TimeoutError');
                throw new TypeError('Body stream disconnected');
            }};
        });
        await assert.rejects(f.esi.request(path, {validate}), error => error.code === 'ESI_READ_FAILED' && Date.parse(error.retryAt) === clock + 30000);
        await assert.rejects(f.esi.request(path, {validate}), error => error.code === 'ESI_READ_FAILED');
        assert.equal(f.calls.length, 1); clock += 30001;
        assert.deepEqual((await f.esi.request(path, {validate})).data, good);
    });
    const failure = new Error('Reconnect character');
    const f = await fixture(t, () => json(good), {access: async () => { throw failure; }});
    await assert.rejects(f.esi.request(path, {characterId: 42, validate}), error => error === failure && error.code === undefined);
    assert.equal(f.calls.length, 0);
});
