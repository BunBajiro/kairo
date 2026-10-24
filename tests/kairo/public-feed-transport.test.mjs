import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setImmediate as turn } from 'node:timers/promises';
import { createPublicFeedTransport } from '../../server/public-feed-transport.mjs';
import { createSessionLiveFeed } from '../../server/session-live.mjs';
import { createUniverseFeeds } from '../../server/universe-feeds.mjs';
import { createCore } from '../../server/core.mjs';
import { openStore } from '../../server/store.mjs';

const base = 'https://r2z2.zkillboard.com/ephemeral/', pointer = base + 'sequence.json';
const url = id => base + id + '.json', MiB = 1024 * 1024;
const headers = { Accept: 'application/json' }, init = { headers, redirect: 'error' };
const defer = () => Promise.withResolvers();
const atlas = { metadata: {}, regions: [], constellations: [], systems: [
    { system_id: 30000001, name: 'Alpha', security: -.2, space: 'known', x: 0, y: 0, z: 0 },
], gates: [] };
const packet = (sequence, now) => ({ sequence_id: sequence, killmail_id: sequence, hash: 'a'.repeat(40),
    esi: { killmail_id: sequence, killmail_time: new Date(now - 1000).toISOString(), solar_system_id: 30000001,
        victim: { character_id: 99, ship_type_id: 587, alliance_id: 88 }, attackers: [{ character_id: 42, alliance_id: 77 }] },
    zkb: { hash: 'a'.repeat(40), totalValue: sequence * 1000 } });
// Disable courtesy spacing for sharing/body-limit cases, then override it in
// dedicated pacing cases. Request-count/buffer bounds are not elapsed benchmarks.
// Returned Responses remain real one-shot bodies even though transport is injected.
function transport(t, options = {}) {
    const value = createPublicFeedTransport({ spacingMs: 0, ...options });
    t.after(() => value.close()); return value;
}
function memory() {
    const data = new Map();
    return { get: (key, fallback) => data.has(key) ? structuredClone(data.get(key)) : fallback,
        set: (key, value) => data.set(key, structuredClone(value)), snapshot: () => null };
}

test('overlapping requests share decoded bytes and receive independent Responses with original headers', async t => {
    const owner = transport(t), gate = defer(); let calls = 0;
    const fetcher = async () => { calls++; await gate.promise; return new Response('{"decoded":true}', {
        status: 200, statusText: 'Custom OK', headers: { 'Content-Encoding': 'gzip', 'Content-Length': '50', ETag: 'version-a' },
    }); };
    const one = owner.wrap(fetcher), two = owner.wrap(fetcher, { maximum: 2 * MiB, checkContentLength: true });
    const a = one(url(100), { ...init, headers: { ...headers, 'User-Agent': 'Session', 'Accept-Encoding': 'gzip' } });
    const b = two(url(100), { ...init, headers: { ...headers, 'User-Agent': 'Universe' } });
    await turn(); assert.equal(calls, 1); gate.resolve();
    const [first, second] = await Promise.all([a, b]);
    assert.notStrictEqual(first, second); assert.equal(first.statusText, 'Custom OK');
    assert.equal(second.headers.get('content-encoding'), 'gzip'); assert.equal(second.headers.get('content-length'), '50');
    first.headers.set('etag', 'caller edit'); assert.equal(second.headers.get('etag'), 'version-a');
    assert.deepEqual(await first.json(), { decoded: true });
    assert.deepEqual(await second.json(), { decoded: true }, 'Constructed Response does not decompress fetch-decoded bytes again');
    assert.deepEqual(await (await one(url(100), init)).json(), { decoded: true }); assert.equal(calls, 1);
});

test('one consumer timeout does not cancel another consumer; final cancellation aborts upstream', async t => {
    const owner = transport(t), gate = defer(), began = defer(); let upstream;
    const fetcher = async (_url, { signal }) => { upstream = signal; began.resolve(); await gate.promise; signal.throwIfAborted(); return Response.json({ ok: true }); };
    const read = owner.wrap(fetcher), short = new AbortController(), long = new AbortController();
    const first = read(url(100), { ...init, signal: short.signal }), second = read(url(100), { ...init, signal: long.signal });
    const timedOut = assert.rejects(first, error => error.name === 'TimeoutError');
    await began.promise; short.abort(new DOMException('12 second deadline', 'TimeoutError'));
    await timedOut; assert.equal(upstream.aborted, false);
    gate.resolve(); assert.deepEqual(await (await second).json(), { ok: true });
    const waiting = defer(); let abortedSignal;
    const abortable = owner.wrap((_url, { signal }) => new Promise((_resolve, reject) => {
        abortedSignal = signal; signal.addEventListener('abort', () => reject(signal.reason), { once: true }); waiting.resolve();
    }));
    const left = new AbortController(), right = new AbortController();
    const a = abortable(url(101), { ...init, signal: left.signal }), b = abortable(url(101), { ...init, signal: right.signal });
    const rejected = Promise.all([assert.rejects(a, { name: 'AbortError' }), assert.rejects(b, { name: 'AbortError' })]);
    await waiting.promise; left.abort(); assert.equal(abortedSignal.aborted, false); right.abort();
    await rejected; assert.equal(abortedSignal.aborted, true); await owner.close();
});

test('streaming 2 MiB and 4 MiB limits remain independent, including Content-Length policy', async t => {
    const owner = transport(t), began = defer(); let stream, cancelled = 0;
    const fetcher = async () => new Response(new ReadableStream({ start(controller) { stream = controller; began.resolve(); }, cancel() { cancelled++; } }));
    const small = owner.wrap(fetcher, { maximum: 2 * MiB, checkContentLength: true, sizeError: 'Universe size limit' });
    const large = owner.wrap(fetcher, { sizeError: 'Session size limit' });
    const a = small(url(100), init), b = large(url(100), init), rejected = assert.rejects(a, /Universe size limit/);
    await began.promise; stream.enqueue(new Uint8Array(2 * MiB + 1)); await rejected;
    assert.equal(cancelled, 0); stream.enqueue(new Uint8Array(20)); stream.close();
    assert.equal((await (await b).arrayBuffer()).byteLength, 2 * MiB + 21); assert.equal(cancelled, 0);
    await assert.rejects(small(url(100), init), /Universe size limit/, 'Cached raw bytes retain the smaller consumer limit');
    const lengthFetcher = async () => new Response('tiny', { headers: { 'Content-Length': String(3 * MiB) } });
    const c = owner.wrap(lengthFetcher, { maximum: 2 * MiB, checkContentLength: true, sizeError: 'Universe length limit' });
    const d = owner.wrap(lengthFetcher);
    const results = await Promise.allSettled([c(url(101), init), d(url(101), init)]);
    assert.equal(results[0].status, 'rejected'); assert.match(results[0].reason.message, /Universe length limit/);
    assert.equal(await results[1].value.text(), 'tiny', 'Session retains its actual-body-size policy');
});

test('oversized and interrupted response bodies cancel their reader and never become cached packets', async t => {
    const owner = transport(t); let calls = 0, cancellations = 0, mode = 'large';
    const fetcher = async () => { calls++; return mode === 'large' ? new Response(new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(4 * MiB + 1)); }, cancel() { cancellations++; },
    })) : Response.json({ recovered: true }); };
    const read = owner.wrap(fetcher);
    await assert.rejects(read(url(100), init), /size limit/); await turn();
    assert.equal(cancellations, 1); mode = 'ok';
    assert.deepEqual(await (await read(url(100), init)).json(), { recovered: true }); assert.equal(calls, 2);
    const gate = defer(); let cancelBody = false;
    const blocked = owner.wrap(async () => new Response(new ReadableStream({ start() { gate.resolve(); }, cancel() { cancelBody = true; } })));
    const controller = new AbortController(), running = blocked(url(102), { ...init, signal: controller.signal });
    const rejected = assert.rejects(running, { name: 'AbortError' }); await gate.promise; controller.abort();
    await rejected; await owner.close(); assert.equal(cancelBody, true);
});

test('provider failure statuses and transport errors are shared only while in flight and retry freshly', async t => {
    const owner = transport(t);
    for (const status of [404, 429, 503]) {
        let calls = 0;
        const read = owner.wrap(async () => { calls++; await turn(); return new Response('ignored failure body', {
            status, statusText: 'Provider failure', headers: { 'Retry-After': '17', 'X-Test': 'kept' },
        }); });
        const [a, b] = await Promise.all([read(url(status), init), read(url(status), init)]);
        assert.equal(calls, 1); assert.equal(a.status, status); assert.equal(b.statusText, 'Provider failure');
        assert.equal(b.headers.get('retry-after'), '17'); assert.equal(a.headers.get('x-test'), 'kept');
        await read(url(status), init); assert.equal(calls, 2, 'Failures are not cached');
    }
    const failure = new Error('Transport disconnected'); let calls = 0;
    const read = owner.wrap(async () => { if (++calls === 1) { await turn(); throw failure; } return Response.json({ recovered: true }); });
    const results = await Promise.allSettled([read(url(100), init), read(url(100), init)]);
    assert.ok(results.every(result => result.status === 'rejected' && result.reason === failure));
    assert.deepEqual(await (await read(url(100), init)).json(), { recovered: true }); assert.equal(calls, 2);
});

test('cache entry, byte and age limits are bounded; a fresh sequence pointer invalidates reused packets', async t => {
    let now = 0, calls = 0, version = 'aa';
    const owner = transport(t, { now: () => now, maxEntries: 2, maxBytes: 4, cacheMs: 100 });
    const read = owner.wrap(async target => { calls++; return new Response(target === pointer ? '{"sequence":100}' : version); });
    for (const id of [100, 101, 102]) await read(url(id), init);
    assert.equal(calls, 3); await read(url(101), init); assert.equal(calls, 3);
    await read(url(100), init); assert.equal(calls, 4, 'Oldest entry is evicted');
    now = 100; await read(url(100), init); assert.equal(calls, 5, 'Exact age deadline expires');
    version = 'bb'; await read(pointer, init);
    assert.equal(await (await read(url(100), init)).text(), 'bb', 'Sequence refresh cannot reuse pre-rotation bytes');
    const before = calls; await read(pointer, init); await read(pointer, init);
    assert.equal(calls, before + 2, 'Pointer responses never persist in the cache');
});

test('fetcher identities, unrelated providers and request credentials never share responses', async t => {
    const owner = transport(t); let one = 0, two = 0;
    const a = owner.wrap(async () => { one++; return new Response('one'); });
    const b = owner.wrap(async () => { two++; return new Response('two'); });
    assert.deepEqual(await Promise.all([a(url(100), init).then(r => r.text()), b(url(100), init).then(r => r.text())]), ['one', 'two']);
    assert.deepEqual([one, two], [1, 1]);
    await a('https://api.eve-scout.com/example', init); await a('https://api.eve-scout.com/example', init);
    await a(url(100), { ...init, headers: { Authorization: 'test-only' } });
    await a(url(100), { ...init, headers: { Authorization: 'test-only' } });
    assert.equal(one, 5);
});

test('one provider budget paces different URLs; queued cancellation makes no network request', async t => {
    let now = 0; const starts = [], waits = [], owner = transport(t, { now: () => now, spacingMs: 110,
        wait: async ms => { waits.push(ms); now += ms; } });
    const read = owner.wrap(async target => { starts.push([target, now]); return new Response('{}'); });
    await Promise.all([read(url(100), init), read(url(101), init), read(url(102), init)]);
    assert.deepEqual(starts.map(row => row[1]), [0, 110, 220]); assert.deepEqual(waits, [110, 110]);
    await read(url(100), init); assert.equal(waits.length, 2, 'Cache reuse consumes no provider budget');
    const gate = defer(), began = defer(), limited = transport(t, { maxPending: 2 }); let calls = 0;
    const queued = limited.wrap(async () => { calls++; began.resolve(); await gate.promise; return new Response('{}'); });
    const first = queued(url(200), init), controller = new AbortController();
    const second = queued(url(201), { ...init, signal: controller.signal });
    const cancelled = assert.rejects(second, { name: 'AbortError' });
    await assert.rejects(queued(url(202), init), /queue is full/);
    await began.promise; controller.abort(); await cancelled; gate.resolve(); await first; await limited.close(); assert.equal(calls, 1);
});

test('same-key cancellation and retry cannot bypass the accepted task bound behind a blocked request', { timeout: 3000 }, async t => {
    const gate = defer(), began = defer(), calls = [];
    // Release the held fetch before cleanup even if a bound assertion fails.
    t.after(() => gate.resolve());
    const owner = transport(t, { maxPending: 3 });
    const read = owner.wrap(async target => {
        calls.push(target);
        if (target === url(100)) { began.resolve(); await gate.promise; }
        return Response.json({ target });
    });
    const head = read(url(100), init); await began.promise;
    for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const pending = read(url(101), { ...init, signal: controller.signal });
        const canceled = assert.rejects(pending, { name: 'AbortError' });
        controller.abort(); await canceled;
    }
    for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(read(url(101), init), /queue is full/);
    await assert.rejects(read(url(102), init), /queue is full/);
    assert.deepEqual(calls, [url(100)], 'Canceled queued copies make no provider calls');
    gate.resolve(); await head; await turn();
    assert.deepEqual(await (await read(url(101), init)).json(), { target: url(101) }, 'Exited tasks release admission for a fresh same-key call');
    assert.deepEqual(calls, [url(100), url(101)]);
});

test('actual Session and Universe consumers share raw successes but preserve independent acknowledgement and disable policy', async t => {
    let now = Date.now(), verify = false;
    const store = memory(), owner = transport(t, { now: () => now }), calls = [], accepted = [], raw = packet(100, now);
    const fetcher = async target => { calls.push(target); await turn(); return target === pointer ? Response.json({ sequence: 100 }) : target === url(100) ? Response.json(raw) : new Response(null, { status: 404 }); };
    const session = createSessionLiveFeed(store, { fetcher: owner.wrap(fetcher), now: () => now, spacingMs: 0,
        getTargets: () => [42], isTargetActive: () => true, accept: async body => { if (!verify) throw new Error('ESI verification pending'); accepted.push(body.killmail_id); } });
    const universe = createUniverseFeeds(store, {}, { fetcher: owner.wrap(fetcher, { maximum: 2 * MiB, checkContentLength: true }),
        now: () => now, atlas, noSync: true, points: { items: [], metadata: {} } });
    t.after(async () => { await session.close(); await universe.close(); });
    universe.saveConfig({ combat_enabled: true }); await Promise.all([session.sync(), universe.refresh('combat')]);
    assert.equal(calls.filter(value => value === pointer).length, 1);
    assert.equal(calls.filter(value => value === url(100)).length, 1);
    assert.equal(store.get('session:live-feed').nextSequence, 100, 'Session does not acknowledge unverified ingestion');
    assert.equal(store.get('universe:feeds:combat-cursor').sequence, 101, 'Public normalization has a separate acknowledgement');
    assert.equal(universe.state().combat.length, 1); assert.deepEqual(accepted, []);
    const before = calls.length; await session.sync({ force: true }); assert.equal(calls.length, before, 'Force preserves Session backoff');
    now += 120000; verify = true;
    await session.sync(); assert.deepEqual(accepted, [100]); assert.equal(store.get('session:live-feed').nextSequence, 101);
    assert.equal(calls.filter(value => value === url(100)).length, 2, 'A lagged consumer fetches again after bounded raw retention');
    universe.saveConfig({ combat_enabled: false }); const disabled = calls.length;
    await universe.refresh('combat'); assert.equal(calls.length, disabled); assert.equal(store.get('session:live-feed').nextSequence, 101);
});

test('disabling either actual consumer leaves the other pending consumer and cursor independent', async t => {
    for (const stopping of ['Universe', 'Session']) await t.test(stopping, async t => {
        const store = memory(), owner = transport(t), gate = defer(), started = defer(), now = Date.now(), calls = [];
        let upstream;
        const fetcher = async (target, { signal }) => {
            calls.push(target);
            if (target === pointer) return Response.json({ sequence: 100 });
            if (target === url(100)) { upstream = signal; started.resolve(); await gate.promise; signal.throwIfAborted(); return Response.json(packet(100, now)); }
            return new Response(null, { status: 404 });
        };
        const session = createSessionLiveFeed(store, { fetcher: owner.wrap(fetcher), now: () => now, spacingMs: 0, maxItems: 1,
            getTargets: () => [42], isTargetActive: () => true, accept: async () => {} });
        const universe = createUniverseFeeds(store, {}, { fetcher: owner.wrap(fetcher, { maximum: 2 * MiB, checkContentLength: true }),
            now: () => now, atlas, noSync: true, points: { items: [], metadata: {} } });
        t.after(async () => { gate.resolve(); await session.close(); await universe.close(); });
        universe.saveConfig({ combat_enabled: true });
        const a = session.sync(), b = universe.refresh('combat'); await started.promise; await turn();
        if (stopping === 'Universe') { universe.saveConfig({ combat_enabled: false }); await b; }
        else await session.close();
        assert.equal(upstream.aborted, false, 'Another collector still owns the shared request');
        gate.resolve(); await Promise.all([a, b]); assert.equal(calls.filter(value => value === url(100)).length, 1);
        if (stopping === 'Universe') {
            assert.equal(store.get('universe:feeds:combat-cursor', null), null);
            assert.equal(store.get('session:live-feed').nextSequence, 101);
        } else {
            assert.equal(store.get('session:live-feed').nextSequence, 100);
            assert.equal(store.get('session:live-feed').error, undefined);
            assert.equal(store.get('universe:feeds:combat-cursor').sequence, 101);
        }
    });
});

test('transport close is idempotent, drains active work and rejects queued/new admission', async t => {
    const owner = transport(t), started = defer(); let calls = 0, upstream;
    const read = owner.wrap((_url, { signal }) => new Promise((_resolve, reject) => {
        calls++; upstream = signal; started.resolve(); signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const a = read(url(100), init), b = read(url(101), init);
    const rejected = Promise.all([assert.rejects(a, { name: 'AbortError' }), assert.rejects(b, { name: 'AbortError' })]);
    await started.promise; const closing = owner.close(); assert.strictEqual(owner.close(), closing);
    await rejected; await closing; assert.equal(calls, 1); assert.equal(upstream.aborted, true);
    await assert.rejects(read(url(102), init), /transport is closed/);
});

test('real Core wiring shares optional public transport and retains verified Session ingestion', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-shared-public-')), store = openStore(dir), calls = [], verifications = [];
    const now = Date.now(), raw = packet(100, now), auth = { characters: () => [{ id: 42, scopes: [] }] };
    store.db.prepare('INSERT INTO sessions(id,character_id,label,started,start_context) VALUES(?,?,?,?,?)')
        .run('live', 42, 'Flight', new Date(now - 600000).toISOString(), JSON.stringify({ capturedAt: new Date(now - 600000).toISOString(), system: { id: 30000001 }, alliance: { id: 77 } }));
    const fetcher = async target => { calls.push(target); return target === pointer ? Response.json({ sequence: 100 }) : target === url(100) ? Response.json(raw) : new Response(null, { status: 404 }); };
    const esi = { health: () => ({}), names: async () => ({}), request: async path => { verifications.push(path); return { data: raw.esi }; } };
    const core = await createCore(store, auth, esi, fileURLToPath(new URL('../../server/modules', import.meta.url)),
        { noSync: true, sessionFeedFetcher: fetcher, universe: { staticData: atlas, feeds: { fetcher, points: { items: [], metadata: {} } } } });
    t.after(async () => { await core.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
    core.universe.feeds.saveConfig({ combat_enabled: true });
    await Promise.all([core.sessionCombat.syncLive(), core.universe.feeds.refresh('combat')]);
    assert.equal(calls.filter(value => value === pointer).length, 1);
    assert.equal(calls.filter(value => value === url(100)).length, 1);
    assert.equal(store.get('session:live-feed').nextSequence, 101);
    assert.equal(store.get('universe:feeds:combat-cursor').sequence, 101);
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM combat_records WHERE character_id=42').get().n, 1);
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM alliance_combat_records WHERE alliance_id=77').get().n, 1);
    assert.ok(verifications.length >= 1 && verifications.every(path => path === '/killmails/100/' + raw.hash));
});
