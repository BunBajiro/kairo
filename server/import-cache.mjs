// Cache invalidation belongs to the data dependencies, including callers that
// write SQL directly. TEMP triggers are connection-local and roll back with the
// source transaction; they add no persistent schema or profiling machinery.
const readers = new WeakMap();

/**
 * Install one connection-local revision source and return its opaque stamp reader.
 * Compare stamps for equality only: the combined local/external value is not a
 * count or persisted version. Callers must also fence time and auth dependencies.
 */
export function importRevision(db) {
    if (readers.has(db)) return readers.get(db);
    db.exec('CREATE TEMP TABLE import_revision(value INTEGER NOT NULL); INSERT INTO import_revision VALUES(0)');
    const dependencies = {
        market_hubs: null, market_types: null, market_items: null, market_orders: null,
        market_history: null, market_history_meta: null, market_import_plans: null,
        characters: row => `${row}.id IS NOT NULL`,
        snapshots: row => `${row}.key IN ('skills','standings','orders')`,
        settings: row => `(${row}.key LIKE 'market:imports:%' OR ${row}.key LIKE 'market:owner:%'
            OR ${row}.key IN ('module:markets','module:wallet','module:training','module:combat'))`,
    };
    for (const [table, filter] of Object.entries(dependencies)) {
        for (const action of ['INSERT','UPDATE','DELETE']) {
            const rows = action === 'UPDATE' ? ['OLD','NEW'] : [action === 'INSERT' ? 'NEW' : 'OLD'];
            const when = filter ? 'WHEN '+rows.map(filter).join(' OR ') : '';
            // total_changes supplies a connection-monotonic stamp only when a
            // dependency changes. This avoids reusing a revision after rollback
            // followed by a different write (unrelated writes do not stamp it).
            db.exec(`CREATE TEMP TRIGGER import_revision_${table}_${action} AFTER ${action} ON main.${table}
                ${when} BEGIN UPDATE import_revision SET value=total_changes()+1; END`);
        }
    }
    const local = db.prepare('SELECT value FROM import_revision');
    const external = db.prepare('PRAGMA data_version');
    // Other connections do not run these TEMP triggers. data_version detects
    // their committed writes conservatively without invalidating on our own
    // unrelated settings, telemetry or session writes.
    const read = () => `${local.get().value}:${external.get().data_version}`;
    readers.set(db, read);
    return read;
}
