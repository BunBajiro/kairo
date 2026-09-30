/** Internal RC16 checkpoint only; never included in a review/release build.
 * node analysis/rc16/harness/updater-bench.mjs light
 * node analysis/rc16/harness/updater-bench.mjs archive /absolute/CCP.zip 3552227
 * node analysis/rc16/harness/updater-bench.mjs abort /absolute/CCP.zip 3552227
 * Local archive streaming measures disk/worker cost, not Internet download time.
 */
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdtemp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir, cpus } from 'node:os';
import { join, basename } from 'node:path';
import { Readable } from 'node:stream';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { createDatasetService, prepareDatasetRuntime, commitDatasetRuntime } from '../../../server/datasets.mjs';

const mode = process.argv[2] || 'light';
const dataDir = await mkdtemp(join(tmpdir(), 'kairo-rc16-updater-'));
const output = { schema: 1, generatedAt: new Date().toISOString(), mode,
  environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model },
  notes: ['Analysis-only harness; production modules are imported without modification.', 'Timings are local elapsed and process CPU. RSS includes worker threads; JS heap snapshots report the main thread.', 'Event-loop delay uses a 5 ms histogram; memory sampled every 100 ms; disk every 1000 ms (sampled peaks are lower bounds).'], measurements: [] };
let service;
const tick = () => new Promise(resolve => setImmediate(resolve));
const metadata = build => new Response(JSON.stringify({ _key: 'sde', buildNumber: build, releaseDate: '2026-09-29T11:00:00Z' }) + '\n', { headers: { etag: '"analysis-sde"', 'cache-control': 'max-age=300' } });
async function tree(directory, prefix = '') {
  const rows = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const file = join(directory, entry.name), name = prefix + entry.name;
    if (entry.isDirectory()) rows.push(...await tree(file, `${name}/`));
    else if (entry.isFile()) { const info = await stat(file).catch(() => null); if (info) rows.push({ name, bytes: info.size }); }
  }
  return rows;
}
async function measure(label, callback) {
  await tick();
  const delay = monitorEventLoopDelay({ resolution: 5 }); delay.enable();
  const rssBefore = process.memoryUsage().rss, cpu = process.cpuUsage(), utilization = performance.eventLoopUtilization(), begin = performance.now();
  let peakRss = rssBefore, peakHeap = process.memoryUsage().heapUsed, peakDisk = 0, diskFlight = null, diskSamples = 0;
  const sample = setInterval(() => { const memory = process.memoryUsage(); peakRss = Math.max(peakRss, memory.rss); peakHeap = Math.max(peakHeap, memory.heapUsed); }, 100);
  const disk = setInterval(() => { if (!diskFlight) diskFlight = tree(dataDir).then(rows => { peakDisk = Math.max(peakDisk, rows.reduce((sum,row) => sum + row.bytes, 0)); diskSamples++; }).finally(() => { diskFlight = null; }); }, 1000);
  let result;
  try { result = await callback(); }
  finally {
    const elapsed = performance.now() - begin, used = process.cpuUsage(cpu), elu = performance.eventLoopUtilization(utilization);
    clearInterval(sample); clearInterval(disk); delay.disable(); await diskFlight;
    const memory = process.memoryUsage(), files = await tree(dataDir);
    output.measurements.push({ label, elapsedMs: elapsed, cpuUserMs: used.user / 1000, cpuSystemMs: used.system / 1000,
      eventLoop: { activeMs: elu.active, idleMs: elu.idle, utilization: elu.utilization, delayMeanMs: Number.isFinite(delay.mean) ? delay.mean / 1e6 : null, delayP99Ms: delay.count ? delay.percentile(99) / 1e6 : null, delayMaxMs: delay.count ? delay.max / 1e6 : null, samples: delay.count },
      memory: { rssBefore, rssAfter: memory.rss, peakRss: Math.max(peakRss, memory.rss), peakMainHeapUsed: Math.max(peakHeap, memory.heapUsed), processMaxRssKiB: process.resourceUsage().maxRSS },
      disk: { finalBytes: files.reduce((sum,row) => sum + row.bytes, 0), sampledPeakBytes: Math.max(peakDisk, files.reduce((sum,row) => sum + row.bytes, 0)), samples: diskSamples }, result });
  }
  return result;
}

try {
  if (mode === 'light') {
    let clock = Date.parse('2026-09-30T12:00:00Z'), fetches = 0, changes = 0, timerSerial = 0;
    const timers = new Map(), observed = [];
    await measure('bundled_inventory_first_service', async () => {
      service = createDatasetService({ dataDir, now: () => clock,
        setTimer: (callback, ms) => { const id = ++timerSerial; timers.set(id, { callback, ms }); return id; }, clearTimer: id => timers.delete(id),
        onChange: () => changes++, fetcher: async (_url, options) => { fetches++; observed.push(options.headers); return fetches === 1 ? metadata(1) : new Response(null, { status: 304 }); } });
      await service.ready; return { datasets: service.status().datasets };
    });
    await measure('100_concurrent_metadata_checks', async () => { const before = fetches; await Promise.all(Array.from({ length: 100 }, () => service.check())); assert.equal(fetches - before, 1); return { requests: fetches - before }; });
    await measure('1000_cached_manual_checks', async () => { const before = fetches, emitted = changes; for (let n = 0; n < 1000; n++) await service.check({ manual: true }); assert.equal(fetches, before); return { requests: fetches - before, statusEmissions: changes - emitted }; });
    await measure('24_hours_scheduler_simulation', async () => {
      const before = fetches; clock += 300_000; service.start(); await tick();
      assert.equal(timers.size, 1); assert.equal([...timers.values()][0].ms, 1000);
      const delays = [];
      for (let n = 0; n < 25; n++) {
        assert.equal(timers.size, 1); const [id, timer] = [...timers][0]; timers.delete(id);
        clock += timer.ms; delays.push(timer.ms); timer.callback(); await service.check();
      }
      assert.equal(fetches - before, 25);
      return { note: 'Clock advanced; this is an operation-count check, not a 24-hour idle CPU measurement.', requests: fetches - before, firedTimers: delays.length, delaysMs: delays, remainingTimers: timers.size, conditionalHeaders: observed.at(-1) };
    });
    await service.close(); assert.equal(timers.size, 0); service = null;
    const readyTimes = [];
    await measure('bundled_inventory_20_services_warm_process', async () => {
      for (let n = 0; n < 20; n++) { const begin = performance.now(); const current = createDatasetService({ dataDir, automatic: false }); await current.ready; readyTimes.push(performance.now() - begin); await current.close(); }
      return { timesMs: readyTimes };
    });
  } else if (mode === 'archive' || mode === 'abort') {
    const archivePath = process.argv[3], build = Number(process.argv[4]);
    assert.ok(archivePath && Number.isSafeInteger(build));
    const archiveBytes = (await stat(archivePath)).size;
    let requests = 0, reachedBuild, resolveBuild;
    const building = new Promise(resolve => { resolveBuild = resolve; });
    const phases = [], begin = performance.now();
    await measure('bundled_inventory_before_archive', async () => {
      service = createDatasetService({ dataDir, automatic: false,
        fetcher: async url => { requests++; if (url.endsWith('latest.jsonl')) return metadata(build); return new Response(Readable.toWeb(createReadStream(archivePath)), { headers: { 'content-length': String(archiveBytes) } }); },
        onChange: state => {
          const phase = `${state.phase}:${state.progress?.message || ''}:${state.progress?.percent ?? ''}`;
          if (phases.at(-1)?.phase !== phase) phases.push({ atMs: performance.now() - begin, phase, rss: process.memoryUsage().rss });
          if (state.phase === 'building' && !reachedBuild) { reachedBuild = true; resolveBuild(); }
        } });
      await service.ready;
    });
    output.input = { archiveBasename: basename(archivePath), archiveBytes, expectedBuild: build };
    if (mode === 'abort') {
      await measure('archive_download_then_real_worker_abort', async () => {
        const install = service.install(); await building;
        // Give the real worker time to start archive conversion before cancelling.
        await new Promise(resolve => setTimeout(resolve, 1000));
        const cancelBegin = performance.now(); await service.close(); await install;
        const remaining = await tree(join(dataDir, 'datasets'));
        assert.ok(!remaining.some(row => /^(download-|staging-|build-)/.test(row.name)));
        return { cancellationMs: performance.now() - cancelBegin, phase: service.status().phase, remaining };
      });
    } else {
      await measure('local_archive_stream_real_worker_install', async () => {
        const result = await service.install(); assert.equal(result.phase, 'ready', JSON.stringify(result));
        return { phase: result.phase, requests, distinctStatusTransitions: phases.length };
      });
      await service.close(); service = null;
      let selected;
      await measure('prepare_pending_with_full_rehash', async () => { selected = await prepareDatasetRuntime(dataDir); assert.equal(selected.manifest.build, build); assert.equal(selected.pending, true); return { files: selected.manifest.files.length, bytes: selected.manifest.files.reduce((sum,row) => sum + row.bytes, 0), counts: selected.manifest.counts, sourceArchiveSha256: selected.manifest.sourceArchiveSha256 }; });
      await measure('commit_pending_and_cleanup', async () => { await commitDatasetRuntime(dataDir, selected); });
      await measure('prepare_active_without_rehash_10_repeats', async () => {
        const times = []; for (let n = 0; n < 10; n++) { const t = performance.now(); const active = await prepareDatasetRuntime(dataDir); assert.equal(active.pending, false); times.push(performance.now() - t); } return { timesMs: times };
      });
      const files = await tree(join(dataDir, 'datasets'));
      assert.ok(!files.some(row => /^(download-|staging-)/.test(row.name)));
      const directories = await readdir(join(dataDir, 'datasets'));
      assert.equal(directories.filter(name => name.startsWith('build-')).length, 1);
      output.finalInventory = files;
    }
    output.phases = phases;
  } else throw new Error(`Unknown mode: ${mode}`);
} catch (error) {
  output.error = { message: error.message, stack: error.stack }; process.exitCode = 1;
} finally {
  await service?.close().catch(() => {});
  await rm(dataDir, { recursive: true, force: true });
}
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
