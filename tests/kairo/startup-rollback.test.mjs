import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setImmediate as turn} from 'node:timers/promises';
import {openStore} from '../../server/store.mjs';

async function freePort() {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return port;
}
// Replace only direct imports of one uniquely addressed index.mjs instance.
// The real HTTP listeners remain active so staged bind/unwind ordering is tested;
// per-test factories and the loader hook are removed by the registered cleanup.
async function startupFixture(t, failAt, {cleanupGate, cleanupFailure} = {}) {
    const id = randomUUID(), key = '__kairo_startup_' + id, calls = [], servers = [];
    const fault = Object.assign(new Error('Injected ' + failAt), {code: failAt.startsWith('listen') ? 'EADDRINUSE' : 'EFAULT'});
    const stage = name => { calls.push(name); if (name === failAt) throw fault; };
    const close = name => async () => {
        calls.push(name + '.close');
        if (name === 'core') { await cleanupGate; if (cleanupFailure) throw cleanupFailure; }
    };
    const factories = {
        openStore: () => { stage('store'); return {close: close('store')}; },
        openVault: () => { stage('vault'); return {}; },
        createAuth: () => { stage('auth'); return {characters: () => []}; },
        createESI: () => { stage('esi'); return {close: close('esi')}; },
        createCore: async () => { stage('core'); return {uiClients: new Set(), close: close('core'), quiesce: () => calls.push('core.quiesce')}; },
        createDatasetService: () => {
            stage('datasets');
            return {ready: Promise.resolve().then(() => stage('ready')),
                status: () => { stage('status'); return {datasets: []}; },
                start: () => stage('activation'), close: close('datasets')};
        },
        createServer: (...args) => {
            const server = createServer(...args), name = servers.length ? 'broadcast' : 'dashboard'; servers.push(server);
            const listen = server.listen.bind(server), stop = server.close.bind(server);
            server.listen = (...args) => {
                calls.push('listen-' + name);
                if (failAt === 'listen-' + name) { queueMicrotask(() => server.emit('error', fault)); return server; }
                return listen(...args);
            };
            server.close = (...args) => { calls.push(name + '.close'); return stop(...args); };
            return server;
        },
    };
    globalThis[key] = factories;
    const indexUrl = new URL('../../server/index.mjs', import.meta.url); indexUrl.search = 'fault=' + id;
    const names = new Map([['./store.mjs', 'openStore'], ['./vault.mjs', 'openVault'], ['./auth.mjs', 'createAuth'],
        ['./esi.mjs', 'createESI'], ['./core.mjs', 'createCore'], ['./datasets.mjs', 'createDatasetService'], ['node:http', 'createServer']]);
    const prefix = 'kairo-construction-test:' + id + '/';
    const hook = registerHooks({
        resolve(specifier, context, next) {
            if (context.parentURL === indexUrl.href && names.has(specifier)) return {url: prefix + names.get(specifier), shortCircuit: true};
            return next(specifier, context);
        },
        load(url, context, next) {
            if (url.startsWith(prefix)) {
                const name = url.slice(prefix.length);
                return {format: 'module', source: `export const ${name}=(...args)=>globalThis[${JSON.stringify(key)}].${name}(...args);`, shortCircuit: true};
            }
            return next(url, context);
        },
    });
    t.after(async () => {
        hook.deregister(); delete globalThis[key];
        for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(() => resolve())); }
    });
    const {startKairo} = await import(indexUrl.href);
    const port = await freePort(); let streamPort = await freePort(); while (streamPort === port) streamPort = await freePort();
    return {fault, calls, servers, start: () => startKairo({port, streamPort, noSync: true})};
}

for (const failed of ['store', 'vault', 'auth', 'esi', 'core', 'datasets', 'ready', 'status', 'listen-dashboard', 'listen-broadcast', 'activation']) {
    test('startup rolls back acquired owners after ' + failed + ' fails', async t => {
        const h = await startupFixture(t, failed);
        await assert.rejects(h.start(), error => error === h.fault);
        const acquired = ['store', 'esi', 'core', 'datasets'].filter(name => h.calls.includes(name) && name !== failed);
        for (const name of acquired) assert.equal(h.calls.filter(call => call === name + '.close').length, 1, name + ' closes exactly once');
        for (const name of ['store', 'esi', 'core', 'datasets'].filter(name => !acquired.includes(name)))
            assert.equal(h.calls.includes(name + '.close'), false, name + ' was not acquired');
        if (acquired.includes('store')) assert.equal(h.calls.at(-1), 'store.close');
        assert.ok(h.servers.every(server => !server.listening), 'Failed startup releases both listeners.');
    });
}

test('startup waits for asynchronous Core cleanup and retains secondary failures while closing ESI and Store', async t => {
    const gate = Promise.withResolvers(), cleanupFailure = new Error('Core cleanup failed');
    const h = await startupFixture(t, 'ready', {cleanupGate: gate.promise, cleanupFailure});
    let settled = false; const starting = h.start().finally(() => { settled = true; });
    const rejected = assert.rejects(starting, error => error === h.fault);
    const deadline = Date.now() + 3000;
    while (!h.calls.includes('core.close')) { assert.ok(Date.now() < deadline); await turn(); }
    assert.equal(settled, false); assert.equal(h.calls.includes('esi.close'), false); assert.equal(h.calls.includes('store.close'), false);
    gate.resolve(); await rejected;
    assert.deepEqual(h.fault.cleanupErrors, [cleanupFailure]);
    assert.equal(Object.keys(h.fault).includes('cleanupErrors'), false);
    assert.ok(h.calls.indexOf('esi.close') > h.calls.indexOf('core.close')); assert.equal(h.calls.at(-1), 'store.close');
});

for (const phase of ['PRAGMA journal_mode', 'ALTER TABLE sessions ADD COLUMN start_context', 'DELETE FROM market_orders', 'idx_events_character_type_at', 'ALTER TABLE visits ADD COLUMN session_id']) {
    test('Store closes its database and releases transaction locks after ' + phase + ' fails', async t => {
        const directory = await mkdtemp(join(tmpdir(), 'kairo-store-rollback-')), fault = new Error('Migration failed');
        const exec = DatabaseSync.prototype.exec, close = DatabaseSync.prototype.close; let closes = 0;
        t.after(() => rm(directory, {recursive: true, force: true}));
        t.mock.method(DatabaseSync.prototype, 'exec', function(sql) { if (sql.includes(phase)) throw fault; return exec.call(this, sql); });
        t.mock.method(DatabaseSync.prototype, 'close', function() { closes++; return close.call(this); });
        assert.throws(() => openStore(directory), error => error === fault); assert.equal(closes, 1);
        const check = new DatabaseSync(join(directory, 'kairo.sqlite'));
        try { exec.call(check, 'BEGIN IMMEDIATE; ROLLBACK'); } finally { close.call(check); }
    });
}
