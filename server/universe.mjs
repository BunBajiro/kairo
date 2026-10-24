/**
 * Core-owned composition root for Atlas data, private Maps and operational tools.
 * Public snapshots belong to owner 0; saved links/views/pins belong to a pilot,
 * and wormholes additionally belong to one map. No lifetime visit scan belongs
 * on these read or planning paths. See docs/ARCHITECTURE.md and docs/UNIVERSE.md.
 */
import { randomUUID } from 'node:crypto';
import { factionWarfareContext } from './universe-faction-warfare.mjs';
import { discoveredSystemIds } from './discovery.mjs';
import { getUniverseStatic, getUniverseSystem } from './universe-static.mjs';
import { createRoutePlanner, createJumpPlanner } from './universe-routing.mjs';
import { createUniversePolitics } from './universe-politics.mjs';
import { createUniverseOperations } from './universe-operations.mjs';
import { createUniverseFeeds } from './universe-feeds.mjs';
import { createUniverseNavigation } from './universe-navigation.mjs';
import { createUniverseJSpace } from './universe-jspace.mjs';
import { findNearestDestinations } from './universe-destinations.mjs';
import { parseAnsiblexImport, exportAnsiblexSMT } from './universe-ansiblex.mjs';
import { observedLife } from '../components/kairo/jspace-connection-model.mjs';
import { jspaceScopeOptions } from './universe-jspace-scopes.mjs';
import { createUniverseOwnerSearch } from './universe-owner-search.mjs';

const PUBLIC_SOURCES = ['sovereignty', 'kills', 'jumps', 'fw', 'incursions', 'industry_systems', 'sovereignty_structures', 'sovereignty_campaigns'];
const PRIVATE_SOURCES = ['profile', 'location', 'contacts', 'corporation_contacts', 'alliance_contacts', 'calendar', 'mining'];
const CONTACT_SOURCES = [['contacts', 'personal'], ['corporation_contacts', 'corporation'], ['alliance_contacts', 'alliance']];
const ROUTE_PUBLIC_SOURCES = ['sovereignty', 'kills'], ROUTE_PRIVATE_SOURCES = ['profile', ...CONTACT_SOURCES.map(([key]) => key)];
const ROUTE_SOURCES = new Set([...ROUTE_PUBLIC_SOURCES, ...ROUTE_PRIVATE_SOURCES]);
const routeSourceQuery = `SELECT character_id,key,
    CASE WHEN key IN ('sovereignty','kills','profile','contacts','corporation_contacts','alliance_contacts') THEN body END raw,
    ${['status','stale','updatedAt','expiresAt','refreshAt','retryAt','error','scope','truncated'].map(key => `json_extract(body,'$.${key}') ${key}`).join(',')},
    CASE WHEN json_type(body,'$.data')='array' THEN json_array_length(body,'$.data')
        WHEN json_type(body,'$.data') IS NULL OR json_type(body,'$.data') IN ('null','false') OR json_extract(body,'$.data')=0 OR json_extract(body,'$.data')='' THEN 0 ELSE 1 END dataCount
    FROM snapshots WHERE (character_id=0 AND key IN (SELECT value FROM json_each(?))) OR (character_id=? AND key IN (SELECT value FROM json_each(?)))`;
const HOURS = new Set([1, 4, 4.5, 16, 24, 48, 12, 8, 0]);
const STRUCTURE_SCOPE = 'esi-universe.read_structures.v1';
const text = (value, max = 160) => String(value ?? '').trim().slice(0, max);
const validId = value => Number.isSafeInteger(value) && value > 0;
const array = value => Array.isArray(value) ? value : [];
const parse = value => { try { return JSON.parse(value); } catch { return null; } };
const eveDate = value => {
    const raw = String(value).trim(), zoned = /(?:Z|[+-]\d\d:\d\d)$/i.test(raw) ? raw : raw + 'Z';
    const date = Date.parse(zoned);
    if (!Number.isFinite(date)) throw new Error('Choose a valid event date in EVE time (UTC).');
    return new Date(date).toISOString();
};

/**
 * Project snapshot freshness at an epoch-millisecond clock without changing it.
 * A ready sample with missing dates, an update over one second in the future,
 * elapsed expiry or truncation is stale. Missing snapshot/status defaults to
 * waiting; a missing data body alone does not change status. Count describes
 * retained data, not usable evidence.
 */
export function sourceMetadata(snapshot, now = Date.now()) {
    const updated = Date.parse(snapshot?.updatedAt), expires = Date.parse(snapshot?.expiresAt);
    const stale = snapshot?.status === 'stale' || snapshot?.stale === true || snapshot?.status === 'ready' &&
        (!Number.isFinite(updated) || updated > now + 1000 || !Number.isFinite(expires) || expires <= now || snapshot.truncated === true);
    return { status: stale ? 'stale' : snapshot?.status || 'waiting', stale, updatedAt: snapshot?.updatedAt || null,
        expiresAt: snapshot?.expiresAt || null, refreshAt: snapshot?.refreshAt || null, retryAt: snapshot?.retryAt || null,
        error: snapshot?.error || null, scope: snapshot?.scope || null, truncated: snapshot?.truncated === true,
        count: Array.isArray(snapshot?.data) ? snapshot.data.length : snapshot?.data ? 1 : 0 };
}

/** Display standings use only current evidence and keep missing evidence separate from a known zero. */
export function standingForAlliance(allianceId, snapshots, now = Date.now()) {
    const unknown = reason => ({ value: null, label: 'unknown', source: null, status: 'unavailable', reason });
    if (!validId(allianceId)) return unknown('No alliance sovereignty holder.');
    const fresh = key => sourceMetadata(snapshots[key], now).status === 'ready';
    const profile = snapshots.profile;
    if (fresh('profile') && profile?.data?.alliance_id === allianceId)
        return { value: 10, label: 'excellent', source: 'own_alliance', status: 'ready', reason: 'Your own alliance.' };
    let readable = 0;
    for (const [key, source] of CONTACT_SOURCES) {
        const sample = snapshots[key], ownerKey = key === 'corporation_contacts' ? 'corporation_id' : 'alliance_id';
        if (['missing_scope', 'disabled', 'not_applicable', 'disconnected'].includes(sample?.status)) continue;
        if (!fresh(key) || !Array.isArray(sample?.data))
            return unknown('Waiting for current ' + source + ' contacts.');
        if (key !== 'contacts' && (!fresh('profile') || !profile?.data?.[ownerKey] || sample.ownerId !== profile.data[ownerKey]))
            return unknown('Contact membership needs to be refreshed.');
        readable++;
        const match = sample.data.find(contact => contact.contact_type === 'alliance' && contact.contact_id === allianceId && Number.isFinite(contact.standing));
        if (match) {
            const value = match.standing;
            return { value, label: value >= 10 ? 'excellent' : value > 0 ? 'good' : value <= -10 ? 'terrible' : value < 0 ? 'bad' : 'neutral',
                source, status: 'ready', reason: source + ' contacts.' };
        }
    }
    return readable ? { value: 0, label: 'neutral', source: 'none', status: 'ready', reason: 'No standing in the available contact lists.' } : unknown('Connect contact scopes to show pilot standings.');
}

/**
 * Create the Universe owner around shared Store/Auth/ESI dependencies.
 * Construction creates/migrates domain tables and reconciles expired links before
 * arming expiry timers. Core drives tick(); close() stops producers and drains
 * owned async work before the caller closes ESI or Store. now() returns epoch ms;
 * noSync suppresses scheduled collection, not canonical expiry maintenance.
 *
 * Methods validate pilot ownership (0 permits supported guest reads/manual data),
 * throw on invalid commands, and expose private dashboard DTOs, not broadcast
 * projections. State/detail/export reads can reconcile expiry or calendar pins.
 * Sessions own movement records; discovery owns visited-system membership.
 */
export function createUniverse(store, auth, esi, options = {}) {
    const now = options.now || Date.now;
    const atlas = options.staticData || getUniverseStatic();
    const politicsService = createUniversePolitics(store, auth, { now, atlas });
    const ownerSearch = createUniverseOwnerSearch(store, auth, esi, {now});
    const byId = atlas.bySystemId || new Map(atlas.systems.map(system => [system.system_id, system]));
    const byName = atlas.bySystemName || new Map(atlas.systems.map(system => [system.name.toLowerCase(), system]));
    const neighbors = atlas.neighbors || new Map();
    if (!atlas.neighbors) for (const edge of atlas.gates) {
        if (!neighbors.has(edge.from_system_id)) neighbors.set(edge.from_system_id, new Set());
        if (!neighbors.has(edge.to_system_id)) neighbors.set(edge.to_system_id, new Set());
        neighbors.get(edge.from_system_id).add(edge.to_system_id); neighbors.get(edge.to_system_id).add(edge.from_system_id);
    }
    const operations = createUniverseOperations(store, auth, esi, {...options.operations, atlas, now, noSync: options.noSync,
        publish: options.publish, onChange: options.onChange, onLocation: id => observeSelectedLocation(id)});
    let navigation;
    const feeds = createUniverseFeeds(store, esi, {...options.feeds, atlas, now, noSync: options.noSync, deferExpiry: true,
        onChange: () => options.onChange?.(0), onForgetConnections: rows => navigation?.forgetConnections(null, rows.map(row => row.id))});
    navigation = createUniverseNavigation(store, auth, esi, {...options.navigation, atlas, now,
        planRoute: (id, input) => route(id, input, true), planJump: jump,
        preparePlan: (id, input) => prepareRoutePlan(pilotId(id), input, true, true),
        getMap: (id, key) => record(id, 'jspace_map', key),
        isConnectionCurrent: (id, key, mapId) => {
            const link = record(id, 'link', key);
            return link?.kind === 'wormhole' && link.map_id === mapId && !expiredLink(link) || ['thera','turnur'].some(source =>
                (store.get('universe:feeds:' + source, null)?.data || []).some(row => row.id === key && Date.parse(row.expires_at) > now()));
        },
        getRouteSystems: id => routeContext(id, {}).systems,
        getOperations: id => operations.state(id), getFeeds: () => feeds.state(), publish: options.publish,
        onChange: options.onChange});
    store.db.exec(`CREATE TABLE IF NOT EXISTS universe_records(
        character_id INTEGER NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,
        PRIMARY KEY(character_id,kind,id));
        CREATE INDEX IF NOT EXISTS idx_universe_records_character_kind ON universe_records(character_id,kind,updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_universe_links_scope ON universe_records(character_id,COALESCE(json_extract(body,'$.map_id'),''),updated_at DESC,id) WHERE kind='link';
        CREATE INDEX IF NOT EXISTS idx_universe_wormholes_expiry ON universe_records(julianday(json_extract(body,'$.expires_at')),character_id) WHERE kind='link' AND json_extract(body,'$.kind')='wormhole' AND julianday(json_extract(body,'$.expires_at')) IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_universe_wormholes_pilot_expiry ON universe_records(character_id,julianday(json_extract(body,'$.expires_at'))) WHERE kind='link' AND json_extract(body,'$.kind')='wormhole';
        CREATE INDEX IF NOT EXISTS idx_universe_wormholes_collapsed ON universe_records(character_id) WHERE kind='link' AND json_extract(body,'$.kind')='wormhole' AND json_extract(body,'$.life_status')='collapsed';`);
    const select = store.db.prepare('SELECT body FROM universe_records WHERE character_id=? AND kind=? ORDER BY updated_at DESC,id');
    const get = store.db.prepare('SELECT body FROM universe_records WHERE character_id=? AND kind=? AND id=?');
    const put = store.db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?) ON CONFLICT(character_id,kind,id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at');
    const remove = store.db.prepare('DELETE FROM universe_records WHERE character_id=? AND kind=? AND id=?');
    const nextWormholeExpiry = store.db.prepare("SELECT json_extract(body,'$.expires_at') expires_at FROM universe_records WHERE kind='link' AND json_extract(body,'$.kind')='wormhole' AND julianday(json_extract(body,'$.expires_at')) IS NOT NULL ORDER BY julianday(json_extract(body,'$.expires_at')) LIMIT 1");
    // Separate collapsed links from dated expiry so a no-op read seeks indexes
    // instead of decoding every live link. SQLite maintains these indexes even
    // for imports/direct canonical writes; no cross-request expiry cache is used.
    const expiredWormholes = store.db.prepare("SELECT character_id,body FROM universe_records INDEXED BY idx_universe_wormholes_collapsed WHERE kind='link' AND json_extract(body,'$.kind')='wormhole' AND json_extract(body,'$.life_status')='collapsed' UNION ALL SELECT character_id,body FROM universe_records WHERE kind='link' AND json_extract(body,'$.kind')='wormhole' AND julianday(json_extract(body,'$.expires_at'))<=julianday(?) AND json_extract(body,'$.life_status') IS NOT 'collapsed'");
    const expiredPilotWormholes = store.db.prepare("SELECT character_id,body FROM universe_records INDEXED BY idx_universe_wormholes_collapsed WHERE character_id=? AND kind='link' AND json_extract(body,'$.kind')='wormhole' AND json_extract(body,'$.life_status')='collapsed' UNION ALL SELECT character_id,body FROM universe_records WHERE character_id=? AND kind='link' AND json_extract(body,'$.kind')='wormhole' AND julianday(json_extract(body,'$.expires_at'))<=julianday(?) AND json_extract(body,'$.life_status') IS NOT 'collapsed'");
    const scopedLinks = store.db.prepare("SELECT body FROM (SELECT body,updated_at,id FROM universe_records WHERE character_id=? AND kind='link' AND COALESCE(json_extract(body,'$.map_id'),'')='' UNION ALL SELECT body,updated_at,id FROM universe_records WHERE character_id=? AND kind='link' AND COALESCE(json_extract(body,'$.map_id'),'')=?) ORDER BY updated_at DESC,id");
    const getSignature = store.db.prepare('SELECT body FROM universe_operations_records WHERE character_id=? AND kind=? AND id=?');
    const signatureKind = mapId => mapId ? 'signature:map:' + mapId : 'signature';
    const iso = () => new Date(now()).toISOString();
    let expiryTimer = null, scheduledExpiryAt = null, lifecycleClosed = false, lifecycleReady = false, sweeping = false, closing;
    const setExpiryTimer = options.lifecycle?.setTimeout || setTimeout, clearExpiryTimer = options.lifecycle?.clearTimeout || clearTimeout;
    const jspace = createUniverseJSpace(store, auth, { atlas, now, operations, getLinks: links, readLinks: linkReadContext, saveLink:(id,input)=>saveLink(id,input,true), deleteLink:(id,key)=>deleteLink(id,key,true),
        validateLink: (id, input, scopeMap = null) => normalizeLink(id, input, null, undefined, scopeMap), getScopeContext, onChange: options.onChange });
    function pilotId(value) {
        const id = Number(value ?? 0);
        if (!Number.isSafeInteger(id) || id < 0 || id && !auth.characters().some(character => character.id === id)) throw new Error('Choose a connected pilot.');
        return id;
    }
    function getScopeContext(characterId) {
        pilotId(characterId);
        const sample = store.get('module:universe', true) ? store.snapshot(0, 'sovereignty') : null;
        const sovereigntyReady = sourceMetadata(sample, now()).status === 'ready' && sample?.truncated !== true && Array.isArray(sample?.data);
        const sovereignty = sovereigntyReady ? sample.data : [];
        return {atlas, sovereigntyReady, sovereignty, sovereigntyBySystemId:new Map(sovereignty.map(row => [row.system_id ?? row.solar_system_id, row])), politicsConfig:politicsService.config()};
    }
    function scopeOptions(characterId) { return jspaceScopeOptions({...getScopeContext(characterId),names:store.get('names', {})}); }
    function records(id, kind) { return select.all(id, kind).map(row => parse(row.body)).filter(Boolean); }
    function record(id, kind, key) { return parse(get.get(id, kind, String(key))?.body); }
    function persist(id, kind, value) { put.run(id, kind, String(value.id), JSON.stringify(value), value.updated_at || iso()); if (kind === 'link') scheduleExpiry(); return value; }
    const expiredLink = link => link.kind === 'wormhole' && (link.life_status === 'collapsed' || Number.isFinite(Date.parse(link.expires_at)) && Date.parse(link.expires_at) <= now());
    function scheduleExpiry() {
        if (lifecycleClosed || !lifecycleReady) return;
        const expiry = Date.parse(nextWormholeExpiry.get()?.expires_at);
        if (expiryTimer !== null && expiry === scheduledExpiryAt) return;
        if (expiryTimer !== null) { clearExpiryTimer(expiryTimer); expiryTimer = null; }
        scheduledExpiryAt = null;
        if (!Number.isFinite(expiry)) return;
        scheduledExpiryAt = expiry;
        expiryTimer = setExpiryTimer(() => { expiryTimer = null; scheduledExpiryAt = null; cleanupExpired(); }, Math.max(1, Math.min(2147483647, expiry - now())));
        expiryTimer?.unref?.();
    }
    /** Remove canonical links and dependent signature bindings/map/route copies
     * in one savepoint. System annotations survive; only exact bound signature
     * UUIDs are owned by the removed link, not a later reused scanner code. */
    function forgetLinks(id, removedLinks) {
        if (!removedLinks.length) return;
        store.db.exec('SAVEPOINT universe_forget_links');
        try {
            for (const link of removedLinks) {
                remove.run(id, 'link', link.id);
                forgetBoundSignatures(id, link);
            }
            jspace.forgetConnections(id, removedLinks);
            navigation.forgetConnections(id, removedLinks.map(row => row.id));
            store.db.exec('RELEASE universe_forget_links');
        } catch (error) { store.db.exec('ROLLBACK TO universe_forget_links; RELEASE universe_forget_links'); throw error; }
        options.onChange?.(id); scheduleExpiry();
    }
    function forgetBoundSignatures(id, link) {
        if (link.kind !== 'wormhole') return;
        // Only exact bound UUIDs belong to this connection. A new observation
        // reusing a three-letter signature code is a different record.
        const kind = signatureKind(link.map_id), deletedKind = link.map_id ? 'signature_deleted:map:' + link.map_id : 'signature_deleted';
        const removeSignature = store.db.prepare('DELETE FROM universe_operations_records WHERE character_id=? AND kind IN (?,?) AND id=?');
        for (const side of ['from','to']) {
            const signatureId = link[side + '_signature_record_id'];
            if (!signatureId) continue;
            const current = parse(getSignature.get(id, kind, signatureId)?.body);
            const deleted = parse(getSignature.get(id, deletedKind, signatureId)?.body)?.signature;
            if ((current || deleted)?.system_id === link[side + '_system_id']) removeSignature.run(id, kind, deletedKind, signatureId);
        }
    }
    function cleanupExpired(characterId = null) {
        if (sweeping || lifecycleClosed) return { deleted: 0 };
        sweeping = true;
        let deleted = 0;
        try {
            const rows = characterId == null ? expiredWormholes.all(iso()) : expiredPilotWormholes.all(characterId, characterId, iso());
            const groups = new Map();
            for (const row of rows) {
                const link = parse(row.body);
                if (!link || !expiredLink(link)) continue;
                if (!groups.has(row.character_id)) groups.set(row.character_id, []);
                groups.get(row.character_id).push({...link, ended_at: link.life_status === 'collapsed' ? link.updated_at || iso() : link.expires_at});
            }
            for (const [id, links] of groups) { forgetLinks(id, links); deleted += links.length; }
        } finally { sweeping = false; scheduleExpiry(); }
        return { deleted };
    }
    function deleteLink(characterId, key, internal = false) {
        const id = pilotId(characterId), link = record(id, 'link', key);
        if (!link) throw new Error('Saved link not found for this pilot.');
        if (!internal && link.map_id && record(id, 'jspace_map', link.map_id)?.kind === 'tracking_source') throw new Error('Tracking source connections are read-only.');
        forgetLinks(id, [{...link, ended_at: expiredLink(link) && link.life_status !== 'collapsed' ? link.expires_at : iso()}]);
        return { id: String(key), deleted: true };
    }
    function saved(id, kind, input) {
        if (input.id != null && !record(id, kind, input.id)) throw new Error('Saved ' + kind + ' not found for this pilot.');
        return input.id == null ? null : record(id, kind, input.id);
    }
    function systemId(value) {
        const system = byId.get(Number(value)) || byName.get(text(value).toLowerCase());
        if (!system) throw new Error('Choose a system in the bundled universe map: ' + text(value, 80));
        return system.system_id;
    }
    function snapshots(id) {
        const output = {};
        for (const key of PUBLIC_SOURCES) output[key] = store.get('module:universe', true) ? store.snapshot(0, key) : { status: 'disabled', data: null };
        const modules = { profile: 'pilot', location: 'pilot', calendar: 'comms', mining: 'industry' };
        const character = auth.characters().find(c => c.id === id);
        for (const key of PRIVATE_SOURCES) output[key] = !character || character.needsReauth ? { status: character?.needsReauth ? 'reauth_required' : 'disconnected', data: null } :
            !store.get('module:' + (modules[key] || 'opsec'), true) ? { status: 'disabled', data: null } : store.snapshot(id, key);
        return output;
    }
    const snapshotRows = sample => ['ready', 'stale'].includes(sample?.status) ? array(sample.data) : [];
    function sourceRows(samples, key) { return snapshotRows(samples[key]); }
    function liveContext(id) {
        const currentTime = now(), samples = snapshots(id), sources = Object.fromEntries(Object.entries(samples).map(([key, value]) => [key, sourceMetadata(value, currentTime)]));
        const names = store.get('names', {}), owners = new Map(), kills = new Map(), jumps = new Map(), fw = new Map(), incursions = new Map(), industry = new Map(), sovStructures = new Map(), mining = new Map(), standings = new Map();
        const politics = politicsService.read(names, sourceRows(samples, 'sovereignty')), resolveBloc = politicsService.resolver(politics, names), blocByAlliance = new Map();
        for (const row of sourceRows(samples, 'sovereignty')) owners.set(row.system_id || row.solar_system_id, row);
        for (const row of sourceRows(samples, 'kills')) kills.set(row.system_id, row);
        for (const row of sourceRows(samples, 'jumps')) jumps.set(row.system_id, row.ship_jumps);
        for (const [system,row] of factionWarfareContext(sourceRows(samples, 'fw'),neighbors,{fresh:sources.fw.status==='ready'})) fw.set(system,row);
        for (const row of sourceRows(samples, 'industry_systems')) industry.set(row.solar_system_id, array(row.cost_indices));
        for (const row of sourceRows(samples, 'mining')) {
            const total = mining.get(row.solar_system_id) || { quantity: 0, entries: 0, last_date: null };
            total.quantity += Number(row.quantity) || 0; total.entries++;
            if (row.date && (!total.last_date || row.date > total.last_date)) total.last_date = row.date;
            mining.set(row.solar_system_id, total);
        }
        for (const row of sourceRows(samples, 'incursions')) for (const id of array(row.infested_solar_systems)) {
            if (!incursions.has(id)) incursions.set(id, []);
            incursions.get(id).push(row);
        }
        for (const row of sourceRows(samples, 'sovereignty_structures')) {
            const system = row.solar_system_id || row.system_id;
            if (!sovStructures.has(system)) sovStructures.set(system, []);
            sovStructures.get(system).push({ ...row, source: 'sovereignty', alliance_name: names[row.alliance_id] || null });
        }
        const notes = new Map(store.db.prepare("SELECT * FROM place_notes WHERE kind='system'").all().map(row => [row.entity_id, { ...row, tags: parse(row.tags) || [] }]));
        const ids = new Set([...owners.keys(), ...kills.keys(), ...jumps.keys(), ...fw.keys(), ...industry.keys(), ...incursions.keys(), ...sovStructures.keys(), ...mining.keys(), ...notes.keys()]);
        const complete = key => ['ready', 'stale'].includes(sources[key]?.status) && !sources[key]?.truncated && Array.isArray(samples[key]?.data);
        function overlay(system) {
            if (byId.get(system)?.space === 'wormhole') return { system_id:system, sovereignty:null, standing:{value:null,label:'unknown',source:null,status:'unavailable'},
                power_bloc:null, kills:null, jumps:null, faction_warfare:null, incursions:[], industry:null, mining:null, structures:[], note:null };
            const sovereignty = owners.get(system);
            const allianceId = sovereignty?.alliance_id;
            const ownerKey = sovereignty?.alliance_id ? 'a' + sovereignty.alliance_id : sovereignty?.faction_id ? 'f' + sovereignty.faction_id : sovereignty?.corporation_id ? 'c' + sovereignty.corporation_id : null;
            const ownerPaint = ownerKey ? politics.territory_colours[ownerKey] : null;
            if (!blocByAlliance.has(allianceId)) blocByAlliance.set(allianceId, resolveBloc(allianceId));
            if (!standings.has(allianceId)) standings.set(allianceId, sources.sovereignty.status === 'ready' ? standingForAlliance(allianceId, samples, currentTime) :
                { value: null, label: 'unknown', source: null, status: 'unavailable', reason: 'Current sovereignty is unavailable.' });
            return { system_id: system,
                sovereignty: sovereignty ? { ...sovereignty, alliance_name: names[sovereignty.alliance_id] || null, corporation_name: names[sovereignty.corporation_id] || null, faction_name: names[sovereignty.faction_id] || null,
                    ...(ownerPaint ? { color: ownerPaint.fill, outline: ownerPaint.outline } : {}) } : null,
                standing: standings.get(allianceId),
                power_bloc: blocByAlliance.get(allianceId),
                kills: kills.get(system) || (complete('kills') ? { ship_kills: 0, pod_kills: 0, npc_kills: 0 } : null),
                jumps: jumps.get(system) ?? (complete('jumps') ? 0 : null), faction_warfare: fw.get(system) || null,
                incursions: incursions.get(system) || [], industry: industry.get(system) || null, mining: mining.get(system) || null,
                structures: sovStructures.get(system) || [], note: notes.get(system) || null };
        }
        return { samples, sources, ids, overlay, politics, defaults: { kills: complete('kills') ? { ship_kills: 0, pod_kills: 0, npc_kills: 0 } : null, jumps: complete('jumps') ? 0 : null } };
    }
    // Link expiry is reconciled once before reading any map documents. This context
    // lives for one synchronous read, so imports, timer expiry and edits are never cached.
    function linkReadContext(id, { mapId, operational = operations.readContext(id) } = {}) {
        cleanupExpired(id);
        const lists = new Map(records(id, 'list').map(list => [list.id, list]));
        const raw = mapId === undefined ? records(id, 'link') : scopedLinks.all(id, id, mapId || null).map(row => parse(row.body)).filter(Boolean);
        const global = [], scoped = new Map(), ranks = new Map(), signatures = new Map();
        raw.forEach((link, rank) => {
            ranks.set(link.id, rank);
            if (!link.map_id) { if (link.kind !== 'wormhole') global.push(link); }
            else {
                if (!scoped.has(link.map_id)) scoped.set(link.map_id, []);
                scoped.get(link.map_id).push(link);
            }
        });
        function forMap(key = null, resolveSignatures = true) {
            const local = scoped.get(key) || [], selected = [];
            // Preserve canonical updated_at/id order when combining global and map links.
            let a = 0, b = 0;
            while (a < global.length || b < local.length) selected.push(b >= local.length || a < global.length && ranks.get(global[a].id) < ranks.get(local[b].id) ? global[a++] : local[b++]);
            return selected.map(link => {
                const result = { ...link };
                for (const side of ['from', 'to']) {
                    const recordId = link[side + '_signature_record_id'];
                    if (!resolveSignatures || !recordId) continue;
                    const scope = link.map_id || null;
                    if (!signatures.has(scope)) signatures.set(scope, new Map(operational.signatures(scope).map(row => [row.id, row])));
                    const signature = signatures.get(scope).get(recordId);
                    if (signature?.system_id === link[side + '_system_id']) result[side + '_signature'] = signature.signature_id;
                }
                const expiry = Date.parse(link.expires_at), expired = link.kind === 'wormhole' && Number.isFinite(expiry) && expiry <= now();
                const lifetimeValid = link.kind !== 'wormhole' || Number.isFinite(expiry) && expiry > now();
                const listEnabled = !link.list_id || lists.get(link.list_id)?.enabled === true;
                return { ...result, from_name: byId.get(link.from_system_id)?.name || String(link.from_system_id), to_name: byId.get(link.to_system_id)?.name || String(link.to_system_id),
                    expired, list_enabled: listEnabled, active: link.enabled && (link.accessible || link.reverse_accessible === true) && link.confirmed && lifetimeValid && listEnabled };
            });
        }
        return { forMap };
    }
    function links(id, mapId = null) {
        const context = linkReadContext(id, { mapId });
        if (mapId && !record(id, 'jspace_map', mapId)) throw new Error('Choose a private chain map for this pilot.');
        return context.forMap(mapId);
    }
    function staticData() { return { metadata: atlas.metadata, systems: atlas.systems, regions: atlas.regions, constellations: atlas.constellations, gates: atlas.gates }; }
    function pinsFor(id, samples) {
        const events = new Map(sourceRows(samples, 'calendar').map(event => [event.event_id, event])), metadata = sourceMetadata(samples.calendar, now());
        return records(id, 'pin').map(pin => {
            if (!pin.event_id) return pin;
            const event = events.get(pin.event_id);
            if (event && Number.isFinite(Date.parse(event.event_date))) {
                const label = text(event.title, 120), event_at = eveDate(event.event_date);
                if (pin.label !== label || pin.event_at !== event_at) {
                    pin = { ...pin, label, event_at, updated_at: iso() };
                    persist(id, 'pin', pin);
                }
            }
            return { ...pin,
                source_status: metadata.status, source_stale: metadata.stale, calendar_available: !!event };
        });
    }
    function state(characterId) {
        const id = pilotId(characterId), context = liveContext(id);
        const operational = operations.state(id);
        const position = operational.location;
        const selectedLocation = { system_id: position.system_id, system_name: position.system_name, status: position.status, stale: position.status === 'stale',
            updatedAt: position.updated_at, expiresAt: position.expires_at, source: position.source };
        return { character_id: id, generated_at: iso(), location: selectedLocation, operations: operational, feeds: feeds.state(id), navigation: navigation.state(id),
            systems: [...context.ids].filter(system => byId.get(system)?.space !== 'wormhole' && byId.has(system)).map(context.overlay), sources: context.sources, defaults: context.defaults, politics: context.politics,
            links: links(id), link_lists: records(id, 'list'), pins: pinsFor(id, context.samples).filter(pin => byId.get(pin.system_id)?.space !== 'wormhole'), views: records(id, 'view').map(view => ({ ...view, config: restoredViewConfig(view.config) })),
            structures: records(id, 'structure').map(currentStructure), discoveredSystemIds: discoveredSystemIds(store, id),
            calendar: sourceRows(context.samples, 'calendar').filter(event => Date.parse(event.event_date) >= now()).map(event => ({ ...event, source: 'calendar', status: context.sources.calendar.status, stale: context.sources.calendar.stale })) };
    }
    // Retire the lifetime visit overlay without narrowing the saved-view format.
    // Toolbox and other independently owned preferences remain round-trippable.
    function restoredViewConfig(value) {
        return value?.indicator === 'visits' ? { ...value, indicator: 'none' } : value;
    }
    function validateConfig(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A saved view needs a map configuration.');
        const encoded = JSON.stringify(value);
        if (encoded.length > 30000) throw new Error('Saved view is too large.');
        return restoredViewConfig(JSON.parse(encoded));
    }
    function saveView(characterId, input = {}) {
        const id = pilotId(characterId), old = saved(id, 'view', input), name = text(input.name || old?.name, 80);
        if (!name) throw new Error('Give the map view a name.');
        return persist(id, 'view', { id: old?.id || randomUUID(), name, config: validateConfig(input.config ?? old?.config), created_at: old?.created_at || iso(), updated_at: iso() });
    }
    function deleteRecord(characterId, kind, key) {
        const id = pilotId(characterId);
        if (!remove.run(id, kind, String(key)).changes) throw new Error('Saved ' + kind + ' not found for this pilot.');
        return { id: String(key), deleted: true };
    }
    /** Normalize a partial link edit without writing. Existing map ownership and
     * observation times survive unrelated edits. A new manual wormhole defaults
     * to 16 hours; explicit null expiry means unknown and forbids confirmation or
     * access. Diagram/import callers may supply an unsaved scopeMap for validation. */
    function normalizeLink(id, input, previous = null, listId = undefined, scopeMap = null) {
        const old = previous || {}, kind = input.kind || old.kind || 'ansiblex';
        if (!['wormhole', 'ansiblex'].includes(kind)) throw new Error('Choose a wormhole or Ansiblex connection.');
        const map_id = input.map_id ?? old.map_id ?? null;
        if ((kind === 'wormhole' || map_id) && (!map_id || typeof map_id !== 'string' || scopeMap?.id !== map_id && !record(id, 'jspace_map', map_id))) throw new Error('Choose a private chain map for this wormhole.');
        if (old.map_id && map_id !== old.map_id) throw new Error('A connection belongs to its original chain map.');
        const from = systemId(input.from_system_id ?? input.from ?? old.from_system_id), to = systemId(input.to_system_id ?? input.to ?? old.to_system_id);
        if (from === to) throw new Error('A connection needs two different systems.');
        if (kind === 'ansiblex' && [from, to].some(system => byId.get(system)?.space !== 'known')) throw new Error('Ansiblex connections require two known-space systems.');
        const list_id = listId ?? input.list_id ?? old.list_id ?? null;
        if (list_id && listId === undefined && !record(id, 'list', list_id)) throw new Error('Connection list not found for this pilot.');
        if (map_id && list_id) throw new Error('Map-owned connections cannot change a configured connection list.');
        const optionalId = key => {
            const value = input[key] ?? old[key];
            if (value == null || value === '') return null;
            const parsed = Number(value);
            if (!validId(parsed)) throw new Error('Invalid ' + key.replaceAll('_', ' ') + '.');
            return key.includes('system') ? systemId(parsed) : parsed;
        };
        let expires_at = kind === 'wormhole' ? old.expires_at : null;
        const echoedDuration = input.duration_hours === old.duration_hours && Object.hasOwn(input, 'expires_at') && input.expires_at === old.expires_at;
        const durationEdited = kind === 'wormhole' && input.duration_hours != null && !echoedDuration;
        if (durationEdited) {
            // A deliberate lifetime edit takes precedence over an echoed saved timestamp.
            const duration = Number(input.duration_hours);
            if (!HOURS.has(duration)) throw new Error('Wormhole lifetime must be 1, 4, 4.5, 16, 24 or 48 hours, or expired.');
            expires_at = new Date(now() + duration * 3600000).toISOString();
        } else if (kind === 'wormhole' && Object.hasOwn(input, 'expires_at') && input.expires_at === null) {
            // A newly drawn, unverified connection has no reported lifetime. Null is an
            // intentional unknown, distinct from the existing manual-form default.
            expires_at = null;
        } else if (kind === 'wormhole' && input.expires_at != null && input.expires_at !== old.expires_at) {
            const expiry = Date.parse(input.expires_at);
            if (!Number.isFinite(expiry) || expiry <= now() || expiry > now() + 48 * 3600000) throw new Error('Reported wormhole expiry must be in the next 48 hours.');
            expires_at = new Date(expiry).toISOString();
        } else if (kind === 'wormhole' && !expires_at && !Object.hasOwn(input, 'life_band') && !(old.kind === 'wormhole' && Object.hasOwn(old, 'expires_at') && old.expires_at === null)) {
            expires_at = new Date(now() + 16 * 3600000).toISOString();
        }
        const max_ship_size = Object.hasOwn(input, 'max_ship_size') ? input.max_ship_size : old.max_ship_size ?? null;
        if (max_ship_size != null && !['small','medium','large','xlarge','capital','supercapital'].includes(max_ship_size)) throw new Error('Choose a valid maximum wormhole ship size.');
        const max_jump_mass_kg = input.max_jump_mass_kg ?? old.max_jump_mass_kg ?? null;
        if (max_jump_mass_kg != null && (!Number.isFinite(max_jump_mass_kg) || max_jump_mass_kg <= 0 || max_jump_mass_kg > 1e13)) throw new Error('Choose a valid nominal jump mass limit.');
        const type_status = input.type_status ?? old.type_status ?? 'unavailable';
        if (!['ready','stale','unavailable','waiting'].includes(type_status)) throw new Error('Choose a valid nominal type status.');
        const observed_at = input.observed_at ?? old.observed_at ?? null;
        if (observed_at != null && (!Number.isFinite(Date.parse(observed_at)) || Date.parse(observed_at) > now() + 300000)) throw new Error('Choose a valid wormhole observation time.');
        const mass = input.mass || old.mass || 'unknown';
        if (!['stable', 'reduced', 'critical', 'unknown'].includes(mass)) throw new Error('Choose a valid wormhole mass state.');
        const life = kind === 'wormhole' ? observedLife(durationEdited ? input : {...input,duration_hours:undefined}, old, now(), expires_at) : {};
        if (kind === 'wormhole') expires_at = life.expires_at;
        const life_status = life.life_status ?? input.life_status ?? old.life_status ?? 'unknown';
        const lifetimeReplaced = Object.hasOwn(input,'expires_at') && input.expires_at !== old.expires_at || Object.hasOwn(input,'life_band') && input.life_band !== old.life_band;
        const duration_hours = durationEdited ? Number(input.duration_hours) : lifetimeReplaced ? null : old.duration_hours ?? null;
        if (!['unknown', 'stable', 'eol', 'critical', 'collapsed'].includes(life_status)) throw new Error('Choose a valid wormhole life state.');
        const signatureRecord = side => {
            const key = side + '_signature_record_id', endpoint = side === 'from' ? from : to;
            if (Object.hasOwn(input, key)) {
                if (input[key] == null || input[key] === '') return null;
                if (typeof input[key] !== 'string') throw new Error('Choose a valid signature record.');
                // A deleted signature remains an unresolved historical binding. Echoing that same
                // binding must not block an unrelated mass/lifetime edit or attach a replacement row.
                if (input[key] === old[key] && endpoint === old[side + '_system_id']) return old[key];
                const signature = parse(getSignature.get(id, signatureKind(map_id), input[key])?.body);
                if (!signature || signature.system_id !== endpoint) throw new Error('The signature must belong to this pilot and connection endpoint.');
                return signature.id;
            }
            if (input[side + '_signature'] !== undefined && input[side + '_signature'] !== old[side + '_signature']) return null;
            return old[key] || null;
        };
        const boolean = (key, fallback) => {
            if (input[key] != null && typeof input[key] !== 'boolean') throw new Error(key + ' must be true or false.');
            return input[key] ?? old[key] ?? fallback;
        };
        if (kind === 'wormhole' && expires_at === null && (boolean('confirmed', true) || boolean('accessible', true) || boolean('reverse_accessible', false)))
            throw new Error('Record a wormhole expiry before confirming the connection or allowing it in routes. Unknown-lifetime connections must remain unconfirmed and inaccessible.');
        return { id: old.id || randomUUID(), kind, ...(map_id ? {map_id} : {}), from_system_id: from, to_system_id: to, list_id,
            label: text(input.label ?? old.label, 160), enabled: (kind !== 'wormhole' || life_status !== 'collapsed') && boolean('enabled', true), accessible: boolean('accessible', kind === 'wormhole'),
            confirmed: boolean('confirmed', true), directional: boolean('directional', false),
            ...(kind === 'wormhole' ? {life_status, duration_hours, life_band:life.life_band, life_observed_at:life.life_observed_at, from_signature_record_id: signatureRecord('from'), to_signature_record_id: signatureRecord('to'), max_ship_size, max_jump_mass_kg, type_status, wh_type: text(input.wh_type ?? old.wh_type,16), from_signature: text(input.from_signature ?? old.from_signature,16),
                to_signature: text(input.to_signature ?? old.to_signature,16), reported_source: text(input.reported_source ?? old.reported_source,80),
                report_id: text(input.report_id ?? old.report_id,100), observed_at: observed_at == null ? null : new Date(observed_at).toISOString()} : {}),
            reverse_accessible: input.reverse_accessible == null && old.reverse_accessible == null ? null : boolean('reverse_accessible', false), ...(kind === 'wormhole' ? {mass} : {}),
            structure_id: optionalId('structure_id'), reverse_structure_id: optionalId('reverse_structure_id'), owner_alliance_id: optionalId('owner_alliance_id'),
            capital_system_id: optionalId('capital_system_id'), reverse_owner_alliance_id: optionalId('reverse_owner_alliance_id'), reverse_capital_system_id: optionalId('reverse_capital_system_id'),
            source: old.source || (listId ? 'import' : 'manual'), discovered_at: old.discovered_at || iso(), expires_at, updated_at: iso() };
    }
    function saveLink(characterId, input = {}, internal = false) {
        const id = pilotId(characterId); cleanupExpired(id);
        const old = saved(id, 'link', input), link = normalizeLink(id, input, old);
        if (!internal && link.map_id && record(id, 'jspace_map', link.map_id)?.kind === 'tracking_source') throw new Error('Tracking source connections are read-only.');
        if (expiredLink(link)) {
            forgetLinks(id, [{...link, ended_at: link.life_status === 'collapsed' ? iso() : link.expires_at}]);
            return {...link, active:false, expired:true, deleted:true};
        }
        persist(id, 'link', link);
        return links(id, link.map_id).find(row => row.id === link.id);
    }
    function previewLinks(characterId, input) {pilotId(characterId); return parseAnsiblexImport(input, atlas.systems);}
    function exportLinks(characterId, key) {
        const id = pilotId(characterId);
        if (!record(id, 'list', key)) throw new Error('Connection list not found for this pilot.');
        return exportAnsiblexSMT(links(id).filter(link => link.list_id === key), atlas.systems);
    }
    /** Save list metadata, or atomically replace its links when text/links is
     * present. Validate the entire preview first; reciprocal endpoint identity is
     * retained so reordering an import cannot reverse existing diagram ports. */
    function saveLinkList(characterId, input = {}) {
        const id = pilotId(characterId), old = saved(id, 'list', input), name = text(input.name || old?.name, 80);
        if (!name) throw new Error('Give the connection list a name.');
        if (input.enabled != null && typeof input.enabled !== 'boolean') throw new Error('enabled must be true or false.');
        const list = { id: old?.id || randomUUID(), name, enabled: input.enabled ?? old?.enabled ?? true, created_at: old?.created_at || iso(), updated_at: iso() };
        const preview = parseAnsiblexImport(input, atlas.systems);
        if (!preview.valid) throw new Error('Import needs correction: ' + preview.issues.slice(0, 5).map(issue => 'line ' + issue.line + ': ' + issue.message).join('; '));
        const rows = preview.links;
        if ((input.text != null || input.links != null) && !rows.length) throw new Error('No valid Ansiblex connections found. Paste the SMT or CSV list first.');
        if (rows.length > 2000) throw new Error('Import no more than 2,000 connections at a time.');
        const pairKey = link => link.directional ? 'directed:' + link.from_system_id + ':' + link.to_system_id : [link.from_system_id, link.to_system_id].sort((a, b) => a - b).join(':');
        const previous = records(id, 'link').filter(link => link.list_id === list.id), previousByPair = new Map(previous.map(link => [pairKey(link), link]));
        const imported = rows.map(source => {
            const oldLink = previousByPair.get(pairKey(source));
            let row = source;
            // A reordered reciprocal list must not flip existing map endpoints or their ports.
            if (oldLink && !source.directional && source.from_system_id !== oldLink.from_system_id) {
                row = { ...source, from_system_id: source.to_system_id, to_system_id: source.from_system_id };
                for (const field of ['structure_id', 'accessible', 'owner_alliance_id', 'capital_system_id']) {
                    row[field] = source['reverse_' + field]; row['reverse_' + field] = source[field];
                }
            }
            return normalizeLink(id, { ...row, kind: 'ansiblex', accessible: row.accessible ?? input.accessible ?? false }, oldLink, list.id);
        });
        const unique = new Map(imported.map(link => [pairKey(link), link]));
        store.db.exec('BEGIN IMMEDIATE');
        try {
            persist(id, 'list', list);
            if (input.links != null || input.text != null) {
                const retained = new Set([...unique.values()].map(link => link.id));
                forgetLinks(id, previous.filter(link => !retained.has(link.id)).map(link => ({...link,ended_at:iso()})));
            }
            for (const link of unique.values()) persist(id, 'link', link);
            store.db.exec('COMMIT');
        } catch (error) { store.db.exec('ROLLBACK'); throw error; }
        return { ...list, links: links(id).filter(link => link.list_id === list.id), imported: unique.size, import_format: preview.format, stats: preview.stats };
    }
    function deleteLinkList(characterId, key) {
        const id = pilotId(characterId);
        if (!record(id, 'list', key)) throw new Error('Connection list not found for this pilot.');
        store.db.exec('BEGIN IMMEDIATE');
        try {
            const previous = records(id, 'link').filter(link => link.list_id === key);
            forgetLinks(id, previous.map(link => ({...link,ended_at:iso()})));
            remove.run(id, 'list', String(key)); store.db.exec('COMMIT');
        } catch (error) { store.db.exec('ROLLBACK'); throw error; }
        return { id: String(key), deleted: true };
    }
    function savePin(characterId, input = {}) {
        const id = pilotId(characterId), old = saved(id, 'pin', input), system_id = systemId(input.system_id ?? old?.system_id);
        if (byId.get(system_id)?.space === 'wormhole') throw new Error('Record J-Space system notes inside a private chain map.');
        let event_at = input.event_at === '' || input.event_at === null ? null : input.event_at ?? old?.event_at ?? null;
        const event_id = input.event_id === null || input.event_id === '' ? null : input.event_id ?? old?.event_id ?? null;
        let calendarEvent = null;
        if (event_id != null) {
            if (!validId(Number(event_id))) throw new Error('Choose a valid calendar event.');
            const sample = snapshots(id).calendar;
            calendarEvent = sourceRows({ calendar: sample }, 'calendar').find(event => event.event_id === Number(event_id));
            if (!calendarEvent && Number(event_id) !== old?.event_id) throw new Error('Calendar event is unavailable for this pilot. Refresh the calendar first.');
            if (calendarEvent) event_at = calendarEvent.event_date;
        }
        const event_kind = input.event_kind || old?.event_kind || 'note';
        if (!['note', 'moon', 'event', 'cyno'].includes(event_kind)) throw new Error('Choose a note, cyno beacon, moon event or other event.');
        const color = text(input.color || old?.color || '#57d6c7', 20);
        if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Choose a six-digit pin colour.');
        const to = input.to_system_id === null || input.to_system_id === '' ? null : input.to_system_id ?? old?.to_system_id ?? null;
        const line_style = input.line_style ?? old?.line_style ?? 'solid';
        if (!['solid', 'dashed', 'dotted'].includes(line_style)) throw new Error('Choose a supported annotation line style.');
        const line_curve = input.line_curve ?? old?.line_curve ?? 'straight';
        if (!['straight', 'arc'].includes(line_curve)) throw new Error('Choose a straight line or arc.');
        const line_width = Number(input.line_width ?? old?.line_width ?? 2);
        if (!Number.isFinite(line_width) || line_width < 1 || line_width > 8) throw new Error('Annotation width must be between 1 and 8.');
        return persist(id, 'pin', { id: old?.id || randomUUID(), system_id, label: text(calendarEvent?.title ?? input.label ?? old?.label ?? byId.get(system_id).name, 120), body: text(input.body ?? old?.body, 12000), color,
            to_system_id: to == null ? null : systemId(to), line_style, line_width, line_curve,
            event_at: event_at ? eveDate(event_at) : null, event_id: event_id == null ? null : Number(event_id), source: event_id == null ? 'manual' : 'calendar',
            event_kind, created_at: old?.created_at || iso(), updated_at: iso() });
    }
    function currentStructure(value) {
        const meta = sourceMetadata(value, now());
        return { ...value, ...meta, verified: meta.status === 'ready', access_note: 'ESI visibility does not prove docking, transit rights, fuel or online state.' };
    }
    const structureFlights = new Map();
    /** Check ESI visibility for one connected pilot, sharing flights only within
     * that connection revision. Cache success or failure with its retry deadline;
     * reject a superseded login with 409 before any persistence. Visibility does
     * not grant docking/transit access. close() drains admitted lookups. */
    async function verifyStructure(characterId, structureId) {
        if (lifecycleClosed) throw new Error('Universe structure verification is stopping.');
        const id = pilotId(characterId), structure = Number(structureId), character = auth.characters().find(c => c.id === id);
        if (!validId(structure) || structure < 1000000000000) throw new Error('Enter a player structure ID.');
        if (!character?.scopes?.includes(STRUCTURE_SCOPE)) throw new Error('Connect this pilot with the structure visibility scope first.');
        if (character.needsReauth) throw new Error('Reconnect this pilot before checking structures.');
        const connection = auth.connectionRevision?.(id) ?? 0;
        const cached = record(id, 'structure', structure), key = id + ':' + structure + ':' + connection;
        const assertCurrent = () => {
            if (lifecycleClosed) throw new Error('Universe structure verification is stopping.');
            const current = auth.characters().find(row => row.id === id);
            if ((auth.connectionRevision?.(id) ?? 0) !== connection || !current || current.needsReauth || !current.scopes?.includes(STRUCTURE_SCOPE))
                throw Object.assign(new Error('Pilot connection changed during structure verification.'), {status: 409});
        };
        if (cached && Date.parse(cached.retryAt || cached.expiresAt) > now()) return currentStructure(cached);
        if (structureFlights.has(key)) return structureFlights.get(key);
        const task = (async () => {
            let value;
            try {
                const result = await esi.request('/universe/structures/' + structure, { characterId: id, ttl: 3600 });
                if (!result.data || !validId(result.data.solar_system_id)) throw new Error('ESI returned an invalid structure record.');
                value = { id: String(structure), structure_id: structure, data: result.data, ...result.data, status: result.stale ? 'stale' : 'ready',
                    updatedAt: result.updatedAt || iso(), expiresAt: result.expiresAt || new Date(now() + 3600000).toISOString(), error: result.error || null, updated_at: iso() };
            } catch (error) {
                value = { ...cached, id: String(structure), structure_id: structure, data: cached?.data || null, status: cached?.data ? 'stale' : 'error',
                    error: text(error.message, 500), errorStatus: error.status || null, retryAt: new Date(now() + 300000).toISOString(), updated_at: iso() };
            }
            // ESI owns its request/cache; this service separately owns persistence.
            // A rejected obsolete request must not become the new login's failure cache.
            assertCurrent();
            persist(id, 'structure', value); return currentStructure(value);
        })().finally(() => structureFlights.delete(key));
        structureFlights.set(key, task); return task;
    }
    async function detail(characterId, value) {
        const id = pilotId(characterId), system = systemId(value), context = liveContext(id);
        const base = options.systemDetail ? await options.systemDetail(system) : options.staticData ? byId.get(system) : getUniverseSystem(system);
        if (base.space === 'wormhole') return {...base, overlay:context.overlay(system), sources:{}, neighbors:[], notes:{system:null,constellation:null,region:null}, pins:[], links:[], structures:[], events:[]};
        const notes = {};
        for (const [kind, entity] of [['system', system], ['constellation', base.constellation_id], ['region', base.region_id]]) {
            const row = store.db.prepare('SELECT * FROM place_notes WHERE kind=? AND entity_id=?').get(kind, entity || 0);
            notes[kind] = row ? { ...row, tags: parse(row.tags) || [] } : null;
        }
        const pins = pinsFor(id, context.samples).filter(pin => pin.system_id === system), structures = records(id, 'structure').filter(row => row.solar_system_id === system).map(currentStructure);
        const calendar = sourceRows(context.samples, 'calendar');
        // ESI calendar titles do not reliably identify systems or moon extractions.
        // Only explicit system links are mapped; manual pins can record known moon times.
        const events = calendar.filter(event => event.solar_system_id === system || event.system_id === system).map(event => ({ ...event, source: 'calendar' }));
        return { ...base, overlay: context.overlay(system), sources: context.sources, politics: context.politics,
            neighbors: [...(neighbors.get(system) || [])].map(id => byId.get(id)).filter(Boolean), notes,
            structures: [...context.overlay(system).structures, ...structures], events: [...events, ...pins.filter(pin => pin.event_at)],
            pins, links: links(id).filter(link => link.from_system_id === system || link.to_system_id === system) };
    }
    /** Prepare server-owned standings/activity once for a calculation. Only
     * computational snapshots are decoded; display badges use SQL metadata.
     * Caller preferences cannot replace evidence. validate() rejects changed
     * snapshots, access policy or freshness after an await; never cache this context. */
    function routeContext(id, input) {
        // Routes need six computational snapshots. Other source badges retain
        // exact metadata/counts without decoding their potentially large bodies.
        const currentTime=now(),rows=store.db.prepare(routeSourceQuery).all(JSON.stringify(PUBLIC_SOURCES),id,JSON.stringify(PRIVATE_SOURCES));
        const rowByKey=new Map(rows.map(row=>[row.character_id+':'+row.key,row])),samples={},sources={},preferences={};
        const modules={profile:'pilot',location:'pilot',calendar:'comms',mining:'industry'};
        const character=auth.characters().find(c=>c.id===id);
        for(const key of [...PUBLIC_SOURCES,...PRIVATE_SOURCES]){
            const publicSource=PUBLIC_SOURCES.includes(key),row=rowByKey.get((publicSource?0:id)+':'+key);
            const blocked=publicSource?!store.get('module:universe',true)?'disabled':null:!character||character.needsReauth?character?.needsReauth?'reauth_required':'disconnected':!store.get('module:'+(modules[key]||'opsec'),true)?'disabled':null;
            const sample=blocked?{status:blocked,data:null}:row?.raw?JSON.parse(row.raw):row?{...row,stale:row.stale===1,truncated:row.truncated===1}:null;
            samples[key]=sample;sources[key]=sourceMetadata(sample,currentTime);
            if(!blocked&&row&&!ROUTE_SOURCES.has(key))sources[key].count=row.dataCount;
        }
        const owners=new Map(sourceRows(samples,'sovereignty').map(row=>[row.system_id||row.solar_system_id,row]));
        const kills=new Map(sourceRows(samples,'kills').map(row=>[row.system_id,row])),standings=new Map(),standingBySystem=new Map();
        const completeKills=['ready','stale'].includes(sources.kills.status)&&!sources.kills.truncated&&Array.isArray(samples.kills?.data);
        for (const key of ['mode', 'useAnsiblex', 'useWormholes', 'useThera', 'useTurnur', 'useZarzakh', 'maxAnsiblexZone', 'ansiblexZones', 'avoidSystemIds', 'avoidHostile', 'ansiblexRules', 'shipClass', 'shipSize', 'shipMassKg', 'allowUnknownWormholeSize', 'highSecOnly', 'avoidLowsec', 'avoidNullsec'])
            if (input.preferences?.[key] !== undefined) preferences[key] = input.preferences[key];
        if (preferences.avoidSystemIds != null && !Array.isArray(preferences.avoidSystemIds)) throw new Error('Avoided systems must be a list of system IDs.');
        preferences.pilotAllianceId = sources.profile.status === 'ready' ? samples.profile?.data?.alliance_id : undefined;
        const systems = atlas.systems.map(system => {
            const wormhole=system.space==='wormhole',owner=wormhole?null:owners.get(system.system_id),allianceId=owner?.alliance_id;
            if(!standings.has(allianceId))standings.set(allianceId,sources.sovereignty.status==='ready'?standingForAlliance(allianceId,samples,currentTime).value:null);
            const standing=wormhole?null:standings.get(allianceId),activity=wormhole?null:kills.get(system.system_id)||(completeKills?{ship_kills:0,pod_kills:0}:null);
            standingBySystem.set(system.system_id,standing);
            return {...system,standing,ship_kills:activity?.ship_kills,pod_kills:activity?.pod_kills,sovereignty_alliance_id:sources.sovereignty.status==='ready'?owner?.alliance_id:undefined};
        });
        const policy=()=>{const pilot=auth.characters().find(c=>c.id===id);return JSON.stringify([!!pilot,!!pilot?.needsReauth,pilot?.scopes||[],...['universe','pilot','opsec'].map(key=>!!store.get('module:'+key,true))]);};
        const policyToken=policy(),snapshotTokens=new Map(rows.filter(row=>row.raw!==null).map(row=>[row.character_id+':'+row.key,row.raw]));
        const validate=()=>{
            const current=store.db.prepare(`SELECT character_id,key,body FROM snapshots WHERE (character_id=0 AND key IN (SELECT value FROM json_each(?))) OR (character_id=? AND key IN (SELECT value FROM json_each(?)))`).all(JSON.stringify(ROUTE_PUBLIC_SOURCES),id,JSON.stringify(ROUTE_PRIVATE_SOURCES));
            if(policy()!==policyToken||current.length!==snapshotTokens.size||current.some(row=>snapshotTokens.get(row.character_id+':'+row.key)!==row.body)||[...ROUTE_SOURCES].some(key=>sourceMetadata(samples[key],now()).status!==sources[key].status))
                throw Object.assign(new Error('Route evidence changed during calculation. Calculate the route again.'),{status:409});
        };
        return { context:{samples,sources,standingBySystem}, preferences, systems, validate };
    }
    /** One request owns one graph/spatial grid across all itinerary legs and
     * midpoint searches. Public links are admitted only from the checked internal
     * navigation path. With validateAcceptance, validate(result) must run before
     * saving: used links/lists/feed records and source freshness must still match,
     * otherwise it throws status 409. Unrelated display writes do not invalidate. */
    function prepareRoutePlan(id,input={},allowPublicConnections=false,validateAcceptance=false){
        const {context,preferences,systems,validate:validateSources}=routeContext(id,input),jumping=input.kind==='jump';
        const publicLinks = allowPublicConnections && Array.isArray(input.extraConnections) ? input.extraConnections : [];
        const privateLinks=jumping?[]:links(id,input.map_id).map(link=>({...link,enabled:link.active}));
        const planner=jumping?createJumpPlanner({systems,rangeLy:Number(input.rangeLy??input.range_ly??5),preferences}):createRoutePlanner({systems,gates:atlas.gates,connections:[...privateLinks,...publicLinks],preferences,now:now()});
        const canonical=validateAcceptance&&!jumping?new Map(store.db.prepare("SELECT kind,id,body FROM universe_records WHERE character_id=? AND (kind='list' OR kind='link' AND COALESCE(json_extract(body,'$.map_id'),'') IN ('',?))").all(id,input.map_id||'').map(row=>[row.kind+':'+row.id,row.body])):null;
        const publicTokens=new Map(),publicSamples=new Map(),publicById=new Map(publicLinks.map(link=>[String(link.id),link]));
        if(validateAcceptance&&!jumping)for(const source of new Set(publicLinks.flatMap(link=>[link.source,'wormhole_types']))){
            const key='universe:feeds:'+source,raw=store.db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value;
            publicTokens.set(key,raw);publicSamples.set(key,raw?JSON.parse(raw):null);
        }
        const privateById=new Map(privateLinks.map(link=>[String(link.id),link]));
        const plan=leg=>{
            const originId=systemId(leg.originId??leg.origin_id??leg.from_system_id),destination=leg.destinationId??leg.destination_id??leg.to_system_id;
            const result=planner({originId,destinationId:jumping&&(destination==null||destination==='')?undefined:systemId(destination)});
            if(!jumping&&preferences.avoidHostile&&result.systemIds.some(system=>context.standingBySystem.get(system)==null))result.warnings.push('Some route standings are unknown; avoid-hostile only excludes confirmed hostile systems.');
            if(!jumping&&preferences.mode==='safer'&&context.sources.kills.status!=='ready')result.warnings.push('Current ship and pod kill activity is unavailable; cached activity may be used where present.');
            return {...result,sources:context.sources,generated_at:iso()};
        };
        const validate=result=>{
            validateSources();
            const used=new Map([...(result.edges||[]),...(result.segments||[]).flatMap(segment=>segment.edges||[])].filter(edge=>['wormhole','ansiblex'].includes(edge.kind)).map(edge=>[String(edge.id),edge]));
            for(const [key,edge] of used){
                const link=privateById.get(key),report=publicById.get(key);
                if(link){
                    for(const [kind,recordId] of [['link',key],...(link.list_id?[['list',link.list_id]]:[])])if(get.get(id,kind,recordId)?.body!==canonical?.get(kind+':'+recordId))throw Object.assign(new Error('Connections changed during calculation. Calculate the route again.'),{status:409});
                }else if(report){
                    for(const source of [report.source,'wormhole_types']){
                        const tokenKey='universe:feeds:'+source,sample=publicSamples.get(tokenKey),fresh=sourceMetadata({...sample,updatedAt:sample?.updated_at||sample?.updatedAt,expiresAt:sample?.expires_at||sample?.expiresAt},now()).status;
                        if(store.db.prepare('SELECT value FROM settings WHERE key=?').get(tokenKey)?.value!==publicTokens.get(tokenKey)||sample?.status==='ready'&&fresh!=='ready')throw Object.assign(new Error('Public route evidence changed during calculation. Calculate the route again.'),{status:409});
                    }
                }
                if(edge.kind==='wormhole'&&Date.parse(edge.expires_at)<=now())throw Object.assign(new Error('Connections changed during calculation. Calculate the route again.'),{status:409});
            }
        };
        return {plan,systems,alternateMidpoints:jumping?planner.alternateMidpoints:undefined,validate:validateAcceptance?validate:undefined};
    }
    function route(characterId, input = {}, allowPublicConnections = false) {
        return prepareRoutePlan(pilotId(characterId),{...input,kind:'gate'},allowPublicConnections).plan(input);
    }
    function jump(characterId, input = {}) {
        return prepareRoutePlan(pilotId(characterId),{...input,kind:'jump'}).plan(input);
    }
    function jspaceDestinations(characterId, input = {}) {
        const id = pilotId(characterId), savedMap = record(id, 'jspace_map', input.map_id);
        if (!savedMap || savedMap.kind === 'tracking_source') throw new Error('Choose a private chain map for this pilot.');
        const map = jspace.map(id, input.map_id);
        const { context, preferences, systems } = routeContext(id, input);
        for (const key of ['useThera', 'useTurnur', 'includeCritical', 'includeEol']) {
            if (input.preferences?.[key] !== undefined && typeof input.preferences[key] !== 'boolean') throw new Error(key + ' must be true or false.');
            if (input.preferences?.[key] !== undefined) preferences[key] = input.preferences[key];
        }
        const connections = map.connections.filter(row => !row.missing && row.kind !== 'gate').map(row => ({ ...row, id: row.link_id, enabled: row.active }));
        return { ...findNearestDestinations({ systems, gates: atlas.gates, connections, feeds: feeds.state(), preferences,
            originId: systemId(input.originId), category: input.category, limit: input.limit, security: input.security, now: now() }), sources: context.sources, generated_at: iso() };
    }
    function observeTravel(characterId, _previous, current) {
        const id = pilotId(characterId);
        if (!id || !store.get('module:universe', true)) return null;
        cleanupExpired();
        jspace.observeLocation(id, current);
        return null;
    }
    /** One selected operational location feeds map tracking and navigation; no extra collector. */
    function observeSelectedLocation(characterId) {
        const id = pilotId(characterId);
        if (!id || !store.get('module:universe', true)) return null;
        const position = operations.location(id), updated = Date.parse(position.updated_at), expires = Date.parse(position.expires_at);
        if (position.status !== 'ready' || !['esi', 'chat_log'].includes(position.source) || !byId.has(position.system_id) ||
            !Number.isFinite(updated) || updated > now() + 1000 || !Number.isFinite(expires) || expires <= now()) return null;
        cleanupExpired();
        jspace.observeLocation(id, {status:'ready',source:position.source,updatedAt:position.updated_at,expiresAt:position.expires_at,data:{solar_system_id:position.system_id}});
        return navigation.observeLocation(id, position);
    }
    function pruneExpired(characterId) {
        return cleanupExpired(pilotId(characterId));
    }
    /** Export private persisted data after expiry reconciliation. null/undefined
     * selects all owners plus module-wide settings/history; a pilot selects only
     * that owner's records. This backup DTO must never reach the stream listener. */
    function exportUserData(characterId) {
        cleanupExpired(characterId == null ? null : pilotId(characterId)); feeds.pruneExpired();
        const rows = characterId == null ? store.db.prepare('SELECT character_id,kind,id,body FROM universe_records ORDER BY character_id,kind,id').all() :
            store.db.prepare('SELECT character_id,kind,id,body FROM universe_records WHERE character_id=? ORDER BY kind,id').all(pilotId(characterId));
        const operational = characterId == null ? store.db.prepare('SELECT character_id,kind,id,body FROM universe_operations_records ORDER BY character_id,kind,id').all() :
            store.db.prepare('SELECT character_id,kind,id,body FROM universe_operations_records WHERE character_id=? ORDER BY kind,id').all(pilotId(characterId));
        return { version: 2, records: rows.map(({ body, ...row }) => ({ ...row, data: parse(body) })), operations: operational.map(({body, ...row}) => ({...row, data: parse(body)})),
            navigation: characterId == null ? auth.characters().map(pilot => ({character_id:pilot.id,...navigation.state(pilot.id)})).concat({character_id:0,...navigation.state(0)}) : navigation.state(pilotId(characterId)),
            ...(characterId == null ? { politics: politicsService.exportData(), operationalSettings: store.db.prepare("SELECT key,value FROM settings WHERE key LIKE 'universe:%' OR key LIKE 'universe-navigation:%'").all().map(row => ({key: row.key, value: parse(row.value)})) } : {}) };
    }
    // Earlier builds archived detached connections. Retire those canonical rows
    // before the J-Space migration strips their obsolete map copies.
    store.db.exec('SAVEPOINT universe_map_scope_migration');
    try {
        const previous = store.db.prepare("SELECT character_id,body FROM universe_records WHERE kind='link'").all().map(row => ({id:row.character_id,link:parse(row.body)})).filter(row => row.link?.kind === 'wormhole' && !row.link.map_id);
        jspace.migrateScopes();
        operations.migrateMapScopes();
        for (const {id,link} of previous) forgetBoundSignatures(id, link);
        store.db.exec('RELEASE universe_map_scope_migration');
    } catch (error) { store.db.exec('ROLLBACK TO universe_map_scope_migration; RELEASE universe_map_scope_migration'); throw error; }
    const legacy = new Map();
    for (const row of store.db.prepare("SELECT character_id,body FROM universe_records WHERE kind='jspace_map'").all()) for (const edge of parse(row.body)?.archived_connections || []) {
        const link = record(row.character_id, 'link', edge.link_id);
        if (link?.kind !== 'wormhole') continue;
        if (!legacy.has(row.character_id)) legacy.set(row.character_id, new Map());
        legacy.get(row.character_id).set(link.id, {...link, ended_at: expiredLink(link) ? link.expires_at || link.updated_at : edge.updated_at || iso()});
    }
    for (const [id, rows] of legacy) forgetLinks(id, [...rows.values()]);
    cleanupExpired(); feeds.pruneExpired();
    const publicIds = new Set(['thera','turnur'].flatMap(source => (store.get('universe:feeds:' + source, null)?.data || []).map(row => String(row.id))));
    navigation.forgetMissingConnections((id, key) => record(id, 'link', key)?.kind === 'wormhole' || publicIds.has(String(key)));
    // Constructors above only prepare local state. Arm their expiry work after
    // every schema/migration/projection operation has succeeded, so a throwing
    // synchronous constructor never hands an ownerless timer to its caller.
    try {
        lifecycleReady = true;
        feeds.startExpiry();
        scheduleExpiry();
    } catch (error) {
        lifecycleClosed = true;
        const cleanupErrors = [];
        try { if (expiryTimer !== null) clearExpiryTimer(expiryTimer); } catch (failure) { cleanupErrors.push(failure); }
        try { feeds.close(); } catch (failure) { cleanupErrors.push(failure); }
        if (cleanupErrors.length) {
            try { Object.defineProperty(error, 'cleanupErrors', {value: cleanupErrors, configurable: true}); } catch {}
        }
        throw error;
    }
    return { static: staticData, state, detail, route, jump, saveView, deleteView: (id, key) => deleteRecord(id, 'view', key),
        saveLinkList, deleteLinkList, saveLink, deleteLink, savePin, deletePin: (id, key) => deleteRecord(id, 'pin', key),
        verifyStructure, observeTravel, observeSelectedLocation, pruneExpired, exportUserData, previewLinks, exportLinks, operations, feeds, navigation, jspace, jspaceDestinations, scopeOptions, searchOwners:ownerSearch.search,
        tick: () => { cleanupExpired(); jspace.cleanupSources(); return Promise.allSettled([operations.tick(), feeds.tick()]); },
        close: () => {
            if (closing) return closing;
            lifecycleClosed = true;
            if (expiryTimer !== null) clearExpiryTimer(expiryTimer);
            expiryTimer = null; scheduledExpiryAt = null;
            closing = (async () => {
                const results = await Promise.allSettled([operations, feeds, navigation, ownerSearch].map(service => Promise.resolve().then(() => service.close?.())));
                // Admitted structure lookups may still resume after ESI returns. Drain
                // them before the store closes; their publication fence rejects late results.
                await Promise.allSettled([...structureFlights.values()]);
                const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
                if (errors.length) throw new AggregateError(errors, 'Universe collectors could not finish closing.');
            })();
            return closing;
        },
        politicsConfig: politicsService.config, savePoliticsConfig: politicsService.saveConfig, politicsState: politicsService.read,
        refreshPolitics: politicsService.refresh, politicsAlliances: politicsService.alliances };
}
