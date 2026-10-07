import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../../server/store.mjs';
import { sessionEventWindow } from '../../server/session-event-window.mjs';
import { sessionReport } from '../../server/history.mjs';
import { sessionReplay } from '../../server/session-replay.mjs';

const epoch = Date.parse('2026-09-18T10:00:00Z');
const at = minute => new Date(epoch + minute * 60000).toISOString();
async function storage(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-event-window-')), store = openStore(dir);
    t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
    return store;
}
function emit(store, type, minute, payload = {}, characterId = 42) {
    const id = Number(store.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)')
        .run(characterId, type, 'test', type, JSON.stringify(payload), at(minute)).lastInsertRowid);
    return { id, at: at(minute), type };
}
function session(store, id, { started = at(0), ended = at(60), start = {}, finish = {} } = {}) {
    store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)')
        .run(id, 42, id, started, ended, JSON.stringify(start), JSON.stringify(finish));
    return store.db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
}
const orderedIds = events => [...events].sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id).map(e => e.id);

test('report and replay share exact event boundaries while preserving their distinct presentation', async t => {
    const store = await storage(t), expected = [];
    emit(store, 'goal.completed', -1);
    const startCursor = emit(store, 'goal.completed', 0).id;
    expected.push(emit(store, 'session.started', 0, { session_id: 'first' }));
    expected.push(emit(store, 'ship.changed', 0));
    expected.push(emit(store, 'ship.changed', 10, { session_id: 'first' }));
    expected.push(emit(store, 'ship.changed', 10)); // Legacy: no ownership field.
    emit(store, 'ship.changed', 10, { session_id: null }); // Explicitly outside a session.
    emit(store, 'ship.changed', 10, { session_id: 'next' });
    emit(store, 'ship.changed', 10, { session_id: 'first' }, 43);
    expected.push(emit(store, 'location.changed', 20, { session_id: 'first' }));
    emit(store, 'location.changed', 20, { session_id: null });
    expected.push(emit(store, 'opsec.state', 20));
    expected.push(emit(store, 'wallet.entry', 20, { amount: 7 }));
    expected.push(emit(store, 'wallet.entry', 20, { amount: -3 }));
    expected.push(emit(store, 'goal.completed', 60));
    const endCursor = expected.at(-1).id;
    emit(store, 'goal.completed', 60);
    emit(store, 'session.ended', 60, { session_id: 'next' });
    expected.push(emit(store, 'session.ended', 60, { session_id: 'first' }));
    expected.push(emit(store, 'ship.changed', 60, { session_id: 'first' }));
    emit(store, 'ship.changed', 60, { session_id: null });
    emit(store, 'ship.changed', 60, { session_id: 'next' });
    expected.push(emit(store, 'killmail.kill', 0));
    expected.push(emit(store, 'killmail.loss', 30));
    emit(store, 'killmail.kill', 60);
    emit(store, 'goal.completed', 61);
    session(store, 'first', { start: { eventCursor: startCursor, capturedAt: at(0) }, finish: { eventCursor: endCursor } });
    const report = sessionReport(store, 'first', 42), replay = sessionReplay(store, 'first', 42);
    assert.deepEqual(report.events.map(e => e.id), orderedIds(expected));
    assert.equal(report.stats.events, expected.length);
    assert.deepEqual([report.stats.income, report.stats.expenses, report.stats.kills, report.stats.losses], [7, 3, 1, 1]);
    const visible = expected.filter(e => !['location.changed', 'opsec.state'].includes(e.type));
    assert.deepEqual(replay.events.map(e => e.id), orderedIds(visible));
    assert.deepEqual([replay.coverage.totalEvents, replay.coverage.suppressedRoutineEvents], [visible.length, 2]);
    assert.throws(() => sessionReport(store, 'first', 43), /not found for this character/);
    assert.throws(() => sessionReplay(store, 'first', 43), /not found for this character/);
});

test('same-timestamp adjacent sessions keep delayed owned observations in their original session', async t => {
    const store = await storage(t);
    const cursor = emit(store, 'goal.completed', 60).id;
    session(store, 'first', { start: { capturedAt: at(0) }, finish: { eventCursor: cursor } });
    const firstEnd = emit(store, 'session.ended', 60, { session_id: 'first' });
    session(store, 'next', { started: at(60), ended: at(120), start: { capturedAt: at(60), eventCursor: firstEnd.id } });
    const nextStart = emit(store, 'session.started', 60, { session_id: 'next' });
    const oldShip = emit(store, 'ship.changed', 60, { session_id: 'first' });
    const newShip = emit(store, 'ship.changed', 60, { session_id: 'next' });
    emit(store, 'ship.changed', 60, { session_id: null });
    const kill = emit(store, 'killmail.kill', 60);
    for (const read of [sessionReport, sessionReplay]) {
        assert.deepEqual(read(store, 'first', 42).events.map(e => e.id), [cursor, firstEnd.id, oldShip.id]);
        assert.deepEqual(read(store, 'next', 42).events.map(e => e.id), [nextStart.id, newShip.id, kill.id]);
    }
});

test('replay snapshot fences new rows without report construction; live report can subsequently include them', async t => {
    const store = await storage(t), s = session(store, 'live', { ended: null, start: { capturedAt: at(0) } });
    const before = emit(store, 'goal.completed', 10);
    const prepare = store.db.prepare.bind(store.db), snapshot = store.snapshot;
    let after;
    store.db.prepare = sql => {
        const statement = prepare(sql);
        if (/SELECT COALESCE\(MAX\(id\),0\) id FROM events/.test(sql)) return {
            get() { const cursor = statement.get(); after = emit(store, 'goal.completed', 20); return cursor; },
        };
        return statement;
    };
    store.snapshot = () => { throw new Error('Replay must not construct report context or aggregates'); };
    let replay;
    try { replay = sessionReplay(store, s.id, 42, { now: epoch + 60 * 60000 }); }
    finally { store.db.prepare = prepare; store.snapshot = snapshot; }
    assert.equal(replay.eventCursor, before.id);
    assert.deepEqual(replay.events.map(e => e.id), [before.id]);
    assert.equal(replay.coverage.totalEvents, 1);
    assert.deepEqual(sessionReport(store, s.id, 42).events.map(e => e.id), [before.id, after.id]);
});

test('legacy and aliased event windows retain bounded per-pilot index selection', async t => {
    const store = await storage(t), s = session(store, 'legacy');
    const own = emit(store, 'goal.completed', 0), end = emit(store, 'goal.completed', 60);
    emit(store, 'goal.completed', 30, {}, 43);
    const writes = store.db.prepare('SELECT total_changes() count').get().count;
    for (const prefix of ['', 'e.']) {
        const { where, params } = sessionEventWindow(s, {}, {}, s.ended, { prefix });
        assert.deepEqual(store.db.prepare(`SELECT ${prefix}id FROM events${prefix ? ' e' : ''} WHERE ${where} ORDER BY ${prefix}at,${prefix}id`).all(...params).map(e => e.id), [own.id, end.id]);
        const plan = store.db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM events${prefix ? ' e' : ''} WHERE ${where}`).all(...params);
        assert.ok(plan.some(row => row.detail.includes('idx_events_character_at') && row.detail.includes('at>') && row.detail.includes('at<')), JSON.stringify(plan));
    }
    assert.equal(store.db.prepare('SELECT total_changes() count').get().count, writes);
});
