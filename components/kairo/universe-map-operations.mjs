// Operational map models stay separate from political ownership and physical routing.
import {schematicLayout} from '../../lib/universe-schematic-layout.mjs';
const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const date = value => typeof value === 'number' ? value : Date.parse(value || '');
export function buildGateGraph(gates = []) {
  const graph = new Map();
  for (const gate of gates) {
    if (gate.kind && gate.kind !== 'gate') continue;
    const from = id(gate.from_system_id), to = id(gate.to_system_id);
    if (!from || !to || from === to) continue;
    if (!graph.has(from)) graph.set(from, new Set());
    if (!graph.has(to)) graph.set(to, new Set());
    graph.get(from).add(to); graph.get(to).add(from);
  }
  return new Map([...graph].sort(([a], [b]) => a - b).map(([key, values]) => [key, [...values].sort((a, b) => a - b)]));
}
/** One multi-source BFS, cached by the caller. Only real stargates enter this graph. */
export function routeWatchDistances(graph, origins, maxHops = 6) {
  const result = new Map(), queue = [...new Set(origins.map(id).filter(Boolean))].sort((a, b) => a - b);
  for (const origin of queue) result.set(origin, {distance: 0, nearestRouteSystemId: origin, nextSystemId: null});
  const limit = Math.max(0, Math.min(12, Math.floor(maxHops)));
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index], entry = result.get(current);
    if (entry.distance >= limit) continue;
    for (const next of graph.get(current) || []) if (!result.has(next)) {
      result.set(next, {distance: entry.distance + 1, nearestRouteSystemId: entry.nearestRouteSystemId, nextSystemId: current}); queue.push(next);
    }
  }
  return result;
}

/** Radar uses hop bands; schematic uses CCP's in-game 2D positions at any scope. */
export function tacticalLayout(systems, graph, {mode = 'radar', centerSystemId, hops = 3, regionId, constellationId} = {}) {
  const lookup = new Map(systems.filter(system => system.space === 'known').map(system => [system.system_id, system]));
  if (mode === 'schematic') {
    const eligible = [...lookup.values()].filter(system => (!regionId || system.region_id === regionId) && (!constellationId || system.constellation_id === constellationId));
    return {points: schematicLayout(eligible).points, distances: new Map(), limited: false, total: eligible.length};
  }
  const center = lookup.get(centerSystemId);
  if (!center) return {points: [], distances: new Map(), limited: false, total: 0};
  const distances = routeWatchDistances(graph, [center.system_id], mode === 'radar' ? Math.max(1, Math.min(6, hops)) : 12);
  const eligible = mode === 'radar' ? [...distances.keys()].map(key => lookup.get(key)).filter(Boolean) : [...lookup.values()].filter(system => system.region_id === (regionId || center.region_id));
  eligible.sort((a, b) => (distances.get(a.system_id)?.distance ?? 99) - (distances.get(b.system_id)?.distance ?? 99) || a.system_id - b.system_id);
  const total = eligible.length, chosen = eligible.slice(0, mode === 'radar' ? 240 : 600), remaining = new Set(chosen.map(system => system.system_id)), components = [];
  for (const system of chosen) {
    if (!remaining.delete(system.system_id)) continue;
    const queue = [system.system_id], levels = new Map([[system.system_id, 0]]);
    for (let index = 0; index < queue.length; index++) for (const next of graph.get(queue[index]) || []) if (remaining.delete(next)) {queue.push(next); levels.set(next, levels.get(queue[index]) + 1);}
    components.push({queue, levels});
  }
  const points = []; let offset = 0;
  for (const component of components) {
    const componentPoints = [];
    const bands = new Map();
    for (const systemId of component.queue) {const tier = mode === 'radar' ? distances.get(systemId)?.distance || 0 : component.levels.get(systemId); if (!bands.has(tier)) bands.set(tier, []); bands.get(tier).push(systemId);}
    let radius = 0;
    for (const [tier, ids] of [...bands].sort(([a], [b]) => a - b)) {
      ids.sort((a, b) => {const aa = lookup.get(a), bb = lookup.get(b); return Math.atan2(aa.map_y - center.map_y, aa.map_x - center.map_x) - Math.atan2(bb.map_y - center.map_y, bb.map_x - center.map_x) || a - b;});
      radius = tier === 0 ? 0 : Math.max(radius + 100, ids.length * 64 / (2 * Math.PI));
      ids.forEach((systemId, index) => {const angle = index / ids.length * Math.PI * 2 - Math.PI / 2; componentPoints.push({system: lookup.get(systemId), x: Math.cos(angle) * radius, y: Math.sin(angle) * radius});});
    }
    points.push(...componentPoints.map(point => ({...point, x: point.x + offset + radius})));
    offset += radius * 2 + 240;
  }
  return {points, distances, limited: total > chosen.length, total};
}

export function observationAge(observation, now = Date.now()) {
  const at = date(observation.observed_at || observation.updated_at), expires = date(observation.expires_at);
  if (observation.expired || Number.isFinite(expires) && expires <= now) return 'expired';
  if (!Number.isFinite(at) || at > now + 60_000) return 'unknown';
  const seconds = (now - at) / 1000;
  return seconds < 30 ? 'fresh' : seconds < 150 ? 'recent' : 'older';
}
export function ageLabel(value, now = Date.now()) {
  const at = date(value); if (!Number.isFinite(at)) return 'time unavailable';
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  return seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : `${Math.floor(seconds / 3600)}h ago`;
}
export function operationalSystems(operations, now = Date.now()) {
  const grouped = new Map();
  const enabled = operations?.config?.enabled !== false;
  const get = systemId => {const key = id(systemId); if (!key) return null; if (!grouped.has(key)) grouped.set(key, {systemId: key, reports: [], pilots: [], fleet: [], alerts: [], signatures: [], upgrades: []}); return grouped.get(key);};
  for (const report of enabled ? operations?.intel || [] : []) {
    if (observationAge(report, now) === 'expired' || !Number.isFinite(date(report.observed_at))) continue;
    for (const systemId of new Set(report.system_ids || [])) get(systemId)?.reports.push({...report, age: observationAge(report, now)});
  }
  for (const pilot of enabled ? operations?.pilots || [] : []) {
    const stale = !!pilot.status && pilot.status !== 'ready' || observationAge(pilot, now) === 'expired' || !Number.isFinite(date(pilot.updated_at));
    get(pilot.system_id)?.pilots.push({...pilot, stale});
  }
  const fleet = enabled ? operations?.fleet : null;
  const staleFleet = !!fleet && (fleet.status !== 'ready' || observationAge(fleet, now) === 'expired' || !Number.isFinite(date(fleet.updated_at)));
  const localPilots = new Map((enabled ? operations?.pilots || [] : []).map(pilot => [pilot.character_id, pilot]));
  for (const member of fleet?.members || []) {
    const pilot = localPilots.get(member.character_id);
    if (pilot?.system_id && Number.isFinite(date(pilot.updated_at))) {
      if (!Number.isFinite(date(fleet.updated_at)) || date(pilot.updated_at) >= date(fleet.updated_at)) continue;
      const old = get(pilot.system_id); if (old) old.pilots = old.pilots.filter(value => value.character_id !== member.character_id);
    }
    get(member.system_id)?.fleet.push({...member, stale: staleFleet, updated_at: fleet.updated_at});
  }
  for (const alert of enabled ? operations?.alerts || [] : []) {
    if (alert.acknowledged_at || date(alert.expires_at) <= now) continue;
    for (const systemId of alert.system_ids || []) get(systemId)?.alerts.push(alert);
  }
  for (const signature of operations?.signatures || []) if (!signature.missing) get(signature.system_id)?.signatures.push(signature);
  for (const upgrade of operations?.upgrades || []) get(upgrade.system_id)?.upgrades.push(upgrade);
  for (const value of grouped.values()) {
    value.reports.sort((a, b) => date(b.observed_at) - date(a.observed_at) || String(a.id).localeCompare(String(b.id)));
    // Clear is an observation. A newer clear does not erase another channel's report.
    const channels = new Set(); value.reports = value.reports.filter(report => {const key = `${report.source}:${report.channel || ''}`; if (channels.has(key)) return false; channels.add(key); return true;});
    const pilotIds = new Set(value.pilots.map(pilot => pilot.character_id));
    value.fleet = value.fleet.filter(member => !pilotIds.has(member.character_id));
  }
  return grouped;
}

export function projectedHull(points) {
  const sorted = [...new Map(points.map(point => [`${point.x}:${point.y}`, point])).values()].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x), lower = [], upper = [];
  for (const point of sorted) {while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop(); lower.push(point);}
  for (const point of [...sorted].reverse()) {while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop(); upper.push(point);}
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function matchingReachability(origins, reachability) {
  if (reachability?.status !== 'ok' || !Array.isArray(reachability.origins) || !origins?.length || reachability.origins.length !== origins.length) return false;
  const key = origin => `${Number(origin.systemId)}:${Number(origin.rangeLy).toFixed(6)}`;
  const requested = origins.map(key).sort(), supplied = reachability.origins.map(key).sort();
  return requested.every((value, index) => value === supplied[index]);
}

export function usablePublicConnections(feeds, now = Date.now()) {
  return (feeds?.connections || []).filter(row => {
    const source = feeds?.sources?.[row.source];
    return row.completed === true && row.reported === true && !row.stale && Number.isFinite(date(row.expires_at)) && date(row.expires_at) > now
      && (!source || source.status === 'ready' && (!source.expires_at || date(source.expires_at) > now));
  });
}

/** Public/source-attributed context. Stale reports stay explicitly stale, never live alerts. */
export function feedSystems(feeds, now = Date.now()) {
  const result = new Map();
  const add = (systemId, item) => {const key = id(systemId); if (!key) return; if (!result.has(key)) result.set(key, []); result.get(key).push(item);};
  const stale = (source, item = {}) => !!item.stale || date(item.expires_at) <= now || !!feeds?.sources?.[source] && (feeds.sources[source].status !== 'ready' || date(feeds.sources[source].expires_at) <= now);
  for (const storm of feeds?.storms || []) {
    const common = {kind: 'storm', name: `${storm.type || storm.name || 'Reported'} storm`, source: storm.source || 'manual', stale: stale('storms', storm), at: storm.observed_at};
    add(storm.system_id, {...common, detail: 'Reported centre'});
    for (const systemId of storm.strong_system_ids || []) if (systemId !== storm.system_id) add(systemId, {...common, detail: 'Strong area'});
    for (const systemId of storm.weak_system_ids || []) if (systemId !== storm.system_id && !(storm.strong_system_ids || []).includes(systemId)) add(systemId, {...common, detail: 'Weak area'});
  }
  for (const campaign of feeds?.campaigns || []) add(campaign.system_id, {kind: 'campaign', name: `${campaign.event_type || 'Sovereignty'} campaign`, source: 'ESI', stale: stale('campaigns'), at: campaign.start_time, detail: campaign.status === 'active' ? 'Active campaign' : 'Scheduled campaign'});
  for (const combat of feeds?.combat || []) add(combat.system_id, {kind: 'combat', name: 'Reported destruction', source: combat.source || 'zkillboard', stale: stale('combat'), at: combat.time, detail: combat.victim_ship_type_id ? `Ship type ${combat.victim_ship_type_id}` : 'Public kill report'});
  for (const point of feeds?.points || []) add(point.system_id, {kind: point.kind || 'poi', name: point.name || 'Point of interest', source: point.source || 'static', stale: stale('points'), detail: point.description || point.kind || 'Point of interest'});
  for (const connection of feeds?.connections || []) {
    if (connection.stale || date(connection.expires_at) <= now || stale(connection.source, connection)) continue;
    add(connection.from_system_id, {kind: 'wormhole', name: `${connection.source === 'turnur' ? 'Turnur' : 'Thera'} connection`, source: connection.source, stale: false, detail: connection.from_signature || 'Reported entrance'});
    add(connection.to_system_id, {kind: 'wormhole', name: `${connection.source === 'turnur' ? 'Turnur' : 'Thera'} connection`, source: connection.source, stale: false, detail: connection.to_signature || 'Reported entrance'});
  }
  return result;
}
