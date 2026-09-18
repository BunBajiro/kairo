// Daily archive rows are historical storage. market_history is the bounded
// working projection consumed by market reports and import analysis.
export const DAY = 86400000;
const date = n => new Date(n).toISOString().slice(0, 10);
const writers = new WeakMap();

export function historyWindow(rows, days = 30, now = Date.now()) {
    const end = Date.parse(date(now)), start = end - days * DAY, unique = new Map();
    for (const r of rows || []) {
        const at = Date.parse(r.date);
        if (at >= start && at < end && Number.isFinite(r.volume) && r.volume >= 0 && Number.isFinite(r.average) && r.average >= 0) unique.set(r.date, r);
    }
    const data = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date)), volume = data.reduce((n, r) => n + r.volume, 0);
    return {period: days, volume, daily_volume: volume / days, average: volume ? data.reduce((n, r) => n + r.volume * r.average, 0) / volume : null, reported_days: data.length, active_days: data.filter(r => r.volume > 0).length, from: date(start), to: date(end - DAY), latest: data.at(-1)?.date || null, days: data};
}

export const historySummary = (rows, now = Date.now()) => historyWindow(rows, 30, now);

function withinWindow(rows, from, to) {
    const start = Date.parse(from), end = Date.parse(to) + DAY;
    // Preserve source order and fields inside the existing window. Consumers
    // retain their established duplicate-day and missing-day handling.
    return rows.filter(row => { const at = Date.parse(row.date); return at >= start && at < end; });
}

// One-time upgrade: use each saved projection's own dates, not today's date.
// This keeps stale/offline summaries and their observation times consistent.
export function compactHistoryCache(db) {
    const update = db.prepare('UPDATE market_history SET body=? WHERE region_id=? AND type_id=?');
    for (const row of db.prepare('SELECT region_id,type_id,body,period_from,period_to FROM market_history').iterate()) {
        if (!Number.isFinite(Date.parse(row.period_from)) || !Number.isFinite(Date.parse(row.period_to))) continue;
        const rows = JSON.parse(row.body), bounded = withinWindow(rows, row.period_from, row.period_to);
        if (bounded.length !== rows.length) update.run(JSON.stringify(bounded), row.region_id, row.type_id);
    }
}

function statements(db) {
    if (!writers.has(db)) writers.set(db, {
        history: db.prepare('INSERT INTO market_history VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(region_id,type_id) DO UPDATE SET body=excluded.body,updated=excluded.updated,expires=excluded.expires,daily_volume=excluded.daily_volume,average=excluded.average,reported_days=excluded.reported_days,period_from=excluded.period_from,period_to=excluded.period_to'),
        source: db.prepare('INSERT INTO market_history_meta VALUES(?,?,?) ON CONFLICT(region_id,type_id) DO UPDATE SET source=excluded.source'),
    });
    return writers.get(db);
}

// A synchronous, caller-bounded batch. SAVEPOINT also composes with an outer
// transaction; a failed source write cannot leave its history half updated.
export function saveHistories(store, region, entries, updated, expires, source, now = Date.now()) {
    const db = store.db, write = statements(db);
    db.exec('SAVEPOINT market_history_write');
    try {
        for (const [id, rows] of entries) {
            const h = historySummary(rows, now), bounded = withinWindow(rows, h.from, h.to);
            write.history.run(region, id, JSON.stringify(bounded), updated, expires, h.daily_volume, h.average, h.reported_days, h.from, h.to);
            write.source.run(region, id, source);
        }
        db.exec('RELEASE market_history_write');
    } catch (error) {
        db.exec('ROLLBACK TO market_history_write; RELEASE market_history_write');
        throw error;
    }
}

export function saveHistory(store, region, id, rows, updated, expires, source, now = Date.now()) {
    return saveHistories(store, region, [[id, rows]], updated, expires, source, now);
}
