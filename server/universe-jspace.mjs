import { randomUUID } from 'node:crypto';
import { getWormholeType } from './universe-wormholes.mjs';
import { createJSpaceTracking } from './universe-jspace-tracking.mjs';
import { validateJSpaceScope, hasJSpaceScope, matchesJSpaceScope } from './universe-jspace-scopes.mjs';

const LIMITS = Object.freeze({ maps: 24, nodes: 600, connections: 1000, passages: 1000, observations: 1000, comments: 500, pings: 100, activity: 100, undo: 10, document_bytes: 4_000_000 });
const STATUSES = ['unknown', 'unscanned', 'scanning', 'scanned', 'occupied', 'hostile', 'friendly', 'empty'];
const LIFE = ['unknown', 'stable', 'eol', 'critical', 'collapsed'];
const PRUNE_DELAY_MS = 30 * 60000;
const own = (value, key) => Object.hasOwn(value, key);
const clone = value => structuredClone(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function clean(value, max = 160) {
    if (value != null && typeof value !== 'string') throw new Error('Text fields must contain text.');
    const result = (value || '').trim();
    if (result.length > max) throw new Error(`Text is too long (maximum ${max} characters).`);
    return result;
}
function choose(value, values, fallback) {
    if (value === undefined) return fallback;
    if (!values.includes(value)) throw new Error('Choose a supported value: ' + values.join(', ') + '.');
    return value;
}
function boolean(value, fallback = false) {
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') throw new Error('Use true or false for this option.');
    return value;
}
function coordinate(value, fallback = 0) {
    if (value === undefined) return fallback;
    if (!Number.isFinite(value) || Math.abs(value) > 100000) throw new Error('Map positions must be finite numbers within 100,000 units.');
    return Math.round(value * 100) / 100;
}
function date(value, fallback = null) {
    if (value === undefined) return fallback;
    if (value === null || value === '') return null;
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value)) throw new Error('Use an ISO date in EVE time (UTC).');
    const stamp = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : value + 'Z');
    if (!Number.isFinite(stamp)) throw new Error('Use a valid date in EVE time (UTC).');
    return new Date(stamp).toISOString();
}
function array(value, limit, name) {
    if (!Array.isArray(value) || value.length > limit) throw new Error(`Use at most ${limit} ${name}.`);
    return value;
}
function conflict(revision) {
    const error = new Error('This chain changed in another view. Reload it before applying your edit.');
    error.status = 409; error.code = 'jspace_revision_conflict'; error.revision = revision; return error;
}

/** Private diagrams reference Universe links; diagram topology never independently authorises a route. */
export function createUniverseJSpace(store, auth, options) {
    const { atlas, getLinks, saveLink, deleteLink, validateLink, operations, getScopeContext = () => ({ atlas, politicsConfig: {} }), onChange = () => {} } = options;
    const now = options.now || Date.now, iso = () => new Date(now()).toISOString();
    const byId = atlas.bySystemId || new Map(atlas.systems.map(row => [row.system_id, row]));
    const gates = new Set(atlas.gates.flatMap(row => [`${row.from_system_id}:${row.to_system_id}`, `${row.to_system_id}:${row.from_system_id}`]));
    const getRow = store.db.prepare('SELECT body FROM universe_records WHERE character_id=? AND kind=? AND id=?');
    const getRows = store.db.prepare('SELECT body FROM universe_records WHERE character_id=? AND kind=? ORDER BY updated_at DESC,id');
    const putRow = store.db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?) ON CONFLICT(character_id,kind,id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at');
    const deleteRow = store.db.prepare('DELETE FROM universe_records WHERE character_id=? AND kind=? AND id=?');
    const read = (pilot, kind, id) => { const value = getRow.get(pilot, kind, String(id)); return value ? JSON.parse(value.body) : null; };
    const rows = (pilot, kind) => getRows.all(pilot, kind).map(row => JSON.parse(row.body));
    const write = (pilot, kind, value) => putRow.run(pilot, kind, value.id, JSON.stringify(value), value.updated_at || iso());
    let scopeContexts = null, nextSourceCleanup = 0;
    const scopeContext = id => {
        if (!scopeContexts) return getScopeContext(id);
        if (!scopeContexts.has(id)) scopeContexts.set(id, getScopeContext(id));
        return scopeContexts.get(id);
    };
    function withScopeContexts(fn) {
        const previous = scopeContexts; scopeContexts = previous || new Map();
        try { return fn(); } finally { scopeContexts = previous; }
    }
    const populateScopes = (id, mapId, settings) => withScopeContexts(() => tracking.populateScopes(id, mapId, settings));
    const isActivePilot = id => id === store.get('universe:jspace:active_pilot', auth.characters()[0]?.id || 0);
    const tracking = createJSpaceTracking(store, auth, { atlas, now, operations, onChange, saveConnection, isActivePilot,
        hasScope: map => hasJSpaceScope(map.scope), scopeMatches: (id, map, systemId) => matchesJSpaceScope(map.scope, systemId, scopeContext(id)),
        getConnections: (id, map) => getLinks(id, map.id),
        copyConnection: (id, map, source) => {
            const expiry = Date.parse(source.expires_at); if (!Number.isFinite(expiry) || expiry <= now()) return null;
            const edge = saveConnection(id, map, { kind: 'wormhole', from_system_id: source.from_system_id, to_system_id: source.to_system_id,
                expires_at: source.expires_at, observed_at: source.observed_at || source.discovered_at, mass: 'stable', max_ship_size: 'large', life_status: 'stable',
                confirmed: false, accessible: false, reverse_accessible: false });
            if (edge) { const link = read(id, 'link', edge.link_id); link.duration_hours = 16; write(id, 'link', link); }
            return edge;
        },
        addSystem: (map, systemId, anchorId) => {
            if (map.nodes.some(row => row.system_id === systemId)) return;
            const wasArchived = (map.archived_nodes || []).some(row => row.system_id === systemId);
            const restored = restoreNode(map, { system_id: systemId }), anchor = map.nodes.find(row => row.system_id === anchorId);
            if (map.kind === 'tracking_source') restored.disconnected_at = iso();
            if (!wasArchived && anchor) {
                restored.x = anchor.x + 340; restored.y = anchor.y;
                while (map.nodes.some(row => Math.abs(row.x - restored.x) < 300 && Math.abs(row.y - restored.y) < 140)) restored.y += 190;
            }
            map.nodes.push(restored);
        },
        writeMap: (id, map) => {
            capacity(map);
            if (read(id, 'jspace_map', map.id)?.revision !== map.revision) deleteRow.run(id, 'jspace_undo', map.id);
            write(id, 'jspace_map', map);
        },
        recordPassage: (id, map, edge, input) => {
            if (map.passages.length >= LIMITS.passages || map.passages.some(row => row.sample_key === input.sample_key)) return false;
            const candidates = getLinks(id, map.id).filter(row => row.kind === 'wormhole' && row.active && row.confirmed &&
                (row.from_system_id === edge.from_system_id && row.to_system_id === edge.to_system_id || row.from_system_id === edge.to_system_id && row.to_system_id === edge.from_system_id));
            if (candidates.length !== 1 || candidates[0].id !== edge.link_id) return false;
            const row = passage(map, { connection_id: edge.id, from_system_id: input.from_system_id, to_system_id: input.to_system_id, occurred_at: input.at,
                pilot_name: auth.characters().find(pilot => pilot.id === input.character_id)?.name || String(input.character_id),
                notes: 'Sampled locations suggest passage through this confirmed connection. Polling can miss movement; ship mass is unknown.' });
            Object.assign(row, { source: 'sampled_location', reviewed: false, sample_key: input.sample_key, sampled_previous_at: input.previous_at });
            map.passages.unshift(row); return true;
        } });
    function pilot(value, writing = false) {
        const id = Number(value ?? 0);
        if (!Number.isSafeInteger(id) || id < 0 || id && !auth.characters().some(row => row.id === id) || writing && !id) throw new Error('Choose a connected pilot for your private J-Space maps.');
        return id;
    }
    function system(value) {
        const id = Number(value);
        if (!Number.isSafeInteger(id) || !byId.has(id)) throw new Error('Choose a system in the bundled Universe atlas.');
        return id;
    }
    function loaded(id, key) {
        const value = read(id, 'jspace_map', key);
        if (!value) throw new Error('Chain map not found for this pilot.');
        return value;
    }
    function editable(map) { if (map.kind === 'tracking_source') throw new Error('The live source map is read-only. Create an interactive map to edit it.'); }
    function ensureSource(id) {
        if (!id) return null;
        const key = 'tracking-source-' + id, existing = read(id, 'jspace_map', key);
        if (existing) return existing;
        const map = { ...blank({ name: 'Live source' }), id: key, kind: 'tracking_source', pilots: [{ character_id: id, tracking: true }] };
        write(id, 'jspace_map', map); tracking.syncMap(id, map); return map;
    }
    function setActivePilot(characterId) {
        const id = pilot(characterId), previous = store.get('universe:jspace:active_pilot', auth.characters()[0]?.id || 0);
        if (previous !== id) { tracking.resetSourceBaseline?.(previous); tracking.resetSourceBaseline?.(id); }
        store.set('universe:jspace:active_pilot', id);
        if (id) ensureSource(id);
        return { character_id: id };
    }
    function observeLocation(characterId, input) {
        const id = pilot(characterId);
        if (id && isActivePilot(id)) ensureSource(id);
        return withScopeContexts(() => tracking.observeLocation(id, input));
    }
    function cleanupSources() {
        if (now() < nextSourceCleanup) return;
        nextSourceCleanup = now() + 30000;
        for (const item of store.db.prepare("SELECT character_id,body FROM universe_records WHERE kind='jspace_map' AND json_extract(body,'$.kind')='tracking_source'").all()) {
            const map = JSON.parse(item.body);
            if (!map.nodes.some(row => !row.locked && row.disconnected_at && Math.max(Date.parse(row.disconnected_at) || 0, Date.parse(row.prune_grace_at) || 0) + PRUNE_DELAY_MS <= now())) continue;
            // Expiry cleanup already ran in Universe's shared tick. Read canonical
            // topology directly so disconnected accounts also lose old source nodes.
            const links = store.db.prepare("SELECT body FROM universe_records WHERE character_id=? AND kind='link' AND json_extract(body,'$.map_id')=?").all(item.character_id, map.id).map(row => JSON.parse(row.body));
            const revision = map.revision;
            reconcileNodes(item.character_id, map, new Map(links.map(link => [link.id, link])));
            if (map.revision !== revision) onChange(item.character_id);
        }
    }
    function atomic(fn) {
        store.db.exec('BEGIN IMMEDIATE');
        try { const result = fn(); store.db.exec('COMMIT'); return result; }
        catch (error) { store.db.exec('ROLLBACK'); throw error; }
    }
    function node(input, old = null, index = 0) {
        if (!object(input)) throw new Error('Provide a valid system card.');
        const previous = old || {}, tags = input.tags === undefined ? previous.tags || [] : array(input.tags, 20, 'tags').map(tag => clean(tag, 40));
        const system_id = system(input.system_id ?? previous.system_id);
        let effective_owner = previous.effective_owner || null;
        if (own(input, 'effective_owner')) {
            effective_owner = input.effective_owner;
            if (effective_owner !== null) {
                if (byId.get(system_id)?.space !== 'wormhole') throw new Error('Assign a local owner only to a J-Space system.');
                if (!object(effective_owner) || !Number.isSafeInteger(effective_owner.id) || effective_owner.id < 1) throw new Error('Provide a valid alliance or corporation ID.');
                const name = clean(effective_owner.name, 160);
                if (!name) throw new Error('Provide the alliance or corporation name.');
                effective_owner = { kind: choose(effective_owner.kind, ['alliance', 'corporation']), id: effective_owner.id, name };
                if (!effective_owner.kind) throw new Error('Choose alliance or corporation.');
            }
        }
        return { system_id, x: coordinate(input.x, previous.x ?? index % 5 * 340), y: coordinate(input.y, previous.y ?? Math.floor(index / 5) * 260),
            alias: clean(input.alias ?? previous.alias, 100), label: clean(input.label ?? previous.label, 120), description: clean(input.description ?? previous.description, 4000),
            status: choose(input.status, STATUSES, previous.status || 'unknown'), role: choose(input.role, ['', 'home', 'staging'], previous.role || ''),
            locked: boolean(input.locked, previous.locked || false), tags: [...new Set(tags.filter(Boolean))], effective_owner,
            ...(previous.source_coverage ? { source_coverage: clone(previous.source_coverage) } : {}),
            ...(previous.disconnected_at ? { disconnected_at: previous.disconnected_at } : {}),
            ...(previous.prune_grace_at || !old ? { prune_grace_at: previous.prune_grace_at || iso() } : {}) };
    }
    function restoreNode(map, input) {
        const previous = (map.archived_nodes || []).find(row => row.system_id === Number(input.system_id));
        const restored = node(input, previous, map.nodes.length);
        restored.prune_grace_at = iso();
        if (previous?.disconnected_at) restored.disconnected_at = iso();
        map.archived_nodes = (map.archived_nodes || []).filter(row => row.system_id !== restored.system_id);
        return restored;
    }
    function archiveNodes(map, ids) {
        if (map.kind !== 'tracking_source') map.archived_nodes = [...(map.archived_nodes || []).filter(row => !ids.has(row.system_id)), ...map.nodes.filter(row => ids.has(row.system_id))];
        map.nodes = map.nodes.filter(row => !ids.has(row.system_id));
        map.connections = map.connections.filter(row => !ids.has(row.from_system_id) && !ids.has(row.to_system_id));
        map.pings = map.pings.filter(row => !ids.has(row.system_id));
    }
    function markDetached(map, edges, ended = new Map()) {
        const losses = new Map();
        for (const edge of edges) for (const id of [edge.from_system_id, edge.to_system_id]) losses.set(id, Math.max(losses.get(id) || 0, Date.parse(ended.get(edge.link_id)) || now()));
        for (const row of [...map.nodes, ...(map.archived_nodes || [])]) {
            if (losses.has(row.system_id)) row.disconnected_at = new Date(Math.max(Date.parse(row.disconnected_at) || 0, losses.get(row.system_id))).toISOString();
        }
    }
    // Only systems have an archive. A departed connection has no notes, passages,
    // activity entries or undo snapshot that can bring it back.
    function forgetMapConnections(map, removed, canonical = null) {
        const before = JSON.stringify(map), ended = new Map(removed.map(link => [link.id, link.ended_at || link.expires_at || iso()]));
        const dead = map.connections.filter(edge => ended.has(edge.link_id) || canonical && edge.kind !== 'gate' && !canonical.has(edge.link_id));
        markDetached(map, dead, ended);
        const deadIds = new Set(dead.map(edge => edge.id));
        map.connections = map.connections.filter(edge => !deadIds.has(edge.id)).map(({ locked, ...edge }) => edge);
        delete map.archived_connections;
        const present = new Set(map.connections.map(edge => edge.id));
        map.passages = map.passages.filter(row => present.has(row.connection_id));
        map.comments = map.comments.filter(row => !row.connection_id || present.has(row.connection_id));
        map.activity = (map.activity || []).filter(row => !/^(connection|passage)\./.test(row.op));
        return JSON.stringify(map) !== before;
    }
    function forgetConnections(characterId, removed = []) {
        const id = Number(characterId);
        if (!Number.isSafeInteger(id) || id < 0) throw new Error('Invalid stored pilot.');
        for (const map of rows(id, 'jspace_map')) {
            if (forgetMapConnections(map, removed)) { map.revision++; map.updated_at = iso(); write(id, 'jspace_map', map); }
        }
        for (const history of rows(id, 'jspace_undo')) {
            let changed = false;
            for (const snapshot of history.entries) if (forgetMapConnections(snapshot, removed)) changed = true;
            if (changed) write(id, 'jspace_undo', { ...history, updated_at: iso() });
        }
    }
    function migrateScopes() {
        // One-time isolation of existing diagrams. No visit history seeds a map.
        // Only already-visible memberships receive their own connection records.
        for (const item of store.db.prepare("SELECT character_id,body FROM universe_records WHERE kind='jspace_map'").all()) {
            const id = item.character_id, map = JSON.parse(item.body);
            if (map.scope_version === 2) {
                if (!map.pilots) { map.pilots = [{ character_id: id, tracking: true }]; write(id, 'jspace_map', map); }
                tracking.syncMap(id, map); continue;
            }
            const canonical = new Map();
            for (const edge of map.connections) {
                if (edge.kind !== 'wormhole' || !edge.link_id) continue;
                const old = read(id, 'link', edge.link_id);
                if (!old) continue;
                const link = { ...old, id: randomUUID(), map_id: map.id };
                write(id, 'link', link); canonical.set(link.id, link);
                const oldId = edge.link_id; edge.link_id = link.id;
                for (const passage of map.passages) if (passage.link_id === oldId) passage.link_id = link.id;
            }
            // Retain non-wormhole memberships without treating them as discoveries.
            for (const edge of map.connections) if (edge.kind !== 'wormhole' && edge.link_id) {
                const link = read(id, 'link', edge.link_id); if (link) canonical.set(link.id, link);
            }
            forgetMapConnections(map, [], canonical);
            map.scope_version = 2; map.revision++; map.updated_at = iso();
            map.pilots = [{ character_id: id, tracking: true }];
            write(id, 'jspace_map', map); deleteRow.run(id, 'jspace_undo', map.id);
            tracking.syncMap(id, map);
        }
        for (const item of store.db.prepare("SELECT character_id,body FROM universe_records WHERE kind='link'").all()) {
            const link = JSON.parse(item.body);
            if (link.kind === 'wormhole' && (!link.map_id || !read(item.character_id, 'jspace_map', link.map_id))) deleteRow.run(item.character_id, 'link', link.id);
        }
        const notes = store.db.prepare("SELECT * FROM place_notes WHERE kind='system'").all().filter(row => byId.get(row.entity_id)?.space === 'wormhole');
        const pins = store.db.prepare("SELECT character_id,id,body FROM universe_records WHERE kind='pin'").all().map(row => ({ ...row, value: JSON.parse(row.body) })).filter(row => byId.get(row.value.system_id)?.space === 'wormhole');
        if (notes.length || pins.length) for (const item of store.db.prepare("SELECT character_id,body FROM universe_records WHERE kind='jspace_map'").all()) {
            const map = JSON.parse(item.body), systems = new Set([...map.nodes, ...(map.archived_nodes || [])].map(row => row.system_id));
            let changed = false;
            for (const note of notes) if (systems.has(note.entity_id)) {
                if (note.body) map.comments.push({ id: randomUUID(), system_id: note.entity_id, connection_id: null, body: note.body, created_at: note.updated || iso() });
                const card = [...map.nodes, ...(map.archived_nodes || [])].find(row => row.system_id === note.entity_id);
                card.tags = [...new Set([...(card.tags || []), ...JSON.parse(note.tags || '[]')])].slice(0, 20); changed = true;
            }
            for (const pin of pins) if (pin.character_id === item.character_id && systems.has(pin.value.system_id)) {
                const body = [pin.value.label, pin.value.note, pin.value.body, pin.value.event_at].filter(Boolean).join('\n');
                if (body) map.comments.push({ id: randomUUID(), system_id: pin.value.system_id, connection_id: null, body, created_at: pin.value.created_at || iso() });
                changed = true;
            }
            if (changed) { map.revision++; map.updated_at = iso(); write(item.character_id, 'jspace_map', map); }
        }
        for (const note of notes) store.db.prepare("DELETE FROM place_notes WHERE kind='system' AND entity_id=?").run(note.entity_id);
        for (const pin of pins) deleteRow.run(pin.character_id, 'pin', pin.id);
    }
    // Diagram membership expires, never the pilot's observations or card metadata.
    // Unknown/unconfirmed links still connect cards; routing permission is unrelated.
    function reconcileNodes(id, map, canonical) {
        let changed = forgetMapConnections(map, [], canonical);
        const prune = new Set();
        const connected = new Set(map.connections.flatMap(edge => [edge.from_system_id, edge.to_system_id]));
        for (const row of map.nodes) {
            if (connected.has(row.system_id)) {
                if (row.disconnected_at) { delete row.disconnected_at; changed = true; }
                continue;
            }
            // A standalone card that has never lost a connection stays on its map.
            if (!row.disconnected_at) continue;
            const disconnected = Math.max(Date.parse(row.disconnected_at) || 0, Date.parse(row.prune_grace_at) || 0);
            const stamp = new Date(disconnected).toISOString();
            if (row.disconnected_at !== stamp) { row.disconnected_at = stamp; changed = true; }
            if (!row.locked && now() >= disconnected + PRUNE_DELAY_MS) prune.add(row.system_id);
        }
        if (prune.size) {
            archiveNodes(map, prune); map.revision++; map.updated_at = iso();
            log(map, 'nodes.prune', `Archived ${prune.size} disconnected system card${prune.size === 1 ? '' : 's'}`);
            deleteRow.run(id, 'jspace_undo', map.id); changed = true;
        }
        if (changed) write(id, 'jspace_map', map);
        return map;
    }
    function mapNode(map, value) { const id = system(value); if (!map.nodes.some(row => row.system_id === id)) throw new Error('Add this system to the chain first.'); return id; }
    function connection(map, value) { const result = map.connections.find(row => row.id === value); if (!result) throw new Error('Connection not found on this chain.'); return result; }
    function observation(map, input, old = null) {
        if (!object(input)) throw new Error('Provide a valid observation.');
        const previous = old || {}, title = clean(input.title ?? previous.title, 160);
        if (!title) throw new Error('Give this observation a title.');
        const observed_at = date(input.observed_at, previous.observed_at || iso());
        if (!observed_at || Date.parse(observed_at) > now() + 300000) throw new Error('Observation time cannot be in the future.');
        return { id: previous.id || randomUUID(), system_id: mapNode(map, input.system_id ?? previous.system_id), kind: choose(input.kind, ['structure', 'timer', 'scan', 'hazard'], previous.kind || 'structure'), title,
            body: clean(input.body ?? previous.body, 4000), type_name: clean(input.type_name ?? previous.type_name, 120), owner: clean(input.owner ?? previous.owner, 160),
            standing: choose(input.standing, ['unknown', 'friendly', 'neutral', 'hostile'], previous.standing || 'unknown'), state: clean(input.state ?? previous.state, 100),
            observed_at, expires_at: date(input.expires_at, previous.expires_at || null), timer_at: date(input.timer_at, previous.timer_at || null),
            created_at: previous.created_at || iso(), updated_at: iso() };
    }
    function passage(map, input, old = null) {
        if (!object(input)) throw new Error('Provide a passage observation.');
        input = { ...old, ...input };
        const edge = connection(map, input.connection_id), from = system(input.from_system_id), to = system(input.to_system_id);
        if (!((edge.from_system_id === from && edge.to_system_id === to) || (edge.from_system_id === to && edge.to_system_id === from))) throw new Error('Passage endpoints must match the observed connection.');
        const occurred_at = date(input.occurred_at, iso());
        if (!occurred_at || Date.parse(occurred_at) > now() + 300000) throw new Error('Passages must describe travel already observed.');
        const mass_kg = input.mass_kg == null || input.mass_kg === '' ? null : input.mass_kg;
        if (mass_kg !== null && (!Number.isFinite(mass_kg) || mass_kg <= 0 || mass_kg > 1e13)) throw new Error('Recorded ship mass must be a positive number in kilograms.');
        const ship_type_id = input.ship_type_id == null || input.ship_type_id === '' ? null : Number(input.ship_type_id);
        if (ship_type_id !== null && (!Number.isSafeInteger(ship_type_id) || ship_type_id < 1)) throw new Error('Choose a valid ship type ID.');
        return { id: old?.id || randomUUID(), connection_id: edge.id, link_id: edge.link_id, from_system_id: from, to_system_id: to, occurred_at,
            pilot_name: clean(input.pilot_name, 100), ship_name: clean(input.ship_name, 160), ship_type_id, mass_kg, notes: clean(input.notes, 2000), source: old?.source || 'manual_observation', reviewed: true,
            ...(old?.sample_key ? { sample_key: old.sample_key, sampled_previous_at: old.sampled_previous_at } : {}), created_at: old?.created_at || iso(), updated_at: iso() };
    }
    function comment(map, input) {
        if (!object(input)) throw new Error('Provide a comment.');
        const body = clean(input.body, 4000); if (!body) throw new Error('Write a comment first.');
        const system_id = input.system_id == null ? null : mapNode(map, input.system_id), edge = input.connection_id == null ? null : connection(map, input.connection_id);
        return { id: randomUUID(), body, system_id, connection_id: edge?.id || null, created_at: iso() };
    }
    function ping(map, input) {
        if (!object(input)) throw new Error('Provide a map ping.');
        const duration = input.duration_seconds ?? 300;
        if (!Number.isSafeInteger(duration) || duration < 15 || duration > 3600) throw new Error('A ping lasts between 15 seconds and one hour.');
        return { id: randomUUID(), system_id: mapNode(map, input.system_id), label: clean(input.label, 120), created_at: iso(), expires_at: new Date(now() + duration * 1000).toISOString() };
    }
    function project(id, value, shared = null) {
        const canonical = new Map(getLinks(id, value.id).map(row => [row.id, row]));
        const map = reconcileNodes(id, clone(read(id, 'jspace_map', value.id) || value), canonical), operational = map.kind === 'tracking_source' ? null : operations.state(id, value.id), signatures = operational?.signatures || [];
        const signaturesById = new Map(signatures.map(row => [row.id, row])), signaturesBySystem = new Map(signatures.map(row => [`${row.system_id}:${row.signature_id}`, row])), passagesByEdge = new Map();
        for (const row of map.passages) {
            const aggregate = passagesByEdge.get(row.connection_id) || { count: 0, mass: 0, unweighed: 0 };
            aggregate.count++; aggregate.mass += row.mass_kg || 0; if (row.mass_kg == null) aggregate.unweighed++; passagesByEdge.set(row.connection_id, aggregate);
        }
        map.connections = map.connections.map(edge => {
            const link = canonical.get(edge.link_id);
            const details = edge.kind === 'gate' ? { kind: 'gate', active: true, confirmed: true, accessible: true, expired: false } : link || { kind: edge.kind || 'wormhole', active: false, confirmed: false, accessible: false, expired: true, missing: true };
            const aggregate = passagesByEdge.get(edge.id) || { count: 0, mass: 0, unweighed: 0 };
            const endpointSignature = side => {
                const recordId = link?.[side + '_signature_record_id'] || edge[side + '_signature_id'];
                const signature = recordId ? signaturesById.get(recordId) : signaturesBySystem.get(`${edge[side + '_system_id']}:${link?.[side + '_signature']}`);
                return signature?.system_id === edge[side + '_system_id'] ? signature : null;
            };
            const life_status = link?.life_status || edge.life_status;
            return { ...details, ...edge, life_status, active: details.active === true && life_status !== 'collapsed', updated_at: link?.updated_at || null,
                from_signature: endpointSignature('from')?.signature_id || details.from_signature || '', to_signature: endpointSignature('to')?.signature_id || details.to_signature || '',
                from_signature_id: endpointSignature('from')?.id || null, to_signature_id: endpointSignature('to')?.id || null,
                passage_count: aggregate.count, observed_mass_kg: aggregate.mass, unweighed_passages: aggregate.unweighed,
                remaining_mass_kg: null, mass_disclaimer: 'Only recorded passages are counted. Unobserved travel and variable initial mass prevent a guaranteed remaining-mass estimate.' };
        });
        map.observations = map.observations.map(row => ({ ...row, expired: !!row.expires_at && Date.parse(row.expires_at) <= now(), timer_elapsed: !!row.timer_at && Date.parse(row.timer_at) <= now() }));
        map.pings = map.pings.filter(row => Date.parse(row.expires_at) > now());
        const systems = new Set(map.nodes.map(row => row.system_id));
        map.signatures = signatures.filter(row => systems.has(row.system_id)).map(row => ({ ...row,
            age_ms: Number.isFinite(Date.parse(row.last_seen_at)) ? Math.max(0, now() - Date.parse(row.last_seen_at)) : null,
            stale: row.missing === true || !Number.isFinite(Date.parse(row.last_seen_at)) || now() - Date.parse(row.last_seen_at) > 24 * 3600000,
            connection_ids: map.connections.filter(edge => edge.from_signature_id === row.id || edge.to_signature_id === row.id).map(edge => edge.id) }));
        map.can_undo = (read(id, 'jspace_undo', map.id)?.entries.length || 0) > 0;
        map.operations = operational;
        map.pilots = tracking.projectPilots(map);
        map.read_only = map.kind === 'tracking_source';
        return map;
    }
    function state(characterId) {
        const id = pilot(characterId), rawSource = ensureSource(id);
        const links = rawSource ? new Map(getLinks(id, rawSource.id).map(link => [link.id, link])) : null;
        const source = rawSource ? reconcileNodes(id, loaded(id, rawSource.id), links) : null;
        return { character_id: id, generated_at: iso(), maps: rows(id, 'jspace_map').filter(value => value.kind !== 'tracking_source').map(value => project(id, value)),
            source_map: source ? { id: source.id, name: source.name, kind: 'tracking_source', read_only: true, revision: source.revision,
                node_count: source.nodes.length, connection_count: source.connections.length, nodes: [], connections: [] } : null, limits: LIMITS };
    }
    function blank(input) {
        const name = clean(input.name, 80); if (!name) throw new Error('Give this chain a name.');
        return { id: randomUUID(), name, description: clean(input.description, 4000), track_passages: boolean(input.track_passages), scope: null, scope_version: 2, revision: 1, created_at: iso(), updated_at: iso(), nodes: [], connections: [], passages: [], observations: [], comments: [], pings: [], activity: [], pilots: [] };
    }
    function capacity(map) {
        for (const key of ['nodes', 'connections', 'passages', 'observations', 'comments', 'pings']) array(map[key], LIMITS[key], key);
        if (Buffer.byteLength(JSON.stringify(map)) > LIMITS.document_bytes) throw new Error('This chain is too large. Export older observations before adding more.');
    }
    function log(map, op, summary) { if (map.kind === 'tracking_source' || /^(connection|passage)\./.test(op)) return; map.activity.unshift({ id: randomUUID(), op, summary, at: iso() }); map.activity = map.activity.slice(0, LIMITS.activity); }
    function create(characterId, input = {}) {
        const id = pilot(characterId, true), map = blank(input);
        if (rows(id, 'jspace_map').filter(row => row.kind !== 'tracking_source').length >= LIMITS.maps) throw new Error('Remove a chain before creating more than 24 maps.');
        map.scope = validateJSpaceScope(input.scope, getScopeContext(id));
        const members = [...new Set(array(input.pilot_ids ?? [id], 100, 'tracked pilots').map(value => pilot(value, true)))];
        if (!members.length) throw new Error('Select at least one pilot to track on this map.');
        const copySource = input.source_map_id != null;
        if (copySource && loaded(id, clean(input.source_map_id, 100)).kind !== 'tracking_source') throw new Error('Choose the live source map to populate a new map.');
        for (const member of members) tracking.rosterCommand(id, map, 'pilot.add', { character_id: member });
        log(map, 'map.create', 'Created private chain map'); capacity(map);
        try {
            atomic(() => {
                write(id, 'jspace_map', map); tracking.syncMap(id, map);
                populateScopes(id, map.id, { includeGlobal: copySource, notify: false });
            });
        } catch (error) { tracking.forgetMap(id, map.id); throw error; }
        onChange(id); return project(id, loaded(id, map.id));
    }
    function checkRevision(map, input) { if (!Number.isSafeInteger(input.revision) || input.revision !== map.revision) throw conflict(map.revision); }
    function remove(characterId, key, input = {}) {
        const id = pilot(characterId, true);
        getLinks(id, key);
        atomic(() => { const map = loaded(id, key); editable(map); checkRevision(map, input);
            for (const edge of map.connections) if (edge.kind === 'wormhole' && edge.link_id) deleteLink(id, edge.link_id);
            operations.removeMapScope(id, map.id);
            store.db.prepare('DELETE FROM settings WHERE key=?').run('universe:navigation:' + id + ':' + map.id);
            deleteRow.run(id, 'jspace_map', map.id); deleteRow.run(id, 'jspace_undo', map.id); });
        tracking.forgetMap(id, key); onChange(id); return { id: key, deleted: true };
    }
    function duplicate(characterId, key, input = {}) {
        const id = pilot(characterId, true);
        getLinks(id, key);
        const old = loaded(id, key); checkRevision(old, input);
        const copy = importMap(id, { document: exportMap(id, key), name: clean(input.name || (old.name.slice(0, 73) + ' copy'), 80) });
        return project(id, loaded(id, copy.id));
    }
    function saveConnection(id, map, input) {
        if (!object(input)) throw new Error('Provide a connection observation.');
        const previous = input.id ? connection(map, input.id) : null;
        const link_id = input.link_id ?? previous?.link_id, known = link_id ? getLinks(id, map.id).find(row => row.id === link_id) : null;
        if (link_id && !known) throw new Error('Universe connection not found for this pilot.');
        if (known && input.updated_at != null && input.updated_at !== known.updated_at) throw conflict(map.revision);
        if (boolean(input.add_missing_nodes)) {
            for (const value of [input.from_system_id ?? previous?.from_system_id ?? known?.from_system_id, input.to_system_id ?? previous?.to_system_id ?? known?.to_system_id]) {
                const system_id = system(value);
                if (!map.nodes.some(row => row.system_id === system_id)) map.nodes.push(restoreNode(map, { system_id }));
            }
        }
        const from = mapNode(map, input.from_system_id ?? previous?.from_system_id ?? known?.from_system_id), to = mapNode(map, input.to_system_id ?? previous?.to_system_id ?? known?.to_system_id);
        if (from === to) throw new Error('Choose two different endpoints.');
        if (known && (from !== known.from_system_id || to !== known.to_system_id)) throw new Error('An observed link keeps its original endpoints. Create another connection for a different pair.');
        const kind = choose(input.kind, ['wormhole', 'ansiblex', 'gate'], previous?.kind || known?.kind || 'wormhole');
        if (known && kind !== known.kind) throw new Error('An observed connection keeps its original kind. Add a separate connection for a different type of travel.');
        const life_status = choose(input.life_status, LIFE, known?.life_status || previous?.life_status || 'unknown');
        let link = null;
        if (kind === 'gate') {
            if (!gates.has(`${from}:${to}`)) throw new Error('Only real stargates in the static atlas can be shown as gate connections.');
        } else {
            const supplied = { ...input, map_id: map.id, id: known?.id, kind, life_status, from_system_id: from, to_system_id: to, confirmed: boolean(input.confirmed, known?.confirmed || false), accessible: boolean(input.accessible, known?.accessible || false) };
            if (life_status === 'collapsed') { supplied.enabled = false; supplied.confirmed = false; if (kind === 'wormhole') supplied.duration_hours = 0; }
            link = saveLink(id, supplied);
        }
        if (link?.deleted) {
            if (previous) { markDetached(map, [previous], new Map([[link.id, link.ended_at || link.expires_at || iso()]])); map.connections = map.connections.filter(row => row.id !== previous.id); }
            forgetMapConnections(map, [link]);
            return null;
        }
        const edge = { id: previous?.id || randomUUID(), link_id: link?.id || null, kind, from_system_id: from, to_system_id: to, life_status,
            notes: clean(input.notes ?? previous?.notes, 2000) };
        const signatures = map.kind === 'tracking_source' ? [] : operations.state(id, map.id).signatures;
        for (const side of ['from', 'to']) {
            const signature = signatures.find(row => row.system_id === edge[side + '_system_id'] && row.signature_id === link?.[side + '_signature']);
            if (signature) edge[side + '_signature_id'] = signature.id;
            else if (previous && own(previous, side + '_signature_id') && input[side + '_signature'] === undefined) edge[side + '_signature_id'] = previous[side + '_signature_id'];
        }
        if (!previous && map.connections.some(row => row.link_id && row.link_id === edge.link_id || kind === 'gate' && row.kind === 'gate' && [row.from_system_id, row.to_system_id].sort().join(':') === [from, to].sort().join(':'))) throw new Error('This connection is already on the chain.');
        if (previous) map.connections = map.connections.map(row => row.id === edge.id ? edge : row); else map.connections.push(edge);
        return edge;
    }
    function command(characterId, key, input = {}) {
        const id = pilot(characterId, true), op = clean(input.op, 60);
        getLinks(id, key);
        const result = atomic(() => {
            let map = loaded(id, key); editable(map); checkRevision(map, input);
            const before = clone(map), history = read(id, 'jspace_undo', map.id) || { id: map.id, entries: [] };
            const linksToForget = new Set();
            let undoable = true;
            switch (op) {
                case 'pilot.add':
                case 'pilot.tracking':
                case 'pilot.remove': tracking.rosterCommand(id, map, op, input); undoable = false; break;
                case 'map.update': {
                    if (own(input, 'name')) { map.name = clean(input.name, 80); if (!map.name) throw new Error('Give this chain a name.'); }
                    if (own(input, 'description')) map.description = clean(input.description, 4000);
                    if (own(input, 'track_passages')) map.track_passages = boolean(input.track_passages);
                    if (own(input, 'scope')) map.scope = validateJSpaceScope(input.scope, getScopeContext(id));
                    break;
                }
                case 'node.save': {
                    const source = input.node, previous = map.nodes.find(row => row.system_id === Number(source?.system_id)), next = previous ? node(source, previous, map.nodes.length) : restoreNode(map, source);
                    if (previous?.locked && !next.locked) next.prune_grace_at = iso();
                    if (previous?.locked && (next.x !== previous.x || next.y !== previous.y) && next.locked) throw new Error('Unlock this system before moving it.');
                    if (previous) map.nodes = map.nodes.map(row => row.system_id === next.system_id ? next : row); else map.nodes.push(next);
                    break;
                }
                case 'nodes.position': {
                    const positions = array(input.positions, LIMITS.nodes, 'positions'), seen = new Set();
                    for (const value of positions) {
                        const system_id = mapNode(map, value.system_id), current = map.nodes.find(row => row.system_id === system_id);
                        if (seen.has(system_id)) throw new Error('Provide each system position once.'); seen.add(system_id);
                        if (current.locked) throw new Error('Unlock this system before moving it.');
                        current.x = coordinate(value.x, current.x); current.y = coordinate(value.y, current.y);
                    }
                    break;
                }
                case 'node.remove':
                case 'nodes.remove': {
                    const systemIds = new Set((op === 'node.remove' ? [input.system_id] : array(input.system_ids, LIMITS.nodes, 'systems')).map(value => mapNode(map, value)));
                    if (!systemIds.size) throw new Error('Select at least one system to remove.');
                    if (map.nodes.some(row => systemIds.has(row.system_id) && row.locked)) throw new Error('Unlock this system before removing it.');
                    const attached = new Set(map.connections.filter(row => systemIds.has(row.from_system_id) || systemIds.has(row.to_system_id)).map(row => row.id));
                    for (const edge of map.connections) if (attached.has(edge.id) && edge.kind === 'wormhole' && edge.link_id) linksToForget.add(edge.link_id);
                    markDetached(map, map.connections.filter(row => attached.has(row.id)));
                    archiveNodes(map, systemIds);
                    // Observation history remains private and exportable even when its card is removed.
                    break;
                }
                case 'connection.save': saveConnection(id, map, input.connection); undoable = false; break;
                case 'connection.remove': {
                    const edge = connection(map, input.connection_id);
                    if (edge.link_id) linksToForget.add(edge.link_id);
                    undoable = false;
                    markDetached(map, [edge]);
                    map.connections = map.connections.filter(row => row.id !== edge.id); break;
                }
                case 'passage.add': map.passages.unshift(passage(map, input.passage)); undoable = false; break;
                case 'passage.save': {
                    const previous = map.passages.find(row => row.id === input.passage?.id);
                    if (!previous) throw new Error('Passage not found on this chain.');
                    const value = passage(map, input.passage, previous); map.passages = map.passages.map(row => row.id === value.id ? value : row); undoable = false; break;
                }
                case 'passage.remove': {
                    if (!map.passages.some(row => row.id === input.passage_id)) throw new Error('Passage not found on this chain.');
                    map.passages = map.passages.filter(row => row.id !== input.passage_id); undoable = false; break;
                }
                case 'observation.save': {
                    const previous = input.observation?.id ? map.observations.find(row => row.id === input.observation.id) : null;
                    if (input.observation?.id && !previous) throw new Error('Observation not found on this chain.');
                    const value = observation(map, input.observation, previous);
                    if (previous) map.observations = map.observations.map(row => row.id === value.id ? value : row); else map.observations.unshift(value);
                    break;
                }
                case 'observation.remove': {
                    if (!map.observations.some(row => row.id === input.observation_id)) throw new Error('Observation not found on this chain.');
                    map.observations = map.observations.filter(row => row.id !== input.observation_id); break;
                }
                case 'comment.add': map.comments.unshift(comment(map, input.comment)); break;
                case 'comment.remove': {
                    if (!map.comments.some(row => row.id === input.comment_id)) throw new Error('Comment not found on this chain.');
                    map.comments = map.comments.filter(row => row.id !== input.comment_id); break;
                }
                case 'ping.add': map.pings = map.pings.filter(row => Date.parse(row.expires_at) > now()); map.pings.unshift(ping(map, input.ping)); break;
                case 'ping.remove': map.pings = map.pings.filter(row => row.id !== input.ping_id); break;
                case 'signature.save': {
                    const source = input.signature;
                    if (!object(source)) throw new Error('Provide a signature observation.');
                    const system_id = mapNode(map, source.system_id), edge = source.connection_id ? connection(map, source.connection_id) : null;
                    if (edge) {
                        if (edge.kind !== 'wormhole' || !edge.link_id || ![edge.from_system_id, edge.to_system_id].includes(system_id)) throw new Error('Select a wormhole connected to the signature system.');
                    }
                    const saved = operations.saveSignature(id, { ...source, map_id: map.id, system_id, ...(edge ? { type: 'Wormhole', destination_system_id: edge.from_system_id === system_id ? edge.to_system_id : edge.from_system_id } : {}) }, { observed: !source.id });
                    if (edge) {
                        const side = edge.from_system_id === system_id ? 'from' : 'to';
                        saveLink(id, { id: edge.link_id, [side + '_signature']: saved.signature_id, [side + '_signature_record_id']: saved.id }); edge[side + '_signature_id'] = saved.id;
                    }
                    undoable = false; break;
                }
                case 'signature.remove': {
                    const signature = operations.state(id, map.id).signatures.find(row => row.id === input.signature_id);
                    if (!signature) throw new Error('Signature not found for this pilot.'); mapNode(map, signature.system_id);
                    operations.removeSignature(id, signature.id, map.id); undoable = false; break;
                }
                case 'undo': {
                    if (!history.entries.length) throw new Error('No map annotation or layout change is available to undo.');
                    const restored = history.entries.pop();
                    const coverage = new Map([...map.nodes, ...(map.archived_nodes || [])].map(row => [row.system_id, row.source_coverage || {}]));
                    for (const row of [...restored.nodes, ...(restored.archived_nodes || [])]) {
                        for (const [pilotId, generation] of Object.entries(coverage.get(row.system_id) || {})) {
                            row.source_coverage ||= {};
                            row.source_coverage[pilotId] = Math.max(row.source_coverage[pilotId] || 0, generation);
                        }
                    }
                    map = { ...restored, pilots: map.pilots, revision: map.revision, activity: map.activity, created_at: map.created_at }; break;
                }
                default: throw new Error('Unsupported J-Space command.');
            }
            if (op !== 'undo') {
                if (undoable) { const snapshot = { ...before, activity: [] }; history.entries.push(snapshot); history.entries = history.entries.slice(-LIMITS.undo); }
                else history.entries = [];
            }
            forgetMapConnections(map, []);
            if (op === 'undo') for (const row of map.nodes) if (!before.nodes.some(previous => previous.system_id === row.system_id)) row.prune_grace_at = iso();
            map.revision++; map.updated_at = iso(); log(map, op, op.replaceAll('.', ' ').replaceAll('_', ' ')); capacity(map);
            write(id, 'jspace_map', map); write(id, 'jspace_undo', { ...history, updated_at: iso() });
            for (const linkId of linksToForget) deleteLink(id, linkId);
            return loaded(id, map.id);
        });
        tracking.syncMap(id, result); if (op === 'map.update' || op.startsWith('pilot.')) populateScopes(id, result.id); onChange(id); return project(id, loaded(id, result.id));
    }

    function exportMap(characterId, key, format = 'kairo') {
        const id = pilot(characterId), map = project(id, loaded(id, key));
        if (format === 'wanderer') {
            const status = node => node.role === 'home' ? 8 : node.status === 'friendly' ? 1 : node.status === 'hostile' ? 5 : 0;
            return { version: 1, exported_at: iso(), map: { name: map.name, slug: map.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: map.description },
                systems: map.nodes.map(row => ({ solar_system_id: row.system_id, position: { x: row.x, y: row.y }, name: byId.get(row.system_id).name, custom_name: row.alias, description: row.description,
                    labels: JSON.stringify(row.tags), status: status(row), tag: row.role, temporary_name: row.label, locked: row.locked })),
                connections: map.connections.filter(row => !row.missing && !row.expired && row.active && row.confirmed && row.life_status !== 'collapsed').map(row => ({ source: row.from_system_id, target: row.to_system_id, type: row.kind === 'gate' ? 1 : row.kind === 'ansiblex' ? 2 : 0,
                    mass_status: { stable: 0, reduced: 1, critical: 2 }[row.mass] ?? null, time_status: row.life_status === 'eol' || row.life_status === 'critical' ? 2 : 0,
                    ship_size_type: { small: 0, medium: 1, large: 2, xlarge: 3, capital: 4 }[row.max_ship_size] ?? null, wormhole_type: row.wh_type || null })),
                signatures: map.signatures.map(row => ({ solar_system_id: row.system_id, eve_id: row.signature_id, name: row.name, temporary_name: row.temporary_name || '', description: row.notes,
                    kind: row.kind || 'Cosmic Signature', group: row.type || row.group, type: row.type === 'Wormhole' ? row.wh_type || '' : row.type, custom_info: null })),
                kairo_notice: 'Wanderer portable v1 cannot carry exact expiry, confirmation, observation ages, passages, structures, timers or map comments. Unconfirmed, inactive, expired and collapsed connections are omitted. Review all imported conditions before use.' };
        }
        if (format !== 'kairo') throw new Error('Choose Kairo or Wanderer export format.');
        map.signatures = map.kind === 'tracking_source' ? [] : operations.state(id, map.id).signatures;
        if (map.kind !== 'tracking_source') map.operational_records = operations.exportMapScope(id, map.id);
        for (const card of [...map.nodes, ...(map.archived_nodes || [])]) { delete card.source_coverage; delete card.source_generation; }
        delete map.operations;
        delete map.pilots; delete map.source_generation; delete map.can_undo;
        return { format: 'kairo-jspace', version: 1, exported_at: iso(), map,
            notice: 'Private observations. Importing preserves the diagram but requires reviewing connections before using them for navigation.' };
    }
    function parseDocument(input) {
        let document = input.document;
        if (typeof document === 'string') { if (Buffer.byteLength(document) > LIMITS.document_bytes) throw new Error('Import document is too large.'); try { document = JSON.parse(document); } catch { throw new Error('Provide a valid JSON export.'); } }
        if (!object(document) || Buffer.byteLength(JSON.stringify(document)) > LIMITS.document_bytes) throw new Error('Provide a JSON export no larger than 4 MB.');
        if (document.version !== 1) throw new Error('This export version is not supported.');
        const native = document.format === 'kairo-jspace';
        if (!native && (document.format || !object(document.map) || !Array.isArray(document.systems) || !Array.isArray(document.connections))) throw new Error('Use a Kairo J-Space or Wanderer version 1 map export.');
        return { document, native };
    }
    function prepareImport(id, input) {
        const { document, native } = parseDocument(input), source = document.map;
        if (!object(source)) throw new Error('The map document is missing.');
        const map = blank({ name: input.name || source.name, description: source.description }), warnings = [], links = [], signatureRows = [], edgeIds = new Map(), deadSignatures = new Set(), deadSignatureKeys = new Set();
        map.scope = validateJSpaceScope(native ? source.scope : null, getScopeContext(id));
        const operational_records = operations.validateMapScopeImport(native ? source.operational_records : null);
        const sourceNodes = array(native ? source.nodes : document.systems, LIMITS.nodes, 'systems');
        const seen = new Set();
        for (const [index, row] of sourceNodes.entries()) {
            if (!object(row)) throw new Error('Each imported system must be an object.');
            let translated = row;
            if (!native) {
                let labels = row.labels || [];
                if (typeof labels === 'string') { try { labels = JSON.parse(labels); } catch { labels = [labels]; } }
                if (!Array.isArray(labels)) labels = [String(labels)];
                const names = ['unknown', 'friendly', 'warning', 'primary target', 'secondary target', 'dangerous primary', 'dangerous secondary', 'looking for', 'home'];
                translated = { system_id: row.solar_system_id, x: row.position?.x, y: row.position?.y, alias: row.custom_name || '', label: row.temporary_name || '', description: row.description || '', locked: row.locked ?? false,
                    role: row.status === 8 ? 'home' : '', status: row.status === 1 ? 'friendly' : [5, 6].includes(row.status) ? 'hostile' : 'unknown',
                    tags: [...labels.map(value => typeof value === 'string' ? value : JSON.stringify(value)), row.tag || '', names[row.status] || ''].filter(Boolean).slice(0, 20) };
            }
            const value = node(translated, null, index);
            if (seen.has(value.system_id)) throw new Error('The export contains a duplicate system.'); seen.add(value.system_id); map.nodes.push(value);
        }
        if (native) {
            map.archived_nodes = array(source.archived_nodes || [], byId.size, 'archived systems').map(row => {
                const value = node(row);
                if (seen.has(value.system_id)) throw new Error('The export contains a duplicate archived system.');
                seen.add(value.system_id); return { ...value, disconnected_at: iso() };
            });
        }
        const forgetImportedSignatures = row => {
            for (const side of ['from', 'to']) {
                const recordId = row[side + '_signature_record_id'] || row[side + '_signature_id'];
                if (recordId) deadSignatures.add(recordId);
                else if (row[side + '_signature']) deadSignatureKeys.add(`${row[side + '_system_id']}:${row[side + '_signature']}`);
            }
        };
        if (native) for (const row of array(source.archived_connections || [], 10000, 'archived connections')) forgetImportedSignatures(row);
        const sourceEdges = array(native ? source.connections : document.connections, LIMITS.connections, 'connections');
        for (const row of sourceEdges) {
            if (!object(row)) throw new Error('Each imported connection must be an object.');
            const from = mapNode(map, native ? row.from_system_id : row.source), to = mapNode(map, native ? row.to_system_id : row.target);
            if (from === to) throw new Error('Imported connections require two different systems.');
            const kind = native ? choose(row.kind, ['wormhole', 'ansiblex', 'gate'], 'wormhole') : choose(row.type ?? 0, [0, 1, 2], 0) === 1 ? 'gate' : row.type === 2 ? 'ansiblex' : 'wormhole';
            const expiry = native ? Date.parse(row.expires_at) : NaN;
            if (kind === 'wormhole' && (row.life_status === 'collapsed' || native && (row.expired === true || Number.isFinite(expiry) && expiry <= now()))) {
                forgetImportedSignatures(row); warnings.push('Expired and collapsed connections and their associated data are omitted.'); continue;
            }
            const edge = { id: randomUUID(), link_id: null, from_system_id: from, to_system_id: to, kind, life_status: native ? choose(row.life_status, LIFE, 'unknown') : [1, 2, 3].includes(row.time_status) ? 'eol' : 'unknown', notes: native ? clean(row.notes, 2000) : 'Imported Wanderer connection; review current conditions.' };
            if (native && row.id) { if (edgeIds.has(row.id)) throw new Error('Duplicate imported connection ID.'); edgeIds.set(row.id, edge.id); }
            if (kind === 'gate') {
                if (!gates.has(`${from}:${to}`)) throw new Error('An imported gate is absent from the static atlas.');
            } else {
                const candidate = { kind, map_id: map.id, from_system_id: from, to_system_id: to, label: native ? clean(row.label, 160) : '', confirmed: false, accessible: false, enabled: true,
                    life_status: edge.life_status, mass: native ? choose(row.mass, ['unknown', 'stable', 'reduced', 'critical'], 'unknown') : ['stable', 'reduced', 'critical'][row.mass_status] || 'unknown',
                    ...(native && row.life_band && row.life_observed_at ? {life_band:row.life_band, life_observed_at:row.life_observed_at} : {}),
                    wh_type: native ? clean(row.wh_type, 16) : clean(row.wormhole_type, 16), from_signature: native ? clean(row.from_signature, 16) : '', to_signature: native ? clean(row.to_signature, 16) : '',
                    max_ship_size: native ? row.max_ship_size : ['small', 'medium', 'large', 'xlarge', 'capital'][row.ship_size_type] || null,
                    type_status: 'unavailable', reported_source: native ? 'Kairo map import' : 'Wanderer map import', observed_at: native ? row.observed_at || null : null };
                // A portable diagram cannot establish a live lifetime. Unknown is not expired:
                // retain it unconfirmed and unroutable until an observer supplies a lifetime.
                if (kind === 'wormhole' && Number.isFinite(expiry) && expiry > now() && expiry <= now() + 48 * 3600000) candidate.expires_at = new Date(expiry).toISOString();
                else if (kind === 'wormhole') candidate.expires_at = null;
                const prepared = validateLink(id, candidate, map);
                // A duration label describes the imported observation; do not rebase its expiry.
                if (native && kind === 'wormhole' && [1, 4, 4.5, 16, 24, 48].includes(row.duration_hours)) prepared.duration_hours = row.duration_hours;
                prepared.source = 'import'; edge.link_id = prepared.id; links.push(prepared);
            }
            map.connections.push(edge);
        }
        if (links.length) warnings.push('Imported connections are unconfirmed and inaccessible for routing until reviewed. Missing lifetime evidence remains unknown; static class badges never create connections.');
        const signatures = array(native ? source.signatures || [] : document.signatures || [], 1000, 'signatures'), sigKeys = new Set();
        for (const row of signatures) {
            if (!object(row)) throw new Error('Each imported signature must be an object.');
            if (native && (deadSignatures.has(row.id) || deadSignatureKeys.has(`${row.system_id}:${row.signature_id}`))) continue;
            const system_id = system(native ? row.system_id : row.solar_system_id), signature_id = clean(native ? row.signature_id : row.eve_id, 16).toUpperCase();
            if (![...map.nodes, ...(map.archived_nodes || [])].some(node => node.system_id === system_id)) {
                map.archived_nodes ||= []; map.archived_nodes.push(node({ system_id }));
            }
            if (!/^[A-Z0-9]{3}-\d{3}$/.test(signature_id)) throw new Error('Imported signature IDs must use the EVE format ABC-123.');
            const key = `${system_id}:${signature_id}`; if (sigKeys.has(key)) throw new Error('The export contains duplicate signatures.'); sigKeys.add(key);
            const last_seen_at = native ? date(row.last_seen_at) : null, first_seen_at = native ? date(row.first_seen_at, iso()) : iso();
            if ([first_seen_at, last_seen_at].some(value => value && Date.parse(value) > now() + 300000)) throw new Error('Imported signature observations cannot be in the future.');
            const kind = choose(row.kind, ['Cosmic Signature', 'Cosmic Anomaly'], 'Cosmic Signature'), type = clean(native ? row.type : row.group, 240);
            const wh_type = type === 'Wormhole' ? clean(native ? row.wh_type : row.type, 16).toUpperCase() || null : null;
            if (wh_type && !getWormholeType(wh_type)) throw new Error('The imported signature has an unknown wormhole type: ' + wh_type);
            const destination_system_id = native && row.destination_system_id != null ? system(row.destination_system_id) : null;
            if (destination_system_id === system_id) throw new Error('An imported signature destination must be another system.');
            let notes = clean(native ? row.notes : row.description, 2000);
            if (!native && row.custom_info) {
                const detail = clean(typeof row.custom_info === 'string' ? row.custom_info : JSON.stringify(row.custom_info), 4000);
                notes = (notes + '\nImported Wanderer signature metadata (unverified): ' + detail).trim().slice(0, 2000);
                warnings.push('Wanderer signature condition metadata is preserved as unverified notes; it does not create a destination or route.');
            }
            const bookmark_index = native ? row.bookmark_index : undefined;
            if (bookmark_index !== undefined && (!Number.isSafeInteger(bookmark_index) || bookmark_index < 0 || bookmark_index > 1_000_000)) throw new Error('Imported bookmark indexes must be between 0 and 1,000,000.');
            signatureRows.push({ system_id, signature_id, kind, group: native ? clean(row.group, 240) || kind : kind, type, name: clean(row.name, 240), notes, first_seen_at, last_seen_at,
                wh_type, destination_system_id, ...(bookmark_index === undefined ? {} : { bookmark_index }), temporary_name: clean(row.temporary_name, 80),
                bookmark_chain: native ? clean(row.bookmark_chain, 64) : '', bookmark_chain_letters: native ? clean(row.bookmark_chain_letters, 64) : '', is_return_hole: native ? boolean(row.is_return_hole) : false });
        }
        if (signatureRows.length) warnings.push('Existing signature observations with the same system and signature ID are preserved. Imported signatures are marked missing until rescanned.');
        if (native) {
            for (const row of array(source.observations || [], LIMITS.observations, 'observations')) {
                const historyMap = { ...map, nodes: [...map.nodes, { system_id: system(row.system_id) }] };
                const saved = observation(historyMap, row);
                saved.created_at = date(row.created_at, saved.created_at); saved.updated_at = date(row.updated_at, saved.updated_at); map.observations.push(saved);
            }
            for (const row of array(source.comments || [], LIMITS.comments, 'comments')) {
                const connection_id = row.connection_id ? edgeIds.get(row.connection_id) : null;
                if (row.connection_id && !connection_id) continue;
                const historyMap = { ...map, nodes: row.system_id == null ? map.nodes : [...map.nodes, { system_id: system(row.system_id) }] };
                const saved = comment(historyMap, { ...row, connection_id });
                saved.created_at = date(row.created_at, saved.created_at); map.comments.push(saved);
            }
            for (const row of array(source.passages || [], LIMITS.passages, 'passages')) {
                const connection_id = edgeIds.get(row.connection_id);
                if (!connection_id) continue;
                const saved = passage(map, { ...row, connection_id });
                if (row.source === 'sampled_location') { saved.source = 'sampled_location'; saved.reviewed = boolean(row.reviewed); saved.sampled_previous_at = date(row.sampled_previous_at); }
                saved.created_at = date(row.created_at, saved.created_at); saved.updated_at = date(row.updated_at, saved.updated_at); map.passages.push(saved);
            }
        }
        capacity(map);
        if (signatureRows.length > 1000) throw new Error('This import would exceed the 1,000-signature limit.');
        return { map, links, signatures: signatureRows, operational_records, format: native ? 'kairo-jspace' : 'wanderer-v1', warnings: [...new Set(warnings)] };
    }
    function previewImport(characterId, input = {}) {
        const id = pilot(characterId, true);
        try { const prepared = prepareImport(id, input); return { valid: true, format: prepared.format, name: prepared.map.name,
            counts: { systems: prepared.map.nodes.length, connections: prepared.map.connections.length, signatures: prepared.signatures.length, observations: prepared.map.observations.length, passages: prepared.map.passages.length, comments: prepared.map.comments.length }, warnings: prepared.warnings, errors: [] }; }
        catch (error) { return { valid: false, format: null, name: null, counts: null, warnings: [], errors: [error.message] }; }
    }
    function importMap(characterId, input = {}) {
        const id = pilot(characterId, true);
        const map = atomic(() => {
            if (rows(id, 'jspace_map').filter(row => row.kind !== 'tracking_source').length >= LIMITS.maps) throw new Error('Remove a chain before importing more than 24 maps.');
            const prepared = prepareImport(id, input);
            tracking.rosterCommand(id, prepared.map, 'pilot.add', { character_id: id });
            write(id, 'jspace_map', prepared.map);
            operations.importMapScope(id, prepared.map.id, prepared.operational_records);
            for (const link of prepared.links) write(id, 'link', link);
            const existing = new Set(operations.state(id, prepared.map.id).signatures.map(row => `${row.system_id}:${row.signature_id}`));
            for (const signature of prepared.signatures) if (!existing.has(`${signature.system_id}:${signature.signature_id}`)) {
                const saved = operations.saveSignature(id, { ...signature, map_id: prepared.map.id, missing: true });
                // Scanner APIs own these records. Import preserves historical ages instead of pretending
                // that importing a portable file was a new scan of the system.
                saved.first_seen_at = signature.first_seen_at; saved.last_seen_at = signature.last_seen_at; saved.imported_at = iso();
                store.db.prepare('UPDATE universe_operations_records SET body=? WHERE character_id=? AND kind=? AND id=?').run(JSON.stringify(saved), id, 'signature:map:' + prepared.map.id, saved.id);
            }
            const signatures = operations.state(id, prepared.map.id).signatures;
            for (const edge of prepared.map.connections) {
                const link = prepared.links.find(row => row.id === edge.link_id); if (!link || link.kind !== 'wormhole') continue;
                for (const side of ['from', 'to']) {
                    const signature = signatures.find(row => row.system_id === edge[side + '_system_id'] && row.signature_id === link[side + '_signature']);
                    if (signature) { link[side + '_signature_record_id'] = signature.id; edge[side + '_signature_id'] = signature.id; }
                }
                write(id, 'link', link);
            }
            log(prepared.map, 'map.import', 'Imported ' + prepared.format + ' map; connections need review'); write(id, 'jspace_map', prepared.map); return prepared.map;
        });
        tracking.syncMap(id, map); onChange(id); return project(id, map);
    }
    return { state, map: (characterId, key) => { const id = pilot(characterId); return project(id, loaded(id, key)); }, create, command, remove, duplicate, exportMap, previewImport, importMap, observeLocation, setActivePilot, cleanupSources, forgetConnections, migrateScopes };
}
