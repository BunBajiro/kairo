// Internal measurement. Acquires the common exclusive lock; never reads user data.
import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir, cpus } from 'node:os';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { loadSourceManifest, verifySource } from '../../harness/source-manifest.mjs';

const self = fileURLToPath(import.meta.url), here = dirname(self);
if (process.env.KAIRO_UPDATER_LOCKED !== '1') {
  const code = await new Promise((done, reject) => { const child = spawn('flock', ['-x', '/tmp/kairo-performance.lock', process.execPath, self, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, KAIRO_UPDATER_LOCKED: '1' } }); child.on('error', reject); child.on('exit', code => done(code ?? 1)); });
  process.exit(code);
}
const root = resolve(process.env.KAIRO_PERF_APP_ROOT), archive = resolve(process.env.KAIRO_UPDATER_ARCHIVE);
const build = Number(process.env.KAIRO_UPDATER_BUILD), out = resolve(process.argv[2]);
assert.ok(Number.isSafeInteger(build) && build > 0);
const windowMs = Number(process.env.KAIRO_UPDATER_WINDOW_MS || 60000);
assert.ok(windowMs >= 30000 && windowMs <= 600000);
const source = await loadSourceManifest(process.env.KAIRO_SOURCE_MANIFEST, root);
const order = process.env.KAIRO_UPDATER_ORDER ? JSON.parse(process.env.KAIRO_UPDATER_ORDER) : ['loaded-control-1', 'loaded-conversion-1', 'loaded-conversion-2', 'loaded-control-2', 'loaded-control-3', 'loaded-conversion-3'];
assert.ok(Array.isArray(order) && order.length >= 2 && order.length <= 12 && new Set(order).size === order.length && order.every(name => /^loaded-(control|conversion)-[1-9]$/.test(name)));
assert.equal(order.filter(name => name.includes('control')).length, order.filter(name => name.includes('conversion')).length);
const { runKairoSupervisor } = await import(pathToFileURL(join(root, 'server/runtime-supervisor.mjs')).href);
const hash = async file => { const h = createHash('sha256'); for await (const chunk of createReadStream(file)) h.update(chunk); return h.digest('hex'); };
const archiveSha256 = await hash(archive), harnessHashes = {};
if (process.env.KAIRO_UPDATER_ARCHIVE_SHA256) assert.equal(archiveSha256, process.env.KAIRO_UPDATER_ARCHIVE_SHA256);
for (const file of ['loaded-run.mjs', 'loaded-child.mjs', '../../harness/backend/fixture.mjs', '../../harness/backend/metrics.mjs', '../../harness/backend/target.mjs', '../../harness/legacy-discovery-fixture.mjs', '../../harness/source-manifest.mjs']) harnessHashes[file] = await hash(resolve(here, file));
const report = { schema: 1, suite: 'real-updater-under-loaded-app', sourceCommit: source.sourceCommit, sourceFingerprint: source.fingerprint, sourceDirty: source.dirty,
  harnessCommit: process.env.GITHUB_SHA || null, runUrl: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  generatedAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, cpu: cpus()[0]?.model, logicalCpus: cpus().length },
  archive: { build, bytes: (await stat(archive)).size, sha256: archiveSha256 }, harnessHashes, windowMs, order,
  scope: ['Real default SDE builder and Worker; actual supervisor and forked runtime generations, HTTP and dashboard/Stream SSE.', 'Two synthetic pilots, 20,000 assets each, 50,000 events, 200 Sessions, 8 Maps with 100 nodes each; real Core scheduler and synthetic cached/provider responses.', 'Archive streams from local disk; Internet download time excluded. No browser/OBS executable or real private data.', 'Per-generation CPU/RSS/event-loop measures include the real SDE worker. RSS is process-wide, sampled peaks are lower bounds. Quiet controls mean the same loaded app without conversion.', 'Automatic dataset startup check is suppressed only by the analysis adapter; installation begins at 5s. All other Core drivers remain enabled.'], runs: [], complete: false };
await mkdir(out, { recursive: true });
const save = () => writeFile(join(out, 'loaded.json'), JSON.stringify(report, null, 2) + '\n');
const stats = values => { const sorted = values.toSorted((a, b) => a - b); return { n: sorted.length, p50: sorted[Math.ceil(sorted.length * .5) - 1] ?? null, p95: sorted[Math.ceil(sorted.length * .95) - 1] ?? null, max: sorted.at(-1) ?? null }; };
async function port() { const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value; }
async function until(check, label, timeout = 20000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await check()) return; await delay(20); } throw new Error('Timed out: ' + label); }
async function followSSE(url, headers, label, events) {
  let stopped = false, controller;
  const task = (async () => {
    while (!stopped) {
      controller = new AbortController();
      try {
        const response = await fetch(url, { headers, signal: controller.signal }); assert.equal(response.status, 200);
        events.push({ client: label, type: 'connected', at: Date.now() });
        const reader = response.body.getReader(), decoder = new TextDecoder(); let text = '';
        for (;;) {
          const chunk = await reader.read(); if (chunk.done) break; text += decoder.decode(chunk.value, { stream: true });
          let boundary;
          while ((boundary = text.indexOf('\n\n')) >= 0) {
            const item = text.slice(0, boundary); text = text.slice(boundary + 2);
            const type = item.match(/^event: (.+)$/m)?.[1], raw = item.match(/^data: (.+)$/m)?.[1];
            if (type && raw) { const value = JSON.parse(raw); events.push({ client: label, type, at: Date.now(), bytes: Buffer.byteLength(item), phase: value.phase, revision: value.revision, build: value.build, serverTime: value.serverTime, version: value.version, error: value.error }); }
          }
        }
      } catch (error) { if (!stopped) events.push({ client: label, type: 'connection-error', at: Date.now(), error: error.message }); }
      if (!stopped) { events.push({ client: label, type: 'disconnected', at: Date.now() }); await delay(50); }
    }
  })();
  return { async close() { stopped = true; controller?.abort(); await task; } };
}

try {
  for (const name of report.order) {
    const dataDir = await mkdtemp(join(tmpdir(), 'kairo-updater-loaded-'));
    const entry = { name, conversion: name.includes('conversion'), requests: [], sse: [], probes: [], errors: [], stderr: [], complete: false }; report.runs.push(entry);
    let supervisor, dashboard, stream, children = [], shutdownError;
    try {
      const first = await port(); let second = await port(); while (first === second) second = await port();
      const origin = `http://127.0.0.1:${first}`, streamOrigin = `http://127.0.0.1:${second}`;
      supervisor = await runKairoSupervisor({ dataDir, manageProcess: false, runtimeOptions: { port: first, streamPort: second }, logger: { log() {}, error: message => entry.errors.push({ at: Date.now(), message }) },
        forkRuntime(_file, args, options) {
          const generation = children.length + 1;
          const child = fork(join(here, 'loaded-child.mjs'), args, { ...options, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: { ...options.env, KAIRO_PERF_APP_ROOT: root, KAIRO_UPDATER_GENERATION: String(generation), KAIRO_UPDATER_ARCHIVE: archive, KAIRO_UPDATER_BUILD: String(build) } });
          children.push(child); child.stderr.on('data', bytes => entry.stderr.push(bytes.toString().slice(0, 4000)));
          child.on('message', message => { if (message.type === 'updater-probe') entry.probes.push(message); }); return child;
        } });
      const page = await fetch(origin); assert.equal(page.status, 200); await page.arrayBuffer();
      const cookie = page.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie);
      const boot = await (await fetch(origin + '/api/bootstrap', { headers: { cookie } })).json();
      const headers = { cookie, Origin: origin, 'Content-Type': 'application/json', 'X-Kairo-CSRF': boot.csrf };
      dashboard = await followSSE(origin + '/api/events', headers, 'dashboard', entry.sse);
      stream = await followSSE(streamOrigin + '/events', {}, 'stream', entry.sse);
      await until(() => entry.sse.some(event => event.type === 'dataset-revision'), 'initial SSE revision');
      children[0].send({ type: 'updater-control', action: 'begin' });
      await until(() => entry.probes.some(probe => probe.event === 'began'), 'measurement begin');
      entry.startedAt = Date.now();
      async function request(path, { method = 'GET', body, at = Date.now(), target = origin } = {}) {
        const row = { path, scheduledAt: at, dispatchedAt: Date.now(), method }; entry.requests.push(row); const started = performance.now();
        try {
          const response = await fetch(target + path, { method, headers: target === origin ? headers : {}, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
          row.status = response.status; const text = await response.text(); row.bytes = Buffer.byteLength(text);
          if (response.status !== 200 && response.status !== 202) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
          const value = JSON.parse(text);
          if (path.startsWith('/api/state')) assert.equal(value.data.assets.data.length, 20000);
          if (path.startsWith('/api/universe/jspace/maps/')) assert.equal(value.nodes.length, 100);
          return value;
        } catch (error) { row.error = error.message; }
        finally { row.finishedAt = Date.now(); row.latencyMs = performance.now() - started; }
      }
      const tasks = [], scheduled = (offset, callback) => delay(Math.max(0, entry.startedAt + offset - Date.now())).then(() => callback(entry.startedAt + offset));
      for (let offset = 0; offset < windowMs; offset += 1000) {
        tasks.push(scheduled(offset, at => request('/api/state?character=42', { at })));
        tasks.push(scheduled(offset, at => request('/state', { at, target: streamOrigin })));
        if (offset % 2000 === 0) for (const path of ['/api/universe?character=42', '/api/universe/jspace/maps/updater-map-0?character=42', '/api/state?character=43']) tasks.push(scheduled(offset, at => request(path, { at })));
        if (offset % 3000 === 0) tasks.push(scheduled(offset, at => request('/api/universe/systems/30000142?character=42', { at })));
      }
      if (entry.conversion) tasks.push(scheduled(5000, at => request('/api/datasets/install', { method: 'POST', body: {}, at })));
      await Promise.all([...tasks, delay(windowMs)]); entry.endedAt = Date.now();
      const expectedRevision = [build, build, build].join(':');
      if (entry.conversion) {
        assert.equal(children.length, 2, 'Exactly one real update replacement must complete');
        assert.ok(entry.sse.some(event => event.type === 'dataset-revision' && event.revision === expectedRevision), 'Updated revision must reconnect');
        const resumed = await request('/api/bootstrap'); assert.equal(resumed?.csrf, boot.csrf, 'Cookie and CSRF survive real conversion/restart');
        const pointer = JSON.parse(await readFile(join(dataDir, 'datasets/active.json'))), manifest = JSON.parse(await readFile(join(dataDir, 'datasets', pointer.directory, 'manifest.json')));
        assert.equal(manifest.build, build); assert.equal(manifest.sourceArchiveSha256, archiveSha256); assert.ok(manifest.counts.systems > 8000);
        for (const file of manifest.files) { const path = join(dataDir, 'datasets', pointer.directory, file.name); assert.equal((await stat(path)).size, file.bytes); assert.equal(await hash(path), file.sha256); }
        entry.outputManifest = manifest;
        const files = await readdir(join(dataDir, 'datasets')); assert.equal(files.filter(name => name.startsWith('build-')).length, 1); assert.ok(!files.some(name => name.startsWith('staging-') || name.startsWith('download-')));
      } else assert.equal(children.length, 1);
      const restart = entry.sse.find(event => event.type === 'dataset-restarting'), resumed = entry.sse.find(event => event.type === 'dataset-revision' && event.revision === expectedRevision);
      entry.restartGapMs = restart && resumed ? resumed.at - restart.at : null;
      entry.expectedUnavailable = entry.requests.filter(row => row.error && restart && resumed && row.dispatchedAt >= restart.at && row.dispatchedAt <= resumed.at + 1000);
      const unexpectedFailures = entry.requests.filter(row => row.error && !entry.expectedUnavailable.includes(row));
      assert.deepEqual(unexpectedFailures, [], 'HTTP failures outside announced restart window');
      assert.deepEqual(entry.errors, [], 'Supervisor must not roll back or report errors');
      children.at(-1).send({ type: 'updater-control', action: 'finish' });
      await until(() => entry.probes.some(probe => probe.event === 'summary' && probe.generation === children.length), 'final runtime summary');
      const summaries = entry.probes.filter(probe => probe.event === 'summary');
      for (const probe of summaries) { assert.deepEqual(probe.summary.unexpected, []); assert.ok(probe.summary.calls.some(call => /\/location$/.test(call.path)), 'Real scheduler must request location'); }
      entry.metrics = { successfulHttpMs: stats(entry.requests.filter(row => !row.error).map(row => row.latencyMs)), dispatchLatenessMs: stats(entry.requests.map(row => row.dispatchedAt - row.scheduledAt)), failedDuringRestart: entry.expectedUnavailable.length, sseEvents: entry.sse.length };
      entry.complete = true;
    } catch (error) { entry.error = error.stack; throw error; }
    finally {
      await dashboard?.close(); await stream?.close();
      try { await supervisor?.close(); } catch (error) { shutdownError = error; entry.shutdownError = error.stack; }
      for (const child of children) if (child.exitCode === null && child.signalCode === null) {
        await new Promise(resolve => { const timer = setTimeout(resolve, 5000); child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGKILL'); });
      }
      await rm(dataDir, { recursive: true, force: true }); await save();
    }
    assert.ok(!shutdownError, 'Supervisor cleanup must finish');
  }
  await verifySource(source);
  for (const [file, expected] of Object.entries(harnessHashes)) assert.equal(await hash(resolve(here, file)), expected);
  report.complete = true; report.endVerified = true;
} finally { await save(); }
