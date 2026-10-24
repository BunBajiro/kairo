import { allocateTerritoryColours, territoryColourEntities, FACTION_TERRITORY_COLOURS } from './universe-territory-colours.mjs';

const array = value => Array.isArray(value) ? value : [];
const validId = value => Number.isSafeInteger(value) && value > 0;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const readable = source => source?.status === 'ready' || source?.status === 'stale';
const staleSource = source => readable(source) && (source.status === 'stale' || source.stale === true || source.truncated === true);
const validColour = value => /^#[0-9a-f]{6}$/i.test(String(value || ''));
const knownNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

function ownerIdentity(sovereignty) {
    if (!sovereignty) return null;
    if (validId(sovereignty.alliance_id)) return { key: 'a' + sovereignty.alliance_id, allianceId: sovereignty.alliance_id,
        name: sovereignty.alliance_name || 'Alliance ' + sovereignty.alliance_id };
    if (validId(sovereignty.faction_id)) return { key: 'f' + sovereignty.faction_id, allianceId: null,
        name: sovereignty.faction_name || FACTION_TERRITORY_COLOURS[sovereignty.faction_id]?.name || 'Faction ' + sovereignty.faction_id };
    if (validId(sovereignty.corporation_id)) return { key: 'c' + sovereignty.corporation_id, allianceId: null,
        name: sovereignty.corporation_name || 'Corporation ' + sovereignty.corporation_id };
    return null;
}

function activityValue(overlay, metric, intel) {
    const source = metric === 'jumps' ? 'jumps' : 'kills';
    if (!readable(intel?.sources?.[source])) return null;
    if (source === 'jumps') {
        // Only absent values use an explicit server default. A supplied null
        // means unknown and must survive aggregation.
        return knownNumber(overlay.jumps === undefined ? intel?.defaults?.jumps : overlay.jumps);
    }
    if (overlay.kills === null) return null;
    const value = overlay.kills?.[metric];
    return knownNumber(value === undefined ? intel?.defaults?.kills?.[metric] : value);
}

/** Political geography over the complete, observed K-space ownership snapshot.
 * Neighbours mean real gate crossings only; they never imply friendship,
 * hostility, access rights or membership. No atlas faction metadata is used. */
export function buildPoliticalAtlas(atlas, intel, layer = 'power_blocs') {
    const knownSystems = new Map(array(atlas?.systems).filter(system => system.space === 'known' && validId(system.system_id)).map(system => [system.system_id, system]));
    const overlays = new Map(array(intel?.systems).filter(row => validId(row?.system_id)).map(row => [row.system_id, row]));
    const available = readable(intel?.sources?.sovereignty), grouping = layer === 'power_blocs';
    const groups = new Map(array(intel?.politics?.groups).filter(group => group?.id && ['configured', 'inferred'].includes(group.source)).map(group => [String(group.id), group]));
    // Overlay membership is the shared resolver's result. Do not independently
    // regroup ownership using a possibly older group's member list.
    for (const overlay of overlays.values()) {
        const member = overlay.power_bloc;
        if (member?.group_id && ['configured', 'inferred'].includes(member.source) && !groups.has(String(member.group_id)))
            groups.set(String(member.group_id), { id: String(member.group_id), name: member.name, source: member.source, color: member.color,
                alliance_ids: validId(member.alliance_id) ? [member.alliance_id] : [] });
    }
    const paletteRows = [...overlays.values()].map(row => row.sovereignty).filter(Boolean), paletteGroups = [...groups.values()];
    const providedPalette = intel?.politics?.territory_colours || {};
    let fallbackPalette = null;
    const paintFor = key => {
        const cached = providedPalette[key];
        if (validColour(cached?.fill) && validColour(cached?.outline)) return cached;
        if (!fallbackPalette) fallbackPalette = allocateTerritoryColours(territoryColourEntities(paletteRows, paletteGroups));
        return fallbackPalette.get(key) || { fill: '#77879a', outline: '#b5c0cd' };
    };
    const regions = new Map(array(atlas?.regions).map(region => [region.region_id, region.name]));
    const territories = new Map(), systemTerritories = new Map();
    function ensure(identity) {
        if (!territories.has(identity.key)) {
            const paint = paintFor(identity.key);
            territories.set(identity.key, { key: identity.key, name: String(identity.name), source: identity.source, color: paint.fill, outline: paint.outline,
                systemIds: [], allianceIds: new Set(array(identity.allianceIds).filter(validId)), regions: new Map(), neighbours: new Map(),
                activity: { shipKills: 0, podKills: 0, jumps: 0 } });
        }
        return territories.get(identity.key);
    }
    // Keep deliberately configured definitions inspectable even when no owned
    // systems are present. Zero systems does not claim the group has no members.
    if (grouping) for (const group of groups.values()) if (group.source === 'configured') ensure({ key: 'bloc:' + group.id,
        name: group.name || 'Configured bloc', source: 'configured', allianceIds: group.alliance_ids });
    let totalSovereignSystems = 0;
    if (available) for (const [systemId, system] of knownSystems) {
        const overlay = overlays.get(systemId), owner = ownerIdentity(overlay?.sovereignty);
        if (!owner) continue;
        const membership = overlay.power_bloc, sameOwner = owner.allianceId != null && membership?.alliance_id === owner.allianceId;
        const group = grouping && sameOwner && membership.group_id && ['configured', 'inferred'].includes(membership.source) ? groups.get(String(membership.group_id)) : null;
        // Both the membership and definition must agree about their provenance.
        const grouped = group && group.source === membership.source;
        const identity = grouped ? { key: 'bloc:' + group.id, name: group.name || membership.name || 'Power bloc', source: group.source, allianceIds: group.alliance_ids } :
            { ...owner, source: grouping && owner.allianceId ? sameOwner && membership.source === 'independent' ? 'independent' : 'unassigned' : 'sovereignty', allianceIds: owner.allianceId ? [owner.allianceId] : [] };
        const territory = ensure(identity);
        if (owner.allianceId) territory.allianceIds.add(owner.allianceId);
        territory.systemIds.push(systemId); systemTerritories.set(systemId, territory.key); totalSovereignSystems++;
        const regionId = validId(system.region_id) ? system.region_id : 0;
        if (!territory.regions.has(regionId)) territory.regions.set(regionId, { regionId, name: system.region_name || regions.get(regionId) || 'Unknown region', systemCount: 0 });
        territory.regions.get(regionId).systemCount++;
        for (const [field, metric] of [['shipKills', 'ship_kills'], ['podKills', 'pod_kills'], ['jumps', 'jumps']]) {
            const value = activityValue(overlay, metric, intel);
            territory.activity[field] = territory.activity[field] === null || value === null ? null : territory.activity[field] + value;
        }
    }
    const seenGates = new Set();
    for (const gate of array(atlas?.gates)) {
        // The atlas is the static gate graph. Explicitly marked special links
        // are rejected if a caller accidentally mixes them into that graph.
        if (gate.kind && !['gate', 'stargate'].includes(gate.kind)) continue;
        const from = gate.from_system_id, to = gate.to_system_id;
        if (!validId(from) || !validId(to) || from === to) continue;
        const pair = Math.min(from, to) + ':' + Math.max(from, to);
        if (seenGates.has(pair)) continue;
        seenGates.add(pair);
        const fromKey = systemTerritories.get(from), toKey = systemTerritories.get(to);
        if (!fromKey || !toKey || fromKey === toKey) continue;
        for (const [key, otherKey, fromSystemId, toSystemId] of [[fromKey, toKey, from, to], [toKey, fromKey, to, from]]) {
            const territory = territories.get(key), other = territories.get(otherKey);
            if (!territory.neighbours.has(otherKey)) territory.neighbours.set(otherKey, { key: otherKey, name: other.name, color: other.color, gateCount: 0, connections: [] });
            const neighbour = territory.neighbours.get(otherKey);
            neighbour.gateCount++; neighbour.connections.push({ fromSystemId, toSystemId });
        }
    }
    const output = [...territories.values()].map(row => ({ ...row,
        systemIds: row.systemIds.sort((a, b) => a - b), allianceIds: [...row.allianceIds].sort((a, b) => a - b),
        regions: [...row.regions.values()].sort((a, b) => b.systemCount - a.systemCount || compare(a.name, b.name) || a.regionId - b.regionId),
        neighbours: [...row.neighbours.values()].map(neighbour => ({ ...neighbour,
            connections: neighbour.connections.sort((a, b) => a.fromSystemId - b.fromSystemId || a.toSystemId - b.toSystemId) }))
            .sort((a, b) => b.gateCount - a.gateCount || compare(a.name, b.name) || compare(a.key, b.key)),
        activity: row.systemIds.length ? row.activity : { shipKills: null, podKills: null, jumps: null },
    })).sort((a, b) => b.systemIds.length - a.systemIds.length || compare(a.name, b.name) || compare(a.key, b.key));
    const stale = staleSource(intel?.sources?.sovereignty) || totalSovereignSystems > 0 &&
        (staleSource(intel?.sources?.kills) || staleSource(intel?.sources?.jumps)) || grouping && intel?.politics?.status === 'stale';
    return { territories: output, totalSovereignSystems, unobservedSystemCount: knownSystems.size - totalSovereignSystems, available, stale: !!stale };
}
