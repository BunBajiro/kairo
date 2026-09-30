// Run only via memory-runner.mjs in a reserved, flock-serialized slot.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';
import assert from 'node:assert/strict';
import { builds, AT, moduleAt, tick, provenance, seedPilots } from './memory-common.mjs';

const [buildName, mode] = process.argv.slice(2), build = builds[buildName];
if (!build || !['ordinary', 'retention'].includes(mode)) throw new Error('Expected build and ordinary|retention');
if (mode === 'retention' && !globalThis.gc) throw new Error('Retention diagnostics require --expose-gc');
let networkAttempts = 0;
const block = async () => { networkAttempts++; throw new Error('Unexpected external IO in residency harness'); };
globalThis.fetch = block;
const markers = [];
const completed = { universeState: 0, jspaceState: 0, lightDetails: 0, celestialDetails: 0, coreRecreationCycles: 0 };
function useStates(active, pilot) {
  const state = active.universe.state(pilot.id), jspace = active.universe.jspace.state(pilot.id);
  assert.equal(state.character_id, pilot.id); assert.ok(Array.isArray(state.systems));
  assert.equal(jspace.character_id, pilot.id); assert.ok(Array.isArray(jspace.maps));
  completed.universeState++; completed.jspaceState++;
}
function useDetail(id, celestials) {
  const detail = staticModule.getUniverseSystem(id, { celestials });
  assert.equal(detail?.system_id, id);
  if (celestials) { assert.ok(detail.star && Array.isArray(detail.celestials)); completed.celestialDetails++; }
  else completed.lightDetails++;
}
let lastTime = performance.now();
async function marker(name, extra = {}) {
  if (mode === 'retention') { await tick(); globalThis.gc(); await tick(); globalThis.gc(); await tick(); }
  const now = performance.now(), memory = process.memoryUsage();
  markers.push({ name, ...memory, nativeContextCount: getHeapStatistics().number_of_native_contexts, detachedContextCount: getHeapStatistics().number_of_detached_contexts,
    ...(mode === 'ordinary' ? { sincePreviousMarkerMs: now - lastTime } : {}), ...extra });
  lastTime = performance.now();
}
const dir = await mkdtemp(join(tmpdir(), 'kairo-followup-memory-'));
let store, core, staticModule;
try {
  await marker('harness_baseline');
  const { openStore } = await moduleAt(build.root, 'store.mjs');
  await marker('store_module_imported');
  store = openStore(dir);
  const pilots = seedPilots(store, 4), auth = { characters: () => pilots }, esi = { request: block, names: block, health: () => ({}) };
  await marker('store_open_4_pilots_seeded');
  const { createCore } = await moduleAt(build.root, 'core.mjs');
  await marker('core_module_imported');
  if (mode === 'retention' && buildName === 'rc16') {
    staticModule = await moduleAt(build.root, 'universe-static.mjs');
    staticModule.getUniverseStatic();
    await marker('topology_first_load_explicit', { note: 'Diagnostic attribution. Ordinary Core init performs this eagerly itself.' });
  }
  const options = { noSync: true, combatFetcher: block, sessionFeedFetcher: block, universe: { now: () => AT, feeds: { fetcher: block } } };
  core = await createCore(store, auth, esi, join(build.root, 'server/modules'), options);
  await marker('core_created');
  if (mode === 'retention' && buildName === 'rc16') {
    for (const pilot of pilots) useStates(core, pilot);
    await marker('first_universe_and_jspace_state_4_pilots');
    for (let round = 0; round < 20; round++) for (const pilot of pilots) useStates(core, pilot);
    await marker('80_more_pilot_state_pairs');
    const ids = staticModule.getUniverseStatic().systems.map(s => s.system_id);
    for (const id of ids.slice(0, 1000)) useDetail(id, false);
    await marker('light_details_1000_distinct');
    for (const id of ids) useDetail(id, false);
    await marker('light_details_entire_atlas', { distinctSystems: ids.length, sourceBound: 'lightCache can grow to finite atlas system count; no LRU eviction' });
    for (const id of ids.slice(0, 48)) useDetail(id, true);
    await marker('celestial_details_first_48');
    for (const id of ids.slice(48, 192)) useDetail(id, true);
    await marker('celestial_details_distinct_192_total', { sourceLruLimit: 48 });
    for (const id of ids.slice(192, 384)) useDetail(id, true);
    await marker('celestial_details_distinct_384_total', { sourceLruLimit: 48 });
  }
  await core.close(); core = null;
  await marker('core_closed_reference_released');
  if (mode === 'retention') {
    async function cycle() {
      const active = await createCore(store, auth, esi, join(build.root, 'server/modules'), options);
      if (active.universe) for (const pilot of pilots) useStates(active, pilot);
      await active.close();
      completed.coreRecreationCycles++;
    }
    for (let i = 1; i <= 10; i++) {
      await cycle();
      if ([1, 5, 10].includes(i)) await marker(`recreate_use_close_cycle_${i}`);
    }
  }
  store.close(); store = null;
  await marker('store_closed_reference_released');
  if (networkAttempts) throw new Error(`${networkAttempts} unexpected external requests`);
  // Provenance IO is deliberately after memory/latency markers.
  process.stdout.write(JSON.stringify({ build: buildName, mode, ...provenance(buildName, ['memory-residency.mjs', 'memory-runner.mjs']),
    methodology: mode === 'retention' ? 'Forced GC after two event-loop yields at each marker. Diagnostic retained heap only; no timing values. RSS is allocator/process residency and not retained JS size. Module singletons intentionally survive Core.close.' : 'Fresh process; no forced GC. Phase markers reflect RSS/heap allocation snapshots and elapsed including imported module work, not end-user cold disk startup. No HTTP server/supervisor started.',
    fixture: { pilots: 4, noSync: true, publicActivityRows: 0, liveSessions: 0, mapNodes: 0 }, networkAttempts, completed, markers }, null, 2) + '\n');
} finally {
  await core?.close(); store?.close(); await rm(dir, { recursive: true, force: true });
}
