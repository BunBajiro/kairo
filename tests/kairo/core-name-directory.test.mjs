import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {EventEmitter} from 'node:events';
import {setImmediate as turn} from 'node:timers/promises';
import {openStore} from '../../server/store.mjs';
import {createCore} from '../../server/core.mjs';
import {catalog, allScopes} from '../../server/modules/catalog.mjs';
import {startKairo} from '../../server/index.mjs';
import {createNameDirectoryState} from '../../components/kairo/name-directory-state.mjs';

function consumer({blockFirst = false, fail = false} = {}) {
    const client = new EventEmitter(); client.frames = [];
    client.write = chunk => { if (fail) throw new Error('Consumer disconnected'); client.frames.push(chunk); if (blockFirst) { blockFirst = false; return false; } return true; };
    client.end = () => { client.writableEnded = true; client.emit('finish'); };
    client.destroy = () => { client.destroyed = true; client.emit('close'); };
    client.packets = () => Buffer.concat(client.frames).toString().split('\n\n').filter(frame => frame.startsWith('event:')).map(frame => ({type: frame.split('\n')[0].slice(7), data: JSON.parse(frame.slice(frame.indexOf('\ndata: ') + 7))}));
    client.clear = () => { client.frames = []; };
    return client;
}
async function fixture(t, options = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-name-directory-')), store = openStore(directory);
    store.set('names', {4200000: 'Original'});
    for (const module of catalog) store.set('module:' + module.id, module.id === 'wallet');
    const auth = {characters: () => [42, 43].map(id => ({id, scopes: allScopes}))};
    const sample = data => ({data, headers: {}, updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString()});
    const esi = {health: () => ({}), names: async () => ({}), request: async path => { await options.wait?.(); return sample(path.endsWith('/wallet') ? 123 : []); }}; esi.paged = esi.request;
    let core = await createCore(store, auth, esi, directory, {noSync: true}); core.quiesce();
    t.after(async () => { options.release?.(); await core.close(); store.close(); await rm(directory, {recursive: true, force: true}); });
    return {get core() { return core; }, store, async restart() { await core.close(); core = await createCore(store, auth, esi, directory, {noSync: true}); core.quiesce(); }};
}

test('each UI bootstraps globally; unchanged snapshots omit names and changed names reach both pilot audiences', async t => {
    const {core} = await fixture(t), clients = [consumer(), consumer()];
    const receivers = clients.map(() => { const owner = createNameDirectoryState(); owner.connect(); return owner; });
    for (const [index, client] of clients.entries()) {
        assert.equal(core.connectUI(client), true); const initial = client.packets(); assert.equal(initial.length, 1); assert.equal(initial[0].type, 'names');
        receivers[index].fromEvent(initial[0].data); client.clear();
    }
    await core.requestSync(42);
    for (const client of clients) {
        const packets = client.packets(); assert.equal(packets.filter(packet => packet.type === 'names').length, 0);
        const snapshots = packets.filter(packet => packet.type === 'snapshot'); assert.equal(snapshots.length, 4);
        assert.ok(snapshots.every(packet => !('names' in packet.data) && packet.data.namesRevision === core.namesSnapshot().namesRevision)); client.clear();
    }
    core.rememberNames({4200000: 'Renamed', 4300000: 'Added for other pilot'});
    await core.requestSync(43);
    for (const [index, client] of clients.entries()) {
        const packets = client.packets(); assert.equal(packets[0].type, 'names'); assert.equal(packets.filter(packet => packet.type === 'names').length, 1);
        const directory = receivers[index].fromEvent(packets[0].data); assert.deepEqual(directory, {4200000: 'Renamed', 4300000: 'Added for other pilot'});
        // Both dashboards process this global event, including the one ignoring pilot43 snapshots.
        assert.ok(packets.filter(packet => packet.type === 'snapshot').every(packet => packet.data.characterId === 43));
    }
});

test('batching waits for a publication boundary and a new bootstrap cannot mark older clients current', async t => {
    const {core} = await fixture(t), older = consumer(); core.connectUI(older); older.clear();
    const originalRevision = core.namesSnapshot().namesRevision;
    core.rememberNames({4200000: 'Original', 0: 'Invalid', 2: '', 3: null}); assert.equal(core.namesSnapshot().namesRevision, originalRevision);
    for (let id = 1; id <= 8; id++) core.rememberNames({[4300000 + id]: 'Resolved ' + id});
    assert.equal(older.packets().length, 0, 'Individual name resolution does not broadcast the full map');
    const newer = consumer(); core.connectUI(newer); assert.equal(newer.packets().length, 1); newer.clear();
    await core.requestSync(42);
    assert.equal(older.packets().filter(packet => packet.type === 'names').length, 1);
    assert.equal(newer.packets().filter(packet => packet.type === 'names').length, 0);
    assert.deepEqual(older.packets()[0].data, core.namesSnapshot());
});

test('zero clients encode no directories and reconnect bootstraps all changes since disconnect', async t => {
    const {core} = await fixture(t); let encodes = 0;
    const stringify = JSON.stringify; JSON.stringify = function(value, ...rest) { if (value?.names && value?.namesRevision) encodes++; return stringify(value, ...rest); };
    try { core.rememberNames({4300000: 'Offline change'}); await core.requestSync(42); assert.equal(encodes, 0); }
    finally { JSON.stringify = stringify; }
    const first = consumer(); core.connectUI(first); assert.deepEqual(first.packets()[0].data.names, core.names());
    first.emit('close'); assert.equal(core.uiClients.size, 0); core.rememberNames({4300000: 'Later change'}); await core.requestSync(43);
    const reconnected = consumer(); core.connectUI(reconnected); assert.deepEqual(reconnected.packets()[0].data, core.namesSnapshot());
});

test('names and snapshots retain SSE order through backpressure; failed clients cannot suppress healthy delivery', async t => {
    const {core} = await fixture(t), blocked = consumer({blockFirst: true}), failed = consumer({fail: true}), healthy = consumer();
    core.connectUI(blocked); assert.equal(core.connectUI(failed), false); assert.equal(core.uiClients.has(failed), false); core.connectUI(healthy); healthy.clear();
    core.rememberNames({4200000: 'Changed behind queued bootstrap'}); await core.requestSync(42);
    assert.equal(blocked.packets().length, 1); blocked.emit('drain');
    const packets = blocked.packets(); assert.deepEqual(packets.slice(0, 2).map(packet => packet.type), ['names', 'names']);
    assert.equal(packets[1].data.names[4200000], 'Changed behind queued bootstrap'); assert.equal(packets.filter(packet => packet.type === 'snapshot').length, 4);
    assert.equal(healthy.packets()[0].type, 'names'); assert.equal(core.uiClients.size, 2);
});

test('Core close drains accepted snapshot publication with its directory and rejects a new UI connection', async t => {
    const gate = Promise.withResolvers(); let entered = false;
    const {core} = await fixture(t, {wait: () => { entered = true; return gate.promise; }, release: () => gate.resolve()});
    const client = consumer(); core.connectUI(client); client.clear(); const work = core.sync(42);
    for (let count = 0; count < 10 && !entered; count++) await turn(); assert.equal(entered, true);
    const closing = core.close(), late = consumer(); assert.equal(core.connectUI(late), false); assert.equal(late.writableEnded, true);
    core.rememberNames({4200000: 'Accepted during close'}); gate.resolve(); await Promise.all([work, closing]);
    const packets = client.packets(); assert.equal(packets[0].type, 'names'); assert.equal(packets[0].data.names[4200000], 'Accepted during close');
    assert.ok(packets.some(packet => packet.type === 'snapshot')); assert.equal(client.writableEnded, true); assert.equal(core.uiClients.size, 0);
});

test('real state and events HTTP routes expose the same authoritative process-qualified directory', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-http-names-'));
    const app = await startKairo({port: 19890, streamPort: 19891, dataDir: directory, noSync: true, fetcher: async () => assert.fail('No external request permitted')});
    const controller = new AbortController();
    t.after(async () => { controller.abort(); await app.close(); await rm(directory, {recursive: true, force: true}); });
    app.core.rememberNames({4200000: 'HTTP current name'});
    const page = await fetch(app.origin), cookie = page.headers.get('set-cookie').split(';')[0]; await page.text();
    const state = await (await fetch(app.origin + '/api/state?character=0', {headers: {cookie}})).json();
    assert.deepEqual(state.names, {4200000: 'HTTP current name'}); assert.match(state.namesRevision, /^[0-9a-f-]+:1$/);
    const events = await fetch(app.origin + '/api/events', {headers: {cookie}, signal: controller.signal}), reader = events.body.getReader();
    let body = '', named;
    while (!named) {
        const chunk = await reader.read(); assert.equal(chunk.done, false); body += Buffer.from(chunk.value).toString();
        const frame = body.split('\n\n').find(value => value.startsWith('event: names\n'));
        if (frame) named = JSON.parse(frame.slice(frame.indexOf('\ndata: ') + 7));
    }
    assert.deepEqual(named, {names: state.names, namesRevision: state.namesRevision}); await reader.cancel(); controller.abort();
});

test('a new Core epoch bootstraps an authoritative empty/reset directory even when its counter is lower', async t => {
    const f = await fixture(t), owner = createNameDirectoryState(); owner.connect();
    f.core.rememberNames({4300000: 'Before reset'}); const before = f.core.namesSnapshot(); owner.fromEvent(before);
    const oldRead = owner.capture(); await f.core.close(); f.store.set('names', {}); await f.restart();
    const after = f.core.namesSnapshot(); assert.notEqual(after.namesRevision.split(':')[0], before.namesRevision.split(':')[0]); assert.match(after.namesRevision, /:0$/); assert.deepEqual(after.names, {});
    const client = consumer(); f.core.connectUI(client); owner.connect();
    assert.deepEqual(owner.fromEvent(client.packets()[0].data), {}); assert.equal(owner.fromState(before, oldRead), null);
});
