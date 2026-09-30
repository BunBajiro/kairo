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
