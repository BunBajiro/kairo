/**
 * Exclusive launcher lease for one data directory. This separate SQLite database
 * protects generation cleanup as well as the runtime, before application Store
 * construction. See docs/DATASETS.md for selection/activation ordering.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Acquire BEGIN IMMEDIATE without waiting; return an idempotent close() owner.
 * Another holder throws EADDRINUSE; unrelated I/O/SQLite errors propagate.
 * SQLite releases the lease on close or crash. Never delete runtime-lock.sqlite
 * to bypass a holder: deleting its pathname is not releasing that process's lease.
 */
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
