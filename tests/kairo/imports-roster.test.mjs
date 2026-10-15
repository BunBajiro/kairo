import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../server/store.mjs';
import { createAuth } from '../../server/auth.mjs';
import { createImports } from '../../server/imports.mjs';
import { DEFAULT_IMPORT_SETTINGS } from '../../server/import-math.mjs';

test('one Imports operation reuses its roster while each new operation observes current access', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-import-roster-')), store = openStore(dir);
    t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
    const id = 60008494, now = Date.now(), source = createAuth(store, {}, { origin: 'http://127.0.0.1:4380' });
    const scopes = ['esi-skills.read_skills.v1', 'esi-characters.read_standings.v1', 'esi-markets.read_character_orders.v1'];
    for (const pilot of [42, 43]) {
        store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(pilot, `Pilot ${pilot}`, JSON.stringify(scopes), '{}');
        const sample = data => ({ data, status: 'ready', updatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 86400000).toISOString() });
        store.saveSnapshot(pilot, 'skills', sample({ skills: [] })); store.saveSnapshot(pilot, 'standings', sample([])); store.saveSnapshot(pilot, 'orders', sample([]));
    }
    store.db.prepare('INSERT INTO market_hubs(id,name,station_name,kind,system_id,system_name,region_id,region_name) VALUES(?,?,?,?,?,?,?,?)').run(id, 'Amarr', 'Amarr', 'station', 30002187, 'Amarr', 10000043, 'Domain');
    store.set('market:owner:' + id, { corporationId: 1000084, corporationName: 'Amarr Navy', factionId: 500003, expires: now + 86400000 });
    store.set('market:imports:' + id, { ...DEFAULT_IMPORT_SETTINGS, characterId: 42, buyingCharacterId: 43 });
    let reads = 0;
    const imports = createImports(store, { characters: () => { reads++; return source.characters(); } }, { now: () => now });
    t.after(() => imports.close());
    const state = imports.state(id);
    assert.equal(reads, 1);
    assert.equal(state.fees.ready, true); assert.equal(state.buyer.ready, true);
    reads = 0; const first = await imports.analyse(id);
    assert.equal(reads, 2, 'Initial roster plus a fresh post-await access check');
    reads = 0; assert.strictEqual(await imports.analyse(id), first);
    assert.equal(reads, 1, 'A cached result still checks current pilot access');
    store.db.prepare('UPDATE characters SET reauth=1 WHERE id=43').run();
    const revoked = await imports.analyse(id);
    assert.equal(revoked.buyer.ready, false); assert.match(revoked.reason, /Reconnect the buying character/);
    store.db.prepare('UPDATE characters SET reauth=0,scopes=? WHERE id=43').run('[]');
    assert.equal((await imports.analyse(id)).buyer.ready, false, 'Scope changes are immediate');
    store.db.prepare('UPDATE characters SET scopes=?,name=? WHERE id=43').run(JSON.stringify(scopes), 'Renewed buyer');
    const restored = await imports.analyse(id);
    assert.equal(restored.buyer.ready, true); assert.equal(restored.buyer.characterName, 'Renewed buyer');
    store.db.prepare('DELETE FROM characters WHERE id=43').run();
    assert.equal((await imports.analyse(id)).buyer.ready, false, 'Disconnect invalidates the result without a retained roster');
    const callerCopy = source.characters(); callerCopy[0].scopes.length = 0;
    assert.deepEqual(source.characters()[0].scopes, scopes, 'There is no shared mutable roster cache');
});
