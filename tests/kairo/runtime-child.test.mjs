import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runRuntimeChild } from '../../server/runtime-child.mjs';

function channelFixture() {
    const channel = new EventEmitter(); channel.connected = true; channel.sent = [];
    channel.send = (message, callback) => { channel.sent.push(message); callback?.(); };
    channel.disconnect = () => { channel.connected = false; channel.emit('disconnect'); };
    return channel;
}
async function until(predicate) {
    for (let count = 0; count < 100; count++) { if (predicate()) return; await new Promise(resolve => setImmediate(resolve)); }
    assert.fail('Expected child lifecycle transition did not complete.');
}

test('child activates updater only after parent commit and exports sessions after drain', async () => {
    const channel = channelFixture(), events = [], sessions = [['cookie', { csrf: 'csrf', expires: Date.now() + 100_000 }]];
    let options, exitCode;
    runRuntimeChild({ channel, exit: code => { exitCode = code; }, loadRuntime: async () => ({ startKairo: async config => {
        options = config;
        return { origin: 'local', streamOrigin: 'stream', startDatasetUpdates: () => events.push('updates'), close: async () => events.push('drained'), exportSessions: () => { events.push('sessions'); return sessions; } };
    } }) });
    channel.emit('message', { type: 'start', initialSessions: sessions, options: { noSync: true }, datasetRecovery: { failedBuild: 9 } });
    await until(() => channel.sent.some(message => message.type === 'ready'));
    assert.deepEqual(events, []); assert.equal(options.deferDatasetStart, true); assert.equal(options.noSync, true);
    assert.deepEqual(options.initialSessions, sessions); assert.equal(options.datasetRecovery.failedBuild, 9);
    channel.emit('message', { type: 'activated' }); channel.emit('message', { type: 'activated' });
    options.onDatasetsReady();
    assert.deepEqual(channel.sent.at(-1), { type: 'dataset-ready' });
    channel.emit('message', { type: 'stop', reason: 'update' });
    await until(() => exitCode !== undefined);
    assert.deepEqual(events, ['updates', 'drained', 'sessions']);
    assert.deepEqual(channel.sent.at(-1), { type: 'stopped', sessions }); assert.equal(exitCode, 0);
});

test('child restores update UI on cancellation and shuts down if parent disappears', async () => {
    const channel = channelFixture(); let cancelled, closed = false, exitCode;
    runRuntimeChild({ channel, exit: code => { exitCode = code; }, loadRuntime: async () => ({ startKairo: async () => ({
        origin: 'local', streamOrigin: 'stream', cancelDatasetRestart: error => { cancelled = error.message; }, close: async () => { closed = true; },
    }) }) });
    channel.emit('message', { type: 'start' });
    await until(() => channel.sent.some(message => message.type === 'ready'));
    channel.emit('message', { type: 'restart-cancelled', error: 'Retry later' });
    assert.equal(cancelled, 'Retry later');
    channel.disconnect();
    await until(() => exitCode !== undefined);
    assert.equal(closed, true); assert.equal(exitCode, 0);
});

test('a stuck accepted-work drain reaches the child deadline without a successful handoff', async t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const channel = channelFixture(); let closeStarted = false, exported = false, exitCode;
    runRuntimeChild({channel, shutdownTimeout: 30, exit: code => { exitCode = code; }, loadRuntime: async () => ({startKairo: async () => ({
        origin: 'local', streamOrigin: 'stream',
        close: () => { closeStarted = true; return new Promise(() => {}); },
        exportSessions: () => { exported = true; return []; },
    })})});
    channel.emit('message', {type: 'start'});
    await until(() => channel.sent.some(message => message.type === 'ready'));
    channel.emit('message', {type: 'stop', reason: 'update'});
    await until(() => closeStarted);
    t.mock.timers.tick(30);
    assert.equal(exitCode, 1); assert.equal(exported, false);
    assert.equal(channel.sent.some(message => message.type === 'stopped'), false);
});

function gate() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; }

test('stop during startup waits for the accepted runtime and its cleanup before acknowledging shutdown', async () => {
    const channel = channelFixture(), startup = gate(), cleanup = gate(), events = [];
    let entered = false, exitCode;
    runRuntimeChild({channel, exit: code => { events.push('exit'); exitCode = code; }, loadRuntime: async () => ({startKairo: async () => { entered = true; return startup.promise; }})});
    channel.emit('message', {type: 'start'});
    await until(() => entered);
    channel.emit('message', {type: 'stop', reason: 'update'});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(exitCode, undefined, 'startup may already own listeners, persisted work and clients');
    assert.equal(channel.sent.some(message => message.type === 'stopped'), false);
    startup.resolve({origin: 'local', streamOrigin: 'stream', close: async () => { events.push('close'); await cleanup.promise; }, exportSessions: () => { events.push('sessions'); return [['cookie', {csrf: 'token'}]]; }});
    await until(() => events.includes('close'));
    assert.equal(exitCode, undefined, 'cleanup must finish before the successful handoff');
    cleanup.resolve(); await until(() => exitCode !== undefined);
    assert.deepEqual(events, ['close', 'sessions', 'exit']);
    assert.equal(channel.sent.some(message => message.type === 'ready'), false);
    assert.deepEqual(channel.sent.at(-1), {type: 'stopped', sessions: [['cookie', {csrf: 'token'}]]});
    assert.equal(exitCode, 0);
});

test('stop during a failing startup acknowledges only after startup has unwound', async () => {
    const channel = channelFixture(), startup = gate(); let entered = false, exitCode;
    runRuntimeChild({channel, exit: code => { exitCode = code; }, loadRuntime: async () => ({startKairo: async () => { entered = true; return startup.promise; }})});
    channel.emit('message', {type: 'start'}); await until(() => entered);
    channel.emit('message', {type: 'stop'}); await new Promise(resolve => setImmediate(resolve));
    assert.equal(exitCode, undefined);
    startup.reject(new Error('Startup cleanup completed'));
    await until(() => exitCode !== undefined);
    assert.equal(exitCode, 0);
    assert.deepEqual(channel.sent, [{type: 'stopped', sessions: []}]);
});

test('stuck startup retains the bounded shutdown deadline without a successful handoff', async t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const channel = channelFixture(); let entered = false, exitCode;
    runRuntimeChild({channel, shutdownTimeout: 30, exit: code => { exitCode = code; }, loadRuntime: async () => ({startKairo: async () => { entered = true; return new Promise(() => {}); }})});
    channel.emit('message', {type: 'start'}); await until(() => entered);
    channel.emit('message', {type: 'stop'}); t.mock.timers.tick(30);
    assert.equal(exitCode, 1);
    assert.equal(channel.sent.some(message => message.type === 'stopped'), false);
});

test('cleanup failure after stopped startup cannot claim a successful saved handoff', async () => {
    const channel = channelFixture(), startup = gate(); let entered = false, exitCode, closes = 0;
    runRuntimeChild({channel, exit: code => { exitCode = code; }, loadRuntime: async () => ({startKairo: async () => { entered = true; return startup.promise; }})});
    channel.emit('message', {type: 'start'}); await until(() => entered);
    channel.emit('message', {type: 'stop'});
    startup.resolve({close: async () => { closes++; throw new Error('Could not finish saving'); }});
    await until(() => exitCode !== undefined);
    assert.equal(closes, 1); assert.equal(exitCode, 1);
    assert.deepEqual(channel.sent, [{type: 'shutdown-error', error: 'Could not finish saving'}]);
});

test('failed startup rollback remains a shutdown failure instead of a successful handoff', async () => {
    const channel = channelFixture(), startup = gate(); let entered = false, exitCode;
    runRuntimeChild({channel, exit: code => { exitCode = code; }, loadRuntime: async () => ({startKairo: async () => { entered = true; return startup.promise; }})});
    channel.emit('message', {type: 'start'}); await until(() => entered);
    channel.emit('message', {type: 'stop'});
    startup.reject(Object.assign(new Error('Port is occupied'), {cleanupErrors: [new Error('Accepted work could not finish saving')]}));
    await until(() => exitCode !== undefined);
    assert.equal(exitCode, 1);
    assert.equal(channel.sent.some(message => message.type === 'stopped'), false);
    assert.equal(channel.sent.at(-1)?.type, 'shutdown-error');
    assert.match(channel.sent.at(-1)?.error, /could not finish saving/);
    assert.match(channel.sent.at(-1)?.error, /Port is occupied/);
});
