import { createHash, randomUUID } from 'node:crypto';
import { allocateTerritoryColours, territoryColourEntities, configuredTerritoryColourConflict } from '../lib/universe-territory-colours.mjs';

const DAY = 86400000, WINDOW = 60 * DAY, HALF_LIFE = 14 * DAY, REFRESH = 5 * 60000;
const MAX_EVENTS = 20000, BATCH = 1000, BOOTSTRAP = 2000;
const MAX_PAIRS = 12000, MAX_ALLIANCES = 2000;
const METHOD = 'observed-cooperation-v1';
const CONFIG_KEY = 'universe:politics:config', SNAPSHOT_KEY = 'universe:politics:snapshot';
const validId = id => Number.isSafeInteger(id) && id > 0;
const array = value => Array.isArray(value) ? value : [];
const parse = value => { try { return JSON.parse(value); } catch { return null; } };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const unique = values => [...new Set(values)].sort((a, b) => a - b);
const iso = value => new Date(value).toISOString();
const pairKey = (a, b) => a < b ? a + ':' + b : b + ':' + a;
const nameFor = (id, names) => names[id] || 'Alliance ' + id;
const colorFor = id => allocateTerritoryColours([{ key: String(id) }]).get(String(id)).fill;
const defaultConfig = () => ({ version: 1, revision: 0, updated_at: null, inference_enabled: true, blocs: [], independent_alliance_ids: [] });

/** A complete replacement makes moves explicit and rejects duplicate assignments. */
export function validatePoliticsConfig(input, previous = defaultConfig(), now = Date.now()) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Power bloc settings must be an object.');
    if (input.revision != null && input.revision !== previous.revision) throw new Error('Power bloc settings changed. Reload settings before saving.');
    if (input.inference_enabled != null && typeof input.inference_enabled !== 'boolean') throw new Error('Inferred fallback must be enabled or disabled.');
    if (!Array.isArray(input.blocs) || input.blocs.length > 100) throw new Error('Provide at most 100 named power blocs.');
    if (!Array.isArray(input.independent_alliance_ids ?? [])) throw new Error('Independent alliances must be a list of alliance IDs.');
    const assigned = new Set(), identifiers = new Set(), names = new Set();
    const ids = (values, label) => {
        if (!Array.isArray(values) || values.length > 2000 || values.some(id => !validId(id))) throw new Error(label + ' needs valid alliance IDs (up to 2,000).');
        if (new Set(values).size !== values.length) throw new Error('An alliance is listed more than once in ' + label + '.');
        return unique(values);
    };
    const blocs = input.blocs.map(row => {
        if (!row || typeof row !== 'object') throw new Error('Each power bloc needs a name, colour and alliance members.');
        const name = String(row.name || '').trim(), color = String(row.color || '');
        if (!name || name.length > 80) throw new Error('Give each power bloc a name of 1–80 characters.');
        if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Choose a six-digit hex colour for ' + name + '.');
        if (names.has(name.toLowerCase())) throw new Error('Power bloc names must be distinct.');
        names.add(name.toLowerCase());
        const id = row.id == null ? randomUUID() : String(row.id);
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || /^(inferred|alliance)-/.test(id) || identifiers.has(id)) throw new Error('Each power bloc needs a unique valid ID; inferred- and alliance- prefixes are reserved.');
        identifiers.add(id);
        const alliance_ids = ids(row.alliance_ids, name);
        for (const alliance of alliance_ids) {
            if (assigned.has(alliance)) throw new Error('Alliance ' + alliance + ' belongs to more than one configured bloc. Remove its old assignment to move it.');
            assigned.add(alliance);
        }
        return { id, name, color: color.toLowerCase(), alliance_ids };
    });
    const independent_alliance_ids = ids(input.independent_alliance_ids ?? [], 'Independent alliances');
    if (independent_alliance_ids.some(id => assigned.has(id))) throw new Error('A configured bloc member cannot also be kept independent.');
    for (const bloc of blocs) {
        const conflict = configuredTerritoryColourConflict(bloc.color, blocs, bloc.id);
        if (conflict) throw new Error(bloc.name + ': ' + conflict);
    }
    return { version: 1, revision: previous.revision + 1, updated_at: iso(now), inference_enabled: input.inference_enabled ?? previous.inference_enabled, blocs, independent_alliance_ids };
}

/** Compact only verified cache records; never infer participants from system kill totals. */
export function compactPoliticsKillmail(raw, now = Date.now()) {
    const at = Date.parse(raw?.killmail_time), system_id = raw?.solar_system_id;
    if (!validId(raw?.killmail_id) || !validId(system_id) || !Number.isFinite(at) || at > now + 60000 || at < now - WINDOW || !Array.isArray(raw.attackers)) return null;
    const attacker_alliance_ids = unique(raw.attackers.map(row => row.alliance_id).filter(validId));
    // Huge open fights produce quadratic pair counts and weak affiliation evidence.
    if (attacker_alliance_ids.length > 32) return null;
    const victim_alliance_id = validId(raw.victim?.alliance_id) ? raw.victim.alliance_id : null;
    if (!attacker_alliance_ids.length && !victim_alliance_id) return null;
    return { killmail_id: raw.killmail_id, at, system_id, attacker_alliance_ids, victim_alliance_id };
}

/** Conservative signed graph. Every pair in a core must have sustained direct support. */
export function inferPolitics(events, { now = Date.now(), config = defaultConfig(), names = {}, sovereignty = [], gates = [], previous = null, coverage = {} } = {}) {
    const excluded = new Set([...config.independent_alliance_ids, ...config.blocs.flatMap(row => row.alliance_ids)]);
    const uniqueEvents = new Map();
    for (const event of events) if (validId(event?.killmail_id) && Number.isFinite(event.at) && event.at >= now - WINDOW && event.at <= now + 60000)
        uniqueEvents.set(event.killmail_id, event);
    const rows = [...uniqueEvents.values()].sort((a, b) => a.at - b.at || a.killmail_id - b.killmail_id);
    const pairs = new Map(), activity = new Map(), alliances = new Set(), systems = new Set(), opponents = new Map();
    let graphLimited = false;
    const encounter = row => row.system_id + ':' + Math.floor(row.at / (6 * 3600000));
    const addActivity = (id, event) => {
        alliances.add(id);
        if (!activity.has(id)) activity.set(id, new Set());
        activity.get(id).add(encounter(event));
    };
    const pair = (a, b) => {
        const key = pairKey(a, b);
        if (!pairs.has(key)) pairs.set(key, { key, alliance_ids: [a, b].sort((a, b) => a - b), cooperation: new Map(), hostility: new Map(), directions: new Set() });
        return pairs.get(key);
    };
    for (const row of rows) {
        // A corrupt or unusually broad cache must not turn a refresh into an
        // unbounded graph job. Incomplete graphs are never allowed to infer.
        if (pairs.size > MAX_PAIRS || alliances.size > MAX_ALLIANCES) { graphLimited = true; break; }
        systems.add(row.system_id);
        const attackers = unique(array(row.attacker_alliance_ids).filter(validId)).filter(id => id !== row.victim_alliance_id);
        for (const id of attackers) addActivity(id, row);
        if (validId(row.victim_alliance_id)) addActivity(row.victim_alliance_id, row);
        const key = encounter(row);
        for (let i = 0; i < attackers.length; i++) for (let j = i + 1; j < attackers.length; j++) pair(attackers[i], attackers[j]).cooperation.set(key, row.at);
        if (validId(row.victim_alliance_id)) for (const attacker of attackers) {
            const relation = pair(attacker, row.victim_alliance_id);
            relation.hostility.set(key, row.at); relation.directions.add(attacker + '>' + row.victim_alliance_id);
            if (!opponents.has(attacker)) opponents.set(attacker, new Set());
            opponents.get(attacker).add(row.victim_alliance_id);
        }
    }
    const territory = new Set(), owners = new Map(sovereignty.map(row => [row.system_id || row.solar_system_id, row.alliance_id]));
    for (const gate of gates) {
        const a = owners.get(gate.from_system_id), b = owners.get(gate.to_system_id);
        if (validId(a) && validId(b) && a !== b) territory.add(pairKey(a, b));
    }
    const recent = times => [...times].filter(t => t >= now - 14 * DAY).length;
    const weight = times => [...times].reduce((total, time) => total + 2 ** (-(now - time) / HALF_LIFE), 0);
    const summaries = new Map(), eligible = new Map();
    for (const relation of pairs.values()) {
        const [a, b] = relation.alliance_ids, co = [...relation.cooperation.values()], hostile = [...relation.hostility.values()];
        const days = new Set(co.map(time => Math.floor(time / DAY))), hostileDays = new Set(hostile.map(time => Math.floor(time / DAY)));
        const coWeight = weight(co), hostileWeight = weight(hostile), normalized = co.length / Math.max(1, Math.min(activity.get(a)?.size || 0, activity.get(b)?.size || 0));
        const span = co.length ? Math.max(...co) - Math.min(...co) : 0;
        const shared = [...(opponents.get(a) || [])].filter(id => opponents.get(b)?.has(id)).length;
        const durable = days.size >= 3 && span >= 7 * DAY && recent(co) > 0 && coWeight >= 1.5 && normalized >= .2;
        const conflict = hostileDays.size >= 2 || hostileWeight > coWeight * .12;
        const summary = { alliance_ids: relation.alliance_ids, cooperative_encounters: co.length, hostile_encounters: hostile.length, distinct_days: days.size,
            hostile_days: hostileDays.size, recent_cooperative_encounters: recent(co), shared_opponents: shared, territory_neighbors: territory.has(relation.key),
            first_at: co.length ? iso(Math.min(...co)) : null, last_cooperation_at: co.length ? iso(Math.max(...co)) : null,
            last_at: Math.max(...co, ...hostile, 0) ? iso(Math.max(...co, ...hostile)) : null,
            label: durable && !conflict ? 'Sustained cooperation' : conflict && co.length ? 'Mixed evidence' : 'Insufficient evidence',
            hostility_directions: [...relation.directions].sort() };
        summaries.set(relation.key, summary);
        if (!graphLimited && durable && !conflict && !excluded.has(a) && !excluded.has(b)) eligible.set(relation.key, { ...relation, score: coWeight * Math.sqrt(normalized) });
    }
    // A similarly supported bridge between incompatible partners stays ambiguous.
    const adjacent = new Map();
    for (const relation of eligible.values()) for (const id of relation.alliance_ids) {
        if (!adjacent.has(id)) adjacent.set(id, []);
        adjacent.get(id).push({ id: relation.alliance_ids.find(other => other !== id), score: relation.score });
    }
    const ambiguous = new Set();
    for (const [id, neighbors] of adjacent) {
        if (neighbors.length > 64) { ambiguous.add(id); continue; }
        for (let i = 0; i < neighbors.length; i++) for (let j = i + 1; j < neighbors.length; j++) {
            const a = neighbors[i], b = neighbors[j];
            if (!eligible.has(pairKey(a.id, b.id)) && Math.min(a.score, b.score) / Math.max(a.score, b.score) >= .8) ambiguous.add(id);
        }
    }
    const clusters = new Map([...alliances].filter(id => !excluded.has(id) && !ambiguous.has(id)).map(id => [id, new Set([id])]));
    const byAlliance = new Map([...clusters].map(([id]) => [id, id]));
    for (const relation of [...eligible.values()].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))) {
        const [a, b] = relation.alliance_ids, first = byAlliance.get(a), second = byAlliance.get(b);
        if (first == null || second == null || first === second) continue;
        const left = clusters.get(first), right = clusters.get(second);
        if (![...left].every(x => [...right].every(y => eligible.has(pairKey(x, y))))) continue;
        for (const id of right) { left.add(id); byAlliance.set(id, first); }
        clusters.delete(second);
    }
    const groups = [], usedIds = new Set();
    for (const members of [...clusters.values()].filter(set => set.size >= 2).sort((a, b) => Math.min(...a) - Math.min(...b))) {
        const alliance_ids = unique([...members]);
        const predecessors = array(previous?.groups).map(group => ({ group, overlap: group.alliance_ids.filter(id => members.has(id)).length }))
            .filter(row => row.overlap >= 2).sort((a, b) => b.overlap - a.overlap || a.group.id.localeCompare(b.group.id));
        const stable = predecessors.find(({ group, overlap }) => !usedIds.has(group.id) && overlap / new Set([...group.alliance_ids, ...members]).size >= .6)?.group;
        const id = stable?.id || 'inferred-' + hash(alliance_ids);
        usedIds.add(id);
        const co = new Map(), hostile = new Map(), relations = [];
        for (let i = 0; i < alliance_ids.length; i++) for (let j = i + 1; j < alliance_ids.length; j++) {
            const key = pairKey(alliance_ids[i], alliance_ids[j]), relation = pairs.get(key);
            for (const [event, at] of relation.cooperation) co.set(event, at);
            for (const [event, at] of relation.hostility) hostile.set(event, at);
            relations.push(summaries.get(key));
        }
        const evidence = { label: 'Sustained cooperation', cooperative_encounters: co.size, hostile_encounters: hostile.size,
            distinct_days: new Set([...co.values()].map(time => Math.floor(time / DAY))).size,
            territory_neighbor_pairs: relations.filter(row => row.territory_neighbors).length,
            shared_opponents: Math.max(0, ...relations.map(row => row.shared_opponents)),
            first_at: iso(Math.min(...co.values())), last_at: iso(Math.max(...co.values())), relations: relations.slice(0, 64), relation_count: relations.length };
        const valid_until = iso(Math.min(...relations.map(row => Math.min(Date.parse(row.first_at) + WINDOW, Date.parse(row.last_cooperation_at) + 14 * DAY))));
        const membershipChanged = !!stable && hash(stable.alliance_ids) !== hash(alliance_ids);
        groups.push({ id, name: stable?.name || nameFor(alliance_ids[0], names) + ' and partners', color: stable?.color || colorFor(id), source: 'inferred', alliance_ids,
            member_names: alliance_ids.map(id => ({ alliance_id: id, name: nameFor(id, names) })), evidence, valid_until,
            previous_group_ids: stable && !membershipChanged ? stable.previous_group_ids || [] : predecessors.map(row => row.group.id), membership_changed: membershipChanged });
    }
    const membershipIds = new Set(groups.flatMap(group => group.alliance_ids)), byRelationship = new Map();
    if (!graphLimited) for (const relation of summaries.values()) for (const id of relation.alliance_ids) {
        if (!byRelationship.has(id)) byRelationship.set(id, []);
        byRelationship.get(id).push(relation);
    }
    const unresolved = [...alliances].filter(id => !membershipIds.has(id) && !excluded.has(id)).sort((a, b) => a - b).map(alliance_id => {
        const relationships = (byRelationship.get(alliance_id) || []).sort((a, b) => b.cooperative_encounters - a.cooperative_encounters).slice(0, 3);
        const conflicted = relationships.some(row => row.label === 'Mixed evidence');
        return { alliance_id,
            reason: graphLimited ? 'The bounded evidence graph is incomplete; inference is withheld.' : ambiguous.has(alliance_id) ? 'Similarly supported partners do not form a consistent group.' :
                conflicted ? 'Observed cooperation is contradicted by direct combat between these alliances.' : 'Not enough sustained cooperation without conflicting combat.',
            evidence_label: ambiguous.has(alliance_id) || conflicted ? 'Mixed evidence' : 'Insufficient evidence', relationships };
    });
    const evidenceCoverage = { scope: 'local_cached_combat', label: 'Observed local pilot and session killmails · incomplete New Eden coverage',
        killmails: rows.length, alliance_count: alliances.size, system_count: systems.size, oldest_at: rows.length ? iso(rows[0].at) : null,
        newest_at: rows.length ? iso(rows.at(-1).at) : null, ...coverage, graph_limited: graphLimited, truncated: !!coverage.truncated || graphLimited };
    const content = { method_version: METHOD, config_revision: config.revision, groups, unresolved, coverage: evidenceCoverage,
        window_from: iso(now - WINDOW), window_to: iso(now), criteria: 'At least 3 observed days spanning 7 days; recent cooperation; no sustained hostility; direct support between every core pair. Territory is context only.' };
    return { ...content, id: 'politics-' + hash({ ...content, window_from: Math.floor((now - WINDOW) / DAY), window_to: Math.floor(now / DAY) }),
        generated_at: iso(now), expires_at: iso(now + 6 * 3600000) };
}

/** Module-wide config and observed evidence. Private standings/access never enter this resolver. */
export function createUniversePolitics(store, auth, { now = Date.now, atlas = { gates: [] } } = {}) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS universe_politics_events(killmail_id INTEGER PRIMARY KEY,at INTEGER NOT NULL,body TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_universe_politics_events_at ON universe_politics_events(at);
        CREATE TABLE IF NOT EXISTS universe_politics_queue(source TEXT NOT NULL,row_id INTEGER NOT NULL,PRIMARY KEY(source,row_id));
        CREATE TABLE IF NOT EXISTS universe_politics_history(id TEXT PRIMARY KEY,kind TEXT NOT NULL,at TEXT NOT NULL,body TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_universe_politics_history_kind_at ON universe_politics_history(kind,at DESC);`);
    for (const table of ['combat_records', 'alliance_combat_records']) for (const operation of ['INSERT', 'UPDATE'])
        store.db.exec(`CREATE TRIGGER IF NOT EXISTS politics_${table}_${operation.toLowerCase()} AFTER ${operation} ON ${table}
            BEGIN INSERT OR IGNORE INTO universe_politics_queue VALUES('${table}',NEW.rowid); END;`);
    let config = store.get(CONFIG_KEY, defaultConfig()), snapshot = store.get(SNAPSHOT_KEY, null), nextRefresh = 0, lastError = null, lastInputSignature = null;
    let paletteSignature = null, paletteRevision = null, palette = new Map(), paletteObject = {};
    const eventPut = store.db.prepare('INSERT INTO universe_politics_events VALUES(?,?,?) ON CONFLICT(killmail_id) DO UPDATE SET at=excluded.at,body=excluded.body WHERE body<>excluded.body');
    const queueRead = store.db.prepare('SELECT source,row_id FROM universe_politics_queue ORDER BY row_id DESC,source LIMIT ?');
    const queueDelete = store.db.prepare('DELETE FROM universe_politics_queue WHERE source=? AND row_id=?');
    const inputs = Object.fromEntries(['combat_records', 'alliance_combat_records'].map(table => [table, store.db.prepare('SELECT body FROM ' + table + ' WHERE rowid=?')]));
    const history = store.db.prepare('INSERT OR IGNORE INTO universe_politics_history VALUES(?,?,?,?)');
    function configRead() { return structuredClone(config); }
    function saveConfig(input) {
        const updated = validatePoliticsConfig(input, config, now());
        store.db.exec('BEGIN IMMEDIATE');
        try {
            store.set(CONFIG_KEY, updated); history.run('config-' + updated.revision, 'config', updated.updated_at, JSON.stringify(updated));
            store.db.prepare("DELETE FROM universe_politics_history WHERE kind='config' AND id NOT IN (SELECT id FROM universe_politics_history WHERE kind='config' ORDER BY at DESC,id DESC LIMIT 100)").run();
            store.db.exec('COMMIT');
        } catch (error) { store.db.exec('ROLLBACK'); throw error; }
        config = updated; nextRefresh = 0;
        // Manual assignments resolve immediately. Prior inferred clusters are
        // withheld until recomputed so configured members cannot act as bridges.
        return configRead();
    }
    function collection() {
        const characters = auth.characters(), sources = [];
        for (const character of characters) for (const key of ['killmails', 'combat_public']) {
            const sample = store.snapshotMetadata(character.id, key);
            if (sample) sources.push({ character_id: character.id, source: key, status: sample.status,
                fresh: sample.status === 'ready' && Date.parse(sample.expiresAt || sample.refreshAt || '') > now() });
        }
        const collection_status = !store.get('module:combat', true) ? 'disabled' : !sources.length ? 'unknown' : sources.some(row => row.fresh) ?
            sources.every(row => row.fresh) ? 'current' : 'partial' : 'stale';
        return { collection_status, character_count: characters.length, sources };
    }
    function refresh({ force = false } = {}) {
        if (!force && now() < nextRefresh) return null;
        if (!store.get('module:universe', true) || !config.inference_enabled) { nextRefresh = now() + REFRESH; return force ? read() : null; }
        nextRefresh = now() + REFRESH;
        try {
            store.db.exec('BEGIN IMMEDIATE');
            let bootstrap = store.get('universe:politics:bootstrap', null);
            if (!bootstrap) {
                let truncated = false;
                for (const table of ['combat_records', 'alliance_combat_records']) {
                    const rows = store.db.prepare('SELECT rowid FROM ' + table + ' ORDER BY rowid DESC LIMIT ?').all(BOOTSTRAP + 1);
                    truncated ||= rows.length > BOOTSTRAP;
                    const enqueue = store.db.prepare('INSERT OR IGNORE INTO universe_politics_queue VALUES(?,?)');
                    for (const row of rows.slice(0, BOOTSTRAP)) enqueue.run(table, row.rowid);
                }
                bootstrap = { at: iso(now()), truncated }; store.set('universe:politics:bootstrap', bootstrap);
            }
            let skipped = store.get('universe:politics:skipped', 0), changed = 0;
            for (const row of queueRead.all(BATCH)) {
                const raw = parse(inputs[row.source]?.get(row.row_id)?.body), compact = compactPoliticsKillmail(raw, now());
                if (compact) changed += Number(eventPut.run(compact.killmail_id, compact.at, JSON.stringify(compact)).changes);
                else if (raw && Date.parse(raw.killmail_time) >= now() - WINDOW) skipped++;
                queueDelete.run(row.source, row.row_id);
            }
            store.set('universe:politics:skipped', skipped);
            changed += Number(store.db.prepare('DELETE FROM universe_politics_events WHERE at<?').run(now() - WINDOW).changes);
            const capped = !!store.db.prepare('SELECT 1 FROM universe_politics_events ORDER BY at DESC LIMIT 1 OFFSET ?').get(MAX_EVENTS);
            if (capped) store.db.prepare('DELETE FROM universe_politics_events WHERE killmail_id NOT IN (SELECT killmail_id FROM universe_politics_events ORDER BY at DESC,killmail_id DESC LIMIT ?)').run(MAX_EVENTS);
            const pending_records = Number(store.db.prepare('SELECT COUNT(*) count FROM universe_politics_queue').get().count);
            const sov = store.snapshot(0, 'sovereignty'), sovereignty = ['ready', 'stale'].includes(sov?.status) ? array(sov.data) : [];
            const inputSignature = hash([config.revision, Math.floor(now() / (3 * 3600000)), sov?.updatedAt, pending_records, skipped, collection()]);
            if (!changed && snapshot && lastInputSignature === inputSignature) {
                store.db.exec('COMMIT'); lastError = null;
                return read();
            }
            const events = store.db.prepare('SELECT body FROM universe_politics_events ORDER BY at,killmail_id').all().map(row => parse(row.body)).filter(Boolean);
            const value = inferPolitics(events, { now: now(), config, names: store.get('names', {}), sovereignty, gates: atlas.gates, previous: snapshot,
                coverage: { ...collection(), pending_records, skipped_records: skipped, max_killmails: MAX_EVENTS,
                    truncated: capped || bootstrap.truncated && Date.parse(bootstrap.at) >= now() - WINDOW || pending_records > 0 } });
            store.set(SNAPSHOT_KEY, value); history.run(value.id, 'inference', value.generated_at, JSON.stringify(value));
            store.db.prepare("DELETE FROM universe_politics_history WHERE kind='inference' AND id NOT IN (SELECT id FROM universe_politics_history WHERE kind='inference' ORDER BY at DESC,id DESC LIMIT 64)").run();
            store.db.exec('COMMIT'); snapshot = value; lastError = null; lastInputSignature = inputSignature;
            if (pending_records) nextRefresh = now() + 3000;
        } catch (error) {
            try { store.db.exec('ROLLBACK'); } catch { /* transaction may not have started */ }
            lastError = String(error.message || error); nextRefresh = now() + 60000;
        }
        return read();
    }
    function read(names = store.get('names', {}), sovereigntyRows = null) {
        const enabled = store.get('module:universe', true), collectionInfo = collection();
        const matching = snapshot && snapshot.config_revision === config.revision;
        const current = matching && Date.parse(snapshot.expires_at) > now();
        const inferred = config.inference_enabled && matching ? snapshot.groups.filter(group => Date.parse(group.valid_until || snapshot.expires_at) > now()) : [];
        const rawGroups = config.blocs.map(bloc => ({ ...bloc, source: 'configured', config_revision: config.revision,
            member_names: bloc.alliance_ids.map(id => ({ alliance_id: id, name: nameFor(id, names) })), evidence: { label: 'User configured' } })).concat(inferred);
        if (sovereigntyRows == null) {
            const sovereignty = enabled ? store.snapshot(0, 'sovereignty') : null;
            sovereigntyRows = ['ready', 'stale'].includes(sovereignty?.status) ? array(sovereignty.data) : [];
        }
        const entities = territoryColourEntities(sovereigntyRows, rawGroups).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
        const signature = JSON.stringify(entities);
        if (signature !== paletteSignature) {
            palette = allocateTerritoryColours(entities); paletteObject = Object.freeze(Object.fromEntries(palette));
            paletteSignature = signature; paletteRevision = hash(signature);
        }
        // Decoration leaves persisted user configuration and assessment history
        // untouched, including old configurations which reused a colour.
        const groups = rawGroups.map(group => {
            const paint = palette.get('bloc:' + group.id);
            return paint ? { ...group, color: paint.fill, outline: paint.outline, configured_color: group.source === 'configured' ? group.color : undefined } : group;
        });
        const coverage = { scope: 'local_cached_combat', label: 'Observed local pilot and session killmails · incomplete New Eden coverage',
            killmails: 0, alliance_count: 0, system_count: 0, oldest_at: null, newest_at: null, truncated: false,
            ...(snapshot?.coverage || {}), ...collectionInfo };
        const status = !enabled || !config.inference_enabled ? 'disabled' : !snapshot || !coverage.killmails ? 'unavailable' :
            !current || lastError || coverage.collection_status === 'stale' || coverage.collection_status === 'disabled' ? 'stale' : 'limited';
        return { snapshot_id: 'resolved-' + hash([config.revision, config.inference_enabled && matching ? snapshot?.id : null, inferred.map(group => group.id), status, paletteRevision]),
            config_revision: config.revision, inference_snapshot_id: snapshot?.id || null, generated_at: snapshot?.generated_at || null,
            territory_colours: paletteObject, colour_revision: paletteRevision,
            method_version: METHOD, status, inference_enabled: config.inference_enabled, coverage, groups,
            independent_alliance_ids: config.independent_alliance_ids, unresolved: current ? snapshot.unresolved : [],
            window_from: snapshot?.window_from || null, window_to: snapshot?.window_to || null, criteria: snapshot?.criteria || null,
            notice: 'Inferred groups estimate cooperation from observed activity and may not match formal coalitions. Unobserved alliances remain unassigned.',
            error: lastError };
    }
    function resolver(politics = read(), names = store.get('names', {})) {
        const memberships = new Map(), independent = new Set(config.independent_alliance_ids), unresolved = new Map(politics.unresolved.map(row => [row.alliance_id, row]));
        for (const group of politics.groups) for (const id of group.alliance_ids) memberships.set(id, group);
        return allianceId => {
            if (!validId(allianceId)) return null;
            const group = memberships.get(allianceId), unresolvedEvidence = unresolved.get(allianceId);
            const { relations: _relations, relationships: _relationships, ...evidence } = group?.evidence || unresolvedEvidence || {};
            const source = group?.source || (independent.has(allianceId) ? 'independent' : 'unassigned');
            const paint = politics.territory_colours?.[group ? 'bloc:' + group.id : 'a' + allianceId];
            return { alliance_id: allianceId, group_id: group?.id || 'alliance-' + allianceId, name: group?.name || nameFor(allianceId, names),
                color: paint?.fill || group?.color || colorFor('a' + allianceId), outline: paint?.outline || group?.outline || null,
                source, evidence_label: group?.evidence?.label || (source === 'independent' ? 'Kept independent' : unresolvedEvidence?.evidence_label || 'Insufficient evidence'),
                reason: group ? source === 'configured' ? 'Assigned in Universe settings.' : 'Repeated observed cooperation with sustained internal support.' :
                    source === 'independent' ? 'Excluded from inference in Universe settings.' : unresolvedEvidence?.reason || (config.inference_enabled ? 'No usable inferred membership is available.' : 'Inferred fallback is disabled.'),
                evidence: Object.keys(evidence).length ? evidence : null, snapshot_id: politics.snapshot_id };
        };
    }
    function alliances(query = '') {
        const preferred = new Set([...config.blocs.flatMap(row => row.alliance_ids), ...config.independent_alliance_ids]);
        const names = store.get('names', {}), sov = store.snapshot(0, 'sovereignty'), ids = new Set([...preferred,
            ...array(sov?.data).map(row => row.alliance_id).filter(validId), ...array(snapshot?.groups).flatMap(row => row.alliance_ids), ...array(snapshot?.unresolved).map(row => row.alliance_id)]);
        const filter = String(query).trim().toLowerCase();
        return [...ids].map(alliance_id => ({ alliance_id, name: nameFor(alliance_id, names) })).filter(row => !filter || row.name.toLowerCase().includes(filter) || String(row.alliance_id).includes(filter))
            .sort((a, b) => Number(preferred.has(b.alliance_id)) - Number(preferred.has(a.alliance_id)) || a.name.localeCompare(b.name)).slice(0, 200);
    }
    return { config: configRead, saveConfig, read, resolver, refresh, alliances,
        exportData: () => ({ config: configRead(), inference: snapshot, history: store.db.prepare('SELECT kind,at,body FROM universe_politics_history ORDER BY at').all().map(row => ({ kind: row.kind, at: row.at, data: parse(row.body) })) }) };
}
