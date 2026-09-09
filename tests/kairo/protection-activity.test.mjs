import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate as turn } from 'node:timers/promises';
import { openStore } from '../../server/store.mjs';
import { createCore } from '../../server/core.mjs';
import { createESI } from '../../server/esi.mjs';
import { createProtectionTracker, classifyOPSEC, LOCATION_MAX_AGE } from '../../server/opsec.mjs';
import { createStream } from '../../server/stream.mjs';
import { createBus } from '../../server/bus.mjs';
import { allScopes } from '../../server/modules/catalog.mjs';
import { startKairo } from '../../server/index.mjs';

const epoch = Date.parse('2026-09-05T19:45:00Z');
const sample = (data, at = epoch, ttl = 600000) => ({ data, status: 'ready', updatedAt: new Date(at).toISOString(), expiresAt: new Date(at + ttl).toISOString() });
const context = (at = epoch) => ({
    characterId: 42, available: true, now: at,
    location: sample({ solar_system_id: 1 }, at, 5000), system: { security_status: 1 },
    fw: sample([], at), sovereignty: sample([{ system_id: 1, alliance_id: 77 }, { system_id: 2, alliance_id: 88 }], at),
    profile: sample({}, at), contacts: sample([], at),
    settings: { blueAlliances: [77], hostileAlliances: [88], allowHighsec: true },
});
async function storage(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-protection-')), store = openStore(dir);
    t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
    return { dir, store };
}

test('cache expiry does not flip protection during revalidation; old or invalid observations still fail closed', () => {
    const c = context();
    for (const elapsed of [0, 5001, 8000, 15000, 29999]) assert.equal(classifyOPSEC({ ...c, now: epoch + elapsed }).state, 'blue');
    assert.equal(classifyOPSEC({ ...c, now: epoch + LOCATION_MAX_AGE }).state, 'unknown');
    for (const updatedAt of [undefined, 'invalid', new Date(epoch + 5000).toISOString()])
        assert.equal(classifyOPSEC({ ...c, location: { ...c.location, updatedAt } }).hidden, true);
    assert.equal(classifyOPSEC({ ...c, fw: { ...c.fw, expiresAt: new Date(epoch - 1000).toISOString() } }).state, 'blue');
    assert.equal(classifyOPSEC({ ...c, fw: { ...c.fw, expiresAt: new Date(epoch - 31000).toISOString() } }).state, 'unknown');
});

test('brief jump gaps retain covered protection without transition events, then classify the destination', async t => {
    const { store } = await storage(t), events = [], stream = createStream(store, createBus(), e => events.push(e));
    t.after(() => stream.close());
    const protect = createProtectionTracker(), c = context();
    stream.setOPSEC(protect(c));
    for (const elapsed of [6000, 12000, 21000]) {
        const next = protect({ ...c, now: epoch + elapsed, location: { ...c.location, status: 'stale', errorStatus: 503 } });
        assert.equal(next.state, 'blue'); assert.equal(next.hidden, true); assert.equal(next.pending, true);
        stream.setOPSEC(next);
    }
    stream.setOPSEC(protect({ ...context(epoch + 22000), location: sample({ solar_system_id: 2 }, epoch + 22000, 5000) }));
    assert.equal(stream.getOPSEC().state, 'hostile');
    assert.deepEqual(events.map(e => e.payload.state), ['blue', 'hostile']);
    assert.equal(stream.state().opsec.hidden, true);
});

test('jump continuity cannot extend its deadline, carry revealed High-Sec, or mask access and policy changes', () => {
    const c = context(), protect = createProtectionTracker();
    protect(c);
    const missing = { ...c, location: { ...c.location, status: 'stale' } };
    assert.equal(protect({ ...missing, now: epoch + 29000 }).state, 'blue');
    assert.equal(protect({ ...missing, now: epoch + 30000 }).state, 'unknown');
    assert.equal(protect({ ...missing, now: epoch + 31000 }).state, 'unknown');
    const safe = { ...c, sovereignty: sample([]) };
    assert.equal(protect(safe).state, 'highsec');
    const closed = protect({ ...safe, location: null });
    assert.equal(closed.state, 'unknown'); assert.equal(closed.hidden, true);
    for (const change of [{ available: false }, { characterId: 43 }, { settings: { ...c.settings, blueAlliances: [] } },
        { location: { ...c.location, status: 'missing_scope' } }, { location: { ...c.location, status: 'stale', errorStatus: 403 } },
        { fw: { ...c.fw, status: 'disabled' } }]) {
        const freshTracker = createProtectionTracker(); freshTracker(c);
        assert.equal(freshTracker({ ...missing, ...change }).state, 'unknown');
    }
    protect(c); assert.equal(protect({ ...missing, manual: true }).state, 'manual');
    assert.equal(protect(missing).state, 'unknown');
    protect(c);
    assert.equal(protect({ ...c, location: sample({ solar_system_id: 3 }), system: { security_status: -.5 } }).state, 'neutral');
});

test('core reads refreshable protection evidence separately from stale UI snapshots and does not spam history', async t => {
    const { dir, store } = await storage(t), at = Date.now() - 8000, c = context(at);
    store.set('opsec', c.settings);
    for (const key of ['location', 'profile', 'contacts']) store.saveSnapshot(42, key, c[key]);
    for (const key of ['fw', 'sovereignty']) store.saveSnapshot(0, key, c[key]);
    const auth = { characters: () => [{ id: 42, scopes: allScopes }] };
    const core = await createCore(store, auth, { health: () => ({}) }, dir, { noSync: true });
    try {
        assert.equal(core.snapshots(42).location.status, 'stale');
        assert.equal(core.stream.getOPSEC().state, 'blue');
        for (let i = 0; i < 20; i++) core.refreshOPSEC();
        store.saveSnapshot(42, 'location', { ...c.location, status: 'stale', errorStatus: 503 });
        core.refreshOPSEC();
        assert.equal(core.stream.getOPSEC().pending, true);
        store.saveSnapshot(42, 'location', sample({ solar_system_id: 2 }, Date.now(), 5000));
        core.refreshOPSEC();
        const events = store.db.prepare("SELECT summary FROM events WHERE type='opsec.changed' ORDER BY id").all();
        assert.deepEqual(events.map(e => e.summary), ['Broadcast protection: unknown → blue', 'Broadcast protection: blue → hostile']);
    } finally { await core.close(); }
});

test('location refresh proceeds during a slow collector and shares in-flight work with the main sync', async t => {
    const { dir, store } = await storage(t);
    let location = 1, locationCalls = 0, releaseAssets, markAssets;
    const assets = new Promise(r => { releaseAssets = r; }), assetsStarted = new Promise(r => { markAssets = r; });
    const request = async path => {
        if (path.includes('/assets')) { markAssets(); await assets; }
        let data = [];
        if (path.endsWith('/location')) { locationCalls++; data = { solar_system_id: location }; }
        else if (path === '/characters/42') data = { corporation_id: 5 };
        else if (path.startsWith('/universe/systems/')) data = { name: 'System ' + location, constellation_id: 10, security_status: -.5 };
        else if (path.startsWith('/universe/constellations/')) data = { region_id: 20 };
        else if (path === '/sovereignty/systems') data = { solar_systems: [{ solar_system_id: 1, claim: { alliance: { alliance_id: 77 } } }, { solar_system_id: 2, claim: { alliance: { alliance_id: 88 } } }] };
        return { ...sample(data, Date.now()), headers: {} };
    };
    store.set('opsec', context().settings);
    const core = await createCore(store, { characters: () => [{ id: 42, scopes: allScopes }] }, { request, paged: request, names: async () => ({}), health: () => ({}) }, dir, { noSync: true });
    let sync;
    try {
        sync = core.sync(42);
        await assetsStarted;
        await core.syncProtection();
        assert.equal(core.stream.getOPSEC().state, 'blue');
        assert.equal(locationCalls, 1);
        location = 2;
        core.requestSync(42);
        await core.syncProtection();
        assert.equal(locationCalls, 2);
        assert.equal(core.stream.getOPSEC().state, 'hostile');
        assert.equal(core.health().syncing.includes(42), true);
    } finally { releaseAssets(); await sync; await core.close(); }
});

test('ESI prioritizes protection requests within its concurrency cap and preserves access-denied status', async t => {
    const { store } = await storage(t), releases = [], seen = [];
    const esi = createESI(store, {}, { fetcher: async url => {
        const path = new URL(url).pathname; seen.push(path);
        if (path.startsWith('/busy')) await new Promise(r => releases.push(r));
        return new Response('{}', { status: path === '/denied' ? 403 : 200 });
    } });
    const busy = [0, 1, 2, 3].map(i => esi.request('/busy' + i));
    await turn();
    const normal = esi.request('/normal'), priority = esi.request('/location', { priority: true });
    assert.equal(esi.health().active, 4);
    releases.shift()(); await priority; await normal;
    assert.equal(seen[4], '/location');
    releases.splice(0).forEach(r => r()); await Promise.all(busy);
    const at = Date.now();
    store.db.prepare('INSERT INTO cache VALUES(?,?,?,?,?,?)').run('0:GET:/denied:', '{}', null, 0, at, '{}');
    const denied = await esi.request('/denied');
    assert.equal(denied.stale, true); assert.equal(denied.errorStatus, 403);
});

test('ESI resumes protection requests after cooldown instead of retaining a rejected in-flight promise', async t => {
    const { store } = await storage(t);
    let clock = Date.now(), calls = 0;
    t.mock.method(Date, 'now', () => clock);
    const esi = createESI(store, {}, { fetcher: async () => {
        calls++;
        return new Response('{}', { status: calls === 1 ? 429 : 200, headers: { 'Retry-After': '60' } });
    } });
    await assert.rejects(esi.request('/rate-limited'));
    await assert.rejects(esi.request('/location', { priority: true }));
    assert.equal(calls, 1);
    clock += 60001;
    assert.deepEqual((await esi.request('/location', { priority: true })).data, {});
    assert.equal(calls, 2);
});

test('activity API returns five newest entries, pages equal timestamps without gaps, and searches all history', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-activity-http-'));
    const app = await startKairo({ port: 18410, streamPort: 18411, dataDir: dir, noSync: true });
    t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
    const cookie = (await fetch(app.origin)).headers.get('set-cookie').split(';')[0];
    const insert = app.store.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)');
    const expected = [];
    for (let i = 0; i < 17; i++) expected.unshift(Number(insert.run(null, 'test.event', 'test', 'Flight event ' + i, '{}', new Date(epoch).toISOString()).lastInsertRowid));
    insert.run(43, 'private.event', 'test', 'Other pilot', '{}', new Date(epoch + 1000).toISOString());
    const get = async query => {
        const r = await fetch(app.origin + '/api/timeline?' + query, { headers: { Cookie: cookie } });
        assert.equal(r.status, 200); return r.json();
    };
    let page = await get(''), all = page.items.map(e => e.id);
    assert.deepEqual(all, expected.slice(0, 5));
    while (page.more) {
        page = await get(new URLSearchParams({ limit: '5', before: page.nextCursor.at, beforeId: String(page.nextCursor.id) }));
        assert.ok(page.items.length <= 5); all.push(...page.items.map(e => e.id));
    }
    assert.deepEqual(all, expected);
    const found = await get('q=Flight%20event%200');
    assert.equal(found.items.length, 1); assert.equal(found.items[0].summary, 'Flight event 0');
    const bad = await fetch(app.origin + '/api/timeline?limit=-1', { headers: { Cookie: cookie } });
    assert.equal(bad.status, 400);
});
