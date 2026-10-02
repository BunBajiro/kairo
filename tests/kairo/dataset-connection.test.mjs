import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatasetConnection } from '../../components/kairo/dataset-connection.mjs';

const tuple = build => `${build}:${build}:${build}`;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture(extra = {}) {
    const states = [], refreshed = [], completed = [], timers = new Map(), seen = new Set(); let timerId = 0;
    const connection = createDatasetConnection({
        revision: tuple(1), onState: state => states.push(state),
        refresh: async revision => { refreshed.push(revision); }, onComplete: revision => completed.push(revision),
        seenRecovery: key => seen.has(key), rememberRecovery: key => seen.add(key),
        setTimer: callback => { const id = ++timerId; timers.set(id, callback); return id; }, clearTimer: id => timers.delete(id),
        ...extra,
    });
    return { connection, states, refreshed, completed, timers, seen, timeout: () => { for (const callback of [...timers.values()]) callback(); timers.clear(); } };
}

test('a planned restart waits for the complete target generation, not merely an open connection', async () => {
    const { connection: c, refreshed, completed } = fixture();
    c.restarting({ build: 2, startedAt: 'now' }); c.disconnect(); c.connect();
    await c.revision({ revision: tuple(1) }); await c.revision({ revision: '2:1:2' }); await c.revision({ revision: '2:3:2' });
    assert.equal(c.state.phase, 'restarting'); assert.deepEqual(refreshed, []);
    await c.revision({ revision: tuple(2) });
    assert.equal(c.state.phase, 'idle'); assert.deepEqual(completed, [tuple(2)]);
});

test('a same-build restart must actually disconnect before it can complete', async () => {
    const { connection: c, refreshed } = fixture();
    c.restarting({ build: 1 }); await c.revision({ revision: tuple(1) });
    assert.equal(c.state.phase, 'restarting'); assert.equal(refreshed.length, 0);
    c.disconnect(); c.connect(); await c.revision({ revision: tuple(1) });
    assert.equal(c.state.phase, 'idle'); assert.equal(refreshed.length, 1);
});

test('ordinary reconnect refreshes a changed revision once even when the restart announcement was missed', async () => {
    const { connection: c, refreshed, completed } = fixture();
    await c.revision({ revision: tuple(1) }); c.disconnect(); c.connect();
    await c.revision({ revision: tuple(2) }); await c.revision({ revision: tuple(2) });
    assert.deepEqual(refreshed, [tuple(2)]); assert.deepEqual(completed, [tuple(2)]);
});

test('ordinary reconnect restores missed data once even when the dataset revision is unchanged', async () => {
    const work = deferred(); let requests = 0, applied = 0;
    const { connection: c, completed } = fixture({ refresh: async (_, isCurrent) => { requests++; await work.promise; if (isCurrent()) applied++; } });
    c.connect(); await c.revision({ revision: tuple(1) });
    assert.equal(requests, 0, 'Initial connection uses the existing bootstrap/state load');
    c.disconnect(); c.connect();
    const first = c.revision({ revision: tuple(1) });
    await c.revision({ revision: tuple(1) });
    assert.equal(requests, 1, 'Repeated revision messages share an in-flight recovery');
    work.resolve(); await first; await c.revision({ revision: tuple(1) });
    assert.equal(requests, 1); assert.equal(applied, 1); assert.equal(c.state.phase, 'idle');
    assert.deepEqual(completed, [], 'An ordinary reconnect does not announce a dataset update');
});

test('a cancelled restart invalidates in-flight refresh and never presents success', async () => {
    const work = deferred(); let applied = false;
    const { connection: c, completed } = fixture({ refresh: async (_, isCurrent) => { await work.promise; if (isCurrent()) applied = true; } });
    c.restarting({ build: 2 }); const pending = c.revision({ revision: tuple(2) });
    c.cancelled({ message: 'Restart was postponed.' }); work.resolve(); await pending;
    assert.equal(applied, false); assert.equal(c.state.phase, 'warning'); assert.equal(c.state.message, 'Restart was postponed.'); assert.deepEqual(completed, []);
});

test('a newer restart supersedes stale asynchronous refresh without discarding its notice', async () => {
    const work = deferred(), applied = [];
    const { connection: c, completed } = fixture({ refresh: async (revision, isCurrent) => { if (revision === tuple(2)) await work.promise; if (isCurrent()) applied.push(revision); } });
    c.restarting({ build: 2 }); const pending = c.revision({ revision: tuple(2) });
    c.restarting({ build: 3 }); work.resolve(); await pending;
    assert.equal(c.state.build, 3); assert.equal(c.state.phase, 'restarting'); assert.deepEqual(applied, []);
    await c.revision({ revision: tuple(3) }); assert.deepEqual(completed, [tuple(3)]);
});

test('disconnect during refresh invalidates it and the next connection retries the same revision', async () => {
    const first = deferred(); let requests = 0, applied = 0;
    const { connection: c, completed } = fixture({ refresh: async (_, isCurrent) => { if (++requests === 1) await first.promise; if (isCurrent()) applied++; } });
    c.restarting({ build: 2 }); const pending = c.revision({ revision: tuple(2) });
    c.disconnect(); first.resolve(); await pending; assert.equal(applied, 0);
    c.connect(); await c.revision({ revision: tuple(2) }); assert.equal(applied, 1); assert.equal(requests, 2); assert.deepEqual(completed, [tuple(2)]);
});

test('rollback is an amber notice shown once per session, never an update success', async () => {
    const { connection: c, completed, refreshed, seen } = fixture();
    const recovery = { failedBuild: 2, message: 'The previous dataset was restored.' };
    c.restarting({ build: 2 }); c.disconnect(); c.connect(); await c.revision({ revision: tuple(1), recovery });
    assert.equal(c.state.phase, 'warning'); assert.equal(c.state.message, recovery.message); assert.deepEqual(completed, []); assert.equal(seen.size, 1);
    c.dismiss(); await c.revision({ revision: tuple(1), recovery });
    assert.equal(c.state.phase, 'idle'); assert.equal(refreshed.length, 1);
});

test('a delayed restart stops the spinner and can be retried without accepting stale data', async () => {
    const { connection: c, timeout, timers } = fixture();
    c.restarting({ build: 2 }); timeout(); assert.equal(c.state.phase, 'delayed');
    await c.revision({ revision: tuple(1) }); assert.equal(c.state.phase, 'delayed');
    c.retry(); assert.equal(c.state.phase, 'restarting'); assert.equal(timers.size, 1);
    c.disconnect(); c.connect(); await c.revision({ revision: tuple(2) }); assert.equal(c.state.phase, 'idle'); assert.equal(timers.size, 0);
});

test('disposing an unmounted workspace prevents stale updates and clears its deadline', async () => {
    const work = deferred(); let applied = false;
    const { connection: c, states, timers, completed } = fixture({ refresh: async (_, isCurrent) => { await work.promise; if (isCurrent()) applied = true; } });
    c.restarting({ build: 2 }); const pending = c.revision({ revision: tuple(2) }); const count = states.length;
    c.dispose(); work.resolve(); await pending;
    assert.equal(applied, false); assert.equal(states.length, count); assert.equal(timers.size, 0); assert.deepEqual(completed, []);
});

test('a workspace refresh failure after an unannounced update remains actionable and retryable', async () => {
    let fail = true;
    const { connection: c, completed } = fixture({ refresh: async () => { if (fail) throw new Error('Connection interrupted'); } });
    await c.revision({ revision: tuple(2) }); assert.equal(c.state.phase, 'delayed'); assert.deepEqual(completed, []);
    fail = false; c.retry(); await c.revision({ revision: tuple(2) });
    assert.equal(c.state.phase, 'idle'); assert.deepEqual(completed, [tuple(2)]);
});
