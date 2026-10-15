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

async function fixture(t, key) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-implant-names-')), store = openStore(dir), lookups = [];
    for (const module of catalog) store.set('module:' + module.id, module.id === 'training');
    const ids = [10208, 10212], labels = {10208: 'Memory implant', 10212: 'Intelligence implant'};
    const auth = {characters: () => [{id: 42, scopes: [key === 'clones' ? 'esi-clones.read_clones.v1' : 'esi-clones.read_implants.v1']}]};
    let unavailable = false;
    const request = async path => ({data: path.endsWith('/clones') ? {jump_clones: [{jump_clone_id: 1, location_id: 60000001, implants: ids}]} : ids,
        updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), headers: {}});
    const core = await createCore(store, auth, {request, paged: request, health: () => ({}), names: async requested => {
        lookups.push([...requested]);
        return unavailable ? {} : Object.fromEntries(requested.map(id => [id, labels[id]]));
    }}, dir, {noSync: true}); core.quiesce();
    t.after(async () => { await core.close(); store.close(); await rm(dir, {recursive: true, force: true}); });
    return {core, store, ids, labels, lookups, unavailable(value) { unavailable = value; }};
}

for (const key of ['implants', 'clones']) test(`Core resolves ${key === 'implants' ? 'active' : 'jump-clone'} implant names used by the actual pilot display`, async t => {
    const f = await fixture(t, key);
    await f.core.sync(42);
    const data = f.core.snapshots(42)[key].data;
    const names = key === 'implants' ? operationRows(data, f.core.names(), 'implants').map(row => row.name)
        : data.jump_clones[0].implants.map(id => f.core.names()[id] || String(id));
    assert.deepEqual(names, ['Memory implant', 'Intelligence implant']);
    assert.deepEqual(f.lookups, [f.ids], 'Resolve one batch of implant type IDs');
    await f.core.requestSync(42);
    assert.equal(f.lookups.length, 1, 'Known implant names do not repeat lookups on explicit refresh');
});

test('unavailable implant names retain the complete sample and resolve on a later collection', async t => {
    const f = await fixture(t, 'implants'); f.unavailable(true);
    await f.core.sync(42);
    assert.deepEqual(f.core.snapshots(42).implants.data, f.ids);
    assert.equal(f.core.snapshots(42).implants.status, 'ready');
    f.unavailable(false); await f.core.requestSync(42);
    assert.deepEqual(operationRows(f.core.snapshots(42).implants.data, f.core.names(), 'implants').map(row => row.name),
        ['Memory implant', 'Intelligence implant']);
    assert.equal(f.lookups.length, 2);
});

test('concurrent active and jump-clone collection shares one missing-name transport and retains known names', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-shared-implant-names-')), store = openStore(dir), calls = [];
    for (const module of catalog) store.set('module:' + module.id, module.id === 'training');
    store.set('names', {10212: 'Known intelligence implant'});
    const auth = {characters: () => [{id: 42, scopes: ['esi-clones.read_clones.v1', 'esi-clones.read_implants.v1']}], access: async () => 'token'};
    const esi = createESI(store, auth, {fetcher: async (url, options) => {
        const path = new URL(url).pathname; calls.push({path, body: options.body && JSON.parse(options.body)});
        const data = path === '/universe/names' ? [{id: 10208, name: 'Memory implant', category: 'inventory_type'}]
            : path.endsWith('/clones') ? {jump_clones: [{jump_clone_id: 1, implants: [10208, 10212]}, {jump_clone_id: 2, implants: [10208]}]}
            : [10208, 10212];
        return Response.json(data, {headers: {'Cache-Control': 'max-age=600'}});
    }});
    const core = await createCore(store, auth, esi, dir, {noSync: true}); core.quiesce();
    t.after(async () => { await core.close(); await esi.close(); store.close(); await rm(dir, {recursive: true, force: true}); });
    await core.sync(42);
    assert.deepEqual(calls.filter(call => call.path === '/universe/names'), [{path: '/universe/names', body: [10208]}]);
    assert.deepEqual(core.names(), {10208: 'Memory implant', 10212: 'Known intelligence implant'});
    assert.equal(core.snapshots(42).clones.data.jump_clones.length, 2);
    assert.deepEqual(core.snapshots(42).implants.data, [10208, 10212]);
    await core.requestSync(42); await core.sync(42);
    assert.equal(calls.length, 3, 'Two source reads and one missing-name batch; repeat collection uses existing ESI and name caches');
});
