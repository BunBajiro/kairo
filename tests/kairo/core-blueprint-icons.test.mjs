import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from '../../server/store.mjs';
import {createCore} from '../../server/core.mjs';
import {createESI} from '../../server/esi.mjs';
import {catalog} from '../../server/modules/catalog.mjs';
import {operationRows} from '../../components/kairo/derived-models.mjs';

const keys = ['assets', 'transactions', 'orders', 'jobs'];
const sourceRows = {
    assets: [{item_id: 1, type_id: 27917, quantity: 1, location_id: 60003760, is_blueprint_copy: true},
        {item_id: 2, type_id: 1403, quantity: 2, location_id: 60003760},
        {item_id: 3, type_id: 1, quantity: 1, location_id: 60003760}],
    transactions: [{transaction_id: 1, type_id: 27917, quantity: 1}, {transaction_id: 2, type_id: 1403, quantity: 2}, {transaction_id: 3, type_id: 1, quantity: 1}],
    orders: [{order_id: 1, type_id: 27917, volume_remain: 1}, {order_id: 2, type_id: 1403, volume_remain: 2}, {order_id: 3, type_id: 1, volume_remain: 1}],
    jobs: [{job_id: 1, activity_id: 4, blueprint_type_id: 27917, status: 'active', runs: 1},
        {job_id: 2, activity_id: 1, blueprint_type_id: 27917, product_type_id: 1403, status: 'active', runs: 2},
        {job_id: 3, activity_id: 1, blueprint_type_id: 27917, product_type_id: 1, status: 'active', runs: 1}],
};
const displayIds = (rows, key) => rows.map(row => key === 'jobs' ? row.product_type_id || row.blueprint_type_id : row.type_id);
const displayVariants = (core, snapshots, key) => operationRows(snapshots[key].data, core.names(), key, new Map()).map(row => row.iconVariant || 'icon');
const allVariants = (core, snapshots) => Object.fromEntries(keys.map(key => [key, displayVariants(core, snapshots, key)]));
const expectedVariants = Object.fromEntries(keys.map(key => [key, ['bp', 'icon', 'icon']]));

async function fixture(t, {seed = false, expired = false} = {}) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-core-blueprint-')), store = openStore(dir), calls = [];
    let now = Date.now(), failing = false;
    t.mock.method(Date, 'now', () => now);
    for (const module of catalog) store.set('module:' + module.id, ['hangar', 'wallet', 'industry'].includes(module.id));
    store.set('names', {27917: 'Electron Bomb Blueprint', 1403: 'Inertial Stabilizers I', 1: 'Unknown legacy type', 60003760: 'Jita station'});
    if (seed) for (const key of keys) store.saveSnapshot(42, key, {status: 'ready', data: sourceRows[key],
        updatedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + (expired ? -1 : 600000)).toISOString(),
        refreshAt: new Date(now + (expired ? -1 : 600000)).toISOString()});
    const scopes = ['esi-assets.read_assets.v1', 'esi-wallet.read_character_wallet.v1', 'esi-markets.read_character_orders.v1', 'esi-industry.read_character_jobs.v1'];
    const auth = {characters: () => [{id: 42, scopes}], access: async () => 'token'};
    const esi = createESI(store, auth, {fetcher: async (url, options) => {
        const route = new URL(url), key = route.pathname.split('/').at(-1);
        calls.push({path: route.pathname, query: route.search, method: options.method});
        if (failing) return Response.json({error: 'Temporary provider failure'}, {status: 503});
        if (key === 'wallet') return Response.json(0, {headers: {'Cache-Control': 'max-age=600'}});
        if (key === 'journal') return Response.json([], {headers: {'Cache-Control': 'max-age=600', 'X-Pages': '1'}});
        assert.ok(Object.hasOwn(sourceRows, key), 'No new metadata or image-provider lookup: ' + route.pathname);
        return Response.json(sourceRows[key], {headers: {'Cache-Control': 'max-age=600', 'X-Pages': '1'}});
    }});
    const core = await createCore(store, auth, esi, dir, {noSync: true}); core.quiesce();
    t.after(async () => {await core.close(); await esi.close(); store.close(); await rm(dir, {recursive: true, force: true});});
    return {core, store, calls, fail(value) {failing = value;}, advance(ms) {now += ms;}};
}

test('cold Core projections supply blueprint resources to all four operation owners without rewriting legacy snapshots', async t => {
    const f = await fixture(t, {seed: true}), before = f.store.db.prepare('SELECT total_changes() n').get().n;
    const read = f.store.snapshot, reads = new Map();
    f.store.snapshot = (id, key) => {reads.set(key, (reads.get(key) || 0) + 1); return read(id, key);};
    const snapshots = f.core.snapshots(42), repeated = f.core.snapshots(42);
    assert.equal(f.calls.length, 0, 'Opening an existing cache performs no provider request');
    assert.equal(f.store.db.prepare('SELECT total_changes() n').get().n, before, 'Display metadata causes no persistence writes');
    for (const key of keys) {
        assert.equal(reads.get(key), 2, 'Exactly one existing snapshot decode per projection, with no per-row reads: ' + key);
        assert.equal(snapshots[key].dataRevision, repeated[key].dataRevision, 'Read-only projection preserves source revision');
        assert.deepEqual(read(42, key).data, sourceRows[key], 'Saved provider rows remain unchanged');
        assert.deepEqual(displayIds(snapshots[key].data, key), [27917, 1403, 1]);
    }
    assert.deepEqual(allVariants(f.core, snapshots), expectedVariants, 'All four owners use blueprint, ordinary product and unknown fallback resources');
});

test('live Core collection retains image metadata through actual operation rows and uses only existing source requests', async t => {
    const f = await fixture(t);
    await f.core.sync(42);
    const snapshots = f.core.snapshots(42);
    assert.equal(f.calls.length, 6, 'Assets, wallet, journal, transactions, orders and jobs only');
    assert.ok(f.calls.every(call => call.path.startsWith('/characters/42/')));
    for (const key of keys) {
        assert.equal(snapshots[key].status, 'ready');
        assert.ok(f.store.snapshot(42, key).data.every(row => !Object.hasOwn(row, 'iconVariant')), 'Presentation metadata is not added to durable ESI samples');
    }
    await f.core.requestSync(42); await f.core.sync(42);
    assert.equal(f.calls.length, 6, 'Existing ESI caches and Core deadlines still suppress repeated transport');
    assert.deepEqual(allVariants(f.core, snapshots), expectedVariants);
});

test('provider failure retains blueprint metadata on stale rows and successful collection recovers without metadata transport', async t => {
    const f = await fixture(t, {seed: true, expired: true}); f.fail(true);
    await f.core.sync(42);
    const stale = f.core.snapshots(42);
    assert.equal(f.calls.length, 6);
    for (const key of keys) {
        assert.equal(stale[key].status, 'stale');
    }
    await f.core.requestSync(42); assert.equal(f.calls.length, 6, 'Retry deadline remains effective');
    f.fail(false); f.advance(61000); await f.core.requestSync(42);
    assert.equal(f.calls.length, 12, 'One recovery transport per existing source, no type lookup');
    const recovered = f.core.snapshots(42);
    for (const key of keys) {
        assert.equal(recovered[key].status, 'ready');
    }
    assert.deepEqual({stale: allVariants(f.core, stale), recovered: allVariants(f.core, recovered)},
        {stale: expectedVariants, recovered: expectedVariants});
});

test('missing and non-array snapshots keep their existing representation without transport or writes', async t => {
    const f = await fixture(t), before = f.store.db.prepare('SELECT total_changes() n').get().n;
    assert.equal(f.core.snapshots(42).assets.data, null);
    assert.equal(f.calls.length, 0);
    assert.equal(f.store.db.prepare('SELECT total_changes() n').get().n, before);
    f.store.saveSnapshot(42, 'assets', {status: 'error', data: null});
    f.store.saveSnapshot(42, 'jobs', {status: 'error', data: {message: 'Legacy incomplete source'}});
    const snapshots = f.core.snapshots(42);
    assert.equal(snapshots.assets.data, null);
    assert.deepEqual(snapshots.jobs.data, {message: 'Legacy incomplete source'});
    assert.equal(snapshots.jobs.status, 'error');
});
