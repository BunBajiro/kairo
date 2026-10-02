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
    t.after(async () => { await service.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
    for (const key of ['sovereignty', 'kills', 'jumps', 'fw', 'incursions', 'industry_systems', 'sovereignty_structures']) store.saveSnapshot(0, key, sample([]));
    for (const id of [42, 43]) {
        store.saveSnapshot(id, 'profile', sample({ corporation_id: 98, alliance_id: 99 }));
        store.saveSnapshot(id, 'contacts', sample([]));
        store.saveSnapshot(id, 'corporation_contacts', sample([], { ownerId: 98 }));
        store.saveSnapshot(id, 'alliance_contacts', sample([], { ownerId: 99 }));
        store.saveSnapshot(id, 'calendar', sample([])); store.saveSnapshot(id, 'mining', sample([]));
    }
    const service = createUniverse(store, auth, overrides.esi || {}, { staticData: atlas, now: () => clock, ...overrides.options });
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

test('live map sources include real activity, incursions, indices, structures and honest missing data', async t => {
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
    assert.equal(row.structures.length, 1); assert.equal(Object.hasOwn(row, 'visits'), false); assert.equal(row.note.body, 'Our shared staging note');
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
    assert.throws(() => service.saveLinkList(42, { id: list.id, links: [{ from: 'Alpha', to: 'Unknown' }] }), /Unknown system/);
    assert.equal(service.state(42).links.length, 1);
    service.saveLinkList(42, { id: list.id, enabled: false });
    assert.equal(service.route(42, { originId: A, destinationId: C, preferences: { useAnsiblex: true } }).status, 'no_route');
    const directed = service.saveLinkList(42, { name: 'Directional network', links: [
        { from: 'Alpha', to: 'Gamma', directional: true, accessible: true, owner_alliance_id: 5 },
        { from: 'Gamma', to: 'Alpha', directional: true, accessible: true, owner_alliance_id: 6 },
    ] });
    assert.equal(directed.imported, 1);
    assert.equal(directed.links[0].directional, false);
    assert.equal(directed.links[0].owner_alliance_id, 5);
    assert.equal(directed.links[0].reverse_owner_alliance_id, 6);
    service.deleteLinkList(42, directed.id); assert.equal(service.state(42).links.length, 1);
    service.deleteLinkList(42, list.id); assert.equal(service.state(42).links.length, 0);
});

test('wormholes default to sixteen hours, expire exactly, and prune keeps durable pins and notes', async t => {
    const { service, store, time } = await fixture(t);
    const map_id=service.jspace.create(42,{name:'Test chain'}).id;
    const wormhole = service.saveLink(42, { kind: 'wormhole', map_id, from_system_id: A, to_system_id: W });
    assert.equal(Date.parse(wormhole.expires_at) - AT, 16 * 3600000);
    const request = { map_id, originId: A, destinationId: W, preferences: { useWormholes: true } };
    assert.equal(service.route(42, request).status, 'ok');
    service.savePin(42, { system_id: A, body: 'Permanent system note' });
    savePlaceNote(store, 'system', A, { body: 'Keep across collapsed connections' });
    time(AT + 16 * 3600000);
    assert.equal(service.state(42).links.length, 0); assert.equal(service.route(42, request).status, 'no_route');
    assert.equal(service.pruneExpired(42).deleted, 0); assert.equal(service.state(42).pins.length, 1);
    assert.equal((await service.detail(42, A)).notes.system.body, 'Keep across collapsed connections');
    assert.throws(() => service.saveLink(42, { kind: 'wormhole', map_id, from: 'Alpha', to: 'J000001', duration_hours: 7 }), /lifetime/);
});

test('all mapper durations persist precisely and unrelated edits never renew a connection', async t => {
    const {service,time}=await fixture(t);
    const map_id=service.jspace.create(42,{name:'Test chain'}).id;
    for(const hours of [1,4,4.5,16,24,48]) {
        const edge=service.saveLink(42,{kind:'wormhole',map_id,from_system_id:A,to_system_id:W,duration_hours:hours,mass:'stable',max_ship_size:'large',confirmed:false,accessible:false});
        assert.equal(edge.duration_hours,hours);assert.equal(Date.parse(edge.expires_at),AT+hours*3600000);assert.equal(edge.active,false);
    }
    const edge=service.saveLink(42,{kind:'wormhole',map_id,from_system_id:A,to_system_id:W,life_band:'under_4h',confirmed:false,accessible:false});
    time(AT+1800000);
    const preset=service.saveLink(42,{id:edge.id,duration_hours:4.5});
    assert.equal(preset.life_band,'unknown');assert.equal(preset.duration_hours,4.5);assert.equal(Date.parse(preset.expires_at),AT+5*3600000);
    assert.equal(preset.confirmed,false);assert.equal(preset.accessible,false);
    time(AT+3600000);
    const size=service.saveLink(42,{id:edge.id,max_ship_size:'xlarge',mass:'reduced'});
    assert.equal(size.expires_at,preset.expires_at);assert.equal(size.life_observed_at,preset.life_observed_at);assert.equal(size.duration_hours,4.5);
    const echo=service.saveLink(42,{...size,mass:'critical'});
    assert.equal(echo.expires_at,preset.expires_at);assert.equal(echo.life_observed_at,preset.life_observed_at);
    const manual=service.saveLink(42,{id:edge.id,expires_at:new Date(AT+6*3600000).toISOString()});
    assert.equal(manual.duration_hours,null);
});

test('wormhole expiry deadline deletes persisted records without a read, while disabled and without sync', async t => {
    const scheduled = new Map(); let nextTimer = 0;
    const {service,store,time} = await fixture(t, {options:{noSync:true,lifecycle:{setTimeout:(fn,ms)=>{const id=++nextTimer;scheduled.set(id,{fn,ms});return id;},clearTimeout:id=>scheduled.delete(id)}}});
    const map_id=service.jspace.create(42,{name:'Test chain'}).id;
    const link = service.saveLink(42,{kind:'wormhole',map_id,from_system_id:A,to_system_id:W,duration_hours:1});
    assert.equal([...scheduled.values()][0].ms,3600000);
    service.state(42);service.jspace.state(42);service.state(42);
    assert.equal(nextTimer,1,'Repeated reads keep the existing deadline timer');
    store.set('module:universe',false); time(AT+3600000);
    const deadline = [...scheduled.values()][0]; scheduled.clear(); deadline.fn();
    assert.equal(store.db.prepare("SELECT body FROM universe_records WHERE kind='link' AND id=?").get(link.id),undefined);
    assert.equal(scheduled.size,0);
    assert.throws(()=>service.saveLink(42,{id:link.id,duration_hours:48}),/not found/);
});

test('manual deletion removes exact bound signatures and route copies but preserves replacement observations and itinerary', async t => {
    const {service,store}=await fixture(t);
    const map_id=service.jspace.create(42,{name:'Test chain'}).id, otherMap=service.jspace.create(43,{name:'Other pilot chain'}).id;
    const signature=service.operations.saveSignature(42,{map_id,system_id:A,signature_id:'ABC-123',type:'Wormhole'});
    const link=service.saveLink(42,{kind:'wormhole',map_id,from_system_id:A,to_system_id:W,from_signature_record_id:signature.id,from_signature:'ABC-123'});
    service.operations.removeSignature(42,signature.id,map_id);
    const replacement=service.operations.saveSignature(42,{map_id,system_id:A,signature_id:'ABC-123',type:'Wormhole',notes:'New observation'});
    const other=service.saveLink(43,{kind:'wormhole',map_id:otherMap,from_system_id:A,to_system_id:W});
    service.navigation.saveItinerary(42,{map_id,originId:A,stops:[{systemId:W}],preferences:{useWormholes:true}});
    assert.equal((await service.navigation.plan(42,{map_id})).status,'ok');
    service.deleteLink(42,link.id);
    assert.equal(service.state(42).links.length,0);assert.ok(service.exportUserData(43).records.some(row=>row.id===other.id));
    assert.deepEqual(service.operations.state(42,map_id).signatures.map(row=>row.id),[replacement.id]);
    assert.equal(store.db.prepare("SELECT body FROM universe_operations_records WHERE character_id=42 AND kind LIKE 'signature_deleted:map:%' AND id=?").get(signature.id),undefined);
    assert.equal(service.navigation.state(42,map_id).plan,null);assert.equal(service.navigation.state(42,map_id).itinerary.stops[0].systemId,W);
    assert.ok(!JSON.stringify(service.exportUserData(42)).includes(link.id));
    const bound=service.operations.saveSignature(42,{map_id,system_id:W,signature_id:'DEF-456',type:'Wormhole'});
    const next=service.saveLink(42,{kind:'wormhole',map_id,from_system_id:A,to_system_id:W,to_signature_record_id:bound.id});
    service.deleteLink(42,next.id);assert.equal(service.operations.state(42,map_id).signatures.some(row=>row.id===bound.id),false);
});

test('terminal saves and startup migration do not retain or resurrect dead wormholes', async t => {
    const {service,store,auth,time}=await fixture(t);
    const map_id=service.jspace.create(42,{name:'Test chain'}).id;
    const zero=service.saveLink(42,{kind:'wormhole',map_id,from_system_id:A,to_system_id:W,duration_hours:0});
    assert.equal(zero.deleted,true);assert.equal(service.state(42).links.length,0);
    const live=service.saveLink(42,{kind:'wormhole',map_id,from_system_id:A,to_system_id:W});
    assert.equal(service.saveLink(42,{id:live.id,life_status:'collapsed'}).deleted,true);
    assert.throws(()=>service.saveLink(42,{id:live.id,duration_hours:16}),/not found/);
    const old=service.saveLink(42,{kind:'wormhole',map_id,from_system_id:A,to_system_id:W,duration_hours:1});
    await service.close();time(AT+3600000);
    const reopened=createUniverse(store,auth,{}, {staticData:atlas,now:()=>AT+3600000,noSync:true});
    assert.equal(store.db.prepare("SELECT body FROM universe_records WHERE kind='link' AND id=?").get(old.id),undefined);
    await reopened.close();
});

test('observed travel never creates global J-Space discoveries or routes visit history', async t => {
    const {service,store}=await fixture(t);
    const before=sample({solar_system_id:A},{updatedAt:new Date(AT-15000).toISOString()});
    assert.equal(service.observeTravel(42,before,sample({solar_system_id:W})),null);
    assert.equal(service.state(42).links.length,0);
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM universe_records WHERE kind='link'").get().n,0);
    assert.equal(service.route(42,{originId:A,destinationId:W,preferences:{useWormholes:true}}).status,'no_route');
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

test('reported wormhole promotion preserves expiry, provenance and endpoint restrictions', async t => {
    const {service}=await fixture(t),expiry=new Date(AT+3600000).toISOString();
    const map_id=service.jspace.create(42,{name:'Test chain'}).id;
    const link=service.saveLink(42,{kind:'wormhole',map_id,from_system_id:A,to_system_id:W,expires_at:expiry,
        max_ship_size:'large',max_jump_mass_kg:375000000,wh_type:'N110',from_signature:'ABC-123',to_signature:'DEF-456',
        reported_source:'thera',report_id:'thera:123',observed_at:new Date(AT-60000).toISOString()});
    assert.equal(link.expires_at,expiry);assert.equal(link.max_jump_mass_kg,375000000);assert.equal(link.from_signature,'ABC-123');
    assert.equal(link.reported_source,'thera');assert.equal(service.saveLink(42,{id:link.id,mass:'reduced'}).expires_at,expiry);
    assert.throws(()=>service.saveLink(42,{kind:'wormhole',map_id,from_system_id:A,to_system_id:W,expires_at:new Date(AT-1).toISOString()}),/expiry/);
    assert.throws(()=>service.saveLink(42,{id:link.id,max_ship_size:'anything'}),/ship size/);
    assert.throws(()=>service.saveLink(42,{id:link.id,observed_at:'tomorrow'}),/observation time/);
});

test('wormholes and routing are isolated to their owning map and global J-Space details stay static', async t => {
    const {service,store}=await fixture(t), map_id=service.jspace.create(42,{name:'Alpha chain'}).id, other=service.jspace.create(42,{name:'Beta chain'}).id;
    assert.throws(()=>service.saveLink(42,{kind:'wormhole',from_system_id:A,to_system_id:W}),/private chain map/);
    assert.throws(()=>service.saveLink(43,{kind:'wormhole',map_id,from_system_id:A,to_system_id:W}),/private chain map/);
    const link=service.saveLink(42,{kind:'wormhole',map_id,from_system_id:A,to_system_id:W});
    assert.throws(()=>service.saveLink(42,{id:link.id,map_id:other}),/original chain map/);
    const route={originId:A,destinationId:W,preferences:{useWormholes:true}};
    assert.equal(service.route(42,{...route,map_id}).status,'ok');
    assert.equal(service.route(42,{...route,map_id:other}).status,'no_route');assert.equal(service.route(42,route).status,'no_route');
    assert.equal(service.state(42).links.length,0);
    savePlaceNote(store,'system',W,{body:'Legacy global note'});
    store.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(42,W,'J000001',new Date(AT).toISOString());
    const detail=await service.detail(42,W);assert.equal(detail.name,'J000001');assert.equal(detail.notes.system,null);assert.equal(Object.hasOwn(detail.overlay,'visits'),false);assert.deepEqual(detail.links,[]);
    assert.throws(()=>service.savePin(42,{system_id:W,body:'Global note'}),/private chain map/);
});

test('scope migration keeps mapped signature copies and forgets original global bindings at both endpoints', async t => {
    const {service,store,auth}=await fixture(t), map_id=service.jspace.create(42,{name:'Legacy chain'}).id;
    const signature=service.operations.saveSignature(42,{map_id,system_id:A,signature_id:'ABC-123',type:'Wormhole'});
    const link=service.saveLink(42,{kind:'wormhole',map_id,from_system_id:A,to_system_id:W,from_signature_record_id:signature.id});
    const map=JSON.parse(store.db.prepare("SELECT body FROM universe_records WHERE kind='jspace_map' AND id=?").get(map_id).body);
    map.scope_version=1;map.nodes=[{system_id:A,x:0,y:0,status:'unknown'},{system_id:W,x:300,y:0,status:'unknown'}];map.connections=[{id:'legacy-edge',kind:'wormhole',link_id:link.id,from_system_id:A,to_system_id:W,from_signature_id:signature.id}];
    store.db.prepare("UPDATE universe_records SET body=? WHERE kind='jspace_map' AND id=?").run(JSON.stringify(map),map_id);
    delete link.map_id;store.db.prepare("UPDATE universe_records SET body=? WHERE kind='link' AND id=?").run(JSON.stringify(link),link.id);
    delete signature.map_id;store.db.prepare("UPDATE universe_operations_records SET kind='signature',body=? WHERE id=?").run(JSON.stringify(signature),signature.id);
    store.db.prepare("DELETE FROM settings WHERE key='universe:operations:map_scopes:version'").run();
    await service.close();
    const reopened=createUniverse(store,auth,{}, {staticData:atlas,now:()=>AT,noSync:true});
    const edge=reopened.jspace.state(42).maps[0].connections[0];assert.notEqual(edge.link_id,link.id);assert.equal(edge.map_id,map_id);
    assert.equal(reopened.operations.state(42,map_id).signatures[0].id,signature.id);
    assert.equal(store.db.prepare("SELECT body FROM universe_operations_records WHERE kind='signature' AND id=?").get(signature.id),undefined);
    assert.equal(store.db.prepare("SELECT body FROM universe_records WHERE kind='link' AND id=?").get(link.id),undefined);
    await reopened.close();
});

test('scope options use fresh complete sovereignty and the configured name cache',async t=>{
    const {service,store,time}=await fixture(t);
    store.set('names',{777:'Current alliance',888:'Current corporation'});
    store.saveSnapshot(0,'sovereignty',sample([{system_id:A,alliance_id:777},{system_id:B,corporation_id:888}]));
    const ready=service.scopeOptions(42);assert.equal(ready.sovereignty_ready,true);assert.deepEqual(ready.alliances,[{id:777,name:'Current alliance'}]);assert.deepEqual(ready.corporations,[{id:888,name:'Current corporation'}]);
    store.saveSnapshot(0,'sovereignty',sample([{system_id:A,alliance_id:777}],{truncated:true}));assert.equal(service.scopeOptions(42).sovereignty_ready,false);assert.deepEqual(service.scopeOptions(42).alliances,[]);
    store.saveSnapshot(0,'sovereignty',sample([{system_id:A,alliance_id:777}]));time(AT+3600000);assert.equal(service.scopeOptions(42).sovereignty_ready,false);
    assert.throws(()=>service.scopeOptions(999),/connected pilot/);
});

test('generic connection mutations cannot edit tracking sources while expiry housekeeping still removes them',async t=>{
    const {service,store,time}=await fixture(t), map=service.jspace.create(42,{name:'Source fixture'});
    const link=service.saveLink(42,{kind:'wormhole',map_id:map.id,from_system_id:A,to_system_id:W,duration_hours:1});
    const stored=JSON.parse(store.db.prepare("SELECT body FROM universe_records WHERE kind='jspace_map' AND id=?").get(map.id).body);stored.kind='tracking_source';
    store.db.prepare("UPDATE universe_records SET body=? WHERE kind='jspace_map' AND id=?").run(JSON.stringify(stored),map.id);
    assert.throws(()=>service.saveLink(42,{id:link.id,mass:'critical'}),/read-only/);assert.throws(()=>service.deleteLink(42,link.id),/read-only/);
    assert.throws(()=>service.saveLink(42,{kind:'wormhole',map_id:map.id,from_system_id:B,to_system_id:W}),/read-only/);
    time(AT+3600000);assert.equal(service.pruneExpired(42).deleted,1);assert.equal(store.db.prepare("SELECT body FROM universe_records WHERE kind='link' AND id=?").get(link.id),undefined);
});


test('Universe discovery is pilot membership and hot projections never read lifetime visits',async t=>{
 const {store,service}=await fixture(t);
 store.db.prepare('INSERT INTO discovered_systems(character_id,system_id) VALUES(?,?)').run(42,W);
 const prepare=store.db.prepare;
 store.db.prepare=function(sql){assert.doesNotMatch(sql,/\bvisits\b/i,'Hot Universe/route projection read retired travel history');return prepare.call(this,sql);};
 t.after(()=>{store.db.prepare=prepare;});
 const state=service.state(42);
 assert.deepEqual(state.discoveredSystemIds,[W]);assert.equal(Object.hasOwn(state,'journey'),false);
 assert.deepEqual(service.state(43).discoveredSystemIds,[]);
 assert.deepEqual(service.route(42,{originId:A,destinationId:B}).systemIds,[A,B]);
 assert.equal((await service.detail(42,A)).name,'Alpha');
});
