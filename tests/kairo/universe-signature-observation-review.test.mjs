import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../server/store.mjs';
import { createUniverseOperations } from '../../server/universe-operations.mjs';

test('metadata and link edits preserve scan age/missing; explicit rescan or present observation refreshes them', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-scan-observation-')), store = openStore(dir);
    let now = Date.parse('2026-09-25T12:00:00Z');
    const service = createUniverseOperations(store, { characters: () => [{ id: 42 }] }, {}, { atlas: { systems: [{ system_id: 31001658, name: 'J225111' }], gates: [] }, now: () => now, noSync: true });
    t.after(async () => { await service.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
    const initial = service.saveSignature(42, { system_id: 31001658, signature_id: 'ABC-123', type: 'Wormhole', missing: true });
    now += 3600000;
    const edit = service.saveSignature(42, { id: initial.id, name: 'Named observation' });
    assert.equal(edit.last_seen_at, initial.last_seen_at); assert.equal(edit.missing, true);
    const linked = service.saveSignature(42, { ...edit, missing: false, wh_type: 'P060' }, { observed: false });
    assert.equal(linked.last_seen_at, initial.last_seen_at); assert.equal(linked.missing, true);
    const scanned = service.importSignatures(42, { system_id: 31001658, text: 'ABC-123\tCosmic Signature\tWormhole\tUnstable Wormhole\t100%\t1 AU' }).signatures[0];
    assert.equal(scanned.last_seen_at, new Date(now).toISOString()); assert.equal(scanned.missing, false);
    now += 3600000;
    const missing = service.saveSignature(42, { id: initial.id, missing: true });
    assert.equal(missing.last_seen_at, scanned.last_seen_at); assert.equal(missing.missing, true);
    const present = service.saveSignature(42, { id: initial.id, missing: false });
    assert.equal(present.last_seen_at, new Date(now).toISOString()); assert.equal(present.missing, false);
});
