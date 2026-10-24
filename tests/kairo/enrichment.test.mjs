import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setImmediate as turn} from 'node:timers/promises';
import {mapEnrichment} from '../../server/enrichment.mjs';
import {enrichAssetLocations} from '../../server/asset-locations.mjs';
import {createCore} from '../../server/core.mjs';
import {createESI} from '../../server/esi.mjs';
import {openStore} from '../../server/store.mjs';
import {catalog} from '../../server/modules/catalog.mjs';

const response = data => Response.json(data, {headers: {'Cache-Control': 'max-age=600'}});
const assets = locations => locations.map((location_id, index) => ({item_id: index + 1, location_id}));

test('enrichment bounds accepted workers and preserves input order across reversed completions', async () => {
    const pending = Array.from({length: 9}, () => Promise.withResolvers()), started = [];
    let active = 0, maximum = 0;
    const work = mapEnrichment(pending, async (gate, index) => {
        started.push(index); maximum = Math.max(maximum, ++active);
        await gate.promise; active--; return index * 2;
    });
    assert.deepEqual(started, [0, 1, 2, 3]);
    pending[3].resolve(); await turn(); assert.deepEqual(started, [0, 1, 2, 3, 4]);
    pending[2].resolve(); await turn(); assert.equal(started.length, 6);
    for (const gate of pending) gate.resolve();
    assert.deepEqual(await work, [0, 2, 4, 6, 8, 10, 12, 14, 16]);
    assert.equal(maximum, 4); assert.equal(active, 0);
    assert.deepEqual(await mapEnrichment([], () => assert.fail('Empty input invoked work')), []);
});

test('unexpected worker rejection stops further admission and drains accepted siblings before failing', async () => {
    const gates = Array.from({length: 8}, () => Promise.withResolvers()), started = [], finished = [];
    const failure = new Error('Unexpected enrichment failure'); let settled = false;
    const work = mapEnrichment(gates, async (gate, index) => { started.push(index); await gate.promise; finished.push(index); });
    const rejected = assert.rejects(work, error => error === failure).then(() => { settled = true; });
    gates[1].reject(failure); await turn();
    assert.deepEqual(started, [0, 1, 2, 3]); assert.equal(settled, false);
    gates[2].resolve(); gates[3].resolve(); await turn();
    assert.equal(settled, false); assert.deepEqual(started, [0, 1, 2, 3]);
    gates[0].resolve(); await rejected;
    assert.deepEqual(finished.sort(), [0, 2, 3]); assert.equal(settled, true);
});

test('asset enrichment retains denied, rate-limited and aborted rows and rechecks newly learned names', async () => {
    const locations = Array.from({length: 6}, (_, index) => 60000001 + index), names = {}, calls = [];
    const gates = Array.from({length: 4}, () => Promise.withResolvers());
    const input = assets(locations), original = structuredClone(input);
    const work = enrichAssetLocations(input, {names, rememberNames: values => Object.assign(names, values), characterId: 42,
        esi: {names: async () => ({}), request: async path => {
            const index = locations.indexOf(Number(path.split('/').at(-1))); calls.push(index);
            if (index < 4) await gates[index].promise;
            if (index === 1) throw Object.assign(new Error('Denied'), {status: 403});
            if (index === 2) throw Object.assign(new Error('Limited'), {status: 429});
            if (index === 3) throw new DOMException('Cancelled transport', 'AbortError');
            return {data: {name: 'Station ' + index}};
        }}});
    await turn(); assert.deepEqual(calls, [0, 1, 2, 3]);
    names[locations[4]] = 'Learned concurrently';
    for (const gate of gates) gate.resolve();
    const result = await work;
    assert.deepEqual(calls, [0, 1, 2, 3, 5]); assert.deepEqual(input, original);
    assert.deepEqual(result.map(row => row.location_name), ['Station 0', String(locations[1]), String(locations[2]), String(locations[3]), 'Learned concurrently', 'Station 5']);
});

async function storeFixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-enrichment-')), store = openStore(dir);
    let cleanup = async () => {};
    t.after(async () => { try { await cleanup(); } finally { store.close(); await rm(dir, {recursive: true, force: true}); } });
    return {dir, store, onCleanup: work => { cleanup = work; }};
}

test('two enrichment pools retain global ESI capacity, priority, coalescing, warm cache and private pilot keys', async t => {
    const {store, onCleanup} = await storeFixture(t), calls = [], gates = [];
    let active = 0, maximum = 0, releaseAll = false;
    const esi = createESI(store, {access: async id => 'token-' + id}, {fetcher: async (url, options) => {
        const path = new URL(url).pathname, gate = Promise.withResolvers(); gates.push(gate);
        calls.push({path, authorization: options.headers.Authorization}); maximum = Math.max(maximum, ++active);
        if (!releaseAll) await gate.promise;
        active--; return response({name: options.headers.Authorization || path});
    }});
    onCleanup(async () => { releaseAll = true; for (const gate of gates) gate.resolve(); await esi.close(); });
    const input = assets(Array.from({length: 8}, (_, index) => 1000000000001 + index));
    function enrich(characterId) { const names = {}; return enrichAssetLocations(input, {names, rememberNames: values => Object.assign(names, values), esi, characterId, canReadStructures: true}); }
    const first = enrich(42), second = enrich(42); await turn();
    assert.equal(calls.length, 4); assert.equal(esi.health().coalesced, 4);
    const ordinary = esi.request('/ordinary'), priority = esi.request('/protection', {priority: true});
    await turn(); gates[0].resolve(); await turn();
    assert.equal(calls[4].path, '/protection', 'Protection wins the next global slot');
    releaseAll = true; for (const gate of gates) gate.resolve();
    const [a, b] = await Promise.all([first, second, ordinary, priority]);
    assert.deepEqual(a, b); assert.ok(a.every(row => row.location_name === 'Bearer token-42'));
    assert.equal(maximum, 4); assert.equal(esi.health().active, 0); assert.equal(esi.health().queued, 0);
    const before = calls.length; assert.deepEqual(await enrich(42), a); assert.equal(calls.length, before);
    const other = await enrich(43);
    assert.ok(other.every(row => row.location_name === 'Bearer token-43'));
    assert.equal(calls.length - before, 8); assert.deepEqual(esi.cachedNames(input.map(row => row.location_id)), {});
});

test('real ESI cooldown stops later enrichment requests while retaining successful accepted siblings', async t => {
    const {store, onCleanup} = await storeFixture(t), calls = [], gates = [];
    const locations = Array.from({length: 9}, (_, index) => 1000000000001 + index), names = {};
    let releaseAll = false;
    const esi = createESI(store, {access: async () => 'token'}, {fetcher: async url => {
        const location = Number(new URL(url).pathname.split('/').at(-1)), gate = Promise.withResolvers(); gates.push(gate); calls.push(location);
        if (!releaseAll) await gate.promise;
        return location === locations[0] ? Response.json({}, {status: 429, headers: {'Retry-After': '60'}}) : response({name: 'Structure ' + location});
    }});
    onCleanup(async () => { releaseAll = true; for (const gate of gates) gate.resolve(); await esi.close(); });
    const result = enrichAssetLocations(assets(locations), {names, rememberNames: values => Object.assign(names, values), esi, characterId: 42, canReadStructures: true});
    await turn(); assert.deepEqual(calls, locations.slice(0, 4));
    gates[0].resolve(); await turn(); releaseAll = true; for (const gate of gates) gate.resolve();
    const rows = await result;
    assert.deepEqual(calls, locations.slice(0, 4)); assert.equal(rows.length, 9);
    assert.deepEqual(rows.map(row => row.location_name), locations.map((location, index) => index > 0 && index < 4 ? 'Structure ' + location : String(location)));
    assert.equal(esi.health().active, 0); assert.equal(esi.health().queued, 0);
});

for (const key of ['assets', 'planets']) test(`Core drains all accepted ${key} enrichment and nested publication before close`, async t => {
    const {dir, store, onCleanup} = await storeFixture(t), gates = [], started = [];
    const values = key === 'assets' ? assets(Array.from({length: 7}, (_, index) => 60000001 + index)) : Array.from({length: 7}, (_, index) => ({planet_id: 40000001 + index}));
    const character = {id: 42, scopes: [key === 'assets' ? 'esi-assets.read_assets.v1' : 'esi-planets.manage_planets.v1']};
    const auth = {characters: () => [character], access: async () => 'token'};
    for (const module of catalog) store.set('module:' + module.id, module.id === (key === 'assets' ? 'hangar' : 'industry'));
    let releaseAll = false, core;
    const esi = createESI(store, auth, {fetcher: async (url, options) => {
        const path = new URL(url).pathname;
        if (path === '/characters/42/' + key) return response(values);
        if (path === '/universe/names') return response([]);
        const id = Number(path.split('/').at(-1)), gate = Promise.withResolvers(); gates.push(gate); started.push(id);
        if (!releaseAll) await gate.promise;
        // Preserve an item-specific denial while successful siblings complete.
        return id === (key === 'assets' ? 60000002 : 40000002) ? Response.json({}, {status: 403}) : response(key === 'assets' ? {name: 'Station ' + id} : {pins: [{pin_id: id}]});
    }});
    const nested = Promise.withResolvers();
    onCleanup(async () => { releaseAll = true; for (const gate of gates) gate.resolve(); nested.resolve(); await core?.close(); await esi.close(); });
    core = await createCore(store, auth, esi, dir, {noSync: true});
    core.bus.on('data.' + key, async event => { await nested.promise; store.set('enrichment-drained', event.payload.current.length); });
    const work = core.sync(42);
    for (let count = 0; count < 20 && started.length < 4; count++) await turn();
    assert.equal(started.length, 4);
    let closed = false; const closing = core.close().then(() => { closed = true; });
    await turn(); assert.equal(closed, false);
    releaseAll = true; for (const gate of gates) gate.resolve(); await work; await turn();
    assert.equal(started.length, 7); assert.equal(closed, false, 'Nested semantic publication is still accepted');
    const snapshot = store.snapshot(42, key);
    assert.equal(snapshot.status, 'ready'); assert.equal(snapshot.data.length, 7);
    if (key === 'assets') assert.deepEqual(snapshot.data.map(row => row.location_name), values.map((row, index) => index === 1 ? String(row.location_id) : 'Station ' + row.location_id));
    else assert.deepEqual(snapshot.data, values.map((row, index) => index === 1 ? row : {...row, details: {pins: [{pin_id: row.planet_id}]}}));
    nested.resolve(); await closing;
    assert.equal(store.get('enrichment-drained'), 7); assert.equal(core.health().events.pending, 0); assert.equal(esi.health().active, 0);
});
