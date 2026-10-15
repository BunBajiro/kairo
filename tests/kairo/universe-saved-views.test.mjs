import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../server/store.mjs';
import { createUniverse } from '../../server/universe.mjs';

const AT = Date.parse('2026-09-30T09:00:00Z');
const atlas = { metadata: {}, regions: [], constellations: [], systems: [], gates: [] };
async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-saved-views-')), store = openStore(dir);
    const service = createUniverse(store, { characters: () => [{ id: 42 }, { id: 43 }] }, {}, { staticData: atlas, now: () => AT, noSync: true });
    t.after(async () => { await service.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
    return { store, service };
}
const legacy = { indicator: 'visits', background: 'standings', toolbox: 'intel', region: '10000002',
    showConnections: false, extra: { indicator: 'visits', custom: ['keep', 17, null] } };

test('legacy saved views restore without rewriting storage or discarding unrelated preferences', async t => {
    const { store, service } = await fixture(t);
    const saved = service.saveView(42, { name: 'My saved view', config: { ...legacy, indicator: 'none' } });
    const old = { ...saved, config: structuredClone(legacy) };
    store.db.prepare("UPDATE universe_records SET body=? WHERE character_id=42 AND kind='view' AND id=?").run(JSON.stringify(old), saved.id);
    const expected = { ...old, config: { ...legacy, indicator: 'none' } };
    assert.deepEqual(service.state(42).views, [expected]);
    assert.deepEqual(service.state(42).views, [expected], 'Repeated restoration is idempotent');
    assert.deepEqual(service.state(43).views, []);
    assert.deepEqual(JSON.parse(store.db.prepare("SELECT body FROM universe_records WHERE character_id=42 AND kind='view' AND id=?").get(saved.id).body), old,
        'Read normalization does not rewrite the stored record or its timestamps');
    assert.deepEqual(service.exportUserData(42).records.find(row => row.kind === 'view').data, old,
        'Raw user export remains lossless');
    assert.throws(() => service.saveView(43, { id: saved.id, name: 'Other pilot' }), /not found/);
    const renamed = service.saveView(42, { id: saved.id, name: 'Renamed view' });
    assert.deepEqual(renamed.config, expected.config, 'Renaming an existing legacy view also normalizes its restored config');
    assert.equal(renamed.id, old.id); assert.equal(renamed.created_at, old.created_at);
});

test('saved-view writes normalize only the retired top-level indicator and preserve generic config validation', async t => {
    const { service } = await fixture(t), input = structuredClone(legacy);
    const view = service.saveView(42, { name: 'Migrated', config: input });
    assert.deepEqual(view.config, { ...legacy, indicator: 'none' });
    assert.deepEqual(input, legacy, 'Saving does not mutate the caller config');
    for (const indicator of ['none', 'npc_delta', 'future-extension', null]) {
        const config = { ...legacy, indicator };
        assert.deepEqual(service.saveView(42, { id: view.id, config }).config, config);
    }
    assert.deepEqual(service.saveView(42, { id: view.id, config: { toolbox: 'intel', extra: legacy.extra } }).config, { toolbox: 'intel', extra: legacy.extra });
    for (const config of [false, 'visits', []]) assert.throws(() => service.saveView(42, { name: 'Invalid', config }), /map configuration/);
    assert.throws(() => service.saveView(42, { name: 'Too large', config: { text: 'x'.repeat(30000) } }), /too large/);
});
