import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const root = resolve(process.argv[2]), output = resolve(process.argv[3]);
const imported = name => import(pathToFileURL(join(root, 'server', name)).href);
const { openStore } = await imported('store.mjs'), { createAuth } = await imported('auth.mjs');
const { createESI: plainCreateESI } = await imported('esi.mjs'), { createImports } = await imported('imports.mjs');
const { createSessionLiveFeed } = await imported('session-live.mjs'), { createUniverseFeeds } = await imported('universe-feeds.mjs');
const { DEFAULT_IMPORT_SETTINGS } = await imported('import-math.mjs');
const dir = await mkdtemp(join(tmpdir(), 'kairo-services-counts-'));
const store = openStore(dir), now = Date.now(), iso = n => new Date(n).toISOString();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { schema: 2, diagnosticOnly: true, timingClaims: false, generatedAt: new Date().toISOString(), root,
    harnessHash: hash(await readFile(new URL(import.meta.url))), sourceHashes: {}, node: process.version };
for (const name of ['auth.mjs', 'imports.mjs', 'markets.mjs', 'esi.mjs', 'session-live.mjs', 'universe-feeds.mjs', 'core.mjs', 'public-feed-transport.mjs', 'store.mjs', 'cache-retention.mjs', 'market-categories.mjs']) {
    if (existsSync(join(root, 'server', name))) report.sourceHashes[name] = hash(await readFile(join(root, 'server', name)));
}
let markets;
try {
    const rosterAuth = createAuth(store, {}, { origin: 'http://127.0.0.1:4380' });
    let rosterCalls = 0, scopeRows = 0;
    const auth = { characters() { rosterCalls++; const rows = rosterAuth.characters(); scopeRows += rows.length; return rows; } };
    const scopes = ['esi-skills.read_skills.v1', 'esi-characters.read_standings.v1', 'esi-markets.read_character_orders.v1'];
    for (let id = 42; id < 46; id++) {
        store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(id, `Synthetic ${id}`, JSON.stringify(scopes), '{}');
        const sample = data => ({ data, status: 'ready', updatedAt: iso(now), expiresAt: iso(now + 86400000) });
        store.saveSnapshot(id, 'skills', sample({ skills: [{ skill_id: 16622, active_skill_level: 5 }] }));
        store.saveSnapshot(id, 'standings', sample([])); store.saveSnapshot(id, 'orders', sample([]));
    }
    const AMARR = 60008494;
    store.db.prepare('INSERT INTO market_hubs(id,name,station_name,kind,system_id,system_name,region_id,region_name) VALUES(?,?,?,?,?,?,?,?)').run(AMARR, 'Amarr', 'Amarr', 'station', 30002187, 'Amarr', 10000043, 'Domain');
    store.set('market:owner:' + AMARR, { corporationId: 1000084, corporationName: 'Amarr Navy', factionId: 500003, expires: now + 86400000 });
    store.set('market:imports:' + AMARR, { ...DEFAULT_IMPORT_SETTINGS, characterId: 42, buyingCharacterId: 43 });
    const imports = createImports(store, auth, { now: () => now });
    async function counted(run) { rosterCalls = 0; scopeRows = 0; await run(); return { rosterQueries: rosterCalls, scopeRowsParsed: scopeRows }; }
    report.roster = {
        pilots: 4, state: await counted(() => imports.state(AMARR)), coldAnalysis: await counted(() => imports.analyse(AMARR)),
        repeatedWarmAnalysis100: await counted(async () => { for (let i = 0; i < 100; i++) await imports.analyse(AMARR); }),
    };
    await imports.close();
    // Substitute only the courtesy clock/wait, recording requested policy delay.
    // This is deliberately not a host elapsed-time benchmark.
    const timerStub = 'const delay=async ms=>{globalThis.__serviceCounts.waits.push(ms);globalThis.__serviceCounts.clock+=ms;};';
    const rewriteImports = source => source.replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${pathToFileURL(join(root, 'server', path)).href}'`);
    const original = await readFile(join(root, 'server/markets.mjs'), 'utf8');
    const marker = "import {setTimeout as delay} from 'node:timers/promises';";
    assert.ok(original.includes(marker));
    const modulePath = join(dir, 'markets-counted.mjs'); await writeFile(modulePath, rewriteImports(original.replace(marker, timerStub)));
    const { createMarkets } = await import(pathToFileURL(modulePath).href);
    const probe = globalThis.__serviceCounts = { clock: now, waits: [], transport: [] };
    const esiOriginal = await readFile(join(root, 'server/esi.mjs'), 'utf8');
    const esiTimer = "import { setTimeout as delay } from 'node:timers/promises';";
    let createESI = plainCreateESI;
    if (esiOriginal.includes(esiTimer)) {
        const esiPath = join(dir, 'esi-counted.mjs'); await writeFile(esiPath, rewriteImports(esiOriginal.replace(esiTimer, timerStub)));
        ({ createESI } = await import(pathToFileURL(esiPath).href));
    }
    const esi = createESI(store, auth, { fetcher: async url => {
        probe.transport.push(url); return Response.json([], { headers: { 'Cache-Control': 'max-age=86400', 'X-Pages': '1' } });
    } });
    const JITA = 60003760, ids = [1403, 519, 587]; store.set('market:quick', ids);
    for (const id of ids) store.db.prepare('INSERT OR IGNORE INTO market_types(type_id,name) VALUES(?,?)').run(id, `Synthetic item ${id}`);
    markets = createMarkets(store, auth, esi, { spacingMs: 250, now: () => probe.clock, historySource: 'esi' });
    async function scan() {
        probe.waits = []; probe.transport = []; const before = esi.health();
        markets.start({ hubId: JITA, mode: 'quick', compareJita: false }); await markets.idle();
        assert.equal(markets.overview().job.status, 'complete'); const after = esi.health();
        return { transportRequests: probe.transport.length, requestedCourtesyWaitsMs: [...probe.waits], totalRequestedCourtesyWaitMs: probe.waits.reduce((a,b)=>a+b,0), cacheHits: after.cacheHits - before.cacheHits, paths: [...probe.transport] };
    }
    report.marketPacing = { spacingMs: 250, items: ids.length, cold: await scan(), warm: await scan() };
    await markets.close(); markets = null; await esi.close?.();

    const data = new Map(), feedStore = { get: (k, fallback) => data.has(k) ? structuredClone(data.get(k)) : fallback, set: (k, v) => data.set(k, structuredClone(v)), snapshot: () => null };
    const atlas = { systems: [{ system_id: 30000001, name: 'Synthetic', security: -.2, space: 'known' }], gates: [] };
    const raw = { sequence_id: 100, killmail_id: 100, hash: 'a'.repeat(40), esi: { killmail_id: 100, killmail_time: iso(now - 1000), solar_system_id: 30000001, victim: { ship_type_id: 587 }, attackers: [] }, zkb: { totalValue: 100 } };
    const feedCalls = [], accepted = [];
    const fetcher = async url => { feedCalls.push(url); return url.endsWith('sequence.json') ? Response.json({ sequence: 100 }) : url.endsWith('/100.json') ? Response.json(raw) : new Response('', { status: 404 }); };
    const shared = process.argv[4] !== '--unshared' && existsSync(join(root, 'server/public-feed-transport.mjs'));
    const owner = shared ? (await imported('public-feed-transport.mjs')).createPublicFeedTransport({ spacingMs: 0, now: () => now }) : null;
    const session = createSessionLiveFeed(feedStore, { fetcher: owner ? owner.wrap(fetcher) : fetcher, now: () => now, spacingMs: 0, getTargets: () => [42], isTargetActive: () => true, accept: async packet => accepted.push(packet.killmail_id) });
    const universe = createUniverseFeeds(feedStore, {}, { fetcher: owner ? owner.wrap(fetcher, { maximum: 2 * 1024 * 1024, checkContentLength: true }) : fetcher, now: () => now, atlas, noSync: true, points: { items: [], metadata: {} } });
    universe.saveConfig({ combat_enabled: true });
    try {
        await Promise.all([session.sync(), universe.refresh('combat')]);
        assert.deepEqual(accepted, [100]); assert.equal(feedStore.get('session:live-feed').nextSequence, 101); assert.equal(feedStore.get('universe:feeds:combat-cursor').sequence, 101);
        report.publicFeed = { shared, enabledConsumers: ['Session', 'Universe'], perUrlRequests: Object.fromEntries([...new Set(feedCalls)].map(url => [url, feedCalls.filter(value => value === url).length])), totalRequests: feedCalls.length,
            sessionCursor: feedStore.get('session:live-feed').nextSequence, universeCursor: feedStore.get('universe:feeds:combat-cursor').sequence, verifiedSessionAccepted: accepted, universeCount: universe.state().combat.length,
            packetBytes: Buffer.byteLength(JSON.stringify(raw)), note: 'Session acceptance records a callback here; separate real Core tests exercise ESI verification. No provider latency or cadence benefit claimed; courtesy clocks are controlled.' };
    } finally { await session.close(); await universe.close(); await owner?.close(); }
    await writeFile(output, JSON.stringify(report, null, 2) + '\n'); process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} finally { await markets?.close(); store.close(); await rm(dir, { recursive: true, force: true }); delete globalThis.__serviceCounts; }
