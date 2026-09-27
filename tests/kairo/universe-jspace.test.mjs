import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../../server/store.mjs';
import { createUniverse } from '../../server/universe.mjs';
import { refreshDeadline } from '../../server/polling.mjs';

const AT = Date.parse('2026-09-25T18:00:00Z'), A = 30000001, B = 30000002, W = 31000001, X = 31000002;
const atlas = { metadata: {}, regions: [], constellations: [], systems: [
    { system_id: A, name: 'Alpha', space: 'known', security: .8, x: 0, y: 0, z: 0 },
    { system_id: B, name: 'Beta', space: 'known', security: .6, x: 1, y: 1, z: 1 },
    { system_id: W, name: 'J000001', space: 'wormhole', security: -1, x: 100, y: 0, z: 0, wormhole_class_id: 4 },
    { system_id: X, name: 'J000002', space: 'wormhole', security: -1, x: 100, y: 1, z: 1, wormhole_class_id: 1 },
], gates: [{ from_system_id: A, to_system_id: B }] };
async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-jspace-')), store = openStore(dir), auth = { characters: () => [{ id: 42, scopes: [] }, { id: 43, scopes: [] }] };
    let clock = AT;
    const service = createUniverse(store, auth, {}, { staticData: atlas, now: () => clock, noSync: true });
    t.after(async () => { await service.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
    const api = service.jspace;
    return { store, auth, service, api, time: value => { clock = value; }, create: name => api.create(42, { name: name || 'Home chain' }),
        cmd: (map, op, args = {}) => api.command(42, map.id, { revision: map.revision, op, ...args }) };
}
function twoNodes(f, map) { map = f.cmd(map, 'node.save', { node: { system_id: W } }); return f.cmd(map, 'node.save', { node: { system_id: X } }); }
function canonical(f, map) { return f.store.db.prepare("SELECT body FROM universe_records WHERE character_id=42 AND kind='link'").all().map(row => JSON.parse(row.body)).filter(row => row.map_id === map.id); }

test('observed lifetime bands persist without granting access, renewing expiry or losing their age on mass edits', async t => {
    const f=await fixture(t);let map=twoNodes(f,f.create());
    map=f.cmd(map,'connection.save',{connection:{from_system_id:W,to_system_id:X,confirmed:false,accessible:false,expires_at:null}});
    map=f.cmd(map,'connection.save',{connection:{id:map.connections[0].id,life_band:'under_8h'}});
    let edge=map.connections[0];
    assert.equal(edge.life_band,'under_8h');assert.equal(edge.life_status,'stable');assert.equal(edge.expires_at,new Date(AT+8*3600000).toISOString());
    assert.equal(edge.confirmed,false);assert.equal(edge.accessible,false);assert.equal(edge.active,false);
    const observed=edge.life_observed_at;f.time(AT+3600000);
    map=f.cmd(map,'connection.save',{connection:{id:edge.id,mass:'reduced'}});
    assert.equal(map.connections[0].life_observed_at,observed);assert.equal(map.connections[0].expires_at,edge.expires_at);
    map=f.cmd(map,'connection.save',{connection:{id:edge.id,life_band:'under_day'}});
    assert.equal(map.connections[0].expires_at,edge.expires_at,'Broader observation does not extend known upper bound');
    map=f.cmd(map,'connection.save',{connection:{id:edge.id,life_band:'under_4h'}});edge=map.connections[0];
    assert.equal(edge.life_status,'eol');assert.equal(edge.expires_at,new Date(AT+5*3600000).toISOString());
    const exported=f.api.exportMap(42,map.id);
    const copy=f.api.importMap(42,{document:exported,name:'Observed copy'});
    assert.equal(copy.connections[0].life_band,'under_4h');assert.equal(copy.connections[0].life_observed_at,edge.life_observed_at);
    assert.equal(copy.connections[0].expires_at,edge.expires_at);assert.equal(copy.connections[0].confirmed,false);
});

test('private chain maps survive reopening, isolate pilots and require revision-matched writes', async t => {
    const f = await fixture(t); let map = f.create();
    assert.deepEqual(f.api.state(43).maps, []); assert.deepEqual(f.api.state(0).maps, []);
    assert.throws(() => f.api.create(0, { name: 'Guest map' }), /connected pilot/);
    assert.throws(() => f.api.command(43, map.id, { revision: 1, op: 'map.update', name: 'Hijack' }), /private chain map/);
    const oldRevision = map.revision;
    map = f.cmd(map, 'map.update', { name: 'A home among stars', description: 'Private staging chain' });
    assert.throws(() => f.api.command(42, map.id, { revision: oldRevision, op: 'map.update', name: 'Stale tab' }), error => error.status === 409);
    assert.throws(() => f.api.remove(42, map.id, { revision: oldRevision }), error => error.status === 409);
    const reopened = createUniverse(f.store, f.auth, {}, { staticData: atlas, now: () => AT, noSync: true });
    assert.equal(reopened.jspace.state(42).maps[0].name, 'A home among stars'); await reopened.close();
    assert.throws(() => f.api.state(999), /connected pilot/);
});

test('positions, locks, aliases, roles, annotations and undo are atomic and bounded', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'node.save', { node: { system_id: W, x: 180, y: 90, locked: true, alias: 'Home', role: 'home', status: 'friendly', tags: ['base', 'base'] } });
    assert.deepEqual(map.nodes[0].tags, ['base']);
    assert.throws(() => f.cmd(map, 'nodes.position', { positions: [{ system_id: X, x: 200 }, { system_id: W, x: 300 }] }), /Unlock/);
    assert.equal(f.api.state(42).maps[0].nodes[1].x, 340, 'the earlier position in the failed batch must roll back');
    map = f.cmd(map, 'comment.add', { comment: { body: 'A quiet home system', system_id: W } });
    assert.equal(map.comments.length, 1); assert.equal(map.can_undo, true);
    map = f.cmd(map, 'undo'); assert.equal(map.comments.length, 0); assert.equal(map.nodes[0].alias, 'Home');
    assert.throws(() => f.cmd(map, 'node.save', { node: { system_id: X, x: Infinity } }), /finite/);
    assert.throws(() => f.cmd(map, 'node.remove', { system_id: W }), /Unlock/);
});

test('global visits and pins cannot seed private maps or create map-owned connections', async t => {
    const f = await fixture(t);
    f.store.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(42, W, 'J000001', new Date(AT).toISOString());
    assert.throws(() => f.service.savePin(42, { system_id: X, label: 'Discovery' }), /map/);
    let map = f.api.create(42, { name: 'Discovered chain', seed_discovery: true });
    assert.deepEqual(map.nodes, []); assert.deepEqual(map.connections, []); assert.deepEqual(f.service.state(42).links, []);
    map = twoNodes(f, map);
    const proposal = f.service.saveLink(42, { map_id: map.id, kind: 'wormhole', from_system_id: W, to_system_id: X, confirmed: false, accessible: false });
    map = f.api.create(42, { name: 'Travel proposals', seed_discovery: true });
    assert.deepEqual(map.nodes, []); assert.deepEqual(map.connections, []);
    assert.ok(!JSON.stringify(map).includes(proposal.id), 'Creating a new map must not import another map’s evidence');
});

test('connections use canonical links, demand explicit confirmation and reflect expiry/removal', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, duration_hours: 1, mass: 'stable' } });
    let edge = map.connections[0]; assert.equal(edge.active, false); assert.equal(edge.confirmed, false); assert.equal(map.can_undo, false);
    assert.equal(canonical(f, map)[0].id, edge.link_id);
    assert.deepEqual(f.service.state(42).links, [], 'Private wormholes are absent from global K-Space links');
    map = f.cmd(map, 'connection.save', { connection: { id: edge.id, confirmed: true, accessible: true } }); edge = map.connections[0];
    assert.equal(edge.active, true);
    const route = f.service.route(42, { map_id: map.id, originId: W, destinationId: X, preferences: { useWormholes: true, allowUnknownWormholeSize: true } });
    assert.equal(route.status, 'ok'); assert.equal(route.edges[0].id, edge.link_id);
    f.time(AT + 3600000); map = f.api.state(42).maps[0];
    assert.deepEqual(map.connections, []); assert.deepEqual(canonical(f, map), []);
    assert.throws(() => f.service.deleteLink(42, edge.link_id), /not found/, 'Expiry already removed the canonical record');
});

test('passage ledger records direction and observed mass without claiming remaining mass', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, confirmed: true, accessible: true } }); const edge = map.connections[0];
    map = f.cmd(map, 'passage.add', { passage: { connection_id: edge.id, from_system_id: W, to_system_id: X, pilot_name: 'Scout', ship_name: 'Buzzard', mass_kg: 1270000 } });
    map = f.cmd(map, 'passage.add', { passage: { connection_id: edge.id, from_system_id: X, to_system_id: W, pilot_name: 'Scout' } });
    assert.equal(map.connections[0].observed_mass_kg, 1270000); assert.equal(map.connections[0].unweighed_passages, 1); assert.equal(map.connections[0].remaining_mass_kg, null);
    assert.equal(canonical(f, map)[0].mass, 'unknown', 'a ledger total cannot change observed collapse state');
    assert.throws(() => f.cmd(map, 'passage.add', { passage: { connection_id: edge.id, from_system_id: W, to_system_id: A } }), /endpoints/);
    assert.throws(() => f.cmd(map, 'passage.add', { passage: { connection_id: edge.id, from_system_id: W, to_system_id: X, mass_kg: -2 } }), /positive/);
    map = f.cmd(map, 'connection.save', { connection: { id: edge.id, life_status: 'collapsed' } });
    assert.deepEqual(map.connections, []); assert.deepEqual(map.passages, []); assert.deepEqual(canonical(f, map), []);
});

test('canonical scanner signatures link both endpoints and deletions do not invent replacement observations', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X } }); const edge = map.connections[0];
    map = f.cmd(map, 'signature.save', { signature: { system_id: W, signature_id: 'AAA-123', name: 'Entrance', connection_id: edge.id } });
    map = f.cmd(map, 'signature.save', { signature: { system_id: X, signature_id: 'BBB-456', name: 'Return', connection_id: edge.id } });
    assert.equal(f.service.operations.state(42, map.id).signatures.length, 2);
    assert.deepEqual(f.service.operations.state(42).signatures, [], 'Private scanner records do not leak into global operations');
    assert.equal(canonical(f, map)[0].from_signature, 'AAA-123'); assert.equal(canonical(f, map)[0].to_signature, 'BBB-456');
    assert.ok(map.signatures.every(row => row.connection_ids.includes(edge.id)));
    const old = map.signatures.find(row => row.signature_id === 'AAA-123');
    f.service.operations.removeSignature(42, old.id, map.id);
    f.service.operations.saveSignature(42, { map_id: map.id, system_id: W, signature_id: 'AAA-123' });
    map = f.api.state(42).maps[0];
    assert.equal(map.connections[0].from_signature_id, null, 'a different observation reusing an ID is not silently attached');
    assert.equal(map.signatures.find(row => row.signature_id === 'AAA-123').connection_ids.length, 0);
});

test('structures, timers and local pings preserve observation times and expire honestly', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'observation.save', { observation: { system_id: W, kind: 'structure', title: 'Unidentified citadel', expires_at: new Date(AT + 60000).toISOString() } });
    assert.equal(map.observations[0].standing, 'unknown'); assert.equal(map.observations[0].state, '');
    map = f.cmd(map, 'observation.save', { observation: { system_id: W, kind: 'timer', title: 'Reported reinforcement', timer_at: new Date(AT + 30000).toISOString() } });
    map = f.cmd(map, 'ping.add', { ping: { system_id: W, label: 'Scout here', duration_seconds: 30 } });
    f.time(AT + 60001); map = f.api.state(42).maps[0];
    assert.equal(map.pings.length, 0); assert.equal(map.observations.find(row => row.kind === 'timer').timer_elapsed, true); assert.equal(map.observations.find(row => row.kind === 'structure').expired, true);
    assert.equal(map.observations[0].created_at, new Date(AT).toISOString());
});

const wanderer = () => ({ version: 1, exported_at: new Date(AT - 86400000).toISOString(), map: { name: 'Wanderer chain', description: 'Old scouting records' },
    systems: [{ solar_system_id: W, custom_name: 'Home', position: { x: -100, y: 250 }, locked: true, status: 8, labels: '["scan"]' }, { solar_system_id: X, position: { x: 300, y: 250 } }],
    connections: [{ source: W, target: X, type: 0, mass_status: 1, time_status: 2, ship_size_type: 0, wormhole_type: 'A239', locked: true }],
    signatures: [{ solar_system_id: W, eve_id: 'ABC-123', group: 'Wormhole', name: 'Old entrance' }] });

test('Wanderer v1 import previews without writes and never revives portable connection evidence', async t => {
    const f = await fixture(t), document = wanderer(), preview = f.api.previewImport(42, { document });
    assert.equal(preview.valid, true); assert.equal(preview.format, 'wanderer-v1'); assert.equal(preview.counts.connections, 1); assert.equal(f.api.state(42).maps.length, 0); assert.equal(f.service.state(42).links.length, 0);
    const map = f.api.importMap(42, { document });
    assert.equal(map.nodes[0].alias, 'Home'); assert.equal(map.nodes[0].role, 'home'); assert.equal(map.nodes[0].locked, true); assert.equal(map.nodes[0].x, -100);
    assert.equal(map.connections[0].mass, 'reduced'); assert.equal(map.connections[0].max_ship_size, 'small'); assert.equal(map.connections[0].active, false); assert.equal(map.connections[0].confirmed, false); assert.equal(map.connections[0].expired, false); assert.equal(map.connections[0].expires_at, null);
    assert.equal(map.signatures[0].missing, true); assert.equal(map.signatures[0].stale, true);
    assert.equal(f.api.state(43).maps.length, 0); assert.equal(f.service.operations.state(43).signatures.length, 0);
});

test('invalid imports and invalid cross-service commands roll back every affected record', async t => {
    const f = await fixture(t), document = wanderer(); document.signatures.push({ solar_system_id: W, eve_id: 'invalid' });
    assert.equal(f.api.previewImport(42, { document }).valid, false);
    assert.throws(() => f.api.importMap(42, { document }), /signature IDs/); assert.equal(f.api.state(42).maps.length, 0); assert.equal(f.service.state(42).links.length, 0);
    let map = twoNodes(f, f.create());
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, locked: true } });
    const revision = map.revision;
    assert.equal(map.connections[0].locked, undefined, 'Only system cards can be locked');
    assert.throws(() => f.cmd(map, 'signature.save', { signature: { system_id: A, signature_id: 'ABC-123', connection_id: map.connections[0].id } }), /Add this system/);
    assert.equal(f.service.operations.state(42, map.id).signatures.length, 0); assert.equal(f.api.state(42).maps[0].revision, revision);
});

test('native exports preserve map content across pilots while demoting imported links', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, confirmed: true, accessible: true, from_signature: 'ABC-123', duration_hours: 4 } });
    map = f.cmd(map, 'comment.add', { comment: { connection_id: map.connections[0].id, body: 'Observed chain note' } });
    map = f.cmd(map, 'passage.add', { passage: { connection_id: map.connections[0].id, from_system_id: W, to_system_id: X, mass_kg: 1000 } });
    const document = f.api.exportMap(42, map.id), imported = f.api.importMap(43, { document, name: 'Imported private chain' });
    assert.equal(imported.name, 'Imported private chain'); assert.equal(imported.comments[0].body, 'Observed chain note'); assert.equal(imported.passages[0].mass_kg, 1000);
    assert.notEqual(imported.connections[0].link_id, map.connections[0].link_id); assert.equal(imported.connections[0].confirmed, false); assert.equal(imported.connections[0].active, false);
    assert.equal(f.api.state(42).maps[0].connections[0].active, true);
    f.api.remove(43, imported.id, { revision: imported.revision });
    assert.equal(f.api.state(43).maps.length, 0);
    assert.equal(f.store.db.prepare("SELECT COUNT(*) AS count FROM universe_records WHERE character_id=43 AND kind='link'").get().count, 0, 'Removing a map removes its owned connections');
    assert.equal(f.api.state(42).maps[0].connections[0].active, true, 'Removing an imported map leaves the source map intact');
});

test('duplicating a chain preserves observed ages and makes connection evidence independent', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, confirmed: true, accessible: true, duration_hours: 4 } });
    map = f.cmd(map, 'comment.add', { comment: { body: 'Original note', connection_id: map.connections[0].id } });
    const originalLink = canonical(f, map)[0]; f.time(AT + 600000);
    let copy = f.api.duplicate(42, map.id, { revision: map.revision, name: 'Scouting copy' });
    assert.notEqual(copy.id, map.id); assert.notEqual(copy.connections[0].id, map.connections[0].id); assert.notEqual(copy.connections[0].link_id, map.connections[0].link_id);
    assert.equal(copy.connections[0].expires_at, originalLink.expires_at); assert.equal(copy.connections[0].observed_at, originalLink.observed_at);
    assert.equal(copy.connections[0].confirmed, false); assert.equal(copy.connections[0].accessible, false);
    assert.equal(copy.comments[0].connection_id, copy.connections[0].id);
    copy = f.cmd(copy, 'connection.save', { connection: { id: copy.connections[0].id, life_status: 'eol', mass: 'reduced' } });
    const refreshed = f.api.state(42).maps.find(row => row.id === map.id);
    assert.equal(refreshed.connections[0].life_status, map.connections[0].life_status); assert.equal(refreshed.connections[0].mass, map.connections[0].mass);
    assert.equal(copy.connections[0].life_status, 'eol'); assert.equal(copy.connections[0].mass, 'reduced');
    copy = f.cmd(copy, 'node.save', { node: { system_id: W, alias: 'Copy alias' } });
    assert.equal(f.api.state(42).maps.find(row => row.id === map.id).nodes[0].alias, '');
});

test('passage corrections preserve identity and occurrence while multi-delete obeys locked graph constraints', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X } });
    map = f.cmd(map, 'passage.add', { passage: { connection_id: map.connections[0].id, from_system_id: W, to_system_id: X, mass_kg: 100 } });
    const passage = map.passages[0]; f.time(AT + 600000);
    map = f.cmd(map, 'passage.save', { passage: { id: passage.id, mass_kg: 200, ship_name: 'Corrected hull' } });
    assert.equal(map.passages[0].id, passage.id); assert.equal(map.passages[0].created_at, passage.created_at); assert.equal(map.passages[0].occurred_at, passage.occurred_at);
    assert.equal(map.connections[0].observed_mass_kg, 200);
    map = f.cmd(map, 'node.save', { node: { system_id: X, locked: true } });
    assert.throws(() => f.cmd(map, 'nodes.remove', { system_ids: [W, X] }), /Unlock/);
    assert.equal(f.api.state(42).maps[0].nodes.length, 2);
    map = f.cmd(map, 'node.save', { node: { system_id: X, locked: false } });
    map = f.cmd(map, 'nodes.remove', { system_ids: [W, X] });
    assert.equal(map.nodes.length, 0); assert.equal(map.connections.length, 0); assert.equal(map.passages.length, 0, 'Passages disappear with their removed connection');
    assert.deepEqual(canonical(f, map), [], 'Removing connected cards forgets the removed connections too');
    map = f.cmd(map, 'undo'); assert.equal(map.nodes.length, 2); assert.equal(map.connections.length, 0, 'Undo restores system cards without resurrecting connections');
});

test('opt-in sampled passage tracking is deduplicated, reviewable and never changes connection trust', async t => {
    const f = await fixture(t);
    f.auth.characters = () => [{ id: 42, scopes: ['esi-location.read_location.v1'] }, { id: 43, scopes: [] }];
    let map = twoNodes(f, f.create());
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, confirmed: true, accessible: true } });
    const sample = (system_id, at) => ({ status: 'ready', updatedAt: new Date(at).toISOString(), expiresAt: new Date(at + 60000).toISOString(), data: { solar_system_id: system_id } });
    const before = sample(W, AT - 10000), after = sample(X, AT);
    f.service.observeTravel(42, null, before);
    f.service.observeTravel(42, before, after); assert.equal(f.api.state(42).maps[0].passages.length, 0);
    map = f.cmd(map, 'map.update', { track_passages: true }); const beforeLinks = canonical(f, map);
    const returning = sample(W, AT + 10000); f.time(AT + 10000);
    f.service.observeTravel(42, after, returning); f.service.observeTravel(42, after, returning);
    map = f.api.state(42).maps[0]; assert.equal(map.passages.length, 1); assert.equal(map.passages[0].source, 'sampled_location'); assert.equal(map.passages[0].reviewed, false); assert.equal(map.passages[0].mass_kg, null);
    assert.deepEqual(canonical(f, map), beforeLinks); assert.equal(map.can_undo, false);
    map = f.cmd(map, 'passage.save', { passage: { id: map.passages[0].id, notes: 'Reviewed the observed transition.' } });
    assert.equal(map.passages[0].source, 'sampled_location'); assert.equal(map.passages[0].reviewed, true);
    f.service.observeTravel(42, after, returning); assert.equal(f.api.state(42).maps[0].passages.length, 1, 'reviewing preserves the sample deduplication identity');
    f.service.saveLink(42, { map_id: map.id, kind: 'wormhole', from_system_id: W, to_system_id: X, confirmed: true, accessible: true });
    f.time(AT + 20000); f.service.observeTravel(42, returning, sample(X, AT + 20000));
    assert.equal(f.api.state(42).maps[0].passages.length, 1, 'ambiguous parallel connections must not invent a passage identity');
});

test('the shared selected-location stream expands only subscribed private maps and map-local pause stops tracking', async t => {
    const f = await fixture(t);
    f.auth.characters = () => [42, 43].map(id => ({ id, scopes: ['esi-location.read_location.v1'] }));
    let home = f.create('Home'), other = f.api.create(43, { name: 'Independent' });
    assert.equal(home.pilots[0].tracking, true); assert.equal(other.pilots[0].tracking, true);
    home = f.cmd(home, 'pilot.add', { character_id: 43 });
    const emit = (id, system_id, at) => {
        f.time(at); f.store.saveSnapshot(id, 'location', { status: 'ready', data: { solar_system_id: system_id },
            updatedAt: new Date(at).toISOString(), expiresAt: new Date(at + 60000).toISOString() });
        f.service.observeSelectedLocation(id);
    };
    emit(43, W, AT); emit(43, X, AT + 20000);
    home = f.api.state(42).maps[0]; other = f.api.state(43).maps[0];
    assert.equal(home.connections.length, 1); assert.equal(other.connections.length, 1);
    assert.notEqual(home.connections[0].link_id, other.connections[0].link_id);
    assert.equal(home.connections[0].confirmed, false); assert.equal(other.connections[0].active, false);
    assert.equal(home.pilots.find(row => row.character_id === 43).system_id, X);
    home = f.cmd(home, 'pilot.tracking', { character_id: 43, tracking: false });
    const expiry = other.connections[0].expires_at;
    emit(43, A, AT + 40000);
    assert.equal(f.api.state(42).maps[0].nodes.some(row => row.system_id === A), false);
    other = f.api.state(43).maps[0];
    assert.equal(other.nodes.some(row => row.system_id === A), true); assert.equal(other.connections.length, 2);
    assert.equal(other.connections[0].expires_at, expiry);
    assert.deepEqual(f.service.state(42).links, []); assert.deepEqual(f.service.state(43).links, []);
    assert.equal(f.api.exportMap(42, home.id).map.pilots, undefined, 'map export carries no private tracking telemetry');
});

test('scheduled ESI refreshes connect J-Space travel and both K-Space endpoints in source, global and scoped maps', async t => {
    const f = await fixture(t);
    f.auth.characters = () => [42, 43].map(id => ({ id, scopes: ['esi-location.read_location.v1'] }));
    const global = f.create('Live chain'), scoped = f.api.create(42, { name: 'Beta exits', scope: { system_ids: [B] } });
    let sample = null, at = AT;
    const emit = system_id => {
        // Core schedules the next request at cache expiry; a fresh response arrives later.
        if (sample) at = refreshDeadline({ key: 'location', pollInterval: 5 }, sample, null, at) + 750;
        f.time(at);
        sample = { status: 'ready', data: { solar_system_id: system_id }, updatedAt: new Date(at).toISOString(), expiresAt: new Date(at + 5000).toISOString() };
        sample.refreshAt = new Date(refreshDeadline({ key: 'location', pollInterval: 5 }, sample, null, at)).toISOString();
        f.store.saveSnapshot(42, 'location', sample);
        f.service.observeSelectedLocation(42);
    };
    emit(A); emit(W); emit(X);
    assert.deepEqual(f.api.map(42, scoped.id).nodes, [], 'the scoped map still waits for a matching exit');
    const sourceId = f.api.state(42).source_map.id, firstSource = f.api.map(42, sourceId).connections[0];
    emit(B);
    for (const id of [sourceId, global.id, scoped.id]) {
        const map = f.api.map(42, id);
        assert.deepEqual(new Set(map.nodes.map(row => row.system_id)), new Set([A, W, X, B]));
        assert.deepEqual(map.connections.map(row => [row.from_system_id, row.to_system_id]), [[A, W], [W, X], [X, B]]);
        for (const edge of map.connections) {
            assert.equal(edge.duration_hours, 16); assert.equal(edge.mass, 'stable'); assert.equal(edge.max_ship_size, 'large');
            assert.equal(edge.confirmed, false); assert.equal(edge.accessible, false);
        }
    }
    const copied = f.api.map(42, scoped.id).connections[0];
    assert.notEqual(copied.link_id, firstSource.link_id); assert.equal(copied.expires_at, firstSource.expires_at);
    const expiries = f.api.map(42, global.id).connections.map(row => row.expires_at);
    emit(X);
    assert.deepEqual(f.api.map(42, global.id).connections.map(row => row.expires_at), expiries, 'returning through a hole cannot renew its timer');
});

test('scoped maps adopt a source chain when a later exit matches without renewing its lifetime or copying user data', async t => {
    const f = await fixture(t);
    f.auth.characters = () => [42, 43].map(id => ({ id, scopes: ['esi-location.read_location.v1'] }));
    const scoped = f.api.create(42, { name: 'Alpha approaches', scope: { system_ids: [A] } });
    const emit = (system_id, at) => {
        f.time(at); f.store.saveSnapshot(42, 'location', { status: 'ready', data: { solar_system_id: system_id },
            updatedAt: new Date(at).toISOString(), expiresAt: new Date(at + 60000).toISOString() }); f.service.observeSelectedLocation(42);
    };
    emit(W, AT); emit(X, AT + 20000);
    assert.deepEqual(f.api.state(42).maps[0].nodes, []);
    const sourceId = f.api.state(42).source_map.id, first = f.api.map(42, sourceId).connections[0];
    assert.equal(f.api.map(42, sourceId).read_only, true);
    assert.throws(() => f.api.command(42, sourceId, { revision: f.api.map(42, sourceId).revision, op: 'node.save', node: { system_id: W, alias: 'No edits' } }), /read-only/);
    emit(A, AT + 40000);
    const adopted = f.api.map(42, scoped.id), copy = adopted.connections.find(row => row.from_system_id === W);
    assert.deepEqual(new Set(adopted.nodes.map(row => row.system_id)), new Set([W, X, A]));
    assert.notEqual(copy.link_id, first.link_id); assert.equal(copy.expires_at, first.expires_at); assert.equal(copy.observed_at, first.observed_at);
    assert.equal(copy.duration_hours, 16); assert.equal(copy.mass, 'stable'); assert.equal(copy.max_ship_size, 'large'); assert.equal(copy.confirmed, false);
    assert.deepEqual(f.api.map(42, sourceId).passages, []); assert.deepEqual(f.api.map(42, sourceId).comments, []);
    const independent = f.api.duplicate(42, sourceId, { revision: f.api.map(42, sourceId).revision, name: 'My live chain' });
    assert.equal(independent.read_only, false); assert.equal(independent.connections.length, 2);
    assert.notEqual(independent.connections[0].link_id, first.link_id);
});

test('changing the selected pilot resets only source baselines and keeps explicitly tracked interactive pilots active', async t => {
    const f = await fixture(t);
    f.auth.characters = () => [42, 43].map(id => ({ id, scopes: ['esi-location.read_location.v1'] }));
    let map = f.create(); map = f.cmd(map, 'pilot.add', { character_id: 43 });
    const emit = (id, system_id, at) => {
        f.time(at); f.store.saveSnapshot(id, 'location', { status: 'ready', data: { solar_system_id: system_id },
            updatedAt: new Date(at).toISOString(), expiresAt: new Date(at + 60000).toISOString() }); f.service.observeSelectedLocation(id);
    };
    const source43 = f.api.state(43).source_map.id;
    emit(43, W, AT); emit(43, X, AT + 20000);
    assert.equal(f.api.map(43, source43).connections.length, 0); assert.equal(f.api.map(42, map.id).connections.length, 1);
    f.api.setActivePilot(43); emit(43, W, AT + 40000);
    assert.equal(f.api.map(43, source43).connections.length, 0);
    emit(43, X, AT + 60000); assert.equal(f.api.map(43, source43).connections.length, 1);
    f.api.setActivePilot(42); emit(43, A, AT + 80000); f.api.setActivePilot(43); emit(43, W, AT + 100000);
    assert.equal(f.api.map(43, source43).connections.length, 1, 'time while this pilot was not selected cannot bridge a new source connection');
    assert.equal(f.api.map(42, map.id).connections.length, 3, 'the explicit interactive roster continues independently');
});

test('shared maintenance expires source connections immediately and prunes source cards without an open view or connected account', async t => {
    const f = await fixture(t);
    f.auth.characters = () => [42, 43].map(id => ({ id, scopes: ['esi-location.read_location.v1'] }));
    const emit = (id, system_id, at) => {
        f.time(at); f.store.saveSnapshot(id, 'location', { status: 'ready', data: { solar_system_id: system_id },
            updatedAt: new Date(at).toISOString(), expiresAt: new Date(at + 60000).toISOString() }); f.service.observeSelectedLocation(id);
    };
    emit(42, W, AT); emit(42, X, AT + 20000);
    const source42 = f.api.state(42).source_map.id, expiry = Date.parse(f.api.map(42, source42).connections[0].expires_at);
    f.api.setActivePilot(43); emit(43, W, AT + 40000);
    const source43 = f.api.state(43).source_map.id;
    const raw = (id, key) => JSON.parse(f.store.db.prepare("SELECT body FROM universe_records WHERE character_id=? AND kind='jspace_map' AND id=?").get(id, key).body);
    f.auth.characters = () => []; // The cleanup path must not depend on an open page or valid active character.
    f.time(AT + 40000 + 30 * 60000); await f.service.tick();
    assert.deepEqual(raw(43, source43).nodes, []); assert.deepEqual(raw(43, source43).archived_nodes || [], [], 'source singleton cards have no archive');
    assert.equal(raw(42, source42).connections.length, 1);
    f.time(expiry); await f.service.tick();
    assert.deepEqual(raw(42, source42).connections, []); assert.equal(raw(42, source42).nodes.length, 2, 'only system cards receive the grace period');
    assert.equal(f.store.db.prepare("SELECT COUNT(*) AS total FROM universe_records WHERE character_id=42 AND kind='link' AND json_extract(body,'$.map_id')=?").get(source42).total, 0);
    f.time(expiry + 30 * 60000); await f.service.tick();
    const empty = raw(42, source42);
    assert.deepEqual(empty.nodes, []); assert.deepEqual(empty.archived_nodes || [], []); assert.deepEqual(empty.passages, []); assert.deepEqual(empty.activity, []);
});

test('Wanderer-compatible export preserves portable fields while excluding unroutable observations', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, confirmed: false, accessible: false, wh_type: 'A239' } });
    assert.equal(f.api.exportMap(42, map.id, 'wanderer').connections.length, 0);
    map = f.cmd(map, 'connection.save', { connection: { id: map.connections[0].id, confirmed: true, accessible: true, mass: 'reduced', life_status: 'eol', max_ship_size: 'small' } });
    map = f.cmd(map, 'signature.save', { signature: { system_id: W, signature_id: 'ABC-123', wh_type: 'A239', connection_id: map.connections[0].id } });
    const exported = f.api.exportMap(42, map.id, 'wanderer');
    assert.equal(exported.version, 1); assert.equal(exported.systems[0].solar_system_id, W); assert.equal(exported.connections[0].mass_status, 1); assert.equal(exported.connections[0].time_status, 2); assert.equal(exported.connections[0].ship_size_type, 0);
    assert.equal(exported.signatures[0].group, 'Wormhole'); assert.equal(exported.signatures[0].type, 'A239');
    const imported = f.api.importMap(43, { document: exported }); assert.equal(imported.connections[0].active, false); assert.equal(imported.signatures[0].type, 'Wormhole'); assert.equal(imported.signatures[0].wh_type, 'A239'); assert.equal(imported.signatures[0].last_seen_at, null);
});

test('destination search uses only the selected pilot chain and ignores caller-owned graph evidence', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    const beforeNavigation = f.service.state(42).navigation.itinerary;
    const preferences = { useWormholes: true, allowUnknownWormholeSize: true };
    const forged = { kind: 'wormhole', from_system_id: W, to_system_id: A, active: true, enabled: true, confirmed: true, accessible: true, expires_at: new Date(AT + 3600000).toISOString() };
    let result = f.service.jspaceDestinations(42, { map_id: map.id, originId: W, category: 'highsec', preferences, extraConnections: [forged], connections: [forged], feeds: { connections: [forged] } });
    assert.deepEqual(result.results, []);
    assert.throws(() => f.service.jspaceDestinations(43, { map_id: map.id, originId: W, category: 'highsec', preferences }), /private chain/);
    map = f.cmd(map, 'connection.save', { connection: { ...forged, add_missing_nodes: true } });
    result = f.service.jspaceDestinations(42, { map_id: map.id, originId: W, category: 'highsec', preferences });
    assert.equal(result.results[0].systemId, A); assert.equal(result.results[0].route.edges[0].id, map.connections[0].link_id);
    assert.deepEqual(f.service.state(42).navigation.itinerary, beforeNavigation, 'search must not draft or send navigation');
});

test('deleted signature bindings permit condition edits without rebinding and ship-size unknown can be recorded', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, max_ship_size: 'small' } });
    map = f.cmd(map, 'signature.save', { signature: { system_id: W, signature_id: 'ABC-123', connection_id: map.connections[0].id } });
    const deletedId = map.signatures[0].id; f.service.operations.removeSignature(42, deletedId, map.id);
    f.service.operations.saveSignature(42, { map_id: map.id, system_id: W, signature_id: 'ABC-123' });
    map = f.api.state(42).maps[0];
    map = f.cmd(map, 'connection.save', { connection: { ...map.connections[0], mass: 'reduced', life_status: 'eol', max_ship_size: null } });
    assert.equal(map.connections[0].mass, 'reduced'); assert.equal(map.connections[0].max_ship_size, null);
    assert.equal(map.connections[0].from_signature_record_id, deletedId); assert.equal(map.connections[0].from_signature_id, null);
    const otherMap = f.api.create(43, { name: 'Other pilot' });
    const other = f.service.operations.saveSignature(43, { map_id: otherMap.id, system_id: W, signature_id: 'ZZZ-999' });
    assert.throws(() => f.cmd(map, 'connection.save', { connection: { id: map.connections[0].id, from_signature_record_id: other.id } }), /belong to this pilot/);
    assert.throws(() => f.service.saveLink(42, { id: map.connections[0].link_id, from_system_id: A, from_signature_record_id: deletedId }), /belong to this pilot/);
});

test('drawn connections preserve explicit unknown lifetime until an observed expiry is deliberately supplied', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, confirmed: false, accessible: false, mass: 'unknown', life_status: 'unknown', expires_at: null } });
    const edge = map.connections[0];
    assert.equal(edge.expires_at, null); assert.equal(edge.expired, false); assert.equal(edge.active, false);
    assert.equal(canonical(f, map)[0].expires_at, null);
    f.time(AT + 3600000);
    map = f.cmd(map, 'connection.save', { connection: { id: edge.id, notes: 'Needs a scout to inspect both ends.' } });
    assert.equal(map.connections[0].expires_at, null, 'editing a drawn edge must not invent a lifetime');
    for (const changes of [{ confirmed: true }, { accessible: true }, { reverse_accessible: true }]) {
        assert.throws(() => f.cmd(map, 'connection.save', { connection: { id: edge.id, ...changes } }), /Record a wormhole expiry/);
    }
    assert.equal(f.api.state(42).maps[0].revision, map.revision, 'failed activation must not advance the map or mutate its canonical link');
    assert.equal(f.service.route(42, { map_id: map.id, originId: W, destinationId: X, preferences: { useWormholes: true, allowUnknownWormholeSize: true } }).status, 'no_route');
    map = f.cmd(map, 'connection.save', { connection: { id: edge.id, confirmed: true, accessible: true, duration_hours: 4 } });
    assert.equal(map.connections[0].expires_at, new Date(AT + 5 * 3600000).toISOString()); assert.equal(map.connections[0].active, true);
    const ordinaryManual = f.service.saveLink(42, { map_id: map.id, kind: 'wormhole', from_system_id: W, to_system_id: A });
    assert.equal(ordinaryManual.expires_at, new Date(AT + 17 * 3600000).toISOString(), 'existing manual creation defaults remain unchanged');
});

test('disconnected cards prune after the last expiry while metadata, signatures and reports survive rediscovery', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    const owner = { kind: 'corporation', id: 98000001, name: 'Local residents' };
    map = f.cmd(map, 'node.save', { node: { system_id: W, alias: 'Homeward', description: 'Resident intelligence', status: 'friendly', tags: ['residents'], effective_owner: owner } });
    map = f.cmd(map, 'comment.add', { comment: { system_id: W, body: 'Keep this scouting note' } });
    map = f.cmd(map, 'observation.save', { observation: { system_id: W, title: 'Resident citadel', kind: 'structure' } });
    map = f.cmd(map, 'signature.save', { signature: { system_id: W, signature_id: 'AAA-123', name: 'Saved signature' } });
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, duration_hours: 1, notes: 'Original edge note' } });
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, duration_hours: 4 } });
    f.time(AT + 4 * 3600000 + 29 * 60000); map = f.api.state(42).maps[0];
    assert.equal(map.nodes.length, 2, 'The later connection determines the grace period');
    assert.equal(map.nodes[0].disconnected_at, new Date(AT + 4 * 3600000).toISOString());
    f.time(AT + 4 * 3600000 + 30 * 60000); map = f.api.state(42).maps[0];
    assert.equal(map.nodes.length, 0); assert.equal(map.connections.length, 0); assert.equal(map.archived_nodes.length, 2);
    assert.ok(!map.archived_connections?.length, 'Only system records are archived');
    assert.deepEqual(canonical(f, map), [], 'Expired connection evidence is forgotten');
    assert.equal(map.observations[0].title, 'Resident citadel'); assert.equal(map.comments[0].body, 'Keep this scouting note');
    assert.equal(f.service.operations.state(42, map.id).signatures.length, 1);
    const imported = f.api.importMap(43, { document: f.api.exportMap(42, map.id), name: 'Archive copy' });
    assert.deepEqual(imported.archived_nodes.find(row => row.system_id === W).effective_owner, owner);
    assert.equal(f.service.operations.state(43, imported.id).signatures[0].signature_id, 'AAA-123');
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, add_missing_nodes: true, expires_at: null } });
    const restored = map.nodes.find(row => row.system_id === W);
    assert.equal(restored.alias, 'Homeward'); assert.equal(restored.description, 'Resident intelligence'); assert.deepEqual(restored.tags, ['residents']);
    assert.equal(restored.status, 'friendly'); assert.deepEqual(restored.effective_owner, owner); assert.equal(map.signatures[0].signature_id, 'AAA-123');
    assert.equal(map.connections[0].confirmed, false); assert.equal(map.connections[0].active, false);
});

test('deletion grace survives refreshes, reconnecting cancels it, and standalone cards are retained', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'node.save', { node: { system_id: A } });
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, expires_at: null } });
    f.time(AT + 60000); map = f.cmd(map, 'connection.remove', { connection_id: map.connections[0].id });
    const removedAt = new Date(AT + 60000).toISOString();
    assert.equal(map.nodes[0].disconnected_at, removedAt);
    f.time(AT + 29 * 60000); map = f.api.state(42).maps[0];
    assert.equal(map.nodes[0].disconnected_at, removedAt); assert.equal(map.nodes.length, 3);
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, expires_at: null } });
    assert.equal(map.nodes[0].disconnected_at, undefined);
    f.time(AT + 60 * 60000); map = f.api.state(42).maps[0]; assert.equal(map.nodes.length, 3);
    map = f.cmd(map, 'connection.remove', { connection_id: map.connections[0].id });
    f.time(AT + 90 * 60000); map = f.api.state(42).maps[0];
    assert.deepEqual(map.nodes.map(row => row.system_id), [A]);
    assert.deepEqual(canonical(f, map), [], 'Deleted connections leave no canonical remnants when systems are pruned');
});

test('unlock and manual re-add each grant disconnected cards a fresh thirty minutes', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'node.save', { node: { system_id: W, locked: true, alias: 'Keep me' } });
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, duration_hours: 1 } });
    f.time(AT + 10 * 3600000); map = f.api.state(42).maps[0];
    assert.deepEqual(map.nodes.map(row => row.system_id), [W]);
    map = f.cmd(map, 'node.save', { node: { system_id: W, locked: false } });
    assert.equal(map.nodes.length, 1, 'Unlocking does not instantly prune a long-disconnected card');
    f.time(AT + 10 * 3600000 + 29 * 60000); map = f.api.state(42).maps[0]; assert.equal(map.nodes.length, 1);
    f.time(AT + 10 * 3600000 + 30 * 60000); map = f.api.state(42).maps[0]; assert.equal(map.nodes.length, 0);
    map = f.cmd(map, 'node.save', { node: { system_id: W } });
    assert.equal(map.nodes[0].alias, 'Keep me');
    f.time(AT + 10 * 3600000 + 59 * 60000); map = f.api.state(42).maps[0]; assert.equal(map.nodes.length, 1);
    f.time(AT + 11 * 3600000); map = f.api.state(42).maps[0]; assert.equal(map.nodes.length, 0);
});

test('effective J-Space owners are private annotations, validated and preserved through manual removal', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    const owner = { kind: 'alliance', id: 99000001, name: 'Home Alliance' };
    map = f.cmd(map, 'node.save', { node: { system_id: W, effective_owner: owner } });
    assert.deepEqual(map.nodes[0].effective_owner, owner); assert.deepEqual(f.api.state(43).maps, []);
    for (const value of [{ ...owner, id: -1 }, { ...owner, name: '' }, { ...owner, kind: 'character' }]) {
        assert.throws(() => f.cmd(map, 'node.save', { node: { system_id: W, effective_owner: value } }));
    }
    assert.throws(() => f.cmd(map, 'node.save', { node: { system_id: A, effective_owner: owner } }), /J-Space/);
    map = f.cmd(map, 'node.remove', { system_id: W });
    map = f.cmd(map, 'node.save', { node: { system_id: W } });
    assert.deepEqual(map.nodes.find(row => row.system_id === W).effective_owner, owner);
    assert.deepEqual(f.service.state(42).links, [], 'Local ownership creates no travel permissions or canonical links');
    map = f.cmd(map, 'node.save', { node: { system_id: W, effective_owner: null } });
    assert.equal(map.nodes.find(row => row.system_id === W).effective_owner, null);
});
