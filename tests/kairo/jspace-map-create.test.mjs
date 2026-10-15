import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../../server/store.mjs';
import { createUniverse } from '../../server/universe.mjs';

const AT = Date.parse('2026-09-27T04:00:00Z'), K = 30000001, W = 31000001;
const atlas = { metadata: {}, regions: [], constellations: [], gates: [], systems: [
    { system_id: K, name: 'Known exit', space: 'known', security: .8, x: 0, y: 0, z: 0 },
    { system_id: W, name: 'J000001', space: 'wormhole', security: -1, x: 1, y: 0, z: 0 },
] };
async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-map-create-')), store = openStore(dir);
    const auth = { characters: () => [42, 43].map(id => ({ id, scopes: ['esi-location.read_location.v1'] })) };
    let clock = AT;
    const service = createUniverse(store, auth, {}, { staticData: atlas, now: () => clock, noSync: true });
    t.after(async () => { await service.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
    const emit = (id, system, at) => {
        clock = at;
        store.saveSnapshot(id, 'location', { status: 'ready', data: { solar_system_id: system }, updatedAt: new Date(at).toISOString(), expiresAt: new Date(at + 5000).toISOString() });
        service.observeSelectedLocation(id);
    };
    return { store, api: service.jspace, emit, time: value => { clock = value; } };
}

test('creation requires a nonempty connected roster and tracks precisely the chosen pilots by default', async t => {
    const f = await fixture(t), count = () => f.api.state(42).maps.length;
    for (const pilot_ids of [[], [999], [0], [42, 999], '42']) {
        assert.throws(() => f.api.create(42, { name: 'Invalid', pilot_ids }));
        assert.equal(count(), 0);
    }
    const map = f.api.create(42, { name: 'Alt expedition', description: 'Independent scouts', pilot_ids: [43] });
    assert.equal(map.description, 'Independent scouts');
    assert.deepEqual(map.pilots.map(row => [row.character_id, row.tracking]), [[43, true]]);
    assert.equal(map.track_passages, false);
    f.emit(42, K, AT); f.emit(42, W, AT + 6000);
    assert.equal(f.api.map(42, map.id).connections.length, 0, 'The owner is not implicitly tracked when deselected');
    f.emit(43, K, AT + 12000); f.emit(43, W, AT + 18000);
    const tracked = f.api.map(42, map.id);
    assert.deepEqual(new Set(tracked.nodes.map(row => row.system_id)), new Set([K, W]));
    assert.equal(tracked.connections.length, 1);
    assert.deepEqual(f.api.create(42, { name: 'Compatible default' }).pilots.map(row => row.character_id), [42]);
});

test('explicit source creation honors the selected pilots and scope while preserving live connection ages', async t => {
    const f = await fixture(t);
    f.emit(42, K, AT); f.emit(42, W, AT + 6000);
    const sourceId = f.api.state(42).source_map.id, source = f.api.map(42, sourceId);
    f.time(AT + 3600000);
    assert.equal(f.api.create(42, { name: 'Ordinary empty map', pilot_ids: [42] }).connections.length, 0);
    const copy = f.api.create(42, { name: 'My named chain', description: 'From the live source', pilot_ids: [42], source_map_id: sourceId });
    assert.equal(copy.read_only, false); assert.equal(copy.scope, null);
    assert.deepEqual(copy.pilots.map(row => row.character_id), [42]);
    assert.equal(copy.connections.length, 1);
    assert.notEqual(copy.connections[0].link_id, source.connections[0].link_id);
    assert.equal(copy.connections[0].expires_at, source.connections[0].expires_at);
    assert.equal(copy.connections[0].observed_at, source.connections[0].observed_at);
    assert.equal(f.api.create(42, { name: 'Different pilot', pilot_ids: [43], source_map_id: sourceId }).connections.length, 0);
    const scoped = f.api.create(42, { name: 'Exit scope', pilot_ids: [42], scope: { system_ids: [K] }, source_map_id: sourceId });
    assert.equal(scoped.connections.length, 1); assert.deepEqual(scoped.scope.system_ids, [K]);
    assert.throws(() => f.api.create(43, { name: 'Foreign source', source_map_id: sourceId }), /not found for this pilot/);
    assert.throws(() => f.api.create(42, { name: 'Wrong source kind', source_map_id: copy.id }), /live source/);
    f.store.db.exec("CREATE TRIGGER fail_new_map_link BEFORE INSERT ON universe_records WHEN NEW.kind='link' BEGIN SELECT RAISE(ABORT,'Synthetic create failure'); END;");
    const count = f.api.state(42).maps.length;
    assert.throws(() => f.api.create(42, { name: 'Failed copy', pilot_ids: [42], source_map_id: sourceId }), /Synthetic create failure/);
    assert.equal(f.api.state(42).maps.length, count, 'Failed source population cannot leave a partially created map');
});
