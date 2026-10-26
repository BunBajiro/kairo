import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setImmediate as turn} from 'node:timers/promises';
import {openStore} from '../../server/store.mjs';
import {createCore} from '../../server/core.mjs';
import {createUniverse} from '../../server/universe.mjs';
import {createOBS, defaultOBS} from '../../server/obs.mjs';

const atlas = {metadata: {}, regions: [], constellations: [], systems: [
    {system_id: 30000001, name: 'Alpha', space: 'known', security: -.1, x: 0, y: 0, z: 0},
], gates: []};
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return {promise, resolve};
}
async function until(predicate) {
    const deadline = Date.now() + 3000;
    while (!predicate()) {
        assert.ok(Date.now() < deadline, 'The expected construction/cleanup boundary was not reached.');
        await turn();
    }
}
// Count real recurring timers and injected expiry handles across construction
// failure. The caller retains Store ownership; failed Core cleanup must drain its
// work and release its own resources without closing that caller-owned database.
async function fixture(t) {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-construction-')), modules = join(directory, 'modules');
    await mkdir(modules);
    const store = openStore(directory), expiry = new Set(), intervals = new Set();
    const setInterval = globalThis.setInterval, clearInterval = globalThis.clearInterval;
    t.mock.method(globalThis, 'setInterval', (...args) => {
        const timer = setInterval(...args); intervals.add(timer); return timer;
    });
    t.mock.method(globalThis, 'clearInterval', timer => { intervals.delete(timer); clearInterval(timer); });
    const setExpiry = () => { const timer = {unref() {}}; expiry.add(timer); return timer; };
    const clearExpiry = timer => { expiry.delete(timer); };
    const auth = {characters: () => []}, esi = {health: () => ({})};
    const universe = {staticData: atlas, feeds: {setExpiryTimer: setExpiry, clearExpiryTimer: clearExpiry},
        lifecycle: {setTimeout: setExpiry, clearTimeout: clearExpiry}};
    store.set('universe:feeds:thera', {data: [{id: 'cached-report', expires_at: new Date(Date.now() + 3600000).toISOString()}]});
    t.after(async () => {
        for (const timer of intervals) clearInterval(timer);
        store.close(); await rm(directory, {recursive: true, force: true});
    });
    return {store, modules, auth, esi, universe, expiry, intervals,
        start: () => createCore(store, auth, esi, modules, {noSync: true, universe})};
}
function assertReleased(h) {
    assert.equal(h.expiry.size, 0, 'No Universe expiry timer is left ownerless.');
    assert.equal(h.intervals.size, 0, 'Core and OBS intervals were cleared.');
    h.store.set('caller-still-owns-store', true);
    assert.equal(h.store.get('caller-still-owns-store'), true);
}

test('Core rolls back Universe expiry when the awaited Registry import fails', async t => {
    const h = await fixture(t);
    // Malformed source is deliberate: import failure must unwind prior owners.
    await writeFile(join(h.modules, 'broken.mjs'), 'export default { invalid syntax');
    await assert.rejects(h.start(), SyntaxError);
    assertReleased(h);
});

test('failed Registry activation drains accepted asynchronous events and closes the bus', async t => {
    const h = await fixture(t), gate = deferred(), fault = new Error('module activation failed');
    let bus, settled = false;
    h.esi.capture = context => { bus = context.bus; assert.ok(h.expiry.size > 0); };
    h.esi.gate = gate.promise; h.esi.fault = fault;
    await writeFile(join(h.modules, 'fixture.mjs'), `export default {id:'fixture',register(ctx){
        ctx.esi.capture(ctx);
        ctx.on('accepted',async()=>{await ctx.esi.gate;ctx.store.set('accepted-event-finished',true);});
        ctx.bus.emit({type:'accepted'});throw ctx.esi.fault;
    }};`);
    const pending = h.start().finally(() => { settled = true; });
    const rejected = assert.rejects(pending, error => error === fault);
    t.after(() => gate.resolve());
    await until(() => bus); await turn();
    assert.equal(settled, false);
    gate.resolve(); await rejected;
    assert.equal(h.store.get('accepted-event-finished'), true);
    assert.equal(bus.health().pending, 0);
    assert.throws(() => bus.emit({type: 'after-failure'}), /closed/);
    assertReleased(h);
});

test('Registry activation keeps its original error when an earlier module cleanup also fails', async t => {
    const h = await fixture(t), fault = Object.assign(new Error('activation failed'), {code: 'EACTIVATE'});
    let bus;
    h.esi.capture = context => { bus = context.bus; }; h.esi.fault = fault;
    for (const id of ['first', 'second']) await writeFile(join(h.modules, id + '.mjs'), `export default {id:'${id}',register(ctx){
        if(ctx.esi.registered)throw ctx.esi.fault;ctx.esi.registered=true;ctx.esi.capture(ctx);
        return async()=>{ctx.store.set('owner-cleaned',true);throw new Error('owner cleanup failed');};
    }};`);
    await assert.rejects(h.start(), error => error === fault && error.code === 'EACTIVATE');
    assert.equal(h.store.get('owner-cleaned'), true);
    assert.equal(fault.cleanupErrors.length, 1);
    assert.match(fault.cleanupErrors[0].errors[0].message, /owner cleanup failed/);
    assert.throws(() => bus.emit({type: 'after-failure'}), /closed/);
    assertReleased(h);
});

test('a later constructor failure closes Registry and the already-created OBS interval', async t => {
    const h = await fixture(t), fault = Object.assign(new Error('market initialization failed'), {code: 'EIO'});
    let bus;
    h.esi.capture = context => { bus = context.bus; };
    await writeFile(join(h.modules, 'fixture.mjs'), `export default {id:'fixture',register(ctx){
        ctx.esi.capture(ctx);return()=>ctx.store.set('module-stopped',true);
    }};`);
    const get = h.store.get;
    t.mock.method(h.store, 'get', (key, fallback) => {
        if (key === 'market:initialized') { assert.equal(h.intervals.size, 1); throw fault; }
        return get(key, fallback);
    });
    await assert.rejects(h.start(), error => error === fault && error.code === 'EIO');
    assert.equal(h.store.get('module-stopped'), true);
    assert.throws(() => bus.emit({type: 'after-failure'}), /closed/);
    assertReleased(h);
});

test('initial projection rollback awaits module cleanup and preserves the primary error if cleanup fails', async t => {
    const h = await fixture(t), gate = deferred(), fault = Object.assign(new Error('initial projection failed'), {code: 'EIO'});
    let bus, cleanupStarted = false, settled = false;
    h.esi.capture = context => { bus = context.bus; }; h.esi.cleanupStarted = () => { cleanupStarted = true; }; h.esi.gate = gate.promise;
    await writeFile(join(h.modules, 'fixture.mjs'), `export default {id:'fixture',register(ctx){
        ctx.esi.capture(ctx);return async()=>{ctx.esi.cleanupStarted();await ctx.esi.gate;
            ctx.store.set('module-cleanup-finished',true);throw new Error('cleanup also failed');};
    }};`);
    const get = h.store.get;
    t.mock.method(h.store, 'get', (key, fallback) => {
        if (key === 'opsec') { assert.equal(h.intervals.size, 3); throw fault; }
        return get(key, fallback);
    });
    const pending = h.start().finally(() => { settled = true; });
    const rejected = assert.rejects(pending, error => error === fault && error.code === 'EIO');
    t.after(() => gate.resolve()); await until(() => cleanupStarted);
    assert.equal(settled, false); assert.equal(h.expiry.size, 0);
    gate.resolve(); await rejected;
    assert.equal(h.store.get('module-cleanup-finished'), true);
    assert.equal(fault.cleanupErrors.length, 1);
    assert.match(fault.cleanupErrors[0].errors[0].errors[0].message, /cleanup also failed/);
    assert.equal(Object.keys(fault).includes('cleanupErrors'), false);
    assert.throws(() => bus.emit({type: 'after-failure'}), /closed/);
    assertReleased(h);
});

async function enabledOBS(h, Socket, closeTimeout) {
    h.store.set('obs', {...defaultOBS(), enabled: true}); h.store.set('obs.space-categories-v3', true);
    return createCore(h.store, h.auth, h.esi, h.modules, {noSync: true, universe: h.universe,
        obs: {WebSocketClass: Socket, ...(closeTimeout ? {closeTimeout} : {})}});
}
test('Core startup rollback waits for an OBS client that was still connecting to close', async t => {
    const h = await fixture(t), fault = new Error('later startup failed');
    let socket, settled = false;
    class DeferredSocket extends EventTarget { constructor() { super(); socket = this; } close() { this.closeRequested = true; } }
    const get = h.store.get;
    t.mock.method(h.store, 'get', (key, fallback) => { if (key === 'market:initialized') throw fault; return get(key, fallback); });
    const pending = enabledOBS(h, DeferredSocket).finally(() => { settled = true; });
    const rejected = assert.rejects(pending, error => error === fault);
    t.after(() => socket?.dispatchEvent(new Event('close')));
    await until(() => socket?.closeRequested);
    assert.equal(settled, false, 'Rollback retains ownership of the closing socket.');
    socket.dispatchEvent(new Event('close')); await rejected;
    assertReleased(h);
});

test('a stalled OBS peer reports bounded cleanup failure without masking the startup fault', async t => {
    const h = await fixture(t), fault = new Error('later startup failed'); let socket, bus;
    class StalledSocket extends EventTarget { constructor() { super(); socket = this; } close() { this.closeRequested = true; } }
    h.esi.capture = context => { bus = context.bus; };
    await writeFile(join(h.modules, 'fixture.mjs'), `export default {id:'fixture',register(ctx){ctx.esi.capture(ctx);}};`);
    const get = h.store.get;
    t.mock.method(h.store, 'get', (key, fallback) => { if (key === 'market:initialized') throw fault; return get(key, fallback); });
    t.after(() => socket?.dispatchEvent(new Event('close')));
    await assert.rejects(enabledOBS(h, StalledSocket, 20), error => error === fault);
    assert.equal(socket.closeRequested, true);
    assert.equal(fault.cleanupErrors[0].errors[0].code, 'OBS_CLOSE_TIMEOUT');
    assert.throws(() => bus.emit({type: 'after-failure'}), /closed/);
    assertReleased(h);
});

test('OBS close owns synchronous callback failures and shares the same rejected cleanup promise', async t => {
    const h = await fixture(t), fault = new Error('status callback failed');
    const obs = createOBS(h.store, null, {onChange: () => { throw fault; }});
    const closing = obs.close(); assert.strictEqual(obs.close(), closing);
    await assert.rejects(closing, error => error === fault);
    assertReleased(h);
});

test('Universe does not arm cached feed expiry before later schema initialization succeeds', async t => {
    const h = await fixture(t), fault = new Error('universe schema failed'), exec = h.store.db.exec.bind(h.store.db);
    t.mock.method(h.store.db, 'exec', sql => { if (sql.includes('CREATE TABLE IF NOT EXISTS universe_records')) throw fault; return exec(sql); });
    assert.throws(() => createUniverse(h.store, h.auth, h.esi, h.universe), error => error === fault);
    assertReleased(h);
});

test('Universe releases an armed feed timer if its final local expiry lookup fails', async t => {
    const h = await fixture(t), fault = new Error('local expiry lookup failed'), prepare = h.store.db.prepare.bind(h.store.db);
    t.mock.method(h.store.db, 'prepare', sql => {
        const statement = prepare(sql);
        if (sql.startsWith('SELECT') && sql.includes('expires_at') && sql.includes('LIMIT 1')) statement.get = () => { assert.equal(h.expiry.size, 1); throw fault; };
        return statement;
    });
    assert.throws(() => createUniverse(h.store, h.auth, h.esi, h.universe), error => error === fault);
    assertReleased(h);
});

test('OBS reads its startup configuration before allocating its interval', async t => {
    const h = await fixture(t), fault = new Error('OBS configuration failed'), get = h.store.get; let reads = 0;
    t.mock.method(h.store, 'get', (key, fallback) => { if (key === 'obs' && ++reads === 2) throw fault; return get(key, fallback); });
    assert.throws(() => createOBS(h.store, null), error => error === fault);
    assertReleased(h);
});
