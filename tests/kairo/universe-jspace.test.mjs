import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../../server/store.mjs';
import { createUniverse } from '../../server/universe.mjs';

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

test('private chain maps survive reopening, isolate pilots and require revision-matched writes', async t => {
    const f = await fixture(t); let map = f.create();
    assert.deepEqual(f.api.state(43).maps, []); assert.deepEqual(f.api.state(0).maps, []);
    assert.throws(() => f.api.create(0, { name: 'Guest map' }), /connected pilot/);
    assert.throws(() => f.api.command(43, map.id, { revision: 1, op: 'map.update', name: 'Hijack' }), /not found/);
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

test('known discoveries seed diagrams without converting visits or static classes into route links', async t => {
    const f = await fixture(t);
    f.store.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(42, W, 'J000001', new Date(AT).toISOString());
    f.service.savePin(42, { system_id: X, label: 'Discovery' });
    let map = f.api.create(42, { name: 'Discovered chain', seed_discovery: true });
    assert.deepEqual(map.nodes.map(row => row.system_id), [W, X]); assert.deepEqual(map.connections, []); assert.deepEqual(f.service.state(42).links, []);
    const proposal = f.service.saveLink(42, { kind: 'wormhole', from_system_id: W, to_system_id: X, confirmed: false, accessible: false });
    map = f.api.create(42, { name: 'Travel proposals', seed_discovery: true });
    assert.equal(map.connections[0].link_id, proposal.id); assert.equal(map.connections[0].active, false);
    assert.equal(map.connections[0].confirmed, false);
});

test('connections use canonical links, demand explicit confirmation and reflect expiry/removal', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, duration_hours: 1, mass: 'stable' } });
    let edge = map.connections[0]; assert.equal(edge.active, false); assert.equal(edge.confirmed, false); assert.equal(map.can_undo, false);
    assert.equal(f.service.state(42).links[0].id, edge.link_id);
    map = f.cmd(map, 'connection.save', { connection: { id: edge.id, confirmed: true, accessible: true } }); edge = map.connections[0];
    assert.equal(edge.active, true);
    const route = f.service.route(42, { originId: W, destinationId: X, preferences: { useWormholes: true, allowUnknownWormholeSize: true } });
    assert.equal(route.status, 'ok'); assert.equal(route.edges[0].id, edge.link_id);
    f.time(AT + 3600001); assert.equal(f.api.state(42).maps[0].connections[0].expired, true); assert.equal(f.api.state(42).maps[0].connections[0].active, false);
    f.service.deleteLink(42, edge.link_id);
    assert.equal(f.api.state(42).maps[0].connections[0].missing, true); assert.equal(f.api.state(42).maps[0].connections[0].active, false);
});

test('passage ledger records direction and observed mass without claiming remaining mass', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, confirmed: true, accessible: true } }); const edge = map.connections[0];
    map = f.cmd(map, 'passage.add', { passage: { connection_id: edge.id, from_system_id: W, to_system_id: X, pilot_name: 'Scout', ship_name: 'Buzzard', mass_kg: 1270000 } });
    map = f.cmd(map, 'passage.add', { passage: { connection_id: edge.id, from_system_id: X, to_system_id: W, pilot_name: 'Scout' } });
    assert.equal(map.connections[0].observed_mass_kg, 1270000); assert.equal(map.connections[0].unweighed_passages, 1); assert.equal(map.connections[0].remaining_mass_kg, null);
    assert.equal(f.service.state(42).links[0].mass, 'unknown', 'a ledger total cannot change observed collapse state');
    assert.throws(() => f.cmd(map, 'passage.add', { passage: { connection_id: edge.id, from_system_id: W, to_system_id: A } }), /endpoints/);
    assert.throws(() => f.cmd(map, 'passage.add', { passage: { connection_id: edge.id, from_system_id: W, to_system_id: X, mass_kg: -2 } }), /positive/);
    map = f.cmd(map, 'connection.save', { connection: { id: edge.id, life_status: 'collapsed' } });
    assert.equal(map.connections[0].active, false); assert.equal(f.service.state(42).links[0].enabled, false);
});

test('canonical scanner signatures link both endpoints and deletions do not invent replacement observations', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X } }); const edge = map.connections[0];
    map = f.cmd(map, 'signature.save', { signature: { system_id: W, signature_id: 'AAA-123', name: 'Entrance', connection_id: edge.id } });
    map = f.cmd(map, 'signature.save', { signature: { system_id: X, signature_id: 'BBB-456', name: 'Return', connection_id: edge.id } });
    assert.equal(f.service.operations.state(42).signatures.length, 2);
    assert.equal(f.service.state(42).links[0].from_signature, 'AAA-123'); assert.equal(f.service.state(42).links[0].to_signature, 'BBB-456');
    assert.ok(map.signatures.every(row => row.connection_ids.includes(edge.id)));
    const old = map.signatures.find(row => row.signature_id === 'AAA-123');
    f.service.operations.removeSignature(42, old.id);
    f.service.operations.saveSignature(42, { system_id: W, signature_id: 'AAA-123' });
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
    assert.equal(map.connections[0].mass, 'reduced'); assert.equal(map.connections[0].max_ship_size, 'small'); assert.equal(map.connections[0].active, false); assert.equal(map.connections[0].confirmed, false); assert.equal(map.connections[0].expired, true);
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
    assert.throws(() => f.cmd(map, 'signature.save', { signature: { system_id: W, signature_id: 'ABC-123', connection_id: map.connections[0].id } }), /Unlock/);
    assert.equal(f.service.operations.state(42).signatures.length, 0); assert.equal(f.api.state(42).maps[0].revision, revision);
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
    assert.equal(f.api.state(43).maps.length, 0); assert.equal(f.service.state(43).links.length, 1, 'map removal must not silently delete canonical observations');
});

test('duplicating a chain preserves canonical ages and shares life/mass while map edits remain independent', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, confirmed: true, accessible: true, duration_hours: 4 } });
    map = f.cmd(map, 'comment.add', { comment: { body: 'Original note', connection_id: map.connections[0].id } });
    const originalLink = f.service.state(42).links[0]; f.time(AT + 600000);
    let copy = f.api.duplicate(42, map.id, { revision: map.revision, name: 'Scouting copy' });
    assert.notEqual(copy.id, map.id); assert.notEqual(copy.connections[0].id, map.connections[0].id); assert.equal(copy.connections[0].link_id, map.connections[0].link_id);
    assert.equal(copy.connections[0].expires_at, originalLink.expires_at); assert.equal(copy.connections[0].updated_at, originalLink.updated_at);
    assert.equal(copy.comments[0].connection_id, copy.connections[0].id);
    copy = f.cmd(copy, 'connection.save', { connection: { id: copy.connections[0].id, life_status: 'eol', mass: 'reduced' } });
    const refreshed = f.api.state(42).maps.find(row => row.id === map.id);
    assert.equal(refreshed.connections[0].life_status, 'eol'); assert.equal(refreshed.connections[0].mass, 'reduced');
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
    assert.equal(map.nodes.length, 0); assert.equal(map.connections.length, 0); assert.equal(map.passages.length, 1, 'observations remain in the private archive');
    assert.equal(f.service.state(42).links.length, 1, 'removing diagram cards must not mutate routing truth');
    map = f.cmd(map, 'undo'); assert.equal(map.nodes.length, 2); assert.equal(map.connections.length, 1);
});

test('opt-in sampled passage tracking is deduplicated, reviewable and never changes connection trust', async t => {
    const f = await fixture(t); let map = twoNodes(f, f.create());
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, confirmed: true, accessible: true } });
    const before = { status: 'ready', updatedAt: new Date(AT - 10000).toISOString(), data: { solar_system_id: W } }, after = { status: 'ready', updatedAt: new Date(AT).toISOString(), data: { solar_system_id: X } };
    f.service.observeTravel(42, before, after); assert.equal(f.api.state(42).maps[0].passages.length, 0);
    map = f.cmd(map, 'map.update', { track_passages: true }); const canonical = f.service.state(42).links;
    f.service.observeTravel(42, before, after); f.service.observeTravel(42, before, after);
    map = f.api.state(42).maps[0]; assert.equal(map.passages.length, 1); assert.equal(map.passages[0].source, 'sampled_location'); assert.equal(map.passages[0].reviewed, false); assert.equal(map.passages[0].mass_kg, null);
    assert.deepEqual(f.service.state(42).links, canonical); assert.equal(map.can_undo, false);
    map = f.cmd(map, 'passage.save', { passage: { id: map.passages[0].id, notes: 'Reviewed the observed transition.' } });
    assert.equal(map.passages[0].source, 'sampled_location'); assert.equal(map.passages[0].reviewed, true);
    f.service.observeTravel(42, before, after); assert.equal(f.api.state(42).maps[0].passages.length, 1, 'reviewing preserves the sample deduplication identity');
    f.service.saveLink(42, { kind: 'wormhole', from_system_id: W, to_system_id: X, confirmed: true, accessible: true });
    f.time(AT + 1000); f.service.observeTravel(42, before, { ...after, updatedAt: new Date(AT + 1000).toISOString() });
    assert.equal(f.api.state(42).maps[0].passages.length, 1, 'ambiguous parallel connections must not invent a passage identity');
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
    const deletedId = map.signatures[0].id; f.service.operations.removeSignature(42, deletedId);
    f.service.operations.saveSignature(42, { system_id: W, signature_id: 'ABC-123' });
    map = f.api.state(42).maps[0];
    map = f.cmd(map, 'connection.save', { connection: { ...map.connections[0], mass: 'reduced', life_status: 'eol', max_ship_size: null } });
    assert.equal(map.connections[0].mass, 'reduced'); assert.equal(map.connections[0].max_ship_size, null);
    assert.equal(map.connections[0].from_signature_record_id, deletedId); assert.equal(map.connections[0].from_signature_id, null);
    const other = f.service.operations.saveSignature(43, { system_id: W, signature_id: 'ZZZ-999' });
    assert.throws(() => f.cmd(map, 'connection.save', { connection: { id: map.connections[0].id, from_signature_record_id: other.id } }), /belong to this pilot/);
    assert.throws(() => f.service.saveLink(42, { id: map.connections[0].link_id, from_system_id: A, from_signature_record_id: deletedId }), /belong to this pilot/);
});
