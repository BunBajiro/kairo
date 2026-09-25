import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { getUniverseStatic, getUniverseSystem, LIGHT_YEAR_METRES } from '../../server/universe-static.mjs';

const topologyFile = new URL('../../server/data/universe.json.gz', import.meta.url);
const dataDirectory = new URL('../../server/data/', import.meta.url);
const sourceFile = new URL('../../server/universe-static.mjs', import.meta.url);
const provenanceFile = new URL('../../server/data/universe-provenance.json', import.meta.url);

function digestFiles(paths) {
    const digest = createHash('sha256');
    const buffer = Buffer.alloc(128 * 1024);
    for (const path of paths) {
        const fd = openSync(path, 'r');
        try {
            let size;
            while ((size = readSync(fd, buffer, 0, buffer.length, null))) digest.update(buffer.subarray(0, size));
        } finally { closeSync(fd); }
    }
    return digest.digest('hex');
}
function detailBytes(meta, offset, length) {
    const result = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
        const index = Math.floor((offset + read) / meta.detailsChunkBytes), local = (offset + read) % meta.detailsChunkBytes;
        const part = meta.detailsFiles[index], amount = Math.min(length - read, part.bytes - local);
        const fd = openSync(new URL(part.name, dataDirectory), 'r');
        try { assert.equal(readSync(fd, result, read, amount, local), amount); } finally { closeSync(fd); }
        read += amount;
    }
    return result;
}

test('official snapshot provenance, payload sizes and detail checksum agree', () => {
    const graph = getUniverseStatic(), meta = graph.metadata;
    const provenance = JSON.parse(readFileSync(provenanceFile));
    assert.deepEqual(meta, provenance);
    assert.equal(meta.schema, 1);
    assert.ok(Number.isSafeInteger(meta.build));
    assert.match(meta.source, new RegExp(`^https://developers\\.eveonline\\.com/static-data/tranquility/eve-online-static-data-${meta.build}-jsonl\\.zip$`));
    assert.ok(Number.isFinite(Date.parse(meta.releasedAt)));
    if (meta.sourceArchiveSha256 !== undefined) assert.match(meta.sourceArchiveSha256, /^[a-f0-9]{64}$/);
    for (const name of ['_sde', 'mapRegions', 'mapConstellations', 'mapSolarSystems', 'mapStargates', 'mapPlanets', 'mapMoons', 'mapSecondarySuns', 'npcStations']) {
        assert.match(meta.sourceFileSha256[name + '.jsonl'], /^[a-f0-9]{64}$/);
    }
    assert.equal(meta.detailsChunkBytes, 8 * 1024 * 1024);
    let totalBytes = 0;
    for (const part of meta.detailsFiles) {
        const path = new URL(part.name, dataDirectory);
        assert.equal(statSync(path).size, part.bytes);
        assert.ok(part.bytes > 0 && part.bytes <= 8 * 1024 * 1024, 'Each artifact fits the GitHub upload request cap after base64 encoding');
        assert.equal(digestFiles([path]), part.sha256);
        totalBytes += part.bytes;
    }
    assert.equal(totalBytes, meta.detailsBytes);
    assert.equal(digestFiles(meta.detailsFiles.map(part => new URL(part.name, dataDirectory))), meta.detailsSha256);
    assert.equal(graph.systems.length, meta.counts.systems);
    assert.equal(graph.regions.length, meta.counts.regions);
    assert.equal(graph.constellations.length, meta.counts.constellations);
    assert.equal(graph.gates.length, meta.counts.gates);
    assert.ok(meta.counts.systems >= 8400, 'Complete SDE, not a fixture or a visited-only graph');
    const packed = readFileSync(topologyFile);
    assert.equal(packed.readUInt32LE(4), 0, 'Reproducible gzip has no build timestamp');
    assert.equal(packed[9], 255, 'Reproducible gzip does not depend on the host operating system');
});

test('known physical coordinates project on XZ and never substitute the SDE schematic positions', () => {
    const graph = getUniverseStatic(), jita = graph.bySystemId.get(30000142);
    assert.equal(LIGHT_YEAR_METRES, 9460000000000000);
    assert.equal(jita.name, 'Jita');
    assert.equal(jita.region_id, 10000002);
    assert.equal(jita.constellation_id, 20000020);
    assert.deepEqual([jita.x, jita.y, jita.z], [-1.29064861735e17, 6.075530691e16, 1.1746922706e17]);
    assert.notEqual(jita.map_x, jita.schematic_x);
    for (const system of graph.systems) {
        assert.ok([system.x, system.y, system.z, system.security].every(Number.isFinite));
        assert.equal(system.map_x, system.x / LIGHT_YEAR_METRES);
        assert.equal(system.map_y, -system.z / LIGHT_YEAR_METRES);
        assert.ok(system.region_name && system.constellation_name);
    }
});

test('bundled gate graph has unique reciprocal links and no invented Jspace links', () => {
    const graph = getUniverseStatic(), seen = new Set();
    for (const edge of graph.gates) {
        const { from_system_id: from, to_system_id: to } = edge;
        assert.ok(from < to);
        assert.ok(graph.bySystemId.has(from) && graph.bySystemId.has(to));
        const key = from + ':' + to;
        assert.ok(!seen.has(key));
        seen.add(key);
        assert.ok(graph.neighbors.get(from).has(to));
        assert.ok(graph.neighbors.get(to).has(from));
    }
    let degree = 0, wormholes = 0;
    for (const system of graph.systems) {
        const adjacent = graph.neighbors.get(system.system_id);
        degree += adjacent.size;
        assert.equal(adjacent.size, system.gate_count);
        if (system.space === 'wormhole') {
            wormholes++;
            assert.equal(adjacent.size, 0);
            assert.ok(Number.isInteger(system.wormhole_class));
            assert.equal(system.jump_eligible, false);
        }
    }
    assert.equal(degree, graph.gates.length * 2);
    assert.equal(degree, graph.metadata.counts.stargates);
    assert.equal(wormholes, graph.metadata.counts.space.wormhole);
    for (const region of [10000004, 10000017, 10000019, 10000070, 10001000, 10001004]) {
        const systems = graph.systems.filter(s => s.region_id === region);
        assert.ok(systems.length, `Special region ${region} is present`);
        assert.ok(systems.every(s => s.jump_eligible === false));
    }
});

test('shared topology and detailed records cannot be mutated by a caller', () => {
    const graph = getUniverseStatic(), first = graph.systems[0];
    assert.throws(() => { first.name = 'changed'; }, TypeError);
    assert.throws(() => { graph.systems.push(first); }, TypeError);
    assert.throws(() => { graph.metadata.counts.systems = 1; }, TypeError);
    assert.equal(graph.bySystemId.set, undefined);
    assert.equal(graph.bySystemId.delete, undefined);
    assert.equal(graph.neighbors.get(first.system_id).add, undefined);
    assert.equal(graph.neighbors.get(first.system_id).clear, undefined);
    const jita = getUniverseSystem(30000142);
    assert.throws(() => { jita.star.position.x = 200; }, TypeError);
    assert.throws(() => { jita.stations[0].name = 'changed'; }, TypeError);
    assert.equal(getUniverseStatic(), graph);
    assert.equal(getUniverseSystem(30000142), jita);
    const light = getUniverseSystem(30000142, { celestials: false });
    assert.equal(light.celestials, undefined);
    assert.equal(light.region.name, 'The Forge');
    assert.equal(light.constellation.name, 'Kimotoro');
    assert.equal(getUniverseSystem(-1), null);
});

test('every independently compressed detail record matches its system, counts and static references', () => {
    const graph = getUniverseStatic();
    const { detailIndex } = JSON.parse(gunzipSync(readFileSync(topologyFile)));
    let celestials = 0, stations = 0, gateCount = 0, crossBoundaryRecords = 0;
    for (const system of graph.systems) {
        const [offset, length] = detailIndex[system.system_id];
        if (Math.floor(offset / graph.metadata.detailsChunkBytes) !== Math.floor((offset + length - 1) / graph.metadata.detailsChunkBytes)) crossBoundaryRecords++;
        const detail = getUniverseSystem(system.system_id);
        assert.equal(detail.system_id, system.system_id);
        assert.equal(detail.celestials.filter(c => c.kind === 'planet').length, system.planet_count);
        assert.equal(detail.celestials.filter(c => c.kind === 'moon').length, system.moon_count);
        assert.equal(detail.celestials.filter(c => c.kind === 'asteroid_belt').length, system.belt_count);
        assert.equal(detail.stations.length, system.station_count);
        assert.equal(detail.stargates.length, system.gate_count);
        const ids = new Set();
        for (const item of [...detail.celestials, ...detail.stations, ...detail.stargates]) {
            assert.ok(!ids.has(item.id));
            ids.add(item.id);
            assert.ok(item.name);
            assert.ok(Object.values(item.position).every(Number.isFinite));
        }
        for (const gate of detail.stargates) assert.ok(graph.neighbors.get(system.system_id).has(gate.destination_system_id));
        celestials += detail.celestials.length;
        stations += detail.stations.length;
        gateCount += detail.stargates.length;
    }
    assert.equal(celestials, graph.metadata.counts.celestials);
    assert.equal(stations, graph.metadata.counts.stations);
    assert.equal(gateCount, graph.metadata.counts.stargates);
    assert.ok(crossBoundaryRecords > 0, 'Exercise real records whose gzip members cross a shard boundary');
    const jita = getUniverseSystem(30000142);
    assert.equal(jita.star.position.x, 0);
    assert.ok(jita.stations.some(s => s.id === 60003760 && s.name === 'Jita IV - Moon 4 - Caldari Navy Assembly Plant'));
});

test('truncated detail archives and mismatched offsets fail instead of returning another system', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kairo-universe-static-'));
    try {
        mkdirSync(join(dir, 'data'));
        copyFileSync(sourceFile, join(dir, 'truncated.mjs'));
        copyFileSync(new URL('../../server/universe-wormholes.mjs', import.meta.url), join(dir, 'universe-wormholes.mjs'));
        copyFileSync(new URL('../../server/data/universe-wormholes.json', import.meta.url), join(dir, 'data/universe-wormholes.json'));
        copyFileSync(topologyFile, join(dir, 'data/universe.json.gz'));
        writeFileSync(join(dir, 'data/universe-details-000.bin'), Buffer.from([0]));
        const truncated = await import(pathToFileURL(join(dir, 'truncated.mjs')).href);
        assert.equal(truncated.getUniverseSystem(30000142, { celestials: false }).name, 'Jita');
        assert.throws(() => truncated.getUniverseSystem(30000142), /system index is invalid/);

        const data = JSON.parse(gunzipSync(readFileSync(topologyFile)));
        const [offset, length] = data.detailIndex[30000143];
        const chunk = detailBytes(data.metadata, offset, length);
        data.detailIndex[30000142] = [0, length];
        data.metadata.detailsBytes = length;
        data.metadata.detailsFiles = [{ name: 'universe-details-000.bin', bytes: length, sha256: createHash('sha256').update(chunk).digest('hex') }];
        writeFileSync(join(dir, 'data/universe.json.gz'), gzipSync(JSON.stringify(data)));
        writeFileSync(join(dir, 'data/universe-details-000.bin'), chunk);
        copyFileSync(sourceFile, join(dir, 'mismatched.mjs'));
        const mismatched = await import(pathToFileURL(join(dir, 'mismatched.mjs')).href);
        assert.throws(() => mismatched.getUniverseSystem(30000142), /index does not match/);

        data.metadata.detailsFiles[0].name = '../outside.bin';
        writeFileSync(join(dir, 'data/universe.json.gz'), gzipSync(JSON.stringify(data)));
        copyFileSync(sourceFile, join(dir, 'bad-manifest.mjs'));
        const badManifest = await import(pathToFileURL(join(dir, 'bad-manifest.mjs')).href);
        assert.throws(() => badManifest.getUniverseStatic(), /manifest is invalid/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
