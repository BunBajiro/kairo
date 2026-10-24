/**
 * Bounded, opportunistic retention for replaceable transport data and scan
 * summaries. Durable evidence has its own owners and must never be purged merely
 * because this cache grows. Policy and exclusions: docs/DATA-RETENTION.md.
 */
export const CACHE_RETENTION_DAYS = 90;
export const CACHE_MAINTENANCE_BATCH = 200;
const DAY = 86400000, HOUR = 3600000, KEY = 'retention:transport:v080';
const owners = new WeakMap();
const eligible = key => /^(?:\d+:(?:GET|POST):\/|esi-name:\d+$|esi-retry:\d+:(?:GET|POST):\/|zkill:(?:query:|character:\d+:page:\d+$))/.test(key);
/**
 * Return the shared maintenance owner for this SQLite handle (first clock wins).
 * `now` returns epoch milliseconds. touch(key) records use of an existing cache
 * row, coalescing writes by UTC day; maintain() scans at most 200 candidates per
 * hourly opportunity and reports {scanned, deleted}. Both are synchronous.
 *
 * The persisted cursor and deletions commit together. Expired, eligible entries
 * need 90 days of inactivity plus installation grace; active retries/cooldowns
 * retain last-good data. This owner creates no background timer and closes no DB.
 */
export function createCacheRetention(store, { now = Date.now } = {}) {
    const db = store.db;
    if (owners.has(db)) return owners.get(db);
    let policy = store.get(KEY, null);
    if (!policy) {
        policy = { introduced: now(), next: now() + HOUR, updated: -1, key: '' };
        store.set(KEY, policy);
    }
    const touched = new Map();
    const touchRow = db.prepare(`INSERT INTO cache_usage VALUES(?,?) ON CONFLICT(key)
        DO UPDATE SET last_used=excluded.last_used WHERE last_used<excluded.last_used`);
    const candidates = db.prepare(`SELECT c.key,c.updated,c.expires,u.last_used,r.expires AS retry_expires
        FROM cache c LEFT JOIN cache_usage u ON u.key=c.key
        LEFT JOIN cache r ON r.key='esi-retry:'||c.key
        WHERE (c.updated,c.key)>(?,?) AND c.updated<? ORDER BY c.updated,c.key LIMIT ?`);
    const remove = db.prepare('DELETE FROM cache WHERE key=?');
    function touch(key) {
        const day = Math.floor(now() / DAY) * DAY;
        if (touched.get(key) === day) return;
        // Day-end gives every use at least the complete inactivity window.
        touchRow.run(key, day + DAY);
        if (touched.size >= 2048) touched.clear();
        touched.set(key, day);
    }
    function maintain() {
        const at = now();
        if (at < policy.next) return { scanned: 0, deleted: 0 };
        const next = { ...policy, next: at + HOUR };
        let rows = [], deleted = 0;
        db.exec('SAVEPOINT cache_retention');
        try {
            // Existing installations receive a full grace window, even for
            // representations whose successful observation is much older.
            if (at - policy.introduced >= CACHE_RETENTION_DAYS * DAY) {
                const cutoff = at - CACHE_RETENTION_DAYS * DAY;
                const publicCooldown = store.get('combat.public.cooldown',0);
                rows = candidates.all(policy.updated, policy.key, cutoff, CACHE_MAINTENANCE_BATCH);
                for (const row of rows)
                    if (eligible(row.key) && !(row.key.startsWith('zkill:') && publicCooldown > at) && row.expires < at && (row.last_used ?? row.updated) < cutoff && !(row.retry_expires > at))
                        deleted += Number(remove.run(row.key).changes);
                const tail = rows.at(-1);
                next.updated = rows.length === CACHE_MAINTENANCE_BATCH ? tail.updated : -1;
                next.key = rows.length === CACHE_MAINTENANCE_BATCH ? tail.key : '';
            }
            store.set(KEY, next);
            db.exec('RELEASE cache_retention'); policy = next;
        } catch (error) {
            db.exec('ROLLBACK TO cache_retention; RELEASE cache_retention'); throw error;
        }
        return { scanned: rows.length, deleted };
    }
    const owner = { touch, maintain }; owners.set(db,owner); return owner;
}
/**
 * Delete at most 200 terminal job summaries and return the count. Preserve the
 * newest eight regardless of age, and up to 100 from the last 30 days. `now` is
 * epoch milliseconds. Published books, active jobs and resume intent are separate.
 */
export function pruneMarketJobs(db, now = Date.now()) {
    const terminal = 'terminal=1';
    // Seek the terminal partial index and materialize only bounded identities;
    // a large unrelated nonterminal backlog must not make cleanup scan every job.
    const recent = db.prepare('SELECT rowid FROM market_jobs WHERE ' + terminal + ' ORDER BY rowid DESC LIMIT 100').all();
    if (recent.length <= 8) return 0;
    return Number(db.prepare(`DELETE FROM market_jobs WHERE rowid IN (
        SELECT rowid FROM market_jobs WHERE rowid<? AND ${terminal}
            AND (rowid<? OR json_extract(body,'$.endedAt')<?)
        ORDER BY rowid LIMIT 200
    )`).run(recent[7].rowid, recent.length === 100 ? recent[99].rowid : -1,
        new Date(now - 30 * DAY).toISOString()).changes);
}
