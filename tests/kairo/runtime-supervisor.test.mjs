import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { fork } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runKairoSupervisor } from '../../server/runtime-supervisor.mjs';
import { acquireRuntimeLock } from '../../server/runtime-lock.mjs';

const quiet = { log() {}, error() {} };
function fixture(t) {
    const dataDir = mkdtempSync(join(tmpdir(), 'kairo-supervisor-'));
    t.after(() => rmSync(dataDir, { recursive: true, force: true }));
    const children = [], events = [];
    let failBuild = null, hangBuild = null;
    function forkRuntime(file, args, options) {
        const child = new EventEmitter();
        child.options = options; child.received = []; child.connected = true;
        child.send = (message, callback) => {
            child.received.push(message); callback?.();
            queueMicrotask(() => {
                if (message.type === 'start') {
                    events.push('start:' + (options.env.KAIRO_SDE_DIRECTORY || 'bundled'));
                    if (options.env.KAIRO_SDE_DIRECTORY === hangBuild) return;
                    if (options.env.KAIRO_SDE_DIRECTORY === failBuild) { child.emit('message', { type: 'startup-error', error: 'bad dataset' }); return; }
                    child.emit('message', { type: 'ready', origin: 'http://127.0.0.1:4380', streamOrigin: 'http://127.0.0.1:4381' });
                } else if (message.type === 'stop') {
                    events.push('stop:' + message.reason);
                    child.emit('message', { type: 'stopped', sessions: child.sessions || [] });
                    child.connected = false; child.emit('exit', 0);
                } else if (message.type === 'activated') child.activated = true;
            });
        };
        child.kill = () => { if (!child.connected) return; child.connected = false; queueMicrotask(() => child.emit('exit', null, 'SIGKILL')); };
        children.push(child); return child;
    }
    return { dataDir, children, events, forkRuntime, logger: quiet, manageProcess: false, startupTimeout: 100, shutdownTimeout: 100, setFailure(value) { failBuild = value; }, setHang(value) { hangBuild = value; } };
}
async function until(predicate) {
    for (let count = 0; count < 100; count++) {
        if (predicate()) return;
        await new Promise(resolve => setImmediate(resolve));
    }
    assert.fail('Expected runtime transition did not complete.');
}

test('second supervisor is rejected before inspecting or cleaning datasets', async t => {
    const f = fixture(t); let prepares = 0;
    const storage = { prepare: async () => { prepares++; return null; } };
    const first = await runKairoSupervisor({ ...f, storage });
    try {
        await assert.rejects(runKairoSupervisor({ ...f, storage }), { code: 'EADDRINUSE' });
        assert.equal(prepares, 1);
    } finally { await first.close(); await first.done; }
});

test('update drains old core before new generation, preserves sessions privately and opens one browser', async t => {
    const f = fixture(t), tokens = [['cookie-secret', { csrf: 'csrf-secret', expires: Date.now() + 60_000 }]];
    let selection = null, browserCount = 0;
    const storage = { prepare: async () => selection, commit: async () => f.events.push('commit') };
    const app = await runKairoSupervisor({ ...f, storage, openBrowser: () => browserCount++ });
    try {
        f.children[0].sessions = tokens;
        selection = { directory: '/fixture/new-sde', manifest: { build: 2 }, pending: true };
        f.children[0].emit('message', { type: 'dataset-ready' });
        await until(() => f.children[1]?.activated);
        assert.deepEqual(f.children[1].received[0].initialSessions, tokens);
        assert.equal(f.children[1].options.env.KAIRO_SDE_DIRECTORY, selection.directory);
        assert.equal(f.children[1].options.env.KAIRO_DATA_DIR, f.dataDir);
        assert.deepEqual(f.events, ['start:bundled', 'stop:update', 'start:/fixture/new-sde', 'commit']);
        assert.equal(browserCount, 1);
        assert.throws(() => acquireRuntimeLock(f.dataDir), { code: 'EADDRINUSE' });
    } finally { await app.close(); await app.done; }
    acquireRuntimeLock(f.dataDir).close();
});

test('failed pending startup rolls back once and reports the failed build', async t => {
    const f = fixture(t); f.setFailure('/fixture/bad'); let rollbacks = 0;
    const app = await runKairoSupervisor({ ...f, storage: {
        prepare: async () => ({ directory: '/fixture/bad', manifest: { build: 9 }, pending: true }),
        commit: async () => assert.fail('A failed build cannot be committed.'),
        rollback: async () => { rollbacks++; return null; },
    } });
    try {
        assert.equal(rollbacks, 1); assert.equal(f.children.length, 2);
        assert.equal(f.children[1].received[0].datasetRecovery.failedBuild, 9);
        assert.equal(f.children[0].connected, false);
    } finally { await app.close(); await app.done; }
});

test('failed preparation cancels the update notice while current core keeps running', async t => {
    const f = fixture(t); let checks = 0;
    const app = await runKairoSupervisor({ ...f, storage: { prepare: async () => { if (checks++) throw new Error('candidate missing'); return null; } } });
    try {
        f.children[0].emit('message', { type: 'dataset-ready' });
        await until(() => f.children[0].received.some(message => message.type === 'restart-cancelled'));
        assert.equal(f.children.length, 1);
        assert.equal(f.children[0].connected, true);
        assert.match(f.children[0].received.at(-1).error, /candidate missing/);
    } finally { await app.close(); await app.done; }
});

test('startup timeout terminates bad generation before rollback and releases lease on close', async t => {
    const f = fixture(t); f.setHang('/fixture/hangs');
    const app = await runKairoSupervisor({ ...f, startupTimeout: 10, storage: {
        prepare: async () => ({ directory: '/fixture/hangs', manifest: { build: 10 }, pending: true }),
        rollback: async () => { assert.equal(f.children[0].connected, false); return null; },
    } });
    assert.equal(f.children.length, 2);
    await app.close(); await app.done;
    acquireRuntimeLock(f.dataDir).close();
});

test('unexpected active core exit fails clearly without a restart loop', async t => {
    const f = fixture(t);
    const app = await runKairoSupervisor({ ...f, storage: { prepare: async () => null } });
    f.children[0].connected = false; f.children[0].emit('exit', 3);
    await assert.rejects(app.done, /exit 3/);
    assert.equal(f.children.length, 1);
    acquireRuntimeLock(f.dataDir).close();
});

test('IPC failure after commit preserves the newly published generation', async t => {
    const f = fixture(t); let commits = 0, rollbacks = 0;
    await assert.rejects(runKairoSupervisor({ ...f,
        storage: {
            prepare: async () => ({ directory: '/fixture/new', manifest: { build: 2 }, pending: true }),
            commit: async () => { commits++; }, rollback: async () => { rollbacks++; return null; },
        },
        forkRuntime(...args) {
            const child = f.forkRuntime(...args), send = child.send;
            child.send = (message, callback) => { if (message.type === 'activated') throw new Error('IPC closed after commit'); return send(message, callback); };
            return child;
        },
    }), /IPC closed after commit/);
    assert.equal(commits, 1); assert.equal(rollbacks, 0);
    assert.equal(f.children[0].connected, false);
    acquireRuntimeLock(f.dataDir).close();
});

test('real core replacement keeps the browser cookie, CSRF token and saved settings', { timeout: 30_000 }, async t => {
    const f = fixture(t), children = [];
    async function freePort() {
        const server = createServer();
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        await new Promise(resolve => server.close(resolve));
        return port;
    }
    const port = await freePort(); let streamPort;
    do { streamPort = await freePort(); } while (streamPort === port);
    let selection = null, secondActivated;
    const activated = new Promise(resolve => { secondActivated = resolve; });
    const app = await runKairoSupervisor({
        ...f, startupTimeout: 20_000, shutdownTimeout: 10_000,
        runtimeOptions: { noSync: true, port, streamPort },
        storage: { prepare: async () => selection, commit: async () => {} },
        forkRuntime(file, args, options) {
            const child = fork(file, args, { ...options, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
            const index = children.push(child), send = child.send.bind(child);
            child.send = (message, ...rest) => { const result = send(message, ...rest); if (index === 2 && message.type === 'activated') secondActivated(); return result; };
            return child;
        },
    });
    try {
        const origin = `http://127.0.0.1:${port}`;
        const page = await fetch(origin); await page.arrayBuffer();
        const cookie = page.headers.get('set-cookie').split(';')[0];
        const bootstrap = await (await fetch(origin + '/api/bootstrap', { headers: { cookie } })).json();
        assert.ok(bootstrap.csrf);
        const headers = { cookie, 'content-type': 'application/json', 'x-kairo-csrf': bootstrap.csrf };
        assert.equal((await fetch(origin + '/api/settings', { method: 'PUT', headers, body: JSON.stringify({ theme: 'amber' }) })).status, 200);
        selection = { directory: fileURLToPath(new URL('../../server/data/', import.meta.url)), manifest: { build: 3503375 }, pending: true };
        children[0].emit('message', { type: 'dataset-ready' });
        await activated;
        const restored = await fetch(origin + '/api/bootstrap', { headers: { cookie } });
        assert.equal(restored.status, 200);
        const data = await restored.json();
        assert.equal(data.csrf, bootstrap.csrf);
        assert.equal(data.settings.theme, 'amber');
        assert.equal((await fetch(origin + '/api/settings', { method: 'PUT', headers, body: JSON.stringify({ theme: 'mint' }) })).status, 200);
        for (const name of readdirSync(join(f.dataDir, 'datasets'))) {
            const content = readFileSync(join(f.dataDir, 'datasets', name));
            assert.equal(content.includes(Buffer.from(bootstrap.csrf)), false, 'Session handover remains in private process memory.');
        }
    } finally { await app.close(); await app.done; }
});
