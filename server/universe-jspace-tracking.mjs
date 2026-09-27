const LOCATION_SCOPE = 'esi-location.read_location.v1';
const MAX_SAMPLE_AGE_MS = 30000;
const MAX_TRANSITION_MS = 90000;
const MAX_PILOTS = 100;
const iso = value => new Date(value).toISOString();

/** One subscriber dispatcher for the existing location stream; it never polls ESI. */
export function createJSpaceTracking(store, auth, options) {
    const { atlas, operations, addSystem, saveConnection, writeMap, recordPassage = () => false, onChange = () => {},
        hasScope = map => !!map.scope && Object.values(map.scope).some(values => Array.isArray(values) && values.length),
        scopeMatches = () => false, isActivePilot = () => true, getConnections = (_owner, map) => map.connections,
        copyConnection = (owner, map, edge) => saveConnection(owner, map, { from_system_id: edge.from_system_id, to_system_id: edge.to_system_id,
            kind: 'wormhole', expires_at: edge.expires_at, observed_at: edge.observed_at, life_status: 'stable', mass: 'stable', max_ship_size: 'large',
            confirmed: false, accessible: false, reverse_accessible: false, notes: '' }) } = options;
    const now = options.now || Date.now;
    const byId = atlas.bySystemId || new Map(atlas.systems.map(row => [row.system_id, row]));
    const gates = new Set(atlas.gates.flatMap(row => [`${row.from_system_id}:${row.to_system_id}`, `${row.to_system_id}:${row.from_system_id}`]));
    const getMap = store.db.prepare("SELECT body FROM universe_records WHERE character_id=? AND kind='jspace_map' AND id=?");
    const getMaps = store.db.prepare("SELECT character_id,body FROM universe_records WHERE kind='jspace_map'");
    const podLoss = store.db.prepare("SELECT 1 FROM combat_records WHERE character_id=? AND result='loss' AND at>=? AND json_extract(body,'$.victim.ship_type_id') IN (670,33328) LIMIT 1");
    const subscriptions = new Map(), memberships = new Map(), lastSamples = new Map(), scopedMaps = new Map(), sourceMaps = new Map();
    let indexed = false;
    const keyFor = (owner, id) => `${owner}:${id}`;
    const character = id => auth.characters().find(row => row.id === id);
    function connected(value) {
        const id = Number(value);
        if (!Number.isSafeInteger(id) || id <= 0 || !character(id)) throw new Error('Choose a connected pilot.');
        return id;
    }
    function forgetMap(owner, id) {
        const key = keyFor(owner, id);
        for (const pilot of memberships.get(key) || []) {
            subscriptions.get(pilot)?.delete(key);
            if (!subscriptions.get(pilot)?.size) subscriptions.delete(pilot);
        }
        memberships.delete(key);
        scopedMaps.delete(key);
        if (sourceMaps.get(owner)?.id === id) sourceMaps.delete(owner);
    }
    function syncMap(owner, map) {
        forgetMap(owner, map.id);
        const key = keyFor(owner, map.id), pilots = new Set();
        for (const row of map.pilots || []) {
            if (!row.tracking || !Number.isSafeInteger(row.character_id)) continue;
            if (!subscriptions.has(row.character_id)) subscriptions.set(row.character_id, new Map());
            subscriptions.get(row.character_id).set(key, { owner, id: map.id, source: map.kind === 'tracking_source' });
            pilots.add(row.character_id);
        }
        memberships.set(key, pilots);
        if (map.kind === 'tracking_source') sourceMaps.set(owner, { owner, id: map.id });
        else if (hasScope(map)) scopedMaps.set(key, { owner, id: map.id });
    }
    function ensureIndex() {
        if (indexed) return;
        indexed = true;
        for (const row of getMaps.all()) syncMap(row.character_id, JSON.parse(row.body));
    }
    function allowed(id, source) {
        const pilot = character(id);
        if (!pilot || pilot.needsReauth || !store.get('module:universe', true)) return false;
        const cfg = operations.config?.(id);
        if (cfg?.enabled === false) return false;
        if (source === 'esi') return cfg?.location_source !== 'logs' && store.get('module:pilot', true) && (pilot.scopes || []).includes(LOCATION_SCOPE);
        return source === 'chat_log' && cfg?.logs_enabled === true && cfg?.location_source !== 'esi';
    }
    function sample(id, input) {
        const source = input?.source || 'esi', system_id = Number(input?.system_id ?? input?.data?.solar_system_id);
        const updated = Date.parse(input?.updated_at ?? input?.updatedAt), expires = Date.parse(input?.expires_at ?? input?.expiresAt);
        if (!allowed(id, source) || input?.status !== 'ready' || input.stale === true || !byId.has(system_id) ||
            !Number.isFinite(updated) || updated > now() + 1000 || now() - updated > MAX_SAMPLE_AGE_MS ||
            !Number.isFinite(expires) || expires <= now()) return null;
        // Selected chat-log positions are authorised by operations; arbitrary supplied logs are not.
        if (source === 'chat_log') {
            const current = operations.location(id);
            if (current?.status !== 'ready' || current.source !== source || current.system_id !== system_id || Date.parse(current.updated_at) !== updated) return null;
        }
        const snapshot = source === 'esi' ? store.snapshot(id, 'location') : null;
        const data = Date.parse(snapshot?.updatedAt) === updated ? snapshot.data : input?.data;
        return { system_id, source, updated_at: iso(updated), expires_at: iso(expires),
            docked: !!(input?.docked || data?.station_id || data?.structure_id) };
    }
    function baseline(id, map, row) {
        delete row.last_location;
        const current = sample(id, operations.location(id));
        if (!current) return;
        row.last_location = current;
        if (!hasScope(map) && byId.get(current.system_id)?.space === 'wormhole' && map.nodes.length < 600) addSystem(map, current.system_id, null);
    }
    function rosterCommand(owner, map, op, input) {
        const id = Number(input.character_id), roster = map.pilots || (map.pilots = []);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Choose a connected pilot.');
        let row = roster.find(pilot => pilot.character_id === id);
        if (op === 'pilot.add') {
            connected(id);
            if (row) throw new Error('This pilot is already on this map.');
            if (roster.length >= MAX_PILOTS) throw new Error('Use at most 100 pilots on a map.');
            row = { character_id: id, tracking: true };
            baseline(id, map, row); roster.push(row);
        } else {
            if (!row) throw new Error('This pilot is not on this map.');
            if (op === 'pilot.remove') map.pilots = roster.filter(pilot => pilot !== row);
            else if (op === 'pilot.tracking') {
                if (typeof input.tracking !== 'boolean') throw new Error('Use true or false for pilot tracking.');
                if (input.tracking) connected(id);
                if (row.tracking !== input.tracking) {
                    row.tracking = input.tracking;
                    if (row.tracking) baseline(id, map, row); else delete row.last_location;
                }
            } else throw new Error('Choose a supported pilot action.');
        }
        // The caller synchronises subscriptions only after its enclosing transaction succeeds.
        return row;
    }
    function projectPilots(map) {
        return (map.pilots || []).map(row => {
            const pilot = character(row.character_id), last = row.last_location;
            const visible = row.tracking && last && allowed(row.character_id, last.source) && Date.parse(last.expires_at) > now();
            return { character_id: row.character_id, name: pilot?.name || String(row.character_id), tracking: row.tracking !== false,
                status: !row.tracking ? 'paused' : !pilot ? 'disconnected' : pilot.needsReauth ? 'reauth_required' : visible ? 'ready' : 'waiting',
                system_id: visible ? last.system_id : null, system_name: visible ? byId.get(last.system_id)?.name || null : null,
                source: visible ? last.source : null, updated_at: visible ? last.updated_at : null, expires_at: visible ? last.expires_at : null };
        });
    }
    function resetSourceBaseline(owner) {
        ensureIndex();
        lastSamples.delete(owner);
        const source = sourceMaps.get(owner), saved = source && getMap.get(owner, source.id);
        if (!saved) return;
        const map = JSON.parse(saved.body);
        for (const pilot of map.pilots || []) delete pilot.last_location;
        writeMap(owner, map);
    }
    function sourceComponents(owner, map) {
        const canonical = new Map(getConnections(owner, map).filter(edge => edge.kind === 'wormhole' && edge.life_status !== 'collapsed' &&
            Number.isFinite(Date.parse(edge.expires_at)) && Date.parse(edge.expires_at) > now()).map(edge => [edge.id, edge]));
        const edges = map.connections.map(edge => ({ ...edge, ...(canonical.get(edge.link_id || edge.id) || {}) }))
            .filter(edge => canonical.has(edge.link_id || edge.id) && byId.has(edge.from_system_id) && byId.has(edge.to_system_id));
        const neighbors = new Map(map.nodes.filter(node => byId.has(node.system_id)).map(node => [node.system_id, []]));
        for (const edge of edges) {
            if (!neighbors.has(edge.from_system_id) || !neighbors.has(edge.to_system_id)) continue;
            neighbors.get(edge.from_system_id).push(edge.to_system_id); neighbors.get(edge.to_system_id).push(edge.from_system_id);
        }
        const generationOf = row => Number(row.source_generation) || Date.parse(row.observed_at || row.discovered_at || row.prune_grace_at) || 0;
        const generation = Math.max(Number(map.source_generation) || 0, ...edges.map(generationOf), ...map.nodes.map(generationOf));
        const sourceNodes = new Map(map.nodes.map(node => [node.system_id, node]));
        const seen = new Set(), components = [], componentBySystem = new Map();
        for (const seed of neighbors.keys()) {
            if (seen.has(seed)) continue;
            const component = { ids: new Set(), edges: [], anchors: new Map(), nodeGenerations: new Map(), pilot: owner, generation }, queue = [seed]; seen.add(seed);
            for (let index = 0; index < queue.length; index++) {
                const systemId = queue[index]; component.ids.add(systemId); componentBySystem.set(systemId, component);
                component.anchors.set(systemId, neighbors.get(systemId)[0] ?? null);
                component.nodeGenerations.set(systemId, generationOf(sourceNodes.get(systemId)));
                for (const neighbor of neighbors.get(systemId)) if (!seen.has(neighbor)) { seen.add(neighbor); queue.push(neighbor); }
            }
            components.push(component);
        }
        for (const edge of edges) {
            const component = componentBySystem.get(edge.from_system_id);
            if (component && component === componentBySystem.get(edge.to_system_id)) component.edges.push({ ...edge, source_generation: generationOf(edge) });
        }
        return components;
    }
    /** Backfill live topology from eligible pilots, never their system annotations or dead links. */
    function populateScopes(owner = null, mapId = null, { includeGlobal = false, notify = true, eventPilot = null } = {}) {
        ensureIndex();
        const candidates = eventPilot == null ? scopedMaps.values() : [...(subscriptions.get(eventPilot)?.values() || [])].filter(row => scopedMaps.has(keyFor(row.owner, row.id)));
        const targets = mapId != null ? [{ owner, id: mapId }] : [...candidates].filter(row => owner == null || row.owner === owner);
        const componentCache = new Map(), changedOwners = new Set(), result = { maps: 0, connections: 0 };
        for (const target of targets) {
            const saved = getMap.get(target.owner, target.id);
            if (!saved || !character(target.owner)) continue;
            const map = JSON.parse(saved.body);
            if (map.kind === 'tracking_source' || !hasScope(map) && !includeGlobal) continue;
            const selected = [];
            for (const pilot of map.pilots || []) {
                if (!pilot.tracking || eventPilot != null && pilot.character_id !== eventPilot || !character(pilot.character_id)) continue;
                const source = sourceMaps.get(pilot.character_id);
                if (!source) continue;
                if (!componentCache.has(pilot.character_id)) {
                    const body = getMap.get(source.owner, source.id);
                    componentCache.set(pilot.character_id, body ? sourceComponents(source.owner, JSON.parse(body.body)) : []);
                }
                for (const component of componentCache.get(pilot.character_id)) {
                    if (!hasScope(map) || [...component.ids].some(id => scopeMatches(target.owner, map, id))) selected.push(component);
                }
            }
            let changed = false, coverageChanged = false;
            const nodeIds = new Set(map.nodes.map(node => node.system_id));
            const nodeRecords = new Map([...(map.archived_nodes || []), ...map.nodes].map(node => [node.system_id, node]));
            const pairKey = edge => [edge.from_system_id, edge.to_system_id].sort((a, b) => a - b).join(':');
            const edgePairs = new Set(map.connections.filter(edge => edge.kind === 'wormhole').map(pairKey));
            store.db.exec('SAVEPOINT jspace_scope_population');
            try {
                for (const component of selected) {
                    const coverage = systemId => Number(nodeRecords.get(systemId)?.source_coverage?.[component.pilot]) || 0;
                    const eligibleEdges = component.edges.filter(edge => !edgePairs.has(pairKey(edge)) && edge.source_generation > Math.min(coverage(edge.from_system_id), coverage(edge.to_system_id)));
                    const eligibleNodes = new Set(eligibleEdges.flatMap(edge => [edge.from_system_id, edge.to_system_id]));
                    if (!component.edges.length) for (const systemId of component.ids) {
                        if (component.nodeGenerations.get(systemId) > coverage(systemId)) eligibleNodes.add(systemId);
                    }
                    const missingNodes = [...eligibleNodes].filter(id => !nodeIds.has(id));
                    // Do not consume a component's watermark when the map cannot fit its delivery.
                    if (map.nodes.length + missingNodes.length > 600 || map.connections.length + eligibleEdges.length > 1000) continue;
                    const restoredFrom = new Map();
                    for (const systemId of eligibleNodes) {
                        if (nodeIds.has(systemId) || map.nodes.length >= 600) continue;
                        restoredFrom.set(systemId, nodeRecords.get(systemId) || null);
                        addSystem(map, systemId, component.anchors.get(systemId)); nodeIds.add(systemId);
                        nodeRecords.set(systemId, map.nodes.find(node => node.system_id === systemId));
                    }
                    for (const edge of eligibleEdges) {
                        const pair = pairKey(edge);
                        if (map.connections.length >= 1000 || !nodeIds.has(edge.from_system_id) || !nodeIds.has(edge.to_system_id) || edgePairs.has(pair)) continue;
                        if (!copyConnection(target.owner, map, edge)) continue;
                        edgePairs.add(pair); changed = true; result.connections++;
                    }
                    if (component.edges.length && restoredFrom.size) {
                        const connectedIds = new Set(map.connections.flatMap(edge => [edge.from_system_id, edge.to_system_id]));
                        for (const [systemId, previous] of restoredFrom) {
                            if (connectedIds.has(systemId)) continue;
                            // A source edge can expire between selection and copying. Do not leave new orphan cards behind.
                            map.nodes = map.nodes.filter(node => node.system_id !== systemId); nodeIds.delete(systemId);
                            if (previous) { (map.archived_nodes ||= []).push(previous); nodeRecords.set(systemId, previous); }
                            else nodeRecords.delete(systemId);
                        }
                    }
                    if ([...restoredFrom.keys()].some(id => nodeIds.has(id))) changed = true;
                    // This is system-level source coverage, never a ledger of old connection identities.
                    for (const systemId of component.ids) {
                        const node = nodeRecords.get(systemId);
                        if (!node || coverage(systemId) >= component.generation) continue;
                        node.source_coverage = { ...node.source_coverage, [component.pilot]: component.generation }; coverageChanged = true;
                    }
                }
                if (changed) { map.revision++; map.updated_at = iso(now()); }
                if (changed || coverageChanged) writeMap(target.owner, map);
                store.db.exec('RELEASE jspace_scope_population');
            } catch (error) { store.db.exec('ROLLBACK TO jspace_scope_population'); store.db.exec('RELEASE jspace_scope_population'); throw error; }
            if (changed) { syncMap(target.owner, map); result.maps++; changedOwners.add(target.owner); }
        }
        if (notify) for (const id of changedOwners) onChange(id);
        return { ...result, changedOwners };
    }
    function scopeAcceptsTransition(owner, map, from, to) {
        if (!hasScope(map) || scopeMatches(owner, map, from) || scopeMatches(owner, map, to)) return true;
        const neighbors = new Map(map.nodes.map(node => [node.system_id, []]));
        for (const edge of map.connections) {
            if (!neighbors.has(edge.from_system_id) || !neighbors.has(edge.to_system_id)) continue;
            neighbors.get(edge.from_system_id).push(edge.to_system_id); neighbors.get(edge.to_system_id).push(edge.from_system_id);
        }
        const seen = new Set(), queue = [from, to].filter(id => neighbors.has(id));
        for (let index = 0; index < queue.length; index++) {
            const systemId = queue[index];
            if (seen.has(systemId)) continue;
            seen.add(systemId);
            if (scopeMatches(owner, map, systemId)) return true;
            for (const neighbor of neighbors.get(systemId)) if (!seen.has(neighbor)) queue.push(neighbor);
        }
        return false;
    }
    function observeLocation(travelPilot, input) {
        const id = Number(travelPilot), current = sample(id, input);
        if (!current) return { maps: 0, connections: 0, passages: 0 };
        ensureIndex();
        const signature = `${current.source}:${current.updated_at}:${current.system_id}:${current.docked}:${current.expires_at}`;
        if (lastSamples.get(id) === signature) return { maps: 0, connections: 0, passages: 0 };
        lastSamples.set(id, signature);
        const result = { maps: 0, connections: 0, passages: 0 }, changedOwners = new Set();
        let sourceChanged = false, populated = false, eventGeneration = Date.parse(current.updated_at);
        const backfill = () => {
            if (!sourceChanged || populated) return;
            const filled = populateScopes(null, null, { notify: false, eventPilot: id });
            result.connections += filled.connections;
            for (const owner of filled.changedOwners) changedOwners.add(owner);
            populated = true;
        };
        for (const subscription of [...(subscriptions.get(id)?.values() || [])].sort((a, b) => Number(b.source) - Number(a.source))) {
            if (!subscription.source) backfill();
            const { owner, id: mapId } = subscription, saved = getMap.get(owner, mapId);
            if (!saved || !character(owner)) { forgetMap(owner, mapId); continue; }
            const map = JSON.parse(saved.body), row = map.pilots?.find(pilot => pilot.character_id === id && pilot.tracking);
            if (!row) { syncMap(owner, map); continue; }
            if (map.kind === 'tracking_source') eventGeneration = Math.max(eventGeneration, Number(map.source_generation) || 0);
            if (map.kind === 'tracking_source' && (id !== owner || !isActivePilot(id))) continue;
            const previous = row.last_location, beforeTime = Date.parse(previous?.updated_at), at = Date.parse(current.updated_at);
            if (Number.isFinite(beforeTime) && at <= beforeTime) continue;
            const from = byId.get(previous?.system_id), to = byId.get(current.system_id);
            const moved = !!from && from.system_id !== to.system_id;
            const reliable = moved && previous.source === current.source && at - beforeTime <= MAX_TRANSITION_MS &&
                Date.parse(previous.expires_at) >= at && !previous.docked && !current.docked &&
                !podLoss.get(id, iso(beforeTime - 60000));
            const boundary = reliable && (from.space === 'wormhole' || to.space === 'wormhole');
            const acceptsTransition = boundary && scopeAcceptsTransition(owner, map, from.system_id, to.system_id);
            let topologyChanged = false, passageChanged = false;
            store.db.exec('SAVEPOINT jspace_tracking');
            try {
                const add = (systemId, anchor) => {
                    if (map.nodes.some(node => node.system_id === systemId) || map.nodes.length >= 600) return;
                    addSystem(map, systemId, anchor); topologyChanged = true;
                    if (map.kind === 'tracking_source') {
                        map.source_generation = Math.max((Number(map.source_generation) || 0) + 1, Date.parse(current.updated_at));
                        map.nodes.find(node => node.system_id === systemId).source_generation = map.source_generation;
                    }
                };
                if (!hasScope(map) && to.space === 'wormhole' && (map.kind !== 'tracking_source' || moved || !previous)) add(to.system_id, boundary ? from.system_id : null);
                if (boundary && !gates.has(`${from.system_id}:${to.system_id}`)) {
                    if (acceptsTransition) { add(from.system_id, to.system_id); add(to.system_id, from.system_id); }
                    const existing = map.connections.filter(edge => edge.kind === 'wormhole' &&
                        (edge.from_system_id === from.system_id && edge.to_system_id === to.system_id || edge.from_system_id === to.system_id && edge.to_system_id === from.system_id));
                    if (acceptsTransition && !existing.length && map.connections.length < 1000 && [from.system_id, to.system_id].every(systemId => map.nodes.some(node => node.system_id === systemId))) {
                        const saved = saveConnection(owner, map, { from_system_id: from.system_id, to_system_id: to.system_id, kind: 'wormhole', duration_hours: 16,
                            life_status: 'stable', mass: 'stable', max_ship_size: 'large', confirmed: false, accessible: false, reverse_accessible: false,
                            observed_at: current.updated_at,
                            notes: map.kind === 'tracking_source' ? '' : 'Observed pilot movement. Connection requires confirmation; location samples can miss travel.' });
                        if (map.kind === 'tracking_source') {
                            map.source_generation = Math.max((Number(map.source_generation) || 0) + 1, Date.parse(current.updated_at));
                            (saved || map.connections.at(-1)).source_generation = map.source_generation;
                        } else for (const systemId of [from.system_id, to.system_id]) {
                            const node = map.nodes.find(node => node.system_id === systemId);
                            node.source_coverage = { ...node.source_coverage, [id]: Math.max(Number(node.source_coverage?.[id]) || 0, eventGeneration) };
                        }
                        topologyChanged = true; result.connections++;
                    } else if (existing.length === 1 && map.kind !== 'tracking_source' && map.track_passages) {
                        passageChanged = recordPassage(owner, map, existing[0], { character_id: id, from_system_id: from.system_id, to_system_id: to.system_id,
                            at: current.updated_at, previous_at: previous.updated_at, sample_key: `${id}:${current.updated_at}:${from.system_id}:${to.system_id}` }) === true;
                        if (passageChanged) result.passages++;
                    }
                }
                row.last_location = current;
                if (topologyChanged || passageChanged) { map.revision++; map.updated_at = iso(now()); }
                writeMap(owner, map);
                store.db.exec('RELEASE jspace_tracking');
            } catch (error) { store.db.exec('ROLLBACK TO jspace_tracking'); store.db.exec('RELEASE jspace_tracking'); lastSamples.delete(id); throw error; }
            syncMap(owner, map); result.maps++;
            if (map.kind === 'tracking_source') eventGeneration = Math.max(eventGeneration, Number(map.source_generation) || 0);
            if (map.kind === 'tracking_source' && (moved || topologyChanged)) sourceChanged = true;
            if (moved || topologyChanged || passageChanged || !previous) changedOwners.add(owner);
        }
        backfill();
        for (const owner of changedOwners) onChange(owner);
        return result;
    }
    return { rosterCommand, observeLocation, projectPilots, syncMap, forgetMap, populateScopes, resetSourceBaseline };
}
