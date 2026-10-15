import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setImmediate as turn} from 'node:timers/promises';
import {openStore} from '../../server/store.mjs';
import {createAuth} from '../../server/auth.mjs';
import {createESI} from '../../server/esi.mjs';
import {createCore} from '../../server/core.mjs';
import {catalog} from '../../server/modules/catalog.mjs';

async function fixture(t, key, count = 6) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-enrichment-owner-')), store = openStore(dir);
    const scope = key === 'assets' ? 'esi-assets.read_assets.v1' : 'esi-planets.manage_planets.v1';
    const connect = () => store.db.prepare('INSERT OR REPLACE INTO characters(id,name,scopes,tokens,owner,reauth) VALUES(?,?,?,?,?,0)')
        .run(42, 'Pilot', JSON.stringify([scope, 'esi-universe.read_structures.v1']), '{}', 'owner');
    connect();
    for (const module of catalog) store.set('module:' + module.id, module.id === (key === 'assets' ? 'hangar' : 'industry'));
    const auth = createAuth(store, {decrypt: JSON.parse}, {origin: 'http://127.0.0.1:4380', fetcher: async () => { throw Error('No SSO fetch expected'); }});
    auth.access = async () => 'token-' + auth.connectionRevision(42);
    const values = Array.from({length: count}, (_, i) => key === 'assets'
        ? {item_id: i + 1, location_id: 1000000000001 + i, type_id: 34, quantity: 1}
        : {planet_id: 40000001 + i});
    store.set('names', {34: 'Mineral'});
    const admitted = Promise.withResolvers(), gates = [], calls = [], events = [];
    let blocked = true, core;
    const response = data => Response.json(data, {headers: {'Cache-Control': 'max-age=600'}});
    const esi = createESI(store, auth, {fetcher: async (url, options) => {
        const path = new URL(url).pathname;
        if (path === '/characters/42/' + key) return response(values);
        if (path === '/universe/names') return response([]);
        const gate = Promise.withResolvers(); gates.push(gate);
        calls.push({path, authorization: options.headers.Authorization});
        if (calls.length === 4) admitted.resolve();
        if (blocked) await gate.promise;
        return response(key === 'assets' ? {name: 'Structure ' + path.split('/').at(-1)} : {pins: []});
    }});
    const release = () => { blocked = false; for (const gate of gates) gate.resolve(); };
    t.after(async () => { release(); await core?.close(); await esi.close(); store.close(); await rm(dir, {recursive: true, force: true}); });
    core = await createCore(store, auth, esi, dir, {noSync: true}); core.quiesce();
    core.bus.on('data.' + key, event => events.push(event));
    const readCharacters = auth.characters; let rosterReads = 0;
    auth.characters = () => { rosterReads++; return readCharacters(); };
    return {store, core, auth, esi, connect, calls, events, admitted, release, rosterReads: () => rosterReads,
        failFirst() { gates[0].reject(Error('Old transport failed')); }};
}

for (const key of ['assets', 'planets']) {
    test(`pending ${key} enrichment cannot admit remaining private reads through a replacement connection`, async t => {
        const f = await fixture(t, key), work = f.core.sync(42);
        await f.admitted.promise;
        const originalRevision = f.auth.connectionRevision(42);
        await f.auth.disconnect(42); f.connect();
        assert.notEqual(f.auth.connectionRevision(42), originalRevision);
        f.release(); await work;
        assert.equal(f.calls.length, 4, 'The old collection must stop before dispatching the two remaining private reads');
        if (key === 'assets') assert.deepEqual(f.core.names(), {34: 'Mineral'}, 'An obsolete asset collection cannot publish replacement private structure names');
        assert.equal(f.store.snapshot(42, key), null);
        assert.equal(f.events.length, 0);
        await f.core.requestSync(42);
        assert.equal(f.store.snapshot(42, key).status, 'ready');
        assert.equal(f.events.length, 1);
        assert.equal(f.calls.length, 10, 'Explicit retry collects each of the six details exactly once for the replacement');
        assert.equal(f.esi.health().active, 0); assert.equal(f.esi.health().queued, 0);
    });

    test(`failed obsolete ${key} detail drains its accepted siblings during Core close`, async t => {
        const f = await fixture(t, key), work = f.core.sync(42);
        await f.admitted.promise;
        await f.auth.disconnect(42); f.connect();
        let closed = false;
        const closing = f.core.close().then(() => { closed = true; });
        f.failFirst(); await turn();
        assert.equal(closed, false, 'The other three accepted requests are still owned');
        assert.equal(f.calls.length, 4);
        f.release(); await work; await closing;
        assert.equal(closed, true); assert.equal(f.calls.length, 4);
        assert.equal(f.store.snapshot(42, key), null); assert.equal(f.events.length, 0);
        assert.equal(f.esi.health().active, 0); assert.equal(f.esi.health().queued, 0);
    });

    test(`ordinary token rotation keeps accepted ${key} enrichment and its bounded worker pool`, async t => {
        const f = await fixture(t, key), work = f.core.sync(42);
        await f.admitted.promise;
        f.store.db.prepare('UPDATE characters SET tokens=? WHERE id=42').run('{"rotated":true}');
        f.release(); await work;
        assert.equal(f.calls.length, 6);
        assert.equal(f.store.snapshot(42, key).status, 'ready');
        assert.equal(f.store.snapshot(42, key).data.length, 6);
        assert.equal(f.events.length, 1);
        assert.equal(f.esi.health().active, 0); assert.equal(f.esi.health().queued, 0);
    });

    test(`${key} composite connection checks do not reread the roster per detail`, async t => {
        const small = await fixture(t, key, 4), large = await fixture(t, key, key === 'assets' ? 64 : 6);
        for (const f of [small, large]) {
            const work = f.core.sync(42); await f.admitted.promise; f.release(); await work;
            assert.equal(f.store.snapshot(42, key).status, 'ready');
        }
        assert.equal(small.calls.length, 4);
        assert.equal(large.calls.length, key === 'assets' ? 64 : 6);
        assert.equal(large.rosterReads(), small.rosterReads(), 'Only existing enclosing access checks read the roster');
        assert.ok(small.rosterReads() < 10, 'The fixed number of enclosing checks remains bounded');
    });
}
