import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createDatasetService, prepareDatasetRuntime, commitDatasetRuntime, rollbackDatasetRuntime } from '../../server/datasets.mjs';

const BASE = 3503375, NEXT = BASE + 1;
const tick = () => new Promise(resolve => setImmediate(resolve));
function metadata(build = NEXT, headers = {}) {
  return new Response(JSON.stringify({ _key: 'sde', buildNumber: build, releaseDate: '2026-09-29T11:02:00Z' }) + '\n', { headers: { etag: '"sde-v1"', 'cache-control': 'max-age=300', ...headers } });
}
async function fixture({ outputDir, expectedBuild }) {
  await mkdir(outputDir, { recursive: true });
  const raw = {
    'universe.json.gz': gzipSync(JSON.stringify({ metadata: { build: expectedBuild } })),
    'universe-provenance.json': Buffer.from(JSON.stringify({ build: expectedBuild, releasedAt: '2026-09-29T11:02:00Z' })),
    'market-categories.json': Buffer.from(JSON.stringify({ build: expectedBuild, groups: [], volumes: {} })),
    'npc-market-owners.json': Buffer.from(JSON.stringify({ build: expectedBuild, corporations: [] })),
    'universe-details-000.bin': gzipSync('{}'),
  };
  const files = [];
  for (const [name, data] of Object.entries(raw)) {
    await writeFile(join(outputDir, name), data);
    files.push({ name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
  }
  return { schema: 1, build: expectedBuild, releasedAt: '2026-09-29T11:02:00Z', files };
}
async function managed(dataDir, build, pointer = 'active') {
  const directory = join(dataDir, 'datasets', `build-${build}-${randomUUID()}`);
  const manifest = await fixture({ outputDir: directory, expectedBuild: build });
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(dataDir, 'datasets', `${pointer}.json`), JSON.stringify({ schema: 1, directory: basename(directory), build }));
  return { directory, manifest, pending: pointer === 'pending' };
}
async function setup(t, overrides = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'kairo-datasets-'));
  let time = Date.parse('2026-09-29T10:59:00Z');
  const timers = new Map(), calls = [];
  let timerId = 0;
  const service = createDatasetService({ dataDir, now: () => time,
    setTimer: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, due: time + delay, delay }); return id; },
    clearTimer: id => timers.delete(id),
    fetcher: async (url, options) => { calls.push({ url, options }); return url.endsWith('latest.jsonl') ? metadata() : new Response('fake archive'); },
    build: fixture, ...overrides });
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  await service.ready;
  return { service, dataDir, calls, timers, advance: ms => { time += ms; }, runTimer: async () => { const [id, timer] = [...timers.entries()][0]; timers.delete(id); time = timer.due; timer.callback(); await tick(); } };
}

test('inventory distinguishes installed official builds from pinned supplemental datasets', async t => {
  const { service } = await setup(t);
  const status = service.status();
  assert.equal(status.datasets.find(row => row.id === 'universe').build, BASE);
  assert.equal(status.datasets.find(row => row.id === 'market-categories').build, 3494416);
  assert.equal(status.datasets.filter(row => row.automatic).length, 3);
  assert.equal(status.datasets.find(row => row.id === 'wormholes').automatic, false);
  assert.equal(status.schedule.intervalMinutes, 60);
});

test('a metadata-only check neither downloads nor installs; explicit install reuses cache', async t => {
  let selected;
  const { service, calls, dataDir } = await setup(t, { onReady: value => { selected = value; } });
  await service.check({ manual: true });
  assert.equal(calls.length, 1);
  assert.equal(service.status().available.build, NEXT);
  assert.equal(service.status().restartRequired, false);
  await service.install(); await tick();
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, new RegExp(`eve-online-static-data-${NEXT}-jsonl.zip$`));
  assert.equal(service.status().phase, 'ready');
  assert.equal(selected.manifest.build, NEXT);
  const entries = await readdir(join(dataDir, 'datasets'));
  assert.ok(entries.includes('pending.json'));
  assert.ok(!entries.some(name => name.endsWith('.zip') || name.startsWith('staging-')));
});

test('concurrent manual and automatic requests share one metadata request and one install', async t => {
  let release, fetches = 0, builds = 0;
  const blocked = new Promise(resolve => { release = resolve; });
  const { service } = await setup(t, { fetcher: async url => { fetches++; if (url.endsWith('latest.jsonl')) { await blocked; return metadata(); } return new Response('zip'); }, build: async options => { builds++; return fixture(options); } });
  const checking = service.check();
  const installing = service.install();
  release(); await Promise.all([checking, installing]);
  assert.equal(fetches, 2); assert.equal(builds, 1);
});

test('startup and recurring checks use one hourly deadline timer, no interval loop', async t => {
  const { service, timers, calls, runTimer } = await setup(t, { fetcher: async () => metadata(BASE - 1) });
  service.start(); service.start(); await tick();
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 1000);
  await runTimer(); await service.check();
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 3_600_000);
  await service.close(); assert.equal(timers.size, 0);
});

test('automatic=false disables scheduled requests but leaves manual checks available', async t => {
  const { service, timers, calls } = await setup(t, { automatic: false });
  service.start(); await tick();
  assert.equal(timers.size, 0); assert.equal(calls.length, 0);
  await service.check({ manual: true }); assert.equal(calls.length, 1);
});

test('cache validators persist across runs and 304 reuses the advertised build', async t => {
  const { service, dataDir, advance } = await setup(t);
  await service.check(); await service.close(); advance(300_001);
  let seen;
  const next = createDatasetService({ dataDir, now: () => Date.parse('2026-09-29T12:00:00Z'), automatic: false,
    fetcher: async (_url, options) => { seen = options.headers; return new Response(null, { status: 304 }); } });
  t.after(() => next.close());
  await next.ready; await next.check();
  assert.equal(seen['If-None-Match'], '"sde-v1"');
  assert.equal(next.status().available.build, NEXT);
  assert.equal(next.status().phase, 'idle');
});

test('five-minute minimum cache applies to manual checks and never downloads equal or older builds', async t => {
  let count = 0;
  const { service, advance } = await setup(t, { fetcher: async () => { count++; return metadata(BASE - 1, { 'cache-control': 'max-age=0' }); } });
  await service.check(); await service.install(); advance(299_999); await service.check({ manual: true });
  assert.equal(count, 1); assert.equal(service.status().available, null);
  advance(2); await service.install(); assert.equal(count, 2);
});

test('Retry-After and exponential backoff prevent retry storms even without cached metadata', async t => {
  let count = 0;
  const { service, advance } = await setup(t, { fetcher: async () => { count++; return new Response('', { status: 429, headers: { 'retry-after': '1800' } }); } });
  await service.check(); assert.match(service.status().error, /429/);
  await service.check({ manual: true }); advance(1_799_999); await service.check();
  assert.equal(count, 1);
  advance(2); await service.check(); assert.equal(count, 2);
});

test('a corrupt generated dataset leaves the active data and has no archive or staging debris', async t => {
  const { service, dataDir } = await setup(t, { build: async options => { const manifest = await fixture(options); await writeFile(join(options.outputDir, 'universe.json.gz'), 'wrong'); return manifest; } });
  await service.install();
  assert.equal(service.status().phase, 'error');
  assert.match(service.status().error, /Incomplete dataset|checksum/);
  const entries = await readdir(join(dataDir, 'datasets'));
  assert.ok(!entries.some(name => /^(build-|staging-|download-)/.test(name)));
  assert.ok(!entries.includes('pending.json'));
});

test('partial downloads and oversized archive responses never reach the builder', async t => {
  let built = false, request = 0;
  const { service } = await setup(t, { fetcher: async () => ++request === 1 ? metadata() : new Response('partial', { headers: { 'content-length': '100' } }), build: async () => { built = true; } });
  await service.install(); assert.equal(built, false); assert.match(service.status().error, /Incomplete SDE download/);
  const second = await setup(t, { fetcher: async url => url.endsWith('latest.jsonl') ? metadata() : new Response('too big', { headers: { 'content-length': String(513 * 1024 * 1024) } }) });
  await second.service.install(); assert.match(second.service.status().error, /512 MiB/);
});

test('close waits for cancelled building to stop before removing temporary files', async t => {
  let entered, aborted = false, workerFinished = false;
  const started = new Promise(resolve => { entered = resolve; });
  const { service, dataDir } = await setup(t, { build: (options, { signal }) => new Promise((resolve, reject) => {
    entered(); signal.addEventListener('abort', () => { aborted = true; setImmediate(async () => {
      await writeFile(join(options.outputDir, 'worker-final-write'), 'done'); workerFinished = true;
      reject(new DOMException('cancelled', 'AbortError'));
    }); }, { once: true });
  }) });
  const installing = service.install(); await started; await service.close(); await installing;
  assert.equal(aborted, true); assert.equal(workerFinished, true);
  assert.ok(!(await readdir(join(dataDir, 'datasets'))).some(name => name.startsWith('staging-') || name.endsWith('.zip')));
});

test('activation selects verified pending generation, commits atomically, and retires old files', async t => {
  const { service, dataDir } = await setup(t); await service.close();
  const old = await managed(dataDir, NEXT), candidate = await managed(dataDir, NEXT + 1, 'pending');
  await mkdir(join(dataDir, 'datasets', `staging-${randomUUID()}`));
  const selected = await prepareDatasetRuntime(dataDir);
  assert.equal(selected.directory, candidate.directory); assert.equal(selected.pending, true);
  assert.ok((await readdir(join(dataDir, 'datasets'))).includes(basename(old.directory)));
  await commitDatasetRuntime(dataDir, selected);
  const entries = await readdir(join(dataDir, 'datasets'));
  assert.ok(entries.includes(basename(candidate.directory)));
  assert.ok(!entries.includes(basename(old.directory))); assert.ok(!entries.includes('pending.json'));
  const active = await prepareDatasetRuntime(dataDir);
  assert.equal(active.directory, candidate.directory); assert.equal(active.pending, false);
});

test('invalid pending checksums fall back to active and clean the rejected generation', async t => {
  const { service, dataDir } = await setup(t); await service.close();
  const old = await managed(dataDir, NEXT), candidate = await managed(dataDir, NEXT + 1, 'pending');
  const file = join(candidate.directory, 'universe-details-000.bin');
  const content = await readFile(file); content[0] ^= 1; await writeFile(file, content);
  const selected = await prepareDatasetRuntime(dataDir);
  assert.equal(selected.directory, old.directory);
  assert.ok(!(await readdir(join(dataDir, 'datasets'))).includes(basename(candidate.directory)));
  const state = JSON.parse(await readFile(join(dataDir, 'datasets', 'state.json')));
  assert.equal(state.failedBuild, NEXT + 1);
});

test('rollback retains previous data and suppresses failed automatic updates until manual retry', async t => {
  const { service, dataDir } = await setup(t); await service.close();
  const old = await managed(dataDir, NEXT), candidate = await managed(dataDir, NEXT + 1, 'pending');
  const previous = await rollbackDatasetRuntime(dataDir, candidate);
  assert.equal(previous.directory, old.directory);
  let downloads = 0;
  const next = createDatasetService({ dataDir, automatic: false, build: fixture,
    fetcher: async url => { if (url.endsWith('latest.jsonl')) return metadata(NEXT + 1); downloads++; return new Response('zip'); } });
  t.after(() => next.close()); await next.ready;
  await next.check({ install: true }); assert.equal(downloads, 0);
  await next.install(); assert.equal(downloads, 1); assert.equal(next.status().phase, 'ready');
});

test('datasets older than the newer bundled baseline cannot override a new Kairo release', async t => {
  const { service, dataDir } = await setup(t); await service.close();
  await managed(dataDir, BASE - 1);
  assert.equal(await prepareDatasetRuntime(dataDir), null);
  assert.ok(!(await readdir(join(dataDir, 'datasets'))).some(name => name.startsWith('build-')));
});

test('activation refusal clears ready state and permits manual retry without deadlock', async t => {
  const { service, dataDir } = await setup(t, { onReady: async () => { throw new Error('Restart refused'); } });
  await service.install();
  await service.close();
  assert.equal(service.status().phase, 'error'); assert.match(service.status().error, /Restart refused/);
  assert.equal(service.status().restartRequired, false);
  assert.ok(!(await readdir(join(dataDir, 'datasets'))).includes('pending.json'));
});

test('one official build can catch older bundled components up without downgrading Universe', async t => {
  let downloads = 0;
  const { service } = await setup(t, { fetcher: async url => {
    if (url.endsWith('latest.jsonl')) return metadata(BASE);
    downloads++; return new Response('archive');
  } });
  await service.install();
  assert.equal(downloads, 1); assert.equal(service.status().phase, 'ready');
});

test('failed conversion is suppressed for automatic checks and may be retried manually', async t => {
  let builds = 0;
  const { service, advance } = await setup(t, { build: async () => { builds++; throw new Error('Unsupported SDE schema'); } });
  await service.check({ install: true }); assert.equal(builds, 1);
  advance(3_600_001); await service.check({ install: true }); assert.equal(builds, 1);
  await service.install(); assert.equal(builds, 2);
});

test('successful pointer publication is not rolled back when post-commit bookkeeping fails', async t => {
  const { service, dataDir } = await setup(t); await service.close();
  const candidate = await managed(dataDir, NEXT, 'pending');
  // Simulate an unwritable metadata target without platform-specific permission assumptions.
  await mkdir(join(dataDir, 'datasets', 'state.json'));
  await assert.doesNotReject(commitDatasetRuntime(dataDir, candidate));
  const active = JSON.parse(await readFile(join(dataDir, 'datasets', 'active.json')));
  assert.equal(active.build, NEXT);
  assert.equal((await prepareDatasetRuntime(dataDir)).directory, candidate.directory);
});
