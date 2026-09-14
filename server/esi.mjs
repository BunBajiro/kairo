import { createHash } from 'node:crypto';
export const COMPATIBILITY_DATE = '2026-09-04';
const iso = value => new Date(value).toISOString();
const validId = id => Number.isSafeInteger(id) && id > 0 && id < 2147483647;

export function createESI(store, auth, { fetcher = fetch } = {}) {
    const limits = store.get('esi:limits', {});
    const inflight = new Map(), nameFlights = new Map(), routeGroups = new Map(Object.entries(limits.groups || {}));
    const blocks = new Map((limits.blocks || []).filter(([, until]) => until > Date.now()));
    let errorUntil = limits.errorUntil || 0, active = 0;
    const waiters = [], priorityWaiters = [];
    const counters = { requests: 0, cacheHits: 0, coalesced: 0, notModified: 0, failed: 0 };
    const readCache = store.db.prepare('SELECT * FROM cache WHERE key=?');
    const putCache = store.db.prepare('INSERT INTO cache VALUES(?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body,etag=excluded.etag,expires=excluded.expires,updated=excluded.updated,headers=excluded.headers');
    const deleteCache = store.db.prepare('DELETE FROM cache WHERE key=?');
    const sample = cached => ({ data: JSON.parse(cached.body), updatedAt: iso(cached.updated), expiresAt: iso(cached.expires), headers: JSON.parse(cached.headers), cached: true });
    function saveLimits() {
        for (const [key, until] of blocks) if (until <= Date.now()) blocks.delete(key);
        store.set('esi:limits', { errorUntil, blocks: [...blocks], groups: Object.fromEntries(routeGroups) });
    }
    async function slot(priority) {
        if (active >= 4) await new Promise(r => (priority ? priorityWaiters : waiters).push(r));
        else active++;
        return () => { const next = priorityWaiters.shift() || waiters.shift(); if (next) next(); else active--; };
    }
    function cooldown(until) {
        return Object.assign(new Error('ESI is cooling down after a rate limit. Cached data is retained.'), { status: 429, retryAt: iso(until) });
    }
    function rememberNames(data, expires, updated) {
        if (!Array.isArray(data)) return;
        store.db.exec('SAVEPOINT esi_names');
        try {
            for (const name of data) {
                if (validId(name?.id) && typeof name.name === 'string' && name.name.length)
                    putCache.run('esi-name:' + name.id, JSON.stringify(name), null, expires, updated, '{}');
            }
            store.db.exec('RELEASE esi_names');
        }
        catch (error) { store.db.exec('ROLLBACK TO esi_names; RELEASE esi_names'); throw error; }
    }
    // Public names only. Private structure names retain character cache keys.
    function cachedNames(ids) {
        const out = {};
        for (const id of ids) {
            const row = readCache.get('esi-name:' + id);
            if (row?.expires > Date.now()) out[id] = JSON.parse(row.body).name;
        }
        return out;
    }
    async function request(path, { characterId = 0, method = 'GET', body, ttl = 300, priority = false } = {}) {
        if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid ESI path.');
        method = method.toUpperCase();
        const url = new URL('https://esi.evetech.net' + path);
        url.searchParams.sort();
        const pathname = url.pathname.replace(/\/$/, '') || '/';
        path = pathname + url.search;
        // IDs are a set here; batch order must not duplicate cache entries.
        if (path === '/universe/names' && Array.isArray(body)) body = [...new Set(body)].sort((a, b) => a - b);
        const key = characterId + ':' + method + ':' + path + ':' + (body ? createHash('sha256').update(JSON.stringify(body)).digest('hex') : '');
        if (inflight.has(key)) { counters.coalesced++; return inflight.get(key); }
        const cached = readCache.get(key);
        if (cached && cached.expires > Date.now()) {
            counters.cacheHits++;
            const result = sample(cached);
            if (path === '/universe/names') rememberNames(result.data, cached.expires, cached.updated);
            return result;
        }
        const route = method + ':' + pathname.replace(/^(\/killmails\/\d+)\/[^/]+$/, '$1/{hash}').replace(/\/\d+(?=\/|$)/g, '/{id}');
        const cachedGroup = cached && JSON.parse(cached.headers)['x-ratelimit-group'];
        if (cachedGroup) routeGroups.set(route, cachedGroup);
        const retryKey = 'esi-retry:' + key, previousFailure = readCache.get(retryKey);
        const blockedUntil = () => Math.max(errorUntil, blocks.get(characterId + ':*') || 0, blocks.get(characterId + ':' + routeGroups.get(route)) || 0);
        const task = Promise.resolve().then(async () => {
            let release, attempted = false;
            try {
                if (previousFailure?.expires > Date.now()) {
                    const failure = JSON.parse(previousFailure.body);
                    throw Object.assign(new Error(failure.message), { status: failure.status, retryAt: iso(previousFailure.expires) });
                }
                if (blockedUntil() > Date.now()) throw cooldown(blockedUntil());
                release = await slot(priority);
                if (blockedUntil() > Date.now()) throw cooldown(blockedUntil());
                const headers = { 'Accept': 'application/json', 'Accept-Language': 'en', 'X-Compatibility-Date': COMPATIBILITY_DATE, 'User-Agent': 'Kairo/0.7.2 (local EVE companion)' };
                if (cached?.etag) headers['If-None-Match'] = cached.etag;
                else if (cached && JSON.parse(cached.headers)['last-modified']) headers['If-Modified-Since'] = JSON.parse(cached.headers)['last-modified'];
                if (characterId) headers.Authorization = 'Bearer ' + await auth.access(characterId);
                if (body) headers['Content-Type'] = 'application/json';
                const fetchResponse = () => {
                    attempted = true; counters.requests++;
                    return fetcher('https://esi.evetech.net' + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
                };
                let response = await fetchResponse();
                if (response.status === 401 && characterId) {
                    headers.Authorization = 'Bearer ' + await auth.access(characterId, true);
                    response = await fetchResponse();
                }
                const now = Date.now(), retry = response.headers.get('retry-after');
                const parsedRetry = retry ? (Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Date.parse(retry) - now) : NaN;
                const retryMs = Number.isFinite(parsedRetry) ? Math.max(1000, parsedRetry) : 60000;
                const group = response.headers.get('x-ratelimit-group');
                if (group) routeGroups.set(route, group);
                const errRemain = response.headers.get('x-esi-error-limit-remain');
                if (errRemain !== null && Number(errRemain) < 10) {
                    errorUntil = now + Math.max(10000, Number(response.headers.get('x-esi-error-limit-reset') || 60) * 1000);
                    saveLimits();
                }
                const rateRemain = response.headers.get('x-ratelimit-remaining');
                if (response.status === 429 || response.status === 420 || rateRemain !== null && Number(rateRemain) < 10) {
                    // Buckets belong to a route group and character (or public
                    // IP). Unknown/legacy limits remain conservative.
                    blocks.set(characterId + ':' + (group || '*'), now + Math.max(10000, retryMs));
                    if (response.status === 420) errorUntil = now + Math.max(60000, retryMs);
                    saveLimits();
                }
                if (!response.ok && response.status !== 304) {
                    const error = new Error(response.status === 403 ? 'ESI access denied. Check scopes and character access.' : response.status === 404 ? 'This ESI resource is unavailable for the character.' : response.status === 429 || response.status === 420 ? 'ESI rate limit reached; retry scheduled.' : 'ESI request failed (' + response.status + '). Retrying automatically.');
                    error.status = response.status;
                    error.serverRetryAfter = !!retry;
                    if (retry || [420, 429].includes(response.status)) error.retryAt = iso(now + retryMs);
                    throw error;
                }
                if (response.status === 304 && !cached) throw new Error('ESI returned an uncacheable empty response.');
                const h = response.status === 304 && cached ? JSON.parse(cached.headers) : {};
                for (const k of ['x-pages', 'x-ratelimit-group', 'x-ratelimit-remaining', 'last-modified', 'cache-control'])
                    if (response.headers.get(k)) h[k] = response.headers.get(k);
                const exp = Date.parse(response.headers.get('expires') || '');
                const cacheMax = h['cache-control']?.match(/(?:^|,)\s*max-age=(\d+)/i);
                const age = Number(response.headers.get('age') || 0);
                const expires = Number.isFinite(exp) ? Math.max(now + 1000, exp) : cacheMax ? now + Math.max(1, Number(cacheMax[1]) - age) * 1000 : now + ttl * 1000;
                const data = response.status === 304 ? JSON.parse(cached.body) : await response.json();
                // A new representation without an ETag must not inherit the old one.
                const etag = response.headers.get('etag') || (response.status === 304 ? cached.etag : null);
                putCache.run(key, JSON.stringify(data), etag, expires, now, JSON.stringify(h));
                deleteCache.run(retryKey);
                if (path === '/universe/names') rememberNames(data, expires, now);
                if (response.status === 304) counters.notModified++;
                return { data, updatedAt: iso(now), expiresAt: iso(expires), headers: h, cached: response.status === 304 };
            }
            catch (error) {
                if (attempted) {
                    counters.failed++;
                    const failures = Math.min(8, (previousFailure ? JSON.parse(previousFailure.body).failures || 0 : 0) + 1);
                    const location = /\/characters\/\d+\/location$/.test(pathname);
                    const delay = location ? Math.min(15000, 3000 * 2 ** (failures - 1)) : [401, 403, 404].includes(error.status) ? 300000 : Math.min(900000, 30000 * 2 ** (failures - 1));
                    const retryAt = Math.max(Date.now() + delay, Date.parse(error.retryAt) || 0);
                    error.retryAt = iso(retryAt);
                    putCache.run(retryKey, JSON.stringify({ message: error.message, status: error.status, failures, serverRetryAfter: error.serverRetryAfter }), null, retryAt, Date.now(), '{}');
                }
                if (cached) return { ...sample(cached), stale: true, error: error.message, errorStatus: error.status, retryAt: error.retryAt };
                throw error;
            }
            finally { release?.(); inflight.delete(key); }
        });
        inflight.set(key, task);
        return task;
    }
    async function paged(path, options = {}) {
        const first = await request(path + (path.includes('?') ? '&' : '?') + 'page=1', options);
        const pages = Math.min(250, Number(first.headers['x-pages'] || 1));
        let data = [...first.data], stale = first.stale, error = first.error, errorStatus = first.errorStatus, expiresAt = first.expiresAt, retryAt = first.retryAt;
        for (let page = 2; page <= pages; page++) {
            const next = await request(path + (path.includes('?') ? '&' : '?') + 'page=' + page, options);
            data.push(...next.data);
            if (next.stale) { stale = true; error = next.error; errorStatus = next.errorStatus; }
            if (next.expiresAt < expiresAt) expiresAt = next.expiresAt;
            if (next.retryAt && (!retryAt || next.retryAt > retryAt)) retryAt = next.retryAt;
        }
        return { ...first, data, expiresAt, stale, error, errorStatus, retryAt, truncated: Number(first.headers['x-pages'] || 1) > pages };
    }
    async function names(ids, options = {}) {
        const unique = [...new Set(ids.filter(validId))].sort((a, b) => a - b), out = cachedNames(unique);
        const missing = unique.filter(id => !out[id] && !nameFlights.has(id)), waiting = [];
        for (let i = 0; i < missing.length; i += 500) {
            const batch = missing.slice(i, i + 500);
            const task = Promise.resolve().then(async () => {
                try {
                    const r = await request('/universe/names', { ...options, characterId: 0, method: 'POST', body: batch, ttl: 86400 });
                    return Object.fromEntries(r.data.map(n => [n.id, n.name]));
                }
                catch { return {}; }
                finally { for (const id of batch) nameFlights.delete(id); }
            });
            for (const id of batch) nameFlights.set(id, task);
        }
        for (const id of unique) if (!out[id] && nameFlights.has(id)) waiting.push(nameFlights.get(id));
        for (const resolved of await Promise.all([...new Set(waiting)]))
            for (const id of unique) if (resolved[id]) out[id] = resolved[id];
        return out;
    }
    function clearAccessFailures(characterId) {
        // Explicit refresh / renewed SSO may fix access. Keep server cooldowns.
        store.db.prepare("DELETE FROM cache WHERE key LIKE ? AND json_extract(body,'$.status') IN (401,403) AND COALESCE(json_extract(body,'$.serverRetryAfter'),0)=0").run('esi-retry:' + characterId + ':%');
    }
    return { request, paged, names, cachedNames, clearAccessFailures, health: () => ({ active, queued: waiters.length + priorityWaiters.length, errorUntil, ...counters }) };
}
