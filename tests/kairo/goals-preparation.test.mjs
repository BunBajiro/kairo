import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../../server/store.mjs';
import { allScopes } from '../../server/modules/catalog.mjs';
import { createGoals, goalSourceOptions, listGoals, lookupGoalType } from '../../server/goals.mjs';

const auth = { characters: () => [{ id: 42, scopes: allScopes }] };
const iso = time => new Date(time).toISOString();
const sample = data => { const now = Date.now(); return { status: 'ready', data, updatedAt: iso(now), expiresAt: iso(now + 600000) }; };
async function storage(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-goal-inputs-')), store = openStore(dir);
    t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
    return store;
}
function goal(store, id, source, { type = null, target = 10000, created = iso(Date.now() - 3600000) } = {}) {
    store.db.prepare('INSERT INTO goals(id,character_id,title,target,progress,kind,done,created) VALUES(?,42,?,?,0,?,0,?)')
        .run(id, id, target, source === 'manual' ? 'manual' : 'esi', created);
    if (source !== 'manual') store.db.prepare('INSERT INTO goal_tracking(goal_id,source,type_id) VALUES(?,?,?)').run(id, source, type);
}
const row = (store, id) => store.db.prepare('SELECT * FROM goals WHERE id=?').get(id);
const changes = store => store.db.prepare('SELECT total_changes() n').get().n;

test('many item goals share one source read and one quantity pass; lists join tracking and read names once', async t => {
    const store = await storage(t), quantity = 2000;
    for (let i = 0; i < 20; i++) goal(store, 'item-' + i, 'assets.quantity', { type: i % 2 ? 34 : 35 });
    store.saveSnapshot(42, 'assets', sample([])); store.set('names', { 34: 'Mineral', 35: 'Ore' });
    const service = createGoals(store, auth, () => {}), originalRead = store.snapshot, originalGet = store.get;
    let reads = 0, typeVisits = 0, nameReads = 0, characterReads = 0;
    const countedAuth = { characters() { characterReads++; return auth.characters(); } };
    const assets = Array.from({ length: quantity }, (_, i) => ({ get type_id() { typeVisits++; return i % 2 ? 34 : 35; }, quantity: 2 }));
    store.snapshot = (id, key) => { if (key === 'assets') { reads++; return { ...originalRead(id, key), data: assets }; } return originalRead(id, key); };
    store.get = (key, fallback) => { if (key === 'names') nameReads++; return originalGet(key, fallback); };
    assert.equal(service.refresh(42, 'assets'), 20);
    assert.equal(reads, 1); assert.equal(typeVisits, quantity);
    assert.ok(store.db.prepare('SELECT progress FROM goals').all().every(g => g.progress === quantity));
    reads = nameReads = typeVisits = 0;
    const prepare = store.db.prepare.bind(store.db); let goalQueries = 0, trackingQueries = 0;
    store.db.prepare = sql => { if (/FROM goals/.test(sql)) goalQueries++; if (/FROM goal_tracking WHERE goal_id/.test(sql)) trackingQueries++; return prepare(sql); };
    let listed;
    try { listed = listGoals(store, countedAuth, 42); } finally { store.db.prepare = prepare; }
    assert.equal(listed.length, 20); assert.ok(listed.every(g => g.tracking.status === 'ready'));
    assert.equal(reads, 1); assert.equal(typeVisits, 0, 'Availability does not reevaluate every item goal');
    assert.equal(nameReads, 1); assert.equal(characterReads, 1); assert.equal(goalQueries, 1); assert.equal(trackingQueries, 0);
    reads = 0; service.refresh(42, 'unrelated'); assert.equal(reads, 0);
});

test('source options reuse type-choice samples for availability and observe changes on the next call', async t => {
    const store = await storage(t), read = store.snapshot, get = store.get, counts = new Map(); let names = 0;
    for (const key of ['assets', 'mining', 'jobs', 'queue', 'journal', 'killmails']) store.saveSnapshot(42, key, sample([]));
    store.saveSnapshot(42, 'skills', sample({ skills: [] })); store.saveSnapshot(42, 'wallet', sample(0));
    store.snapshot = (id, key) => { counts.set(key, (counts.get(key) || 0) + 1); return read(id, key); };
    store.get = (key, fallback) => { if (key === 'names') names++; return get(key, fallback); };
    const first = goalSourceOptions(store, auth, 42);
    assert.ok([...counts.values()].every(n => n === 1)); assert.equal(names, 1);
    assert.equal(first.sources.find(s => s.id === 'wallet.balance').availability.status, 'ready');
    store.set('module:wallet', false); counts.clear();
    assert.equal(goalSourceOptions(store, auth, 42).sources.find(s => s.id === 'wallet.balance').availability.status, 'disabled');
    assert.ok([...counts.values()].every(n => n === 1));
});

test('unchanged credit ledgers and tracking status perform no writes, while unavailable sources retain progress', async t => {
    const store = await storage(t), now = Date.now(), publish = [];
    for (const id of ['one', 'two', 'three']) goal(store, id, 'wallet.income');
    store.saveSnapshot(42, 'journal', sample(Array.from({ length: 50 }, (_, id) => ({ id: id + 1, date: iso(now - 1000), amount: 10 }))));
    const service = createGoals(store, auth, event => publish.push(event));
    assert.equal(service.refresh(42, 'journal'), 3);
    assert.equal(row(store, 'one').progress, 500); assert.equal(publish.length, 0);
    const before = changes(store); assert.equal(service.refresh(42, 'journal'), 0);
    assert.equal(changes(store) - before, 0, 'Repeated source does not rewrite 150 entries or goal/tracking rows');
    store.saveSnapshot(42, 'journal', { ...store.snapshot(42, 'journal'), status: 'stale' });
    service.refresh(42, 'journal'); const staleChanges = changes(store); service.refresh(42, 'journal');
    assert.equal(changes(store), staleChanges); assert.equal(row(store, 'one').progress, 500);
    assert.ok(listGoals(store, auth, 42).every(g => g.tracking.status === 'stale'));
});

test('accounting failures roll back ledger, progress, baseline and status before any completion is published', async t => {
    const store = await storage(t), published = [];
    goal(store, 'a', 'wallet.income', { target: 10 }); goal(store, 'b', 'wallet.income', { target: 10 });
    store.saveSnapshot(42, 'journal', sample([{ id: 1, date: iso(Date.now() - 1000), amount: 10 }]));
    const service = createGoals(store, auth, event => published.push(event));
    store.db.exec("CREATE TRIGGER fail_goal_tracking BEFORE UPDATE ON goal_tracking WHEN NEW.goal_id='b' BEGIN SELECT RAISE(ABORT,'accounting failure'); END");
    assert.throws(() => service.refresh(42), /accounting failure/);
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM goal_progress_entries').get().n, 0);
    assert.ok(store.db.prepare('SELECT progress,done FROM goals').all().every(g => g.progress === 0 && g.done === 0));
    assert.ok(store.db.prepare('SELECT state,status,updated_at FROM goal_tracking').all().every(g => g.state === '{}' && g.status === 'waiting' && g.updated_at === null));
    assert.equal(published.length, 0);
    store.db.exec('DROP TRIGGER fail_goal_tracking'); assert.equal(service.refresh(42), 2);
    assert.equal(published.length, 2); assert.equal(new Set(published.map(e => e.dedupe)).size, 2);
    assert.equal(service.refresh(42), 0); assert.equal(published.length, 2);
});

test('savepoints preserve caller-owned rollback and reentrant creation without duplicate completion', async t => {
    const store = await storage(t); store.saveSnapshot(42, 'wallet', sample(100));
    const event = e => store.db.prepare('INSERT OR IGNORE INTO events(character_id,type,module,summary,payload,at,dedupe) VALUES(?,?,?,?,?,?,?)')
        .run(e.characterId, e.type, e.module, e.summary, JSON.stringify(e.payload), iso(Date.now()), e.dedupe || null);
    const service = createGoals(store, auth, event);
    store.db.exec('BEGIN'); const id = service.create(42, { title: 'Nested', source: 'wallet.balance', target: 50 }).id;
    assert.equal(row(store, id).done, 1); store.db.exec('ROLLBACK');
    assert.equal(row(store, id), undefined); assert.equal(store.db.prepare('SELECT COUNT(*) n FROM events').get().n, 0);
    let child = null, nested;
    nested = createGoals(store, auth, e => { event(e); if (e.type === 'goal.completed' && !child) { child = 'creating'; child = nested.create(42, { title: 'Follow-up', source: 'manual', target: 1 }).id; } });
    const completed = nested.create(42, { title: 'Parent', source: 'wallet.balance', target: 50 }).id;
    assert.equal(row(store, completed).done, 1); assert.equal(row(store, child).kind, 'manual');
    nested.refresh(42);
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='goal.completed'").get().n, 1);
});

test('prepared journal and combat inputs retain distinct creation cutoffs, pilot isolation and source filters', async t => {
    const store = await storage(t), now = Date.now();
    for (const [suffix, offset] of [['early', 7200000], ['late', 3600000]]) {
        goal(store, 'income-' + suffix, 'wallet.income', { created: iso(now - offset) });
        goal(store, 'combat-' + suffix, 'combat.kills', { created: iso(now - offset) });
    }
    store.saveSnapshot(42, 'journal', sample([{ id: 1, date: iso(now - 5400000), amount: 50 }, { id: 2, date: iso(now - 1800000), amount: 100 },
        { id: 3, date: iso(now + 60000), amount: 999 }, { id: 4, date: iso(now - 1000), amount: -100 }]));
    store.saveSnapshot(42, 'killmails', sample([]));
    const insert = store.db.prepare('INSERT INTO combat_records VALUES(?,?,?,?,?,?)');
    insert.run(42, 1, 'kill', iso(now - 5400000), '{}', 'fixture'); insert.run(42, 2, 'kill', iso(now - 1800000), '{}', 'fixture');
    insert.run(42, 3, 'loss', iso(now - 1000), '{}', 'fixture'); insert.run(43, 4, 'kill', iso(now - 1000), '{}', 'fixture');
    const service = createGoals(store, auth, () => {}), prepare = store.db.prepare.bind(store.db); let combatReads = 0;
    store.db.prepare = sql => { if (/SELECT at FROM combat_records/.test(sql)) combatReads++; return prepare(sql); };
    try { service.refresh(42); } finally { store.db.prepare = prepare; }
    assert.equal(combatReads, 1);
    assert.equal(row(store, 'income-early').progress, 150); assert.equal(row(store, 'income-late').progress, 100);
    assert.equal(row(store, 'combat-early').progress, 2); assert.equal(row(store, 'combat-late').progress, 1);
});

test('type lookup hands successful names to the supplied application owner exactly once', async t => {
    const store = await storage(t), names = [];
    const esi = { request: async path => ({ data: path.startsWith('/universe/types/') ? { name: 'Resolved type', group_id: 10 } : { category_id: 6 } }) };
    assert.deepEqual(await lookupGoalType(store, esi, { typeId: 34 }, value => names.push(value)), { id: 34, name: 'Resolved type', categoryId: 6 });
    assert.deepEqual(names, [{ 34: 'Resolved type' }]); assert.deepEqual(store.get('names', {}), {});
    await assert.rejects(() => lookupGoalType(store, { request: async () => { throw Error('failed'); } }, { typeId: 34 }, value => names.push(value)), /failed/);
    assert.equal(names.length, 1);
});
