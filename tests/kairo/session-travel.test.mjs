import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../server/store.mjs';
import { discoveredSystemIds } from '../../server/discovery.mjs';
import { readSessionVisits, recordSessionObservation } from '../../server/session-travel.mjs';
import { registerUniverseHistory } from '../../server/universe-history.mjs';
import { sessionRoute } from '../../server/session-details.mjs';
import { changeSession, sessionReport } from '../../server/history.mjs';
import { createCore } from '../../server/core.mjs';
import { catalog } from '../../server/modules/catalog.mjs';
import { sessionReplay } from '../../server/session-replay.mjs';
import { journeyData, setJourneyConnection } from '../../server/places.mjs';

const A = 30000142, B = 30000144, W = 31000001;
const epoch = Date.parse('2026-09-20T12:00:00Z'), at = ms => new Date(epoch + ms).toISOString();
async function storage(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-session-travel-'));
    let store = openStore(dir), beforeClose = async () => {};
    t.after(async () => { await beforeClose(); store.close(); await rm(dir, { recursive: true, force: true }); });
    return { dir, get store() { return store; }, beforeClose(fn) { beforeClose = fn; }, reopen() { store.close(); store = openStore(dir); return store; } };
}
function session(store, id, characterId = 42, start = { capturedAt: at(0) }, started = at(0), ended = null) {
    store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)')
        .run(id, characterId, id, started, ended, JSON.stringify(start), '{}');
    return store.db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
}
function observer(store, { now = () => epoch + 1000, names = async () => ({}) } = {}) {
    const callbacks = new Map(), events = [];
    const stop = registerUniverseHistory({ store, now, esi: { names },
        bus: { on(type, fn) { callbacks.set(type, fn); return () => callbacks.delete(type); } },
        publish(event) {
            events.push(event);
            store.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)')
                .run(event.characterId, event.type, event.module, event.summary, JSON.stringify(event.payload), event.at);
        } });
    return { events, stop, location(characterId, systemId, previousId, name) {
        return callbacks.get('data.location')({ characterId, payload: {
            current: { solar_system_id: systemId, ...(name ? { system: { name } } : {}) },
            previous: previousId ? { solar_system_id: previousId } : undefined } });
    }, ship(characterId, shipId, previousId) {
        return callbacks.get('data.ship')({ characterId, payload: {
            current: { ship_id: shipId, ship_type_id: 587 }, previous: { ship_id: previousId, ship_type_id: 588 } } });
    } };
}
const visits = store => store.db.prepare('SELECT * FROM visits ORDER BY at,id').all();

test('upgrade and repeated reopen preserve legacy evidence, IDs, annotations and membership without backfill duplication', async t => {
    const f = await storage(t), db = f.store.db;
    db.exec("ALTER TABLE visits DROP COLUMN session_id; DROP TABLE discovered_systems; DELETE FROM migrations WHERE id='session-travel-v080'");
    const put = db.prepare('INSERT INTO visits(id,character_id,system_id,name,ship_type_id,at,sovereignty_at_visit) VALUES(?,?,?,?,?,?,?)');
    put.run(101, 42, A, 'First', 587, at(0), '{"source":"legacy-preserved"}');
    put.run(102, 42, W, 'Wormhole', 588, at(1000), null);
    put.run(103, 42, W, 'Wormhole again', 588, at(2000), null);
    put.run(104, 43, B, 'Other pilot', 609, at(2000), null);
    session(f.store, 'old', 42, {}, at(0), at(3000));
    db.prepare('INSERT INTO journey_hidden_links VALUES(?,?,?,?)').run(42, 101, 102, at(2500));
    db.prepare('INSERT INTO place_notes VALUES(?,?,?,?,?,?,?)').run('system', W, 'Saved note', 'Do not lose', '[]', 'watch', at(0));
    db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)').run(42, 'location.changed', 'journey', 'Historic', '{}', at(0));
    f.store.set('stream', { saved: true });
    const before = Object.fromEntries(['visits', 'sessions', 'journey_hidden_links', 'place_notes', 'events', 'settings']
        .map(table => [table, db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all().map(row => ({ ...row }))]));
    for (let i = 0; i < 2; i++) {
        const store = f.reopen();
        for (const [table, rows] of Object.entries(before)) {
            const after = store.db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all().map(row => ({ ...row }));
            assert.deepEqual(table === 'visits' ? after.map(({ session_id, ...row }) => row) : after, rows, table);
        }
        assert.ok(visits(store).every(row => row.session_id === null));
        assert.deepEqual(discoveredSystemIds(store, 42), [A, W]);
        assert.deepEqual(discoveredSystemIds(store, 43), [B]);
        assert.equal(store.db.prepare('SELECT COUNT(*) n FROM discovered_systems').get().n, 3);
        assert.equal(store.db.prepare("SELECT COUNT(*) n FROM migrations WHERE id='session-travel-v080'").get().n, 1);
    }
});

test('fresh observations discover outside sessions, retain activity, and obey Pilot independently of Universe', async t => {
    const { store } = await storage(t), o = observer(store);
    store.set('module:universe', false);
    await o.location(42, W, W, 'Known wormhole');
    await o.location(43, A, B, 'Jita');
    o.ship(42, 2, 1);
    assert.deepEqual(discoveredSystemIds(store, 42), [W]);
    assert.deepEqual(discoveredSystemIds(store, 43), [A]);
    assert.equal(visits(store).length, 0, 'Inactive pilots do not build a lifetime trail');
    assert.deepEqual(o.events.map(e => e.type), ['location.changed', 'ship.changed']);
    assert.ok(o.events.every(e => e.at === at(1000)));
    store.set('module:pilot', false);
    await o.location(42, B, W, 'Perimeter'); o.ship(42, 3, 2);
    assert.deepEqual(discoveredSystemIds(store, 42), [W]);
    assert.equal(o.events.length, 2);
    o.stop();
});

test('fresh starts avoid duplicate baselines, loops persist, and active recording resumes from durable evidence after restart', async t => {
    const f = await storage(t); let time = 1000;
    const start = { capturedAt: at(0), system: { id: A, name: 'Jita' } };
    session(f.store, 'active', 42, start);
    let o = observer(f.store, { now: () => epoch + time });
    await o.location(42, A, A, 'Jita');
    assert.equal(visits(f.store).length, 0);
    await o.location(42, B, A, 'Perimeter');
    time = 2000; await o.location(42, B, B, 'Perimeter');
    time = 3000; await o.location(42, A, B, 'Jita');
    o.stop(); const store = f.reopen();
    o = observer(store, { now: () => epoch + time });
    await o.location(42, A, A, 'Jita');
    assert.deepEqual(visits(store).map(row => [row.system_id, row.session_id]), [[B, 'active'], [A, 'active']]);
    assert.deepEqual(sessionRoute(store, store.db.prepare('SELECT * FROM sessions').get(), start, at(4000)).map(v => v.systemId), [A, B, A]);
    o.stop();
});

test('stale or missing captured starts acquire the first same-system fresh sample and retain the preceding coverage gap', async t => {
    const { store } = await storage(t), start = { capturedAt: at(0), system: null, coverage: { location: 'stale' } };
    session(store, 'late-baseline', 42, start, at(0), null);
    store.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(42, B, 'Old pre-session', at(-1000));
    const o = observer(store, { now: () => epoch + 10000 });
    await o.location(42, B, B, 'Perimeter');
    await o.location(42, B, B, 'Perimeter');
    store.db.prepare('UPDATE sessions SET ended=? WHERE id=?').run(at(20000), 'late-baseline');
    const replay = sessionReplay(store, 'late-baseline', 42);
    assert.equal(replay.visits.length, 1);
    assert.equal(replay.visits[0].entered, at(10000));
    assert.equal(replay.visits[0].inferred, false);
    assert.deepEqual(replay.coverage.gaps, [{ from: at(0), to: at(10000), reason: 'Location before the first recorded visit is unavailable.' }]);
    assert.equal(o.events.length, 0, 'A missing session baseline is not a newly entered system event');
    o.stop();
});

test('pending or failed names cannot move observation ownership, timestamp, ship, sovereignty or activity across session changes', async t => {
    const { store } = await storage(t); let release, time = 1000;
    const pending = new Promise(resolve => { release = resolve; });
    session(store, 'before', 42); session(store, 'other', 43);
    store.saveSnapshot(42, 'ship', { data: { ship_type_id: 609 } });
    store.saveSnapshot(0, 'sovereignty', { status: 'ready', updatedAt: at(0), expiresAt: at(100000), data: [{ system_id: B, alliance_id: 77 }] });
    const o = observer(store, { now: () => epoch + time, names: () => pending });
    const work = o.location(42, B, A);
    assert.equal(visits(store)[0].name, String(B));
    assert.equal(visits(store)[0].session_id, 'before');
    assert.equal(o.events.length, 1, 'Activity publication is synchronous even without a name');
    assert.equal(o.events[0].at, at(1000));
    time = 2000; store.db.prepare('UPDATE sessions SET ended=? WHERE id=?').run(at(time), 'before');
    session(store, 'after', 42, { capturedAt: at(time) }, at(time));
    store.saveSnapshot(42, 'ship', { data: { ship_type_id: 999 } });
    store.saveSnapshot(0, 'sovereignty', { status: 'ready', updatedAt: at(time), expiresAt: at(100000), data: [{ system_id: B, alliance_id: 99 }] });
    await o.location(43, A, B, 'Other pilot');
    release({ [B]: 'Resolved later' }); await work;
    const row = visits(store).find(v => v.character_id === 42);
    assert.deepEqual([row.session_id, row.at, row.ship_type_id, row.name], ['before', at(1000), 609, 'Resolved later']);
    assert.equal(JSON.parse(row.sovereignty_at_visit).owner_id, 77);
    assert.equal(o.events.filter(e => e.characterId === 42).length, 1);
    o.stop();
    const failed = observer(store, { now: () => epoch + 3000, names: async () => { throw new Error('Unavailable names'); } });
    await failed.location(42, W, B);
    assert.equal(visits(store).at(-1).session_id, 'after');
    assert.equal(visits(store).at(-1).name, String(W));
    assert.equal(failed.events[0].at, at(3000)); failed.stop();
});

test('session read boundaries, equal-time order and legacy-only inferred starts never admit another owned session or pilot', async t => {
    const { store } = await storage(t), s = session(store, 'read', 42, {}, at(0), at(2000));
    session(store, 'neighbor', 42, { capturedAt: at(0) }, at(0), at(2000));
    const put = store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)');
    const legacyPrior = Number(put.run(42, A, 'Legacy initial', at(-2000), null).lastInsertRowid);
    put.run(42, W, 'Other owned prior', at(-1000), 'neighbor');
    const first = Number(put.run(42, B, 'Legacy in window', at(1000), null).lastInsertRowid);
    put.run(42, W, 'Other owned equal time', at(1000), 'neighbor');
    const second = Number(put.run(42, A, 'Own equal time', at(1000), 'read').lastInsertRowid);
    put.run(43, W, 'Other pilot', at(1000), 'read');
    const boundary = Number(put.run(42, B, 'Own exact end', at(2000), 'read').lastInsertRowid);
    put.run(42, W, 'Other owned exact end', at(2000), 'neighbor');
    assert.deepEqual(readSessionVisits(store, s, s.ended).map(v => v.id), [first, second]);
    assert.deepEqual(readSessionVisits(store, s, s.ended, { inclusiveEnd: true }).map(v => v.id), [first, second, boundary]);
    const prepare = store.db.prepare.bind(store.db); let windowReads = 0;
    store.db.prepare = sql => { if (/FROM visits v LEFT JOIN universe_systems/s.test(sql)) windowReads++; return prepare(sql); };
    let report;
    try { report = sessionReport(store, s.id, 42); } finally { store.db.prepare = prepare; }
    assert.deepEqual(report.visits.map(v => v.id), [first, second, boundary]);
    assert.deepEqual(report.route.map(v => v.systemId), [A, B, A]);
    assert.equal(windowReads, 1, 'Report and route share one bounded visit projection');
    const foreignRows = visits(store);
    assert.deepEqual(sessionRoute(store, s, {}, s.ended, {}, foreignRows).map(v => v.systemId), [A, B, A]);
    const route = sessionRoute(store, s, {}, s.ended);
    assert.equal(route[0].id, legacyPrior); assert.equal(route[0].inferred, true);
    assert.deepEqual(route.map(v => v.systemId), [A, B, A]);
    const modern = sessionRoute(store, s, { capturedAt: at(0) }, s.ended);
    assert.equal(modern[0].entered, at(1000)); assert.equal(modern[0].inferred, false);
    const plan = store.db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM visits v WHERE character_id=? AND at>=? AND at<?
        AND (session_id=? OR session_id IS NULL) ORDER BY at,id`).all(42, at(0), at(2000), s.id);
    assert.ok(plan.some(row => row.detail.includes('idx_visits_character_at') && row.detail.includes('at>') && row.detail.includes('at<')));
    assert.ok(plan.every(row => !/^SCAN v\b/.test(row.detail)), JSON.stringify(plan));
});

test('a same-millisecond end/start assigns accepted samples to the active session without inventing an activity transition', async t => {
    const { store } = await storage(t), first = session(store, 'first');
    const o = observer(store, { now: () => epoch + 1000 });
    await o.location(42, B, A, 'Perimeter');
    store.db.prepare('UPDATE sessions SET ended=? WHERE id=?').run(at(1000), first.id);
    const next = session(store, 'next', 42, { capturedAt: at(1000), system: null }, at(1000));
    await o.location(42, B, B, 'Perimeter');
    await o.location(42, B, B, 'Perimeter');
    const rows = visits(store);
    assert.deepEqual(rows.map(row => [row.session_id, row.at]), [['first', at(1000)], ['next', at(1000)]]);
    assert.deepEqual(readSessionVisits(store, first, at(1000), { inclusiveEnd: true }).map(v => v.id), [rows[0].id]);
    assert.deepEqual(readSessionVisits(store, next, at(2000)).map(v => v.id), [rows[1].id]);
    assert.equal(o.events.length, 1);
    o.stop();
});

test('cold Journey projection and hide/unhide use only legacy adjacency with interleaved session rows and equal timestamps', async t => {
    const { store } = await storage(t), put = store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)');
    const a = Number(put.run(42, A, 'Legacy A', at(0), null).lastInsertRowid);
    const modern = Number(put.run(42, W, 'Session W', at(1000), 'owned').lastInsertRowid);
    const b = Number(put.run(42, B, 'Legacy B', at(1000), null).lastInsertRowid);
    put.run(43, W, 'Other pilot', at(1000), null);
    assert.deepEqual(journeyData(store, 42).visits.map(v => v.id), [b, a]);
    assert.deepEqual(journeyData(store, 42).systems.map(s => s.system_id), [B, A]);
    assert.throws(() => setJourneyConnection(store, 42, modern, true), /not found/);
    assert.throws(() => setJourneyConnection(store, 43, b, true), /not found/);
    setJourneyConnection(store, 42, b, true);
    assert.deepEqual({ ...store.db.prepare('SELECT from_visit_id,to_visit_id FROM journey_hidden_links').get() }, { from_visit_id: a, to_visit_id: b });
    assert.equal(journeyData(store, 42).connections[0].hidden, true);
    setJourneyConnection(store, 42, b, false);
    assert.equal(journeyData(store, 42).connections[0].hidden, false);
    assert.equal(visits(store).length, 4);
    for (let i = 0; i < 501; i++) put.run(42, A, 'Legacy retained', at(2000 + i), null);
    assert.equal(journeyData(store, 42).visits.length, 500);
});

test('inactive and unchanged observations do not scan sovereignty to fabricate movement', async t => {
    const { store } = await storage(t), read = store.snapshot;
    store.snapshot = (...args) => { assert.notEqual(args[1], 'sovereignty'); return read(...args); };
    assert.equal(recordSessionObservation(store, { characterId: 42, systemId: A, at: at(1000) }), null);
    session(store, 'unchanged', 42, { capturedAt: at(0), system: { id: A } });
    assert.equal(recordSessionObservation(store, { characterId: 42, systemId: A, at: at(1000) }), null);
});

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function coreFixture(t, { key = 'location', systemId = 32009999, stale = false } = {}) {
    const f = await storage(t), { store } = f, now = Date.now(), iso = n => new Date(n).toISOString();
    const fresh = data => ({ status: 'ready', data, updatedAt: iso(now), expiresAt: iso(now + 600000), refreshAt: iso(now + 600000), headers: {} });
    for (const module of catalog) store.set('module:' + module.id, module.id === 'pilot');
    store.set('names', { [A]: 'Jita', 588: 'Old hull' });
    store.saveSnapshot(42, 'profile', fresh({ character_id: 42, name: 'Pilot' }));
    store.saveSnapshot(42, 'location', { ...fresh({ solar_system_id: A, system: { name: 'Jita' } }), ...(key === 'location' ? { refreshAt: iso(now - 1) } : {}) });
    store.saveSnapshot(42, 'ship', { ...fresh({ ship_id: 100, ship_type_id: 588 }), ...(key === 'ship' ? { refreshAt: iso(now - 1) } : {}) });
    const metadataStarted = deferred(), metadata = deferred(), namesStarted = deferred(), names = deferred();
    const core = await createCore(store, { characters: () => [{ id: 42, scopes: ['esi-location.read_location.v1', 'esi-location.read_ship_type.v1'] }] }, {
        health: () => ({}),
        async request(path) {
            if (path === '/characters/42/' + key) return { ...fresh(key === 'location' ? { solar_system_id: systemId } : { ship_id: 200, ship_type_id: 999999 }),
                // Remote cache timestamps must never choose a session owner.
                updatedAt: '2030-01-01T00:00:00.000Z', stale };
            if (path === '/universe/systems/' + systemId) { metadataStarted.resolve(); await metadata.promise; throw new Error('Unbundled system metadata unavailable'); }
            if (path === '/characters/42') return fresh({ name: 'Pilot', corporation_id: 88 });
            if (path === '/corporations/88') return fresh({ name: 'Corporation' });
            if (path === '/characters/42/ship') return fresh({ ship_id: 100, ship_type_id: 588 });
            throw new Error('Unexpected request ' + path);
        },
        async names(ids) { namesStarted.resolve(ids); await names.promise; return Object.fromEntries(ids.map(id => [id, 'Resolved ' + id])); }
    }, f.dir, { noSync: true });
    f.beforeClose(async () => { metadata.resolve(); names.resolve(); await core.close(); });
    return { ...f, core, fresh, metadataStarted, metadata, namesStarted, names };
}

test('real Core captures location receipt before deferred metadata/names and never transfers it to a later session', { timeout: 5000 }, async t => {
    const f = await coreFixture(t), { store, core } = f;
    const a = changeSession(store, core.publish, 42, { action: 'start', label: 'A' }).id;
    const before = Date.now(), work = core.sync(42);
    await f.metadataStarted.promise;
    const acceptedBy = Date.now();
    changeSession(store, core.publish, 42, { action: 'end' });
    const b = changeSession(store, core.publish, 42, { action: 'start', label: 'B' }).id;
    store.saveSnapshot(42, 'ship', f.fresh({ ship_id: 999, ship_type_id: 999 }));
    f.metadata.resolve(); await f.namesStarted.promise;
    changeSession(store, core.publish, 42, { action: 'end' });
    const c = changeSession(store, core.publish, 42, { action: 'start', label: 'C' }).id;
    f.names.resolve(); await work; await core.bus.drain();
    const [row] = visits(store);
    assert.equal(visits(store).length, 1); assert.equal(row.session_id, a); assert.equal(row.ship_type_id, 588);
    assert.ok(Date.parse(row.at) >= before && Date.parse(row.at) <= acceptedBy);
    assert.equal(row.system_id, 32009999);
    const event = store.db.prepare("SELECT * FROM events WHERE type='location.changed'").get();
    assert.equal(event.at, row.at); assert.equal(JSON.parse(event.payload).session_id, a);
    assert.ok(sessionReport(store, a, 42).events.some(e => e.id === event.id));
    for (const id of [b, c]) {
        assert.equal(sessionReport(store, id, 42).visits.length, 0);
        assert.ok(sessionReport(store, id, 42).events.every(e => e.type !== 'location.changed'));
    }
    assert.deepEqual(discoveredSystemIds(store, 42), [32009999]);
});

test('real Core retains delayed hull activity in the receipt session including replay end-cursor handling', { timeout: 5000 }, async t => {
    const f = await coreFixture(t, { key: 'ship' }), { store, core } = f;
    const a = changeSession(store, core.publish, 42, { action: 'start', label: 'A' }).id;
    const work = core.sync(42); await f.namesStarted.promise;
    changeSession(store, core.publish, 42, { action: 'end' });
    const b = changeSession(store, core.publish, 42, { action: 'start', label: 'B' }).id;
    f.names.resolve(); await work; await core.bus.drain();
    const event = store.db.prepare("SELECT * FROM events WHERE type='ship.changed'").get();
    assert.equal(JSON.parse(event.payload).session_id, a);
    assert.equal(sessionReport(store, a, 42).stats.shipChanges, 1);
    assert.equal(sessionReport(store, b, 42).stats.shipChanges, 0);
    assert.ok(sessionReplay(store, a, 42).events.some(e => e.id === event.id));
    assert.ok(sessionReplay(store, b, 42).events.every(e => e.id !== event.id));
});

test('real Core stale transport samples never become new session travel or discovery', { timeout: 5000 }, async t => {
    const f = await coreFixture(t, { systemId: B, stale: true }), { store, core } = f;
    f.names.resolve();
    changeSession(store, core.publish, 42, { action: 'start', label: 'Stale source' });
    await core.sync(42); await core.bus.drain();
    assert.equal(store.snapshot(42, 'location').status, 'stale');
    assert.equal(visits(store).length, 0); assert.deepEqual(discoveredSystemIds(store, 42), []);
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='location.changed'").get().n, 0);
});

test('Pilot pause during enrichment suppresses delivery, and a fresh sample after re-enable establishes the missing baseline', { timeout: 5000 }, async t => {
    const f = await coreFixture(t), { store, core } = f;
    const active = changeSession(store, core.publish, 42, { action: 'start', label: 'Pause boundary' }).id;
    const work = core.sync(42); await f.metadataStarted.promise;
    core.toggle('pilot', false); f.metadata.resolve(); f.names.resolve(); await work; await core.bus.drain();
    assert.equal(visits(store).length, 0); assert.deepEqual(discoveredSystemIds(store, 42), []);
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='location.changed'").get().n, 0);
    core.toggle('pilot', true); await core.requestSync(42); await core.bus.drain();
    assert.equal(visits(store).length, 1); assert.equal(visits(store)[0].session_id, active);
    assert.equal(visits(store)[0].system_id, 32009999); assert.deepEqual(discoveredSystemIds(store, 42), [32009999]);
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='location.changed'").get().n, 0, 'A same-system baseline is not a new transition');
});
