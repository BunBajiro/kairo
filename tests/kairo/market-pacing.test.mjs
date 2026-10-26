import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../server/store.mjs';
import { createESI } from '../../server/esi.mjs';
import { createMarkets, JITA } from '../../server/markets.mjs';

test('real Market scans skip courtesy waits on ESI cache hits and retain the book when cancelled during pacing', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-market-pacing-')), store = openStore(dir);
    let clock = Date.now(), calls = 0, onWait, markets; const waits = [];
    const auth = { characters: () => [] }, ids = [1403, 519, 587];
    const esi = createESI(store, auth, { fetcher: async url => {
        calls++; const u = new URL(url), id = Number(u.searchParams.get('type_id'));
        return Response.json(u.pathname.endsWith('/orders') ? [{ order_id: id, type_id: id, location_id: JITA,
            is_buy_order: false, price: 100, volume_remain: 10, min_volume: 1, range: 'station', issued: new Date(clock).toISOString(), duration: 90 }] : [],
            { headers: { 'Cache-Control': 'max-age=86400', 'X-Pages': '1' } });
    } });
    const paced = esi.paced.bind(esi);
    esi.paced = options => paced({ ...options, wait: async milliseconds => { waits.push(milliseconds); clock += milliseconds; onWait?.(); } });
    t.after(async () => { await markets?.close(); await esi.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
    store.set('market:quick', ids);
    for (const id of ids) store.db.prepare('INSERT INTO market_types(type_id,name) VALUES(?,?)').run(id, `Item ${id}`);
    markets = createMarkets(store, auth, esi, { now: () => clock, historySource: 'esi', spacingMs: 250 });
    const scan = async () => { markets.start({ hubId: JITA, mode: 'quick', compareJita: false }); await markets.idle(); return markets.overview().job; };
    assert.equal((await scan()).status, 'complete');
    assert.equal(calls, 6); assert.deepEqual(waits, [250, 250, 250, 250, 250]);
    waits.length = 0;
    assert.equal((await scan()).status, 'complete');
    assert.equal(calls, 6); assert.deepEqual(waits, []);
    const prior = store.db.prepare('SELECT * FROM market_orders ORDER BY order_id').all();
    store.db.prepare('UPDATE cache SET expires=0').run();
    onWait = () => markets.cancel();
    assert.equal((await scan()).status, 'cancelled');
    assert.equal(calls, 6, 'Cancellation during the courtesy wait cannot dispatch a new provider request');
    assert.deepEqual(store.db.prepare('SELECT * FROM market_orders ORDER BY order_id').all(), prior);
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM market_stage').get().n, 0);
});
