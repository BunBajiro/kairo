import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, readdir, open } from 'node:fs/promises';
import { readdirSync, statSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateRawSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { buildSde } from '../../server/sde-build.mjs';
import { openSdeArchive } from '../../server/sde-archive.mjs';

const BUILD = 3552227;
const position = { x: 1e16, y: 2e15, z: -3e16 };
function fixture({ systemCount = 3, moons = 2 } = {}) {
  const rows = {
    '_sde.jsonl': [{ _key: 'sde', buildNumber: BUILD, releaseDate: '2026-09-28T11:08:09Z' }],
    'mapRegions.jsonl': [{ _key: 11000001, name: { en: 'Wormhole region' }, wormholeClassID: 4, position }],
    'mapConstellations.jsonl': [{ _key: 21000001, name: { en: 'Constellation' }, regionID: 11000001, position }],
    'mapSolarSystems.jsonl': [], 'mapStargates.jsonl': [], 'mapStars.jsonl': [], 'mapPlanets.jsonl': [],
    'mapMoons.jsonl': [], 'mapAsteroidBelts.jsonl': [], 'mapSecondarySuns.jsonl': [], 'npcStations.jsonl': [],
    'marketGroups.jsonl': [{ _key: 1, name: { en: 'Ships' } }, { _key: 2, parentGroupID: 1, name: { en: 'Frigates' } }],
    'types.jsonl': [{ _key: 1, name: { en: 'Star' } }, { _key: 2, name: { en: 'Planet' } }, { _key: 3, name: { en: 'Moon' } },
      { _key: 4, name: { en: 'Belt' } }, { _key: 5, name: { en: 'Station' } }, { _key: 6, name: { en: 'Gate' } },
      { _key: 7, name: { en: 'Frigate' }, marketGroupID: 2, packagedVolume: 2500 },
      { _key: 30575, name: { en: 'Pulsar' }, description: { en: 'A wormhole effect.' } }],
    'npcCorporations.jsonl': [{ _key: 1000001, name: { en: 'Example corporation' }, factionID: 500001 }],
    'stationOperations.jsonl': [{ _key: 1, operationName: { en: 'Factory' }, services: [1, 2] }],
  };
  for (let index = 0; index < systemCount; index++) {
    const sid = 31000001 + index, star = 40000000 + index * 1000, planet = star + 1;
    rows['mapSolarSystems.jsonl'].push({ _key: sid, name: { en: `J${index} Éden` }, regionID: 11000001, constellationID: 21000001,
      position, position2D: { x: index * 9460000000000000, y: 0 }, securityStatus: -0.99, stargateIDs: index < 2 ? [60000001 + index] : [] });
    const body = (_key, typeID, extra = {}) => ({ _key, typeID, solarSystemID: sid, position: { x: 1, y: 2, z: 3 }, radius: 1234, ...extra });
    rows['mapStars.jsonl'].push(body(star, 1, { statistics: { temperature: 1234 } }));
    rows['mapPlanets.jsonl'].push(body(planet, 2, { orbitID: star, celestialIndex: 1 }));
    for (let moon = 1; moon <= moons; moon++) rows['mapMoons.jsonl'].push(body(planet + moon, 3, { orbitID: planet, celestialIndex: 1, orbitIndex: moon }));
    rows['mapAsteroidBelts.jsonl'].push(body(star + 600, 4, { orbitID: planet, celestialIndex: 1, orbitIndex: 1 }));
    rows['npcStations.jsonl'].push(body(star + 700, 5, { orbitID: planet + 1, ownerID: 1000001, operationID: 1, useOperationName: true }));
    if (!index) rows['mapSecondarySuns.jsonl'].push(body(star + 800, 1, { effectBeaconTypeID: 30575 }));
    if (index < 2) rows['mapStargates.jsonl'].push(body(60000001 + index, 6, { destination: { solarSystemID: 31000002 - index, stargateID: 60000002 - index } }));
  }
  return rows;
}

// Construct a minimal real ZIP without another archive library. corruptCrc alters
// only the central-directory checksum; extraMember exercises member validation.
// Production ZIP parsing/decompression and converter bounds remain under test.
function zip(rows, { corruptCrc, extraMember } = {}) {
  const entries = Object.entries(rows).map(([name, records]) => [name, Buffer.from(records.map(r => JSON.stringify(r)).join('\n') + '\n')]);
  if (extraMember) entries.push([extraMember, Buffer.from('x')]);
  const locals = [], central = []; let offset = 0;
  for (const [name, raw] of entries) {
    const bytes = Buffer.from(name), compressed = deflateRawSync(raw), checksum = crc32(raw);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8);
    header.writeUInt32LE(checksum, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(raw.length, 22); header.writeUInt16LE(bytes.length, 26);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(name === corruptCrc ? (checksum ^ 1) >>> 0 : checksum, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(raw.length, 24);
    directory.writeUInt16LE(bytes.length, 28); directory.writeUInt32LE(offset, 42);
    locals.push(header, bytes, compressed); central.push(directory, bytes); offset += header.length + bytes.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...locals, directory, end]);
}

async function setup(t, rows = fixture(), options) {
  const dir = await mkdtemp(join(tmpdir(), 'kairo-sde-build-test-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const archivePath = join(dir, 'official.zip'), outputDir = join(dir, 'output'); await writeFile(archivePath, zip(rows, options));
  return { archivePath, outputDir, expectedBuild: BUILD };
}
async function decoded(outputDir) {
  const topology = JSON.parse(gunzipSync(await readFile(join(outputDir, 'universe.json.gz'))));
  const bytes = Buffer.concat(await Promise.all(topology.metadata.detailsFiles.map(f => readFile(join(outputDir, f.name)))));
  const details = new Map(Object.entries(topology.detailIndex).map(([id, [offset, length]]) => [Number(id), JSON.parse(gunzipSync(bytes.subarray(offset, offset + length)))]));
  return { topology, details };
}

test('SDE builder converts every system across multiple spool buckets without losing bodies', async t => {
  const args = await setup(t, fixture({ systemCount: 303, moons: 50 }));
  const progress = [], manifest = await buildSde({ ...args, onProgress: value => progress.push(value) });
  assert.equal(manifest.schema, 1); assert.equal(manifest.build, BUILD); assert.equal(manifest.releasedAt, '2026-09-28T11:08:09Z');
  assert.deepEqual(manifest.counts, { systems: 303, regions: 1, constellations: 1, gates: 1, stargates: 2, celestials: 15757, stations: 303, space: { wormhole: 303 } });
  const { topology, details } = await decoded(args.outputDir);
  assert.equal(details.size, 303); assert.equal(topology.systems.length, 303);
  for (const system of topology.systems) {
    const detail = details.get(system.system_id);
    assert.equal(detail.star.name, system.name); assert.equal(system.planet_count, 1); assert.equal(system.moon_count, 50); assert.equal(system.belt_count, 1); assert.equal(system.station_count, 1);
    assert.equal(detail.celestials.filter(c => c.kind === 'moon').length, 50); assert.equal(detail.stations.length, 1);
    assert.equal(detail.stations[0].name, `${system.name} I - Moon 1 - Example corporation Factory`);
    assert.equal(system.wormhole_class, 4); assert.equal(system.jump_eligible, false);
  }
  assert.equal(details.get(31000001).effect_description, 'A wormhole effect.');
  assert.equal(details.get(31000001).stargates[0].destination_system_id, 31000002);
  assert.equal(topology.systems.at(-1).schematic_x, 302);
  const market = JSON.parse(await readFile(join(args.outputDir, 'market-categories.json')));
  assert.equal(market.build, BUILD); assert.deepEqual(market.groups[1].types, [7]); assert.equal(market.volumes[7], 2500);
  const owners = JSON.parse(await readFile(join(args.outputDir, 'npc-market-owners.json')));
  assert.equal(owners.build, BUILD); assert.deepEqual(owners.corporations[1000001], { name: 'Example corporation', factionId: 500001 });
  for (const file of manifest.files) {
    const data = await readFile(join(args.outputDir, file.name)); assert.equal(data.length, file.bytes); assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256);
  }
  assert.deepEqual(JSON.parse(await readFile(join(args.outputDir, 'manifest.json'))), manifest);
  assert.equal((await readdir(args.outputDir)).some(name => name.startsWith('.spool-')), false);
  assert.ok(progress.some(p => p.completed === 256)); assert.ok(progress.some(p => p.completed === 303));
});

test('SDE archive rejects CRC corruption before publishing a generation', async t => {
  const args = await setup(t, fixture(), { corruptCrc: 'mapMoons.jsonl' });
  await assert.rejects(buildSde(args), /CRC\/size mismatch/); assert.deepEqual(await readdir(args.outputDir), []);
});

test('SDE conversion rejects missing references, missing members and mismatched builds', async t => {
  for (const kind of ['reference', 'member', 'build', 'reciprocal']) {
    const rows = fixture();
    if (kind === 'reference') rows['mapMoons.jsonl'][0].solarSystemID = 999;
    if (kind === 'member') delete rows['mapAsteroidBelts.jsonl'];
    if (kind === 'build') rows['_sde.jsonl'][0].buildNumber++;
    if (kind === 'reciprocal') rows['mapStargates.jsonl'][1].destination.solarSystemID = 999;
    const args = await setup(t, rows);
    await assert.rejects(buildSde(args), /unknown|missing|does not match|Non-reciprocal/);
    assert.deepEqual(await readdir(args.outputDir), []);
  }
});

test('SDE archive refuses traversal names and truncated archives', async t => {
  const args = await setup(t, fixture(), { extraMember: '../outside.jsonl' });
  await assert.rejects(openSdeArchive(args.archivePath), /unsafe member name/);
  await writeFile(args.archivePath, (await readFile(args.archivePath)).subarray(0, 100));
  await assert.rejects(openSdeArchive(args.archivePath), /missing ZIP directory/);
});

test('SDE conversion cancellation removes spool and partial output without publishing', async t => {
  const args = await setup(t, fixture({ systemCount: 303, moons: 2 })); const controller = new AbortController();
  await assert.rejects(buildSde({ ...args, signal: controller.signal, onProgress: p => { if (p.completed === 256) controller.abort(); } }), { name: 'AbortError' });
  assert.deepEqual(await readdir(args.outputDir), []);
});

test('SDE conversion fails closed if a spool loses bytes between writing and reading', async t => {
  const args = await setup(t, fixture({ systemCount: 303 }));
  await assert.rejects(buildSde({ ...args, onProgress: p => {
    if (p.completed !== 256) return;
    const spool = readdirSync(args.outputDir).find(name => name.startsWith('.spool-'));
    const path = join(args.outputDir, spool, '1.jsonl');
    truncateSync(path, statSync(path).size - 1);
  } }), /spool failed integrity validation/);
  assert.deepEqual(await readdir(args.outputDir), []);
});

test('SDE worker reports progress and validated manifest, and serializes failures', async t => {
  const args = await setup(t);
  async function run(workerData) {
    return await new Promise((resolve, reject) => {
      const messages = [], worker = new Worker(new URL('../../server/sde-worker.mjs', import.meta.url), { workerData });
      worker.on('message', message => messages.push(message)); worker.on('error', reject);
      worker.on('exit', code => code ? reject(new Error(`Worker exit ${code}`)) : resolve(messages));
    });
  }
  const messages = await run(args);
  assert.ok(messages.some(m => m.type === 'progress' && m.phase === 'converting'));
  assert.equal(messages.at(-1).type, 'result'); assert.equal(messages.at(-1).manifest.build, BUILD);
  const failed = await run({ ...args, outputDir: join(args.outputDir, 'failed'), expectedBuild: 1 });
  assert.equal(failed.at(-1).type, 'error'); assert.match(failed.at(-1).error.message, /does not match/);
});

test('SDE builder bounds total spool, per-bucket bytes and output before publication', async t => {
  for (const [limits, code] of [[{ spoolBytes: 1024 }, 'SDE_SPOOL_LIMIT'], [{ bucketBytes: 1024 }, 'SDE_BUCKET_LIMIT'], [{ bufferedSpoolBytes: 10 }, 'SDE_BUFFER_LIMIT'], [{ outputBytes: 10 }, 'SDE_OUTPUT_LIMIT']]) {
    const args = await setup(t);
    await assert.rejects(buildSde({ ...args, limits }), { code });
    assert.deepEqual(await readdir(args.outputDir), []);
  }
});

test('SDE builder refuses insufficient free space before creating a spool', async t => {
  const args = await setup(t);
  await assert.rejects(buildSde({ ...args, readAvailable: async () => 0 }), { code: 'SDE_DISK_SPACE' });
  assert.deepEqual(await readdir(args.outputDir), []);
});

test('SDE builder checks free space again before writing and preserves disk-full cause', async t => {
  for (const kind of ['reserve', 'ENOSPC']) {
    const args = await setup(t); let checks = 0;
    const original = Object.assign(new Error('No space left on device'), { code: 'ENOSPC' });
    await assert.rejects(buildSde({ ...args,
      readAvailable: async () => ++checks === 1 || kind === 'ENOSPC' ? 2 ** 40 : 0,
      openFile: kind === 'ENOSPC' ? async () => { throw original; } : open,
    }), kind === 'ENOSPC' ? error => error === original : { code: 'SDE_DISK_SPACE' });
    assert.deepEqual(await readdir(args.outputDir), []);
  }
});

test('slow writes finish and close their handle before cancellation removes the spool', async t => {
  const args = await setup(t), controller = new AbortController();
  let entered, release, closed = false, removed = false;
  const started = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const building = buildSde({ ...args, signal: controller.signal,
    openFile: async (...options) => {
      const handle = await open(...options);
      return { write: async (...values) => { entered(); await gate; return handle.write(...values); },
        datasync: () => handle.datasync(), stat: () => handle.stat(), close: async () => { await handle.close(); closed = true; } };
    },
    remove: async (...options) => { assert.equal(closed, true); removed = true; return rm(...options); },
  });
  building.catch(() => {});
  await started; controller.abort(); await Promise.resolve();
  assert.equal(removed, false); release();
  await assert.rejects(building, { name: 'AbortError' });
  assert.equal(closed, true); assert.equal(removed, true); assert.deepEqual(await readdir(args.outputDir), []);
});

test('external-memory budget is separate from V8 old generation and cleanup retains primary error', async t => {
  const args = await setup(t);
  const cleanupError = Object.assign(new Error('Locked spool'), { code: 'EPERM' });
  await assert.rejects(buildSde({ ...args, memoryUsage: () => ({ external: 2 ** 30 }), remove: async () => { throw cleanupError; } }), error => {
    assert.equal(error.code, 'SDE_EXTERNAL_MEMORY'); assert.deepEqual(error.cleanupErrors, [cleanupError]); return true;
  });
});

test('write and handle-close dual failures preserve the original disk-full error', async t => {
  for (const phase of ['spool', 'output']) {
    const args = await setup(t), writeError = Object.assign(new Error('Disk full'), { code: 'ENOSPC' }), closeError = new Error('Close failed');
    await assert.rejects(buildSde({ ...args, openFile: async (path, ...options) => {
      if ((phase === 'spool') === path.includes('.spool-')) return { write: async () => { throw writeError; }, writeFile: async () => { throw writeError; }, close: async () => { throw closeError; } };
      return open(path, ...options);
    } }), error => { assert.equal(error, writeError); assert.deepEqual(error.cleanupErrors, [closeError]); return true; });
    assert.deepEqual(await readdir(args.outputDir), []);
  }
});
