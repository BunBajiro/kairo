import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../../server/store.mjs';
import { sessionReport } from '../../server/history.mjs';
import { sessionReplay, SESSION_REPLAY_EVENT_LIMIT } from '../../server/session-replay.mjs';
import { getUniverseStatic } from '../../server/universe-static.mjs';
import { createUniverse } from '../../server/universe.mjs';
import { sessionReplaySpace } from '../../components/kairo/session-replay-map.mjs';

const epoch = Date.parse('2026-09-18T10:00:00Z'), at = minutes => new Date(epoch + minutes * 60000).toISOString();
async function storage(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-session-replay-')), store = openStore(dir);
    t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
    return store;
}
function session(store, { id = 'replay', start = { capturedAt: at(0), system: { id: 30000142, name: 'Jita' } }, finish = {}, ended = at(60) } = {}) {
    store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)')
        .run(id, 42, 'Recorded session', at(0), ended, JSON.stringify(start), JSON.stringify(finish));
}
function emit(store, type, minute, payload = {}, characterId = 42) {
    return Number(store.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)')
        .run(characterId, type, 'test', type, JSON.stringify(payload), at(minute)).lastInsertRowid);
}
function visit(store, systemId, minute, characterId = 42, sessionId = 'replay') {
    store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)').run(characterId, systemId, 'System ' + systemId, at(minute), sessionId);
}

test('replay retains repeated systems and same-system observations without inventing intermediate travel', async t => {
    const store = await storage(t); session(store);
    visit(store, 30000144, 10); visit(store, 30000142, 20); visit(store, 30000142, 25); visit(store, 30000145, 40);
    visit(store, 30000146, 45, 43); visit(store, 30000147, 60);
    emit(store, 'wallet.entry', 15, { amount: 100 });
    const result = sessionReplay(store, 'replay', 42);
    assert.deepEqual(result.visits.map(v => v.systemId), sessionReport(store, 'replay', 42).route.map(v => v.systemId));
    assert.deepEqual(result.visits.map(v => v.systemId), [30000142, 30000144, 30000142, 30000142, 30000145]);
    assert.deepEqual(result.travel.map(e => [e.from_system_id, e.to_system_id]), [[30000142, 30000144], [30000144, 30000142], [30000142, 30000145]]);
    assert.ok(result.travel.every(e => e.connection_basis === 'observed_transition'));
    assert.equal(result.events[0].system_id, 30000144);
    assert.equal(result.events[0].location_basis, 'observed_visit');
    assert.equal(result.visits.at(-1).exited, at(60));
    assert.equal(result.coverage.gaps.length, 0);
});

test('a stationary session replays one start position with no fabricated movement or long-dwell gap', async t => {
    const store = await storage(t); session(store); emit(store, 'goal.completed', 59);
    const result = sessionReplay(store, 'replay', 42);
    assert.equal(result.durationMs, 3600000);
    assert.equal(result.visits.length, 1);
    assert.equal(result.visits[0].location_basis, 'session_start');
    assert.equal(result.travel.length, 0);
    assert.equal(result.coverage.gaps.length, 0);
    assert.equal(result.events[0].location_basis, 'observed_visit');
    assert.ok(result.systems[0].coordinates_available);
});

test('event membership exactly matches report start/end cursor semantics, including delayed kills', async t => {
    const store = await storage(t);
    emit(store, 'goal.completed', 0); const startCursor = emit(store, 'wallet.entry', 0);
    emit(store, 'session.started', 0, { session_id: 'replay' });
    emit(store, 'session.started', 0, { session_id: 'other' });
    const includedStart = emit(store, 'ship.changed', 0);
    const includedEnd = emit(store, 'goal.completed', 60);
    const endCursor = emit(store, 'wallet.entry', 60);
    emit(store, 'ship.changed', 60);
    emit(store, 'session.ended', 60, { session_id: 'other' });
    const sessionEnd = emit(store, 'session.ended', 60, { session_id: 'replay' });
    const killStart = emit(store, 'killmail.kill', 0, { system_id: 30000142 });
    const lateKill = emit(store, 'killmail.loss', 30, { system_id: 30000144 });
    emit(store, 'killmail.kill', 60); emit(store, 'goal.completed', 30, {}, 43);
    session(store, { start: { capturedAt: at(0), eventCursor: startCursor }, finish: { eventCursor: endCursor } });
    const result = sessionReplay(store, 'replay', 42);
    assert.deepEqual(result.events.map(e => e.id), sessionReport(store, 'replay', 42).events.map(e => e.id));
    for (const id of [includedStart, includedEnd, sessionEnd, killStart, lateKill]) assert.ok(result.events.some(e => e.id === id));
    assert.ok(result.events.every(e => e.character_id === 42));
});

test('explicit and owned combat locations outrank context, while unknown locations stay unplaced', async t => {
    const store = await storage(t); session(store, { start: { capturedAt: at(0) } });
    visit(store, 30000142, 20);
    const unknown = emit(store, 'goal.completed', 5);
    const explicit = emit(store, 'wallet.entry', 25, { system_id: 30000144 });
    const combat = emit(store, 'killmail.kill', 30, { killmail_id: 77 });
    const wrongPilot = emit(store, 'killmail.loss', 10, { killmail_id: 88 });
    const record = (id, system) => JSON.stringify({ killmail_id: id, solar_system_id: system });
    store.db.prepare('INSERT INTO combat_records VALUES(?,?,?,?,?,?)').run(42, 77, 'kill', at(30), record(77, 30000145), 'fixture');
    store.db.prepare('INSERT INTO combat_records VALUES(?,?,?,?,?,?)').run(43, 88, 'loss', at(10), record(88, 30000146), 'fixture');
    const result = sessionReplay(store, 'replay', 42), byId = new Map(result.events.map(e => [e.id, e]));
    assert.equal(byId.get(unknown).system_id, null);
    assert.equal(byId.get(wrongPilot).system_id, null);
    assert.equal(byId.get(explicit).system_id, 30000144);
    assert.equal(byId.get(explicit).location_basis, 'explicit_payload');
    assert.equal(byId.get(combat).system_id, 30000145);
    assert.equal(byId.get(combat).location_basis, 'combat_record');
    assert.equal(byId.get(combat).visit_id, null);
    assert.deepEqual(result.coverage.gaps, [{ from: at(0), to: at(20), reason: 'Location before the first recorded visit is unavailable.' }]);
    assert.equal(result.coverage.unlocatedEvents, 2);
    assert.equal(result.visits.length, 1, 'Combat locations never invent player visits');
});

test('missing history remains a gap; owned unknown systems retain honest coordinate coverage', async t => {
    const store = await storage(t); session(store, { start: { capturedAt: at(0) } });
    emit(store, 'goal.completed', 10);
    let result = sessionReplay(store, 'replay', 42);
    assert.deepEqual(result.visits, []); assert.deepEqual(result.travel, []); assert.deepEqual(result.systems, []);
    assert.equal(result.coverage.gaps[0].to, at(60));
    session(store, { id: 'unknown', start: {} }); visit(store, 1, -10, 42, null);
    result = sessionReplay(store, 'unknown', 42);
    assert.deepEqual(result.visits, [], 'Unowned prior observations do not invent a Session start');
    visit(store, 1, 5, 42, 'unknown');
    result = sessionReplay(store, 'unknown', 42);
    assert.equal(result.visits[0].location_basis, 'recorded_visit');
    assert.equal(result.events[0].location_basis, 'observed_visit');
    assert.deepEqual(result.coverage.missingCoordinateSystemIds, [1]);
    assert.equal(result.systems[0].x, null);
    assert.equal(result.travel.length, 0);
    store.db.prepare('INSERT INTO universe_systems VALUES(?,?,?,?,?,?,?,?,?,?)').run(1, 'Retained system', 2, 'C', 3, 'R', 0.5, 9460000000000000, 0, -9460000000000000);
    result = sessionReplay(store, 'unknown', 42);
    assert.equal(result.systems[0].coordinate_source, 'recorded');
    assert.deepEqual([result.systems[0].map_x, result.systems[0].map_y], [1, 1]);
    assert.deepEqual(result.coverage.missingCoordinateSystemIds, []);
});

test('replay includes more than one report page and clearly bounds huge event histories without truncating visits', async t => {
    const store = await storage(t); session(store);
    store.db.exec('BEGIN');
    for (let index = 0; index < 135; index++) emit(store, 'wallet.entry', 1 + index / 100, { amount: index });
    store.db.exec('COMMIT');
    let result = sessionReplay(store, 'replay', 42);
    assert.equal(result.events.length, 135); assert.equal(result.coverage.truncated, false);
    store.db.exec('BEGIN');
    for (let index = 135; index < SESSION_REPLAY_EVENT_LIMIT + 7; index++) emit(store, 'wallet.entry', 5, { amount: index });
    visit(store, 30000144, 50); store.db.exec('COMMIT');
    result = sessionReplay(store, 'replay', 42);
    assert.equal(result.events.length, SESSION_REPLAY_EVENT_LIMIT);
    assert.equal(result.coverage.totalEvents, SESSION_REPLAY_EVENT_LIMIT + 7);
    assert.equal(result.coverage.omittedEvents, 7);
    assert.equal(result.coverage.truncated, true);
    assert.equal(result.visits.at(-1).systemId, 30000144);
    assert.equal(new Set(result.events.map(e => e.id)).size, result.events.length);
});

test('replay suppresses routine location and protection events while preserving movement and source reports', async t => {
    const store = await storage(t); session(store);
    visit(store, 30000144, 10); visit(store, 30000142, 20);
    const routineTypes = ['system.entered', 'location.changed', 'opsec.changed', 'opsec.policy.changed', 'opsec.state.changed'];
    const routineIds = routineTypes.map((type, index) => emit(store, type, 10 + index, { system_id: 1 }));
    const moduleEvent = emit(store, 'policy.changed', 16, { system_id: 1 });
    store.db.prepare('UPDATE events SET module=? WHERE id=?').run('opsec', moduleEvent);
    routineIds.push(moduleEvent);
    const activityIds = [emit(store, 'killmail.kill', 15, { system_id: 30000144 }), emit(store, 'ship.changed', 25)];
    const reportBefore = sessionReport(store, 'replay', 42);
    const result = sessionReplay(store, 'replay', 42);
    assert.deepEqual(result.events.map(e => e.id), activityIds);
    assert.deepEqual(result.visits.map(v => v.systemId), [30000142, 30000144, 30000142]);
    assert.deepEqual(result.travel.map(e => [e.from_system_id, e.to_system_id]), [[30000142, 30000144], [30000144, 30000142]]);
    assert.equal(result.coverage.totalEvents, 2);
    assert.equal(result.coverage.suppressedRoutineEvents, routineIds.length);
    assert.equal(result.coverage.omittedEvents, 0);
    assert.equal(result.coverage.truncated, false);
    assert.deepEqual(result.coverage.missingCoordinateSystemIds, [], 'Suppressed activity does not add spurious missing locations');
    assert.deepEqual(sessionReport(store, 'replay', 42).events, reportBefore.events);
    assert.ok(routineIds.every(id => reportBefore.events.some(event => event.id === id)), 'The full session report retains the source events');
});

test('routine events cannot crowd meaningful activity out of the cap or inflate incomplete coverage', async t => {
    const store = await storage(t); session(store, { start: { capturedAt: at(0) } });
    for (let index = 0; index < 30; index++) emit(store, index % 2 ? 'opsec.changed' : 'location.changed', index / 10);
    const meaningful = [emit(store, 'killmail.kill', 5, { system_id: 30000142 }), emit(store, 'goal.completed', 6, { system_id: 30000144 })];
    visit(store, 30000142, 10); visit(store, 30000144, 50);
    let result = sessionReplay(store, 'replay', 42, { eventLimit: 2 });
    assert.deepEqual(result.events.map(e => e.id), meaningful);
    assert.equal(result.coverage.suppressedRoutineEvents, 30);
    assert.equal(result.coverage.totalEvents, 2);
    assert.equal(result.coverage.returnedEvents, 2);
    assert.equal(result.coverage.omittedEvents, 0);
    assert.equal(result.coverage.truncated, false);
    assert.equal(result.coverage.unlocatedEvents, 0, 'Hidden routine events have no effect on event location coverage');
    emit(store, 'skill.completed', 7);
    result = sessionReplay(store, 'replay', 42, { eventLimit: 2 });
    assert.deepEqual(result.events.map(e => e.id), meaningful);
    assert.equal(result.coverage.totalEvents, 3);
    assert.equal(result.coverage.omittedEvents, 1);
    assert.equal(result.coverage.truncated, true);
    assert.equal(result.visits.at(-1).systemId, 30000144);
    assert.equal(result.travel.length, 1, 'All visits and transitions remain available after the event limit');
});

test('live replay snapshots its end once, performs no writes and enforces pilot ownership', async t => {
    const store = await storage(t); session(store, { ended: null });
    visit(store, 30000144, 10); emit(store, 'goal.completed', 15); emit(store, 'goal.completed', 25);
    const writesBefore = store.db.prepare('SELECT total_changes() count').get().count;
    let clockReads = 0;
    const result = sessionReplay(store, 'replay', 42, { now: () => { clockReads++; return epoch + 20 * 60000; } });
    assert.equal(clockReads, 1);
    assert.equal(result.endedAt, at(20)); assert.equal(result.snapshotAt, at(20));
    assert.equal(result.visits.at(-1).exited, at(20)); assert.equal(result.events.length, 1);
    assert.equal(result.session.live, true);
    assert.equal(store.db.prepare('SELECT total_changes() count').get().count, writesBefore);
    assert.throws(() => sessionReplay(store, 'replay', 43), /not found for this character/);
    assert.throws(() => sessionReplay(store, 'replay', 0), /not found for this character/);
    assert.throws(() => sessionReplay(store, 'unknown', 42), /not found for this character/);
});

test('recorded J-Space movement replays after restart and live connection removal without restoring map entities', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-jspace-replay-'));
    let store = openStore(dir), service, clock = epoch;
    t.after(async () => { await service?.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
    const graph = getUniverseStatic(), [first, second] = graph.systems.filter(system => system.space === 'wormhole');
    const entrance = 30000142, exit = 30000144, ids = [entrance, first.system_id, second.system_id, exit];
    session(store);
    for (const [index, id] of ids.slice(1).entries()) visit(store, id, (index + 1) * 10);
    emit(store, 'ship.changed', 15);
    emit(store, 'goal.completed', 25, { system_id: second.system_id });
    service = createUniverse(store, { characters: () => [{ id: 42, scopes: [] }] }, {}, { now: () => clock, noSync: true });
    let map = service.jspace.create(42, { name: 'Live chain' });
    const command = (op, extra) => map = service.jspace.command(42, map.id, { revision: map.revision, op, ...extra });
    for (const system_id of ids) command('node.save', { node: { system_id } });
    for (const [index, to_system_id] of ids.slice(1).entries()) command('connection.save', { connection: {
        from_system_id: ids[index], to_system_id, duration_hours: 1, notes: 'Private live connection detail',
    } });
    command('connection.remove', { connection_id: map.connections[0].id });
    clock += 2 * 3600000;
    assert.equal(service.jspace.map(42, map.id).connections.length, 0, 'The remaining live wormholes expire');
    assert.equal(store.db.prepare("SELECT COUNT(*) count FROM universe_records WHERE kind='link'").get().count, 0);
    await service.close(); service = null; store.close(); store = openStore(dir);
    const before = store.db.prepare('SELECT total_changes() count').get().count;
    const mapsBefore = store.db.prepare('SELECT * FROM universe_records ORDER BY character_id,kind,id').all();
    const result = sessionReplay(store, 'replay', 42, { now: () => clock });
    assert.deepEqual(result.visits.map(row => row.systemId), ids);
    assert.deepEqual(result.travel.map(row => [row.from_system_id, row.to_system_id]), ids.slice(1).map((id, index) => [ids[index], id]));
    assert.deepEqual(result.events.map(row => row.system_id), [first.system_id, second.system_id]);
    assert.deepEqual(result.coverage.missingCoordinateSystemIds, []);
    assert.equal(result.systems.find(row => row.system_id === first.system_id).wormhole_class_id, first.wormhole_class_id);
    assert.ok(result.travel.every(row => row.connection_basis === 'observed_transition' && !('expires_at' in row) && !('link_id' in row)));
    assert.ok(!JSON.stringify(result).includes('Private live connection detail'));
    assert.equal(store.db.prepare('SELECT total_changes() count').get().count, before, 'Replay performs no writes after restart');
    assert.deepEqual(store.db.prepare('SELECT * FROM universe_records ORDER BY character_id,kind,id').all(), mapsBefore);
});

test('replay schematic includes each J-Space entrance and exit then returns to physical K-Space, including rewinds', () => {
    const ids = [1, 2, 31000001, 31000002, 3, 4, 3, 31000002, 2, 1];
    const visits = ids.map((systemId, id) => ({ id, systemId }));
    const systems = new Map(ids.map(id => [id, { space: id >= 31000000 ? 'wormhole' : 'known' }]));
    const expected = ['known', 'wormhole', 'wormhole', 'wormhole', 'wormhole', 'known', 'wormhole', 'wormhole', 'wormhole', 'known'];
    for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 4, 3, 1, 0]) {
        assert.equal(sessionReplaySpace(visits, index, systems), expected[index], `Visit ${index}`);
    }
    assert.equal(sessionReplaySpace(visits, undefined, systems), 'known', 'A recording gap is not placed into a chain');
});

test('repeated entrance or exit observations cannot switch replay projection during a stationary visit', () => {
    const ids = [1, 2, 2, 31000001, 3, 3, 4];
    const visits = ids.map((systemId, id) => ({ id, systemId }));
    const systems = new Map(ids.map(id => [id, { space: id >= 31000000 ? 'wormhole' : 'known' }]));
    assert.deepEqual(visits.map(row => sessionReplaySpace(visits, row.id, systems)), ['known', 'wormhole', 'wormhole', 'wormhole', 'wormhole', 'wormhole', 'known']);
});
