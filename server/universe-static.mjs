import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

export const LIGHT_YEAR_METRES = 9460000000000000;
const TOPOLOGY_FILE = new URL('./data/universe.json.gz', import.meta.url);
const DATA_DIRECTORY = new URL('./data/', import.meta.url);
const DETAIL_CACHE_LIMIT = 48;
let topology;
let detailIndex;
const detailCache = new Map();
const lightCache = new Map();

function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const nested of Object.values(value)) freeze(nested);
        Object.freeze(value);
    }
    return value;
}

// Object.freeze(Map/Set) does not freeze their entries. These views expose the
// lookup/iteration contract without exposing mutators or the backing collection.
function readonlyMap(map) {
    return Object.freeze({
        get size() { return map.size; },
        get: key => map.get(key), has: key => map.has(key),
        keys: () => map.keys(), values: () => map.values(), entries: () => map.entries(),
        [Symbol.iterator]: () => map[Symbol.iterator](),
    });
}
function readonlySet(set) {
    return Object.freeze({
        get size() { return set.size; }, has: key => set.has(key),
        keys: () => set.keys(), values: () => set.values(), entries: () => set.entries(),
        [Symbol.iterator]: () => set[Symbol.iterator](),
    });
}

/** Load the bundled graph once. No ESI requests, network access or DB writes. */
export function getUniverseStatic() {
    if (topology) return topology;
    const data = JSON.parse(gunzipSync(readFileSync(TOPOLOGY_FILE), { maxOutputLength: 24 * 1024 * 1024 }));
    if (data.metadata?.schema !== 1 || !Array.isArray(data.systems) || !Array.isArray(data.gates)) {
        throw new Error('The bundled Universe data is invalid. Reinstall this Kairo release.');
    }
    const { detailsChunkBytes, detailsFiles, detailsBytes } = data.metadata;
    if (!Number.isSafeInteger(detailsChunkBytes) || detailsChunkBytes < 1024 * 1024 || detailsChunkBytes > 8 * 1024 * 1024 ||
        !Number.isSafeInteger(detailsBytes) || detailsBytes <= 0 || !Array.isArray(detailsFiles) ||
        detailsFiles.length !== Math.ceil(detailsBytes / detailsChunkBytes) || detailsFiles.some((part, index) =>
            part.name !== `universe-details-${String(index).padStart(3, '0')}.bin` ||
            part.bytes !== Math.min(detailsChunkBytes, detailsBytes - index * detailsChunkBytes))) {
        throw new Error('The bundled Universe detail manifest is invalid. Reinstall this Kairo release.');
    }
    const regions = new Map(data.regions.map(r => [r.region_id, freeze(r)]));
    const constellations = new Map(data.constellations.map(r => [r.constellation_id, freeze(r)]));
    const systems = data.systems.map(s => freeze({
        ...s, region_name: regions.get(s.region_id)?.name,
        constellation_name: constellations.get(s.constellation_id)?.name,
    }));
    const bySystemId = new Map(systems.map(s => [s.system_id, s]));
    const neighbors = new Map(systems.map(s => [s.system_id, new Set()]));
    for (const gate of data.gates) {
        const from = neighbors.get(gate.from_system_id), to = neighbors.get(gate.to_system_id);
        if (!from || !to || from === to) throw new Error('The bundled Universe gate graph is invalid.');
        from.add(gate.to_system_id);
        to.add(gate.from_system_id);
        freeze(gate);
    }
    detailIndex = data.detailIndex;
    topology = Object.freeze({
        metadata: freeze(data.metadata), systems: Object.freeze(systems),
        regions: Object.freeze([...regions.values()]), constellations: Object.freeze([...constellations.values()]),
        gates: Object.freeze(data.gates), bySystemId: readonlyMap(bySystemId),
        neighbors: readonlyMap(new Map([...neighbors].map(([id, adjacent]) => [id, readonlySet(adjacent)]))),
    });
    return topology;
}

/** Read only one system's celestial record; keep at most 48 detailed systems. */
export function getUniverseSystem(id, { celestials = true } = {}) {
    const systemId = Number(id);
    const graph = getUniverseStatic();
    const system = graph.bySystemId.get(systemId);
    if (!system) return null;
    let light = lightCache.get(systemId);
    if (!light) {
        light = freeze({ ...system,
            constellation: graph.constellations.find(c => c.constellation_id === system.constellation_id),
            region: graph.regions.find(r => r.region_id === system.region_id),
        });
        lightCache.set(systemId, light);
    }
    if (!celestials) return light;
    if (detailCache.has(systemId)) {
        const cached = detailCache.get(systemId);
        detailCache.delete(systemId);
        detailCache.set(systemId, cached);
        return cached;
    }
    const entry = detailIndex[systemId];
    if (!Array.isArray(entry) || !Number.isSafeInteger(entry[0]) || !Number.isSafeInteger(entry[1]) ||
        entry[0] < 0 || entry[1] <= 0 || entry[1] > 1024 * 1024 ||
        entry[0] + entry[1] > graph.metadata.detailsBytes) {
        throw new Error('The bundled Universe system index is invalid. Reinstall this Kairo release.');
    }
    const [offset, length] = entry;
    const buffer = Buffer.allocUnsafe(length);
    let read = 0;
    // System gzip members keep global offsets and can straddle two fixed-size
    // shards. Only the bytes belonging to this record are read and inflated.
    while (read < length) {
        const position = offset + read, index = Math.floor(position / graph.metadata.detailsChunkBytes);
        const part = graph.metadata.detailsFiles[index], local = position % graph.metadata.detailsChunkBytes;
        const file = new URL(part.name, DATA_DIRECTORY);
        let size;
        try { size = statSync(file).size; } catch { size = -1; }
        if (size !== part.bytes) throw new Error('The bundled Universe system index is invalid or its detail shard is truncated. Reinstall this Kairo release.');
        const amount = Math.min(length - read, part.bytes - local), fd = openSync(file, 'r');
        try {
            let completed = 0;
            while (completed < amount) {
                const count = readSync(fd, buffer, read + completed, amount - completed, local + completed);
                if (!count) throw new Error('The bundled Universe system data is truncated.');
                completed += count;
            }
            read += completed;
        } finally { closeSync(fd); }
    }
    const details = JSON.parse(gunzipSync(buffer, { maxOutputLength: 4 * 1024 * 1024 }));
    if (details.system_id !== systemId) throw new Error('The bundled Universe system index does not match its data.');
    const result = freeze({ ...light, ...details });
    detailCache.set(systemId, result);
    if (detailCache.size > DETAIL_CACHE_LIMIT) detailCache.delete(detailCache.keys().next().value);
    return result;
}
