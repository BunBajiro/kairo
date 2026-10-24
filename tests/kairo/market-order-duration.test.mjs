import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from '../../server/store.mjs';
import {createMarkets, JITA, MARKET_SCOPE} from '../../server/markets.mjs';

const NOW = Date.parse('2026-10-21T00:38:00Z');
const TYPE = 25600, STRUCTURE = 1040000000001;
// Actual public ESI /markets/10000002/orders page 8, Last-Modified
// 2026-10-21T00:37:29Z. The exhausted row disappeared on the next cache generation.
const exhausted = {
    duration:0, is_buy_order:false, issued:'2026-10-21T00:37:29Z',
    location_id:JITA, min_volume:1, order_id:7450320550, price:37760,
    range:'region', system_id:30000142, type_id:TYPE, volume_remain:0, volume_total:11,
};
const active = (id, overrides = {}) => ({...exhausted, order_id:id, duration:90,
    volume_remain:2, volume_total:2, price:40000 + id, ...overrides});
const response = (data, pages = 1) => ({data, headers:{'x-pages':String(pages)},
    updatedAt:new Date(NOW).toISOString(), expiresAt:new Date(NOW + 300000).toISOString()});

async function desk(t, {hubId = JITA, mode = 'full'} = {}) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-order-duration-'));
    const store = openStore(dir), calls = [];
    let orders = () => response([active(1, {location_id:hubId})]);
    store.set('market:quick', [TYPE]);
    store.db.prepare('INSERT INTO market_types(type_id,name) VALUES(?,?)').run(TYPE, 'Burned Logic Circuit');
    const markets = createMarkets(store, {characters:() => [{id:42, name:'Fixture pilot', scopes:[MARKET_SCOPE]}]}, {
        request:async path => {
            calls.push(path);
            if (path.includes('/orders?') || path.startsWith('/markets/structures/')) {
                return orders(Number(new URL(path, 'https://test').searchParams.get('page')));
            }
            if (path.includes('/history?')) return response([]);
            throw new Error('Unexpected provider request: ' + path);
        },
    }, {now:() => NOW, spacingMs:0, historySource:'esi', retryWait:async () => {}});
    if (hubId === STRUCTURE) store.db.prepare(`INSERT INTO market_hubs
        (id,name,station_name,kind,system_id,system_name,region_id,region_name)
        VALUES(?,?,?,?,?,?,?,?)`).run(STRUCTURE, 'Fixture structure', 'Fixture structure', 'structure',
        30000142, 'Jita', 10000002, 'The Forge');
    t.after(async () => { await markets.close(); store.close(); await rm(dir, {recursive:true, force:true}); });
    const scan = async () => {
        markets.start({hubId, mode, characterId:hubId === STRUCTURE ? 42 : 0, compareJita:false});
        await markets.idle();
        return markets.overview().job;
    };
    const book = () => JSON.stringify(store.db.prepare('SELECT * FROM market_orders WHERE hub_id=? ORDER BY order_id').all(hubId));
    return {store, markets, calls, scan, book, setOrders:fn => { orders = fn; }};
}

test('Jita full scan ignores the witnessed exhausted zero-duration row on page eight', async t => {
    const d = await desk(t);
    assert.equal((await d.scan()).status, 'complete');
    const prior = d.book();
    d.calls.length = 0;
    d.setOrders(page => {
        assert.equal(d.book(), prior, 'No staged page replaces the previous complete book');
        return response(page < 8 ? [active(100 + page)] : [
            exhausted, active(108, {is_buy_order:true, price:39000, volume_remain:3}),
        ], 8);
    });
    const job = await d.scan();
    assert.equal(job.status, 'complete', job.detail);
    assert.equal(job.pages, 8);
    assert.equal(job.books.length, 1);
    const item = d.markets.browse(JITA).rows.find(row => row.type_id === TYPE);
    assert.equal(item.sell, 40101, 'The exhausted cheaper row contributes no price or depth');
    assert.equal(item.sell_volume, 14);
    assert.equal(item.buy_volume, 3);
    assert.equal(d.store.db.prepare('SELECT COUNT(*) n FROM market_orders').get().n, 8);
    assert.equal(d.store.db.prepare('SELECT COUNT(*) n FROM market_stage').get().n, 0);
    assert.equal(d.calls.filter(path => path.includes('/orders?')).length, 8);
    assert.equal(d.calls.filter(path => path.includes('/history?')).length, 0,
        'The fresh history from the previous complete scan is reused');
});

test('the exhausted-row exception works for quick station and authenticated structure books', async t => {
    for (const scope of [{hubId:JITA, mode:'quick'}, {hubId:STRUCTURE, mode:'full'}]) {
        await t.test(scope.hubId === JITA ? 'quick station' : 'structure', async t => {
            const d = await desk(t, scope);
            d.setOrders(() => response([{...exhausted, location_id:scope.hubId},
                active(2, {location_id:scope.hubId})]));
            const job = await d.scan();
            assert.equal(job.status, 'complete', job.detail);
            assert.equal(job.pages, 1);
            assert.equal(job.books.length, 1);
            assert.equal(d.markets.browse(scope.hubId).rows[0].sell_volume, 2);
            assert.equal(d.store.db.prepare('SELECT COUNT(*) n FROM market_orders').get().n, 1);
            assert.equal(d.calls.filter(path => !path.includes('/history?')).length, 1);
        });
    }
});

test('unsupported duration and malformed exhausted rows still retain the complete old book', async t => {
    const d = await desk(t);
    assert.equal((await d.scan()).status, 'complete');
    const prior = d.book(), stamp = d.markets.overview().hubs.find(h => h.id === JITA).last_scan;
    const invalid = [
        ['zero-duration active order', {...exhausted, volume_remain:1}],
        ['negative duration', {...exhausted, duration:-1}],
        ['fractional duration', {...exhausted, duration:0.5}],
        ['string duration', {...exhausted, duration:'0'}],
        ['missing duration', {...exhausted, duration:undefined}],
        ['nonfinite price', {...exhausted, price:NaN}],
        ['missing side', {...exhausted, is_buy_order:undefined}],
        ['invalid issue date', {...exhausted, issued:'invalid'}],
        ['invalid order identity', {...exhausted, order_id:0}],
    ];
    for (const [name, row] of invalid) await t.test(name, async () => {
        d.calls.length = 0;
        d.setOrders(page => response(page < 8 ? [active(100 + page)] : [row], 8));
        const job = await d.scan();
        assert.equal(job.status, 'failed');
        assert.match(job.detail, /malformed order/);
        assert.equal(job.pages, 7);
        assert.equal(job.books.length, 0);
        assert.equal(d.book(), prior);
        assert.deepEqual(d.markets.overview().hubs.find(h => h.id === JITA).last_scan, stamp);
        assert.equal(d.store.db.prepare('SELECT COUNT(*) n FROM market_stage').get().n, 0);
        assert.equal(d.calls.length, 10, 'At most two recovery attempts and no history after rejection');
    });
    d.setOrders(() => response([active(3)]));
    assert.equal((await d.scan()).status, 'complete', 'A later explicit scan can recover');
});
