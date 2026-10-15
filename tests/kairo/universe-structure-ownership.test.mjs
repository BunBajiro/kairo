import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createUniverse} from '../../server/universe.mjs';

const AT = Date.parse('2026-10-13T12:00:00Z'), SYSTEM = 30000001, STRUCTURE = 1000000000001;
const SCOPE = 'esi-universe.read_structures.v1';
const atlas = {metadata: {}, regions: [], constellations: [], gates: [], systems: [{system_id: SYSTEM, name: 'Alpha', space: 'known', security: .5, x: 0, y: 0, z: 0}]};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
const response = name => ({data: {name, solar_system_id: SYSTEM, type_id: 35841}, updatedAt: new Date(AT).toISOString(), expiresAt: new Date(AT + 3600000).toISOString()});
async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-structure-owner-')), store = openStore(dir), requests = [], changes = [];
    let characters = [{id: 42, scopes: [SCOPE]}], revision = 0;
    const auth = {characters: () => characters, connectionRevision: () => revision};
    const esi = {request: (path, options) => { const gate = deferred(); requests.push({...gate, path, options}); return gate.promise; }};
    const service = createUniverse(store, auth, esi, {staticData: atlas, now: () => AT, noSync: true, onChange: id => changes.push(id)});
    t.after(async () => { for (const request of requests) request.resolve(response('Cleanup')); await service.close(); store.close(); await rm(dir, {recursive: true, force: true}); });
    return {service, store, requests, changes, replace: (value = [{id: 42, scopes: [SCOPE]}], bump = true) => { characters = value; if (bump) revision++; }, record: () => store.db.prepare("SELECT body FROM universe_records WHERE character_id=42 AND kind='structure' AND id=?").get(String(STRUCTURE))};
}

test('structure verification shutdown drains the admitted request and rejects new work without publishing', async t => {
    const f = await fixture(t), flight = f.service.verifyStructure(42, STRUCTURE).catch(error => error);
    assert.equal(f.requests.length, 1);
    let stopped = false; const closing = f.service.close().then(() => { stopped = true; });
    await new Promise(resolve => setImmediate(resolve));
    const drainedBeforeResponse = stopped;
    f.requests[0].resolve(response('Old structure')); await flight; await closing;
    assert.equal(drainedBeforeResponse, false, 'Shutdown must retain ownership until structure IO finishes');
    assert.equal(f.record(), undefined, 'Closing service cannot publish a private structure result');
    await assert.rejects(f.service.verifyStructure(42, STRUCTURE), /stopping/);
    assert.equal(f.requests.length, 1);
});

test('structure response cannot publish after the pilot disconnects', async t => {
    const f = await fixture(t), flight = f.service.verifyStructure(42, STRUCTURE);
    const result = flight.catch(error => error); f.replace([]); f.requests[0].resolve(response('Old structure'));
    assert.ok(await result instanceof Error, 'Obsolete verification must not claim current visibility');
    assert.equal(f.record(), undefined);
});

test('replacement connection does not join an obsolete structure verification or inherit its failure cache', async t => {
    const f = await fixture(t), old = f.service.verifyStructure(42, STRUCTURE).catch(error => error);
    f.replace(); const current = f.service.verifyStructure(42, STRUCTURE).catch(error => error);
    const callsAfterReplacement = f.requests.length;
    f.requests[0].reject(Object.assign(new Error('Pilot connection changed during ESI request.'), {status: 409}));
    if (f.requests[1]) f.requests[1].resolve(response('Current structure'));
    const [oldResult, currentResult] = await Promise.all([old, current]);
    assert.equal(callsAfterReplacement, 2, 'Replacement connection owns its own lookup');
    assert.ok(oldResult instanceof Error);
    assert.equal(currentResult.name, 'Current structure'); assert.equal(currentResult.verified, true);
    assert.equal(JSON.parse(f.record().body).name, 'Current structure');
    assert.equal((await f.service.verifyStructure(42, STRUCTURE)).name, 'Current structure');
    assert.equal(f.requests.length, 2, 'Same-connection cache stays bounded');
});

test('same-connection duplicate verification coalesces and current transport failure remains cached', async t => {
    const f = await fixture(t), one = f.service.verifyStructure(42, STRUCTURE), two = f.service.verifyStructure(42, STRUCTURE);
    assert.equal(f.requests.length, 1); f.requests[0].reject(new Error('Temporary outage'));
    const results = await Promise.all([one, two]); assert.ok(results.every(value => value.status === 'error' && value.verified === false));
    assert.equal((await f.service.verifyStructure(42, STRUCTURE)).error, 'Temporary outage'); assert.equal(f.requests.length, 1);
});

test('late obsolete success cannot overwrite current structure or remove its coalescing flight', async t => {
    const f = await fixture(t), old = f.service.verifyStructure(42, STRUCTURE).catch(error => error);
    f.replace(); const current = f.service.verifyStructure(42, STRUCTURE);
    f.requests[0].resolve(response('Obsolete structure')); assert.ok(await old instanceof Error);
    const duplicate = f.service.verifyStructure(42, STRUCTURE); assert.equal(f.requests.length, 2);
    f.requests[1].resolve(response('Replacement structure')); await Promise.all([current, duplicate]);
    assert.equal(JSON.parse(f.record().body).name, 'Replacement structure');
});

test('structure access revoked during IO suppresses publication even without a connection-revision provider', async t => {
    const f = await fixture(t), flight = f.service.verifyStructure(42, STRUCTURE).catch(error => error);
    f.replace([{id: 42, scopes: []}], false); f.requests[0].resolve(response('Revoked structure'));
    assert.ok(await flight instanceof Error); assert.equal(f.record(), undefined);
});
