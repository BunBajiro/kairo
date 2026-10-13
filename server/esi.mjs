import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createCacheRetention } from './cache-retention.mjs';
export const COMPATIBILITY_DATE = '2026-09-04';
const iso = value => new Date(value).toISOString();
const validId = id => Number.isSafeInteger(id) && id > 0 && id < 2147483647;
const transportHeaders = { Accept: 'application/json', 'Accept-Language': 'en', 'X-Compatibility-Date': COMPATIBILITY_DATE,
    'User-Agent': 'Kairo/0.8 (local EVE companion)' };
const pacingOwner = Symbol('pacingOwner'), pacingStage = Symbol('pacingStage'), admissionCheck = Symbol('admissionCheck');
const connectionOwner = Symbol('connectionOwner');

export function createESI(store, auth, { fetcher = fetch } = {}) {
    const limits = store.get('esi:limits', {});
    const retention = createCacheRetention(store);
    const inflight = new Map(), nameFlights = new Map(), routeGroups = new Map(Object.entries(limits.groups || {}));
    const blocks = new Map((limits.blocks || []).filter(([, until]) => until > Date.now()));
    let errorUntil = limits.errorUntil || 0, active = 0;
    const waiters = [], priorityWaiters = [];
    const accepted = new Set();
    let closing;
    const counters = { requests: 0, cacheHits: 0, coalesced: 0, notModified: 0, failed: 0 };
    const connectionRevision = id => auth.connectionRevision?.(id) ?? 0;
    const withConnection = options => options.characterId && options[connectionOwner] === undefined
        ? { ...options, [connectionOwner]: connectionRevision(options.characterId) } : options;
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
    function checkCooldown(characterId, route) {
        const until = Math.max(errorUntil, blocks.get(characterId + ':*') || 0, blocks.get(characterId + ':' + routeGroups.get(route)) || 0);
        if (until > Date.now()) throw cooldown(until);
    }
    async function headersFor(characterId) {
        const headers = { ...transportHeaders };
        if (characterId) headers.Authorization = 'Bearer ' + await auth.access(characterId);
        return headers;
    }
    function responseLimits(response, route, characterId) {
        const now = Date.now(), retry = response.headers.get('retry-after');
        const parsed = retry ? Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Date.parse(retry) - now : NaN;
        const retryMs = Number.isFinite(parsed) ? Math.max(1000, parsed) : 60000;
        const group = response.headers.get('x-ratelimit-group');
        let changed = false;
        if (group && routeGroups.get(route) !== group) { routeGroups.set(route, group); changed = true; }
        const errorsLeft = response.headers.get('x-esi-error-limit-remain'), remaining = response.headers.get('x-ratelimit-remaining');
        if (errorsLeft !== null && Number(errorsLeft) < 10) {
            errorUntil = now + Math.max(10000, Number(response.headers.get('x-esi-error-limit-reset') || 60) * 1000);
            changed = true;
        }
        if ([420, 429].includes(response.status) || remaining !== null && Number(remaining) < 10) {
            // Buckets belong to a route group and pilot (or the public IP).
            // Unknown groups retain the conservative pilot-wide fallback.
            blocks.set(characterId + ':' + (group || '*'), now + Math.max(10000, retryMs));
            if (response.status === 420) errorUntil = now + Math.max(60000, retryMs);
            changed = true;
        }
        if (changed) saveLimits();
        return { now, retry, retryMs };
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
    async function request(path, options = {}) {
        options = withConnection(options);
        let { characterId = 0, method = 'GET', body, ttl = 300, priority = false } = options;
        const checkConnection = () => {
            if (characterId && connectionRevision(characterId) !== options[connectionOwner])
                throw new Error('Character connection changed during ESI request.');
        };
        checkConnection();
        const pace = options[pacingOwner], checkAdmission = options[admissionCheck];
        checkAdmission?.();
        if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid ESI path.');
        method = method.toUpperCase();
        const url = new URL('https://esi.evetech.net' + path);
        url.searchParams.sort();
        const pathname = url.pathname.replace(/\/$/, '') || '/';
        path = pathname + url.search;
        // IDs are a set here; batch order must not duplicate cache entries.
        if (path === '/universe/names' && Array.isArray(body)) body = [...new Set(body)].sort((a, b) => a - b);
        const key = characterId + ':' + method + ':' + path + ':' + (body ? createHash('sha256').update(JSON.stringify(body)).digest('hex') : '');
        const flightKey = characterId ? key + ':connection:' + options[connectionOwner] : key;
        if (inflight.has(flightKey)) { counters.coalesced++; return inflight.get(flightKey); }
        const cached = readCache.get(key);
        if (cached) retention.touch(key);
        if (cached && cached.expires > Date.now()) {
            counters.cacheHits++;
            const result = sample(cached);
            if (path === '/universe/names') rememberNames(result.data, cached.expires, cached.updated);
            return result;
        }
        if (pace && options[pacingStage] !== 'ready') {
            if (options[pacingStage] !== 'queued') {
                const task = pace.tail.then(() => request(path, { ...options, [pacingStage]: 'queued' }));
                pace.tail = task.catch(() => {});
                return task;
            }
            const wait = pace.spacingMs - (pace.now() - pace.lastRequest);
            if (wait > 0) await pace.wait(wait);
            // Waiting owns no network slot or shared request flight. Recheck
            // access, cache and coalescing after the wait; a cancelled caller
            // cannot fail another consumer's accepted request.
            return request(path, { ...options, [pacingStage]: 'ready' });
        }
        const route = method + ':' + pathname.replace(/^(\/killmails\/\d+)\/[^/]+$/, '$1/{hash}').replace(/\/\d+(?=\/|$)/g, '/{id}');
        const cachedGroup = cached && JSON.parse(cached.headers)['x-ratelimit-group'];
        if (cachedGroup) routeGroups.set(route, cachedGroup);
        const retryKey = 'esi-retry:' + key, previousFailure = readCache.get(retryKey);
        if (previousFailure) retention.touch(retryKey);
        retention.maintain();
        const task = Promise.resolve().then(async () => {
            let release, attempted = false;
            try {
                if (previousFailure?.expires > Date.now()) {
                    const failure = JSON.parse(previousFailure.body);
                    throw Object.assign(new Error(failure.message), { status: failure.status, retryAt: iso(previousFailure.expires) });
                }
                checkCooldown(characterId, route);
                release = await slot(priority);
                checkCooldown(characterId, route);
                const headers = await headersFor(characterId);
                if (cached?.etag) headers['If-None-Match'] = cached.etag;
                else if (cached && JSON.parse(cached.headers)['last-modified']) headers['If-Modified-Since'] = JSON.parse(cached.headers)['last-modified'];
                if (body) headers['Content-Type'] = 'application/json';
                const fetchResponse = () => {
                    checkConnection();
                    if (pace) pace.lastRequest = pace.now();
                    attempted = true; counters.requests++;
                    return fetcher('https://esi.evetech.net' + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
                };
                let response = await fetchResponse();
                checkConnection();
                if (response.status === 401 && characterId) {
                    headers.Authorization = 'Bearer ' + await auth.access(characterId, true);
                    response = await fetchResponse();
                    checkConnection();
                }
                const { now, retry, retryMs } = responseLimits(response, route, characterId);
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
                checkConnection();
                // A new representation without an ETag must not inherit the old one.
                const etag = response.headers.get('etag') || (response.status === 304 ? cached.etag : null);
                putCache.run(key, JSON.stringify(data), etag, expires, now, JSON.stringify(h));
                deleteCache.run(retryKey);
                if (path === '/universe/names') rememberNames(data, expires, now);
                if (response.status === 304) counters.notModified++;
                return { data, updatedAt: iso(now), expiresAt: iso(expires), headers: h, cached: response.status === 304 };
            }
            catch (error) {
                // An old grant's response must not recreate purged cache or
                // retry state, nor return stale data to its replacement owner.
                checkConnection();
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
            finally { release?.(); inflight.delete(flightKey); }
        });
        inflight.set(flightKey, task);
        return task;
    }
    /** An explicit command. Never cached, coalesced, or replayed after an uncertain network failure. */
    async function mutate(path, { characterId, method = 'POST', body, priority = true } = {}) {
        if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw new Error('Invalid ESI path.');
        method = method.toUpperCase();
        if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) throw new Error('Choose a mutation HTTP method.');
        if (!Number.isSafeInteger(characterId) || characterId <= 0) throw new Error('An ESI command needs a connected pilot.');
        const url = new URL('https://esi.evetech.net' + path);
        if (url.origin !== 'https://esi.evetech.net') throw new Error('Invalid ESI origin.');
        url.searchParams.sort();
        const pathname = url.pathname.replace(/\/$/, '') || '/', route = method + ':' + pathname.replace(/\/\d+(?=\/|$)/g, '/{id}');
        let release, attempted = false, response;
        try {
            checkCooldown(characterId, route);
            release = await slot(priority);
            checkCooldown(characterId, route);
            const headers = await headersFor(characterId);
            if (body !== undefined) headers['Content-Type'] = 'application/json';
            const send = () => { attempted = true; counters.requests++; return fetcher(url.href, { method, headers,
                body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15000) }); };
            response = await send();
            // An explicit 401 guarantees rejection; it is the only automatic command retry.
            if (response.status === 401) { headers.Authorization = 'Bearer ' + await auth.access(characterId, true); response = null; response = await send(); }
            const { now, retry, retryMs } = responseLimits(response, route, characterId);
            if (!response.ok) throw Object.assign(new Error(response.status === 403 ? 'ESI command denied. Check pilot scopes and access.' : 'ESI command failed (HTTP ' + response.status + ').'),
                { status: response.status, ...(retry || [420, 429].includes(response.status) ? { retryAt: iso(now + retryMs) } : {}) });
            const raw = response.status === 204 || response.status === 205 ? '' : await response.text();
            let data = null; if (raw) { try { data = JSON.parse(raw); } catch { data = raw; } }
            return { data, status: response.status, updatedAt: iso(now), cached: false };
        } catch (error) {
            if (attempted) counters.failed++;
            // A timeout/transport failure may happen after the server applied the command.
            if (attempted && (!response || response.ok)) error.uncertain = true;
            throw error;
        } finally { release?.(); }
    }
    async function paged(path, options = {}) {
        options = withConnection(options);
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
    const closedError = () => new Error('ESI is shutting down.');
    function own(operation, args) {
        if (closing) return Promise.reject(closedError());
        const task = operation(...args).finally(() => accepted.delete(task));
        accepted.add(task);
        return task;
    }
    // Only the public boundary stops admission. An accepted names/paged call
    // keeps its private request chain alive until all cache writes complete.
    return {
        request: (...args) => own(request, args), mutate: (...args) => own(mutate, args),
        paced({ spacingMs = 250, now = Date.now, wait = delay } = {}) {
            if (closing) throw closedError();
            if (!Number.isFinite(spacingMs) || spacingMs < 0) throw new Error('Choose a valid ESI request spacing.');
            const pace = { spacingMs, now, wait, lastRequest: 0, tail: Promise.resolve() };
            return (path, options = {}, checkAdmission) => own(request, [path,
                { ...options, [pacingOwner]: pace, [admissionCheck]: checkAdmission }]);
        },
        paged: (...args) => own(paged, args), names: (...args) => own(names, args),
        cachedNames(ids) { if (closing) throw closedError(); return cachedNames(ids); },
        clearAccessFailures(id) { if (closing) throw closedError(); return clearAccessFailures(id); },
        close() { return closing ||= Promise.allSettled([...accepted]).then(() => {}); },
        health: () => ({ active, queued: waiters.length + priorityWaiters.length, errorUntil, ...counters })
    };
}
