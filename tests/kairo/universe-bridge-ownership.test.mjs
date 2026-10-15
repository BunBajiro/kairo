import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createUniverseNavigation, BRIDGE_SEARCH_SCOPE} from '../../server/universe-navigation.mjs';

const systems = [1, 2, 3].map(system_id => ({system_id, name: 'System ' + system_id, space: 'known', security: -.1}));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return {promise, resolve}; };
async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-bridge-owner-')), store = openStore(dir), entered = deferred(), release = deferred(), calls = [];
    let revision = 0, fail = false;
    const auth = {characters: () => [{id: 42, scopes: [BRIDGE_SEARCH_SCOPE, 'esi-universe.read_structures.v1']}], connectionRevision: () => revision};
    const esi = {request: async path => {
        const accepted = revision; calls.push({path, revision: accepted});
        if (path.includes('/search?')) return {data: {structure: accepted === 0 ? [1001, 1002] : [1003]}};
        const structure = Number(path.split('/').at(-1));
        if (structure === 1001) { entered.resolve(); await release.promise; }
        if (accepted !== revision) throw new Error('Pilot connection changed during request.');
        if (fail) throw new Error('Temporary lookup failure.');
        return {data: {type_id: 35841, solar_system_id: structure === 1002 ? 2 : 1, name: structure === 1002 ? 'System 2 » System 1' : 'System 1 » System ' + (structure === 1003 ? 3 : 2)}};
    }};
    const nav = createUniverseNavigation(store, auth, esi, {atlas: {systems, gates: []}});
    t.after(async () => { release.resolve(); await nav.close(); store.close(); await rm(dir, {recursive: true, force: true}); });
    return {nav, calls, entered, release, replace: () => { revision++; }, fail: value => { fail = value; }};
}

test('bridge discovery stops after connection replacement without reading remaining old search IDs through the new login', async t => {
    const f = await fixture(t), pending = f.nav.discoverBridges(42).catch(error => error); await f.entered.promise;
    f.replace(); f.release.resolve(); const result = await pending;
    assert.ok(result instanceof Error, 'An old discovery must reject instead of publishing mixed visibility');
    assert.match(result.message, /connection changed/i);
    assert.equal(f.calls.length, 2, 'Only the accepted search and first lookup may run');
    const fresh = await f.nav.discoverBridges(42);
    assert.equal(fresh.valid, true); assert.deepEqual(fresh.links.map(link => link.to_system_id), [3]);
    assert.equal(f.calls.length, 4, 'Explicit retry uses a fresh search and its one visible structure');
});

test('replacement bridge discovery does not join an obsolete same-query flight and close drains both owners', async t => {
    const f = await fixture(t), old = f.nav.discoverBridges(42).catch(error => error); await f.entered.promise;
    f.replace(); const replacement = f.nav.discoverBridges(42).catch(error => error);
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(f.calls.some(call => call.path.includes('/search?') && call.revision === 1), 'Replacement query starts its own search');
    const fresh = await replacement;
    assert.equal(fresh.valid, true); assert.deepEqual(fresh.links.map(link => link.to_system_id), [3], 'Replacement completes while the obsolete lookup is still held');
    let closed = false; const closing = f.nav.close().then(() => { closed = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(closed, false, 'The admitted old request must remain owned until it exits');
    f.release.resolve(); const oldResult = await old; await closing;
    assert.ok(oldResult instanceof Error); assert.match(oldResult.message, /connection changed|stopping/i);
});

test('same-connection bridge requests coalesce, preserve nonauthorizing candidates and recover after lookup failure', async t => {
    const f = await fixture(t), first = f.nav.discoverBridges(42); await f.entered.promise;
    const duplicate = f.nav.discoverBridges(42); f.fail(true); f.release.resolve();
    const [left, right] = await Promise.all([first, duplicate]);
    assert.deepEqual(left, right); assert.equal(left.valid, false); assert.equal(left.links.length, 0); assert.equal(left.issues.length, 2);
    assert.equal(f.calls.length, 3, 'Two callers share one search and its two bounded lookups');
    f.fail(false); const recovered = await f.nav.discoverBridges(42);
    assert.equal(recovered.valid, true); assert.ok(recovered.links.length > 0);
    assert.ok(recovered.links.every(link => link.accessible === false)); assert.equal(f.calls.length, 6);
});
