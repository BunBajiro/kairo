import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createUniverseOperations} from '../../server/universe-operations.mjs';

const AT = Date.parse('2026-10-13T12:00:00Z'), SYSTEM = 30000001, SCOPE = 'esi-fleets.read_fleet.v1';
const atlas = {gates: [], systems: [{system_id: SYSTEM, name: 'Alpha', space: 'known'}]};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
const sample = data => ({status: 'ready', data, updatedAt: new Date(AT).toISOString(), expiresAt: new Date(AT + 3600000).toISOString()});
async function fixture(t, esi) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-fleet-owner-')), store = openStore(dir), changes = [];
    let revision = 0, at = AT;
    const characters = [{id: 42, scopes: [SCOPE]}], auth = {characters: () => characters, connectionRevision: () => revision};
    const service = createUniverseOperations(store, auth, esi, {atlas, now: () => at, noSync: true, onChange: id => changes.push(id)});
    service.saveConfig(42, {...service.config(42), fleet_enabled: true});
    t.after(async () => { await service.close(); store.close(); await rm(dir, {recursive: true, force: true}); });
    return {service, store, changes, characters, advance: () => { at += 60001; }, replace: () => { revision++; store.db.prepare('DELETE FROM snapshots WHERE character_id=42').run(); }};
}

test('delayed public fleet-name enrichment cannot restore old private roster after reconnect', async t => {
    const names = deferred(), started = deferred(), paths = [];
    const f = await fixture(t, {request: async path => { paths.push(path); return sample(path.startsWith('/characters/') ? {fleet_id: 123, role: 'fleet_commander'} : [{character_id: 99, solar_system_id: SYSTEM, ship_type_id: 587}]); }, names: async () => { started.resolve(); return names.promise; }});
    const old = f.service.refreshFleet(42); await started.promise; f.replace(); names.resolve({99: 'Old fleet member', 587: 'Rifter'}); await old;
    assert.equal(f.store.snapshot(42, 'universe_fleet'), null, 'A public enrichment await cannot retain private connection ownership');
    assert.equal(f.service.state(42).fleet.status, 'waiting'); assert.equal(paths.length, 2);
});

test('obsolete fleet request failure cannot resurrect previous roster or throttle replacement refresh', async t => {
    let phase = 'ready'; const gate = deferred(), started = deferred(); const paths = [];
    const f = await fixture(t, {request: async path => { paths.push(path); if (phase === 'pending') { started.resolve(); return gate.promise; } return sample(path.startsWith('/characters/') ? {fleet_id: phase === 'replacement' ? 456 : 123, role: 'fleet_commander'} : [{character_id: phase === 'replacement' ? 100 : 99, solar_system_id: SYSTEM}]); }});
    await f.service.refreshFleet(42); assert.equal(f.store.snapshot(42, 'universe_fleet').data.members[0].character_id, 99);
    f.advance(); phase = 'pending'; const old = f.service.refreshFleet(42); await started.promise; f.replace(); phase = 'replacement';
    gate.reject(Object.assign(new Error('Pilot connection changed during ESI request.'), {status: 409})); await old;
    assert.equal(f.store.snapshot(42, 'universe_fleet'), null, 'Old failure must not recreate the deleted last-good snapshot');
    await f.service.refreshFleet(42); assert.equal(f.service.state(42).fleet.fleet_id, 456); assert.equal(f.service.state(42).fleet.members[0].character_id, 100);
    assert.equal(paths.length, 5, 'Replacement can collect immediately without extra same-connection polling');
    await f.service.refreshFleet(42); assert.equal(paths.length, 5);
});

test('same-connection names enrichment and refresh coalescing retain a single bounded collection', async t => {
    const gate = deferred(), started = deferred(), paths = [];
    const f = await fixture(t, {request: async path => { paths.push(path); return sample(path.startsWith('/characters/') ? {fleet_id: 123, role: 'fleet_commander'} : [{character_id: 99, solar_system_id: SYSTEM}]); }, names: async () => { started.resolve(); return gate.promise; }});
    const first = f.service.refreshFleet(42); await started.promise; const second = f.service.refreshFleet(42); gate.resolve({99: 'Current fleet member'}); await Promise.all([first, second]);
    assert.equal(f.service.state(42).fleet.members[0].name, 'Current fleet member'); assert.equal(paths.length, 2);
    await f.service.refreshFleet(42); assert.equal(paths.length, 2);
});

test('replacement refresh waiting on old enrichment collects its own fleet once the prior collector drains', async t => {
    const gate = deferred(), started = deferred(), paths = []; let replacement = false;
    const f = await fixture(t, {request: async path => { paths.push(path); return sample(path.startsWith('/characters/') ? {fleet_id: replacement ? 456 : 123, role: 'fleet_commander'} : [{character_id: replacement ? 100 : 99, solar_system_id: SYSTEM}]); }, names: async () => { if (replacement) return {100: 'New member'}; started.resolve(); return gate.promise; }});
    const old = f.service.refreshFleet(42); await started.promise; f.replace(); replacement = true;
    const current = f.service.refreshFleet(42), duplicate = f.service.refreshFleet(42); gate.resolve({99: 'Old member'});
    await Promise.all([old, current, duplicate]);
    assert.equal(f.service.state(42).fleet.fleet_id, 456); assert.equal(f.service.state(42).fleet.members[0].name, 'New member');
    assert.equal(paths.length, 4, 'One collection each for old and replacement connections');
});

test('revoked fleet access after membership response stops roster and public-name requests', async t => {
    const gate = deferred(), paths = []; let names = 0;
    const f = await fixture(t, {request: path => { paths.push(path); return gate.promise; }, names: async () => { names++; return {}; }});
    const pending = f.service.refreshFleet(42); f.characters[0].scopes = []; gate.resolve(sample({fleet_id: 123, role: 'fleet_commander'})); await pending;
    assert.equal(paths.length, 1); assert.equal(names, 0); assert.equal(f.store.snapshot(42, 'universe_fleet'), null);
    assert.equal(f.service.state(42).fleet.status, 'missing_scope');
});
