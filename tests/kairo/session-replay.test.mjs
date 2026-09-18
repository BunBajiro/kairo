import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../../server/store.mjs';
import { sessionReport } from '../../server/history.mjs';
import { sessionReplay, SESSION_REPLAY_EVENT_LIMIT } from '../../server/session-replay.mjs';

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
function visit(store, systemId, minute, characterId = 42) {
    store.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(characterId, systemId, 'System ' + systemId, at(minute));
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

test('missing history is preserved as a gap; legacy prior observations are explicitly inferred', async t => {
    const store = await storage(t); session(store, { start: { capturedAt: at(0) } });
    emit(store, 'goal.completed', 10);
    let result = sessionReplay(store, 'replay', 42);
    assert.deepEqual(result.visits, []); assert.deepEqual(result.travel, []); assert.deepEqual(result.systems, []);
    assert.equal(result.coverage.gaps[0].to, at(60));
    session(store, { id: 'legacy', start: {} }); visit(store, 1, -10);
    result = sessionReplay(store, 'legacy', 42);
    assert.equal(result.visits[0].location_basis, 'inferred_visit');
    assert.equal(result.events[0].location_basis, 'inferred_visit');
    assert.deepEqual(result.coverage.missingCoordinateSystemIds, [1]);
    assert.equal(result.systems[0].x, null);
    assert.equal(result.travel.length, 0);
    store.db.prepare('INSERT INTO universe_systems VALUES(?,?,?,?,?,?,?,?,?,?)').run(1, 'Retained system', 2, 'C', 3, 'R', 0.5, 9460000000000000, 0, -9460000000000000);
    result = sessionReplay(store, 'legacy', 42);
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
