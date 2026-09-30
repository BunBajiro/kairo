import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename, readdir, rm, stat } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Worker } from 'node:worker_threads';

const BUNDLED = fileURLToPath(new URL('./data/', import.meta.url));
const LATEST = 'https://developers.eveonline.com/static-data/tranquility/latest.jsonl';
const HOUR = 3_600_000, CACHE_MIN = 300_000, MAX_ARCHIVE = 512 * 1024 * 1024;
const BUILD_DIRECTORY = /^build-\d+-[a-f0-9-]{36}$/;
const DATA_FILE = /^(?:universe\.json\.gz|universe-provenance\.json|universe-details-\d{3}\.bin|market-categories\.json|npc-market-owners\.json)$/;
const REQUIRED_FILES = ['universe.json.gz', 'universe-provenance.json', 'market-categories.json', 'npc-market-owners.json'];
const iso = value => value == null ? null : new Date(value).toISOString();
const errorText = error => String(error?.message || error || 'Dataset update failed').slice(0, 400);
const rootFor = dataDir => join(resolve(dataDir), 'datasets');
const archiveUrl = build => `https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-${build}-jsonl.zip`;
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
async function optionalJson(file) { try { return await readJson(file); } catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; } }
async function atomicJson(file, value) {
  await mkdir(resolve(file, '..'), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, JSON.stringify(value)); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }).catch(() => {}); }
}
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
let bundledBaseline;
function baselineBuild() {
  return bundledBaseline ||= Promise.all(['universe-provenance.json', 'market-categories.json', 'npc-market-owners.json'].map(name => readJson(join(BUNDLED, name))))
    .then(rows => Math.max(...rows.map(row => Number(row.build))));
}
async function validateDirectory(directory, { hashes = false, minimumBuild = 0 } = {}) {
  const manifest = await readJson(join(directory, 'manifest.json'));
  if (manifest.schema !== 1 || !Number.isSafeInteger(manifest.build) || manifest.build < minimumBuild || !Array.isArray(manifest.files)) throw new Error('Invalid or outdated SDE generation');
  const names = new Set();
  let totalBytes = 0;
  if (manifest.files.length > 128) throw new Error('Too many dataset files');
  for (const file of manifest.files) {
    if (!DATA_FILE.test(file.name) || names.has(file.name) || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid SDE manifest');
    totalBytes += file.bytes;
    if (totalBytes > 512 * 1024 * 1024) throw new Error('SDE generation exceeds its size limit');
    names.add(file.name);
    const path = join(directory, file.name), info = await stat(path);
    if (!info.isFile() || info.size !== file.bytes) throw new Error(`Incomplete dataset: ${file.name}`);
    if (hashes && await sha256(path) !== file.sha256) throw new Error(`Dataset checksum mismatch: ${file.name}`);
  }
  if (REQUIRED_FILES.some(name => !names.has(name)) || ![...names].some(name => /^universe-details-/.test(name))) throw new Error('Incomplete SDE manifest');
  for (const name of ['universe-provenance.json', 'market-categories.json', 'npc-market-owners.json']) {
    if (Number((await readJson(join(directory, name))).build) !== manifest.build) throw new Error('Mixed SDE builds');
  }
  return manifest;
}
async function pointerSelection(root, name, minimumBuild, hashes = false) {
  const pointer = await optionalJson(join(root, `${name}.json`));
  if (!pointer) return null;
  if (!BUILD_DIRECTORY.test(pointer.directory || '')) throw new Error('Invalid SDE pointer');
  const directory = join(root, pointer.directory);
  const manifest = await validateDirectory(directory, { minimumBuild, hashes });
  if (manifest.build !== pointer.build) throw new Error('SDE pointer build mismatch');
  return { directory, manifest, pending: name === 'pending' };
}
async function markFailed(root, build, error) {
  const state = await optionalJson(join(root, 'state.json')) || {};
  await atomicJson(join(root, 'state.json'), { ...state, failedBuild: build || null, activationError: errorText(error) });
}
async function cleanup(root, keep = []) {
  const safe = new Set(keep.map(directory => basename(directory)));
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if ((BUILD_DIRECTORY.test(entry.name) && !safe.has(entry.name)) || /^staging-[a-f0-9-]{36}$/.test(entry.name) || /^download-[a-f0-9-]{36}\.zip$/.test(entry.name) || /\.json\.[a-f0-9-]{36}\.tmp$/.test(entry.name)) {
      await rm(join(root, entry.name), { recursive: true, force: true }).catch(() => {});
    }
  }
}

/** Select a complete generation before starting any consumers. The supervisor owns the directory lease. */
export async function prepareDatasetRuntime(dataDir) {
  const root = rootFor(dataDir), minimumBuild = await baselineBuild();
  await mkdir(root, { recursive: true });
  let active = null, pending = null;
  try { active = await pointerSelection(root, 'active', minimumBuild); }
  catch { await rm(join(root, 'active.json'), { force: true }); }
  try { pending = await pointerSelection(root, 'pending', Math.max(minimumBuild, active?.manifest.build || 0), true); }
  catch (error) {
    const pointer = await optionalJson(join(root, 'pending.json'));
    await markFailed(root, pointer?.build, error);
    await rm(join(root, 'pending.json'), { force: true });
  }
  if (pending && active && pending.manifest.build <= active.manifest.build) {
    await rm(join(root, 'pending.json'), { force: true }); pending = null;
  }
  await cleanup(root, [active?.directory, pending?.directory].filter(Boolean));
  return pending || active;
}

/** Publish only after the replacement core has reported ready, then retire all other downloaded versions. */
export async function commitDatasetRuntime(dataDir, selected) {
  if (!selected) return;
  const root = rootFor(dataDir), directory = resolve(selected.directory);
  if (directory !== join(root, basename(directory)) || !BUILD_DIRECTORY.test(basename(directory))) throw new Error('Invalid SDE activation directory');
  const manifest = await validateDirectory(directory, { minimumBuild: await baselineBuild() });
  await atomicJson(join(root, 'active.json'), { schema: 1, directory: basename(directory), build: manifest.build });
  // The pointer is committed. Housekeeping must not turn a successful activation into a rollback.
  await rm(join(root, 'pending.json'), { force: true }).catch(() => {});
  try {
    const state = await optionalJson(join(root, 'state.json')) || {};
    await atomicJson(join(root, 'state.json'), { ...state, failedBuild: null, activationError: null });
  } catch {}
  await cleanup(root, [directory]).catch(() => {});
}

export async function rollbackDatasetRuntime(dataDir, selected) {
  const root = rootFor(dataDir), minimumBuild = await baselineBuild();
  await markFailed(root, selected?.manifest?.build, 'The updated core could not start. The previous dataset was restored.');
  await rm(join(root, 'pending.json'), { force: true });
  let active = null;
  try { active = await pointerSelection(root, 'active', minimumBuild); } catch { await rm(join(root, 'active.json'), { force: true }); }
  if (active?.directory === selected?.directory) { await rm(join(root, 'active.json'), { force: true }); active = null; }
  await cleanup(root, active ? [active.directory] : []);
  return active;
}

async function inventory(directory, manifest) {
  const official = directory || BUNDLED;
  const [universe, markets, owners, wormholes, destinations, points] = await Promise.all([
    readJson(join(official, 'universe-provenance.json')), readJson(join(official, 'market-categories.json')),
    readJson(join(official, 'npc-market-owners.json')), readJson(join(BUNDLED, 'universe-wormholes.json')),
    readJson(join(BUNDLED, 'universe-destinations.json')), readJson(join(BUNDLED, 'universe-points.json')),
  ]);
  const sde = (id, name, data) => ({ id, name, provider: 'CCP Games', version: String(data.build), build: data.build,
    releasedAt: data.releasedAt || (data.build === universe.build ? universe.releasedAt : null) || null,
    updatedAt: manifest?.installedAt || null, automatic: true });
  const reference = (id, name, provider, revision) => ({ id, name, provider, version: revision?.slice(0, 12) || 'Bundled', build: null, releasedAt: null, updatedAt: null, automatic: false });
  return [sde('universe', 'Universe & celestial data', universe), sde('market-categories', 'Market categories & volumes', markets), sde('npc-market-owners', 'NPC market owners', owners),
    reference('wormholes', 'Wormhole classes, effects & statics', 'Wanderer', wormholes.metadata?.revision),
    reference('destinations', 'Destination references', 'Wanderer', destinations.sourceRevision),
    reference('points', 'Landmarks & historical references', 'SMT', points.metadata?.revision)];
}

function workerBuild(workerData, { signal, onProgress } = {}) {
  return new Promise((resolveResult, reject) => {
    const worker = new Worker(new URL('./sde-worker.mjs', import.meta.url), { workerData, resourceLimits: { maxOldGenerationSizeMb: 512 } });
    let result, failure, aborted = false;
    const abort = () => { aborted = true; void worker.terminate(); };
    signal?.addEventListener('abort', abort, { once: true });
    worker.on('message', message => {
      if (message.type === 'progress') onProgress?.(message.progress || message);
      else if (message.type === 'result') result = message.result || message.manifest;
      else if (message.type === 'error') failure = new Error(errorText(message.error));
    });
    worker.on('error', error => { failure = error; });
    worker.on('exit', code => {
      signal?.removeEventListener('abort', abort);
      if (aborted) reject(new DOMException('Dataset update cancelled', 'AbortError'));
      else if (failure) reject(failure);
      else if (code !== 0 || !result) reject(new Error('SDE worker exited before completing the dataset'));
      else resolveResult(result);
    });
    if (signal?.aborted) abort();
  });
}

async function boundedText(response, maximum, signal) {
  let bytes = 0, chunks = [];
  if (!response.body) throw new Error('Empty SDE metadata response');
  for await (const chunk of Readable.fromWeb(response.body, { signal })) {
    bytes += chunk.length;
    if (bytes > maximum) throw new Error('SDE metadata exceeds its size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
function latestRecord(text) {
  const record = text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)).find(row => row._key === 'sde');
  const build = Number(record?.buildNumber ?? record?.build);
  if (!Number.isSafeInteger(build) || build <= 0) throw new Error('CCP returned invalid SDE metadata');
  const releasedAt = record.releaseDate || record.releasedAt || null;
  return { build, releasedAt: releasedAt && Number.isFinite(Date.parse(releasedAt)) ? new Date(releasedAt).toISOString() : null };
}
function retryDelay(header, time) {
  const seconds = Number(header);
  const delay = header && Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header || '') - time;
  return Number.isFinite(delay) ? Math.min(86_400_000, Math.max(CACHE_MIN, delay)) : 0;
}

export function createDatasetService({ dataDir, fetcher = fetch, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  onChange = () => {}, onReady = () => {}, automatic = true, activeDirectory, build = workerBuild } = {}) {
  const root = rootFor(dataDir);
  let cache = {}, datasets = [], minimumBuild = 0, currentBuild = 0, oldestBuild = 0;
  let phase = 'idle', progress = null, error = null, available = null, timer, flight, activationFlight, controller, closed = false, started = false;
  let wantsInstall = false, wantsManual = false, nextCheck = null, readySelection = null, activeManifest = null;
  const status = () => ({ phase, busy: phase !== 'ready' && (!!flight || ['checking', 'downloading', 'building'].includes(phase)), datasets: datasets.map(value => ({ ...value })),
    available: available && { ...available }, lastCheckedAt: cache.lastCheckedAt || null, nextCheckAt: iso(nextCheck), error,
    progress: progress && { ...progress }, schedule: { intervalMinutes: 60, startup: true }, restartRequired: phase === 'ready' });
  const emit = () => { try { onChange(status()); } catch {} };
  const persist = () => atomicJson(join(root, 'state.json'), cache);
  const ready = (async () => {
    await mkdir(root, { recursive: true });
    cache = await optionalJson(join(root, 'state.json')) || {};
    minimumBuild = await baselineBuild();
    let directory = activeDirectory;
    if (directory && resolve(directory) !== resolve(BUNDLED)) activeManifest = await validateDirectory(directory, { minimumBuild });
    if (!directory) {
      try { const active = await pointerSelection(root, 'active', minimumBuild); directory = active?.directory; activeManifest = active?.manifest; } catch {}
    }
    datasets = await inventory(directory, activeManifest);
    currentBuild = Math.max(minimumBuild, ...datasets.filter(value => value.automatic).map(value => value.build || 0));
    oldestBuild = Math.min(...datasets.filter(value => value.automatic).map(value => value.build || 0));
    if (cache.latest?.build >= currentBuild && cache.latest.build > oldestBuild) available = cache.latest;
    if (cache.activationError) { phase = 'error'; error = cache.activationError; }
    emit();
  })();
  function schedule(delay = HOUR) {
    if (timer) clearTimer(timer);
    timer = null;
    if (closed || !started || !automatic || phase === 'ready') { nextCheck = null; return; }
    nextCheck = Math.max(now() + delay, Number(cache.notBefore) || 0);
    timer = setTimer(() => { timer = null; nextCheck = null; void check({ install: true }).catch(() => {}); }, Math.max(0, nextCheck - now()));
    timer?.unref?.();
  }
  async function download(candidate, signal) {
    const id = randomUUID(), archivePath = join(root, `download-${id}.zip`), outputDir = join(root, `staging-${id}`);
    let finalDirectory;
    try {
      phase = 'downloading'; progress = { stage: 'downloading', message: 'Downloading the official SDE', receivedBytes: 0 }; emit();
      const response = await fetcher(archiveUrl(candidate.build), { signal: AbortSignal.any([signal, AbortSignal.timeout(30 * 60_000)]), redirect: 'error', headers: { 'User-Agent': 'Kairo/0.8 SDE updater' } });
      if (!response.ok) throw new Error(`SDE download returned HTTP ${response.status}`);
      const length = Number(response.headers.get('content-length')) || 0;
      if (length > MAX_ARCHIVE) throw new Error('SDE archive exceeds the 512 MiB size limit');
      if (!response.body) throw new Error('Empty SDE download');
      let bytes = 0, lastProgress = 0;
      const limiter = new Transform({ transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > MAX_ARCHIVE) { callback(new Error('SDE archive exceeds the 512 MiB size limit')); return; }
        if (now() - lastProgress >= 500) { lastProgress = now(); progress = { stage: 'downloading', message: 'Downloading the official SDE', receivedBytes: bytes, ...(length ? { totalBytes: length, percent: Math.min(100, Math.round(bytes * 100 / length)) } : {}) }; emit(); }
        callback(null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(archivePath, { flags: 'wx' }), { signal });
      if (!bytes || (length && bytes !== length)) throw new Error('Incomplete SDE download');
      phase = 'building'; progress = { stage: 'building', message: 'Preparing and validating the new dataset' }; emit();
      await mkdir(outputDir);
      const manifest = await build({ archivePath, outputDir, expectedBuild: candidate.build }, { signal, onProgress: value => {
        if (closed) return;
        const messages = { validating: 'Validating the official archive', converting: 'Preparing Universe and market data', verifying: 'Verifying the completed dataset' };
        progress = { stage: 'building', message: value.message || messages[value.phase] || 'Preparing dataset',
          ...(Number.isFinite(value.percent) ? { percent: value.percent } : value.total > 0 ? { percent: Math.round(value.completed * 100 / value.total) } : {}) }; emit();
      } });
      signal.throwIfAborted();
      if (manifest?.build !== candidate.build) throw new Error('Downloaded SDE build does not match the advertised build');
      manifest.installedAt = iso(now());
      await atomicJson(join(outputDir, 'manifest.json'), manifest);
      await validateDirectory(outputDir, { minimumBuild: Math.max(minimumBuild, currentBuild), hashes: true });
      signal.throwIfAborted();
      finalDirectory = join(root, `build-${candidate.build}-${id}`);
      await rename(outputDir, finalDirectory);
      await atomicJson(join(root, 'pending.json'), { schema: 1, directory: basename(finalDirectory), build: candidate.build });
      readySelection = { directory: finalDirectory, manifest, pending: true };
      phase = 'ready'; progress = null; error = null; emit();
      // Never await the supervisor: it must be able to close this service before restarting the core.
      Promise.resolve().then(() => onReady(readySelection)).catch(cause => { void activationFailed(errorText(cause)).catch(() => {}); });
    } catch (cause) {
      if (phase === 'building' && cause?.name !== 'AbortError' && !closed) {
        cache.failedBuild = candidate.build;
        await persist().catch(() => {});
      }
      if (finalDirectory && phase !== 'ready') await rm(finalDirectory, { recursive: true, force: true });
      throw cause;
    } finally {
      // Worker cancellation has completed before build() rejects, so it cannot recreate deleted files.
      await rm(archivePath, { force: true }).catch(() => {});
      await rm(outputDir, { recursive: true, force: true }).catch(() => {});
    }
  }
  function check({ install = false, manual = false } = {}) {
    wantsInstall ||= install; wantsManual ||= manual;
    if (flight) return flight;
    if (closed || phase === 'ready') return Promise.resolve(status());
    phase = 'checking'; error = null; progress = null; emit();
    flight = (async () => {
      await ready;
      if (closed || phase === 'ready') return status();
      controller = new AbortController();
      if (timer) clearTimer(timer); timer = null; nextCheck = null;
      phase = 'checking'; error = null; progress = null; emit();
      try {
        if (now() >= (cache.notBefore || 0)) {
          const headers = { 'Accept': 'application/jsonl, application/json', 'User-Agent': 'Kairo/0.8 SDE updater' };
          if (cache.etag) headers['If-None-Match'] = cache.etag;
          if (cache.lastModified) headers['If-Modified-Since'] = cache.lastModified;
          const response = await fetcher(LATEST, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]), redirect: 'error', headers });
          cache.lastCheckedAt = iso(now());
          if (response.status === 429 || response.status === 503) {
            const delay = retryDelay(response.headers.get('retry-after'), now());
            cache.notBefore = now() + Math.max(delay, CACHE_MIN);
            throw new Error(`CCP SDE service is temporarily unavailable (HTTP ${response.status})`);
          }
          if (response.status === 304) {
            if (!cache.latest) throw new Error('CCP returned 304 without cached SDE metadata');
          } else {
            if (!response.ok) throw new Error(`SDE check returned HTTP ${response.status}`);
            cache.latest = latestRecord(await boundedText(response, 128 * 1024, controller.signal));
            cache.etag = response.headers.get('etag') || null;
            cache.lastModified = response.headers.get('last-modified') || null;
          }
          const maxAge = Number(response.headers.get('cache-control')?.match(/(?:^|,)\s*max-age=(\d+)/i)?.[1]) * 1000;
          const age = (Number(response.headers.get('age')) || 0) * 1000;
          cache.notBefore = now() + Math.max(CACHE_MIN, Math.min(HOUR, (maxAge || CACHE_MIN) - age));
          cache.failures = 0;
          await persist();
        }
        available = cache.latest?.build >= currentBuild && cache.latest.build > oldestBuild ? { ...cache.latest } : null;
        if (available && wantsInstall && (wantsManual || cache.failedBuild !== available.build)) await download(available, controller.signal);
        else { phase = 'idle'; progress = null; }
      } catch (cause) {
        if (closed || cause?.name === 'AbortError') { phase = 'idle'; progress = null; }
        else {
          phase = 'error'; progress = null; error = errorText(cause);
          cache.failures = Math.min(10, (cache.failures || 0) + 1);
          cache.notBefore = Math.max(cache.notBefore || 0, now() + Math.min(6 * HOUR, CACHE_MIN * 2 ** (cache.failures - 1)));
          await persist().catch(() => {});
        }
      } finally {
        controller = null;
        schedule(phase === 'error' ? Math.max(CACHE_MIN, (cache.notBefore || 0) - now()) : HOUR);
        emit();
      }
      return status();
    })().finally(() => { flight = null; wantsInstall = false; wantsManual = false; emit(); });
    return flight;
  }
  function activationFailed(message) {
    if (activationFlight) return activationFlight;
    if (closed) return Promise.resolve();
    activationFlight = (async () => {
      const failedBuild = readySelection?.manifest?.build;
      if (failedBuild) cache.failedBuild = failedBuild;
      try {
        if (readySelection) await rollbackDatasetRuntime(dataDir, readySelection);
        cache = await optionalJson(join(root, 'state.json')) || cache;
      } finally {
        readySelection = null; phase = 'error'; progress = null; error = errorText(message);
        schedule(); emit();
      }
    })().finally(() => { activationFlight = null; });
    return activationFlight;
  }
  function start() {
    if (started || closed) return;
    started = true;
    void ready.then(() => { if (!closed) { schedule(1_000); emit(); } }).catch(cause => { error = errorText(cause); phase = 'error'; emit(); });
  }
  async function close() {
    closed = true; if (timer) clearTimer(timer); timer = null; nextCheck = null;
    controller?.abort();
    await flight?.catch(() => {});
    await activationFlight?.catch(() => {});
  }
  return { ready, status, check, install: () => check({ install: true, manual: true }), start, close, activationFailed };
}
