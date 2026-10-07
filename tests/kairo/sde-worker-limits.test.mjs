import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import { workerBuild } from '../../server/datasets.mjs';

function running(signal) {
  const worker = new EventEmitter(), timers = new Map();
  let nextTimer = 0, terminations = 0, settled = false;
  worker.terminate = async () => { terminations++; };
  const promise = workerBuild({ archivePath: 'unused', outputDir: 'unused', limits: { conversionMs: 100, noProgressMs: 10 } }, {
    signal, createWorker: () => worker,
    setTimer: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimer: id => timers.delete(id),
  });
  promise.then(() => { settled = true; }, () => { settled = true; });
  return { worker, promise, timers, get terminations() { return terminations; }, get settled() { return settled; },
    fire(ms) { const [id, timer] = [...timers].find(([, value]) => value.ms === ms); timers.delete(id); timer.fn(); } };
}

test('stalled conversion terminates once and rejects only after actual worker exit', async () => {
  const run = running();
  run.fire(10); await Promise.resolve();
  assert.equal(run.terminations, 1); assert.equal(run.settled, false);
  run.worker.emit('message', { type: 'result', manifest: { build: 1 } });
  run.worker.emit('exit', 1);
  await assert.rejects(run.promise, { code: 'SDE_NO_PROGRESS' });
  assert.equal(run.timers.size, 0);
});

test('meaningful progress renews idle deadline but cannot renew total conversion budget', async () => {
  const run = running();
  const firstProgressTimer = [...run.timers].find(([, value]) => value.ms === 10)[0];
  run.worker.emit('message', { type: 'progress', inputRows: 1000 });
  assert.equal(run.timers.has(firstProgressTimer), false);
  assert.equal(run.timers.size, 2);
  run.fire(100); run.fire(10);
  assert.equal(run.terminations, 1);
  run.worker.emit('exit', 1);
  await assert.rejects(run.promise, { code: 'SDE_CONVERSION_TIMEOUT' });
});

test('cancellation waits for exit and clears both watchdogs', async () => {
  const controller = new AbortController(), run = running(controller.signal);
  controller.abort(); await Promise.resolve();
  assert.equal(run.terminations, 1); assert.equal(run.settled, false);
  run.worker.emit('exit', 1);
  await assert.rejects(run.promise, { name: 'AbortError' });
  assert.equal(run.timers.size, 0);
});

test('worker resource error code survives serialization and normal exit', async () => {
  const run = running();
  run.worker.emit('message', { type: 'error', error: { code: 'ENOSPC', message: 'Disk full' } });
  run.worker.emit('exit', 0);
  await assert.rejects(run.promise, { code: 'ENOSPC', message: 'Disk full' });
  assert.equal(run.timers.size, 0);
});

test('watchdog stops a real blocked worker thread before reporting failure', async () => {
  let exited = false;
  await assert.rejects(workerBuild({ limits: { conversionMs: 2000, noProgressMs: 200 } }, {
    createWorker: () => {
      const worker = new Worker('const { parentPort } = require("node:worker_threads"); parentPort.postMessage({type:"progress", inputRows:1}); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);', { eval: true });
      worker.once('exit', () => { exited = true; });
      return worker;
    },
  }), { code: 'SDE_NO_PROGRESS' });
  assert.equal(exited, true);
});
