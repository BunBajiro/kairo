// Routing deliberately consumes physical coordinates and explicit travel settings.
// Map projection, visible layers and journey trails are never graph inputs.
// EVE's exact light-year differs from the scientific unit. Using the latter
// permits impossible near-boundary jumps: https://developers.eveonline.com/docs/guides/map-data/
export const LY_METRES = 9_460_000_000_000_000;
// Canonical Kairo SDE entry: Zarzakh, Yasna Zakh (four stargates, no jump-drive arrival).
export const ZARZAKH_SYSTEM_ID = 30100000;
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
export const LIVE_ANSIBLEX_RULES = Object.freeze({status:'current',effectiveDate:'2026-09-22',verifiedAt:'2026-09-25',
    source:'https://www.eveonline.com/news/view/patch-notes-version-24-01',capacityTJ:1250,
    note:'September 2026 rules: starting-system sovereignty alliance and internal ACL access are required. Capacitor availability is not reported.',
    zones:ANSIBLEX_RULES.zones});
// Range presets are unmodified hull attributes; JDC adds 20% per level.
// Sources: CCP Ascension jump-range announcement and Phoebe travel update.
export const JUMP_SHIP_PRESETS = Object.freeze([
    {id:'carrier',label:'Carrier / force auxiliary / dreadnought',baseRangeLy:3.5,source:'https://forums-archive.eveonline.com/message/6667765'},
    {id:'supercapital',label:'Supercarrier / titan',baseRangeLy:3,source:'https://forums-archive.eveonline.com/message/6667765'},
    {id:'black_ops',label:'Black Ops',baseRangeLy:4,source:'https://www.eveonline.com/news/view/phoebe-travel-change-update'},
    {id:'jump_freighter',label:'Jump freighter',baseRangeLy:5,source:'https://www.eveonline.com/news/view/phoebe-travel-change-update'},
    {id:'command_carrier',label:'Command carrier',baseRangeLy:3.75,source:'https://esi.evetech.net/universe/types/92823',verifiedAt:'2026-09-25'},
    {id:'rorqual',label:'Rorqual',baseRangeLy:5,source:'https://esi.evetech.net/universe/types/28352',verifiedAt:'2026-09-25'},
    {id:'lancer',label:'Lancer dreadnought',baseRangeLy:4,source:'https://esi.evetech.net/universe/types/77283',verifiedAt:'2026-09-25'},
    {id:'custom',label:'Other hull / in-game range',baseRangeLy:null,source:null},
].map(Object.freeze));
export function jumpRangeForShip({shipClass='custom',jumpDriveCalibration=5,rangeLy}={}) {
    const skill=Number(jumpDriveCalibration),preset=JUMP_SHIP_PRESETS.find(p=>p.id===shipClass);
    if(!Number.isInteger(skill)||skill<0||skill>5)throw new Error('Jump Drive Calibration must be between 0 and 5.');
    if(!preset)throw new Error('Unknown jump range preset.');
    const range=preset.baseRangeLy==null?Number(rangeLy):preset.baseRangeLy*(1+.2*skill);
    if(!Number.isFinite(range)||range<=0||range>20)throw new Error('Enter an effective jump range above 0 and no greater than 20 LY.');
    return {shipClass,baseRangeLy:preset.baseRangeLy,jumpDriveCalibration:skill,rangeLy:range,source:preset.source,assumption:'Unmodified hull and Jump Drive Calibration only; override with in-game effective range for special hulls or bonuses.'};
}
export function estimateJumpFuel(edges, {isotopeUnitsPerLy,consumptionMultiplier=1,reservePercent=0,unitVolumeM3,unitPriceISK,isotope='Isotopes'}={}) {
    const rate=Number(isotopeUnitsPerLy),multiplier=Number(consumptionMultiplier),reserve=Number(reservePercent);
    if(!Number.isFinite(rate)||rate<=0||rate>1e9||!Number.isFinite(multiplier)||multiplier<=0||multiplier>10||!Number.isFinite(reserve)||reserve<0||reserve>100)throw new Error('Enter a positive isotope rate/multiplier and a reserve from 0 to 100%.');
    const jumps=edges.filter(e=>e.kind==='jump');
    if(jumps.some(e=>!Number.isFinite(e.distance_ly)||e.distance_ly<0))throw new Error('Fuel estimates require physical jump distances.');
    const legs=jumps.map(e=>({from_system_id:e.from_system_id,to_system_id:e.to_system_id,distanceLy:e.distance_ly,units:Math.ceil(e.distance_ly*rate*multiplier)}));
    const units=legs.reduce((n,e)=>n+e.units,0),withReserve=Math.ceil(units*(1+reserve/100));
    const optional=value=>value!=null&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
    const volume=optional(unitVolumeM3),price=optional(unitPriceISK);
    return {isotope:String(isotope).slice(0,80),isotopeUnitsPerLy:rate,consumptionMultiplier:multiplier,reservePercent:reserve,legs,units,withReserve,
        volumeM3:volume===null?null:withReserve*volume,costISK:price===null?null:withReserve*price,
        assumptions:['User-supplied isotope rate and effective skill/hull multiplier.','Rounded up per physical jump. Does not include cyno fuel, bridging/conduit passengers or fatigue.']};
}
const ANSIBLEX_BASE_TJ=Object.freeze({capsule:1,shuttle:1,hauler:1,freighter:1,jump_freighter:1,rorqual:19,frigate:4,destroyer:6,cruiser:10,battlecruiser:14.5,battleship:16.5,black_ops:18,marauder:19,subcapital:null});

/** Nominal transit limits only. No source reports a dependable remaining mass budget. */
export function wormholeShipRestriction(connection,preferences={}, {requireKnownLimit=false}={}) {
    const source=connection.source||connection.reported_source;
    // CCP: https://www.eveonline.com/news/view/thera-and-the-shattered-wormholes
    // Thera excludes capitals with a freighter exception; mass alone cannot establish eligibility.
    const freighter=['freighter','jump_freighter'].includes(preferences.shipClass),capital=['capital','carrier','force_auxiliary','dreadnought','lancer','command_carrier','supercarrier','titan','supercapital','rorqual'].includes(preferences.shipClass);
    if((source==='thera'||connection.reported_source==='thera')&&(capital||!freighter&&['capital','supercapital'].includes(preferences.shipSize)))return 'Thera excludes capital ships; freighters require the explicit freighter hull setting';
    const rank={small:1,medium:2,large:3,capital:4,supercapital:5},limit=rank[connection.max_ship_size],ship=rank[preferences.shipSize];
    const mass=Number(preferences.shipMassKg),capacity=Number(connection.max_jump_mass_kg);
    const comparable=Number.isFinite(mass)&&mass>0&&Number.isFinite(capacity)&&capacity>0&&connection.type_status==='ready';
    if(comparable&&mass>capacity)return 'Ship mass exceeds the reported nominal single-transit limit';
    if(limit&&ship&&ship>limit)return 'Select a ship size within the recorded wormhole limit';
    if(comparable)return null;
    if(limit)return ship?null:'Select a ship size or provide mass within a fresh nominal wormhole limit';
    if((requireKnownLimit||connection.max_ship_size&&connection.max_ship_size!=='unknown')&&!preferences.allowUnknownWormholeSize)return connection.max_ship_size==='xlarge'?'XL wormhole routing requires actual ship mass and a fresh nominal transit limit':'Wormhole ship limit is unknown or unsupported';
    return null;
}

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
        ...preferences, mode: ['safer','prefer_low'].includes(preferences.mode) ? preferences.mode : 'shortest',
        useAnsiblex: preferences.useAnsiblex === true, useWormholes: preferences.useWormholes === true,
        useZarzakh: preferences.useZarzakh === true,
        maxAnsiblexZone: Math.max(1, Math.min(5, number(preferences.maxAnsiblexZone) ?? 5)),
        ansiblexZones: new Set(zones), avoidSystemIds: new Set((preferences.avoidSystemIds || []).map(Number)),
        ansiblexRules: ['announced','live'].includes(preferences.ansiblexRules) ? preferences.ansiblexRules : 'current',
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
    const baseSecurityPenalty=prefs.mode==='prefer_low'?(security===null?8:security>=.45?10:security>0?0:6):(security===null?8:security>=.45?0:security>0?6:10);
    const securityPenalty = baseSecurityPenalty * (standing !== null && standing > 0 ? 0.25 : 1);
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
        if (!prefs.useZarzakh && (edge.from_system_id===ZARZAKH_SYSTEM_ID||edge.to_system_id===ZARZAKH_SYSTEM_ID)) return exclude(edge, 'Zarzakh routing is off');
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
        const publicReport = kind === 'wormhole' && connection.reported === true && connection.route_eligible === true && ['thera','turnur'].includes(connection.source);
        const preference = kind === 'ansiblex' ? 'useAnsiblex' : publicReport ? connection.source === 'thera' ? 'useThera' : 'useTurnur' : 'useWormholes';
        if (prefs[preference] !== true) { exclude(base, `${kind === 'ansiblex' ? 'Ansiblex' : publicReport ? connection.source === 'thera' ? 'Thera' : 'Turnur' : 'Wormhole'} routing is off`); continue; }
        if (connection.enabled !== true) { exclude(base, 'Connection is disabled'); continue; }
        const expiresAt = connection.expires_at ?? connection.expiresAt;
        if (kind === 'wormhole' && (!Number.isFinite(clock) || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= clock)) {
            exclude(base, 'Wormhole is expired or has no valid expiry'); continue;
        }
        if (kind === 'wormhole') {const restriction=wormholeShipRestriction(connection,prefs);if(restriction){exclude(base,restriction);continue;}}
        for (const reverse of connection.directional === true ? [false] : [false, true]) {
            const edge = { ...base, from_system_id: reverse ? to : from, to_system_id: reverse ? from : to,
                structure_id: reverse ? connection.reverse_structure_id ?? null : connection.structure_id ?? null,
                reverse_structure_id: reverse ? connection.structure_id ?? null : connection.reverse_structure_id ?? null };
            const accessible = publicReport || (reverse ? connection.reverse_accessible ?? connection.accessible : connection.accessible);
            if (accessible !== true) { exclude(edge, 'Access has not been confirmed'); continue; }
            if(publicReport)warnings.add('Public wormhole reports are unverified by your pilot; scan and check ship size, mass and lifetime before travelling.');
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
                if (prefs.ansiblexRules === 'live') {
                    const sovereign=Number(lookup.get(edge.from_system_id)?.sovereignty_alliance_id);
                    if(!sovereign||!Number(prefs.pilotAllianceId)||sovereign!==Number(prefs.pilotAllianceId)){exclude(edge,'Current rules require membership of the starting system’s sovereign alliance');continue;}
                    if(owner&&owner!==sovereign){exclude(edge,'Recorded bridge owner differs from current starting-system sovereignty');continue;}
                    if(!Object.prototype.hasOwnProperty.call(ANSIBLEX_BASE_TJ,prefs.shipClass||'subcapital')){exclude(edge,'Selected ship class cannot use Ansiblex under current rules');continue;}
                }
                const capitalDistance = distanceLy(lookup.get(capital), lookup.get(edge.to_system_id));
                const zone = ansiblexZone(capitalDistance);
                edge.owner_alliance_id = owner || null;
                edge.capital_system_id = capital || null;
                edge.capital_distance_ly = capitalDistance;
                edge.zone = zone;
                edge.zone_model = 'announced-2026-09-22';
                if(prefs.ansiblexRules==='live') {
                    edge.zone_model='current-2026-09-22';const baseCost=ANSIBLEX_BASE_TJ[prefs.shipClass||'subcapital'];
                    edge.capacitor_cost_tj=zone===null||baseCost==null?null:baseCost*ANSIBLEX_RULES.zones.find(z=>z.zone===zone).multiplier;
                }
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

function routeThroughGraph(graph, {originId, destinationId} = {}) {
    const origin = Number(originId), destination = Number(destinationId);
    if (!graph.bySystemId.has(origin) || !graph.bySystemId.has(destination)) return invalid('Select two systems from the universe catalogue.');
    if (systemBlocked(graph.bySystemId.get(destination), graph.preferences) && origin !== destination) return invalid('The destination is excluded by your route preferences.');
    const route = search(origin, destination, id => graph.adjacency.get(id) || []);
    const warnings = [...graph.warnings, 'Route preferences and recorded activity do not guarantee safe travel.'];
    if (graph.preferences.useAnsiblex) {
        warnings.push('Ansiblex access and online state are user-confirmed; fuel or capacitor availability is not verified.');
        warnings.push(graph.preferences.ansiblexRules==='live'?LIVE_ANSIBLEX_RULES.note:ANSIBLEX_RULES.note);
    }
    if (graph.preferences.useWormholes) warnings.push('Known wormholes can collapse before their recorded expiry; mass limits and current mass are not verified.');
    const explanation = graph.preferences.mode === 'prefer_low' ? 'Weighted route prefers low-security systems, with additional costs for standings and recorded destruction.' : graph.preferences.mode === 'safer'
        ? 'Weighted route prefers higher security and friendly standings, with extra costs for recorded hostility and ship or pod destruction. Missing standings receive a small uncertainty cost.'
        : 'Fewest travel legs through enabled connections after applying your route exclusions.';
    return route ? { ...route, explanation, warnings, excluded: graph.excluded } : {
        status: 'no_route', systemIds: [], edges: [], hops: 0, cost: null,
        explanation: 'No route connects these systems through the enabled, accessible connections and current exclusions.', warnings, excluded: graph.excluded,
    };
}

/** One request/itinerary owns the prepared graph; no state is reused across requests. */
export function createRoutePlanner(input = {}) {
    const graph = buildTravelGraph(input);
    return endpoints => routeThroughGraph(graph, endpoints);
}
export function planRoute(input = {}) { return createRoutePlanner(input)(input); }

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
export function createJumpPlanner({ systems = [], rangeLy, preferences = {} } = {}) {
    const lookup = byId(systems), range = number(rangeLy), prefs = settings(preferences), validRange = range !== null && range > 0 && range <= 20;
    const candidates = validRange ? [...lookup.values()].filter(s => jumpDestination(s) && !systemBlocked(s, prefs)) : [];
    // A range-sized 3-D spatial grid reduces neighbor work without discarding the Y axis.
    const cells = new Map(), position = s => [s.x, s.y, s.z].map(v => Math.floor(Number(v) / LY_METRES / range));
    for (const system of candidates) {
        const key = position(system).join(':');
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(system);
    }
    function forEachNearby(source, visit) {
        const center = position(source);
        for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
            const near = cells.get([center[0] + x, center[1] + y, center[2] + z].join(':')) || [];
            for (const target of near) {
                const distance = distanceLy(source, target);
                if (distance > range) continue;
                visit(target,distance);
            }
        }
    }
    function plan({originId,destinationId} = {}) {
        const origin=Number(originId),destination=Number(destinationId);
        if (!lookup.has(origin) || !lookup.has(destination)) return invalid('Select two systems from the universe catalogue.');
        if (!validRange) return invalid('Enter a physical jump range above 0 and no greater than 20 light-years.');
        if (!physicalSystem(lookup.get(origin))) return invalid('The origin is outside supported jump-drive space or has no physical coordinates.');
        if (origin !== destination && !jumpDestination(lookup.get(destination))) return invalid('The destination cannot be used as a standard cyno destination (highsec, Pochven, Jove and wormhole space are excluded).');
        if (origin !== destination && systemBlocked(lookup.get(destination), prefs)) return invalid('The destination is excluded by your route preferences.');
        const route = search(origin, destination, id => {
            const out=[];
            forEachNearby(lookup.get(id),(target,distance)=>{
                if(idOf(target)===id)return;
                const edge={id:`jump:${id}:${idOf(target)}`,kind:'jump',from_system_id:id,to_system_id:idOf(target),distance_ly:distance};
                out.push({...edge,cost:edgeCost(target,edge,prefs)});
            });
            return out;
        });
        const warnings = ['Physical range plan only: each destination needs a suitable cyno. Fuel, fatigue, cyno jammers, ship eligibility, docking and live access are not verified.', 'Route preferences and recorded activity do not guarantee safe travel.'];
        const summary = { rangeLy: range, directDistanceLy: distanceLy(lookup.get(origin), lookup.get(destination)), warnings, excluded: [] };
        if (!route) return { ...summary, status: 'no_route', systemIds: [], edges: [], hops: 0, cost: null, totalDistanceLy: null, explanation: 'No chain of eligible cyno destinations is within the selected physical jump range.' };
        return { ...route, ...summary, totalDistanceLy: route.edges.reduce((sum, e) => sum + e.distance_ly, 0), explanation: `${prefs.mode === 'safer' ? 'Weighted' : 'Fewest-leg'} jump projection using full physical X, Y and Z coordinates.` };
    }
    plan.alternateMidpoints=({originId,destinationId}={})=>{
        const origin=Number(originId),destination=Number(destinationId),a=lookup.get(origin),b=lookup.get(destination);
        if(!physicalSystem(a)||!jumpDestination(b)||!validRange)return [];
        const candidates=[];
        forEachNearby(a,(target,fromDistanceLy)=>{
            if(idOf(target)===origin||idOf(target)===destination)return;
            const toDistanceLy=distanceLy(target,b);if(toDistanceLy<=range)candidates.push({systemId:idOf(target),fromDistanceLy,toDistanceLy,totalDistanceLy:fromDistanceLy+toDistanceLy});
        });
        return candidates.sort((a,b)=>a.totalDistanceLy-b.totalDistanceLy||a.systemId-b.systemId);
    };
    return plan;
}
export function planJumpRoute(input = {}) { return createJumpPlanner(input)(input); }

/** Range colouring is based on full physical XYZ and the same eligibility as the jump planner. */
export function jumpReachability({systems=[],origins=[],preferences={}}={}) {
    const lookup=byId(systems),prefs=settings(preferences),limitations=['Physical range only; cyno, docking, fuel, fatigue and access are not verified.','Overlap means reachable from every selected origin at its stated effective range.'];
    if(!Array.isArray(origins)||!origins.length||origins.length>8)return {status:'invalid',origins:[],unionSystemIds:[],overlapSystemIds:[],limitations,explanation:'Choose between one and eight jump origins.'};
    const results=[],counts=new Map();
    for(const input of origins){
        const id=Number(input.systemId),source=lookup.get(id),range=Number(input.rangeLy);
        if(!physicalSystem(source)||!Number.isFinite(range)||range<=0||range>20)return {status:'invalid',origins:[],unionSystemIds:[],overlapSystemIds:[],limitations,explanation:'Each origin needs physical coordinates and an effective range from 0 to 20 LY.'};
        const candidates=[];
        for(const target of lookup.values()){
            if(idOf(target)===id||!jumpDestination(target)||systemBlocked(target,prefs))continue;
            const distance=distanceLy(source,target);if(distance<=range){candidates.push({systemId:idOf(target),distanceLy:distance});counts.set(idOf(target),(counts.get(idOf(target))||0)+1);}
        }
        candidates.sort((a,b)=>a.distanceLy-b.distanceLy||a.systemId-b.systemId);results.push({systemId:id,rangeLy:range,systems:candidates});
    }
    return {status:'ok',origins:results,unionSystemIds:[...counts.keys()].sort((a,b)=>a-b),overlapSystemIds:[...counts].filter(([,n])=>n===origins.length).map(([id])=>id).sort((a,b)=>a-b),limitations};
}
export function alternateJumpMidpoints(input={}) { return createJumpPlanner(input).alternateMidpoints(input); }
