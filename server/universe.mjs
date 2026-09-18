import { randomUUID } from 'node:crypto';
import { journeyData } from './places.mjs';
import { getUniverseStatic, getUniverseSystem } from './universe-static.mjs';
import { planRoute, planJumpRoute } from './universe-routing.mjs';

const PUBLIC_SOURCES = ['sovereignty', 'kills', 'jumps', 'fw', 'incursions', 'industry_systems', 'sovereignty_structures'];
const PRIVATE_SOURCES = ['profile', 'location', 'contacts', 'corporation_contacts', 'alliance_contacts', 'calendar', 'mining'];
const CONTACT_SOURCES = [['contacts', 'personal'], ['corporation_contacts', 'corporation'], ['alliance_contacts', 'alliance']];
const HOURS = new Set([16, 12, 8, 4, 1, 0]);
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

/** Universe owns additive private records. Existing notes and visits remain the Journey source of truth. */
export function createUniverse(store, auth, esi, options = {}) {
    const now = options.now || Date.now;
    const atlas = options.staticData || getUniverseStatic();
    const byId = atlas.bySystemId || new Map(atlas.systems.map(system => [system.system_id, system]));
    const byName = new Map(atlas.systems.map(system => [system.name.toLowerCase(), system]));
    const neighbors = atlas.neighbors || new Map();
    if (!atlas.neighbors) for (const edge of atlas.gates) {
        if (!neighbors.has(edge.from_system_id)) neighbors.set(edge.from_system_id, new Set());
        if (!neighbors.has(edge.to_system_id)) neighbors.set(edge.to_system_id, new Set());
        neighbors.get(edge.from_system_id).add(edge.to_system_id); neighbors.get(edge.to_system_id).add(edge.from_system_id);
    }
    store.db.exec(`CREATE TABLE IF NOT EXISTS universe_records(
        character_id INTEGER NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,
        PRIMARY KEY(character_id,kind,id));
        CREATE INDEX IF NOT EXISTS idx_universe_records_character_kind ON universe_records(character_id,kind,updated_at DESC);`);
    const select = store.db.prepare('SELECT body FROM universe_records WHERE character_id=? AND kind=? ORDER BY updated_at DESC,id');
    const get = store.db.prepare('SELECT body FROM universe_records WHERE character_id=? AND kind=? AND id=?');
    const put = store.db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?) ON CONFLICT(character_id,kind,id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at');
    const remove = store.db.prepare('DELETE FROM universe_records WHERE character_id=? AND kind=? AND id=?');
    const iso = () => new Date(now()).toISOString();
    function pilotId(value) {
        const id = Number(value ?? 0);
        if (!Number.isSafeInteger(id) || id < 0 || id && !auth.characters().some(character => character.id === id)) throw new Error('Choose a connected pilot.');
        return id;
    }
    function records(id, kind) { return select.all(id, kind).map(row => parse(row.body)).filter(Boolean); }
    function record(id, kind, key) { return parse(get.get(id, kind, String(key))?.body); }
    function persist(id, kind, value) { put.run(id, kind, String(value.id), JSON.stringify(value), value.updated_at || iso()); return value; }
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
        for (const row of sourceRows(samples, 'sovereignty')) owners.set(row.system_id || row.solar_system_id, row);
        for (const row of sourceRows(samples, 'kills')) kills.set(row.system_id, row);
        for (const row of sourceRows(samples, 'jumps')) jumps.set(row.system_id, row.ship_jumps);
        for (const row of sourceRows(samples, 'fw')) fw.set(row.solar_system_id, row);
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
        const visits = new Map(store.db.prepare('SELECT system_id,COUNT(*) visits,MIN(at) first_visit,MAX(at) last_visit FROM visits WHERE character_id=? GROUP BY system_id').all(id).map(row => [row.system_id, row]));
        const notes = new Map(store.db.prepare("SELECT * FROM place_notes WHERE kind='system'").all().map(row => [row.entity_id, { ...row, tags: parse(row.tags) || [] }]));
        const ids = new Set([...owners.keys(), ...kills.keys(), ...jumps.keys(), ...fw.keys(), ...industry.keys(), ...incursions.keys(), ...sovStructures.keys(), ...mining.keys(), ...visits.keys(), ...notes.keys()]);
        const complete = key => ['ready', 'stale'].includes(sources[key]?.status) && !sources[key]?.truncated && Array.isArray(samples[key]?.data);
        function overlay(system) {
            const sovereignty = owners.get(system), visit = visits.get(system);
            const allianceId = sovereignty?.alliance_id;
            if (!standings.has(allianceId)) standings.set(allianceId, sources.sovereignty.status === 'ready' ? standingForAlliance(allianceId, samples, currentTime) :
                { value: null, label: 'unknown', source: null, status: 'unavailable', reason: 'Current sovereignty is unavailable.' });
            return { system_id: system,
                sovereignty: sovereignty ? { ...sovereignty, alliance_name: names[sovereignty.alliance_id] || null, corporation_name: names[sovereignty.corporation_id] || null, faction_name: names[sovereignty.faction_id] || null } : null,
                standing: standings.get(allianceId),
                kills: kills.get(system) || (complete('kills') ? { ship_kills: 0, pod_kills: 0, npc_kills: 0 } : null),
                jumps: jumps.get(system) ?? (complete('jumps') ? 0 : null), faction_warfare: fw.get(system) || null,
                incursions: incursions.get(system) || [], industry: industry.get(system) || null, mining: mining.get(system) || null,
                structures: sovStructures.get(system) || [], visits: visit?.visits || 0, first_visit: visit?.first_visit || null, last_visit: visit?.last_visit || null, note: notes.get(system) || null };
        }
        return { samples, sources, ids, overlay, defaults: { kills: complete('kills') ? { ship_kills: 0, pod_kills: 0, npc_kills: 0 } : null, jumps: complete('jumps') ? 0 : null } };
    }
    function links(id) {
        const lists = new Map(records(id, 'list').map(list => [list.id, list]));
        return records(id, 'link').map(link => {
            const expired = link.kind === 'wormhole' && Date.parse(link.expires_at) <= now();
            const listEnabled = !link.list_id || lists.get(link.list_id)?.enabled === true;
            return { ...link, from_name: byId.get(link.from_system_id)?.name || String(link.from_system_id), to_name: byId.get(link.to_system_id)?.name || String(link.to_system_id),
                expired, list_enabled: listEnabled, active: link.enabled && (link.accessible || link.reverse_accessible === true) && link.confirmed && !expired && listEnabled };
        });
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
        const id = pilotId(characterId), context = liveContext(id), location = context.samples.location;
        return { character_id: id, generated_at: iso(), location: { system_id: location?.data?.solar_system_id || null, ...context.sources.location },
            systems: [...context.ids].filter(system => byId.has(system)).map(context.overlay), sources: context.sources, defaults: context.defaults,
            links: links(id), link_lists: records(id, 'list'), pins: pinsFor(id, context.samples), views: records(id, 'view'),
            structures: records(id, 'structure').map(currentStructure), journey: journeyData(store, id),
            calendar: sourceRows(context.samples, 'calendar').filter(event => Date.parse(event.event_date) >= now()).map(event => ({ ...event, source: 'calendar', status: context.sources.calendar.status, stale: context.sources.calendar.stale })) };
    }
    function validateConfig(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A saved view needs a map configuration.');
        const encoded = JSON.stringify(value);
        if (encoded.length > 30000) throw new Error('Saved view is too large.');
        return JSON.parse(encoded);
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
    function normalizeLink(id, input, previous = null, listId = undefined) {
        const old = previous || {}, kind = input.kind || old.kind || 'ansiblex';
        if (!['wormhole', 'ansiblex'].includes(kind)) throw new Error('Choose a wormhole or Ansiblex connection.');
        const from = systemId(input.from_system_id ?? input.from ?? old.from_system_id), to = systemId(input.to_system_id ?? input.to ?? old.to_system_id);
        if (from === to) throw new Error('A connection needs two different systems.');
        const list_id = listId ?? input.list_id ?? old.list_id ?? null;
        if (list_id && listId === undefined && !record(id, 'list', list_id)) throw new Error('Connection list not found for this pilot.');
        const optionalId = key => {
            const value = input[key] ?? old[key];
            if (value == null || value === '') return null;
            const parsed = Number(value);
            if (!validId(parsed)) throw new Error('Invalid ' + key.replaceAll('_', ' ') + '.');
            return key.includes('system') ? systemId(parsed) : parsed;
        };
        let expires_at = kind === 'wormhole' ? old.expires_at : null;
        if (kind === 'wormhole' && (!expires_at || input.duration_hours != null)) {
            const duration = Number(input.duration_hours ?? 16);
            if (!HOURS.has(duration)) throw new Error('Wormhole lifetime must be 16, 12, 8, 4, 1 hours, or expired.');
            expires_at = new Date(now() + duration * 3600000).toISOString();
        }
        const mass = input.mass || old.mass || 'unknown';
        if (!['stable', 'reduced', 'critical', 'unknown'].includes(mass)) throw new Error('Choose a valid wormhole mass state.');
        const boolean = (key, fallback) => {
            if (input[key] != null && typeof input[key] !== 'boolean') throw new Error(key + ' must be true or false.');
            return input[key] ?? old[key] ?? fallback;
        };
        return { id: old.id || randomUUID(), kind, from_system_id: from, to_system_id: to, list_id,
            label: text(input.label ?? old.label, 160), enabled: boolean('enabled', true), accessible: boolean('accessible', kind === 'wormhole'),
            confirmed: boolean('confirmed', true), directional: boolean('directional', false),
            reverse_accessible: input.reverse_accessible == null && old.reverse_accessible == null ? null : boolean('reverse_accessible', false), mass,
            structure_id: optionalId('structure_id'), reverse_structure_id: optionalId('reverse_structure_id'), owner_alliance_id: optionalId('owner_alliance_id'),
            capital_system_id: optionalId('capital_system_id'), reverse_owner_alliance_id: optionalId('reverse_owner_alliance_id'), reverse_capital_system_id: optionalId('reverse_capital_system_id'),
            source: old.source || (listId ? 'import' : 'manual'), discovered_at: old.discovered_at || iso(), expires_at, updated_at: iso() };
    }
    function saveLink(characterId, input = {}) {
        const id = pilotId(characterId), old = saved(id, 'link', input), link = normalizeLink(id, input, old);
        persist(id, 'link', link);
        return links(id).find(row => row.id === link.id);
    }
    function importRows(input) {
        if (Array.isArray(input.links)) return input.links;
        if (!text(input.text, 1000000)) return [];
        if (String(input.text).length > 1000000) throw new Error('Ansiblex import is too large.');
        const raw = String(input.text).trim();
        if (raw.startsWith('[')) {
            const parsed = parse(raw);
            if (!Array.isArray(parsed)) throw new Error('Paste a JSON array or rows of From, To, Structure ID.');
            return parsed;
        }
        return raw.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).flatMap((line, index) => {
            const cells = line.split(/\t|,|;|\s+>\s+/).map(cell => cell.trim().replace(/^"|"$/g, ''));
            if (index === 0 && /^(from|from_system_id|origin)$/i.test(cells[0])) return [];
            if (cells.length < 2) throw new Error('Import row ' + (index + 1) + ' needs From and To systems.');
            return [{ from_system_id: cells[0], to_system_id: cells[1], structure_id: cells[2] || null, label: cells[3] || '', accessible: input.accessible === true }];
        });
    }
    function saveLinkList(characterId, input = {}) {
        const id = pilotId(characterId), old = saved(id, 'list', input), name = text(input.name || old?.name, 80);
        if (!name) throw new Error('Give the connection list a name.');
        if (input.enabled != null && typeof input.enabled !== 'boolean') throw new Error('enabled must be true or false.');
        const list = { id: old?.id || randomUUID(), name, enabled: input.enabled ?? old?.enabled ?? true, created_at: old?.created_at || iso(), updated_at: iso() };
        const rows = importRows(input);
        if (rows.length > 2000) throw new Error('Import no more than 2,000 connections at a time.');
        const imported = rows.map(row => normalizeLink(id, { ...row, kind: 'ansiblex', accessible: row.accessible ?? input.accessible ?? false }, null, list.id));
        const unique = new Map(imported.map(link => [link.directional ? 'directed:' + link.from_system_id + ':' + link.to_system_id :
            [link.from_system_id, link.to_system_id].sort((a, b) => a - b).join(':'), link]));
        store.db.exec('BEGIN IMMEDIATE');
        try {
            persist(id, 'list', list);
            if (input.links != null || input.text != null) for (const link of records(id, 'link').filter(link => link.list_id === list.id)) remove.run(id, 'link', link.id);
            for (const link of unique.values()) persist(id, 'link', link);
            store.db.exec('COMMIT');
        } catch (error) { store.db.exec('ROLLBACK'); throw error; }
        return { ...list, links: links(id).filter(link => link.list_id === list.id), imported: unique.size };
    }
    function deleteLinkList(characterId, key) {
        const id = pilotId(characterId);
        if (!record(id, 'list', key)) throw new Error('Connection list not found for this pilot.');
        store.db.exec('BEGIN IMMEDIATE');
        try {
            for (const link of records(id, 'link').filter(link => link.list_id === key)) remove.run(id, 'link', link.id);
            remove.run(id, 'list', String(key)); store.db.exec('COMMIT');
        } catch (error) { store.db.exec('ROLLBACK'); throw error; }
        return { id: String(key), deleted: true };
    }
    function savePin(characterId, input = {}) {
        const id = pilotId(characterId), old = saved(id, 'pin', input), system_id = systemId(input.system_id ?? old?.system_id);
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
        if (!['note', 'moon', 'event'].includes(event_kind)) throw new Error('Choose a note, moon event or other event.');
        const color = text(input.color || old?.color || '#57d6c7', 20);
        if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Choose a six-digit pin colour.');
        return persist(id, 'pin', { id: old?.id || randomUUID(), system_id, label: text(calendarEvent?.title ?? input.label ?? old?.label ?? byId.get(system_id).name, 120), body: text(input.body ?? old?.body, 12000), color,
            event_at: event_at ? eveDate(event_at) : null, event_id: event_id == null ? null : Number(event_id), source: event_id == null ? 'manual' : 'calendar',
            event_kind, created_at: old?.created_at || iso(), updated_at: iso() });
    }
    function currentStructure(value) {
        const meta = sourceMetadata(value, now());
        return { ...value, ...meta, verified: meta.status === 'ready', access_note: 'ESI visibility does not prove docking, transit rights, fuel or online state.' };
    }
    const structureFlights = new Map();
    async function verifyStructure(characterId, structureId) {
        const id = pilotId(characterId), structure = Number(structureId), character = auth.characters().find(c => c.id === id);
        if (!validId(structure) || structure < 1000000000000) throw new Error('Enter a player structure ID.');
        if (!character?.scopes?.includes(STRUCTURE_SCOPE)) throw new Error('Connect this pilot with the structure visibility scope first.');
        if (character.needsReauth) throw new Error('Reconnect this pilot before checking structures.');
        const cached = record(id, 'structure', structure), key = id + ':' + structure;
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
            persist(id, 'structure', value); return currentStructure(value);
        })().finally(() => structureFlights.delete(key));
        structureFlights.set(key, task); return task;
    }
    async function detail(characterId, value) {
        const id = pilotId(characterId), system = systemId(value), context = liveContext(id);
        const base = options.systemDetail ? await options.systemDetail(system) : options.staticData ? byId.get(system) : getUniverseSystem(system);
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
        return { ...base, overlay: context.overlay(system), sources: context.sources,
            neighbors: [...(neighbors.get(system) || [])].map(id => byId.get(id)).filter(Boolean), notes,
            structures: [...context.overlay(system).structures, ...structures], events: [...events, ...pins.filter(pin => pin.event_at)],
            pins, links: links(id).filter(link => link.from_system_id === system || link.to_system_id === system) };
    }
    function routeContext(id, input) {
        const context = liveContext(id), preferences = {};
        for (const key of ['mode', 'useAnsiblex', 'useWormholes', 'maxAnsiblexZone', 'ansiblexZones', 'avoidSystemIds', 'avoidHostile', 'ansiblexRules', 'shipClass', 'highSecOnly', 'avoidLowsec', 'avoidNullsec'])
            if (input.preferences?.[key] !== undefined) preferences[key] = input.preferences[key];
        if (preferences.avoidSystemIds != null && !Array.isArray(preferences.avoidSystemIds)) throw new Error('Avoided systems must be a list of system IDs.');
        preferences.pilotAllianceId = context.sources.profile.status === 'ready' ? context.samples.profile?.data?.alliance_id : undefined;
        const systems = atlas.systems.map(system => {
            const row = context.overlay(system.system_id);
            return { ...system, standing: row.standing.value, ship_kills: row.kills?.ship_kills, pod_kills: row.kills?.pod_kills };
        });
        return { context, preferences, systems };
    }
    function route(characterId, input = {}) {
        const id = pilotId(characterId), { context, preferences, systems } = routeContext(id, input);
        const originId = systemId(input.originId ?? input.origin_id ?? input.from_system_id), destinationId = systemId(input.destinationId ?? input.destination_id ?? input.to_system_id);
        const result = planRoute({ systems, gates: atlas.gates, connections: links(id).map(link => ({ ...link, enabled: link.active })), preferences, originId, destinationId, now: now() });
        if (preferences.avoidHostile && result.systemIds.some(system => context.overlay(system).standing.value == null))
            result.warnings.push('Some route standings are unknown; avoid-hostile only excludes confirmed hostile systems.');
        if (preferences.mode === 'safer' && context.sources.kills.status !== 'ready')
            result.warnings.push('Current ship and pod kill activity is unavailable; cached activity may be used where present.');
        return { ...result, sources: context.sources, generated_at: iso() };
    }
    function jump(characterId, input = {}) {
        const id = pilotId(characterId), { context, preferences, systems } = routeContext(id, input);
        const originId = systemId(input.originId ?? input.origin_id ?? input.from_system_id), destination = input.destinationId ?? input.destination_id ?? input.to_system_id;
        return { ...planJumpRoute({ systems, originId, destinationId: destination == null || destination === '' ? undefined : systemId(destination),
            rangeLy: Number(input.rangeLy ?? input.range_ly ?? 5), preferences }), sources: context.sources, generated_at: iso() };
    }
    function observeTravel(characterId, previous, current) {
        const id = pilotId(characterId), before = previous?.data, after = current?.data;
        if (!id || previous?.status !== 'ready' || current?.status !== 'ready' || !before || !after || before.solar_system_id === after.solar_system_id) return null;
        const beforeTime = Date.parse(previous.updatedAt), afterTime = Date.parse(current.updatedAt);
        if (!Number.isFinite(beforeTime) || !Number.isFinite(afterTime) || afterTime <= beforeTime || afterTime - beforeTime > 90000 || now() - afterTime > 30000) return null;
        if (before.station_id || before.structure_id || after.station_id || after.structure_id) return null;
        const from = byId.get(before.solar_system_id), to = byId.get(after.solar_system_id);
        if (!from || !to || from.space !== 'wormhole' && to.space !== 'wormhole' || neighbors.get(from.system_id)?.has(to.system_id)) return null;
        const recentPodLoss = store.db.prepare("SELECT 1 FROM combat_records WHERE character_id=? AND result='loss' AND at>=? AND json_extract(body,'$.victim.ship_type_id') IN (670,33328) LIMIT 1").get(id, new Date(beforeTime - 60000).toISOString());
        if (recentPodLoss) return null;
        const existing = links(id).find(link => link.kind === 'wormhole' && !link.expired &&
            (link.from_system_id === from.system_id && link.to_system_id === to.system_id || link.from_system_id === to.system_id && link.to_system_id === from.system_id));
        if (existing) return existing;
        const link = normalizeLink(id, { kind: 'wormhole', from_system_id: from.system_id, to_system_id: to.system_id, confirmed: false, accessible: false,
            label: 'Observed travel · confirm wormhole connection' });
        link.source = 'travel'; link.evidence = { observed_at: current.updatedAt, previous_at: previous.updatedAt, reason: 'Consecutive live in-space locations involving Anoikis. Confirm the connection before routing.' };
        return persist(id, 'link', link);
    }
    function pruneExpired(characterId) {
        const id = pilotId(characterId), expired = links(id).filter(link => link.kind === 'wormhole' && link.expired);
        for (const link of expired) remove.run(id, 'link', link.id);
        return { deleted: expired.length };
    }
    function exportUserData(characterId) {
        const rows = characterId == null ? store.db.prepare('SELECT character_id,kind,id,body FROM universe_records ORDER BY character_id,kind,id').all() :
            store.db.prepare('SELECT character_id,kind,id,body FROM universe_records WHERE character_id=? ORDER BY kind,id').all(pilotId(characterId));
        return { version: 1, records: rows.map(({ body, ...row }) => ({ ...row, data: parse(body) })) };
    }
    return { static: staticData, state, detail, route, jump, saveView, deleteView: (id, key) => deleteRecord(id, 'view', key),
        saveLinkList, deleteLinkList, saveLink, deleteLink: (id, key) => deleteRecord(id, 'link', key), savePin, deletePin: (id, key) => deleteRecord(id, 'pin', key),
        verifyStructure, observeTravel, pruneExpired, exportUserData };
}
