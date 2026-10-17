import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertSupportedRuntime} from '../../server/runtime-version.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
function run(args, env = {}) {
    return spawnSync(process.execPath, args, {
        cwd: root, env: {...process.env, ...env}, encoding: 'utf8', timeout: 8000,
    });
}
const child = (source, env) => run(['--input-type=module', '-e', source], env);

test('runtime policy accepts patched branches and rejects earlier or unknown versions', () => {
    for (const [node, undici] of [['24.21.0', '7.29.1'], ['24.22.0', '7.30.0'], ['26.0.0', '8.10.2'], ['26.1.0', '8.11.0'], ['27.0.0', '9.0.0'], ['24.21.0', '6.28.1']]) {
        assert.doesNotThrow(() => assertSupportedRuntime({node, undici}), `${node}/${undici}`);
    }
    for (const [node, undici] of [['24.20.9', '7.29.1'], ['22.30.0', '7.29.1'], ['24.21.0', '7.29.0'], ['26.0.0', '8.10.1'], ['26.0.0', '8.9.9'], ['24.21.0', '6.28.0'], ['24.21.0', undefined], ['24.21.0', 'unknown'], ['24.21.0-rc.1', '7.29.1']]) {
        assert.throws(() => assertSupportedRuntime({node, undici}), {code: 'UNSUPPORTED_NODE'}, `${node}/${undici}`);
    }
});

test('launcher rejects obsolete Node before acquiring a profile lease', t => {
    const parent = mkdtempSync(join(tmpdir(), 'kairo-node-version-')), dataDir = join(parent, 'profile');
    t.after(() => rmSync(parent, {recursive: true, force: true}));
    const preload = 'data:text/javascript,' + encodeURIComponent("Object.defineProperty(process.versions, 'node', {value: '24.20.0'});");
    const result = run(['--import', preload, 'server/start.mjs'], {KAIRO_DATA_DIR: dataDir, KAIRO_PORT: '0', KAIRO_STREAM_PORT: '0'});
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Node\.js 24\.21\.0/);
    assert.equal(existsSync(dataDir), false, 'Unsupported startup must not create or migrate a profile.');
});

test('embedded startup rejects an obsolete bundled Undici before opening a profile', t => {
    const parent = mkdtempSync(join(tmpdir(), 'kairo-undici-version-')), dataDir = join(parent, 'profile');
    t.after(() => rmSync(parent, {recursive: true, force: true}));
    const result = child(`
        import assert from 'node:assert/strict';
        Object.defineProperty(process.versions, 'node', {value: '26.0.0'});
        Object.defineProperty(process.versions, 'undici', {value: '8.10.1'});
        const {startKairo} = await import('./server/index.mjs');
        await assert.rejects(startKairo({dataDir: process.env.KAIRO_DATA_DIR, port: 0, streamPort: 0, noSync: true}), {code: 'UNSUPPORTED_NODE'});
    `, {KAIRO_DATA_DIR: dataDir});
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(dataDir), false);
});

test('actual OBS client rejects an unrequested WebSocket protocol without crashing Node', () => {
    // A child contains the pre-fix uncaught exception. The peer is synthetic and
    // loopback-only; no real OBS, credentials or user profile are involved.
    const result = child(`
        import assert from 'node:assert/strict';
        import {createServer} from 'node:http';
        import {createHash} from 'node:crypto';
        import {createOBS, defaultOBS} from './server/obs.mjs';
        const server = createServer(), sockets = new Set(), failed = Promise.withResolvers();
        server.on('upgrade', (req, socket) => {
            sockets.add(socket); socket.on('close', () => sockets.delete(socket));
            const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
            socket.write('HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: ' + accept + '\\r\\nSec-WebSocket-Protocol: unexpected\\r\\n\\r\\n');
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const values = new Map([['obs', {...defaultOBS(), enabled: true, port: server.address().port}], ['obs.space-categories-v3', true]]);
        const obs = createOBS({get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => values.set(key, value)}, {}, {
            requestTimeout: 2000, reconnectDelay: 60000, closeTimeout: 1000,
            onChange(status) { if (status.error && !status.connecting) failed.resolve(status); },
        });
        let deadline;
        try {
            const status = await Promise.race([failed.promise, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Malformed handshake did not settle')), 3000); })]);
            assert.equal(status.connected, false);
            assert.match(status.error, /Cannot reach OBS/);
        } finally {
            clearTimeout(deadline);
            await obs.close();
            for (const socket of sockets) socket.destroy();
            await new Promise(resolve => server.close(resolve));
        }
    `);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
});
