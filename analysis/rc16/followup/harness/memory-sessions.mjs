// Internal long-session scaling probes. Offline, synthetic and bounded fixtures.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { builds, AT, iso, moduleAt, provenance, sha } from './memory-common.mjs';

const [buildName, mode = 'timings'] = process.argv.slice(2), build = builds[buildName];
if (!build || !['timings', 'diagnostics'].includes(mode)) throw new Error('Expected build and timings|diagnostics');
const { openStore } = await moduleAt(build.root, 'store.mjs');
const { sessionRoute } = await moduleAt(build.root, 'session-details.mjs');
const { sessionCombatQueries, createSessionCombat } = await moduleAt(build.root, 'session-combat.mjs');
let networkAttempts = 0;
const block = async () => { networkAttempts++; throw new Error('Unexpected network request'); };
globalThis.fetch = block;
const results = [];
const configurations = [100, 1000, 10000].map(visits => ({ visits, pilots: 1, olderVisits: 0 }));
configurations.push({ visits: 100, pilots: 1, olderVisits: 10000 }, { visits: 1000, pilots: 4, olderVisits: 0 });
for (const config of configurations) {
  const dir = await mkdtemp(join(tmpdir(), 'kairo-followup-sessions-'));
  const store = openStore(dir), pilots = Array.from({ length: config.pilots }, (_, i) => ({ id: 42 + i, scopes: [] }));
  let service;
  try {
    const from = AT - config.visits * 60000;
    const start = { capturedAt: iso(from), system: { id: 30000001, name: 'Synthetic system 0' }, alliance: { id: 99000000 }, shipTypeId: 609 };
    const sessions = pilots.map((pilot, i) => ({ id: `long-${i}`, character_id: pilot.id, label: 'Synthetic live session', started: iso(from), ended: null, start_context: JSON.stringify(start) }));
    const visit = store.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)');
    const insertSession = store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context) VALUES(?,?,?,?,?,?)');
    const system = store.db.prepare('INSERT INTO universe_systems(system_id,name,region_id,region_name,security) VALUES(?,?,?,?,?)');
    store.db.exec('BEGIN');
    try {
      for (let i = 0; i < 100; i++) system.run(30000001 + i, `Synthetic system ${i}`, 10000001, 'Synthetic region', -.3);
      for (const s of sessions) {
        insertSession.run(s.id, s.character_id, s.label, s.started, null, s.start_context);
        for (let i = 0; i < config.visits; i++) visit.run(s.character_id, 30000001 + i % 100, `Synthetic system ${i % 100}`, iso(from + i * 60000));
        for (let i = 0; i < config.olderVisits; i++) visit.run(s.character_id, 30000001 + i % 100, `Synthetic system ${i % 100}`, iso(from - (i + 1) * 60000));
      }
      // Actual live-feed target construction executes, but the network cadence is not yet due.
      store.set('session:live-feed', { nextCheckAt: iso(AT + 3600000), nextSequence: 100, lastAdvanceAt: iso(AT) });
      store.db.exec('COMMIT');
    } catch (error) { store.db.exec('ROLLBACK'); throw error; }
    let sqlStats = null;
    if (mode === 'diagnostics') {
      const prepare = store.db.prepare.bind(store.db);
      store.db.prepare = function(sql, ...args) {
        const statement = prepare(sql, ...args);
        return new Proxy(statement, { get(target, key) {
          const value = Reflect.get(target, key, target);
          if (typeof value !== 'function') return value;
          if (!['get', 'all', 'run'].includes(key)) return value.bind(target);
          return (...params) => {
            const out = value.apply(target, params);
            if (sqlStats) {
              const metric = sqlStats[sql] ||= { calls: 0, rows: 0, bodyBytes: 0 };
              metric.calls++;
              for (const row of key === 'all' ? out : key === 'get' && out ? [out] : []) {
                metric.rows++;
                for (const field of ['body', 'value', 'start_context']) if (typeof row[field] === 'string') metric.bodyBytes += Buffer.byteLength(row[field]);
              }
            }
            return out;
          };
        } });
      };
    }
    service = createSessionCombat(store, { characters: () => pilots }, { request: block }, { ingest: block, publicPage: block }, { now: () => AT, feedFetcher: block });
    let route = sessionRoute(store, sessions[0], start, iso(AT));
    assert.equal(route.length, config.visits);
    assert.equal(route.filter(row => row.active).length, 1);
    assert.equal(route.reduce((n, row) => n + row.seconds, 0), config.visits * 60);
    assert.ok(route.every(row => row.seconds === 60));
    const groups = sessionCombatQueries(route);
    assert.equal(new Set(groups.map(row => [row.systemId, row.year, row.month].join(':'))).size, groups.length);
    const semantic = { route: sha(JSON.stringify(route.map(({ systemId, entered, exited, seconds, active }) => ({ systemId, entered, exited, seconds, active })))), groups: sha(JSON.stringify(groups)) };
    const entry = { fixture: { ...config, uniqueSystemsPerPilot: 100, visitSpacingSeconds: 60, durationHours: config.visits / 60, live: true, feedCacheNotDue: true, end: iso(AT) },
      routeLength: route.length, groupCount: groups.length, routeBytes: Buffer.byteLength(JSON.stringify(route)), semantic, operations: [] };
    route = null;
    const operations = [
      ['session_route', () => sessionRoute(store, sessions[0], start, iso(AT))],
      ['route_and_combat_groups', () => sessionCombatQueries(sessionRoute(store, sessions[0], start, iso(AT)))],
      ['actual_live_sync_cache_hit', () => service.syncLive()],
    ];
    function validateResult(name, value) {
      if (name === 'session_route') {
        assert.equal(value?.length, config.visits);
        assert.equal(value[0].entered, iso(from)); assert.equal(value.at(-1).exited, iso(AT));
        assert.equal(value.at(-1).active, true);
      } else if (name === 'route_and_combat_groups') {
        assert.equal(value?.length, groups.length); assert.equal(value[0].systemId, groups[0].systemId);
      } else assert.equal(networkAttempts, 0);
    }
    for (const [name, run] of operations) {
      if (mode === 'diagnostics') {
        sqlStats = {};
        for (let repeat = 0; repeat < 3; repeat++) validateResult(name, await run());
        entry.operations.push({ name, repetitions: 3, sql: sqlStats }); sqlStats = null;
      } else {
        for (let warmup = 0; warmup < 3; warmup++) validateResult(name, await run());
        const samples = [];
        for (let repeat = 0; repeat < 7; repeat++) {
          const cpu = process.cpuUsage(), begin = performance.now(); const value = await run();
          const wallMs = performance.now() - begin, used = process.cpuUsage(cpu);
          validateResult(name, value);
          samples.push({ wallMs, cpuMs: (used.user + used.system) / 1000 });
        }
        const sorted = samples.map(row => row.wallMs).sort((a, b) => a - b);
        entry.operations.push({ name, medianMs: sorted[3], samples });
      }
    }
    if (mode === 'diagnostics') entry.routeQueryPlan = store.db.prepare(`EXPLAIN QUERY PLAN SELECT v.*,u.name system_name,u.region_id,u.region_name,u.security FROM visits v LEFT JOIN universe_systems u USING(system_id) WHERE character_id=? AND at>=? AND at<? ORDER BY at,id`).all(42, iso(from), iso(AT));
    results.push(entry);
  } finally { await service?.close(); store.close(); await rm(dir, { recursive: true, force: true }); }
}
assert.equal(networkAttempts, 0);
process.stdout.write(JSON.stringify({ build: buildName, mode, ...provenance(buildName, ['memory-sessions.mjs', 'memory-runner.mjs']),
  methodology: mode === 'timings' ? 'Fresh process per build pass; each fixture has three warmups then seven measured samples per operation; no forced GC or SQL wrapping; no HTTP/serialization in timings.' : 'SQL diagnostic only: three sequential invocations per operation; query rows reflect returned rows, not pages scanned; no latency conclusions.',
  interpretation: 'Repeated visits to the same system are distinct timed presence windows and remain in the route. Combat request groups already deduplicate system/year/month. Live sync calls are sequential, exposing recurring tick cost despite future feed deadline; concurrent calls still coalesce while pending. Cross-build semantic equality covers system/time/duration/active and combat groups only, not all report/replay/sovereignty fields or events.',
  networkAttempts, results }, null, 2) + '\n');
