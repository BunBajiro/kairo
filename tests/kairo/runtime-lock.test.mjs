import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { acquireRuntimeLock } from '../../server/runtime-lock.mjs';

test('runtime lease excludes a second owner and is reusable after close', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kairo-lease-'));
    try {
        const first = acquireRuntimeLock(dir);
        assert.throws(() => acquireRuntimeLock(dir), { code: 'EADDRINUSE' });
        first.close(); first.close();
        acquireRuntimeLock(dir).close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('different data directories have independent runtime leases', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kairo-leases-'));
    const first = acquireRuntimeLock(join(dir, 'one')), second = acquireRuntimeLock(join(dir, 'two'));
    try { assert.throws(() => acquireRuntimeLock(join(dir, 'one')), { code: 'EADDRINUSE' }); }
    finally { first.close(); second.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('SQLite releases the runtime lease when a process is killed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kairo-crashed-lease-'));
    const source = `import { acquireRuntimeLock } from ${JSON.stringify(new URL('../../server/runtime-lock.mjs', import.meta.url).href)}; acquireRuntimeLock(process.argv[1]); console.log('locked'); setInterval(() => {}, 60000);`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', source, dir], { stdio: ['ignore', 'pipe', 'pipe'] });
    try {
        await once(child.stdout, 'data');
        assert.throws(() => acquireRuntimeLock(dir), { code: 'EADDRINUSE' });
        const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
        acquireRuntimeLock(dir).close();
    } finally { if (child.exitCode === null && !child.killed) child.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true }); }
});
