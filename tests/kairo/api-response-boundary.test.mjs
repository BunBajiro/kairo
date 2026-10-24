import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {api} from '../../components/kairo/model.ts';
import {createOBSControlRefresh} from '../../components/kairo/administrative-refresh.mjs';

// Exercise the actual browser transport and refresh owner over HTTP. Only the
// provider bytes vary; publication/error recovery remains production behavior.
async function fixture(t, respond) {
    const calls = [], server = createServer(async (request, response) => {
        const chunks = [];for await (const chunk of request) chunks.push(chunk);
        const call = {path: request.url, method: request.method, body: Buffer.concat(chunks).toString()};
        calls.push(call);const result = respond(call, calls.length);
        response.writeHead(result.status || 200, {'Content-Type': 'application/json'});response.end(result.raw ?? JSON.stringify(result.body));
    });
    server.listen(0, '127.0.0.1');await once(server, 'listening');
    const nativeFetch = globalThis.fetch, origin = 'http://127.0.0.1:' + server.address().port;
    t.mock.method(globalThis, 'fetch', (path, options) => nativeFetch(new URL(path, origin), options));
    t.after(() => new Promise(resolve => {server.close(resolve);server.closeAllConnections();}));
    return calls;
}
const timers = {setTimeout() {return 1;}, clearTimeout() {}};
const initial = {config: {port: 4455, enabled: false, rules: {}}, status: {connected: false}};

test('malformed initial OBS JSON reports a failure and retries full config rather than switching to status-only reads', async t => {
    const calls = await fixture(t, (_, count) => count === 1 ? {raw: '{"config":'} : {body: initial});
    const configs = [], statuses = [], errors = [];
    const owner = createOBSControlRefresh({read: () => api('/obs'), readStatus: () => api('/obs/status'),
        publishConfig: value => configs.push(value), publishStatus: value => statuses.push(value), onError: error => errors.push(error.message), timers});
    t.after(() => owner.close());
    await owner.request();await owner.request();
    t.diagnostic(JSON.stringify({calls, configs, statuses, errors}));
    assert.deepEqual(calls.map(call => call.path), ['/api/obs', '/api/obs']);
    assert.deepEqual(configs, [initial.config]);assert.deepEqual(statuses, [initial.status]);
    assert.deepEqual(errors, ['Kairo could not read the response.']);
});

test('malformed current OBS status keeps the last usable state and recovers on the next explicit request', async t => {
    const recovered = {connected: false, reconnecting: false};
    const calls = await fixture(t, (_, count) => count === 1 ? {body: initial} : count === 2 ? {raw: '<html>temporary failure</html>'} : {body: recovered});
    const configs = [], statuses = [], errors = [];
    const owner = createOBSControlRefresh({read: () => api('/obs'), readStatus: () => api('/obs/status'),
        publishConfig: value => configs.push(value), publishStatus: value => statuses.push(value), onError: error => errors.push(error.message), timers});
    t.after(() => owner.close());
    await owner.request();owner.edited();await owner.request();
    const afterFailure = {configs: [...configs], statuses: [...statuses], errors: [...errors]};
    await owner.request();
    t.diagnostic(JSON.stringify({calls, afterFailure, statuses}));
    assert.deepEqual(afterFailure, {configs: [initial.config], statuses: [initial.status], errors: ['Kairo could not read the response.']});
    assert.deepEqual(configs, [initial.config]);assert.deepEqual(statuses, [initial.status, recovered]);
    assert.deepEqual(calls.map(call => call.path), ['/api/obs', '/api/obs/status', '/api/obs/status']);
});

test('malformed successful OBS save stays unacknowledged, keeps the draft owner and never resubmits automatically', async t => {
    let saved = initial.config;
    const next = {...initial.config, port: 4466};
    const calls = await fixture(t, call => {
        if (call.method === 'PUT') {saved = JSON.parse(call.body);return {raw: '{"config":'};}
        return {body: {config: saved, status: initial.status}};
    });
    const configs = [], statuses = [], errors = [];
    const owner = createOBSControlRefresh({read: () => api('/obs'), publishConfig: value => configs.push(value),
        publishStatus: value => statuses.push(value), onError: error => errors.push(error.message), timers});
    t.after(() => owner.close());
    await owner.request();owner.edited();const generation = owner.snapshot();let acknowledged = false;
    try {const response = await api('/obs', 'PUT', next, 'test-csrf');acknowledged = owner.saved(response, generation);} catch (error) {errors.push(error.message);}
    // A subsequent healthy read must not consume a draft whose save was never
    // acknowledged. The server may already have accepted this exact command.
    await owner.request();
    t.diagnostic(JSON.stringify({saved, acknowledged, configs, statuses, errors, puts: calls.filter(call => call.method === 'PUT').length}));
    assert.deepEqual(saved, next);assert.equal(acknowledged, false);
    assert.deepEqual(configs, [initial.config]);assert.deepEqual(errors, ['Kairo could not read the response.']);
    assert.equal(calls.filter(call => call.method === 'PUT').length, 1);
});

test('valid JSON values and explicit HTTP errors retain the transport contract without extra reads', async t => {
    const values = [null, false, 0, [], {ok: true}];
    const calls = await fixture(t, (_, count) => count <= values.length ? {body: values[count - 1]} : {status: 503, body: {error: 'Temporarily unavailable'}});
    for (const expected of values) assert.deepEqual(await api('/value'), expected);
    await assert.rejects(api('/value'), /Temporarily unavailable/);assert.equal(calls.length, 6);
});
