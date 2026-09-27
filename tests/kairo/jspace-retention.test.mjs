import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../../server/store.mjs';
import { createUniverse } from '../../server/universe.mjs';

const AT = Date.parse('2026-09-27T02:00:00Z'), MINUTE = 60000, HOUR = 60 * MINUTE;
const A = 30000001, W = 31000001, X = 31000002;
const atlas = { metadata: {}, regions: [], constellations: [], gates: [], systems: [
    { system_id: A, name: 'Alpha', space: 'known', security: .8, x: 0, y: 0, z: 0 },
    { system_id: W, name: 'J000001', space: 'wormhole', security: -1, x: 1, y: 0, z: 0, wormhole_class_id: 4 },
    { system_id: X, name: 'J000002', space: 'wormhole', security: -1, x: 2, y: 0, z: 0, wormhole_class_id: 1 },
] };

async function fixture(t) {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-connection-retention-'));
    const store = openStore(directory), auth = { characters: () => [{ id: 42, scopes: [] }, { id: 43, scopes: [] }] };
    let clock = AT, service = create();
    function create() { return createUniverse(store, auth, {}, { staticData: atlas, now: () => clock, noSync: true }); }
    t.after(async () => { await service.close(); store.close(); await rm(directory, { recursive: true, force: true }); });
    return {
        store, get service() { return service; }, get api() { return service.jspace; },
        time(value) { clock = value; },
        async restart() { await service.close(); service = create(); },
        cmd(map, op, args = {}) { return service.jspace.command(42, map.id, { revision: map.revision, op, ...args }); },
        map(id) { return service.jspace.state(42).maps.find(row => row.id === id); },
        records() {
            return [...store.db.prepare('SELECT kind,id,body FROM universe_records').all(),
                ...store.db.prepare('SELECT kind,id,body FROM universe_operations_records').all()];
        },
    };
}

function createMap(f, name = 'Home chain') {
    let map = f.api.create(42, { name });
    for (const system_id of [W, X]) map = f.cmd(map, 'node.save', { node: { system_id } });
    return map;
}

function populatedConnection(f, map) {
    map = f.cmd(map, 'node.save', { node: { system_id: W, alias: 'Resident home', status: 'friendly', description: 'Persistent system intelligence',
        effective_owner: { kind: 'corporation', id: 98000001, name: 'Residents' } } });
    map = f.cmd(map, 'comment.add', { comment: { system_id: W, body: 'Persistent system note' } });
    map = f.cmd(map, 'observation.save', { observation: { system_id: W, kind: 'structure', title: 'Resident citadel' } });
    map = f.cmd(map, 'signature.save', { signature: { system_id: W, signature_id: 'GAS-123', type: 'Gas Site', name: 'Unrelated system signature' } });
    map = f.cmd(map, 'connection.save', { connection: { from_system_id: W, to_system_id: X, duration_hours: 1, notes: 'Temporary connection detail' } });
    const edgeId = map.connections[0].id;
    for (const [system_id, signature_id] of [[W, 'AAA-123'], [X, 'BBB-456']]) {
        map = f.cmd(map, 'signature.save', { signature: { system_id, signature_id, connection_id: edgeId, name: 'Temporary entrance' } });
    }
    map = f.cmd(map, 'comment.add', { comment: { connection_id: edgeId, body: 'Temporary connection note' } });
    map = f.cmd(map, 'passage.add', { passage: { connection_id: edgeId, from_system_id: W, to_system_id: X, ship_name: 'Temporary passage record', mass_kg: 1000 } });
    // These layout changes deliberately put the populated connection in undo history.
    map = f.cmd(map, 'nodes.position', { positions: [{ system_id: X, x: 500, y: 200 }] });
    return f.cmd(map, 'nodes.position', { positions: [{ system_id: X, x: 600, y: 200 }] });
}

function assertSystemHistory(map) {
    const system = [...map.nodes, ...(map.archived_nodes || [])].find(row => row.system_id === W);
    assert.equal(system.alias, 'Resident home');
    assert.equal(system.description, 'Persistent system intelligence');
    assert.equal(system.effective_owner.name, 'Residents');
    assert.equal(map.comments.find(row => row.system_id === W)?.body, 'Persistent system note');
    assert.equal(map.observations[0]?.title, 'Resident citadel');
}

function assertForgotten(f, ids) {
    const body = JSON.stringify(f.records());
    for (const id of ids) assert.ok(!body.includes(id), `Removed connection record ${id} must not survive in storage or undo history`);
}

test('deleting a connection forgets its evidence and undo copies immediately, preserving systems and an independent duplicated map', async t => {
    const f = await fixture(t);
    let original = populatedConnection(f, createMap(f)), copy = f.api.duplicate(42, original.id, { revision: original.revision, name: 'Independent copy' });
    const edge = original.connections[0], boundIds = original.signatures.filter(row => row.connection_ids.includes(edge.id)).map(row => row.id);
    assert.notEqual(copy.connections[0].link_id, edge.link_id, 'Duplicating a map copies connection evidence into independent ownership');
    assert.ok(copy.signatures.every(row => !boundIds.includes(row.id)), 'Copied scanner observations have independent identities');
    const forgottenIds = [edge.id, edge.link_id, ...boundIds, original.passages[0].id, original.comments.find(row => row.connection_id === edge.id).id];
    copy = f.cmd(copy, 'nodes.position', { positions: [{ system_id: X, x: 750 }] });
    const removedSignature = original.signatures.find(row => row.signature_id === 'AAA-123');
    original = f.cmd(original, 'signature.remove', { signature_id: removedSignature.id });
    original = f.cmd(original, 'signature.save', { signature: { system_id: W, signature_id: 'AAA-123', name: 'New observation reusing the code' } });
    const replacement = original.signatures.find(row => row.signature_id === 'AAA-123');
    assert.notEqual(replacement.id, removedSignature.id);
    f.time(AT + MINUTE);
    original = f.cmd(original, 'connection.remove', { connection_id: edge.id });
    assert.deepEqual(original.connections, []); assert.deepEqual(original.passages, []);
    assert.equal(original.nodes.length, 2, 'Only system cards receive the grace period');
    assert.equal(original.nodes[0].disconnected_at, new Date(AT + MINUTE).toISOString());
    assert.deepEqual(original.signatures.map(row => row.signature_id).sort(), ['AAA-123', 'GAS-123']);
    assert.equal(original.signatures.find(row => row.id === replacement.id)?.name, 'New observation reusing the code', 'Deleting a bound signature tombstone must not delete a later observation reusing its code');
    assertSystemHistory(original); assertForgotten(f, forgottenIds);
    for (const format of ['kairo', 'wanderer']) {
        const document = JSON.stringify(f.api.exportMap(42, original.id, format));
        assert.ok(!document.includes('Temporary connection')); assert.ok(!document.includes('Temporary passage'));
    }
    copy = f.cmd(f.map(copy.id), 'undo');
    assert.equal(copy.connections.length, 1); assert.equal(copy.passages.length, 1);
    assert.equal(copy.signatures.length, 3, 'Deleting another map must not remove this map’s observations');
    f.time(AT + 31 * MINUTE); original = f.map(original.id);
    assert.deepEqual(original.nodes, []); assertSystemHistory(original);
    assert.equal(f.map(copy.id).nodes.length, 2, 'The copied map still has its own unexpired connection');
    original = f.cmd(original, 'node.save', { node: { system_id: W } });
    assertSystemHistory(original); assert.deepEqual(original.signatures.map(row => row.signature_id).sort(), ['AAA-123', 'GAS-123']);
});

test('expiry removes J-J, J-K and K-J connections at their exact deadline while system locks and grace remain separate', async t => {
    const f = await fixture(t); let map = createMap(f);
    map = f.cmd(map, 'node.save', { node: { system_id: A } });
    map = f.cmd(map, 'node.save', { node: { system_id: W, locked: true, alias: 'Locked home' } });
    for (const [from_system_id, to_system_id, duration_hours] of [[W, X, 1], [W, A, 4], [A, X, 4.5]]) {
        map = f.cmd(map, 'connection.save', { connection: { from_system_id, to_system_id, duration_hours, locked: true } });
    }
    map = f.cmd(map, 'nodes.position', { positions: [{ system_id: X, x: 450 }] });
    map = f.cmd(map, 'nodes.position', { positions: [{ system_id: X, x: 550 }] });
    const edges = [...map.connections];
    assert.ok(edges.every(edge => !edge.locked), 'Connections do not inherit the system-lock contract');
    f.time(AT + HOUR - 1); assert.equal(f.map(map.id).connections.length, 3);
    f.time(AT + HOUR); f.service.pruneExpired(42); map = f.map(map.id);
    assert.equal(map.connections.length, 2); assertForgotten(f, [edges[0].id, edges[0].link_id]);
    map = f.cmd(map, 'undo');
    assert.equal(map.connections.length, 2, 'Undoing a layout change cannot resurrect an expired connection');
    assert.ok(map.nodes.every(node => !node.disconnected_at), 'A remaining connection keeps the endpoint in the chain');
    f.time(AT + 4 * HOUR); f.service.pruneExpired(42); map = f.map(map.id);
    assert.equal(map.connections.length, 1); assertForgotten(f, [edges[1].id, edges[1].link_id]);
    assert.equal(map.nodes.find(node => node.system_id === W).disconnected_at, new Date(AT + 4 * HOUR).toISOString());
    f.time(AT + 4.5 * HOUR); f.service.pruneExpired(42); map = f.map(map.id);
    assert.deepEqual(map.connections, []); assertForgotten(f, edges.flatMap(edge => [edge.id, edge.link_id]));
    assert.equal(map.nodes.length, 3);
    f.time(AT + 5 * HOUR); map = f.map(map.id);
    assert.deepEqual(map.nodes.map(node => node.system_id), [W], 'A locked system survives; its expired links do not');
    map = f.cmd(map, 'node.save', { node: { system_id: W, locked: false } });
    f.time(AT + 5.5 * HOUR - 1); assert.equal(f.map(map.id).nodes.length, 1);
    f.time(AT + 5.5 * HOUR); map = f.map(map.id); assert.deepEqual(map.nodes, []);
    map = f.cmd(map, 'node.save', { node: { system_id: W } }); assert.equal(map.nodes[0].alias, 'Locked home');
    f.time(AT + 6 * HOUR - 1); assert.equal(f.map(map.id).nodes.length, 1);
    f.time(AT + 6 * HOUR); assert.deepEqual(f.map(map.id).nodes, []);
});

test('legacy archived connections are forgotten on restart and import without losing system records or reviving their signatures', async t => {
    const f = await fixture(t); const original = populatedConnection(f, createMap(f));
    const document = f.api.exportMap(42, original.id), edge = original.connections[0];
    const boundIds = original.signatures.filter(row => row.connection_ids.includes(edge.id)).map(row => row.id);
    const record = f.store.db.prepare("SELECT body FROM universe_records WHERE character_id=42 AND kind='jspace_map' AND id=?").get(original.id);
    const legacy = JSON.parse(record.body);
    legacy.archived_connections = legacy.connections; legacy.connections = [];
    f.store.db.prepare("UPDATE universe_records SET body=? WHERE character_id=42 AND kind='jspace_map' AND id=?").run(JSON.stringify(legacy), original.id);
    f.store.db.prepare('INSERT INTO place_notes VALUES(?,?,?,?,?,?,?)').run('system', W, 'Legacy system', 'Legacy resident note', '["resident"]', 'none', new Date(AT).toISOString());
    f.store.db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?)').run(42, 'pin', 'legacy-pin', JSON.stringify({ id: 'legacy-pin', system_id: W, label: 'Legacy staging marker' }), new Date(AT).toISOString());
    await f.restart();
    const restored = f.map(original.id);
    assert.deepEqual(restored.connections, []); assert.ok(!restored.archived_connections?.length);
    assert.deepEqual(restored.passages, []); assertSystemHistory(restored);
    assert.ok(restored.comments.some(row => row.body === 'Legacy resident note'));
    assert.ok(restored.comments.some(row => row.body === 'Legacy staging marker'));
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM place_notes WHERE kind='system' AND entity_id=?").get(W).n, 0);
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM universe_records WHERE kind='pin' AND id='legacy-pin'").get().n, 0);
    assert.deepEqual(f.api.create(42, { name: 'No old annotations' }).comments, []);
    assertForgotten(f, [edge.id, edge.link_id, ...boundIds]);
    // Old native exports can contain both an expired live row and archived edge history.
    document.map.connections[0].expires_at = new Date(AT - 1).toISOString();
    document.map.archived_connections = structuredClone(document.map.connections);
    const imported = f.api.importMap(43, { document, name: 'Legacy data import' });
    assert.deepEqual(imported.connections, []); assert.deepEqual(imported.passages, []);
    assert.deepEqual(imported.signatures.map(row => row.signature_id), ['GAS-123']);
    assertSystemHistory(imported);
    const exported = JSON.stringify(f.api.exportMap(43, imported.id));
    assert.ok(!exported.includes('Temporary connection')); assert.ok(!exported.includes('Temporary passage'));
});

test('scanner observations with the same system and code belong to their selected map and cannot be deleted by another map', async t => {
    const f = await fixture(t); let first = createMap(f, 'First map'), second = createMap(f, 'Second map');
    first = f.cmd(first, 'connection.save', { connection: { from_system_id: W, to_system_id: X, duration_hours: 1 } });
    first = f.cmd(first, 'signature.save', { signature: { system_id: W, signature_id: 'AAA-123', name: 'First entrance', connection_id: first.connections[0].id } });
    assert.deepEqual(f.map(second.id).signatures, [], 'A map has no automatic access to another map’s scanning data');
    second = f.cmd(second, 'signature.save', { signature: { system_id: W, signature_id: 'AAA-123', name: 'Independent observation' } });
    assert.notEqual(first.signatures[0].id, second.signatures[0].id);
    assert.equal(f.map(first.id).signatures[0].name, 'First entrance');
    first = f.cmd(first, 'connection.remove', { connection_id: first.connections[0].id });
    assert.deepEqual(first.signatures, []);
    assert.equal(f.map(second.id).signatures[0].name, 'Independent observation');
    assert.deepEqual(f.api.state(43).maps, [], 'Map ownership remains pilot-isolated too');
});
