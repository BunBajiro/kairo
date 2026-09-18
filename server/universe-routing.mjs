// Routing deliberately consumes physical coordinates and explicit travel settings.
// Map projection, visible layers and journey trails are never graph inputs.
// EVE's exact light-year differs from the scientific unit. Using the latter
// permits impossible near-boundary jumps: https://developers.eveonline.com/docs/guides/map-data/
export const LY_METRES = 9_460_000_000_000_000;
export const ANSIBLEX_RULES = Object.freeze({
    status: 'announced', announcedEffectiveDate: '2026-09-22', verifiedAt: '2026-09-18',
    source: 'https://www.eveonline.com/news/view/force-projection-ansiblex-capacitor-update',
    announcement: 'https://www.eveonline.com/news/view/major-update-force-projection-revamped',
    note: 'Published planning zones for the announced 22 September update; numerical values remain subject to change. Zone is measured from the owning alliance capital to the destination.',
    zones: Object.freeze([
        Object.freeze({ zone: 1, maxLy: 5, multiplier: 0 }),
        Object.freeze({ zone: 2, maxLy: 10, multiplier: 2 }),
        Object.freeze({ zone: 3, maxLy: 15, multiplier: 6 }),
        Object.freeze({ zone: 4, maxLy: 20, multiplier: 9 }),
        Object.freeze({ zone: 5, maxLy: null, multiplier: 15 }),
    ]),
});

const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const idOf = s => Number(s?.system_id ?? s?.id);
const endpoint = (e, direction) => Number(direction === 'from' ? e.from_system_id ?? e.fromSystemId ?? e.source : e.to_system_id ?? e.toSystemId ?? e.target);
const byId = systems => new Map((systems instanceof Map ? [...systems.values()] : systems || []).map(s => [idOf(s), s]).filter(([id]) => Number.isSafeInteger(id) && id > 0));
const get = (values, id) => values instanceof Map ? values.get(id) : values?.[id];
const invalid = explanation => ({ status: 'invalid', systemIds: [], edges: [], hops: 0, cost: null, explanation, warnings: [], excluded: [] });

export function distanceLy(a, b) {
    if (!a || !b) return null;
    const values = [a.x, a.y, a.z, b.x, b.y, b.z].map(number);
    if (values.some(v => v === null)) return null;
    return Math.hypot(values[0] - values[3], values[1] - values[4], values[2] - values[5]) / LY_METRES;
}

export function ansiblexZone(distance) {
    if (!Number.isFinite(distance) || distance < 0) return null;
    // The published table rounds intervals to one decimal place (5.1, 10.1...).
    // Continuous physical distances belong to the next zone above each boundary.
    return ANSIBLEX_RULES.zones.find(z => z.maxLy === null || distance <= z.maxLy).zone;
}

function settings(preferences = {}) {
    const zones = Array.isArray(preferences.ansiblexZones) ? preferences.ansiblexZones.filter(z => Number.isInteger(z) && z >= 1 && z <= 5) : [1, 2, 3, 4, 5];
    return {
        ...preferences, mode: preferences.mode === 'safer' ? 'safer' : 'shortest',
        useAnsiblex: preferences.useAnsiblex === true, useWormholes: preferences.useWormholes === true,
        maxAnsiblexZone: Math.max(1, Math.min(5, number(preferences.maxAnsiblexZone) ?? 5)),
        ansiblexZones: new Set(zones), avoidSystemIds: new Set((preferences.avoidSystemIds || []).map(Number)),
        ansiblexRules: preferences.ansiblexRules === 'announced' ? 'announced' : 'current',
    };
}

function standingFor(system, prefs) {
    const supplied = get(prefs.standings, idOf(system));
    return number(supplied !== undefined ? supplied : system.standing);
}

function systemBlocked(system, prefs) {
    const security = number(system.security ?? system.security_status);
    return prefs.avoidSystemIds.has(idOf(system)) || (prefs.avoidHostile === true && (standingFor(system, prefs) ?? 0) < 0)
        || (prefs.highSecOnly === true && (security === null || security < 0.45))
        || (prefs.avoidLowsec === true && security !== null && security > 0 && security < 0.45)
        || (prefs.avoidNullsec === true && security !== null && security <= 0);
}

function edgeCost(system, edge, prefs) {
    if (prefs.mode === 'shortest') return 1;
    const security = number(system.security ?? system.security_status), standing = standingFor(system, prefs);
    const securityPenalty = (security === null ? 8 : security >= 0.45 ? 0 : security > 0 ? 6 : 10) * (standing !== null && standing > 0 ? 0.25 : 1);
    const standingPenalty = standing === null ? 2 : standing < 0 ? 12 : 0;
    const activity = get(prefs.activity, idOf(system)) ?? system;
    const shipKills = Math.max(0, number(activity.ship_kills) ?? 0), podKills = Math.max(0, number(activity.pod_kills) ?? 0);
    const activityPenalty = Math.min(12, Math.log2(1 + shipKills + 2 * podKills));
    return 1 + securityPenalty + standingPenalty + activityPenalty + (edge.kind === 'wormhole' ? 3 : 0);
}

/** Build a directed graph. Static gate pairs are bidirectional; custom links retain per-direction metadata. */
export function buildTravelGraph({ systems = [], gates = [], connections = [], preferences = {}, now = Date.now() } = {}) {
    const lookup = byId(systems), prefs = settings(preferences), adjacency = new Map([...lookup.keys()].map(id => [id, []]));
    const edges = [], excluded = [], warnings = new Set(), seen = new Set();
    const clock = typeof now === 'number' ? now : Date.parse(now);
    const exclude = (edge, reason) => excluded.push({ id: edge.id ?? null, kind: edge.kind, from_system_id: edge.from_system_id, to_system_id: edge.to_system_id, reason });
    function add(edge) {
        const target = lookup.get(edge.to_system_id);
        if (!lookup.has(edge.from_system_id) || !target || edge.from_system_id === edge.to_system_id) return exclude(edge, 'Unknown or identical endpoints');
        if (systemBlocked(target, prefs)) return exclude(edge, 'Destination excluded by route preferences');
        const key = [edge.kind, edge.id, edge.from_system_id, edge.to_system_id].join(':');
        if (seen.has(key)) return;
        seen.add(key);
        const result = { ...edge, cost: edgeCost(target, edge, prefs) };
        adjacency.get(edge.from_system_id).push(result);
        edges.push(result);
    }
    for (const gate of gates) {
        const from = endpoint(gate, 'from'), to = endpoint(gate, 'to'), id = gate.id ?? `gate:${Math.min(from, to)}:${Math.max(from, to)}`;
        add({ id, kind: 'gate', from_system_id: from, to_system_id: to });
        if (gate.directional !== true) add({ id, kind: 'gate', from_system_id: to, to_system_id: from });
    }
    for (const connection of connections) {
        const kind = connection.kind;
        if (!['ansiblex', 'wormhole'].includes(kind)) continue;
        const from = endpoint(connection, 'from'), to = endpoint(connection, 'to');
        const base = { ...connection, id: connection.id ?? `${kind}:${from}:${to}`, kind, from_system_id: from, to_system_id: to };
        if (!prefs[kind === 'ansiblex' ? 'useAnsiblex' : 'useWormholes']) { exclude(base, `${kind === 'ansiblex' ? 'Ansiblex' : 'Wormhole'} routing is off`); continue; }
        if (connection.enabled !== true) { exclude(base, 'Connection is disabled'); continue; }
        const expiresAt = connection.expires_at ?? connection.expiresAt;
        if (kind === 'wormhole' && (!Number.isFinite(clock) || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= clock)) {
            exclude(base, 'Wormhole is expired or has no valid expiry'); continue;
        }
        for (const reverse of connection.directional === true ? [false] : [false, true]) {
            const edge = { ...base, from_system_id: reverse ? to : from, to_system_id: reverse ? from : to };
            const accessible = reverse ? connection.reverse_accessible ?? connection.accessible : connection.accessible;
            if (accessible !== true) { exclude(edge, 'Access has not been confirmed'); continue; }
            if (kind === 'ansiblex') {
                const forwardOwner = Number(connection.owner_alliance_id ?? connection.ownerAllianceId);
                const owner = Number((reverse ? connection.reverse_owner_alliance_id : null) ?? forwardOwner);
                // A separately owned return gate needs that owner's capital.
                // Reusing the outward capital would silently assign a false zone.
                const inheritedCapital = !reverse || !connection.reverse_owner_alliance_id || owner === forwardOwner ? connection.capital_system_id ?? connection.capitalSystemId : null;
                const capital = Number((reverse ? connection.reverse_capital_system_id : null) ?? inheritedCapital);
                if (prefs.ansiblexRules === 'announced') {
                    if (!owner || !Number(prefs.pilotAllianceId) || owner !== Number(prefs.pilotAllianceId)) { exclude(edge, 'Announced rules require membership of the owning alliance'); continue; }
                    if (prefs.shipClass && prefs.shipClass !== 'subcapital') { exclude(edge, 'Selected ship class is excluded by the announced Ansiblex model'); continue; }
                }
                const capitalDistance = distanceLy(lookup.get(capital), lookup.get(edge.to_system_id));
                const zone = ansiblexZone(capitalDistance);
                edge.owner_alliance_id = owner || null;
                edge.capital_system_id = capital || null;
                edge.capital_distance_ly = capitalDistance;
                edge.zone = zone;
                edge.zone_model = 'announced-2026-09-22';
                const restricted = prefs.maxAnsiblexZone < 5 || prefs.ansiblexZones.size < 5;
                if (zone === null && restricted) { exclude(edge, 'Capital or coordinates unknown; cannot apply zone preference'); continue; }
                if (zone !== null && (zone > prefs.maxAnsiblexZone || !prefs.ansiblexZones.has(zone))) { exclude(edge, `Destination zone ${zone} excluded by route preferences`); continue; }
                if (zone === null) warnings.add('Some Ansiblex destination zones are unknown because the owning alliance capital is not recorded.');
            }
            add(edge);
        }
    }
    return { bySystemId: lookup, adjacency, edges, excluded, warnings: [...warnings], preferences: prefs };
}

// Binary heap avoids the quadratic node scan that becomes visible on the full universe.
class MinHeap {
    items = [];
    push(value) {
        let i = this.items.length;
        this.items.push(value);
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.items[parent].cost <= value.cost) break;
            this.items[i] = this.items[parent]; i = parent;
        }
        this.items[i] = value;
    }
    pop() {
        if (!this.items.length) return null;
        const first = this.items[0], last = this.items.pop();
        if (this.items.length) {
            let i = 0;
            while (i * 2 + 1 < this.items.length) {
                let child = i * 2 + 1;
                if (child + 1 < this.items.length && this.items[child + 1].cost < this.items[child].cost) child++;
                if (last.cost <= this.items[child].cost) break;
                this.items[i] = this.items[child]; i = child;
            }
            this.items[i] = last;
        }
        return first;
    }
}

function search(origin, destination, outgoing) {
    const distances = new Map([[origin, 0]]), previous = new Map(), queue = new MinHeap();
    queue.push({ id: origin, cost: 0 });
    while (queue.items.length) {
        const current = queue.pop();
        if (current.cost !== distances.get(current.id)) continue;
        if (current.id === destination) break;
        for (const edge of outgoing(current.id)) {
            const candidate = current.cost + edge.cost;
            if (candidate < (distances.get(edge.to_system_id) ?? Infinity)) {
                distances.set(edge.to_system_id, candidate);
                previous.set(edge.to_system_id, edge);
                queue.push({ id: edge.to_system_id, cost: candidate });
            }
        }
    }
    if (!distances.has(destination)) return null;
    const edges = [];
    for (let node = destination; node !== origin;) {
        const edge = previous.get(node); edges.push(edge); node = edge.from_system_id;
    }
    edges.reverse();
    return { status: 'ok', systemIds: [origin, ...edges.map(e => e.to_system_id)], edges, hops: edges.length, cost: distances.get(destination) };
}

export function planRoute(input = {}) {
    const origin = Number(input.originId), destination = Number(input.destinationId), graph = buildTravelGraph(input);
    if (!graph.bySystemId.has(origin) || !graph.bySystemId.has(destination)) return invalid('Select two systems from the universe catalogue.');
    if (systemBlocked(graph.bySystemId.get(destination), graph.preferences) && origin !== destination) return invalid('The destination is excluded by your route preferences.');
    const route = search(origin, destination, id => graph.adjacency.get(id) || []);
    const warnings = [...graph.warnings, 'Route preferences and recorded activity do not guarantee safe travel.'];
    if (graph.preferences.useAnsiblex) {
        warnings.push('Ansiblex access and online state are user-confirmed; fuel or capacitor availability is not verified.');
        warnings.push(ANSIBLEX_RULES.note);
    }
    if (graph.preferences.useWormholes) warnings.push('Known wormholes can collapse before their recorded expiry; mass limits and current mass are not verified.');
    const explanation = graph.preferences.mode === 'safer'
        ? 'Weighted route prefers higher security and friendly standings, with extra costs for recorded hostility and ship or pod destruction. Missing standings receive a small uncertainty cost.'
        : 'Fewest travel legs through enabled connections after applying your route exclusions.';
    return route ? { ...route, explanation, warnings, excluded: graph.excluded } : {
        status: 'no_route', systemIds: [], edges: [], hops: 0, cost: null,
        explanation: 'No route connects these systems through the enabled, accessible connections and current exclusions.', warnings, excluded: graph.excluded,
    };
}

const NO_CYNO_REGIONS = new Set([10000004, 10000017, 10000019, 10000070, 10001000, 10001004]);
function physicalSystem(system) {
    return system && system.jump_eligible !== false && (!system.space || system.space === 'known') && !NO_CYNO_REGIONS.has(Number(system.region_id ?? system.regionId))
        && distanceLy(system, system) !== null;
}
function jumpDestination(system) {
    const security = number(system?.security ?? system?.security_status);
    return physicalSystem(system) && system.jump_eligible !== false && system.cyno_allowed !== false && security !== null && security < 0.45;
}

/** Physical jump-drive projection only. No stargate count, projected map coordinate, or Ansiblex edge is used. */
export function planJumpRoute({ systems = [], originId, destinationId, rangeLy, preferences = {} } = {}) {
    const lookup = byId(systems), origin = Number(originId), destination = Number(destinationId), range = number(rangeLy), prefs = settings(preferences);
    if (!lookup.has(origin) || !lookup.has(destination)) return invalid('Select two systems from the universe catalogue.');
    if (range === null || range <= 0 || range > 20) return invalid('Enter a physical jump range above 0 and no greater than 20 light-years.');
    if (!physicalSystem(lookup.get(origin))) return invalid('The origin is outside supported jump-drive space or has no physical coordinates.');
    if (origin !== destination && !jumpDestination(lookup.get(destination))) return invalid('The destination cannot be used as a standard cyno destination (highsec, Pochven, Jove and wormhole space are excluded).');
    if (origin !== destination && systemBlocked(lookup.get(destination), prefs)) return invalid('The destination is excluded by your route preferences.');
    const candidates = [...lookup.values()].filter(s => jumpDestination(s) && !systemBlocked(s, prefs));
    // A range-sized 3-D spatial grid reduces neighbor work without discarding the Y axis.
    const cells = new Map(), position = s => [s.x, s.y, s.z].map(v => Math.floor(Number(v) / LY_METRES / range));
    for (const system of candidates) {
        const key = position(system).join(':');
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(system);
    }
    const route = search(origin, destination, id => {
        const source = lookup.get(id), center = position(source), out = [];
        for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
            const near = cells.get([center[0] + x, center[1] + y, center[2] + z].join(':')) || [];
            for (const target of near) {
                if (idOf(target) === id) continue;
                const distance = distanceLy(source, target);
                if (distance > range) continue;
                const edge = { id: `jump:${id}:${idOf(target)}`, kind: 'jump', from_system_id: id, to_system_id: idOf(target), distance_ly: distance };
                out.push({ ...edge, cost: edgeCost(target, edge, prefs) });
            }
        }
        return out;
    });
    const warnings = ['Physical range plan only: each destination needs a suitable cyno. Fuel, fatigue, cyno jammers, ship eligibility, docking and live access are not verified.', 'Route preferences and recorded activity do not guarantee safe travel.'];
    const summary = { rangeLy: range, directDistanceLy: distanceLy(lookup.get(origin), lookup.get(destination)), warnings, excluded: [] };
    if (!route) return { ...summary, status: 'no_route', systemIds: [], edges: [], hops: 0, cost: null, totalDistanceLy: null, explanation: 'No chain of eligible cyno destinations is within the selected physical jump range.' };
    return { ...route, ...summary, totalDistanceLy: route.edges.reduce((sum, e) => sum + e.distance_ly, 0), explanation: `${prefs.mode === 'safer' ? 'Weighted' : 'Fewest-leg'} jump projection using full physical X, Y and Z coordinates.` };
}
