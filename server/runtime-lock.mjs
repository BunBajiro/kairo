import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** A process-scoped lease, released by SQLite even after a crash. Never delete it. */
export function acquireRuntimeLock(dataDir) {
    const directory = join(dataDir, 'datasets');
    mkdirSync(directory, { recursive: true });
    const db = new DatabaseSync(join(directory, 'runtime-lock.sqlite'));
    try {
        db.exec('PRAGMA busy_timeout = 0; BEGIN IMMEDIATE;');
    } catch (cause) {
        db.close();
        if (![5, 6].includes(cause.errcode) && !/locked|busy/i.test(cause.message)) throw cause;
        const error = new Error('Kairo is already running with this data directory.', { cause });
        error.code = 'EADDRINUSE';
        throw error;
    }
    let closed = false;
    return {
        close() {
            if (closed) return;
            closed = true;
            try { db.exec('ROLLBACK'); } finally { db.close(); }
        },
    };
}
