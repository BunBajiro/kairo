import { createReadStream } from 'node:fs';
import { open, readFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { openSdeArchive } from './sde-archive.mjs';

const LY = 9460000000000000;
const SHARD_BYTES = 8 * 1024 * 1024;
const BUCKET_SYSTEMS = 256;
const BUFFER_BYTES = 512 * 1024;
const english = (value, fallback = '') => typeof value === 'object' && value ? value.en ?? fallback : value || fallback;
const json = value => Buffer.from(JSON.stringify(value));
const gzip = value => { const bytes = gzipSync(json(value), { level: 9, mtime: 0 }); bytes[9] = 255; return bytes; };
const ordered = map => [...map].sort(([a], [b]) => a - b);
const space = id => id >= 11000000 && id < 12000000 ? 'wormhole' : id >= 12000000 && id < 13000000 ? 'abyssal' : id >= 10000000 && id < 11000000 ? 'known' : 'other';
const required = (map, key, kind) => { if (!map.has(key)) throw new Error(`SDE references unknown ${kind} ${key}`); return map.get(key); };
const number = (value, label) => { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid SDE ${label}`); return value; };
function position(record) {
  const p = record.position ?? { x: 0, y: 0, z: 0 };
  return { x: number(p.x, `position ${record._key}`), y: number(p.y, `position ${record._key}`), z: number(p.z, `position ${record._key}`) };
}
const projected = record => { const p = position(record); return { ...p, map_x: p.x / LY, map_y: -p.z / LY }; };
function roman(input) {
  let value = number(input, 'celestial index'), out = '';
  if (!Number.isInteger(value) || value < 0 || value > 10000) throw new Error('Invalid SDE celestial index');
  for (const [n, text] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]) {
    out += text.repeat(Math.floor(value / n)); value %= n;
  }
  return out;
}
async function sha256(path, signal) {
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(path, { signal })) digest.update(bytes);
  return digest.digest('hex');
}

/** Build one complete generation. Called in a worker, never the core event loop. */
export async function buildSde({ archivePath, outputDir, expectedBuild, onProgress = () => {}, signal }) {
  signal?.throwIfAborted();
  if (!Number.isSafeInteger(expectedBuild) || expectedBuild <= 0) throw new Error('Expected SDE build is required');
  await mkdir(outputDir, { recursive: true });
  // Scratch lives inside the managed stage so crash recovery can remove it too.
  const spoolDirectory = await mkdtemp(join(outputDir, '.spool-'));
  const archive = await openSdeArchive(archivePath, { signal }).catch(async error => { await rm(spoolDirectory, { recursive: true, force: true }); throw error; });
  const createdFiles = [];
  let done = false;
  const progress = (phase, detail) => { signal?.throwIfAborted(); onProgress({ phase, ...detail }); };
  try {
    progress('validating');
    let sde;
    for await (const record of archive.rows('_sde.jsonl')) if (record._key === 'sde') {
      if (sde) throw new Error('Duplicate SDE build metadata'); sde = record;
    }
    if (!sde || sde.buildNumber !== expectedBuild || !Number.isFinite(Date.parse(sde.releaseDate))) throw new Error('SDE archive build or release date does not match the requested update');
    const source = `https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-${expectedBuild}-jsonl.zip`;
    async function loadMap(name) {
      const map = new Map();
      for await (const row of archive.rows(name)) {
        if (!Number.isSafeInteger(row._key) || map.has(row._key)) throw new Error(`Invalid or duplicate SDE key in ${name}`);
        map.set(row._key, row);
      }
      if (!map.size) throw new Error(`Empty SDE table: ${name}`);
      return map;
    }
    const regions = await loadMap('mapRegions.jsonl');
    const constellations = await loadMap('mapConstellations.jsonl');
    const rawSystems = await loadMap('mapSolarSystems.jsonl');
    const rawGates = await loadMap('mapStargates.jsonl');
    if (rawSystems.size > 100000) throw new Error('SDE system count exceeds supported limits');
    const marketGroups = new Map();
    for await (const row of archive.rows('marketGroups.jsonl')) {
      if (!Number.isSafeInteger(row._key) || marketGroups.has(row._key)) throw new Error('Invalid or duplicate market group');
      marketGroups.set(row._key, { id: row._key, parentId: row.parentGroupID ?? 0, name: english(row.name), types: [] });
    }
    if (!marketGroups.size) throw new Error('Empty SDE market groups');
    for (const group of marketGroups.values()) if (group.parentId) required(marketGroups, group.parentId, 'market group parent');
    const typeNames = new Map(), descriptions = new Map(), volumes = {};
    for await (const row of archive.rows('types.jsonl')) {
      if (!Number.isSafeInteger(row._key) || typeNames.has(row._key)) throw new Error('Invalid or duplicate type');
      typeNames.set(row._key, english(row.name));
      if (row._key >= 30000 && row._key < 32000) descriptions.set(row._key, english(row.description));
      const group = marketGroups.get(row.marketGroupID);
      if (group) {
        group.types.push(row._key);
        if (row.packagedVolume != null) volumes[row._key] = number(row.packagedVolume, 'packaged volume');
      }
    }
    if (!typeNames.size) throw new Error('Empty SDE types');
    for (const group of marketGroups.values()) group.types.sort((a, b) => a - b);
    const owners = new Map(), corporations = {};
    for await (const row of archive.rows('npcCorporations.jsonl')) {
      if (!Number.isSafeInteger(row._key) || owners.has(row._key)) throw new Error('Invalid or duplicate NPC corporation');
      owners.set(row._key, english(row.name));
      corporations[row._key] = { name: english(row.name), factionId: row.factionID ?? 0 };
    }
    const operations = await loadMap('stationOperations.jsonl');
    const systems = new Map(), bucketBySystem = new Map(), expectedCounts = new Map();
    for (const [sid, row] of ordered(rawSystems)) {
      const region = required(regions, row.regionID, 'region');
      const constellation = required(constellations, row.constellationID, 'constellation');
      if (constellation.regionID !== region._key) throw new Error(`Inconsistent parent region for system ${sid}`);
      const kind = space(region._key);
      const whClass = row.wormholeClassID ?? constellation.wormholeClassID ?? region.wormholeClassID ?? null;
      const system = { system_id: sid, name: english(row.name), region_id: region._key, constellation_id: constellation._key,
        security: number(row.securityStatus, `security ${sid}`), ...projected(row), space: kind, space_class: whClass,
        wormhole_class: kind === 'wormhole' ? whClass : null,
        faction_id: row.factionID ?? constellation.factionID ?? region.factionID ?? null,
        effect: null, effect_id: null,
        jump_eligible: kind === 'known' && ![10000004,10000017,10000019,10000070,10001000,10001004].includes(region._key) };
      if (row.position2D) Object.assign(system, { schematic_x: number(row.position2D.x, 'schematic x') / LY, schematic_y: -number(row.position2D.y, 'schematic y') / LY });
      bucketBySystem.set(sid, Math.floor(systems.size / BUCKET_SYSTEMS));
      expectedCounts.set(sid, { star: 0, celestials: 0, stations: 0, stargates: 0 });
      systems.set(sid, system);
    }
    const buckets = Array.from({ length: Math.ceil(systems.size / BUCKET_SYSTEMS) }, (_, index) => ({
      path: join(spoolDirectory, `${index}.jsonl`), buffer: [], buffered: 0, bytes: 0, digest: createHash('sha256'), rows: 0,
    }));
    async function flush(bucket) {
      if (!bucket.buffered) return;
      const bytes = Buffer.concat(bucket.buffer, bucket.buffered);
      const handle = await open(bucket.path, 'a');
      try {
        let cursor = 0;
        while (cursor < bytes.length) {
          const result = await handle.write(bytes, cursor, bytes.length - cursor);
          if (!result.bytesWritten) throw new Error('Unable to write SDE conversion spool');
          cursor += result.bytesWritten;
        }
        await handle.datasync();
        const size = (await handle.stat()).size;
        if (size !== bucket.bytes + bytes.length) throw new Error('SDE conversion spool lost data while writing');
      } finally { await handle.close(); }
      bucket.bytes += bytes.length; bucket.digest.update(bytes); bucket.buffer = []; bucket.buffered = 0;
    }
    async function append(sid, key, item) {
      signal?.throwIfAborted();
      const expected = required(expectedCounts, sid, 'celestial system');
      if (key === 'star' && expected.star) throw new Error(`Duplicate star for system ${sid}`);
      expected[key]++;
      const bucket = buckets[bucketBySystem.get(sid)];
      const bytes = Buffer.from(`${JSON.stringify([sid, key, item])}\n`);
      bucket.buffer.push(bytes); bucket.buffered += bytes.length; bucket.rows++;
      if (bucket.buffered >= BUFFER_BYTES) await flush(bucket);
    }
    function body(row, kind) {
      required(systems, row.solarSystemID, 'celestial system');
      if (!Number.isSafeInteger(row._key) || !Number.isSafeInteger(row.typeID)) throw new Error('Invalid SDE celestial identifier');
      return { id: row._key, kind, type_id: row.typeID, type_name: typeNames.get(row.typeID) ?? String(row.typeID), position: position(row),
        orbit_id: row.orbitID ?? null, radius: row.radius ?? null, celestial_index: row.celestialIndex ?? null, orbit_index: row.orbitIndex ?? null };
    }
    progress('converting', { completed: 0, total: systems.size });
    const orbitNames = new Map(), effects = new Map();
    for await (const row of archive.rows('mapStars.jsonl')) {
      const item = { ...body(row, 'star'), name: required(systems, row.solarSystemID, 'star system').name, statistics: row.statistics ?? {} };
      orbitNames.set(item.id, item.name); await append(row.solarSystemID, 'star', item);
    }
    for (const [file, kind] of [['mapPlanets.jsonl','planet'],['mapMoons.jsonl','moon'],['mapAsteroidBelts.jsonl','asteroid_belt']]) {
      for await (const row of archive.rows(file)) {
        const item = body(row, kind), name = systems.get(row.solarSystemID).name;
        const fallback = kind === 'planet' ? `${name} ${roman(row.celestialIndex)}` : `${orbitNames.get(row.orbitID) ?? name} - ${kind === 'moon' ? 'Moon' : 'Asteroid Belt'} ${row.orbitIndex}`;
        item.name = english(row.uniqueName, fallback); orbitNames.set(item.id, item.name);
        await append(row.solarSystemID, 'celestials', item);
      }
    }
    for await (const row of archive.rows('mapSecondarySuns.jsonl')) {
      const item = { ...body(row, 'secondary_star'), name: typeNames.get(row.typeID) ?? 'Secondary star', effect_id: row.effectBeaconTypeID };
      Object.assign(systems.get(row.solarSystemID), { effect: typeNames.get(row.effectBeaconTypeID) ?? String(row.effectBeaconTypeID), effect_id: row.effectBeaconTypeID });
      effects.set(row.solarSystemID, descriptions.get(row.effectBeaconTypeID) ?? '');
      await append(row.solarSystemID, 'celestials', item);
    }
    for await (const row of archive.rows('npcStations.jsonl')) {
      const item = body(row, 'station'), owner = owners.get(row.ownerID) ?? String(row.ownerID);
      const operation = required(operations, row.operationID, 'station operation');
      const fallback = `${orbitNames.get(row.orbitID) ?? systems.get(row.solarSystemID).name} - ${owner}${row.useOperationName ? ` ${english(operation.operationName)}` : ''}`;
      Object.assign(item, { name: english(row.name, fallback), owner_id: row.ownerID, owner_name: owner, operation_id: row.operationID, services: operation.services ?? [] });
      await append(row.solarSystemID, 'stations', item);
    }
    orbitNames.clear();
    const edges = new Map();
    for (const [gid, row] of ordered(rawGates)) {
      const destination = row.destination;
      if (!destination) throw new Error(`Missing destination for gate ${gid}`);
      const other = required(rawGates, destination.stargateID, 'destination gate');
      if (other.destination?.stargateID !== gid || other.solarSystemID !== destination.solarSystemID || other.destination?.solarSystemID !== row.solarSystemID) throw new Error(`Non-reciprocal gate ${gid}`);
      const target = required(systems, destination.solarSystemID, 'gate destination system');
      if (!required(rawSystems, row.solarSystemID, 'gate source system').stargateIDs?.includes(gid)) throw new Error(`Gate ${gid} missing from source system`);
      await append(row.solarSystemID, 'stargates', { ...body(row, 'stargate'), name: `Stargate (${target.name})`, destination_system_id: target.system_id, destination_stargate_id: destination.stargateID });
      const pair = [row.solarSystemID, target.system_id].sort((a,b) => a-b); edges.set(pair.join(':'), pair);
    }
    for (const bucket of buckets) await flush(bucket);
    const detailIndex = {}, detailFiles = [], detailDigest = createHash('sha256');
    const shard = Buffer.alloc(SHARD_BYTES);
    let shardLength = 0, detailBytes = 0, completed = 0, celestialCount = 0, stationCount = 0, gateCount = 0;
    async function writeOutput(name, bytes) {
      signal?.throwIfAborted();
      const handle = await open(join(outputDir, name), 'wx');
      createdFiles.push(name);
      try { await handle.writeFile(bytes, { signal }); await handle.datasync(); }
      finally { await handle.close(); }
      return { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }
    async function flushShard() {
      if (shardLength) detailFiles.push(await writeOutput(`universe-details-${String(detailFiles.length).padStart(3, '0')}.bin`, shard.subarray(0, shardLength)));
      shardLength = 0;
    }
    const ids = [...systems.keys()];
    for (let index = 0; index < buckets.length; index++) {
      signal?.throwIfAborted();
      const bucket = buckets[index], details = new Map(), actualCounts = new Map();
      for (const sid of ids.slice(index * BUCKET_SYSTEMS, (index + 1) * BUCKET_SYSTEMS)) {
        details.set(sid, { system_id: sid, star: null, celestials: [], stations: [], stargates: [], ...(effects.has(sid) ? { effect_description: effects.get(sid) } : {}) });
        actualCounts.set(sid, { star: 0, celestials: 0, stations: 0, stargates: 0 });
      }
      const bytes = bucket.bytes ? await readFile(bucket.path, { signal }) : Buffer.alloc(0);
      if (bytes.length !== bucket.bytes || createHash('sha256').update(bytes).digest('hex') !== bucket.digest.digest('hex')) throw new Error('SDE conversion spool failed integrity validation');
      let rows = 0;
      for (const line of bytes.toString('utf8').split('\n')) {
        if (!line) continue;
        const [sid, key, item] = JSON.parse(line);
        const detail = required(details, sid, 'spooled system');
        if (!['star','celestials','stations','stargates'].includes(key)) throw new Error('Invalid SDE spool item');
        actualCounts.get(sid)[key]++;
        if (key === 'star') detail.star = item; else detail[key].push(item);
        rows++;
      }
      if (rows !== bucket.rows) throw new Error('SDE conversion spool lost rows');
      for (const [sid, detail] of details) {
        const counts = actualCounts.get(sid), expected = expectedCounts.get(sid);
        if (Object.keys(expected).some(key => counts[key] !== expected[key])) throw new Error(`SDE detail count mismatch in system ${sid}`);
        for (const key of ['celestials','stations','stargates']) detail[key].sort((a,b) => (a.celestial_index || 0) - (b.celestial_index || 0) || (a.orbit_index || 0) - (b.orbit_index || 0) || a.id - b.id);
        const kindCounts = { planet: 0, moon: 0, asteroid_belt: 0 };
        for (const item of detail.celestials) if (Object.hasOwn(kindCounts, item.kind)) kindCounts[item.kind]++;
        Object.assign(systems.get(sid), { planet_count: kindCounts.planet, moon_count: kindCounts.moon, belt_count: kindCounts.asteroid_belt, station_count: detail.stations.length, gate_count: detail.stargates.length });
        celestialCount += detail.celestials.length; stationCount += detail.stations.length; gateCount += detail.stargates.length;
        const compressed = gzip(detail);
        detailIndex[sid] = [detailBytes, compressed.length]; detailBytes += compressed.length; detailDigest.update(compressed);
        for (let cursor = 0; cursor < compressed.length;) {
          const amount = Math.min(SHARD_BYTES - shardLength, compressed.length - cursor);
          compressed.copy(shard, shardLength, cursor, cursor + amount); shardLength += amount; cursor += amount;
          if (shardLength === SHARD_BYTES) await flushShard();
        }
        completed++;
      }
      if (bucket.bytes) await rm(bucket.path);
      progress('converting', { completed, total: systems.size });
    }
    await flushShard();
    if (gateCount !== rawGates.size) throw new Error('SDE gate detail count mismatch');
    const sourceArchiveSha256 = await sha256(archivePath, signal);
    const counts = { systems: systems.size, regions: regions.size, constellations: constellations.size, gates: edges.size, stargates: rawGates.size, celestials: celestialCount, stations: stationCount, space: {} };
    for (const system of systems.values()) counts.space[system.space] = (counts.space[system.space] ?? 0) + 1;
    const metadata = { schema: 1, build: expectedBuild, releasedAt: sde.releaseDate, source, provider: 'CCP Games Static Data Export', counts,
      projection: { plane: 'XZ', x: 'x / lightYearMetres', y: '-z / lightYearMetres', lightYearMetres: LY, physicalPositionsUnit: 'metres' },
      detailsSha256: detailDigest.digest('hex'), detailsBytes: detailBytes, sourceFileSha256: Object.fromEntries(Object.entries(archive.hashes).filter(([name]) => name !== 'marketGroups.jsonl').sort(([a],[b]) => a.localeCompare(b))),
      notes: ['Celestial positions are system-local metres; system positions are universe metres.', 'Static coordinates do not establish wormhole connections or cynosural access.', 'Generated celestial names use official unique names where present, otherwise system/orbit indices.', 'Ship, skill, security and cynosural restrictions must be applied separately to jump planning.'],
      sourceArchiveSha256, detailsChunkBytes: SHARD_BYTES, detailsFiles: detailFiles };
    for (const [, constellation] of constellations) required(regions, constellation.regionID, 'constellation region');
    const snapshot = { metadata, systems: [...systems.values()],
      regions: ordered(regions).map(([id,row]) => ({ region_id: id, name: english(row.name), faction_id: row.factionID ?? null, space: space(id), ...projected(row) })),
      constellations: ordered(constellations).map(([id,row]) => ({ constellation_id: id, name: english(row.name), region_id: row.regionID, ...projected(row) })),
      gates: [...edges.values()].sort(([a,b],[c,d]) => a-c || b-d).map(([a,b]) => ({ from_system_id: a, to_system_id: b })), detailIndex };
    progress('verifying');
    const files = [...detailFiles];
    files.push(await writeOutput('universe.json.gz', gzip(snapshot)));
    files.push(await writeOutput('universe-provenance.json', Buffer.concat([json(metadata), Buffer.from('\n')])));
    files.push(await writeOutput('market-categories.json', Buffer.concat([json({ build: expectedBuild, source, groups: ordered(marketGroups).map(([,group]) => group), volumes }), Buffer.from('\n')])));
    files.push(await writeOutput('npc-market-owners.json', Buffer.concat([json({ source, build: expectedBuild, corporations }), Buffer.from('\n')])));
    for (const file of files) if ((await stat(join(outputDir, file.name))).size !== file.bytes || await sha256(join(outputDir, file.name), signal) !== file.sha256) throw new Error(`SDE output integrity check failed: ${file.name}`);
    const manifest = { schema: 1, build: expectedBuild, releasedAt: sde.releaseDate, source, files, counts, sourceArchiveSha256 };
    await writeOutput('manifest.json', Buffer.concat([json(manifest), Buffer.from('\n')]));
    done = true;
    return manifest;
  } finally {
    await archive.close();
    await rm(spoolDirectory, { recursive: true, force: true });
    if (!done) for (const name of createdFiles) await rm(join(outputDir, name), { force: true });
  }
}
