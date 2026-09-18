import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../server/store.mjs';
import { createUniverse, sourceMetadata, standingForAlliance } from '../../server/universe.mjs';
import { savePlaceNote } from '../../server/places.mjs';

const AT = Date.parse('2026-09-18T18:00:00.000Z');
const A = 30000001, B = 30000002, C = 30000003, W = 31000001;
const sample = (data, extra = {}) => ({ status: 'ready', data, updatedAt: new Date(AT).toISOString(), expiresAt: new Date(AT + 3600000).toISOString(), ...extra });
const atlas = {
    metadata: { source: 'test fixture' }, regions: [], constellations: [],
    systems: [
        { system_id: A, name: 'Alpha', x: 0, y: 0, z: 0, security: -.2, space: 'known', region_id: 10000001, constellation_id: 20000001 },
        { system_id: B, name: 'Beta', x: 9.46e15, y: 0, z: 0, security: -.1, space: 'known', region_id: 10000001, constellation_id: 20000001 },
        { system_id: C, name: 'Gamma', x: 18.92e15, y: 0, z: 0, security: -.1, space: 'known', region_id: 10000001, constellation_id: 20000001 },
        { system_id: W, name: 'J000001', x: 1e20, y: 1e20, z: 1e20, security: -1, space: 'wormhole', region_id: 11000001, constellation_id: 21000001 },
    ], gates: [{ from_system_id: A, to_system_id: B }],
};
async function fixture(t, overrides = {}) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-universe-')), store = openStore(dir);
    const auth = { characters: () => [{ id: 42, scopes: ['esi-universe.read_structures.v1'] }, { id: 43, scopes: ['esi-universe.read_structures.v1'] }] };
    let clock = AT;
    t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
    for (const key of ['sovereignty', 'kills', 'jumps', 'fw', 'incursions', 'industry_systems', 'sovereignty_structures']) store.saveSnapshot(0, key, sample([]));
    for (const id of [42, 43]) {
        store.saveSnapshot(id, 'profile', sample({ corporation_id: 98, alliance_id: 99 }));
        store.saveSnapshot(id, 'contacts', sample([]));
        store.saveSnapshot(id, 'corporation_contacts', sample([], { ownerId: 98 }));
        store.saveSnapshot(id, 'alliance_contacts', sample([], { ownerId: 99 }));
        store.saveSnapshot(id, 'calendar', sample([])); store.saveSnapshot(id, 'mining', sample([]));
    }
    const service = createUniverse(store, auth, overrides.esi || {}, { staticData: atlas, now: () => clock });
    return { store, auth, service, time: value => { clock = value; } };
}
const contacts = value => [{ contact_id: 777, contact_type: 'alliance', standing: value }];
const standings = () => ({ profile: sample({ corporation_id: 98, alliance_id: 99 }), contacts: sample([]), corporation_contacts: sample([], { ownerId: 98 }), alliance_contacts: sample([], { ownerId: 99 }) });

test('standings preserve own alliance, personal precedence, explicit neutral and unavailable evidence', () => {
    const inputs = standings();
    assert.equal(standingForAlliance(99, inputs, AT).source, 'own_alliance');
    inputs.alliance_contacts.data = contacts(10); assert.equal(standingForAlliance(777, inputs, AT).value, 10);
    inputs.corporation_contacts.data = contacts(-5); assert.equal(standingForAlliance(777, inputs, AT).source, 'corporation');
    inputs.contacts.data = contacts(0); assert.equal(standingForAlliance(777, inputs, AT).label, 'neutral');
    inputs.contacts.expiresAt = new Date(AT - 1).toISOString();
    assert.equal(standingForAlliance(777, inputs, AT).label, 'unknown');
    inputs.contacts = { status: 'missing_scope', data: null };
    assert.equal(standingForAlliance(777, inputs, AT).value, -5);
    inputs.corporation_contacts.ownerId = 123; assert.equal(standingForAlliance(777, inputs, AT).value, null);
    for (const key of ['contacts', 'corporation_contacts', 'alliance_contacts']) inputs[key] = { status: 'missing_scope', data: null };
    assert.equal(standingForAlliance(777, inputs, AT).label, 'unknown');
});

test('freshness rejects expired, future and partial snapshots', () => {
    assert.equal(sourceMetadata(sample([]), AT).status, 'ready');
    for (const extra of [{ expiresAt: new Date(AT - 1).toISOString() }, { updatedAt: new Date(AT + 60000).toISOString() }, { truncated: true }])
        assert.equal(sourceMetadata(sample([], extra), AT).status, 'stale');
    assert.equal(sourceMetadata(null, AT).status, 'waiting');
});

test('live map sources include real activity, incursions, indices, structures, visits and honest missing data', async t => {
    const { store, service } = await fixture(t);
    store.set('names', { 777: 'Known alliance' });
    store.saveSnapshot(0, 'sovereignty', sample([{ system_id: A, alliance_id: 777 }]));
    store.saveSnapshot(42, 'contacts', sample(contacts(5)));
    store.saveSnapshot(0, 'kills', sample([{ system_id: A, ship_kills: 4, pod_kills: 2, npc_kills: 123 }]));
    store.saveSnapshot(0, 'jumps', { status: 'error', data: null, error: 'ESI unavailable' });
    store.saveSnapshot(0, 'incursions', sample([{ infested_solar_systems: [A], state: 'established' }]));
    store.saveSnapshot(0, 'industry_systems', sample([{ solar_system_id: A, cost_indices: [{ activity: 'manufacturing', cost_index: .1 }] }]));
    store.saveSnapshot(0, 'sovereignty_structures', sample([{ solar_system_id: A, structure_id: 1000000000001, alliance_id: 777 }]));
    store.saveSnapshot(42, 'mining', sample([{ solar_system_id: A, quantity: 20, date: '2026-09-17' }, { solar_system_id: A, quantity: 8, date: '2026-09-18' }]));
    store.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(42, A, 'Alpha', new Date(AT).toISOString());
    savePlaceNote(store, 'system', A, { body: 'Our shared staging note', tags: ['home'] });
    const state = service.state(42), row = state.systems.find(row => row.system_id === A);
    assert.equal(row.sovereignty.alliance_name, 'Known alliance'); assert.equal(row.standing.label, 'good');
    assert.equal(row.kills.ship_kills, 4); assert.equal(row.jumps, null); assert.equal(state.defaults.jumps, null);
    assert.equal(row.incursions[0].state, 'established'); assert.equal(row.industry[0].cost_index, .1);
    assert.equal(row.structures.length, 1); assert.equal(row.visits, 1); assert.equal(row.note.body, 'Our shared staging note');
    assert.equal(row.mining.quantity, 28); assert.equal(state.sources.jumps.error, 'ESI unavailable');
    store.set('module:universe', false);
    const disabled = service.state(42); assert.equal(disabled.sources.kills.status, 'disabled');
    assert.equal(disabled.systems.find(row => row.system_id === A).kills, null);
    assert.equal(service.state(0).sources.contacts.status, 'disconnected');
    assert.throws(() => service.state(999), /connected pilot/);
    assert.throws(() => service.state(NaN), /connected pilot/);
});

test('private saved views and pins survive service recreation and cannot be edited by another pilot', async t => {
    const { store, auth, service } = await fixture(t);
    const view = service.saveView(42, { name: 'Home', config: { layers: ['standings'], regionId: 10000001 } });
    const pin = service.savePin(42, { system_id: A, label: 'Home', body: 'Keep this note' });
    assert.equal(service.state(43).views.length, 0); assert.equal(service.state(43).pins.length, 0);
    assert.throws(() => service.saveView(43, { id: view.id, name: 'Hijack' }), /not found/);
    assert.throws(() => service.deletePin(43, pin.id), /not found/);
    const reopened = createUniverse(store, auth, {}, { staticData: atlas, now: () => AT });
    assert.equal(reopened.state(42).views[0].config.regionId, 10000001);
    assert.equal(reopened.state(42).pins[0].body, 'Keep this note');
    assert.equal(reopened.exportUserData(42).records.length, 2);
    assert.equal(reopened.exportUserData(43).records.length, 0);
    assert.equal(reopened.saveView(0, { name: 'Local map', config: {} }).name, 'Local map');
});

test('Ansiblex list import is atomic, explicitly accessible, directional and isolated', async t => {
    const { service } = await fixture(t);
    const list = service.saveLinkList(42, { name: 'Alliance network', text: 'From,To,Structure ID\nAlpha,Gamma,1000000000001' });
    assert.equal(list.imported, 1); assert.equal(list.links[0].active, false);
    service.saveLink(42, { id: list.links[0].id, accessible: true });
    assert.equal(service.route(42, { originId: A, destinationId: C, preferences: { useAnsiblex: true } }).status, 'ok');
    assert.equal(service.route(43, { originId: A, destinationId: C, preferences: { useAnsiblex: true } }).status, 'no_route');
    assert.throws(() => service.saveLinkList(42, { id: list.id, links: [{ from: 'Alpha', to: 'Unknown' }] }), /bundled universe/);
    assert.equal(service.state(42).links.length, 1);
    service.saveLinkList(42, { id: list.id, enabled: false });
    assert.equal(service.route(42, { originId: A, destinationId: C, preferences: { useAnsiblex: true } }).status, 'no_route');
    const directed = service.saveLinkList(42, { name: 'Directional network', links: [
        { from: 'Alpha', to: 'Gamma', directional: true, accessible: true, owner_alliance_id: 5 },
        { from: 'Gamma', to: 'Alpha', directional: true, accessible: true, owner_alliance_id: 6 },
    ] });
    assert.equal(directed.imported, 2);
    service.deleteLinkList(42, directed.id); assert.equal(service.state(42).links.length, 1);
    service.deleteLinkList(42, list.id); assert.equal(service.state(42).links.length, 0);
});

test('wormholes default to sixteen hours, expire exactly, and prune keeps durable pins and notes', async t => {
    const { service, store, time } = await fixture(t);
    const wormhole = service.saveLink(42, { kind: 'wormhole', from_system_id: A, to_system_id: W });
    assert.equal(Date.parse(wormhole.expires_at) - AT, 16 * 3600000);
    const request = { originId: A, destinationId: W, preferences: { useWormholes: true } };
    assert.equal(service.route(42, request).status, 'ok');
    service.savePin(42, { system_id: W, body: 'Permanent system note' });
    savePlaceNote(store, 'system', W, { body: 'Keep across collapsed connections' });
    time(AT + 16 * 3600000);
    assert.equal(service.state(42).links[0].expired, true); assert.equal(service.route(42, request).status, 'no_route');
    assert.equal(service.pruneExpired(42).deleted, 1); assert.equal(service.state(42).pins.length, 1);
    assert.equal((await service.detail(42, W)).notes.system.body, 'Keep across collapsed connections');
    assert.throws(() => service.saveLink(42, { kind: 'wormhole', from: 'Alpha', to: 'J000001', duration_hours: 7 }), /lifetime/);
});

test('observed travel creates only unconfirmed J-space candidates and never routes visit history', async t => {
    const { service, store } = await fixture(t);
    const before = sample({ solar_system_id: A }, { updatedAt: new Date(AT - 15000).toISOString() });
    assert.equal(service.observeTravel(42, before, sample({ solar_system_id: C })), null);
    assert.equal(service.observeTravel(42, { ...before, updatedAt: new Date(AT - 120000).toISOString() }, sample({ solar_system_id: W })), null);
    assert.equal(service.observeTravel(42, before, sample({ solar_system_id: W, station_id: 123 })), null);
    store.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(42, A, 'Alpha', new Date(AT - 15000).toISOString());
    store.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(42, C, 'Gamma', new Date(AT).toISOString());
    assert.equal(service.route(42, { originId: A, destinationId: C }).status, 'no_route');
    const link = service.observeTravel(42, before, sample({ solar_system_id: W }));
    assert.equal(link.source, 'travel'); assert.equal(link.confirmed, false);
    const route = { originId: A, destinationId: W, preferences: { useWormholes: true } };
    assert.equal(service.route(42, route).status, 'no_route');
    assert.equal(service.observeTravel(42, before, sample({ solar_system_id: W })).id, link.id);
    service.saveLink(42, { id: link.id, confirmed: true, accessible: true }); assert.equal(service.route(42, route).status, 'ok');
});

test('structure verification coalesces requests and caches successes and failures separately for each pilot', async t => {
    const calls = [];
    const esi = { request: async (path, options) => {
        calls.push({ path, options });
        if (options.characterId === 43) throw Object.assign(new Error('Structure is not visible to this pilot.'), { status: 403 });
        return sample({ name: 'Alpha gate', owner_id: 98, solar_system_id: A, type_id: 35841 });
    } };
    const { service, time } = await fixture(t, { esi });
    const [one, two] = await Promise.all([service.verifyStructure(42, 1000000000001), service.verifyStructure(42, 1000000000001)]);
    assert.equal(one.verified, true); assert.equal(two.name, 'Alpha gate'); assert.equal(calls.length, 1);
    await service.verifyStructure(42, 1000000000001); assert.equal(calls.length, 1);
    const denied = await service.verifyStructure(43, 1000000000001); assert.equal(denied.verified, false); assert.equal(denied.status, 'error');
    await service.verifyStructure(43, 1000000000001); assert.equal(calls.length, 2);
    assert.equal(service.state(43).structures[0].name, undefined);
    time(AT + 3600001); assert.equal(service.state(42).structures[0].verified, false);
    await assert.rejects(service.verifyStructure(0, 1000000000001), /scope/);
});

test('calendar moon mapping takes the selected pilot event title and time, while manual EVE time is UTC', async t => {
    const { service, store } = await fixture(t);
    store.saveSnapshot(42, 'calendar', sample([{ event_id: 7, title: 'Corporation moon extraction', event_date: '2026-09-19T20:00:00+02:00' },
        { event_id: 8, title: 'Yesterday', event_date: '2026-09-17T18:00:00Z' }]));
    assert.equal(service.state(42).calendar.length, 1); assert.equal(service.state(43).calendar.length, 0);
    const moon = service.savePin(42, { system_id: A, event_id: 7, event_kind: 'moon', event_at: '2030-01-01T00:00:00Z', label: 'Override' });
    assert.equal(moon.event_at, '2026-09-19T18:00:00.000Z'); assert.equal(moon.label, 'Corporation moon extraction'); assert.equal(moon.source, 'calendar');
    assert.throws(() => service.savePin(43, { system_id: A, event_id: 7, event_kind: 'moon' }), /unavailable/);
    const manual = service.savePin(42, { system_id: B, event_kind: 'moon', event_at: '2026-09-19T20:30' });
    assert.equal(manual.event_at, '2026-09-19T20:30:00.000Z'); assert.equal(manual.source, 'manual');
    const detail = await service.detail(42, A); assert.equal(detail.events[0].source, 'calendar');
    store.saveSnapshot(42, 'calendar', sample([{ event_id: 7, title: 'Moon extraction rescheduled', event_date: '2026-09-20T19:00:00Z' }]));
    assert.equal(service.state(42).pins.find(pin => pin.id === moon.id).event_at, '2026-09-20T19:00:00.000Z');
    store.saveSnapshot(42, 'calendar', { status: 'missing_scope', data: null });
    assert.equal(service.state(42).calendar.length, 0); assert.equal(service.state(42).pins.find(pin => pin.id === moon.id).event_at, '2026-09-20T19:00:00.000Z');
    assert.equal(service.state(42).pins.find(pin => pin.id === moon.id).source_status, 'missing_scope');
});

test('route and physical jump use server pilot standings and reject client evidence overrides', async t => {
    const { service, store } = await fixture(t);
    store.saveSnapshot(0, 'sovereignty', sample([{ system_id: B, alliance_id: 777 }]));
    store.saveSnapshot(42, 'contacts', sample(contacts(-10)));
    const input = { originId: A, destinationId: B, rangeLy: 5, preferences: { avoidHostile: true, standings: { [B]: 10 } } };
    assert.equal(service.route(42, input).status, 'invalid');
    assert.equal(service.jump(42, input).status, 'invalid');
    assert.equal(service.route(43, input).status, 'ok');
    assert.equal(service.jump(43, input).status, 'ok');
});
