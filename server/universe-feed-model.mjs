/** Pure provider adapters for Universe feeds. now arguments are epoch ms; emitted
 * dates are ISO UTC, masses kg, durations use named minute/hour fields. Normalizers
 * validate bounded provider envelopes, discard unusable rows, and retain unknown
 * values as null instead of inferring confirmation, access or remaining capacity. */
const array = value => Array.isArray(value) ? value : [];
const id = value => Number.isSafeInteger(value) && value > 0;
const clean = (value, max = 160) => String(value ?? '').trim().slice(0, max);
const date = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
export const FEED_URLS = Object.freeze({
    thera: 'https://api.eve-scout.com/v2/public/signatures?system_name=Thera',
    turnur: 'https://api.eve-scout.com/v2/public/signatures?system_name=Turnur',
    storms: 'https://api.eve-scout.com/v2/public/observations',
    wormhole_types: 'https://api.eve-scout.com/v2/public/wormholetypes',
    combat: 'https://r2z2.zkillboard.com/ephemeral/sequence.json',
});
/** Normalize up to 1,000 Thera/Turnur reports, deduplicated by source/report ID.
 * Keep only complete, unexpired atlas-matched endpoints from the expected hub.
 * Drop unmatched rows; throw on malformed input or when no output matches despite
 * current complete reports. Return [] when no live complete reports remain. */
export function normalizeConnections(rows, source, atlas, now) {
    if (!Array.isArray(rows) || rows.length > 1000) throw new Error('The wormhole provider returned an unexpected response.');
    const systems = atlas.bySystemId || new Map(atlas.systems.map(s => [s.system_id, s]));
    const hubName = source === 'thera' ? 'Thera' : 'Turnur';
    const out = new Map();
    for (const row of rows) {
        if (row.signature_type !== 'wormhole') continue;
        const expires = date(row.expires_at), from = systems.get(row.out_system_id), to = systems.get(row.in_system_id);
        if (!expires || Date.parse(expires) <= now || !from || !to || from.system_id === to.system_id || from.name !== hubName) continue;
        if (!['string', 'number'].includes(typeof row.id) || row.completed !== true) continue;
        const key = source + ':' + clean(row.id, 80);
        out.set(key, { id: key, source, from_system_id: from.system_id, to_system_id: to.system_id,
            out_system_id: from.system_id, in_system_id: to.system_id, in_system_class: clean(row.in_system_class, 16) || null,
            from_signature: clean(row.out_signature, 16), to_signature: clean(row.in_signature, 16),
            out_signature: clean(row.out_signature, 16), in_signature: clean(row.in_signature, 16),
            expires_at: expires, updated_at: date(row.updated_at), completed: true,
            created_at: date(row.created_at), completed_at: date(row.completed_at),
            observed_at: date(row.updated_at) || date(row.completed_at) || date(row.created_at),
            reported_remaining_hours: number(row.remaining_hours), comment: clean(row.comment, 512),
            max_ship_size: row.max_ship_size ? clean(row.max_ship_size, 32) : null,
            wh_type: row.wh_type ? clean(row.wh_type, 16) : null, wh_exits_outward: typeof row.wh_exits_outward === 'boolean' ? row.wh_exits_outward : null,
            reported: true, stale: false });
    }
    if (rows.length && !out.size && rows.some(row => row.signature_type === 'wormhole' && Date.parse(row.expires_at) > now && row.completed === true))
        throw new Error('Current wormhole reports could not be matched to the bundled universe.');
    return [...out.values()];
}
/** Map provider nominal limits by type identifier. Nonpositive mass/lifetime
 * limits become null; regeneration retains any finite reported number, including
 * zero. Neither field describes remaining connection mass. */
export function normalizeWormholeTypes(rows) {
    if (!Array.isArray(rows) || rows.length > 1000) throw new Error('The wormhole type provider returned an unexpected response.');
    const result = new Map();
    for (const row of rows) {
        if (!/^[A-Z][0-9]{3}$/.test(row.identifier || '')) continue;
        const positive = value => number(value) !== null && value > 0 ? value : null;
        result.set(row.identifier, { identifier: row.identifier, type_id: id(row.type_id) ? row.type_id : null,
            max_jump_mass_kg: positive(row.max_jump_mass), max_stable_mass_kg: positive(row.max_stable_mass),
            nominal_lifetime_minutes: positive(row.max_stable_time), mass_regeneration_kg: number(row.mass_regeneration),
            target_system_class: clean(row.target_system_class, 16) || null });
    }
    if (rows.length && !result.size) throw new Error('Wormhole type records could not be understood.');
    return [...result.values()];
}
function neighbours(atlas) {
    if (atlas.neighbors) return atlas.neighbors;
    const result = new Map(atlas.systems.map(s => [s.system_id, new Set()]));
    for (const gate of atlas.gates) {
        result.get(gate.from_system_id)?.add(gate.to_system_id);
        result.get(gate.to_system_id)?.add(gate.from_system_id);
    }
    return result;
}
/** Derive strong centre/one-hop and weak two/three-hop storm areas over stargates.
 * Callers validate the centre; special travel links never extend this footprint. */
export function stormArea(systemId, atlas) {
    const graph = neighbours(atlas), seen = new Set([systemId]), strong = [systemId], weak = [];
    let frontier = [systemId];
    for (let depth = 1; depth <= 3; depth++) {
        const next = [];
        for (const from of frontier) for (const to of graph.get(from) || []) if (!seen.has(to)) {
            seen.add(to); next.push(to); (depth === 1 ? strong : weak).push(to);
        }
        frontier = next;
    }
    return { strong_system_ids: strong, weak_system_ids: weak };
}
/** Separate bounded public storm and space-oddity reports. Unknown systems and
 * timestamps over five minutes in the future are ignored; storm centres require
 * known nullsec. Reports
 * older than a day remain explicitly stale rather than becoming fresh on import. */
export function normalizeObservations(rows, atlas, now) {
    if (!Array.isArray(rows) || rows.length > 1000) throw new Error('The observation provider returned an unexpected response.');
    const systems = atlas.bySystemId || new Map(atlas.systems.map(s => [s.system_id, s]));
    const storms = [], points = [];
    for (const row of rows) {
        const observed = date(row.created_at), system = systems.get(row.system_id);
        if (!system || !observed || Date.parse(observed) > now + 300000) continue;
        const common = { id: 'eve-scout:' + clean(row.id, 80), system_id: row.system_id, name: clean(row.display_name),
            source: 'eve-scout', observed_at: observed, expires_at: null, reported: true,
            observed_in_person: row.observed_in_person === true, age_hours: Math.max(0, (now - Date.parse(observed)) / 3600000),
            stale: now - Date.parse(observed) > 86400000 };
        if (row.observation_category === 'storm') {
            const type = /^(electric|gamma|exotic|plasma)_[ab]$/.exec(row.observation_type || '')?.[1];
            if (!type || system.space !== 'known' || system.security > 0) continue;
            storms.push({ ...common, type: type[0].toUpperCase() + type.slice(1), observation_type: row.observation_type, ...stormArea(row.system_id, atlas) });
        } else if (row.observation_category === 'space_oddity') points.push({ ...common, kind: 'space_oddity' });
    }
    if (rows.some(row => row.observation_category === 'storm') && !storms.length)
        throw new Error('Storm observations could not be matched to the bundled universe.');
    return { storms, points };
}
/** Validate an entire manual replacement (array or {items}, at most 32 reports).
 * Each report needs distinct identity, nullsec centre and an observation/expiry
 * span no longer than seven days. Throw before the feed owner persists anything. */
export function normalizeManualStorms(input, atlas, now) {
    const rows = Array.isArray(input) ? input : input?.items;
    if (!Array.isArray(rows) || rows.length > 32) throw new Error('Import at most 32 storm reports.');
    const systems = atlas.bySystemId || new Map(atlas.systems.map(s => [s.system_id, s]));
    const keys = new Set();
    return rows.map((row, index) => {
        const system = systems.get(Number(row.system_id)), observed = date(row.observed_at), expires = date(row.expires_at);
        if (!system || system.space !== 'known' || system.security > 0) throw new Error('Storm reports need a known null-security system.');
        if (!['Electric', 'Gamma', 'Exotic', 'Plasma'].includes(row.type)) throw new Error('Choose Electric, Gamma, Exotic or Plasma.');
        if (!observed || !expires || Date.parse(observed) > now + 300000 || Date.parse(expires) <= Date.parse(observed) || Date.parse(expires) - Date.parse(observed) > 7 * 86400000)
            throw new Error('Storm reports need an observation time and an expiry within seven days.');
        const key = clean(String(row.id || 'report-' + index).replace(/^manual:/, ''), 80);
        if (!/^[a-zA-Z0-9_-]+$/.test(key) || keys.has(key)) throw new Error('Storm report IDs must be distinct letters, numbers, hyphens or underscores.');
        keys.add(key);
        return { id: 'manual:' + key, system_id: system.system_id, name: clean(row.name || row.type + ' storm'), type: row.type,
            observed_at: observed, expires_at: expires, source: 'manual', reported: true, ...stormArea(system.system_id, atlas) };
    });
}
/** Project valid atlas-matched ESI campaigns; scheduled/active compares start time
 * with now, not a prediction that the campaign has actually begun or completed. */
export function normalizeCampaigns(rows, atlas, now) {
    const known = new Set(atlas.systems.map(s => s.system_id));
    return array(rows).filter(row => id(row.campaign_id) && known.has(row.solar_system_id) && date(row.start_time)).map(row => ({
        id: row.campaign_id, system_id: row.solar_system_id, constellation_id: row.constellation_id,
        structure_id: row.structure_id, defender_id: id(row.defender_id) ? row.defender_id : null,
        event_type: clean(row.event_type, 48), start_time: date(row.start_time), attackers_score: number(row.attackers_score),
        defender_score: number(row.defender_score), status: Date.parse(row.start_time) > now ? 'scheduled' : 'active',
    }));
}
/** Project reported alliance development/hub windows; missing numeric indices
 * remain null. Faction/unclaimed systems do not acquire inferred development. */
export function normalizeDevelopment(value, atlas) {
    const known = new Set(atlas.systems.map(s => s.system_id));
    return array(value?.solar_systems || value).flatMap(row => {
        const systemId = row.solar_system_id || row.system_id, claim = row.claim?.alliance;
        if (!known.has(systemId) || !claim) return [];
        const development = claim.development || {}, window = claim.sovereignty_hub?.vulnerability_window;
        return [{ system_id: systemId, alliance_id: claim.alliance_id, adm: number(development.activity_defense_multiplier),
            industrial_level: number(development.industrial_level), military_level: number(development.military_level),
            strategic_level: number(development.strategic_level), is_capital: typeof claim.is_capital_system === 'boolean' ? claim.is_capital_system : null,
            structure_id: claim.sovereignty_hub?.id || null, vulnerability_start: date(window?.start), vulnerability_end: date(window?.end),
            active_campaign: !!claim.sovereignty_hub && !window }];
    });
}
/** Compact one public R2Z2 kill for map display, or null for invalid/unknown-system
 * evidence or timestamps over five minutes in the future. total_value is the
 * provider's ISK estimate, not Session accounting. */
export function normalizeKill(row, atlas, now) {
    const esi = row?.esi, killId = row?.killmail_id || esi?.killmail_id, timestamp = date(esi?.killmail_time);
    if (!id(killId) || !timestamp || Date.parse(timestamp) > now + 300000 || !atlas.systems.some(s => s.system_id === esi?.solar_system_id)) return null;
    return { killmail_id: killId, system_id: esi.solar_system_id, time: timestamp,
        victim_ship_type_id: id(esi.victim?.ship_type_id) ? esi.victim.ship_type_id : null,
        victim_alliance_id: id(esi.victim?.alliance_id) ? esi.victim.alliance_id : null,
        total_value: number(row.zkb?.totalValue), source: 'zkillboard' };
}
/** Extract a complete rolling NPC-count snapshot or null. Provider modified time
 * identifies a window when available; otherwise use observed update time. Repeated
 * receipt of the same identity must not manufacture a new comparison window. */
export function npcSample(snapshot) {
    if (!snapshot || !['ready', 'stale'].includes(snapshot.status) || !Array.isArray(snapshot.data) || snapshot.truncated) return null;
    const at = date(snapshot.sourceModifiedAt || snapshot.headers?.['last-modified'] || snapshot.updatedAt);
    if (!at) return null;
    return { at, identity: snapshot.sourceModifiedAt || snapshot.headers?.['last-modified'] || snapshot.updatedAt,
        window_kind: snapshot.sourceModifiedAt || snapshot.headers?.['last-modified'] ? 'provider' : 'observed',
        rows: snapshot.data.filter(row => id(row.system_id) && number(row.npc_kills) !== null && row.npc_kills >= 0)
            .map(row => ({ system_id: row.system_id, npc_kills: row.npc_kills })) };
}
/** Compare two ordered complete rolling-hour totals. Absent systems mean zero
 * only within those complete samples; negative deltas are valid and are not a
 * count of kills between samples. Missing/out-of-order windows yield []. */
export function npcDeltas(previous, current, atlas) {
    if (!previous || !current || Date.parse(previous.at) >= Date.parse(current.at)) return [];
    const before = new Map(previous.rows.map(row => [row.system_id, row.npc_kills])), after = new Map(current.rows.map(row => [row.system_id, row.npc_kills]));
    return atlas.systems.filter(s => s.space === 'known' && (before.has(s.system_id) || after.has(s.system_id))).map(s => ({
        system_id: s.system_id, previous: before.get(s.system_id) || 0, current: after.get(s.system_id) || 0,
        delta: (after.get(s.system_id) || 0) - (before.get(s.system_id) || 0), from: previous.at, to: current.at,
        window_kind: previous.window_kind === 'provider' && current.window_kind === 'provider' ? 'provider' : 'observed',
    }));
}
