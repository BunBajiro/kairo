import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createBus} from '../../server/bus.mjs';
import {createStream} from '../../server/stream.mjs';

test('late collector bindings cannot write to closed OBS streams during a dataset restart', () => {
    const stream = createStream({get: (_key, fallback) => fallback}, createBus());
    const response = new EventEmitter();
    let ended = false, writes = 0;
    response.write = () => {assert.equal(ended, false, 'A drained collector wrote after stream.end()'); writes++;};
    response.end = () => {ended = true;};
    stream.connect(response);
    const before = writes;
    stream.close();
    // The socket's asynchronous close event has deliberately not fired yet.
    stream.setBindings({});
    stream.setOPSEC({state: 'unknown', hidden: true});
    assert.equal(writes, before);
    assert.equal(stream.clients.size, 0);
});
