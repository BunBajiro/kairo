import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createUniverseNavigation, WAYPOINT_SCOPE} from '../../server/universe-navigation.mjs';
import {planRoute} from '../../server/universe-routing.mjs';

const systems = [1, 2, 3, 4].map(system_id => ({system_id, name: 'System ' + system_id, space: 'known', security: .5}));
const gates = [1, 2, 3].map(id => ({from_system_id: id, to_system_id: id + 1}));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return {promise, resolve}; };
async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-waypoint-owner-')), store = openStore(dir), calls = [], entered = deferred(), response = deferred();
    let revision = 0;
    const auth = {characters: () => [{id: 42, scopes: [WAYPOINT_SCOPE]}], connectionRevision: () => revision};
    const esi = {mutate: async path => { calls.push(path); if (calls.length === 1) { entered.resolve(); await response.promise; } return {status: 204}; }};
    const nav = createUniverseNavigation(store, auth, esi, {atlas: {systems, gates}, planRoute: (_id, input) => planRoute({systems, gates, ...input})});
    nav.saveItinerary(42, {originId: 1, stops: [4]});
    t.after(async () => { response.resolve(); await nav.close(); store.close(); await rm(dir, {recursive: true, force: true}); });
    return {nav, calls, entered, response, replace: () => { revision++; }};
}

test('reconnecting during a sent waypoint stops remaining old-connection commands and admits a later explicit send', async t => {
    const f = await fixture(t), pending = f.nav.sendWaypoints(42, {replace: true}); await f.entered.promise;
    f.replace(); f.response.resolve(); const result = await pending;
    assert.equal(result.status, 'partial'); assert.equal(result.sent, 1); assert.equal(result.total, 3); assert.equal(result.failedIndex, 1);
    assert.equal(result.uncertain, false, 'The completed first command remains confirmed'); assert.equal(f.calls.length, 1);
    assert.match(result.error, /connection changed/i);
    const current = await f.nav.sendWaypoints(42, {replace: false}); assert.equal(current.status, 'sent'); assert.equal(current.sent, 3); assert.equal(f.calls.length, 4);
});

test('a waypoint batch queued before reconnect cannot execute with the replacement login', async t => {
    const f = await fixture(t), pending = f.nav.sendWaypoints(42, {replace: false}); await f.entered.promise;
    const queued = f.nav.sendWaypoints(42, {replace: true}).catch(error => error); f.replace(); f.response.resolve(); await pending;
    const result = await queued; assert.ok(result instanceof Error); assert.match(result.message, /connection changed/i); assert.equal(f.calls.length, 1);
});

test('same-connection queued waypoint batches remain serial and retain append/replace semantics', async t => {
    const f = await fixture(t), pending = f.nav.sendWaypoints(42, {replace: true}); await f.entered.promise;
    const queued = f.nav.sendWaypoints(42, {replace: false}); f.response.resolve(); const results = await Promise.all([pending, queued]);
    assert.ok(results.every(result => result.status === 'sent' && result.sent === 3)); assert.equal(f.calls.length, 6);
    assert.equal(new URL('http://local' + f.calls[0]).searchParams.get('clear_other_waypoints'), 'true');
    assert.ok(f.calls.slice(1).every(path => new URL('http://local' + path).searchParams.get('clear_other_waypoints') === 'false'));
});
