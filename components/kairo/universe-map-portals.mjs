import {usablePublicConnections} from './universe-map-operations.mjs';

const PROVIDERS = Object.freeze([{source: 'thera', name: 'Thera'}, {source: 'turnur', name: 'Turnur'}]);
const timestamp = value => typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
const iso = value => Number.isFinite(timestamp(value)) ? new Date(timestamp(value)).toISOString() : null;
const systemId = value => Number.isSafeInteger(value) && value > 0 ? value : null;
const signature = value => typeof value === 'string' ? value.trim().slice(0, 32) : '';
const age = (value, now) => Number.isFinite(timestamp(value)) ? Math.max(0, now - timestamp(value)) : null;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const stableJSON = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const newer = (a, b) => (timestamp(a.observedAt) || 0) - (timestamp(b.observedAt) || 0)
  || timestamp(a.expiresAt) - timestamp(b.expiresAt) || compare(stableJSON(a.report), stableJSON(b.report));

/**
 * Source reports become inspectable map entrances, without inventing a position
 * for their hub. A report being usable means it is fresh enough to consider;
 * the route planner still applies opt-in, hull, size and mass restrictions.
 * Distinct report IDs and reciprocal signature metadata are never collapsed by
 * endpoint pair. Repeated versions of the same report use its newest observation.
 */
export function buildPortalNetworks(feeds, systems, now = Date.now()) {
  const rows = systems instanceof Map ? [...systems.values()] : Array.isArray(systems) ? systems : [];
  const lookup = new Map(rows.filter(row => systemId(row?.system_id)).map(row => [row.system_id, row]));
  const connections = Array.isArray(feeds?.connections) ? feeds.connections.filter(row => row && typeof row === 'object') : [];
  const usable = new Set(usablePublicConnections({...feeds, connections}, now));
  return PROVIDERS.map(({source, name}) => {
    const metadata = feeds?.sources?.[source];
    const sourceExpires = iso(metadata?.expires_at);
    const sourceExpired = !!metadata?.expires_at && (!sourceExpires || timestamp(sourceExpires) <= now);
    const status = sourceExpired && metadata?.status === 'ready' ? 'stale' : metadata?.status || 'waiting';
    const hub = rows.filter(row => row?.name === name && systemId(row.system_id)).sort((a, b) => a.system_id - b.system_id)[0] || null;
    const grouped = new Map();
    if (hub) for (const report of connections) {
      if (report.source !== source || !['string', 'number'].includes(typeof report.id)
        || typeof report.id === 'number' && !systemId(report.id)) continue;
      const reportId = String(report.id).trim();
      const expiresAt = iso(report.expires_at);
      const from = lookup.get(systemId(report.from_system_id)), to = lookup.get(systemId(report.to_system_id));
      if (!reportId || !expiresAt || timestamp(expiresAt) <= now || !from || !to || from.system_id === to.system_id) continue;
      if (from.system_id !== hub.system_id && to.system_id !== hub.system_id) continue;
      const outward = from.system_id === hub.system_id;
      const system = outward ? to : from;
      const fromSignature = signature(report.from_signature), toSignature = signature(report.to_signature);
      const hubSignature = outward ? fromSignature : toSignature, entranceSignature = outward ? toSignature : fromSignature;
      // Include direction and both signatures so a reciprocal record cannot
      // overwrite its partner's independently reported metadata.
      const id = `portal:${source}:${encodeURIComponent(reportId)}:${from.system_id}:${to.system_id}:${encodeURIComponent(fromSignature)}:${encodeURIComponent(toSignature)}`;
      const observedAt = iso(report.observed_at) || iso(report.updated_at) || iso(report.completed_at) || iso(report.created_at);
      const reasons = [];
      if (report.completed !== true) reasons.push('The connection report is incomplete.');
      if (status !== 'ready' || report.stale || sourceExpired) reasons.push('The public source is stale or unavailable.');
      if (report.reported !== true) reasons.push('This connection has not been fully reported.');
      if (report.route_eligible === false) reasons.push('This report is not eligible for public routing.');
      const state = report.completed !== true ? 'incomplete' : status !== 'ready' || report.stale || sourceExpired
        ? 'stale' : report.reported !== true || report.route_eligible === false ? 'not_eligible' : 'usable';
      const routingEligible = state === 'usable' && usable.has(report);
      const endpoint = {id, reportId, source, hub, system, systemId: system.system_id, space: system.space,
        hubSignature, signature: entranceSignature, state, usable: routingEligible, routingEligible, reasons,
        expiresAt, observedAt, remainingMs: timestamp(expiresAt) - now, ageMs: age(observedAt, now), report};
      const previous = grouped.get(id);
      if (!previous || newer(endpoint, previous) > 0) grouped.set(id, endpoint);
    }
    const endpoints = [...grouped.values()].sort((a, b) => compare(a.system.name, b.system.name) || a.systemId - b.systemId || compare(a.id, b.id));
    return {source, name, hub, status, updatedAt: iso(metadata?.updated_at), expiresAt: sourceExpires,
      ageMs: age(metadata?.updated_at, now), attribution: metadata?.attribution || 'EVE-Scout / Signal Cartel',
      endpoints, usableCount: endpoints.filter(row => row.usable).length, staleCount: endpoints.filter(row => row.state === 'stale').length};
  });
}
