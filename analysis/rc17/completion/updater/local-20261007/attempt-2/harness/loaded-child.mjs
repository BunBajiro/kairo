// Analysis adapter: real lifecycle/Core/collectors/SDE worker; synthetic ESI only.
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { seedFixture } from '../../harness/backend/fixture.mjs';
import { startMeter } from '../../harness/backend/metrics.mjs';

const root = process.env.KAIRO_PERF_APP_ROOT, generation = Number(process.env.KAIRO_UPDATER_GENERATION);
const moduleAt = file => import(pathToFileURL(join(root, 'server', file)).href);
const { runRuntimeChild } = await moduleAt('runtime-child.mjs');
const { openStore } = await moduleAt('store.mjs');
const { openVault } = await moduleAt('vault.mjs');
const { catalog } = await moduleAt('modules/catalog.mjs');
const { getUniverseStatic, getUniverseSystem } = await moduleAt('universe-static.mjs');
const archivePath = process.env.KAIRO_UPDATER_ARCHIVE, build = Number(process.env.KAIRO_UPDATER_BUILD);
const archiveBytes = (await stat(archivePath)).size, routes = new Map(), calls = [], unexpected = [], samples = [], phaseMeasurements = [];
const iso = n => new Date(n).toISOString(), DAY = 86_400_000, HIGH = 30000142;
let app, meter, phaseMeter, phaseAt, sampling, lastPhase, startTime, closeReported = false;
const send = (event, data = {}) => { if (process.connected) process.send({ type: 'updater-probe', event, generation, pid: process.pid, at: Date.now(), ...data }); };
const response = (value, status = 200, ttl = 3600) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttl}`, 'X-Pages': '1' } });
const deny = async url => { unexpected.push(String(url)); throw new Error('Unexpected external request: ' + url); };
globalThis.fetch = deny;
async function fakeFetch(input, options = {}) {
  const url = new URL(String(input)), path = url.pathname.replace(/\/$/, ''), row = { at: Date.now(), host: url.host, path }; calls.push(row);
  if (url.hostname === 'developers.eveonline.com') {
    if (path.endsWith('latest.jsonl')) return response({}); // Metadata is handled by the dataset-only adapter below.
    throw new Error('Dataset transport must use its dedicated archive adapter');
  }
  if (url.hostname === 'r2z2.zkillboard.com') { await delay(20); return response(path.endsWith('/sequence.json') ? { sequence: 1000000 } : null, path.endsWith('/sequence.json') ? 200 : 404); }
  if (url.hostname === 'zkillboard.com') { await delay(20); return response([]); }
  if (url.hostname !== 'esi.evetech.net') return deny(input);
  if (/^\/characters\/(42|43)\/location$/.test(path)) { await delay(50); return response({ solar_system_id: HIGH }, 200, 1); }
  if (path === '/universe/names') { await delay(20); return response(JSON.parse(options.body || '[]').map(id => ({ id, name: 'Synthetic name ' + id, category: 'inventory_type' }))); }
  if (routes.has(path)) { await delay(path.endsWith('/assets') ? 250 : 20); return response(routes.get(path)); }
  return deny(input);
}
async function datasetFetch(input) {
  const url = String(input); calls.push({ at: Date.now(), host: 'developers.eveonline.com', path: new URL(url).pathname });
  if (url.endsWith('/latest.jsonl')) return new Response(JSON.stringify({ _key: 'sde', buildNumber: build, releaseDate: '2026-09-28T11:08:09Z' }) + '\n', { headers: { 'Cache-Control': 'max-age=300' } });
  if (!url.endsWith(`eve-online-static-data-${build}-jsonl.zip`)) return deny(url);
  return new Response(Readable.toWeb(createReadStream(archivePath)), { headers: { 'Content-Length': String(archiveBytes) } });
}
async function prepare(dir) {
  if (generation === 1) await seedFixture(dir, 'stress');
  const store = openStore(dir), vault = openVault(dir), now = Date.now();
  try {
    if (generation === 1) {
      store.db.prepare('DELETE FROM snapshots WHERE character_id IN (44,45)').run(); store.db.prepare('DELETE FROM characters WHERE id IN (44,45)').run();
      store.db.prepare("UPDATE sessions SET ended=NULL WHERE id='benchmark-session'").run();
      store.set('session:combat:benchmark-session', { status: 'ready', retryAt: iso(now + DAY), ended: null });
      store.set('opsec', { characterId: 42, manual: false, allowHighsec: true, blueAlliances: [], hostileAlliances: [] });
      const local = getUniverseSystem(HIGH, { celestials: false });
      for (const id of [42, 43]) {
        store.db.prepare('UPDATE characters SET tokens=? WHERE id=?').run(vault.encrypt({ access_token: 'synthetic-updater-' + id, expires: now + DAY }), id);
        store.saveSnapshot(id, 'location', { status: 'ready', data: { solar_system_id: HIGH, system: { ...local, security_status: local.security }, constellation: local.constellation, region: local.region }, updatedAt: iso(now), expiresAt: iso(now + 1000), refreshAt: iso(now + 1000) });
        const assets = store.snapshot(id, 'assets'); store.saveSnapshot(id, 'assets', { ...assets, expiresAt: iso(now + 1000), refreshAt: iso(now + 1000) });
      }
      // Universe creates this table when Core starts; fixture seeding precedes Core.
      // Match the canonical schema, and let the real owner create its indexes.
      store.db.exec('CREATE TABLE IF NOT EXISTS universe_records(character_id INTEGER NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(character_id,kind,id))');
      const systems = getUniverseStatic().systems.filter(system => system.space === 'wormhole').slice(0, 100), stamp = iso(now);
      for (let index = 0; index < 8; index++) {
        const map = { id: 'updater-map-' + index, name: 'Synthetic updater map ' + index, description: '', scope: null, scope_version: 2, revision: 1, created_at: stamp, updated_at: stamp,
          nodes: systems.map((system, i) => ({ system_id: system.system_id, x: i * 100, y: 0, locked: false, alias: '', role: '', status: 'unknown', tags: [] })), connections: [], passages: [], observations: [], comments: [], pings: [], activity: [], pilots: [] };
        store.db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?)').run(42, 'jspace_map', map.id, JSON.stringify(map), stamp);
      }
    }
    for (const id of [42, 43]) for (const module of catalog) for (const dataset of module.datasets) {
      const snapshot = store.snapshot(module.id === 'universe' ? 0 : id, dataset.key);
      if (snapshot?.data != null) routes.set(dataset.route.replaceAll('{id}', id).replaceAll('{owner}', dataset.owner === 'corporation_id' ? 88 : 77), snapshot.data);
    }
  } finally { store.close(); }
}
function begin() {
  if (meter) return;
  startTime = Date.now(); meter = startMeter(); lastPhase = app.datasets.status().phase; phaseAt = startTime; phaseMeter = startMeter();
  sampling = setInterval(() => {
    const state = app.datasets.status(), memory = process.memoryUsage();
    if (samples.length < 24000) samples.push({ at: Date.now(), phase: state.phase, rss: memory.rss, heap: memory.heapUsed, locationAt: app.store.snapshot(42, 'location')?.updatedAt });
    if (state.phase !== lastPhase) {
      phaseMeasurements.push({ phase: lastPhase, startedAt: phaseAt, endedAt: Date.now(), measured: phaseMeter() });
      lastPhase = state.phase; phaseAt = Date.now(); phaseMeter = startMeter(); send('phase', { phase: state.phase, error: state.error });
    }
  }, 100);
}
function finish() {
  clearInterval(sampling); const measured = meter?.(); meter = null;
  if (phaseMeter) { phaseMeasurements.push({ phase: lastPhase, startedAt: phaseAt, endedAt: Date.now(), measured: phaseMeter() }); phaseMeter = null; }
  return { startTime, endedAt: Date.now(), measured, phaseMeasurements, calls, unexpected, samples, health: app.core.health(), dataset: app.datasets.status(), clients: { dashboard: app.core.uiClients.size, stream: app.core.stream.clients.size } };
}
process.on('message', message => {
  if (message?.type === 'updater-control' && message.action === 'begin') { begin(); send('began'); }
  if (message?.type === 'updater-control' && message.action === 'finish') { send('summary', { summary: finish() }); closeReported = true; }
});
runRuntimeChild({ loadRuntime: async () => ({ startKairo: async options => {
  await prepare(options.dataDir);
  const { startKairo } = await moduleAt('index.mjs');
  app = await startKairo({ ...options, fetcher: fakeFetch, combatFetcher: fakeFetch, sessionFeedFetcher: fakeFetch,
    datasets: { fetcher: datasetFetch }, markets: { historyFetcher: deny }, universe: { feeds: { fetcher: deny } }, deferDatasetStart: true });
  // Keep Core's real scheduler running. The observer starts installation at a fixed
  // offset; the updater's automatic startup check alone is suppressed in this probe.
  app.startDatasetUpdates = () => {};
  if (generation === 1) {
    const config = app.core.stream.config(); config.elements = ['session.elapsed', 'session.report', 'wallet.balance', 'pilot.ship'].map((binding, i) => ({ id: 'updater-widget-' + i, kind: 'text', name: 'Synthetic widget', text: '', label: '', visible: true, x: i * 100, y: 0, width: 350, height: 100, fontSize: 24, opacity: 1, color: '#ffffff', binding, characterId: 42 }));
    app.core.stream.save(config); app.core.updateBindings();
  } else begin();
  const close = app.close;
  app.close = async () => { if (!closeReported) { send('summary', { summary: finish() }); closeReported = true; } await close(); send('closed'); };
  send('created', { revision: app.datasets.status().datasets.filter(row => row.automatic).map(row => row.build).join(':') });
  return app;
} }) });
