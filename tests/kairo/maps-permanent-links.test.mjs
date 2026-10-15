import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../../server/store.mjs';
import { createUniverse } from '../../server/universe.mjs';

const AT = Date.parse('2026-09-27T12:00:00Z'), A = 30000001, B = 30000002, C = 30000003, D = 30000004, W = 31000001;
const atlas = { metadata: {}, regions: [{ region_id: 1 }, { region_id: 2 }], constellations: [{ constellation_id: 10 }, { constellation_id: 20 }],
    systems: [A, B, C, D, W].map((system_id, index) => ({ system_id, name: String(system_id), space: system_id === W ? 'wormhole' : 'known',
        region_id: system_id === W ? 2 : 1, constellation_id: [A, B].includes(system_id) ? 10 : 20, security: -.2, x: index * 1e10, y: 0, z: 0 })),
    gates: [{ from_system_id: A, to_system_id: B }, { from_system_id: B, to_system_id: A }, { from_system_id: B, to_system_id: C }] };
async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-maps-')), store = openStore(dir), auth = { characters: () => [{ id: 42, name: 'Atlas Alpha', scopes: [] }, { id: 43, name: 'Atlas Beta', scopes: [] }] };
    let clock = AT;
    const service = createUniverse(store, auth, {}, { staticData: atlas, now: () => clock, noSync: true });
    t.after(async () => { await service.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
    return { store, service, api: service.jspace, time: value => { clock = value; }, create: name => service.jspace.create(42, { name: name || 'Brave space' }),
        cmd: (map, op, args = {}) => service.jspace.command(42, map.id, { revision: map.revision, op, ...args }) };
}
const allPositions = ids => ids.map((system_id, index) => ({ system_id, x: 120 + index * 350, y: 220 }));
function addNodes(f, map, ids) { for (const system_id of ids) map = f.cmd(map, 'node.save', { node: { system_id } }); return map; }
const canonical = f => f.store.db.prepare("SELECT body FROM universe_records WHERE character_id=42 AND kind='link'").all().map(row => JSON.parse(row.body));

test('region placement is one revision-checked atomic operation deriving only real intragroup gates and configured bridges', async t => {
    const f = await fixture(t); let map = addNodes(f, f.create(), [A]);
    map = f.cmd(map, 'node.save', { node: { system_id: A, x: -500, y: -600, locked: true, alias: 'Home' } });
    const bridge = f.service.saveLink(42, { kind: 'ansiblex', from_system_id: A, to_system_id: D, confirmed: true, accessible: true });
    const before = f.api.map(42, map.id);
    assert.throws(() => f.cmd(map, 'group.add', { group: { kind: 'region', id: 1 }, positions: allPositions([B, C]) }), /every new system/);
    assert.throws(() => f.cmd(map, 'group.add', { group: { kind: 'region', id: 1 }, positions: allPositions([B, C, W]) }), /each new group/);
    assert.throws(() => f.cmd(map, 'group.add', { group: { kind: 'region', id: 1 }, positions: [...allPositions([B, C]), { system_id: D, x: Infinity, y: 1 }] }), /coordinates/);
    assert.deepEqual(f.api.map(42, map.id), before, 'failed/staged placements write no partial nodes or edges');
    map = f.cmd(map, 'group.add', { group: { kind: 'region', id: 1 }, positions: allPositions([B, C, D]), connections: [{ kind: 'gate', from_system_id: A, to_system_id: D }] });
    assert.equal(map.revision, before.revision + 1); assert.equal(map.nodes.length, 4);
    assert.deepEqual(map.nodes.find(row => row.system_id === A), before.nodes[0], 'existing nodes retain location, locks and data');
    assert.equal(map.connections.filter(row => row.kind === 'gate').length, 2, 'reciprocal gate rows deduplicate');
    assert.equal(map.connections.filter(row => row.kind === 'ansiblex').length, 1);
    assert.equal(map.connections.find(row => row.kind === 'ansiblex').link_id, bridge.id);
    assert.ok(map.connections.every(row => !Object.hasOwn(row, 'mass') && !Object.hasOwn(row, 'expires_at') && !Object.hasOwn(row, 'life_status')));
    assert.equal(canonical(f).length, 1, 'permanent map references do not clone configured bridges');
    assert.throws(() => f.cmd(before, 'group.add', { group: { kind: 'region', id: 1 }, positions: allPositions([B, C, D]) }), error => error.status === 409);
    map = f.cmd(map, 'undo'); assert.equal(map.nodes.length, 1); assert.equal(map.connections.length, 0);
    assert.ok(canonical(f).some(row => row.id === bridge.id), 'layout undo cannot remove global network configuration');
});

test('constellation placement includes exactly its members and cannot authorise a fake gate', async t => {
    const f = await fixture(t); let map = f.create();
    map = f.cmd(map, 'group.add', { group: { kind: 'constellation', id: 10 }, positions: allPositions([A, B]) });
    assert.deepEqual(map.nodes.map(row => row.system_id), [A, B]); assert.equal(map.connections.length, 1);
    assert.throws(() => f.cmd(map, 'group.add', { group: { kind: 'region', id: 999 }, positions: [] }), /bundled atlas/);
    map = addNodes(f, map, [D]);
    assert.throws(() => f.cmd(map, 'connection.save', { connection: { kind: 'gate', from_system_id: A, to_system_id: D } }), /real stargates/);
    assert.throws(() => f.cmd(map, 'connection.save', { connection: { id: map.connections[0].id, kind: 'wormhole' } }), /original kind/);
    assert.throws(() => f.cmd(map, 'connection.save', { connection: { id: map.connections[0].id, life_status: 'collapsed' } }), /only to wormholes/);
    f.time(AT + 50 * 3600000); map = f.api.map(42, map.id); assert.equal(map.connections.length, 1); assert.equal(map.connections[0].active, true);
});

test('manual Ansiblex is private permanent evidence with explicit access and cannot leak to other maps or Atlas routes', async t => {
    const f = await fixture(t); let map = addNodes(f, f.create(), [A, D]), other = addNodes(f, f.create('Other map'), [A, D]);
    map = f.cmd(map, 'connection.save', { connection: { kind: 'ansiblex', from_system_id: A, to_system_id: D, from_port: 'bottom', to_port: 'top' } });
    let edge = map.connections[0]; assert.equal(edge.map_id, map.id); assert.equal(edge.confirmed, false); assert.equal(edge.accessible, false); assert.equal(edge.active, false);
    assert.equal(edge.from_port, 'bottom'); assert.equal(edge.to_port, 'top');
    assert.equal(f.service.state(42).links.length, 0);
    assert.throws(() => f.cmd(other, 'connection.save', { connection: { kind: 'ansiblex', link_id: edge.link_id } }), /not found/);
    assert.equal(f.service.route(42, { map_id: map.id, originId: A, destinationId: D, preferences: { useAnsiblex: true } }).status, 'no_route');
    map = f.cmd(map, 'connection.save', { connection: { id: edge.id, confirmed: true, accessible: true, notes: 'Observed available' } }); edge = map.connections[0];
    assert.equal(f.service.route(42, { map_id: map.id, originId: A, destinationId: D, preferences: { useAnsiblex: true } }).status, 'ok');
    assert.equal(f.service.route(42, { originId: A, destinationId: D, preferences: { useAnsiblex: true } }).status, 'no_route');
    assert.equal(f.service.route(42, { map_id: other.id, originId: A, destinationId: D, preferences: { useAnsiblex: true } }).status, 'no_route');
    assert.throws(() => f.cmd(map, 'connection.save', { connection: { id: edge.id, mass: 'critical' } }), /only to wormholes/);
    assert.throws(() => f.cmd(map, 'connection.save', { connection: { id: edge.id, from_port: 'centre' } }), /supported value/);
    assert.throws(() => f.cmd(map, 'passage.add', { passage: { connection_id: edge.id, from_system_id: A, to_system_id: D } }), /only to wormholes/);
    const exported = f.api.exportMap(42, map.id), copy = f.api.importMap(42, { document: exported, name: 'Portable bridge' });
    assert.equal(copy.connections[0].from_port, 'bottom'); assert.equal(copy.connections[0].confirmed, false); assert.notEqual(copy.connections[0].link_id, edge.link_id);
    f.time(AT + 72 * 3600000); map = f.api.map(42, map.id); assert.equal(map.connections.length, 1);
    map = f.cmd(map, 'connection.remove', { connection_id: edge.id });
    assert.ok(!canonical(f).some(row => row.id === edge.link_id));
    f.time(AT + 72 * 3600000 + 30 * 60000); map = f.api.map(42, map.id); assert.equal(map.nodes.length, 0, 'permanent link deletion starts the same system grace period');
});

test('configured bridge references retain global access, survive local deletion and disappear when source config is removed', async t => {
    const f = await fixture(t); let map = addNodes(f, f.create(), [A, D]);
    const bridge = f.service.saveLink(42, { kind: 'ansiblex', from_system_id: A, to_system_id: D, confirmed: false, accessible: false });
    map = f.cmd(map, 'connection.save', { connection: { kind: 'ansiblex', link_id: bridge.id } });
    assert.equal(map.connections[0].confirmed, false);
    assert.throws(() => f.cmd(map, 'connection.save', { connection: { id: map.connections[0].id, confirmed: true, accessible: true } }), /Universe Settings/);
    map = f.cmd(map, 'connection.remove', { connection_id: map.connections[0].id }); assert.equal(canonical(f).length, 1);
    map = f.cmd(map, 'connection.save', { connection: { kind: 'ansiblex', link_id: bridge.id } });
    map = f.cmd(map, 'comment.add', { comment: { connection_id: map.connections[0].id, body: 'Bridge approach' } });
    f.service.deleteLink(42, bridge.id); map = f.api.map(42, map.id);
    assert.equal(map.connections.length, 0); assert.equal(map.comments.length, 0, 'removed canonical bridge leaves no dependent connection notes');
});

test('notes derive author from connected pilot, preserve provenance on import, and never invent a pilot for legacy notes', async t => {
    const f = await fixture(t); let map = addNodes(f, f.create(), [A]);
    map = f.cmd(map, 'comment.add', { comment: { system_id: A, body: 'A note', author_id: 43, author_name: 'Spoofed' } });
    assert.equal(map.comments[0].author_id, 42); assert.equal(map.comments[0].author_name, 'Atlas Alpha');
    const exported = f.api.exportMap(42, map.id); exported.map.comments.push({ system_id: A, body: 'Legacy note', created_at: new Date(AT).toISOString() });
    const copy = f.api.importMap(42, { document: exported, name: 'Notes imported' });
    assert.equal(copy.comments[0].author_id, 42); assert.equal(copy.comments[0].author_name, 'Atlas Alpha');
    assert.equal(copy.comments[1].author_id, null); assert.equal(copy.comments[1].author_name, '');
});

test('reimporting configured bridges preserves unchanged map references and prunes only removed pairs', async t => {
    const f = await fixture(t); let map = addNodes(f, f.create(), [A, B, C, D]);
    let list = f.service.saveLinkList(42, { name: 'Brave bridges', accessible: true, text: `111 ${A} --> ${D}\n222 ${D} --> ${A}\n333 ${B} --> ${C}\n444 ${C} --> ${B}` });
    const first = list.links.find(link => link.from_system_id === A), second = list.links.find(link => link.from_system_id === B);
    map = f.cmd(map, 'connection.save', { connection: { kind: 'ansiblex', link_id: first.id, from_port: 'top' } });
    map = f.cmd(map, 'connection.save', { connection: { kind: 'ansiblex', link_id: second.id } });
    list = f.service.saveLinkList(42, { id: list.id, name: list.name, accessible: true, text: `222 ${D} --> ${A}\n111 ${A} --> ${D}` });
    assert.equal(list.links.length, 1); assert.equal(list.links[0].id, first.id);
    assert.equal(list.links[0].from_system_id, A); assert.equal(list.links[0].structure_id, 111); assert.equal(list.links[0].reverse_structure_id, 222);
    map = f.api.map(42, map.id); assert.equal(map.connections.length, 1); assert.equal(map.connections[0].link_id, first.id); assert.equal(map.connections[0].from_port, 'top');
    f.service.deleteLinkList(42, list.id); map = f.api.map(42, map.id); assert.equal(map.connections.length, 0);
});

test('deleting a map removes every private permanent link but retains shared configured bridges', async t => {
    const f = await fixture(t); let map = addNodes(f, f.create(), [A, D]);
    const shared = f.service.saveLink(42, { kind: 'ansiblex', from_system_id: A, to_system_id: D });
    const unattached = f.service.saveLink(42, { map_id: map.id, kind: 'ansiblex', from_system_id: B, to_system_id: C, confirmed: false });
    map = f.cmd(map, 'connection.save', { connection: { kind: 'ansiblex', link_id: shared.id } });
    map = f.cmd(map, 'connection.save', { connection: { kind: 'ansiblex', from_system_id: A, to_system_id: D } });
    const privateId = map.connections.find(row => row.map_id === map.id).link_id;
    f.api.remove(42, map.id, { revision: map.revision });
    const remaining = canonical(f); assert.deepEqual(remaining.map(row => row.id), [shared.id]);
    assert.ok(!remaining.some(row => [privateId, unattached.id].includes(row.id)));
});
