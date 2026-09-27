import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../../server/store.mjs';
import { createUniverse } from '../../server/universe.mjs';

const AT = Date.parse('2026-09-27T12:00:00Z'), W = 31000001;
const atlas = { metadata: {}, regions: [], constellations: [], systems: [
    { system_id: W, name: 'J000001', space: 'wormhole', security: -1, x: 0, y: 0, z: 0, wormhole_class_id: 4 },
], gates: [] };
async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-jspace-portable-')), store = openStore(dir), events = [];
    const auth = { characters: () => [{ id: 42, name: 'Private pilot', scopes: [] }, { id: 43, name: 'Other pilot', scopes: [] }] };
    const service = createUniverse(store, auth, {}, { staticData: atlas, now: () => AT, noSync: true, publish: event => events.push(event) });
    t.after(async () => { await service.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
    const api = service.jspace, operations = service.operations;
    let map = api.create(42, { name: 'Native source chain' });
    map = api.command(42, map.id, { revision: map.revision, op: 'node.save', node: { system_id: W, alias: 'Private home' } });
    operations.saveConfig(42, { ...operations.config(42), watched_system_ids: [W], log_directory: '/private/logs/not-portable' });
    operations.ingestIntel(42, { map_id: map.id, text: 'J000001 hostile', observed_at: new Date(AT - 60000).toISOString() });
    operations.saveUpgrade(42, { map_id: map.id, system_id: W, slot: 1, name: 'Home infrastructure', notes: 'Retained map note' });
    operations.saveSignature(42, { map_id: map.id, system_id: W, signature_id: 'ABC-123', notes: 'Independent scanner context' });
    return { store, service, api, operations, events, map };
}

test('native map export/import and duplication preserve isolated operational records without config or live telemetry', async t => {
    const { api, operations, events, map } = await fixture(t);
    const exported = api.exportMap(42, map.id), original = operations.state(42, map.id), beforeEvents = events.length;
    assert.equal(exported.map.operations, undefined);
    assert.deepEqual(Object.keys(exported.map.operational_records).sort(), ['alerts', 'intel', 'upgrades', 'version']);
    assert.equal(JSON.stringify(exported).includes('/private/logs/not-portable'), false);
    assert.equal(exported.map.operational_records.config, undefined);
    assert.equal(exported.map.operational_records.location, undefined);
    assert.equal(exported.map.operational_records.pilots, undefined);
    assert.equal(exported.map.operational_records.fleet, undefined);
    assert.equal(api.previewImport(43, { document: exported }).valid, true);
    const imported = api.importMap(43, { document: exported }), restored = operations.state(43, imported.id);
    assert.equal(restored.intel.length, 1); assert.equal(restored.alerts.length, 1); assert.equal(restored.upgrades.length, 1);
    assert.notEqual(restored.intel[0].id, original.intel[0].id);
    assert.equal(restored.intel[0].observed_at, original.intel[0].observed_at);
    assert.equal(restored.intel[0].expires_at, original.intel[0].expires_at);
    assert.equal(restored.alerts[0].intel_id, restored.intel[0].id);
    assert.notEqual(restored.alerts[0].id, original.alerts[0].id);
    assert.notEqual(restored.upgrades[0].id, original.upgrades[0].id);
    assert.notEqual(restored.signatures[0].id, original.signatures[0].id);
    operations.saveUpgrade(43, { ...restored.upgrades[0], notes: 'Only imported copy' });
    operations.removeIntel(43, restored.intel[0].id, imported.id);
    assert.equal(operations.state(42, map.id).intel.length, 1);
    assert.equal(operations.state(42, map.id).upgrades[0].notes, 'Retained map note');
    const duplicate = api.duplicate(42, map.id, { revision: map.revision }), copied = operations.state(42, duplicate.id);
    assert.equal(copied.intel.length, 1, 'Native duplication imports each operation once');
    assert.equal(copied.upgrades.length, 1); assert.equal(copied.alerts[0].intel_id, copied.intel[0].id);
    assert.notEqual(copied.intel[0].id, original.intel[0].id);
    assert.equal(events.length, beforeEvents, 'Portable alert observations never trigger fresh operational notifications');
    const source = api.state(42).source_map, sourceExport = api.exportMap(42, source.id);
    assert.equal(sourceExport.map.operations, undefined); assert.equal(sourceExport.map.operational_records, undefined);
    assert.deepEqual(sourceExport.map.signatures, []);
});

test('native map operational validation is atomic and older exports without the records remain compatible', async t => {
    const { api, operations, store, map } = await fixture(t), exported = api.exportMap(42, map.id);
    const snapshot = () => ({ maps: store.db.prepare('SELECT * FROM universe_records ORDER BY character_id,kind,id').all(),
        operations: store.db.prepare('SELECT * FROM universe_operations_records ORDER BY character_id,kind,id').all() });
    const before = snapshot(), malformed = structuredClone(exported);
    malformed.map.operational_records.alerts[0].intel_id = 'missing-intel';
    assert.equal(api.previewImport(42, { document: malformed }).valid, false);
    assert.deepEqual(snapshot(), before);
    assert.throws(() => api.importMap(42, { document: malformed }), /missing intel/);
    assert.deepEqual(snapshot(), before, 'Invalid operation records cannot create a map or partial scanner data');
    store.db.exec(`CREATE TRIGGER fail_native_map_upgrade BEFORE INSERT ON universe_operations_records WHEN NEW.kind LIKE 'upgrade:map:%' BEGIN SELECT RAISE(ABORT,'Synthetic native import failure'); END;`);
    assert.throws(() => api.importMap(42, { document: exported }), /Synthetic native import failure/);
    assert.deepEqual(snapshot(), before, 'A storage failure rolls back the new map and every imported observation');
    store.db.exec('DROP TRIGGER fail_native_map_upgrade');
    const legacy = structuredClone(exported); delete legacy.map.operational_records;
    const imported = api.importMap(42, { document: legacy, name: 'Older compatible export' });
    assert.equal(imported.nodes[0].alias, 'Private home');
    const result = operations.state(42, imported.id);
    assert.equal(result.signatures.length, 1); assert.deepEqual(result.intel, []); assert.deepEqual(result.upgrades, []); assert.deepEqual(result.alerts, []);
});
