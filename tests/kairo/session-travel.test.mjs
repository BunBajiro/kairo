import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../server/store.mjs';
import { discoveredSystemIds, recordDiscoveredSystem } from '../../server/discovery.mjs';
import { readSessionVisits, recordSessionObservation } from '../../server/session-travel.mjs';
import { registerUniverseHistory } from '../../server/universe-history.mjs';
import { sessionRoute, sessionShips } from '../../server/session-details.mjs';
import { changeSession, sessionReport } from '../../server/history.mjs';
import { createCore } from '../../server/core.mjs';
import { catalog } from '../../server/modules/catalog.mjs';
import { sessionReplay } from '../../server/session-replay.mjs';

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
    }, ship(characterId, shipId, previousId, shipTypeId = 587) {
        return callbacks.get('data.ship')({ characterId, payload: {
            current: { ship_id: shipId, ship_type_id: shipTypeId }, previous: previousId === undefined ? undefined : { ship_id: previousId, ship_type_id: 588 } } });
    } };
}
const visits = store => store.db.prepare('SELECT * FROM visits ORDER BY at,id').all();

test('fresh-profile reopen preserves owned travel, independent discovery, notes and activity', async t => {
    const f = await storage(t), db = f.store.db;
    session(f.store, 'owned', 42, {capturedAt: at(0)}, at(0), at(3000));
    db.prepare('INSERT INTO visits(id,character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?,?)').run(101, 42, A, 'First', at(1000), 'owned');
    recordDiscoveredSystem(f.store, 42, A); recordDiscoveredSystem(f.store, 42, W); recordDiscoveredSystem(f.store, 43, B);
    db.prepare('INSERT INTO place_notes VALUES(?,?,?,?,?,?,?)').run('system', W, 'Saved note', 'Do not lose', '[]', 'watch', at(0));
    db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)').run(42, 'location.changed', 'pilot', 'Observed', '{"session_id":"owned"}', at(1000));
    f.store.set('stream', {saved: true});
    const before = Object.fromEntries(['visits', 'sessions', 'discovered_systems', 'place_notes', 'events', 'settings']
        .map(table => [table, db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all().map(row => ({...row}))]));
    for (let i = 0; i < 2; i++) {
        const store = f.reopen();
        for (const [table, rows] of Object.entries(before)) assert.deepEqual(store.db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all().map(row => ({...row})), rows, table);
        assert.deepEqual(discoveredSystemIds(store, 42), [A, W]);
        assert.deepEqual(discoveredSystemIds(store, 43), [B]);
        assert.equal(visits(store).length, 1, 'Discovery does not fabricate travel rows');
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

test('session read boundaries and equal-time ordering exclude unowned evidence and other Sessions/pilots', async t => {
    const { store } = await storage(t), s = session(store, 'read', 42, {}, at(0), at(2000));
    const put = store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)');
    put.run(42, A, 'Unowned prior', at(-2000), null);
    put.run(42, W, 'Other owned prior', at(-1000), 'neighbor');
    put.run(42, W, 'Unowned in window', at(500), null);
    const first = Number(put.run(42, B, 'Own first', at(1000), 'read').lastInsertRowid);
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
    assert.deepEqual(report.route.map(v => v.systemId), [B, A]);
    assert.equal(windowReads, 1, 'Report and route share one bounded visit projection');
    assert.deepEqual(sessionRoute(store, s, {}, s.ended, {}, visits(store)).map(v => v.systemId), [B, A]);
    const route = sessionRoute(store, s, {}, s.ended);
    assert.equal(route[0].entered, at(1000)); assert.ok(route.every(row => !row.inferred));
    const plan = store.db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM visits v WHERE character_id=? AND at>=? AND at<?
        AND session_id=? ORDER BY at,id`).all(42, at(0), at(2000), s.id);
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
    const metadataStarted = deferred(), metadata = deferred(), namesStarted = deferred(), names = deferred(), requests = [];
    const core = await createCore(store, { characters: () => [{ id: 42, scopes: ['esi-location.read_location.v1', 'esi-location.read_ship_type.v1'] }] }, {
        health: () => ({}),
        async request(path) {
            requests.push(path);
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
    return { ...f, core, fresh, metadataStarted, metadata, namesStarted, names, requests };
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

test('a missing Session ship baseline starts with the first fresh same-ship sample without inventing a change', { timeout: 5000 }, async t => {
    const f = await coreFixture(t, { key: 'ship' }), { store, core } = f;
    const clock = Date.now(); t.mock.timers.enable({apis: ['Date'], now: clock});
    store.saveSnapshot(42, 'ship', { ...f.fresh({ ship_id: 200, ship_type_id: 999999 }), status: 'stale', refreshAt: new Date(Date.now() - 1).toISOString() });
    const id = changeSession(store, core.publish, 42, { action: 'start', label: 'Awaiting ship' }).id;
    assert.deepEqual(sessionReport(store, id, 42).ships.hulls, [], 'A stale starting sample is not recorded as fresh');
    t.mock.timers.tick(1000);
    f.names.resolve(); await core.sync(42); await core.bus.drain();
    const first = JSON.parse(store.db.prepare('SELECT start_context FROM sessions WHERE id=?').get(id).start_context).firstShip;
    assert.deepEqual(first, {typeId: 999999, shipId: 200, at: new Date(clock + 1000).toISOString()});
    assert.deepEqual(sessionReport(store, id, 42).ships.hulls, [], 'Hull stints use the existing half-open end boundary');
    t.mock.timers.tick(1);
    const report = sessionReport(store, id, 42);
    assert.deepEqual(report.ships.hulls.map(hull => hull.typeId), [999999]);
    assert.equal(report.ships.initialRecorded, false, 'Missing start evidence must not be backdated');
    assert.equal(report.stats.shipChanges, 0, 'The first observed baseline is not a ship transition');
    assert.equal(report.ships.changes[0].at, first.at);
});

test('first ship observations persist across restart, cost no repeat writes and remain pilot-owned', async t => {
    const f = await storage(t);session(f.store, 'late-ship', 42);session(f.store, 'other-ship', 43);
    let o = observer(f.store);
    o.ship(42, 200);o.ship(43, 300, undefined, 609);
    const first = JSON.parse(f.store.db.prepare('SELECT start_context FROM sessions WHERE id=?').get('late-ship').start_context);
    assert.deepEqual(first.firstShip, { typeId: 587, shipId: 200, at: at(1000) });
    assert.equal(o.events.length, 0);o.stop();
    const store = f.reopen();o = observer(store, {now: () => epoch + 2000});
    const writes = store.db.prepare('SELECT total_changes() n').get().n;
    o.ship(42, 200, 200);o.ship(42, 200, 200);
    assert.equal(store.db.prepare('SELECT total_changes() n').get().n, writes, 'Unchanged samples never rewrite a retained baseline');
    store.db.prepare('UPDATE sessions SET ended=? WHERE id=?').run(at(3000), 'late-ship');
    const report = sessionReport(store, 'late-ship', 42);
    assert.deepEqual(report.ships.hulls, [{typeId:587,name:'Hull 587',seconds:2,stints:1}]);
    assert.equal(report.ships.initialRecorded, false);assert.equal(report.stats.shipChanges, 0);
    assert.equal(JSON.parse(store.db.prepare('SELECT start_context FROM sessions WHERE id=?').get('other-ship').start_context).firstShip.typeId, 609);
    o.stop();
});

test('first hull received before delayed names stays with the original Session', { timeout: 5000 }, async t => {
    const f = await coreFixture(t, {key:'ship'}), {store,core} = f;
    store.saveSnapshot(42, 'ship', {status:'waiting',data:null});
    const clock = Date.now();t.mock.timers.enable({apis:['Date'],now:clock});
    const a = changeSession(store, core.publish, 42, {action:'start'}).id;
    t.mock.timers.tick(1000);const work = core.sync(42);await f.namesStarted.promise;
    t.mock.timers.tick(1000);changeSession(store, core.publish, 42, {action:'end'});
    const b = changeSession(store, core.publish, 42, {action:'start'}).id;
    f.names.resolve();await work;await core.bus.drain();
    const before = sessionReport(store, a, 42),after = sessionReport(store, b, 42);
    assert.deepEqual(before.ships.hulls.map(hull=>[hull.typeId,hull.seconds]), [[999999,1]]);
    assert.equal(before.ships.changes[0].at, new Date(clock+1000).toISOString());
    assert.equal(before.stats.shipChanges, 0);assert.deepEqual(after.ships.hulls, []);
    assert.equal(JSON.parse(store.db.prepare('SELECT start_context FROM sessions WHERE id=?').get(b).start_context).firstShip, undefined);
});

test('stale and paused ship delivery cannot establish a first hull, but re-enabled fresh evidence can', { timeout: 5000 }, async t => {
    const stale = await coreFixture(t, {key:'ship',stale:true});
    stale.store.saveSnapshot(42, 'ship', {status:'waiting',data:null});
    const staleId = changeSession(stale.store, stale.core.publish, 42, {action:'start'}).id;
    stale.names.resolve();await stale.core.sync(42);await stale.core.bus.drain();
    assert.deepEqual(sessionReport(stale.store, staleId, 42).ships.hulls, []);
    const paused = await coreFixture(t, {key:'ship'});
    paused.store.saveSnapshot(42, 'ship', {status:'waiting',data:null});
    const pausedId = changeSession(paused.store, paused.core.publish, 42, {action:'start'}).id;
    const work = paused.core.sync(42);await paused.namesStarted.promise;
    paused.core.toggle('pilot', false);paused.names.resolve();await work;await paused.core.bus.drain();
    assert.deepEqual(sessionReport(paused.store, pausedId, 42).ships.hulls, []);
    paused.core.toggle('pilot', true);await paused.core.requestSync(42);await paused.core.bus.drain();
    assert.deepEqual(sessionReport(paused.store, pausedId, 42).ships.hulls.map(hull=>hull.typeId), [999999]);
    assert.equal(sessionReport(paused.store, pausedId, 42).stats.shipChanges, 0);
});

test('first-ship projection respects earlier/equal transitions and excludes out-of-window observations', async t => {
    const {store} = await storage(t),s=session(store,'ordered-ships',42,{},at(0),at(10000));
    store.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)')
        .run(42,'ship.changed','universe','Changed hull',JSON.stringify({ship_type_id:609,ship_id:300,session_id:s.id}),at(2000));
    const project=first=>sessionShips(store,s,{capturedAt:at(0),firstShip:first},s.ended,{});
    for(const timestamp of [at(-1),at(2000),at(3000),at(10000),'invalid']){
        const result=project({typeId:587,shipId:200,at:timestamp});
        assert.deepEqual(result.changes.map(change=>[change.typeId,change.at]),[[609,at(2000)]]);
    }
    assert.deepEqual(project({typeId:587,shipId:200,at:at(1000)}).changes.map(change=>[change.typeId,change.seconds]),[[587,1],[609,8]]);
    assert.deepEqual(project({typeId:587,shipId:200,at:'2026-09-20T13:00:01+01:00'}).changes.map(change=>[change.typeId,change.seconds]),[[587,1],[609,8]]);
});

test('Pilot pause during enrichment suppresses delivery, and a fresh sample after re-enable establishes the missing baseline', { timeout: 5000 }, async t => {
    const f = await coreFixture(t), { store, core } = f;
    // The retained sample is already in this system, but is too stale to seed
    // the Session. A paused response must not silently refresh that sample.
    store.saveSnapshot(42, 'location', { ...f.fresh({ solar_system_id: 32009999 }), status: 'stale' });
    const retained = store.snapshot(42, 'location');
    const active = changeSession(store, core.publish, 42, { action: 'start', label: 'Pause boundary' }).id;
    const work = core.sync(42); await f.metadataStarted.promise;
    core.toggle('pilot', false); f.metadata.resolve(); f.names.resolve(); await work; await core.bus.drain();
    assert.deepEqual(store.snapshot(42, 'location'), retained);
    assert.equal(visits(store).length, 0); assert.deepEqual(discoveredSystemIds(store, 42), []);
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='location.changed'").get().n, 0);
    core.toggle('pilot', true); await core.requestSync(42); await core.bus.drain();
    assert.equal(visits(store).length, 1); assert.equal(visits(store)[0].session_id, active);
    assert.equal(visits(store)[0].system_id, 32009999); assert.deepEqual(discoveredSystemIds(store, 42), [32009999]);
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='location.changed'").get().n, 0, 'A same-system baseline is not a new transition');
});

test('Pilot pause during enrichment retains the prior system until a fresh resumed transition, without duplicate delivery', { timeout: 5000 }, async t => {
    const f = await coreFixture(t), { store, core } = f;
    const retained = store.snapshot(42, 'location');
    const active = changeSession(store, core.publish, 42, { action: 'start', label: 'Resume transition' }).id;
    const work = core.sync(42); await f.metadataStarted.promise;
    core.toggle('pilot', false); f.metadata.resolve(); f.names.resolve(); await work; await core.bus.drain();
    assert.deepEqual(store.snapshot(42, 'location'), retained, 'Paused enrichment cannot overwrite the last accepted system');
    assert.equal(retained.data.solar_system_id, A);
    assert.deepEqual(visits(store), []); assert.deepEqual(discoveredSystemIds(store, 42), []);
    const transitions = () => store.db.prepare("SELECT * FROM events WHERE type='location.changed' ORDER BY id").all();
    assert.deepEqual(transitions(), []);
    const resumedAt = Date.now();
    core.toggle('pilot', true); await core.requestSync(42); await core.bus.drain();
    assert.equal(store.snapshot(42, 'location').data.solar_system_id, 32009999);
    const recorded = visits(store), events = transitions();
    assert.equal(recorded.length, 1); assert.equal(recorded[0].system_id, 32009999); assert.equal(recorded[0].session_id, active);
    assert.equal(events.length, 1, 'The fresh sample differs from the last accepted system');
    assert.equal(events[0].at, recorded[0].at); assert.ok(Date.parse(events[0].at) >= resumedAt);
    assert.equal(JSON.parse(events[0].payload).system_id, 32009999); assert.equal(JSON.parse(events[0].payload).session_id, active);
    assert.deepEqual(discoveredSystemIds(store, 42), [32009999]);
    await core.requestSync(42); await core.bus.drain();
    assert.deepEqual(visits(store), recorded); assert.deepEqual(transitions(), events);
    assert.equal(f.requests.filter(path => path === '/characters/42/location').length, 3, 'Only the three explicitly requested samples reach ESI');
});


test('route projection preserves frozen SQL/prepared rows, name precedence and synthetic-start metadata', async t => {
    const { store } = await storage(t), unknown = 30009999;
    const start = Object.freeze({ capturedAt: at(0), system: Object.freeze({ id: A, name: 'Recorded start' }), shipTypeId: 609 });
    const s = session(store, 'projection', 42, start, at(0), at(5000));
    const system = store.db.prepare('INSERT INTO universe_systems(system_id,name,region_id,region_name,security) VALUES(?,?,?,?,?)');
    system.run(A, 'Catalogue start', 10000001, 'Start region', 0.5);
    system.run(B, 'Catalogue destination', 10000002, 'Destination region', 0.7);
    const recordedOwner = { owner_type: 'alliance', owner_id: 77, owner_name: ' Brave ', observed_at: at(0), recorded_at: at(1000), source: 'esi' };
    const put = store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id,ship_type_id,sovereignty_at_visit) VALUES(?,?,?,?,?,?,?)');
    const recorded = Number(put.run(42, B, 'Recorded destination', at(1000), s.id, 588, JSON.stringify(recordedOwner)).lastInsertRowid);
    const catalogue = Number(put.run(42, B, '', at(1000), s.id, 588, null).lastInsertRowid);
    const cached = Number(put.run(42, W, '', at(2000), s.id, null, null).lastInsertRowid);
    const fallback = Number(put.run(42, unknown, '', at(3000), s.id, null, null).lastInsertRowid);
    put.run(42, W, 'Before session', at(-1000), s.id, null, null);
    put.run(43, W, 'Other pilot', at(1500), s.id, null, null);
    put.run(42, W, 'Other session', at(2500), 'other', null, null);
    put.run(42, W, 'Exact end', at(5000), s.id, null, null);
    const freezeRows = rows => Object.freeze(rows.map(Object.freeze));
    const prepared = freezeRows(store.db.prepare(`SELECT v.*,u.name system_name,u.region_id,u.region_name,u.security
        FROM visits v LEFT JOIN universe_systems u USING(system_id) ORDER BY at,id`).all());
    const before = JSON.stringify(prepared), names = Object.freeze({ [A]: 'Cached start', [B]: 'Cached destination', [W]: 'Cached wormhole' });
    const expected = [
        { id: 'start', systemId: A, name: 'Recorded start', regionId: 10000001, regionName: 'Start region', security: 0.5,
            entered: at(0), exited: at(1000), seconds: 1, shipTypeId: 609, sovereignty_at_visit: null, clipped: true, inferred: false, active: false },
        { id: recorded, systemId: B, name: 'Recorded destination', regionId: 10000002, regionName: 'Destination region', security: 0.7,
            entered: at(1000), exited: at(1000), seconds: 0, shipTypeId: 588,
            sovereignty_at_visit: { owner_type: 'alliance', owner_id: 77, owner_name: 'Brave', observed_at: at(0), recorded_at: at(1000), source: 'esi' },
            clipped: false, inferred: false, active: false },
        { id: catalogue, systemId: B, name: 'Catalogue destination', regionId: 10000002, regionName: 'Destination region', security: 0.7,
            entered: at(1000), exited: at(2000), seconds: 1, shipTypeId: 588, sovereignty_at_visit: null, clipped: false, inferred: false, active: false },
        { id: cached, systemId: W, name: 'Cached wormhole', regionId: null, regionName: null, security: null,
            entered: at(2000), exited: at(3000), seconds: 1, shipTypeId: null, sovereignty_at_visit: null, clipped: false, inferred: false, active: false },
        { id: fallback, systemId: unknown, name: String(unknown), regionId: null, regionName: null, security: null,
            entered: at(3000), exited: at(5000), seconds: 2, shipTypeId: null, sovereignty_at_visit: null, clipped: false, inferred: false, active: false },
    ];
    // Freeze the database result too, so the ordinary direct path cannot hide
    // mutation behind the report's separate prepared-row filtering array.
    const observedStore = { ...store, db: { prepare(sql) {
        const statement = store.db.prepare(sql);
        return /FROM visits v LEFT JOIN universe_systems/.test(sql)
            ? { all: (...args) => freezeRows(statement.all(...args)) } : statement;
    } } };
    assert.deepEqual(sessionRoute(observedStore, s, start, s.ended, names), expected);
    assert.deepEqual(sessionRoute(store, s, start, s.ended, names, prepared), expected);
    assert.equal(JSON.stringify(prepared), before);
});
