import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, get} from 'node:http';
import {EventEmitter, once} from 'node:events';
import {sseEvent, writeSSE, heartbeatSSE, closeSSE} from '../../server/sse.mjs';
import {createStream, defaultStream} from '../../server/stream.mjs';
import {createBus} from '../../server/bus.mjs';

async function connection(t) {
    let accept;
    const accepted = new Promise(resolve => { accept = resolve; });
    const server = createServer((_req, response) => {
        response.writeHead(200, {'Content-Type': 'text/event-stream'});
        response.flushHeaders(); accept(response);
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const request = get(`http://127.0.0.1:${server.address().port}`);
    const [incoming] = await once(request, 'response');
    // A disconnected test reader deliberately sees an incomplete HTTP body.
    incoming.on('error', () => {});
    const response = await accepted;
    t.after(async () => { request.destroy(); incoming.destroy(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    return {response, incoming};
}
function collect(incoming) {
    const chunks = [];
    incoming.on('data', chunk => chunks.push(chunk));
    return once(incoming, 'end').then(() => Buffer.concat(chunks));
}

test('real SSE delivers three large Unicode frames in order and drains accepted work before close', {timeout: 10000}, async t => {
    const {response, incoming} = await connection(t);
    const payload = 'asset 🛰️ '.repeat(300000);
    const frames = [42, 43, 42].map((characterId, sequence) => sseEvent('snapshot', {characterId, sequence, payload}));
    assert.ok(frames[0].length > 3_000_000);
    let blockedWrites = 0, largestWrite = 0;
    const write = response.write.bind(response);
    response.write = chunk => { largestWrite = Math.max(largestWrite, chunk.length); const result = write(chunk); if (!result) blockedWrites++; return result; };
    for (const frame of frames) assert.equal(writeSSE(response, frame), true);
    assert.equal(heartbeatSSE(response), true); // No keepalive is queued behind real traffic.
    const closing = closeSSE(response);
    assert.strictEqual(closeSSE(response), closing);
    assert.equal(writeSSE(response, sseEvent('late', {})), false);
    const output = await collect(incoming); await closing;
    assert.deepEqual(output, Buffer.concat(frames));
    assert.ok(blockedWrites > 0); assert.ok(largestWrite <= 64 * 1024);
    assert.equal(response.listenerCount('drain'), 0);
});

test('a single frame larger than the waiting budget is accepted without copying it into the socket queue', {timeout: 10000}, async t => {
    const {response, incoming} = await connection(t);
    const frame = sseEvent('snapshot', {payload: 'x'.repeat(2_000_000)});
    assert.equal(writeSSE(response, frame, {maxQueuedBytes: 1024, stallTimeoutMs: 1000}), true);
    const closing = closeSSE(response), received = await collect(incoming);
    await closing; assert.deepEqual(received, frame);
});

test('a stalled real reader is disconnected on drain timeout and releases its writer', {timeout: 10000}, async t => {
    const {response, incoming} = await connection(t);
    incoming.pause();
    const frame = sseEvent('snapshot', {payload: 'x'.repeat(32 * 1024 * 1024)});
    const closed = once(response, 'close');
    assert.equal(writeSSE(response, frame, {stallTimeoutMs: 80}), true);
    await closed;
    assert.equal(response.destroyed, true);
    assert.equal(response.listenerCount('drain'), 0);
    assert.equal(writeSSE(response, sseEvent('later', {})), false);
    await closeSSE(response);
});

for (const budget of ['bytes', 'frames']) test(`a real blocked reader cannot accumulate unbounded waiting ${budget}`, {timeout: 10000}, async t => {
    const {response, incoming} = await connection(t);
    incoming.pause();
    const closed = once(response, 'close');
    const options = {maxQueuedBytes: 1024, maxQueuedFrames: 2, stallTimeoutMs: 1000};
    assert.equal(writeSSE(response, sseEvent('snapshot', {payload: 'x'.repeat(32 * 1024 * 1024)}), options), true);
    if (budget === 'bytes') {
        assert.equal(writeSSE(response, Buffer.alloc(1024)), true);
        assert.equal(writeSSE(response, Buffer.alloc(1)), false);
    } else {
        assert.equal(writeSSE(response, sseEvent('changed', {sequence: 1})), true);
        assert.equal(writeSSE(response, sseEvent('changed', {sequence: 2})), true);
        assert.equal(writeSSE(response, sseEvent('changed', {sequence: 3})), false);
    }
    await closed; await closeSSE(response);
    assert.equal(response.destroyed, true); assert.equal(response.listenerCount('drain'), 0);
});

test('graceful close also has a deadline when its reader never resumes', {timeout: 10000}, async t => {
    const {response, incoming} = await connection(t);
    incoming.pause();
    writeSSE(response, sseEvent('snapshot', {payload: 'x'.repeat(32 * 1024 * 1024)}), {stallTimeoutMs: 80});
    const closing = closeSSE(response);
    await closing;
    assert.equal(response.destroyed, true); assert.equal(response.listenerCount('drain'), 0);
});

test('intermittent drain progress cannot extend the graceful close deadline', {timeout: 10000}, async t => {
    const response = new EventEmitter();
    let writes = 0;
    response.write = () => { writes++; return false; };
    response.end = () => response.emit('finish');
    response.destroy = () => { response.destroyed = true; response.emit('close'); };
    writeSSE(response, Buffer.alloc(16 * 1024 * 1024), {stallTimeoutMs: 40});
    const progress = setInterval(() => response.emit('drain'), 5);
    t.after(() => clearInterval(progress));
    await closeSSE(response);
    assert.equal(response.destroyed, true);
    assert.ok(writes > 1 && writes < 256);
    const before = writes;
    response.emit('drain');
    assert.equal(writes, before); assert.equal(response.listenerCount('drain'), 0);
});

test('OBS reconnect sends current protected state after an earlier transport disconnect', {timeout: 10000}, async t => {
    const settings = new Map();
    const store = {get: (key, fallback) => settings.get(key) ?? fallback, set: (key, value) => settings.set(key, value)};
    const stream = createStream(store, createBus());
    t.after(() => stream.close());
    const first = await connection(t);
    stream.connect(first.response);
    first.incoming.destroy();
    await once(first.response, 'close');
    assert.equal(stream.clients.size, 0);
    stream.save({...defaultStream(), position: 'bottom-left'});
    stream.setOPSEC({state: 'hostile', hidden: true, characterId: 43});
    const second = await connection(t);
    stream.connect(second.response);
    const received = collect(second.incoming), closing = stream.close();
    const text = (await received).toString('utf8'); await closing;
    const state = JSON.parse(text.split('data: ')[1]);
    assert.equal(state.position, 'bottom-left');
    assert.deepEqual(state.opsec, {state: 'hostile', hidden: true});
    assert.equal('characterId' in state.opsec, false);
    assert.equal(stream.clients.size, 0);
});

test('OBS protection closes a backlogged visible stream instead of queueing its mask behind old traffic', {timeout: 10000}, async t => {
    const stream = createStream({get: (_key, fallback) => fallback}, createBus());
    t.after(() => stream.close());
    stream.setOPSEC({state: 'blue', hidden: false});
    const {response, incoming} = await connection(t);
    incoming.pause();
    writeSSE(response, sseEvent('state', {payload: 'x'.repeat(32 * 1024 * 1024)}));
    stream.connect(response);
    const closed = once(response, 'close');
    stream.setOPSEC({state: 'hostile', hidden: true});
    assert.equal(response.destroyed, true);
    await closed;
    assert.equal(stream.clients.size, 0);
    assert.deepEqual(stream.state().opsec, {state: 'hostile', hidden: true});
});
