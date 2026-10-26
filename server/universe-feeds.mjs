/**
 * Public, timestamped Universe feed cache and expiry owner. Provider payloads
 * remain attributed observations; no pilot credentials are sent and reports do
 * not become private route confirmation. See docs/UNIVERSE.md for source limits.
 */
import { readFileSync } from 'node:fs';
import { FEED_URLS, normalizeConnections, normalizeObservations, normalizeManualStorms, normalizeCampaigns,
    normalizeDevelopment, normalizeKill, normalizeWormholeTypes, npcSample, npcDeltas } from './universe-feed-model.mjs';

const bundledPoints = JSON.parse(readFileSync(new URL('./data/universe-points.json', import.meta.url), 'utf8'));
const ISO = value => new Date(value).toISOString();
const DAY = 86400000, RETENTION = 7200000, MAX_KILLS = 500;
const PROVIDERS = {
    thera: { attribution: 'EVE-Scout / Signal Cartel', url: 'https://www.eve-scout.com/', ttl: 300000, notice: 'Reported wormholes. Expiry and ship-size limits do not guarantee remaining mass or passage.' },
    turnur: { attribution: 'EVE-Scout / Signal Cartel', url: 'https://www.eve-scout.com/', ttl: 300000, notice: 'Reported wormholes. Expiry and ship-size limits do not guarantee remaining mass or passage.' },
    storms: { attribution: 'EVE-Scout / Signal Cartel', url: 'https://www.eve-scout.com/', ttl: 3600000, notice: 'Reported storm locations. Report age is shown; locations older than 24 hours are marked stale. Areas follow real stargates.' },
    wormhole_types: { attribution: 'EVE-Scout / Signal Cartel', url: 'https://api.eve-scout.com/ui/', ttl: 86400000, notice: 'Nominal wormhole type limits. Remaining mass, current condition and passage are not confirmed.' },
    combat: { attribution: 'zKillboard R2Z2', url: 'https://zkillboard.com/api/docs/', ttl: 15000, notice: 'Publicly submitted killmails in the chosen recent window, up to 500. Coverage is incomplete and uploads may be delayed.' },
    campaigns: { attribution: 'CCP ESI', url: 'https://developers.eveonline.com/api-explorer#/operations/GetSovereigntyCampaigns', notice: 'Public sovereignty campaign snapshot. Timers are UTC.' },
    development: { attribution: 'CCP ESI', url: 'https://developers.eveonline.com/api-explorer#/operations/GetSovereigntySystems', notice: 'Sovereignty Hub development and vulnerability from the same ownership snapshot.' },
    npc_deltas: { attribution: 'CCP ESI · locally compared', url: 'https://developers.eveonline.com/api-explorer#/operations/GetUniverseSystemKills', notice: 'Change between rolling one-hour NPC kill totals. This is not the number of kills between samples; decreases are possible.' },
    points: { attribution: 'Slazanger/SMT · MIT / CCP SDE', url: 'https://github.com/Slazanger/SMT', notice: bundledPoints.metadata.notice },
};
const usable = sample => sample?.data != null && ['ready', 'stale'].includes(sample.status);
function metadata(sample, key, now) {
    const base = PROVIDERS[key];
    const updated = sample?.updated_at || sample?.updatedAt || null, expires = sample?.expires_at || sample?.expiresAt || null;
    const rawStatus = sample?.status || 'waiting';
    const stale = sample?.stale || rawStatus === 'stale' || rawStatus === 'ready' && (!Number.isFinite(Date.parse(updated)) || Date.parse(updated) > now + 1000 || !Number.isFinite(Date.parse(expires)) || Date.parse(expires) <= now || sample.truncated);
    return { status: stale ? 'stale' : ['error', 'missing_scope'].includes(rawStatus) ? 'unavailable' : rawStatus,
        updated_at: updated, expires_at: expires, retry_at: sample?.retry_at || sample?.retryAt || null,
        error: sample?.error || null, notice: sample?.notice || base.notice, attribution: base.attribution, url: base.url, count: 0 };
}
/**
 * Create shared feed state over Store and the static atlas. Core calls tick();
 * explicit refresh still respects provider freshness/backoff. noSync disables
 * scheduled fetching but not expiry. deferExpiry lets the composition root finish
 * construction before startExpiry arms a timer. close aborts and drains flights.
 * now() and timer delays use milliseconds; stored observation dates are ISO UTC.
 * Public combat collection remains independent of personal Session collection.
 */
export function createUniverseFeeds(store, _esi, { atlas, now = Date.now, fetcher = fetch, noSync = false, onChange = () => {}, onForgetConnections = () => {}, points = bundledPoints,
    setExpiryTimer = setTimeout, clearExpiryTimer = clearTimeout, deferExpiry = false } = {}) {
    if (!atlas?.systems || !atlas?.gates) throw new Error('Universe feeds need the bundled atlas.');
    const known = new Set(atlas.systems.map(s => s.system_id));
    const flights = new Map(), controllers = new Set();
    let closed = false, expiryTimer = null, expiryStarted = !deferExpiry;
    const key = source => 'universe:feeds:' + source;
    const cached = source => store.get(key(source), null);
    const enabled = () => !closed && store.get('module:universe', true);
    const config = () => { const value=store.get(key('config'), {}); return { version:1, combat_enabled:value.combat_enabled===true, combat_window_minutes:value.combat_window_minutes ?? 60 }; };
    const isConnectionSource = source => source === 'thera' || source === 'turnur';
    function scheduleExpiry() {
        if (expiryTimer !== null) { clearExpiryTimer(expiryTimer); expiryTimer = null; }
        if (closed || !expiryStarted) return;
        const deadlines = ['thera','turnur'].flatMap(source => (cached(source)?.data || []).map(row => Date.parse(row.expires_at))).filter(Number.isFinite);
        if (!deadlines.length) return;
        expiryTimer = setExpiryTimer(() => { expiryTimer = null; if (pruneExpired().length) changed(); }, Math.max(1, Math.min(2147483647, Math.min(...deadlines) - now())));
        expiryTimer?.unref?.();
    }
    function save(source, value) {
        if (!isConnectionSource(source)) { store.set(key(source), value); return; }
        const previous = cached(source)?.data || [], data = (value.data || []).filter(row => Date.parse(row.expires_at) > now());
        store.set(key(source), {...value, data});
        const retained = new Set(data.map(row => row.id)), removed = previous.filter(row => !retained.has(row.id));
        if (removed.length) onForgetConnections(removed);
        scheduleExpiry();
    }
    function pruneExpired() {
        const removed = [];
        for (const source of ['thera','turnur']) {
            const value = cached(source);
            if (!value?.data) continue;
            const expired = value.data.filter(row => !(Date.parse(row.expires_at) > now()));
            if (expired.length) { removed.push(...expired); save(source, value); }
        }
        scheduleExpiry(); return removed;
    }
    function changed() { if (!closed) onChange(); }
    function saveConfig(input) {
        if (typeof input?.combat_enabled !== 'boolean') throw new Error('Choose whether to enable public combat reports.');
        const minutes = input.combat_window_minutes ?? config().combat_window_minutes;
        if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) throw new Error('Choose a public combat window from 5 to 120 minutes.');
        save('config', { combat_enabled: input.combat_enabled, combat_window_minutes:minutes });
        if (!input.combat_enabled) for (const controller of controllers) if (controller.source === 'combat') controller.abort();
        changed(); return config();
    }
    function saveStorms(input) {
        const rows = normalizeManualStorms(input, atlas, now());
        save('manual-storms', rows); changed(); return state();
    }
    function importData(input) {
        if (input?.kind && input.kind !== 'storms') throw new Error('Only storm observations can be imported into public feeds.');
        return saveStorms(Array.isArray(input) ? input : input?.items || input?.storms);
    }
    /** Bounded credential-free provider transport: fixed endpoints, redirects
     * rejected, 12s deadline and 2 MiB response cap. Revalidation retains prior data;
     * cache lifetime uses provider max-age minus Age, floored by this source's TTL
     * and capped at one day. */
    async function request(url, source, previous) {
        // No user-controlled host, route, redirects or credentials reach external providers.
        if (!Object.values(FEED_URLS).includes(url) && !/^https:\/\/r2z2\.zkillboard\.com\/ephemeral\/[1-9][0-9]{0,14}\.json$/.test(url))
            throw new Error('Unsupported public feed URL.');
        const controller = new AbortController(); controller.source = source; controllers.add(controller);
        const timer = setTimeout(() => controller.abort(), 12000); timer.unref?.();
        try {
            const headers = { Accept: 'application/json', 'User-Agent': 'Kairo/0.8 (https://github.com/BunBajiro/kairo)' };
            if (previous?.etag) headers['If-None-Match'] = previous.etag;
            const response = await fetcher(url, { headers, redirect: 'error', signal: controller.signal });
            if (!response.ok && response.status !== 304) {
                const raw = response.headers.get('retry-after'), duration = raw && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw || '') - now();
                throw Object.assign(new Error('Public provider request failed (' + response.status + ').'), {
                    status: response.status, retryAt: ISO(now() + Math.max(6000, Number.isFinite(duration) ? duration : response.status === 429 ? 60000 : 30000)),
                });
            }
            const maximum = 2 * 1024 * 1024;
            if (Number(response.headers.get('content-length')) > maximum) throw new Error('Public feed response exceeded the size limit.');
            let body = '';
            if (response.status !== 304) {
                if (!response.body?.getReader) throw new Error('The public feed response could not be read.');
                const reader = response.body.getReader(); let bytes = 0; const chunks = [];
                try {
                    while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength;
                        if (bytes > maximum) { await reader.cancel(); throw new Error('Public feed response exceeded the size limit.'); } chunks.push(Buffer.from(value)); }
                } finally { reader.releaseLock(); }
                body = Buffer.concat(chunks).toString('utf8');
            }
            const maxAge = response.headers.get('cache-control')?.match(/(?:^|,)\s*max-age=(\d+)/i);
            const age = Math.max(0, Number(response.headers.get('age')) || 0);
            const ttl = Math.max(PROVIDERS[source].ttl, maxAge ? Math.max(1, Number(maxAge[1]) - age) * 1000 : 0);
            return { data: response.status === 304 ? previous?.data : JSON.parse(body), status: response.status,
                etag: response.headers.get('etag') || (response.status === 304 ? previous?.etag : null) || null, expires_at: ISO(now() + Math.min(DAY, ttl)),
                scout_last_interaction: response.headers.get('x-last-signaleer-hub-interaction') || null };
        } finally { clearTimeout(timer); controllers.delete(controller); }
    }
    function fail(source, error, previous) {
        if (closed || error?.name === 'AbortError' && source === 'combat' && !config().combat_enabled) return;
        const failures = Math.min(10, (previous?.failures || 0) + 1);
        save(source, { ...previous, status: previous?.data != null ? 'stale' : 'unavailable', error: error?.name === 'AbortError' ? 'The public provider timed out.' : String(error.message || 'Public provider unavailable.').slice(0, 200),
            failures, retry_at: error.retryAt || ISO(now() + Math.min(3600000, 30000 * 2 ** (failures - 1))) });
    }
    async function refreshSource(source) {
        if (!enabled() || source === 'combat' && !config().combat_enabled) return;
        if (flights.has(source)) return flights.get(source);
        const previous = cached(source), time = now();
        // Explicit refresh respects provider freshness and all backoff windows.
        if (Date.parse(previous?.retry_at) > time || Date.parse(source === 'combat' ? previous?.next_at || previous?.expires_at : previous?.expires_at) > time && previous?.status === 'ready') return;
        const job = (async () => {
            try {
                if (source === 'combat') return await pollCombat(previous);
                const result = await request(FEED_URLS[source], source, previous);
                const data = result.status === 304 ? previous?.data : source === 'storms' ? normalizeObservations(result.data, atlas, now()) :
                    source === 'wormhole_types' ? normalizeWormholeTypes(result.data) : normalizeConnections(result.data, source, atlas, now());
                if (data == null) throw new Error('Provider returned an empty cache response.');
                if (!enabled()) return;
                save(source, { ...result, data, status: 'ready', updated_at: ISO(now()), retry_at: null, error: null, failures: 0 });
            } catch (error) { fail(source, error, source === 'combat' ? cached(source) || previous : previous); }
            finally { changed(); }
        })().finally(() => flights.delete(source));
        flights.set(source, job); return job;
    }
    async function pollCombat(previous) {
        let cursor = store.get(key('combat-cursor'), null), gap = previous?.gap || false;
        if (!cursor || now() - cursor.updated > 23 * 3600000) {
            const pointer = await request(FEED_URLS.combat, 'combat');
            if (!Number.isSafeInteger(pointer.data?.sequence) || pointer.data.sequence <= 0) throw new Error('The combat feed returned an invalid sequence.');
            gap = !!cursor; cursor = { sequence: pointer.data.sequence, updated: now() };
        }
        let events = Array.isArray(previous?.data) ? previous.data : [], atEnd = false;
        // At most eight serial requests per scheduler pass, under ten per second.
        for (let step = 0; step < 8 && enabled() && config().combat_enabled; step++) {
            if (step) {
                await new Promise(resolve => setTimeout(resolve, 110));
                if (!enabled() || !config().combat_enabled) return;
            }
            let result;
            try { result = await request('https://r2z2.zkillboard.com/ephemeral/' + cursor.sequence + '.json', 'combat'); }
            catch (error) { if (error.status === 404) { atEnd = true; break; } throw error; }
            if (result.data?.sequence_id != null && Number(result.data.sequence_id) !== cursor.sequence) throw new Error('The combat feed sequence did not match its response.');
            if (!result.data?.esi?.victim || !Number.isSafeInteger(result.data.killmail_id || result.data.esi.killmail_id) || !Number.isFinite(Date.parse(result.data.esi.killmail_time)))
                throw new Error('The combat feed returned an invalid killmail.');
            const event = normalizeKill(result.data, atlas, now());
            if (event) events = [event, ...events.filter(row => row.killmail_id !== event.killmail_id)];
            events = events.filter(row => Date.parse(row.time) >= now() - RETENTION).sort((a, b) => b.time.localeCompare(a.time)).slice(0, MAX_KILLS);
            cursor = { sequence: cursor.sequence + 1, updated: now() };
            // Persist each successful step; an interruption never skips that step.
            if (!enabled() || !config().combat_enabled) return;
            save('combat-cursor', cursor);
            save('combat', { data: events, status: 'ready', updated_at: ISO(now()), expires_at: ISO(now() + 15000), gap, cursor: cursor.sequence });
        }
        if (!enabled() || !config().combat_enabled) return;
        save('combat-cursor', cursor);
        save('combat', { data: events, status: 'ready', updated_at: ISO(now()), expires_at: ISO(now() + 15000), next_at: ISO(now() + (atEnd ? 6000 : 1000)),
            gap, cursor: cursor.sequence, error: null, retry_at: atEnd ? ISO(now() + 6000) : null,
            notice: PROVIDERS.combat.notice + (gap ? ' Collection resumed at the current feed after a gap; missed records are not reconstructed.' : '') });
    }
    function observeNpc() {
        if (!enabled()) return;
        const current = npcSample(store.snapshot(0, 'kills'));
        if (!current || Date.parse(current.at) > now() + 1000) return;
        const record = store.get(key('npc-windows'), null);
        if (!record?.current) { save('npc-windows', { previous: null, current }); return; }
        if (record.current.identity === current.identity || Date.parse(record.current.at) >= Date.parse(current.at)) return;
        save('npc-windows', { previous: record.current, current });
    }
    /** Project cached evidence without fetching. Prune canonical public links
     * first and notify dependent route owners; stale observations may display but
     * retain stale status. Nominal type mass is never remaining wormhole mass. */
    function state(_characterId = 0) {
        pruneExpired();
        const time = now(), on = enabled();
        const raw = Object.fromEntries(Object.keys(FEED_URLS).map(source => [source, cached(source)]));
        const campaigns = store.snapshot(0, 'sovereignty_campaigns'), sovereignty = store.snapshot(0, 'sovereignty'), kills = store.snapshot(0, 'kills');
        const sources = Object.fromEntries(Object.keys(PROVIDERS).map(source => [source, metadata(on ? source === 'campaigns' ? campaigns : source === 'development' ? sovereignty : source === 'npc_deltas' ? kills : raw[source] : { status: 'disabled' }, source, time)]));
        const typeMap = new Map((raw.wormhole_types?.data || []).map(row => [row.identifier, row]));
        const connections = on ? ['thera', 'turnur'].flatMap(source => (raw[source]?.data || []).filter(row => Date.parse(row.expires_at) > time)
            .map(row => { const type = typeMap.get(row.wh_type); return { ...row, stale: sources[source].status !== 'ready',
                remaining_hours: Math.max(0, (Date.parse(row.expires_at) - time) / 3600000),
                life: Date.parse(row.expires_at) - time < 4 * 3600000 ? 'near_expiry' : 'reported',
                remaining_mass_kg: null, mass_status: 'unknown', type_status: type ? sources.wormhole_types.status : 'unavailable',
                max_jump_mass_kg: type?.max_jump_mass_kg ?? null, max_stable_mass_kg: type?.max_stable_mass_kg ?? null,
                nominal_lifetime_minutes: type?.nominal_lifetime_minutes ?? null, mass_regeneration_kg: type?.mass_regeneration_kg ?? null,
            }; })) : [];
        const observations = raw.storms?.data || { storms: [], points: [] };
        const manual = store.get(key('manual-storms'), []);
        const storms = on ? [...observations.storms, ...manual].map(row => ({ ...row, age_hours: Math.max(0, (time - Date.parse(row.observed_at)) / 3600000),
            stale: row.source === 'manual' ? Date.parse(row.expires_at) <= time : sources.storms.status !== 'ready' || time - Date.parse(row.observed_at) > DAY })) : [];
        const combat = on && config().combat_enabled ? (raw.combat?.data || []).filter(row => Date.parse(row.time) >= time - config().combat_window_minutes * 60000) : [];
        if (!config().combat_enabled) sources.combat = { ...sources.combat, status: 'disabled', notice: 'Enable public combat reports to collect the zKillboard feed. Personal session collection is unchanged.' };
        const campaignRows = on && usable(campaigns) ? normalizeCampaigns(campaigns.data, atlas, time) : [];
        const development = on && usable(sovereignty) ? normalizeDevelopment(sovereignty.data, atlas) : [];
        const windows = store.get(key('npc-windows'), null);
        const deltas = on && usable(kills) ? npcDeltas(windows?.previous, windows?.current, atlas) : [];
        if (on && !windows?.previous && sources.npc_deltas.status === 'ready') sources.npc_deltas = { ...sources.npc_deltas, status: 'waiting', notice: 'Waiting for two distinct NPC activity snapshots. ' + PROVIDERS.npc_deltas.notice };
        const pointRows = on ? [...(points.items || []).filter(row => known.has(row.system_id)), ...observations.points.map(row => ({ ...row, stale: sources.storms.status !== 'ready' || time - Date.parse(row.observed_at) > DAY }))] : [];
        sources.points = { ...sources.points, status: on ? 'ready' : 'disabled', updated_at: null, expires_at: null, revision: points.metadata?.revision || null };
        sources.wormhole_types.count = on ? typeMap.size : 0;
        for (const [source, rows] of Object.entries({ thera: connections.filter(r => r.source === 'thera'), turnur: connections.filter(r => r.source === 'turnur'), storms, combat, campaigns: campaignRows, development, npc_deltas: deltas, points: pointRows })) sources[source].count = rows.length;
        return { generated_at: ISO(time), config: config(), sources, connections, storms, campaigns: campaignRows, development, combat, npc_deltas: deltas, points: pointRows };
    }
    async function upkeep(source) {
        observeNpc();
        await Promise.all((source ? Object.hasOwn(FEED_URLS, source) ? [source] : [] : Object.keys(FEED_URLS)).map(name => refreshSource(name)));
    }
    async function refresh(input = {}) {
        const source = typeof input === 'string' ? input : input.source;
        if (source && !Object.hasOwn(PROVIDERS, source)) throw new Error('Choose a known public source.');
        if (!enabled()) return state();
        await upkeep(source);
        return state();
    }
    async function tick() {
        if (closed) return;
        pruneExpired();
        if (noSync || !enabled()) return;
        await upkeep();
        // Collection can span a connection deadline; maintenance needs that prune,
        // but only explicit readers need the full feed projection.
        if (!closed) pruneExpired();
    }
    function close() { closed = true; if (expiryTimer !== null) clearExpiryTimer(expiryTimer); expiryTimer = null; for (const controller of controllers) controller.abort(); controllers.clear(); return Promise.allSettled([...flights.values()]); }
    function startExpiry() { if (!closed) { expiryStarted = true; scheduleExpiry(); } }
    scheduleExpiry();
    return { state, refresh, tick, close, startExpiry, config, saveConfig, saveStorms, import: importData, importData, observeNpc, pruneExpired };
}
