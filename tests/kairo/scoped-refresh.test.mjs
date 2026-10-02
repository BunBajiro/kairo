import test from 'node:test';
import assert from 'node:assert/strict';
import {createScopedRefresh} from '../../components/kairo/scoped-refresh.mjs';

const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
const tick = () => new Promise(resolve => setImmediate(resolve));

test('a burst keeps one active read and one follow-up instead of losing invalidation', async () => {
    const reads = [], values = [];
    const scope = createScopedRefresh({read: () => {const read = deferred(); reads.push(read); return read.promise;}, publish: value => values.push(value)});
    const done = scope.request();
    for (let i = 0; i < 10; i++) assert.equal(scope.request(), done);
    assert.equal(reads.length, 1);
    reads[0].resolve('first'); await tick();
    assert.equal(reads.length, 2);
    reads[1].resolve('latest'); await done;
    assert.deepEqual(values, ['first', 'latest']);
    assert.equal(reads.length, 2);
    scope.close();
});

test('busy owners retain changes, resume once and may explicitly refresh for conflict recovery', async () => {
    let busy = true, reads = 0;
    const scope = createScopedRefresh({read: async () => ++reads, publish: () => {}, canRead: () => !busy});
    const pending = scope.request(); scope.request(); await tick(); assert.equal(reads, 0);
    busy = false; scope.resume(); await pending; assert.equal(reads, 1);
    busy = true; await scope.request({force: true}); assert.equal(reads, 2);
    scope.close();
});

test('leaving a pilot/map scope prevents old publication and releases waiters', async () => {
    const oldRead = deferred(), values = [];
    const old = createScopedRefresh({read: () => oldRead.promise, publish: value => values.push(value)});
    const pending = old.request(); old.request(); old.close(); await pending;
    const next = createScopedRefresh({read: async () => 'pilot B', publish: value => values.push(value)});
    await next.request(); oldRead.resolve('pilot A'); await tick();
    assert.deepEqual(values, ['pilot B']);
    await old.request(); next.close();
});

test('a failed read still drains a newer invalidation and does not overlap reads', async () => {
    const first = deferred(), failures = [], values = []; let calls = 0;
    const scope = createScopedRefresh({read: () => ++calls === 1 ? first.promise : Promise.resolve('recovered'), publish: value => values.push(value), onError: error => failures.push(error.message)});
    const done = scope.request(); scope.request(); first.reject(new Error('temporary'));
    await done; assert.equal(calls, 2); assert.deepEqual(failures, ['temporary']); assert.deepEqual(values, ['recovered']); scope.close();
});

test('a change during forced conflict recovery waits for the mutation without deadlocking it', async () => {
    let busy = true, calls = 0; const first = deferred(), values = [];
    const scope = createScopedRefresh({read: () => ++calls === 1 ? first.promise : Promise.resolve('after mutation'), publish: value => values.push(value), canRead: () => !busy});
    const recovered = scope.request({force: true}); scope.request();
    first.resolve('conflict state'); await recovered;
    assert.equal(calls, 1);
    busy = false; scope.resume(); await tick();
    assert.deepEqual(values, ['conflict state', 'after mutation']);
    scope.close();
});
