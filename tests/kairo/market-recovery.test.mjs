import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../server/store.mjs';
import { createESI } from '../../server/esi.mjs';
import { createMarkets, JITA, MARKET_SCOPE } from '../../server/markets.mjs';

const AMARR = 60008494, STRUCTURE = 1040000000001;
const issued = '2026-10-20T12:00:00Z';
const order = (id, hub = JITA, volume = 1) => ({ order_id: id, type_id: 1, location_id: hub,
    is_buy_order: false, price: 100 + id, volume_remain: volume, min_volume: 1,
    range: 'station', issued, duration: 90 });

async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-market-recovery-')), store = openStore(dir);
    let clock = Date.parse('2026-10-21T12:00:00Z'), handler, onWait, markets;
    let characters = [{ id: 42, name: 'Fixture pilot', scopes: [MARKET_SCOPE] }];
    const calls = [], waits = [];
    t.mock.method(Date, 'now', () => clock);
    const auth = { characters: () => characters, access: async () => 'fixture-token' };
    const reply = (data, pages = 1, headers = {}) => Response.json(data,
        { headers: { 'Cache-Control': 'max-age=300', 'X-Pages': String(pages), ...headers } });
    const esi = createESI(store, auth, { fetcher: async (url, options) => {
        const u = new URL(url), isOrders = u.pathname.endsWith('/orders') || u.pathname.startsWith('/markets/structures/');
        const call = { path: u.pathname + u.search, page: Number(u.searchParams.get('page')), at: clock,
            headers: { ...options.headers }, isOrders };
        calls.push(call);
        if (isOrders) return handler(call, u);
        if (u.pathname.endsWith('/history')) return reply([]);
        throw new Error('Unexpected fixture route: ' + call.path);
    } });
    store.set('market:quick', [1]);
    store.db.prepare('INSERT INTO market_types(type_id,name) VALUES(?,?)').run(1, 'Fixture item');
    store.db.prepare('INSERT INTO market_hubs(id,name,station_name,kind,system_id,system_name,region_id,region_name) VALUES(?,?,?,?,?,?,?,?)')
        .run(STRUCTURE, 'Fixture structure', 'Fortizar', 'structure', 30002187, 'Amarr', 10000043, 'Domain');
    markets = createMarkets(store, auth, esi, { spacingMs: 0, now: () => clock, historySource: 'esi',
        retryWait: async milliseconds => { waits.push(milliseconds); clock += milliseconds; onWait?.(); } });
    t.after(async () => { await markets.close(); await esi.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
    return { store, esi, markets, calls, waits, reply,
        setHandler(next) { handler = next; }, setOnWait(next) { onWait = next; },
        setCharacters(next) { characters = next; },
        expire() { store.db.prepare('UPDATE cache SET expires=0').run(); },
        orderCalls() { return calls.filter(call => call.isOrders); },
        async scan(input = {}) {
            markets.start({ hubId: JITA, mode: 'full', compareJita: false, ...input });
            await markets.idle(); return markets.overview().job;
        },
        snapshot(hub = JITA) { return {
            orders: store.db.prepare('SELECT * FROM market_orders WHERE hub_id=? ORDER BY order_id').all(hub),
            items: store.db.prepare('SELECT * FROM market_items WHERE hub_id=? ORDER BY type_id').all(hub),
            scan: store.db.prepare('SELECT last_scan,last_full_scan FROM market_hubs WHERE id=?').get(hub),
        }; },
        async seed(hub = JITA, input = {}) {
            handler = () => reply([order(900, hub, 5)], 1, { ETag: '"prior-book"' });
            assert.equal((await this.scan({ hubId: hub, ...input })).status, 'complete');
            this.expire(); calls.length = 0; waits.length = 0;
            return this.snapshot(hub);
        },
    };
}

test('a malformed eighth page is fetched again without replaying valid pages or publishing partial rows', async t => {
    const f = await fixture(t), prior = await f.seed();
    let eighth = 0;
    f.setHandler(call => {
        assert.deepEqual(f.snapshot(), prior, 'The published book remains old throughout all page reads and recovery');
        if (call.page === 8 && ++eighth === 1) return f.reply([order(108, JITA, 8), null], 8, { ETag: '"bad-page"' });
        return f.reply([order(100 + call.page, JITA, call.page)], 8, { ETag: '"valid-page"' });
    });
    const job = await f.scan();
    assert.equal(job.status, 'complete', job.detail);
    assert.deepEqual(f.orderCalls().map(call => call.page), [1, 2, 3, 4, 5, 6, 7, 8, 8]);
    assert.equal(f.orderCalls().at(-1).headers['If-None-Match'], undefined, 'A rejected representation cannot become a 304 validator');
    assert.equal(job.pages, 8); assert.equal(job.books.length, 1);
    const book = f.snapshot();
    assert.equal(book.orders.length, 8); assert.equal(book.items[0].sell_volume, 36);
    assert.equal(JSON.parse(book.scan.last_scan).pages, 8);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM market_stage').get().n, 0);
    assert.equal(f.waits.reduce((sum, value) => sum + value, 0), 1000);
});

test('permanently malformed order pages exhaust two extra attempts and retain the complete previous book', async t => {
    const f = await fixture(t), prior = await f.seed();
    f.setHandler(() => f.reply([{ ...order(100), price: 0 }], 1, { ETag: '"bad-page"' }));
    const job = await f.scan();
    assert.equal(job.status, 'failed');
    assert.equal(f.orderCalls().length, 3, 'One initial request and at most two extra attempts');
    assert.deepEqual(f.snapshot(), prior); assert.equal(job.pages, 0); assert.equal(job.books.length, 0);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM market_stage').get().n, 0);
    assert.equal(f.waits.reduce((sum, value) => sum + value, 0), 3000);
    assert.ok(f.waits.every(value => value > 0 && value <= 250));
});

test('healthy scans reuse cached pages without retry delays or extra transport', async t => {
    const f = await fixture(t);
    f.setHandler(() => f.reply([order(100)], 1, { ETag: '"healthy"' }));
    assert.equal((await f.scan()).status, 'complete');
    const count = f.calls.length;
    assert.equal((await f.scan()).status, 'complete');
    assert.equal(f.calls.length, count); assert.equal(f.orderCalls().length, 1); assert.deepEqual(f.waits, []);
});

for (const kind of ['invalid JSON', 'non-array body', 'null order']) {
    test(`${kind} gets a fresh order read and recovers without publishing the rejected response`, async t => {
        const f = await fixture(t), prior = await f.seed();
        let attempts = 0;
        f.setHandler(() => {
            assert.deepEqual(f.snapshot(), prior);
            if (++attempts === 1) return kind === 'invalid JSON'
                ? new Response('{broken', { headers: { 'Cache-Control': 'max-age=300', ETag: '"bad-json"' } })
                : f.reply(kind === 'non-array body' ? { error: 'invalid order collection' } : [null], 1, { ETag: '"bad-shape"' });
            return f.reply([order(100, JITA, 7)]);
        });
        const job = await f.scan();
        assert.equal(job.status, 'complete', job.detail); assert.equal(attempts, 2);
        assert.equal(job.pages, 1); assert.equal(job.books.length, 1);
        assert.equal(f.snapshot().items[0].sell_volume, 7);
        assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM market_stage').get().n, 0);
        assert.ok(f.waits.reduce((sum, value) => sum + value, 0) <= 60000);
    });
}

test('the two-extra-attempt budget spans pages and comparison hubs while retaining already completed books', async t => {
    const f = await fixture(t);
    await f.seed(AMARR);
    const previousJita = await f.seed(JITA), attempts = new Map();
    f.setHandler((call, url) => {
        const amarr = url.pathname.includes('/10000043/'), key = `${amarr ? 'amarr' : 'jita'}:${call.page}`;
        const count = (attempts.get(key) || 0) + 1; attempts.set(key, count);
        if (call.page === 2 || count === 1) return f.reply([null], amarr ? 1 : 2);
        return f.reply([order(amarr ? 101 : 201, amarr ? AMARR : JITA)], amarr ? 1 : 2);
    });
    const job = await f.scan({ hubId: AMARR, compareJita: true });
    assert.equal(job.status, 'failed');
    assert.deepEqual([...attempts], [['amarr:1', 2], ['jita:1', 2], ['jita:2', 1]]);
    assert.equal(f.orderCalls().length, 5); assert.equal(job.pages, 2);
    assert.deepEqual(job.books.map(book => book.hubId), [AMARR]);
    assert.equal(f.snapshot(AMARR).orders[0].order_id, 101);
    assert.deepEqual(f.snapshot(JITA), previousJita);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM market_stage').get().n, 0);
    assert.equal(f.waits.reduce((sum, value) => sum + value, 0), 3000);
});

for (const seconds of [45, 60]) {
    test(`a provider cooldown of ${seconds} seconds is respected within the retry-delay budget`, async t => {
        const f = await fixture(t), prior = await f.seed();
        let attempts = 0;
        f.setHandler(() => {
            assert.deepEqual(f.snapshot(), prior);
            return ++attempts === 1 ? new Response('limited', { status: 429, headers: { 'Retry-After': String(seconds) } })
                : f.reply([order(100)]);
        });
        const job = await f.scan();
        assert.equal(job.status, 'complete', job.detail); assert.equal(attempts, 2);
        assert.equal(f.orderCalls()[1].at - f.orderCalls()[0].at, seconds * 1000);
        assert.equal(f.waits.reduce((sum, value) => sum + value, 0), seconds * 1000);
        assert.ok(f.waits.every(value => value > 0 && value <= 250));
    });
}

test('a provider deadline beyond the wait budget fails without an early retry', async t => {
    const f = await fixture(t), prior = await f.seed();
    f.setHandler(() => new Response('limited', { status: 429, headers: { 'Retry-After': '61' } }));
    const job = await f.scan();
    assert.equal(job.status, 'failed'); assert.equal(f.orderCalls().length, 1); assert.deepEqual(f.waits, []);
    assert.deepEqual(f.snapshot(), prior);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM market_stage').get().n, 0);
});

test('cumulative provider cooldowns cannot reset the job wait budget', async t => {
    const f = await fixture(t), prior = await f.seed();
    f.setHandler(() => new Response('limited', { status: 429, headers: { 'Retry-After': '30' } }));
    const job = await f.scan();
    assert.equal(job.status, 'failed'); assert.equal(f.orderCalls().length, 2);
    assert.equal(f.orderCalls()[1].at - f.orderCalls()[0].at, 30000);
    assert.equal(f.waits.reduce((sum, value) => sum + value, 0), 30000, 'The second exponential 60-second backoff cannot fit in the remaining budget');
    assert.deepEqual(f.snapshot(), prior);
});

for (const action of ['cancel', 'disable module', 'disconnect pilot', 'remove structure scope', 'close']) {
    test(`${action} during a recovery wait stops before another provider read and cleans staging`, async t => {
        const f = await fixture(t), structure = action === 'remove structure scope';
        const hub = structure ? STRUCTURE : JITA, input = { hubId: hub, characterId: 42 };
        const prior = await f.seed(hub, input);
        let closing;
        f.setHandler(() => f.reply([null]));
        f.setOnWait(() => {
            f.setOnWait(undefined);
            if (action === 'cancel') f.markets.cancel();
            else if (action === 'disable module') f.store.set('module:markets', false);
            else if (action === 'disconnect pilot') f.setCharacters([]);
            else if (structure) f.setCharacters([{ id: 42, name: 'Fixture pilot', scopes: [] }]);
            else closing = f.markets.close();
        });
        const job = await f.scan(input); await closing;
        assert.equal(job.status, action === 'cancel' || action === 'close' ? 'cancelled' : 'failed');
        assert.equal(f.orderCalls().length, 1); assert.deepEqual(f.waits, [250]);
        assert.deepEqual(f.snapshot(hub), prior);
        assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM market_stage').get().n, 0);
    });
}

for (const status of [401, 403, 404]) {
    test(`HTTP ${status} is terminal for order recovery and preserves the old book`, async t => {
        const f = await fixture(t), prior = await f.seed();
        f.setHandler(() => new Response('access unavailable', { status }));
        const job = await f.scan();
        assert.equal(job.status, 'failed'); assert.equal(f.orderCalls().length, 1); assert.deepEqual(f.waits, []);
        assert.deepEqual(f.snapshot(), prior);
    });
}

test('page-count drift remains terminal without retrying or publishing a mixed book', async t => {
    const f = await fixture(t), prior = await f.seed();
    f.setHandler(call => f.reply([order(100 + call.page)], call.page === 1 ? 2 : 3));
    const job = await f.scan();
    assert.equal(job.status, 'failed'); assert.match(job.detail, /page count/);
    assert.deepEqual(f.orderCalls().map(call => call.page), [1, 2]); assert.deepEqual(f.waits, []);
    assert.deepEqual(f.snapshot(), prior);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM market_stage').get().n, 0);
});
