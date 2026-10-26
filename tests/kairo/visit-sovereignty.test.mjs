import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../../server/store.mjs';
import { captureContext } from '../../server/history.mjs';
import { registerUniverseHistory } from '../../server/universe-history.mjs';
import { sessionReplay } from '../../server/session-replay.mjs';
import { captureVisitSovereignty, recordedVisitSovereignty } from '../../server/visit-sovereignty.mjs';

const A = 30000142, B = 30000144, W = 31000001;
const iso = value => new Date(value).toISOString();
async function storage(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-visit-sov-'));
    let store = openStore(dir);
    t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
    return { get store() { return store; }, restart: () => { store.close(); store = openStore(dir); return store; } };
}
const sample = (at, extra = {}) => ({ status: 'ready', updatedAt: iso(at - 1000), expiresAt: iso(at + 60000),
    data: [{ system_id: A, alliance_id: 77 }, { system_id: B, alliance_id: 77 }], ...extra });

test('visit sovereignty uses only existing fresh complete ESI evidence with captured owner identity and age', async t => {
    const { store } = await storage(t), now = Date.now(), at = iso(now);
    store.set('names', { 77: 'Recorded alliance' });
    store.saveSnapshot(0, 'sovereignty', sample(now));
    assert.deepEqual(captureVisitSovereignty(store, A, at), { owner_type: 'alliance', owner_id: 77, owner_name: 'Recorded alliance', observed_at: iso(now - 1000), recorded_at: at, source: 'esi' });
    for (const override of [{ status: 'stale' }, { status: 'error' }, { stale: true }, { truncated: true }, { expiresAt: at }, { expiresAt: null }, { updatedAt: iso(now + 1) }, { updatedAt: null }, { data: null }]) {
        store.saveSnapshot(0, 'sovereignty', sample(now, override));
        assert.equal(captureVisitSovereignty(store, A, at), null, JSON.stringify(override));
    }
    for (const type of ['faction', 'corporation']) {
        store.saveSnapshot(0, 'sovereignty', sample(now, { data: [{ solar_system_id: A, [type + '_id']: 88 }] }));
        assert.equal(captureVisitSovereignty(store, A, at).owner_type, type);
        assert.equal(captureVisitSovereignty(store, A, at).owner_name, null, 'Missing historical name never uses a later lookup');
    }
    store.saveSnapshot(0, 'sovereignty', sample(now, { data: [{ system_id: W, alliance_id: 77 }] }));
    assert.equal(captureVisitSovereignty(store, W, at), null, 'J-Space has no formal ESI sovereignty');
    assert.equal(captureVisitSovereignty(store, A, at), null, 'Unreported holder stays unavailable');
    store.saveSnapshot(0, 'sovereignty', sample(now)); store.set('module:universe', false);
    assert.equal(captureVisitSovereignty(store, A, at), null);
});

test('session starts and recorded visits retain their original holder after later sovereignty changes and restart', async t => {
    const fixture = await storage(t), { store } = fixture, now = Date.now();
    store.set('names', { 77: 'Original holder' });
    store.saveSnapshot(0, 'sovereignty', sample(now));
    store.saveSnapshot(42, 'location', { status: 'ready', updatedAt: iso(now), expiresAt: iso(now + 60000), data: { solar_system_id: A, system: { name: 'Jita' } } });
    const context = captureContext(store, 42), listeners = new Map();
    store.db.prepare('INSERT INTO sessions(id,character_id,label,started,start_context,end_context) VALUES(?,?,?,?,?,?)')
        .run('owner-replay', 42, 'Recorded owners', context.capturedAt, JSON.stringify(context), '{}');
    const stop = registerUniverseHistory({ store, bus: { on: (type, fn) => { listeners.set(type, fn); return () => listeners.delete(type); } },
        esi: { names: () => { throw new Error('No additional name or sovereignty request is needed'); } }, publish: () => {} });
    await listeners.get('data.location')({ characterId: 42, payload: { previous: { solar_system_id: A }, current: { solar_system_id: B, system: { name: 'Perimeter' } } } });
    stop();
    store.db.prepare('UPDATE sessions SET ended=? WHERE id=?').run(iso(now + 60000), 'owner-replay');
    // An owned visit can lack captured sovereignty; today's feed cannot fill it.
    store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)').run(42, A, 'Owned Jita visit', iso(now + 10000), 'owner-replay');
    store.saveSnapshot(0, 'sovereignty', sample(now, { data: [{ system_id: A, alliance_id: 99 }, { system_id: B, alliance_id: 99 }] }));
    store.set('names', { 77: 'Renamed later', 99: 'New holder' });
    const reopened = fixture.restart(), before = reopened.db.prepare('SELECT total_changes() count').get().count;
    const replay = sessionReplay(reopened, 'owner-replay', 42);
    assert.deepEqual(replay.visits.map(row => row.systemId), [A, B, A]);
    assert.deepEqual(replay.visits.map(row => row.sovereignty_at_visit?.owner_name ?? null), ['Original holder', 'Original holder', null]);
    assert.deepEqual(replay.visits.map(row => row.sovereignty_at_visit?.owner_id ?? null), [77, 77, null]);
    assert.ok(replay.visits.slice(0, 2).every(row => row.sovereignty_at_visit.observed_at === iso(now - 1000)));
    assert.equal(reopened.db.prepare('SELECT total_changes() count').get().count, before);
});

test('nullable visit sovereignty migration preserves older travel records and is idempotent', async t => {
    const fixture = await storage(t);
    fixture.store.db.exec("ALTER TABLE visits DROP COLUMN sovereignty_at_visit; DELETE FROM migrations WHERE id='visits-sovereignty-v080'");
    fixture.store.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(42, A, 'Existing travel', iso(Date.now()));
    let store = fixture.restart();
    assert.equal(store.db.prepare('SELECT sovereignty_at_visit FROM visits').get().sovereignty_at_visit, null);
    assert.equal(store.db.prepare('SELECT name FROM visits').get().name, 'Existing travel');
    store = fixture.restart();
    assert.equal(store.db.prepare("SELECT COUNT(*) count FROM migrations WHERE id='visits-sovereignty-v080'").get().count, 1);
});

test('malformed or legacy historical ownership is never reconstructed from present-day sources', () => {
    const now = iso(Date.now());
    for (const value of [undefined, null, '{broken', '{}', { owner_type: 'alliance', owner_id: 77 },
        { owner_type: 'alliance', owner_id: 77, observed_at: now, recorded_at: now, source: 'inferred' }]) {
        assert.equal(recordedVisitSovereignty(value, A), null);
    }
    const valid = { owner_type: 'alliance', owner_id: 77, owner_name: 'Saved name', observed_at: now, recorded_at: now, source: 'esi' };
    assert.deepEqual(recordedVisitSovereignty(JSON.stringify(valid), A), valid);
    assert.equal(recordedVisitSovereignty(valid, W), null);
});
