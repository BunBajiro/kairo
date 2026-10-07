import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { createIntelParser, gateDistances, parseSignatureClipboard } from './universe-intel.mjs';
import { getWormholeType } from './universe-wormholes.mjs';
import { BOOKMARK_DEFAULT, validateBookmarkTemplate, validateBookmarkMapping } from '../components/kairo/universe-signature-bookmarks.mjs';
import { createUniverseLogTail } from './universe-log-tail.mjs';
import { parseUpgradeImport, exportUpgrades as formatUpgradeExport } from './universe-upgrades.mjs';

const FLEET_SCOPE = 'esi-fleets.read_fleet.v1';
const DEFAULTS = { version: 1, enabled: true, logs_enabled: false, log_directory: '', intel_channels: ['Int'], ignore_keywords: ['status'],
    alert_keywords: [], clear_keywords: ['clear', 'clr'], alerts_enabled: true, alert_combat: true, alert_decloak: true, alert_decloak_observatory: true, alert_decloak_gate: true, alert_unknown: false,
    danger_jumps: 5, watched_system_ids: [], intel_expiry_minutes: 15, alert_cooldown_seconds: 60, fleet_enabled: false, location_source: 'esi', bookmark_template: BOOKMARK_DEFAULT, bookmark_custom_mapping: {}, bookmark_start_at_zero: false, bookmark_return_symbol: '↩' };
const arr = value => Array.isArray(value) ? value : [];
const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const validId = value => Number.isSafeInteger(value) && value > 0 && value < 2147483647;
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
const finiteDate = value => Number.isFinite(Date.parse(value));
const clone = value => JSON.parse(JSON.stringify(value));

export function createUniverseOperations(store, auth, esi, options = {}) {
    const { atlas, publish = () => {}, onChange = () => {} } = options, now = options.now || Date.now;
    if (!atlas?.systems) throw new Error('Universe operations require a static atlas.');
    const byId = atlas.bySystemId || new Map(atlas.systems.map(system => [system.system_id, system]));
    const byName = atlas.bySystemName || new Map(atlas.systems.map(system => [system.name.toLowerCase(), system]));
    const parseIntel = createIntelParser(atlas), cooldowns = new Map(), fleetNext = new Map(), fleetBusy = new Set(), fleetFlights = new Map(), logPilots = new Set();
    let closed = false, ticking = false, fleetCursor = 0, tickFlight = null;
    store.db.exec(`CREATE TABLE IF NOT EXISTS universe_operations_records(
        character_id INTEGER NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,
        PRIMARY KEY(character_id,kind,id));
        CREATE INDEX IF NOT EXISTS idx_universe_operations_records ON universe_operations_records(character_id,kind,updated_at DESC);`);
    const getRows = store.db.prepare('SELECT body FROM universe_operations_records WHERE character_id=? AND kind=? ORDER BY updated_at DESC,id LIMIT 1001');
    const getRow = store.db.prepare('SELECT body FROM universe_operations_records WHERE character_id=? AND kind=? AND id=?');
    const putRow = store.db.prepare('INSERT INTO universe_operations_records VALUES(?,?,?,?,?) ON CONFLICT(character_id,kind,id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at');
    const delRow = store.db.prepare('DELETE FROM universe_operations_records WHERE character_id=? AND kind=? AND id=?');
    const trimRows = store.db.prepare('DELETE FROM universe_operations_records WHERE character_id=? AND kind=? AND id NOT IN (SELECT id FROM universe_operations_records WHERE character_id=? AND kind=? ORDER BY updated_at DESC,id LIMIT ?)');
    const parse = row => row ? JSON.parse(row.body) : null;
    const rows = (id, kind) => getRows.all(id, kind).map(parse);
    const row = (id, kind, key) => parse(getRow.get(id, kind, String(key)));
    const iso = () => new Date(now()).toISOString();
    const character = (id, roster) => roster ? roster.byId.get(id) : auth.characters().find(pilot => pilot.id === id);
    function pilotId(value, roster) {
        const id = Number(value ?? 0);
        if (!Number.isSafeInteger(id) || id < 0 || id && !character(id, roster)) throw new Error('Choose a connected pilot.');
        return id;
    }
    function systemId(value) {
        const id = Number(value); if (!byId.has(id)) throw new Error('Choose a system in the universe map.'); return id;
    }
    const wormholeSystem = value => byId.get(Number(value))?.space === 'wormhole';
    const scopedKind = (kind, mapId) => mapId ? kind + ':map:' + mapId : kind;
    function mapScope(id, value, write = false) {
        if (value == null || value === '') return null;
        if (typeof value !== 'string' || value.length > 160 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Choose a J-Space map for this pilot.');
        const exists = store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='universe_records'").get();
        const map = exists ? parse(store.db.prepare("SELECT body FROM universe_records WHERE character_id=? AND kind='jspace_map' AND id=?").get(id, value)) : null;
        if (!map) throw new Error('Choose a J-Space map for this pilot.');
        if (write && map.kind === 'tracking_source') throw new Error('Followed discovery maps are read-only.');
        return value;
    }
    function observationSystem(value, mapId) {
        const id = systemId(value);
        if (!mapId && wormholeSystem(id)) throw new Error('Choose a J-Space map before recording this system.');
        return id;
    }
    function migrateMapScopes() {
        if (store.get('universe:operations:map_scopes:version', 0) >= 1 || !store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='universe_records'").get()) return;
        store.db.exec('SAVEPOINT operations_map_scopes');
        try {
            const maps = store.db.prepare("SELECT character_id,body FROM universe_records WHERE kind='jspace_map'").all().map(record => ({ id: record.character_id, map: parse(record) }));
            const legacy = store.db.prepare("SELECT character_id,kind,id,body FROM universe_operations_records WHERE kind IN ('signature','signature_deleted','intel','alert','upgrade')").all();
            for (const record of legacy) {
                const item = parse(record), systems = record.kind === 'signature_deleted' ? [item.signature?.system_id] : item.system_ids || [item.system_id];
                for (const { id, map } of maps) {
                    if (id !== record.character_id || map.kind === 'tracking_source') continue;
                    const mapped = new Set([...arr(map.nodes), ...arr(map.archived_nodes)].map(node => node.system_id));
                    if (!systems.some(system => mapped.has(system))) continue;
                    const kind = scopedKind(record.kind, map.id);
                    if (!row(id, kind, item.id)) put(id, kind, { ...item, map_id: map.id, ...(record.kind === 'signature_deleted' ? { signature: { ...item.signature, map_id: map.id } } : {}) });
                }
                if (systems.some(wormholeSystem)) delRow.run(record.character_id, record.kind, record.id);
            }
            store.set('universe:operations:map_scopes:version', 1);
            store.db.exec('RELEASE operations_map_scopes');
        } catch (error) { store.db.exec('ROLLBACK TO operations_map_scopes; RELEASE operations_map_scopes'); throw error; }
    }
    function removeMapScope(characterId, value) {
        const id = pilotId(characterId), mapId = mapScope(id, value, true);
        if (!mapId) throw new Error('Choose a J-Space map for this pilot.');
        for (const kind of ['signature', 'signature_deleted', 'intel', 'alert', 'upgrade']) store.db.prepare('DELETE FROM universe_operations_records WHERE character_id=? AND kind=?').run(id, scopedKind(kind, mapId));
    }
    function copyMapScope(characterId, fromMapId, toMapId) {
        const id = pilotId(characterId), source = mapScope(id, fromMapId, true), destination = mapScope(id, toMapId, true);
        if (!source || !destination || source === destination) throw new Error('Choose two different J-Space maps for this pilot.');
        const kinds = ['intel', 'alert', 'upgrade'];
        if (kinds.some(kind => rows(id, scopedKind(kind, destination)).length)) throw new Error('Copy observations into a new map.');
        store.db.exec('SAVEPOINT operations_map_copy');
        try {
            const intelIds = new Map();
            for (const kind of kinds) for (const item of rows(id, scopedKind(kind, source))) {
                if (kind === 'alert' && !intelIds.has(item.intel_id)) continue;
                const copy = { ...item, id: randomUUID(), map_id: destination };
                if (kind === 'intel') intelIds.set(item.id, copy.id);
                if (kind === 'alert') copy.intel_id = intelIds.get(item.intel_id);
                put(id, scopedKind(kind, destination), copy, kind === 'alert' ? 250 : kind === 'intel' ? 500 : 1000);
            }
            store.db.exec('RELEASE operations_map_copy');
        } catch (error) { store.db.exec('ROLLBACK TO operations_map_copy; RELEASE operations_map_copy'); throw error; }
        changed(id);
    }
    const portableFields = {
        intel: ['id', 'source', 'kind', 'decloak_cause', 'channel', 'text', 'system_ids', 'ambiguous_systems', 'observed_at', 'character_name', 'received_at', 'expires_at', 'imported_at'],
        alert: ['id', 'intel_id', 'kind', 'decloak_cause', 'reason', 'system_ids', 'distance', 'created_at', 'expires_at', 'acknowledged_at', 'imported_at'],
        upgrade: ['id', 'system_id', 'slot', 'name', 'level', 'online', 'notes', 'updated_at', 'imported_at'],
    };
    function exportMapScope(characterId, value) {
        const id = pilotId(characterId), mapId = mapScope(id, value);
        if (!mapId) throw new Error('Choose a J-Space map for this pilot.');
        const pick = (kind, item) => Object.fromEntries(portableFields[kind].filter(key => item[key] !== undefined).map(key => [key, item[key]]));
        const intel = rows(id, scopedKind('intel', mapId)), intelIds = new Set(intel.map(item => item.id));
        return { version: 1, intel: intel.map(item => pick('intel', item)),
            alerts: rows(id, scopedKind('alert', mapId)).filter(item => intelIds.has(item.intel_id)).map(item => pick('alert', item)),
            upgrades: rows(id, scopedKind('upgrade', mapId)).map(item => pick('upgrade', item)) };
    }
    function validateMapScopeImport(input) {
        if (input == null) return { version: 1, intel: [], alerts: [], upgrades: [] };
        const object = value => value && typeof value === 'object' && !Array.isArray(value);
        if (!object(input) || input.version !== 1 || Object.keys(input).some(key => !['version', 'intel', 'alerts', 'upgrades'].includes(key))) throw new Error('Provide supported map operational records.');
        const text = (value, max, required = false) => {
            if (value == null && !required) return '';
            if (typeof value !== 'string' || value.length > max || required && !value.trim()) throw new Error('Map operational records contain an invalid text field.');
            return value;
        };
        const timestamp = (value, { future = false, nullable = false } = {}) => {
            if (value == null && nullable) return null;
            if (typeof value !== 'string' || !finiteDate(value) || !future && Date.parse(value) > now() + 300000) throw new Error('Map operational records contain an invalid observation time.');
            return new Date(value).toISOString();
        };
        const select = (value, allowed, fallback = null) => {
            if (value == null && fallback !== undefined) return fallback;
            if (!allowed.includes(value)) throw new Error('Map operational records contain an unsupported condition.');
            return value;
        };
        const systems = value => {
            if (!Array.isArray(value) || value.length > 100) throw new Error('Map operational records contain invalid system references.');
            return [...new Set(value.map(systemId))].sort((a, b) => a - b);
        };
        const kinds = ['report', 'hostile', 'clear', 'question', 'combat', 'decloak'];
        const records = (key, limit, validate) => {
            if (!Array.isArray(input[key] ?? []) || (input[key]?.length || 0) > limit) throw new Error('Too many or invalid map ' + key + ' records.');
            const ids = new Set();
            return (input[key] || []).map(item => {
                if (!object(item)) throw new Error('Each map operational record must be an object.');
                const id = text(item.id, 160, true);
                if (ids.has(id)) throw new Error('Duplicate map operational record ID.'); ids.add(id);
                return { id, ...validate(item) };
            });
        };
        const intel = records('intel', 500, item => {
            if (!Array.isArray(item.ambiguous_systems ?? []) || (item.ambiguous_systems?.length || 0) > 200) throw new Error('Map intel has invalid unresolved systems.');
            const observed_at = timestamp(item.observed_at), expires_at = timestamp(item.expires_at, { future: true });
            if (Date.parse(expires_at) <= Date.parse(observed_at) || Date.parse(expires_at) > Date.parse(observed_at) + 86400000) throw new Error('Map intel has an invalid expiry.');
            return { source: select(item.source, ['manual', 'chat_log', 'game_log'], 'manual'), kind: select(item.kind, kinds, 'report'),
                decloak_cause: select(item.decloak_cause, ['observatory', 'gate', 'other']), channel: text(item.channel, 100), text: text(item.text, 16000, true),
                system_ids: systems(item.system_ids), ambiguous_systems: (item.ambiguous_systems || []).map(value => text(value, 160)),
                observed_at, received_at: timestamp(item.received_at), expires_at, character_name: item.character_name == null ? null : text(item.character_name, 160) };
        });
        const intelById = new Map(intel.map(item => [item.id, item]));
        const alerts = records('alerts', 250, item => {
            const intel_id = text(item.intel_id, 160, true), report = intelById.get(intel_id);
            if (!report) throw new Error('Map alert refers to missing intel.');
            if (item.distance != null && (!Number.isInteger(item.distance) || item.distance < 0 || item.distance > 20)) throw new Error('Map alert has an invalid distance.');
            const expires_at = timestamp(item.expires_at, { future: true });
            if (Date.parse(expires_at) !== Date.parse(report.expires_at)) throw new Error('Map alert expiry does not match its observation.');
            return { intel_id, kind: select(item.kind, kinds, 'report'), decloak_cause: select(item.decloak_cause, ['observatory', 'gate', 'other']),
                reason: text(item.reason, 4000), system_ids: systems(item.system_ids), distance: item.distance ?? null,
                created_at: timestamp(item.created_at), expires_at, acknowledged_at: timestamp(item.acknowledged_at, { nullable: true }) };
        });
        const slots = new Set();
        const upgrades = records('upgrades', 1000, item => {
            const system_id = systemId(item.system_id), key = system_id + ':' + item.slot;
            if (!Number.isInteger(item.slot) || item.slot < 1 || item.slot > 100 || !Number.isInteger(item.level) || item.level < 0 || item.level > 5 || typeof item.online !== 'boolean' || slots.has(key)) throw new Error('Map infrastructure contains an invalid or duplicate slot.');
            slots.add(key);
            return { system_id, slot: item.slot, name: text(item.name, 240, true), level: item.level, online: item.online, notes: text(item.notes, 2000), updated_at: timestamp(item.updated_at) };
        });
        return { version: 1, intel, alerts, upgrades };
    }
    function importMapScope(characterId, value, input) {
        const id = pilotId(characterId), mapId = mapScope(id, value, true);
        if (!mapId) throw new Error('Choose a J-Space map for this pilot.');
        const prepared = validateMapScopeImport(input), collections = [['intel', prepared.intel, 500], ['alert', prepared.alerts, 250], ['upgrade', prepared.upgrades, 1000]];
        if (collections.some(([kind]) => rows(id, scopedKind(kind, mapId)).length)) throw new Error('Import observations into a new map.');
        const intelIds = new Map();
        store.db.exec('SAVEPOINT operations_map_import');
        try {
            for (const [kind, items, limit] of collections) for (const item of items) {
                const copy = { ...item, id: randomUUID(), map_id: mapId, imported_at: iso() };
                if (kind === 'intel') {
                    intelIds.set(item.id, copy.id);
                    copy.identity = hash([copy.source, copy.channel.toLowerCase(), copy.text.toLowerCase(), copy.system_ids.join(',')].join('|'));
                }
                if (kind === 'alert') copy.intel_id = intelIds.get(item.intel_id);
                put(id, scopedKind(kind, mapId), copy, limit);
            }
            store.db.exec('RELEASE operations_map_import');
        } catch (error) { store.db.exec('ROLLBACK TO operations_map_import; RELEASE operations_map_import'); throw error; }
        // Portable observations are historical evidence, never a new live alert or collection trigger.
        return { intel: prepared.intel.length, alerts: prepared.alerts.length, upgrades: prepared.upgrades.length };
    }
    function put(id, kind, record, limit = 1000) {
        putRow.run(id, kind, record.id, JSON.stringify(record), record.updated_at || record.received_at || record.created_at || iso());
        trimRows.run(id, kind, id, kind, limit); return record;
    }
    function changed(id) { onChange(id); }
    function config(characterId, roster) {
        const id = pilotId(characterId, roster);
        return { ...clone(DEFAULTS), ...store.get('universe:operations:config:' + id, {}) };
    }
    function validateConfig(id, input) {
        const out = clone(DEFAULTS);
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose valid Universe operations settings.');
        for (const key of ['enabled', 'logs_enabled', 'fleet_enabled', 'alerts_enabled', 'alert_combat', 'alert_decloak', 'alert_decloak_observatory', 'alert_decloak_gate', 'alert_unknown']) {
            if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new Error(key + ' must be enabled or disabled.');
            if (input[key] !== undefined) out[key] = input[key];
        }
        out.log_directory = clean(input.log_directory, 1500);
        if (out.log_directory && (!isAbsolute(out.log_directory) || out.log_directory.includes('\0'))) throw new Error('Choose an absolute EVE log directory.');
        if (out.logs_enabled && !out.log_directory) throw new Error('Choose the EVE log directory before enabling log monitoring.');
        if (!id && (out.logs_enabled || out.fleet_enabled)) throw new Error('Connect a pilot before enabling logs or fleet access.');
        if (input.location_source !== undefined && !['esi', 'logs', 'prefer_esi'].includes(input.location_source)) throw new Error('Choose ESI, logs, or ESI with a log fallback for location.');
        out.location_source = input.location_source || 'esi';
        out.bookmark_template = validateBookmarkTemplate(input.bookmark_template ?? DEFAULTS.bookmark_template);
        out.bookmark_custom_mapping = validateBookmarkMapping(input.bookmark_custom_mapping ?? {});
        if (input.bookmark_start_at_zero !== undefined && typeof input.bookmark_start_at_zero !== 'boolean') throw new Error('Choose whether bookmark indices start at zero.');
        out.bookmark_start_at_zero = input.bookmark_start_at_zero === true;
        if (input.bookmark_return_symbol != null && (typeof input.bookmark_return_symbol !== 'string' || input.bookmark_return_symbol.length > 32 || /[\u0000-\u001f\u007f]/.test(input.bookmark_return_symbol))) throw new Error('Use at most 32 printable characters for the return-hole symbol.');
        out.bookmark_return_symbol = input.bookmark_return_symbol ?? '↩';
        for (const key of ['intel_channels', 'ignore_keywords', 'alert_keywords', 'clear_keywords']) {
            if (input[key] !== undefined && (!Array.isArray(input[key]) || input[key].length > 32)) throw new Error('Use at most 32 ' + key.replaceAll('_', ' ') + '.');
            out[key] = input[key] === undefined ? out[key] : [...new Set(input[key].map(item => clean(item, 100)).filter(Boolean))];
        }
        if (out.logs_enabled && !out.intel_channels.length) throw new Error('Choose at least one intel channel.');
        for (const [key, min, max] of [['danger_jumps', 0, 20], ['intel_expiry_minutes', 1, 1440], ['alert_cooldown_seconds', 0, 3600]]) {
            if (input[key] !== undefined && (!Number.isInteger(input[key]) || input[key] < min || input[key] > max)) throw new Error(key.replaceAll('_', ' ') + ' must be between ' + min + ' and ' + max + '.');
            if (input[key] !== undefined) out[key] = input[key];
        }
        if (input.watched_system_ids !== undefined && (!Array.isArray(input.watched_system_ids) || input.watched_system_ids.length > 100)) throw new Error('Watch at most 100 systems.');
        out.watched_system_ids = [...new Set(arr(input.watched_system_ids).map(systemId))].sort((a, b) => a - b);
        return out;
    }
    function configureLogs(id, cfg) {
        const pilot = character(id);
        logPilots.add(id);
        tail.configure(id, { enabled: store.get('module:universe', true) && !!pilot && !pilot.needsReauth && cfg.enabled && cfg.logs_enabled,
            directory: cfg.log_directory, channels: cfg.location_source === 'esi' ? cfg.intel_channels : [...new Set([...cfg.intel_channels, 'Local'])], characterName: pilot?.name || '' });
    }
    function saveConfig(characterId, input) {
        const id = pilotId(characterId), cfg = validateConfig(id, input), old = config(id);
        store.set('universe:operations:config:' + id, cfg); configureLogs(id, cfg);
        if (!old.fleet_enabled && cfg.fleet_enabled) fleetNext.delete(id);
        changed(id); return cfg;
    }
    function fresh(sample) {
        return sample?.status === 'ready' && sample.stale !== true && finiteDate(sample.updatedAt) && Date.parse(sample.updatedAt) <= now() + 1000 && Date.parse(sample.expiresAt) > now();
    }
    function location(id, roster) {
        const pilot = character(id, roster), cfg = config(id, roster);
        const empty = (status, source = 'esi') => ({ system_id: null, system_name: null, status, source, updated_at: null, expires_at: null });
        if (!pilot) return empty('disconnected');
        if (!cfg.enabled || !store.get('module:universe', true)) return empty('disabled');
        if (pilot.needsReauth) return empty('reauth_required');
        const sample = store.snapshot(id, 'location'), allowed = store.get('module:pilot', true) && arr(pilot.scopes).includes('esi-location.read_location.v1');
        const system = allowed && ['ready', 'stale'].includes(sample?.status) ? byId.get(Number(sample.data?.solar_system_id)) : null;
        const api = system ? { system_id: system.system_id, system_name: system.name, source: 'esi', status: fresh(sample) ? 'ready' : 'stale', updated_at: sample.updatedAt || null, expires_at: sample.expiresAt || null } : empty(!allowed ? 'missing_scope' : sample?.status || 'waiting');
        if (cfg.location_source === 'esi') return api;
        const logSample = cfg.logs_enabled ? store.snapshot(id, 'universe_log_location') : null;
        const logSystem = byId.get(logSample?.data?.system_id);
        const log = logSystem ? { system_id: logSystem.system_id, system_name: logSystem.name, source: 'chat_log', status: fresh(logSample) ? 'ready' : 'stale', updated_at: logSample.updatedAt, expires_at: logSample.expiresAt } : empty(cfg.logs_enabled ? 'waiting' : 'disabled', 'chat_log');
        if (cfg.location_source === 'logs') return log;
        return api.status === 'ready' ? api : log.status === 'ready' ? log : api.system_id ? api : log;
    }
    function observeLogLocation(id, text) {
        const cfg = config(id);
        if (cfg.location_source === 'esi') return false;
        const match = text.match(/^\[\s*(\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}:\d{2})\s*\]\s*EVE System\s*>\s*Channel changed to Local\s*:\s*(.+?)\s*$/i);
        if (!match) return false;
        const observed = Date.parse(match[1].replaceAll('.', '-').replace(' ', 'T') + 'Z'), system = byName.get(match[2].trim().toLowerCase());
        if (!system || !Number.isFinite(observed) || observed > now() + 1000 || observed + 300000 <= now()) return true;
        const old = store.snapshot(id, 'universe_log_location');
        if (Date.parse(old?.updatedAt) >= observed) return true;
        store.saveSnapshot(id, 'universe_log_location', { status: 'ready', data: { system_id: system.system_id }, updatedAt: new Date(observed).toISOString(), expiresAt: new Date(observed + 300000).toISOString() });
        options.onLocation?.(id); changed(id); return true;
    }
    function pilots(id, roster) {
        if (!id) return [];
        return (roster?.rows || auth.characters()).slice(0, 100).map(pilot => {
            const position = location(pilot.id, roster), online = store.snapshot(pilot.id, 'online'), ship = store.snapshot(pilot.id, 'ship');
            const allowed = store.get('module:pilot', true) && !pilot.needsReauth && config(pilot.id, roster).enabled;
            return { character_id: pilot.id, name: pilot.name, ...position,
                ship_type_id: allowed && arr(pilot.scopes).includes('esi-location.read_ship_type.v1') && fresh(ship) ? ship.data?.ship_type_id || null : null,
                online: allowed && arr(pilot.scopes).includes('esi-location.read_online.v1') && fresh(online) && typeof online.data?.online === 'boolean' ? online.data.online : null };
        });
    }
    function emptyFleet(status, error = null) { return { status, scope: FLEET_SCOPE, fleet_id: null, role: null, members: [], updated_at: null, expires_at: null, error }; }
    function fleetState(id, cfg, roster) {
        const pilot = character(id, roster);
        if (!cfg.enabled || !cfg.fleet_enabled || !store.get('module:universe', true)) return emptyFleet('disabled');
        if (!pilot) return emptyFleet('disconnected');
        if (pilot.needsReauth) return emptyFleet('reauth_required');
        if (!arr(pilot.scopes).includes(FLEET_SCOPE)) return emptyFleet('missing_scope');
        const sample = store.snapshot(id, 'universe_fleet');
        if (!sample) return emptyFleet('waiting');
        const value = { ...emptyFleet(sample.status), ...sample.data, status: sample.status, updated_at: sample.updatedAt || null, expires_at: sample.expiresAt || null, error: sample.error || null };
        if (value.status === 'ready' && !fresh(sample)) value.status = 'stale';
        return value;
    }
    function maybeAlert(id, item, cfg, mapId = null) {
        if (!cfg.enabled || !cfg.alerts_enabled || ['clear', 'question'].includes(item.kind) || Date.parse(item.expires_at) <= now()) return;
        if (item.kind === 'combat' && !cfg.alert_combat || item.kind === 'decloak' && !cfg.alert_decloak) return;
        if (item.decloak_cause === 'observatory' && !cfg.alert_decloak_observatory || item.decloak_cause === 'gate' && !cfg.alert_decloak_gate) return;
        const own = pilots(id).find(pilot => pilot.character_id === id && pilot.status === 'ready' && pilot.online !== false);
        const distances = own?.system_id ? gateDistances(atlas, [own.system_id], cfg.danger_jumps) : new Map();
        const nearby = item.system_ids.filter(system => distances.has(system));
        const watched = item.system_ids.filter(system => cfg.watched_system_ids.includes(system));
        const keywords = cfg.alert_keywords.filter(keyword => item.text.toLowerCase().includes(keyword.toLowerCase()));
        const game = item.source === 'game_log' && ['combat', 'decloak'].includes(item.kind);
        const unknown = cfg.alert_unknown && !item.system_ids.length && item.source !== 'game_log';
        if (!nearby.length && !watched.length && !keywords.length && !game && !unknown) return;
        const key = [id, mapId || '', item.kind, item.decloak_cause || '', item.system_ids.join(','), keywords.join(',')].join(':');
        const since = cooldowns.get(key) || 0;
        if (now() - since < cfg.alert_cooldown_seconds * 1000) return;
        cooldowns.set(key, now());
        if (cooldowns.size > 2000) for (const [old, at] of cooldowns) if (now() - at > 3600000) cooldowns.delete(old);
        while (cooldowns.size > 2000) cooldowns.delete(cooldowns.keys().next().value);
        const distance = nearby.length ? Math.min(...nearby.map(system => distances.get(system))) : null;
        const reason = game ? (item.kind === 'decloak' ? 'Local game log reports decloaking.' : 'Local game log reports combat.') :
            watched.length ? 'Report mentions a watched system.' : nearby.length ? 'Report is within ' + distance + ' gate jumps of your latest position.' : keywords.length ? 'Report contains an alert keyword: ' + keywords.join(', ') : 'Report location could not be resolved.';
        const alert = put(id, scopedKind('alert', mapId), { id: randomUUID(), ...(mapId ? { map_id: mapId } : {}), intel_id: item.id, kind: item.kind, decloak_cause: item.decloak_cause, reason, system_ids: item.system_ids,
            distance, created_at: iso(), expires_at: item.expires_at, acknowledged_at: null }, 250);
        publish({ type: 'universe.operational_alert', module: 'universe', characterId: id, summary: reason,
            payload: { private: true, alert_id: alert.id, kind: item.kind, system_ids: item.system_ids, distance }, at: alert.created_at });
    }
    function ingest(characterId, input, trustedSource = 'manual') {
        const id = pilotId(characterId), mapId = mapScope(id, input?.map_id, true), cfg = config(id);
        if (!cfg.enabled || !store.get('module:universe', true)) throw new Error('Universe operations are disabled for this pilot.');
        if (!input || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 16000) throw new Error('Enter an intel report of up to 16,000 characters.');
        const parsed = parseIntel({ ...input, source: trustedSource, clear_keywords: cfg.clear_keywords }, now());
        if (!parsed) return { ignored: true, reason: 'This line has no usable report or source timestamp.' };
        if (cfg.ignore_keywords.some(keyword => parsed.text.toLowerCase().includes(keyword.toLowerCase()))) return { ignored: true, reason: 'Report matches an ignored keyword.' };
        if (trustedSource === 'manual' && input.system_ids != null) {
            if (!Array.isArray(input.system_ids) || input.system_ids.length > 100) throw new Error('Choose at most 100 report systems.');
            parsed.system_ids = [...new Set([...parsed.system_ids, ...input.system_ids.map(systemId)])].sort((a, b) => a - b);
        }
        if (!mapId && parsed.system_ids.some(wormholeSystem)) {
            if (trustedSource !== 'manual') return { ignored: true, reason: 'J-Space observations require a map.' };
            throw new Error('Choose a J-Space map before recording this system.');
        }
        const intelKind = scopedKind('intel', mapId);
        const observed = Date.parse(parsed.observed_at), received = now(), identity = hash([trustedSource, parsed.channel.toLowerCase(), parsed.text.toLowerCase(), parsed.system_ids.join(',')].join('|'));
        const existing = rows(id, intelKind).find(item => item.identity === identity && (item.observed_at === parsed.observed_at || received - Date.parse(item.received_at) < 5000));
        if (existing) return { ...existing, expired: Date.parse(existing.expires_at) <= now(), duplicate: true };
        const item = { id: randomUUID(), ...(mapId ? { map_id: mapId } : {}), ...parsed, identity, received_at: iso(), expires_at: new Date(observed + cfg.intel_expiry_minutes * 60000).toISOString() };
        put(id, intelKind, item, 500); maybeAlert(id, item, cfg, mapId); changed(id);
        return { ...item, expired: Date.parse(item.expires_at) <= received };
    }
    function ingestIntel(id, input) { return ingest(id, input, 'manual'); }
    function removeIntel(characterId, key, scope = null) {
        const id = pilotId(characterId), mapId = mapScope(id, scope, true), alertKind = scopedKind('alert', mapId); delRow.run(id, scopedKind('intel', mapId), String(key));
        for (const alert of rows(id, alertKind)) if (alert.intel_id === key) delRow.run(id, alertKind, alert.id);
        changed(id); return { removed: true };
    }
    function acknowledge(characterId, key, scope = null) {
        const id = pilotId(characterId), mapId = mapScope(id, scope, true), alertKind = scopedKind('alert', mapId), alert = row(id, alertKind, key);
        if (!alert) throw new Error('Alert not found for this pilot.');
        alert.acknowledged_at ||= iso(); put(id, alertKind, alert, 250); changed(id); return alert;
    }
    function saveSignature(characterId, input, options = {}) {
        const id = pilotId(characterId), mapId = mapScope(id, input.map_id, true), signatureKind = scopedKind('signature', mapId), deletedKind = scopedKind('signature_deleted', mapId), previous = input.id ? row(id, signatureKind, input.id) : null;
        if (input.id && !previous) throw new Error('Signature not found for this pilot.');
        const system = observationSystem(input.system_id ?? previous?.system_id, mapId), signature = clean(input.signature_id ?? previous?.signature_id, 16).toUpperCase();
        if (!/^[A-Z0-9]{3}-\d{3}$/.test(signature)) throw new Error('Use an EVE signature ID such as ABC-123.');
        const collision = rows(id, signatureKind).find(item => item.system_id === system && item.signature_id === signature);
        if (previous && collision && previous.id !== collision.id) throw new Error('This system already has that signature ID.');
        const old = previous || collision;
        const signatureType = clean(input.type ?? old?.type);
        const holeType = clean(input.wh_type ?? old?.wh_type, 4).toUpperCase();
        if (holeType && !getWormholeType(holeType)) throw new Error('Choose a known wormhole type such as C247 or K162.');
        const rawDestination = input.destination_system_id !== undefined ? input.destination_system_id : old?.destination_system_id;
        const destination = rawDestination === null || rawDestination === undefined || rawDestination === '' ? null : systemId(rawDestination);
        if (destination === system) throw new Error('A signature destination must be a different system.');
        const kind = input.kind ?? old?.kind ?? 'Cosmic Signature';
        if (!['Cosmic Signature', 'Cosmic Anomaly'].includes(kind)) throw new Error('Choose a cosmic signature or anomaly.');
        const usedIndices = [...rows(id, signatureKind), ...rows(id, deletedKind).map(item => item.signature)].filter(item => item?.system_id === system).map(item => item.bookmark_index || 0);
        const firstIndex = config(id).bookmark_start_at_zero ? 0 : 1;
        const bookmarkIndex = input.bookmark_index ?? old?.bookmark_index ?? Math.max(firstIndex - 1, ...usedIndices) + 1;
        if (!Number.isSafeInteger(bookmarkIndex) || bookmarkIndex < 0 || bookmarkIndex > 1000000) throw new Error('Use a bookmark index from 0 to 1,000,000.');
        for (const key of ['bookmark_chain', 'bookmark_chain_letters', 'temporary_name']) if (input[key] != null && (typeof input[key] !== 'string' || input[key].length > (key === 'temporary_name' ? 80 : 64) || /[\u0000-\u001f\u007f]/.test(input[key]))) throw new Error('Use a short printable bookmark label.');
        if (input.is_return_hole !== undefined && typeof input.is_return_hole !== 'boolean') throw new Error('Choose whether this is a return hole.');
        const observed = !old || options.observed === true || options.observed !== false && input.missing === false;
        const missing = options.observed === false && old ? old.missing : input.missing !== undefined ? input.missing === true : observed ? false : old?.missing ?? false;
        const value = { id: old?.id || randomUUID(), ...(mapId ? { map_id: mapId } : {}), system_id: system, signature_id: signature, kind,
            wh_type: signatureType === 'Wormhole' ? holeType || null : null,
            destination_system_id: signatureType === 'Wormhole' ? destination : null, bookmark_index: bookmarkIndex,
            bookmark_chain: clean(input.bookmark_chain ?? old?.bookmark_chain, 64), bookmark_chain_letters: clean(input.bookmark_chain_letters ?? old?.bookmark_chain_letters, 64),
            temporary_name: clean(input.temporary_name ?? old?.temporary_name, 80), is_return_hole: input.is_return_hole ?? old?.is_return_hole ?? false,
            group: clean(input.group || old?.group || 'Cosmic Signature'), type: signatureType, name: clean(input.name ?? old?.name),
            first_seen_at: old?.first_seen_at || iso(), last_seen_at: observed ? iso() : old.last_seen_at, missing,
            notes: clean(input.notes ?? old?.notes, 2000), updated_at: iso() };
        if (!old && rows(id, signatureKind).length >= 1000) throw new Error('Remove old signatures before adding more than 1,000.');
        put(id, signatureKind, value); changed(id); return value;
    }
    function previewSignatures(characterId, input) {
        const id = pilotId(characterId), mapId = mapScope(id, input.map_id), signatureKind = scopedKind('signature', mapId), system = observationSystem(input.system_id, mapId);
        if (typeof input.text !== 'string' || input.text.length > 200000) throw new Error('Paste at most 200,000 characters of probe scanner results.');
        const { rows: parsed, ignored, diagnostics } = parseSignatureClipboard(input.text, { includeAnomalies: input.include_anomalies === true }), before = rows(id, signatureKind).filter(item => item.system_id === system);
        const known = new Map(before.map(item => [item.signature_id, item])), incoming = new Set(parsed.map(item => item.signature_id)), added = [], updated = [];
        for (const item of parsed) {
            const old = known.get(item.signature_id), resolved = { ...item, type: item.type || old?.type || '', name: item.name || old?.name || '' };
            if (old) updated.push({ ...resolved, id: old.id, changes: ['group', 'type', 'name'].filter(key => resolved[key] !== old[key]).concat(old.missing ? ['missing'] : []) });
            else added.push(resolved);
        }
        if (rows(id, signatureKind).length + added.length > 1000) diagnostics.push({ line: null, reason: 'Remove old signatures before adding more than 1,000.', severity: 'error' });
        const valid = parsed.length > 0 && !diagnostics.some(item => item.severity === 'error');
        return { ...(mapId ? { map_id: mapId } : {}), system_id: system, valid, ignored, diagnostics, added, updated, signature_ids: [...incoming], complete_scan: input.complete_scan === true,
            missing: input.complete_scan === true && valid ? before.filter(item => !incoming.has(item.signature_id) && (input.include_anomalies === true || item.kind !== 'Cosmic Anomaly')).map(({ id, signature_id, name, type }) => ({ id, signature_id, name, type })) : [] };
    }
    function importSignatures(characterId, input) {
        const id = pilotId(characterId), mapId = mapScope(id, input.map_id, true), signatureKind = scopedKind('signature', mapId), preview = previewSignatures(id, input), system = preview.system_id;
        if (rows(id, signatureKind).length + preview.added.length > 1000) throw new Error('Remove old signatures before adding more than 1,000.');
        for (const item of [...preview.added, ...preview.updated]) saveSignature(id, { map_id: mapId, system_id: system, ...item }, { observed: true });
        for (const item of preview.missing) {
            const old = row(id, signatureKind, item.id); put(id, signatureKind, { ...old, missing: true, updated_at: iso() });
        }
        changed(id); return { added: preview.added.length, updated: preview.updated.length, missing: preview.missing.length, ignored: preview.ignored,
            diagnostics: preview.diagnostics, complete_scan_applied: preview.valid && preview.complete_scan, signatures: rows(id, signatureKind).filter(item => item.system_id === system) };
    }
    function removeSignature(characterId, key, scope = null) {
        const id = pilotId(characterId), mapId = mapScope(id, scope, true), signatureKind = scopedKind('signature', mapId), deletedKind = scopedKind('signature_deleted', mapId), signature = row(id, signatureKind, key);
        if (!signature) return { removed: false };
        const deleted = { id: signature.id, revision: randomUUID(), signature,
            deleted_at: iso(), expires_at: new Date(now() + 86400000).toISOString(), updated_at: iso() };
        store.db.exec('SAVEPOINT signature_delete');
        try {
            put(id, deletedKind, deleted, 100);
            delRow.run(id, signatureKind, signature.id);
            store.db.exec('RELEASE signature_delete');
        } catch (error) { store.db.exec('ROLLBACK TO signature_delete; RELEASE signature_delete'); throw error; }
        changed(id); return { removed: true, deleted };
    }
    function restoreSignature(characterId, input) {
        const id = pilotId(characterId), mapId = mapScope(id, input?.map_id, true), signatureKind = scopedKind('signature', mapId), deletedKind = scopedKind('signature_deleted', mapId), deleted = row(id, deletedKind, input?.id);
        if (!deleted || deleted.revision !== input?.revision || Date.parse(deleted.expires_at) <= now()) throw new Error('This signature deletion is no longer available to undo.');
        const signature = deleted.signature;
        if (row(id, signatureKind, signature.id) || rows(id, signatureKind).some(item => item.system_id === signature.system_id && item.signature_id === signature.signature_id)) throw new Error('A newer signature uses this ID. Kept the current observation; restoration was not applied.');
        if (rows(id, signatureKind).length >= 1000) throw new Error('Remove old signatures before restoring more than 1,000.');
        observationSystem(signature.system_id, mapId);
        const restored = { ...signature, restored_at: iso(), updated_at: iso() };
        store.db.exec('SAVEPOINT signature_restore');
        try {
            put(id, signatureKind, restored);
            delRow.run(id, deletedKind, signature.id);
            store.db.exec('RELEASE signature_restore');
        } catch (error) { store.db.exec('ROLLBACK TO signature_restore; RELEASE signature_restore'); throw error; }
        changed(id); return restored;
    }
    function saveUpgrade(characterId, input) {
        const id = pilotId(characterId), mapId = mapScope(id, input.map_id, true), upgradeKind = scopedKind('upgrade', mapId), old = input.id ? row(id, upgradeKind, input.id) : null;
        if (input.id && !old) throw new Error('Infrastructure note not found for this pilot.');
        const system = observationSystem(input.system_id ?? old?.system_id, mapId), slot = Number(input.slot ?? old?.slot), level = Number(input.level ?? old?.level ?? 1), name = clean(input.name ?? old?.name);
        if (!Number.isInteger(slot) || slot < 1 || slot > 100 || !Number.isInteger(level) || level < 0 || level > 5 || !name) throw new Error('Choose a slot (1–100), upgrade name and level (0–5).');
        if (input.online !== undefined && typeof input.online !== 'boolean') throw new Error('Choose the observed online state.');
        const collision = rows(id, upgradeKind).find(item => item.system_id === system && item.slot === slot);
        if (old && collision && old.id !== collision.id) throw new Error('This system already has an upgrade note in that slot.');
        const previous = old || collision;
        if (!previous && rows(id, upgradeKind).length >= 1000) throw new Error('Remove old infrastructure notes before adding more than 1,000.');
        const value = { id: previous?.id || randomUUID(), ...(mapId ? { map_id: mapId } : {}), system_id: system, slot, name, level, online: input.online ?? previous?.online ?? false,
            notes: clean(input.notes ?? previous?.notes, 2000), updated_at: iso() };
        put(id, upgradeKind, value); changed(id); return value;
    }
    function previewUpgrades(characterId, input) {
        const id = pilotId(characterId), mapId = mapScope(id, input.map_id), upgradeKind = scopedKind('upgrade', mapId), preview = parseUpgradeImport(input, atlas);
        for (const item of preview.upgrades) observationSystem(item.system_id, mapId);
        const existing = rows(id, upgradeKind), keys = new Set(existing.map(row => row.system_id + ':' + row.slot));
        const added = preview.upgrades.filter(row => !keys.has(row.system_id + ':' + row.slot)).length;
        if (existing.length + added > 1000) {
            preview.valid = false;
            preview.issues.push({ line: null, raw: '', severity: 'error', message: 'Remove old infrastructure notes before adding more than 1,000.' });
            preview.stats.errors++;
        }
        return { ...preview, added, updated: preview.upgrades.length - added };
    }
    function importUpgrades(characterId, input) {
        const id = pilotId(characterId), mapId = mapScope(id, input.map_id, true), upgradeKind = scopedKind('upgrade', mapId), preview = previewUpgrades(id, input);
        if (!preview.valid) throw new Error('Infrastructure import needs correction: ' + preview.issues.map(issue => issue.message).slice(0, 3).join(' '));
        const existing = new Map(rows(id, upgradeKind).map(row => [row.system_id + ':' + row.slot, row]));
        const records = preview.upgrades.map(item => ({ ...(mapId ? { map_id: mapId } : {}), id: existing.get(item.system_id + ':' + item.slot)?.id || randomUUID(),
            system_id: item.system_id, slot: item.slot, name: clean(item.name), level: item.level, online: item.online,
            notes: clean(preview.format === 'smt' ? existing.get(item.system_id + ':' + item.slot)?.notes : item.notes, 2000), updated_at: iso() }));
        store.db.exec('SAVEPOINT universe_upgrade_import');
        try {
            for (const item of records) put(id, upgradeKind, item);
            store.db.exec('RELEASE universe_upgrade_import');
        } catch (error) { store.db.exec('ROLLBACK TO universe_upgrade_import; RELEASE universe_upgrade_import'); throw error; }
        changed(id); return { added: preview.added, updated: preview.updated, upgrades: rows(id, upgradeKind) };
    }
    function exportUpgrades(characterId, input = {}) {
        const id = pilotId(characterId), mapId = mapScope(id, input.map_id), upgradeKind = scopedKind('upgrade', mapId), system = input.system_id == null ? null : observationSystem(input.system_id, mapId);
        return formatUpgradeExport(rows(id, upgradeKind).filter(row => system == null || row.system_id === system), atlas, { format: input.format || 'smt' });
    }
    function removeRecord(characterId, kind, key, scope = null) { const id = pilotId(characterId), mapId = mapScope(id, scope, true); delRow.run(id, scopedKind(kind, mapId), String(key)); changed(id); return { removed: true }; }
    async function fetchFleet(id) {
        if (closed || fleetBusy.has(id)) return;
        const pilot = character(id), cfg = config(id);
        if (!cfg.enabled || !cfg.fleet_enabled || !pilot || pilot.needsReauth || !arr(pilot.scopes).includes(FLEET_SCOPE)) return;
        fleetBusy.add(id); fleetNext.set(id, now() + 60000);
        let membership = null, previous = store.snapshot(id, 'universe_fleet');
        const save = (status, data, response = {}, error = null) => {
            const current = character(id), currentConfig = current ? config(id) : null;
            if (closed || !store.get('module:universe', true) || !current || current.needsReauth || !currentConfig?.enabled || !currentConfig.fleet_enabled || !arr(current.scopes).includes(FLEET_SCOPE)) return;
            const sample = { status, data, updatedAt: response.updatedAt || iso(), expiresAt: response.expiresAt || new Date(now() + 60000).toISOString(), error };
            store.saveSnapshot(id, 'universe_fleet', sample); changed(id);
        };
        try {
            const response = await esi.request('/characters/' + id + '/fleet', { characterId: id, ttl: 60 });
            if (response.stale) throw Object.assign(new Error(response.error || 'Fleet membership is stale.'), { status: response.errorStatus, retryAt: response.retryAt, staleMembership: true });
            if (!Number.isSafeInteger(response.data?.fleet_id) || response.data.fleet_id <= 0) throw new Error('ESI returned invalid fleet membership.');
            membership = response.data;
            if (membership.role !== 'fleet_commander') { save('no_access', { ...emptyFleet('no_access'), fleet_id: membership.fleet_id, role: membership.role }, response); return; }
            const roster = await esi.request('/fleets/' + membership.fleet_id + '/members', { characterId: id, ttl: 60 });
            if (roster.stale && [401, 403, 404].includes(roster.errorStatus)) throw Object.assign(new Error(roster.error || 'Fleet access is no longer available.'), { status: roster.errorStatus, retryAt: roster.retryAt });
            if (!Array.isArray(roster.data)) throw new Error('ESI returned an invalid fleet roster.');
            if (roster.stale && previous?.data?.fleet_id !== membership.fleet_id) throw Object.assign(new Error('Waiting for a current roster for this fleet.'), { wrongFleet: true });
            const unique = [...new Map(roster.data.filter(item => validId(item?.character_id)).slice(0, 256).map(item => [item.character_id, item])).values()];
            const ids = [...new Set(unique.flatMap(item => [item.character_id, item.ship_type_id]).filter(validId))];
            const names = esi.names ? await esi.names(ids) : {};
            const members = unique.map(item => { const system = byId.get(item.solar_system_id); return {
                character_id: item.character_id, name: names[item.character_id] || 'Pilot ' + item.character_id,
                system_id: system?.system_id || null, system_name: system?.name || null,
                ship_type_id: validId(item.ship_type_id) ? item.ship_type_id : null, ship_name: names[item.ship_type_id] || null,
                squad_id: Number.isSafeInteger(item.squad_id) ? item.squad_id : null, wing_id: Number.isSafeInteger(item.wing_id) ? item.wing_id : null };
            }).sort((a, b) => a.name.localeCompare(b.name) || a.character_id - b.character_id);
            save(roster.stale ? 'stale' : 'ready', { fleet_id: membership.fleet_id, role: membership.role, members },
                { updatedAt: roster.updatedAt, expiresAt: [response.expiresAt, roster.expiresAt].filter(Boolean).sort()[0] }, roster.error || null);
        } catch (error) {
            if ([401, 403, 404].includes(error.status)) save(error.status === 404 && !membership ? 'no_fleet' : error.status === 401 ? 'reauth_required' : 'no_access', emptyFleet('no_access'), {}, error.message);
            else if (previous?.data?.fleet_id && (!membership || previous.data.fleet_id === membership.fleet_id) && !error.wrongFleet)
                save('stale', previous.data, previous, clean(error.message, 300));
            else save('error', { ...emptyFleet('error'), fleet_id: membership?.fleet_id || null, role: membership?.role || null }, {}, clean(error.message, 300));
            if (finiteDate(error.retryAt)) fleetNext.set(id, Math.max(now() + 60000, Date.parse(error.retryAt)));
        } finally { fleetBusy.delete(id); }
    }
    async function refreshFleet(characterId) {
        const id = pilotId(characterId);
        if (!closed && store.get('module:universe', true)) {
            if (fleetFlights.has(id)) await fleetFlights.get(id);
            else if ((fleetNext.get(id) || 0) <= now()) {
                const flight = fetchFleet(id); fleetFlights.set(id, flight);
                try { await flight; } finally { fleetFlights.delete(id); }
            }
        }
        return closed ? emptyFleet('disabled') : fleetState(id, config(id));
    }
    const tail = createUniverseLogTail({ now, onLines: (id, input) => {
        if (closed || !store.get('module:universe', true) || !character(id)) return;
        const cfg = config(id);
        if (!cfg.enabled || !cfg.logs_enabled) return;
        for (const text of String(input.text || '').split(/\r?\n/).slice(0, 500)) {
            if (!text.trim()) continue;
            try {
                if (input.kind !== 'game' && observeLogLocation(id, text)) continue;
                // Automatically included Local is only a position source unless the user selected it for intel too.
                if (input.kind !== 'game' && !cfg.intel_channels.some(channel => String(input.channel).toLowerCase().includes(channel.toLowerCase()))) continue;
                ingest(id, { text, channel: input.channel }, input.kind === 'game' ? 'game_log' : 'chat_log');
            } catch { /* A malformed or oversized line cannot stall the tail. */ }
        }
    }, onStatus: id => { if (!closed) changed(id); } });
    for (const pilot of auth.characters()) configureLogs(pilot.id, config(pilot.id));
    // A synchronous reader owns shared pilot state and scope records for one request.
    // Scope validation stays here; callers never supply trusted map documents.
    function readContext(characterId) {
        const id = pilotId(characterId), scopes = new Map();
        let common, roster;
        // One synchronous projection owns its roster. Capture lazily so link
        // expiry/reconciliation can finish before projection reads begin. Never
        // pass this owner across an await or retain it for the next request.
        function readRoster() {
            if (!roster) {
                const rows = auth.characters(), byId = new Map();
                for (const pilot of rows) if (!byId.has(pilot.id)) byId.set(pilot.id, pilot);
                roster = { rows, byId };
            }
            return roster;
        }
        function scoped(scope) {
            const key = scope == null || scope === '' ? null : scope;
            if (!scopes.has(key)) scopes.set(mapScope(id, key), { records: new Map() });
            return { mapId: key, value: scopes.get(key) };
        }
        function signatures(scope = null) {
            const { mapId, value } = scoped(scope);
            if (!value.records.has('signature')) value.records.set('signature', rows(id, scopedKind('signature', mapId)).map(row => ({ ...row, type_reference: row.wh_type ? getWormholeType(row.wh_type) : null })));
            return value.records.get('signature');
        }
        function state(scope = null) {
            const { mapId, value } = scoped(scope);
            if (value.state) return value.state;
            if (!common) {
                const roster = readRoster(), cfg = config(id, roster), enabled = store.get('module:universe', true) && cfg.enabled;
                common = { config: { ...cfg, enabled }, location: location(id, roster), pilots: enabled ? pilots(id, roster) : [], fleet: fleetState(id, cfg, roster), logs: tail.status(id) };
            }
            value.state = { version: 1, character_id: id, map_id: mapId, generated_at: iso(), config: common.config, location: common.location,
                intel: rows(id, scopedKind('intel', mapId)).map(({ identity, ...item }) => ({ ...item, expired: Date.parse(item.expires_at) <= now() })),
                alerts: rows(id, scopedKind('alert', mapId)), pilots: common.pilots, fleet: common.fleet, signatures: signatures(mapId),
                deleted_signatures: rows(id, scopedKind('signature_deleted', mapId)).filter(item => Date.parse(item.expires_at) > now()), upgrades: rows(id, scopedKind('upgrade', mapId)), logs: common.logs };
            return value.state;
        }
        return { state, signatures, character: id => character(id, readRoster()), config: id => config(id, readRoster()) };
    }
    function state(characterId, scope = null) { return readContext(characterId).state(scope); }
    async function runTick() {
        if (closed || ticking) return;
        if (!store.get('module:universe', true)) {
            for (const id of logPilots) tail.configure(id, { enabled: false, directory: '', channels: [], characterName: '' });
            return;
        }
        ticking = true;
        try {
            for (const pilot of auth.characters()) configureLogs(pilot.id, config(pilot.id));
            for (const id of logPilots) if (!character(id)) { tail.configure(id, { enabled: false, directory: '', channels: [], characterName: '' }); logPilots.delete(id); }
            await tail.tick();
            if (!options.noSync) {
                const eligible = auth.characters().filter(pilot => { const cfg = config(pilot.id); return cfg.enabled && cfg.fleet_enabled && !pilot.needsReauth && arr(pilot.scopes).includes(FLEET_SCOPE); });
                for (let visited = 0; visited < eligible.length; visited++) {
                    const pilot = eligible[fleetCursor++ % eligible.length];
                    if ((fleetNext.get(pilot.id) || 0) <= now()) { await refreshFleet(pilot.id); break; }
                }
            }
        } finally { ticking = false; }
    }
    function tick() {
        if (!closed && !store.get('module:universe', true)) {
            for (const id of logPilots) tail.configure(id, { enabled: false, directory: '', channels: [], characterName: '' });
        }
        if (tickFlight) return tickFlight;
        const flight = runTick(); tickFlight = flight;
        return flight.finally(() => { if (tickFlight === flight) tickFlight = null; });
    }
    async function close() {
        closed = true;
        await tail.close();
        await Promise.allSettled([tickFlight, ...fleetFlights.values()].filter(Boolean));
    }
    return { state, readContext, migrateMapScopes, removeMapScope, copyMapScope, exportMapScope, validateMapScopeImport, importMapScope, location: id => location(pilotId(id)), config, saveConfig, ingestIntel, removeIntel, acknowledge, previewSignatures, importSignatures, saveSignature,
        removeSignature, restoreSignature, saveUpgrade, previewUpgrades, importUpgrades, exportUpgrades, removeUpgrade: (id, key, mapId) => removeRecord(id, 'upgrade', key, mapId),
        defaultLogDirectories: () => tail.defaultDirectories(), refreshFleet, refresh: async (id, mapId = null) => { mapScope(pilotId(id), mapId); await refreshFleet(id); return state(id, mapId); }, tick, close };
}
