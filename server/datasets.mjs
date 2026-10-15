import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename, readdir, rm, stat, lstat } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Worker } from 'node:worker_threads';
import { sdeLimits, sdeLimitError, requireDatasetSpace, availableDatasetBytes } from './sde-limits.mjs';

const BUNDLED = fileURLToPath(new URL('./data/', import.meta.url));
const LATEST = 'https://developers.eveonline.com/static-data/tranquility/latest.jsonl';
const HOUR = 3_600_000, CACHE_MIN = 300_000, MAX_ARCHIVE = 512 * 1024 * 1024;
const BUILD_DIRECTORY = /^build-\d+-[a-f0-9-]{36}$/;
const DATA_FILE = /^(?:universe\.json\.gz|universe-provenance\.json|universe-details-\d{3}\.bin|market-categories\.json|npc-market-owners\.json)$/;
const REQUIRED_FILES = ['universe.json.gz', 'universe-provenance.json', 'market-categories.json', 'npc-market-owners.json'];
const REJECTED_GENERATION = /^activation-rejected-(build-\d+-[a-f0-9-]{36})\.json$/;
const iso = value => value == null ? null : new Date(value).toISOString();
const errorText = error => String(error?.message || error || 'Dataset update failed').slice(0, 400);
const rootFor = dataDir => join(resolve(dataDir), 'datasets');
const rejectionPath = (root, directory) => join(root, `activation-rejected-${basename(directory)}.json`);
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
  await requireUnrejected(root, directory);
  const manifest = await validateDirectory(directory, { minimumBuild, hashes });
  if (manifest.build !== pointer.build) throw new Error('SDE pointer build mismatch');
  return { directory, manifest, pending: name === 'pending' };
}
async function requireUnrejected(root, directory) {
  // Presence always rejects this UUID. A readable cancellation disposition only
  // permits preparing a fresh generation; unreadable/truncated records fail closed.
  const marker = rejectionPath(root, directory);
  try { await lstat(marker); }
  catch (cause) {
    if (cause.code === 'ENOENT') return;
    throw Object.assign(new Error(`Could not check dataset activation rejection: ${errorText(cause)}`, { cause }), { code: 'SDE_REJECTION_UNREADABLE' });
  }
  const record = await optionalJson(marker).catch(() => null);
  if (record?.disposition === 'cancelled') throw Object.assign(new Error('This dataset preparation was cancelled.'), { code: 'SDE_GENERATION_CANCELLED' });
  throw Object.assign(new Error('This dataset generation previously failed activation. A manual retry must prepare a fresh generation.'), { code: 'SDE_GENERATION_REJECTED' });
}
async function markFailed(root, build, error) {
  const state = await optionalJson(join(root, 'state.json')) || {};
  await atomicJson(join(root, 'state.json'), { ...state, failedBuild: build || null, activationError: errorText(error) });
}
async function readCleanupWarning(root, now = Date.now) {
  try { return await optionalJson(join(root, 'cleanup.json')); }
  catch (cause) { return { message: 'Dataset cleanup status could not be read. Check file permissions; the installed dataset remains available.', failedAt: iso(now()), count: 1,
    failures: [{ path: 'cleanup.json', code: cause?.code || 'CLEANUP_STATUS_FAILED', message: errorText(cause) }] }; }
}
async function cleanup(root, keep = [], { remove = rm, paths, extraPaths = [], now = Date.now } = {}) {
  const safe = new Set(keep.map(directory => basename(directory)));
  const previous = await optionalJson(join(root, 'cleanup.json')).catch(() => null);
  const failures = new Map((Array.isArray(previous?.failures) ? previous.failures : []).map(value => [value.path, value]));
  const failed = (path, cause) => failures.set(path, { path, code: cause?.code || 'CLEANUP_FAILED', message: errorText(cause) });
  let candidates = paths, rejectionMarkers = [];
  if (!candidates) {
    try {
      const entries = (await readdir(root, { withFileTypes: true })).map(entry => entry.name);
      rejectionMarkers = entries.filter(name => REJECTED_GENERATION.test(name));
      candidates = entries.filter(name =>
        (BUILD_DIRECTORY.test(name) && !safe.has(name)) || /^staging-[a-f0-9-]{36}$/.test(name) || /^download-[a-f0-9-]{36}\.zip$/.test(name) || /\.json\.[a-f0-9-]{36}\.tmp$/.test(name));
      // A full scan supersedes warnings for already removed or newly protected paths.
      failures.clear();
    } catch (cause) { failed('.', cause); candidates = []; }
  }
  for (const name of [...candidates, ...extraPaths]) {
    if (safe.has(name)) continue;
    try { await remove(join(root, name), { recursive: true, force: true }); failures.delete(name); }
    catch (cause) { failed(name, cause); }
  }
  // Recursive removal may delete some payload files before failing. Keep the
  // external rejection record until the entire failed directory is gone.
  for (const name of rejectionMarkers) {
    const directory = name.match(REJECTED_GENERATION)[1];
    try { await lstat(join(root, directory)); }
    catch (cause) {
      if (cause.code !== 'ENOENT') { failed(name, cause); continue; }
      try { await remove(join(root, name), { recursive: true, force: true }); failures.delete(name); }
      catch (error) { failed(name, error); }
    }
  }
  const warning = failures.size ? { message: 'Some old dataset files could not be removed. Check free disk space and file permissions; Kairo retries cleanup at the next update check or restart.',
    failedAt: iso(now()), count: failures.size, failures: [...failures.values()].slice(0, 32) } : null;
  try {
    if (warning) await atomicJson(join(root, 'cleanup.json'), warning);
    else await rm(join(root, 'cleanup.json'), { force: true });
  } catch (cause) {
    const persistence = { path: 'cleanup.json', code: cause?.code || 'CLEANUP_STATUS_FAILED', message: errorText(cause) };
    // Activation already succeeded; report housekeeping failure without rolling it back.
    console.warn(`Kairo dataset cleanup status could not be saved: ${errorText(cause)}`);
    return { ...(warning || { message: 'Dataset cleanup status could not be saved. Check disk space and file permissions.', failedAt: iso(now()), count: 0, failures: [] }), persistence };
  }
  return warning;
}

/** Select a complete generation before starting any consumers. The supervisor owns the directory lease. */
export async function prepareDatasetRuntime(dataDir, maintenance = {}) {
  const root = rootFor(dataDir), minimumBuild = await baselineBuild();
  await mkdir(root, { recursive: true });
  let active = null, pending = null;
  const pointerCleanup = [];
  try { active = await pointerSelection(root, 'active', minimumBuild); }
  catch (error) {
    if (error.code === 'SDE_REJECTION_UNREADABLE') throw error;
    pointerCleanup.push('active.json');
  }
  try { pending = await pointerSelection(root, 'pending', Math.max(minimumBuild, active?.manifest.build || 0), true); }
  catch (error) {
    const pointer = await optionalJson(join(root, 'pending.json'));
    if (error.code !== 'SDE_GENERATION_CANCELLED') await markFailed(root, pointer?.build, error);
    pointerCleanup.push('pending.json');
  }
  if (pending && active && pending.manifest.build <= active.manifest.build) {
    pointerCleanup.push('pending.json'); pending = null;
  }
  await cleanup(root, [active?.directory, pending?.directory].filter(Boolean), { ...maintenance, extraPaths: pointerCleanup });
  return pending || active;
}

/** Publish only after the replacement core has reported ready, then retire all other downloaded versions. */
export async function commitDatasetRuntime(dataDir, selected, maintenance = {}) {
  if (!selected) return;
  const root = rootFor(dataDir), directory = resolve(selected.directory);
  if (directory !== join(root, basename(directory)) || !BUILD_DIRECTORY.test(basename(directory))) throw new Error('Invalid SDE activation directory');
  await requireUnrejected(root, directory);
  const manifest = await validateDirectory(directory, { minimumBuild: await baselineBuild() });
  await atomicJson(join(root, 'active.json'), { schema: 1, directory: basename(directory), build: manifest.build });
  // The pointer is committed. Housekeeping must not turn a successful activation into a rollback.
  try {
    const state = await optionalJson(join(root, 'state.json')) || {};
    await atomicJson(join(root, 'state.json'), { ...state, failedBuild: null, activationError: null });
  } catch (cause) { console.warn(`Kairo dataset activation status could not be saved: ${errorText(cause)}`); }
  return { cleanupWarning: await cleanup(root, [directory], { ...maintenance, extraPaths: ['pending.json'] }) };
}

export async function rollbackDatasetRuntime(dataDir, selected, maintenance = {}) {
  const root = rootFor(dataDir), minimumBuild = await baselineBuild();
  const directory = typeof selected?.directory === 'string' ? resolve(selected.directory) : '';
  if (directory !== join(root, basename(directory)) || !BUILD_DIRECTORY.test(basename(directory))) throw new Error('Invalid SDE rollback directory');
  // Record rejection before touching pointers. If removal is locked, subsequent
  // preparation still cannot activate this UUID. A new manual attempt has a new
  // directory. The marker lives outside recursive payload cleanup and is retired
  // only after that directory is confirmed absent.
  await atomicJson(rejectionPath(root, directory), { schema: 1, build: selected.manifest?.build || null, error: 'The updated core could not start.' });
  await markFailed(root, selected.manifest?.build, 'The updated core could not start. The failed generation will not be activated again.');
  const pointerCleanup = ['pending.json'];
  let active = null;
  try { active = await pointerSelection(root, 'active', minimumBuild); }
  catch (error) { if (error.code === 'SDE_REJECTION_UNREADABLE') throw error; pointerCleanup.push('active.json'); }
  const cleanupWarning = await cleanup(root, active ? [active.directory] : [], { ...maintenance, extraPaths: pointerCleanup });
  maintenance.onCleanupWarning?.(cleanupWarning);
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

export function workerBuild(workerData, { signal, onProgress, createWorker = (url, options) => new Worker(url, options), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  return new Promise((resolveResult, reject) => {
    const limits = sdeLimits(workerData.limits);
    const worker = createWorker(new URL('./sde-worker.mjs', import.meta.url), { workerData: { ...workerData, limits }, resourceLimits: { maxOldGenerationSizeMb: 512 } });
    let result, failure, aborted = false, terminating = false, progressTimer;
    const terminate = () => { if (!terminating) { terminating = true; void worker.terminate().catch(error => { failure ||= error; }); } };
    const abort = () => { aborted = true; terminate(); };
    const fail = (code, message) => { failure ||= sdeLimitError(code, message); terminate(); };
    const conversionTimer = setTimer(() => fail('SDE_CONVERSION_TIMEOUT', 'Dataset conversion exceeded its 20-minute time budget'), limits.conversionMs);
    const progressing = () => {
      clearTimer(progressTimer);
      progressTimer = setTimer(() => fail('SDE_NO_PROGRESS', 'Dataset conversion made no progress within its 2-minute limit'), limits.noProgressMs);
    };
    progressing();
    signal?.addEventListener('abort', abort, { once: true });
    worker.on('message', message => {
      if (terminating) return;
      if (message.type === 'progress') { progressing(); onProgress?.(message.progress || message); }
      else if (message.type === 'result') result = message.result || message.manifest;
      else if (message.type === 'error') failure = Object.assign(new Error(errorText(message.error)), { code: message.error?.code });
    });
    worker.on('error', error => { failure = error; });
    worker.on('exit', code => {
      clearTimer(conversionTimer); clearTimer(progressTimer);
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
  onChange = () => {}, onReady = () => {}, automatic = true, activeDirectory, build = workerBuild,
  limits: limitOverrides, readAvailable = availableDatasetBytes, remove = rm } = {}) {
  const root = rootFor(dataDir);
  const limits = sdeLimits(limitOverrides);
  let cache = {}, datasets = [], minimumBuild = 0, currentBuild = 0, oldestBuild = 0;
  let cleanupWarning = null, maintenanceAt = now();
  let phase = 'idle', progress = null, error = null, available = null, timer, flight, activationFlight, controller, closed = false, started = false;
  let wantsInstall = false, wantsManual = false, nextCheck = null, readySelection = null, activeManifest = null, startFlight;
  const status = () => ({ phase, busy: phase !== 'ready' && (!!flight || ['checking', 'downloading', 'building'].includes(phase)), datasets: datasets.map(value => ({ ...value })),
    available: available && { ...available }, lastCheckedAt: cache.lastCheckedAt || null, nextCheckAt: iso(nextCheck), error,
    cleanupWarning: cleanupWarning && structuredClone(cleanupWarning),
    progress: progress && { ...progress }, schedule: { intervalMinutes: 60, startup: true }, restartRequired: phase === 'ready' });
  const emit = () => { try { onChange(status()); } catch {} };
  const persist = () => atomicJson(join(root, 'state.json'), cache);
  const ready = (async () => {
    await mkdir(root, { recursive: true });
    cache = await optionalJson(join(root, 'state.json')) || {};
    cleanupWarning = await readCleanupWarning(root, now);
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
    let finalDirectory, pendingPublished = false;
    try {
      // Reserve the worst-case remaining archive/stage footprint before starting. This is
      // advisory against other writers; subsequent writes and ENOSPC still fail safely.
      await requireDatasetSpace(root, MAX_ARCHIVE + limits.spoolBytes + limits.outputBytes + limits.reserveBytes, readAvailable);
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
      const manifest = await build({ archivePath, outputDir, expectedBuild: candidate.build, limits }, { signal, onProgress: value => {
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
      signal.throwIfAborted();
      await atomicJson(join(root, 'pending.json'), { schema: 1, directory: basename(finalDirectory), build: candidate.build });
      pendingPublished = true;
      signal.throwIfAborted();
      readySelection = { directory: finalDirectory, manifest, pending: true };
      phase = 'ready'; progress = null; error = null; emit();
      // Never await the supervisor: it must be able to close this service before restarting the core.
      Promise.resolve().then(() => onReady(readySelection)).catch(cause => { void activationFailed(errorText(cause)).catch(() => {}); });
    } catch (cause) {
      if (pendingPublished && cause?.name === 'AbortError') {
        // A locked pointer/payload must not make a cancelled generation eligible
        // on restart. The existing rejection record outlives partial cleanup.
        await atomicJson(rejectionPath(root, finalDirectory), { schema: 1, build: candidate.build, disposition: 'cancelled' });
      }
      if (phase === 'building' && cause?.name !== 'AbortError' && !closed) {
        cache.failedBuild = candidate.build;
        await persist().catch(() => {});
      }
      throw cause;
    } finally {
      // Worker cancellation has completed before build() rejects, so it cannot recreate deleted files.
      cleanupWarning = await cleanup(root, [], { remove, now, paths: [basename(archivePath), basename(outputDir), ...(finalDirectory && phase !== 'ready' ? [basename(finalDirectory)] : []), ...(pendingPublished && phase !== 'ready' ? ['pending.json'] : [])] });
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
        // Crash leftovers are handled by the supervisor before readers start. Retry
        // known failures here; ordinary cached checks must not rescan the directory.
        if (cleanupWarning || now() - maintenanceAt >= HOUR) {
          maintenanceAt = now();
          cleanupWarning = await readCleanupWarning(root, now) || cleanupWarning;
          if (cleanupWarning) {
            const names = ['active', 'pending'];
            const pointers = await Promise.all(names.map(name => optionalJson(join(root, `${name}.json`))));
            const keep = [activeDirectory].filter(Boolean), rejectedPointers = [];
            for (const [index, pointer] of pointers.entries()) {
              if (!BUILD_DIRECTORY.test(pointer?.directory || '')) continue;
              try { await requireUnrejected(root, pointer.directory); keep.push(pointer.directory); }
              catch (cause) {
                if (!['SDE_GENERATION_REJECTED', 'SDE_GENERATION_CANCELLED'].includes(cause.code)) throw cause;
                rejectedPointers.push(`${names[index]}.json`);
              }
            }
            const samePointer = pointers[0]?.directory && pointers[0].directory === pointers[1]?.directory;
            cleanupWarning = await cleanup(root, keep, { remove, now, extraPaths: [...rejectedPointers, ...(samePointer ? ['pending.json'] : [])] });
          }
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
      let failureMessage = errorText(message), rollbackWarning;
      if (failedBuild) cache.failedBuild = failedBuild;
      try {
        if (readySelection) await rollbackDatasetRuntime(dataDir, readySelection, { remove, now, onCleanupWarning: value => { rollbackWarning = value; } });
        cache = await optionalJson(join(root, 'state.json')) || cache;
      } catch (cause) {
        failureMessage = `Dataset recovery failed: ${errorText(cause)}. Original activation failure: ${failureMessage}`;
        throw cause;
      } finally {
        cleanupWarning = rollbackWarning === undefined ? await readCleanupWarning(root, now) : rollbackWarning;
        readySelection = null; phase = 'error'; progress = null; error = errorText(failureMessage);
        schedule(); emit();
      }
    })().finally(() => { activationFlight = null; });
    return activationFlight;
  }
  function start() {
    if (started || closed) return startFlight;
    started = true;
    // The supervisor commits after this child reports ready. Refresh the advisory
    // status at activation so retirement errors appear immediately in this runtime.
    startFlight = ready.then(async () => { cleanupWarning = await readCleanupWarning(root, now); if (!closed) { schedule(1_000); emit(); } })
      .catch(cause => { error = errorText(cause); phase = 'error'; emit(); });
    return startFlight;
  }
  async function close() {
    closed = true; if (timer) clearTimer(timer); timer = null; nextCheck = null;
    controller?.abort();
    await startFlight;
    await flight?.catch(() => {});
    await activationFlight?.catch(() => {});
  }
  return { ready, status, check, install: () => check({ install: true, manual: true }), start, close, activationFailed };
}
