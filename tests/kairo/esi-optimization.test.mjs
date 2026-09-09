import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setImmediate as turn } from 'node:timers/promises';
import { openStore } from '../../server/store.mjs';
import { createESI } from '../../server/esi.mjs';
import { createCore } from '../../server/core.mjs';
import { catalog, allScopes } from '../../server/modules/catalog.mjs';
import { bindingProjection } from '../../server/projections.mjs';
import { captureContext } from '../../server/history.mjs';
import { listGoals } from '../../server/goals.mjs';
import { createMarkets, JITA } from '../../server/markets.mjs';
import { startKairo } from '../../server/index.mjs';

const iso = ms => new Date(ms).toISOString();
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
async function storage(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-esi-opt-')), store = openStore(dir);
    t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
    return { dir, store };
}
async function scheduler(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-schedule-')), store = openStore(dir), epoch = Date.now();
    let clock = epoch, core;
    t.mock.method(Date, 'now', () => clock);
    const characters = [{ id: 42, name: 'Pilot', scopes: [...allScopes] }];
    const auth = { characters: () => characters, access: async id => 'token-' + id };
    const calls = [], state = { station: undefined, ship: 587, level: 1, queue: [{ skill_id: 3300, queue_position: 0, finished_level: 2, start_date: iso(epoch), finish_date: iso(epoch + 86400000) }] };
    const ages = { location: 5, ship: 5, online: 60, skills: 60, skillqueue: 60, attributes: 120, clones: 120, implants: 120, calendar: 5, notifications: 600, mail: 30, wallet: 120 };
    const esi = createESI(store, auth, { fetcher: async (url, options) => {
        const u = new URL(url), path = u.pathname, key = path.split('/').at(-1);
        calls.push(path);
        let data = [], age = ages[key] || 3600;
        if (path === '/universe/names') data = JSON.parse(options.body).map(id => ({ id, name: 'Item ' + id, category: 'inventory_type' }));
        else if (path === '/characters/42') data = { name: 'Pilot', corporation_id: 5, alliance_id: 77 };
        else if (path.startsWith('/corporations/')) data = { name: 'Corporation' };
        else if (path.startsWith('/alliances/')) data = { name: 'Alliance' };
        else if (key === 'location') data = { solar_system_id: 30000001, ...(state.station ? { station_id: state.station } : {}) };
        else if (key === 'ship') data = { ship_id: state.ship, ship_type_id: state.ship };
        else if (key === 'online') data = { online: true };
        else if (key === 'skills') data = { total_sp: 1000, skills: [{ skill_id: 3300, trained_skill_level: state.level }] };
        else if (key === 'skillqueue') data = state.queue;
        else if (key === 'wallet') data = 600;
        else if (path === '/sovereignty/systems') { age = 300; data = { solar_systems: [{ solar_system_id: 30000001, claim: { alliance: { alliance_id: 77 } } }] }; }
        else if (path.startsWith('/universe/systems/')) data = { name: 'Home', constellation_id: 20000001, security_status: -.5 };
        else if (path.startsWith('/universe/constellations/')) data = { name: 'Constellation', region_id: 10000001 };
        else if (path.startsWith('/universe/regions/')) data = { name: 'Region' };
        return json(data, 200, { 'Cache-Control': 'max-age=' + age });
    } });
    for (const m of catalog) store.set('module:' + m.id, ['pilot', 'training', 'comms', 'universe', 'wallet'].includes(m.id));
    async function restart() { await core?.close(); core = await createCore(store, auth, esi, dir, { noSync: true }); }
    await restart();
    t.after(async () => { await core.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
    return { store, auth, state, esi, get core() { return core; }, restart, epoch, characters,
        at: elapsed => { clock = epoch + elapsed; },
        pump: () => Promise.all([core.syncProtection(), core.sync(0), core.sync(42)]),
        count: path => calls.filter(p => p === path).length,
    };
}

test('routine polling reduces ship and slow dataset calls while location, OPSEC and one-minute queue checks continue', async t => {
    const h = await scheduler(t);
    for (let ms = 0; ms <= 300000; ms += 3000) {
        h.at(ms); await h.pump();
        assert.equal(h.core.stream.getOPSEC().state, 'blue');
    }
    assert.equal(h.count('/characters/42/location'), 51);
    assert.equal(h.count('/characters/42/ship'), 6);
    assert.equal(h.count('/characters/42/skillqueue'), 6);
    assert.equal(h.count('/characters/42/skills'), 1);
    for (const endpoint of ['attributes', 'clones', 'implants', 'calendar']) assert.equal(h.count('/characters/42/' + endpoint), 1, endpoint);
    assert.equal(h.count('/characters/42/mail'), 2);
    assert.equal(h.count('/sovereignty/systems'), 2);
    assert.equal(h.store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='opsec.changed'").get().n, 1);
    assert.equal(h.core.snapshots(42).skills.status, 'ready');
});

test('warm restart, module toggles and cache reads do not reset observation times or repeat routine work', async t => {
    const h = await scheduler(t); await h.pump();
    const original = h.store.snapshot(42, 'skills');
    h.at(90000); await h.restart(); await h.pump();
    assert.equal(h.count('/characters/42/skills'), 1);
    assert.equal(h.store.snapshot(42, 'skills').updatedAt, original.updatedAt);
    assert.equal(h.core.snapshots(42).skills.status, 'ready');
    assert.equal(captureContext(h.store, 42).skillpoints, 1000);
    assert.equal(bindingProjection(h.store, h.auth, { binding: 'pilot.ship', characterId: 42 }).bindingStatus, 'ready');
    h.core.toggle('comms', false); h.core.toggle('comms', true); await h.pump();
    assert.equal(h.count('/characters/42/calendar'), 1);
    assert.equal(h.count('/characters/42/skills'), 1);
    await h.core.requestSync(42);
    assert.equal(h.count('/characters/42/skills'), 2, 'explicit refresh can bring an expired HTTP cache forward');
    const count = h.count('/characters/42/skills');
    await h.core.requestSync(42);
    assert.equal(h.count('/characters/42/skills'), count, 'explicit refresh still honors ESI expiry');
    h.characters[0].scopes = h.characters[0].scopes.filter(s => s !== 'esi-skills.read_skillqueue.v1');
    await h.pump();
    assert.equal(h.core.snapshots(42).queue.status, 'missing_scope');
    assert.equal(bindingProjection(h.store, h.auth, { binding: 'training.remaining', characterId: 42 }).bindingStatus, 'unavailable');
});

test('one-minute queue checks detect edits and cancellation regardless of the predicted finish time', async t => {
    const h = await scheduler(t); await h.pump();
    const goal = h.core.goals.create(42, { title: 'Train', source: 'skill.level', typeId: 3300, target: 2 }, { id: 3300, categoryId: 16 });
    h.state.queue = [{ ...h.state.queue[0], finish_date: iso(h.epoch + 100000) }];
    h.at(59000); await h.pump(); assert.equal(h.count('/characters/42/skillqueue'), 1);
    h.at(60000); await h.pump(); assert.equal(h.count('/characters/42/skillqueue'), 2);
    assert.equal(h.store.snapshot(42, 'queue').data[0].finish_date, iso(h.epoch + 100000));
    h.state.queue = [];
    h.at(120000); await h.pump();
    assert.equal(h.count('/characters/42/skillqueue'), 3);
    assert.deepEqual(h.store.snapshot(42, 'queue').data, []);
    assert.equal(listGoals(h.store, h.auth, 42).find(g => g.id === goal.id).done, 0, 'cancelled training must not complete a goal from an old prediction');
});

test('known completions bring trained-skill refresh forward without stopping regular queue polling or goal updates', async t => {
    const h = await scheduler(t);
    h.state.queue[0].finish_date = iso(h.epoch + 120000);
    await h.pump();
    const g = h.core.goals.create(42, { title: 'Train', source: 'skill.level', typeId: 3300, target: 2 }, { id: 3300, categoryId: 16 });
    for (let ms = 3000; ms <= 126000; ms += 3000) {
        h.at(ms); if (ms >= 120000) h.state.level = 2;
        await h.pump();
    }
    assert.equal(h.count('/characters/42/skillqueue'), 3);
    assert.equal(h.count('/characters/42/skills'), 2);
    assert.equal(listGoals(h.store, h.auth, 42).find(goal => goal.id === g.id).done, 1);
    assert.equal(h.store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='goal.completed'").get().n, 1);
});

test('docking refreshes the ship promptly and broadcasts the new hull without accelerating ordinary location ticks', async t => {
    const h = await scheduler(t); await h.pump();
    h.at(12000); await h.pump(); assert.equal(h.count('/characters/42/ship'), 1);
    h.at(18000); h.state.station = 60000001; h.state.ship = 588;
    await h.pump(); await turn();
    assert.equal(h.count('/characters/42/ship'), 2);
    assert.equal(h.store.snapshot(42, 'ship').data.ship_type_id, 588);
    assert.equal(bindingProjection(h.store, h.auth, { binding: 'pilot.ship', characterId: 42 }).text, 'Item 588');
    assert.equal(h.core.stream.getOPSEC().state, 'blue');
});

test('public names coalesce overlapping batches, persist per ID, and never borrow private character access', async t => {
    const { store } = await storage(t), requests = [];
    const auth = { access: async id => 'token-' + id };
    const fetcher = async (url, options) => {
        requests.push({ url, ...options });
        await turn();
        return json(url.endsWith('/universe/names') ? JSON.parse(options.body).map(id => ({ id, name: 'Name ' + id })) : { name: options.headers.Authorization }, 200, { 'Cache-Control': 'max-age=86400' });
    };
    let esi = createESI(store, auth, { fetcher });
    const [a, b] = await Promise.all([esi.names([1, 2, 1]), esi.names([2, 3], { characterId: 42 })]);
    assert.deepEqual(a, { 1: 'Name 1', 2: 'Name 2' }); assert.deepEqual(b, { 2: 'Name 2', 3: 'Name 3' });
    assert.deepEqual(requests.flatMap(r => JSON.parse(r.body)).sort(), [1, 2, 3]);
    assert.ok(requests.every(r => !r.headers.Authorization));
    esi = createESI(store, auth, { fetcher });
    assert.deepEqual(await esi.names([3, 1]), { 1: 'Name 1', 3: 'Name 3' }); assert.equal(requests.length, 2);
    for (const id of [42, 43]) assert.equal((await esi.request('/universe/structures/1000000000001', { characterId: id })).data.name, 'Bearer token-' + id);
    assert.equal(requests.length, 4);
    assert.deepEqual(esi.cachedNames([1000000000001]), {});
});

test('equivalent query order shares a cache; 304 uses validators and retains its cache policy', async t => {
    const { store } = await storage(t); let clock = Date.now(), count = 0, seen;
    t.mock.method(Date, 'now', () => clock);
    const esi = createESI(store, {}, { fetcher: async (url, options) => {
        seen = options.headers; count++;
        return count === 1 ? json([34], 200, { 'Cache-Control': 'max-age=60', Age: '10', ETag: '"a"' }) : new Response(null, { status: 304 });
    } });
    const path = '/markets/10000002/orders?type_id=34&order_type=all&page=1';
    const first = await esi.request(path);
    assert.equal(Date.parse(first.expiresAt), clock + 50000);
    await esi.request('/markets/10000002/orders/?page=1&order_type=all&type_id=34'); assert.equal(count, 1);
    clock += 50001; const updated = await esi.request(path);
    assert.equal(seen['If-None-Match'], '"a"'); assert.equal(Date.parse(updated.expiresAt), clock + 60000);
    assert.deepEqual(updated.data, [34]); assert.equal(esi.health().notModified, 1);
});

test('resource retry backoff survives restart, retains stale observations and recovers without repeated failures', async t => {
    const { store } = await storage(t); let clock = Date.now(), count = 0, fail = false;
    t.mock.method(Date, 'now', () => clock);
    const fetcher = async () => { count++; return fail ? json({}, 503, { 'Retry-After': '120' }) : json({ name: 'Cached' }, 200, { 'Cache-Control': 'max-age=5' }); };
    let esi = createESI(store, {}, { fetcher }); const original = await esi.request('/universe/types/34');
    clock += 6000; fail = true;
    const stale = await esi.request('/universe/types/34'); assert.equal(stale.stale, true);
    assert.equal(stale.updatedAt, original.updatedAt); assert.equal(stale.expiresAt, original.expiresAt);
    esi = createESI(store, {}, { fetcher });
    for (let i = 0; i < 10; i++) await esi.request('/universe/types/34', { force: true });
    assert.equal(count, 2);
    clock = Date.parse(stale.retryAt) + 1; fail = false;
    assert.equal((await esi.request('/universe/types/34')).stale, undefined); assert.equal(count, 3);
});

test('market rate buckets survive restart without blocking unrelated protection or another character', async t => {
    const { store } = await storage(t); const seen = [];
    const auth = { access: async id => String(id) };
    const fetcher = async (url, options) => {
        seen.push(url);
        if (url.includes('/orders')) return json({}, 429, { 'Retry-After': '300', 'X-Ratelimit-Group': 'market-order' });
        if (url.includes('/structures/') && options.headers.Authorization === 'Bearer 42') return json({}, 429, { 'Retry-After': '300', 'X-Ratelimit-Group': 'market-structure' });
        return json({});
    };
    let esi = createESI(store, auth, { fetcher });
    await assert.rejects(esi.request('/markets/10000002/orders?page=1'));
    esi = createESI(store, auth, { fetcher });
    await assert.rejects(esi.request('/markets/10000043/orders?page=2'));
    assert.equal(seen.length, 1);
    await esi.request('/sovereignty/systems', { priority: true }); assert.equal(seen.length, 2);
    await assert.rejects(esi.request('/markets/structures/1000000000001', { characterId: 42 }));
    await esi.request('/markets/structures/1000000000001', { characterId: 43 });
    await esi.request('/characters/42/location', { characterId: 42, priority: true });
    assert.equal(seen.length, 5);
});

test('transient location failures retry quickly while unavailable static resources back off', async t => {
    const { store } = await storage(t); let clock = Date.now(), count = 0;
    t.mock.method(Date, 'now', () => clock);
    const esi = createESI(store, { access: async () => 'token' }, { fetcher: async () => { count++; return json({}, 404); } });
    const errors = [];
    for (const path of ['/characters/42/location', '/universe/systems/32000001']) {
        try { await esi.request(path); } catch (e) { errors.push(e); }
    }
    assert.equal(Date.parse(errors[0].retryAt), clock + 3000);
    assert.equal(Date.parse(errors[1].retryAt), clock + 300000);
    clock += 3001;
    await assert.rejects(esi.request('/characters/42/location'));
    await assert.rejects(esi.request('/universe/systems/32000001'));
    assert.equal(count, 3);
});

test('market scans reuse names learned elsewhere and fresh books across alts without background ESI calls', async t => {
    const { store } = await storage(t), requests = [];
    const auth = { characters: () => [{ id: 42, name: 'Main', scopes: allScopes }, { id: 43, name: 'Alt', scopes: allScopes }], access: async () => { throw new Error('Public scans must not request tokens'); } };
    const esi = createESI(store, auth, { fetcher: async (url, options) => {
        requests.push(url);
        if (url.endsWith('/universe/names')) return json(JSON.parse(options.body).map(id => ({ id, name: 'Item ' + id, category: 'inventory_type' })), 200, { 'Cache-Control': 'max-age=86400' });
        if (url.includes('/history?')) return json([], 200, { 'Cache-Control': 'max-age=86400' });
        return json([{ order_id: 1, type_id: 34, location_id: JITA, price: 5, volume_remain: 1000, is_buy_order: false, min_volume: 1, range: 'station', issued: iso(Date.now()), duration: 90 }], 200, { 'Cache-Control': 'max-age=300' });
    } });
    await esi.names([34]);
    store.set('market:quick', [34]);
    const markets = createMarkets(store, auth, esi, { spacingMs: 0, historySource: 'esi' });
    try {
        for (const id of [43, 42]) { markets.start({ hubId: JITA, characterId: id, mode: 'quick' }); await markets.idle(); }
        assert.equal(markets.overview().job.status, 'complete');
        assert.equal(markets.browse(JITA).rows[0].name, 'Item 34');
        assert.equal(requests.length, 3, 'one names, one orders and one history request');
        for (let i = 0; i < 5; i++) { markets.overview(); markets.browse(JITA); markets.categories(JITA); markets.report(JITA); }
        assert.equal(requests.length, 3, 'browsing never polls ESI');
    } finally { await markets.close(); }
});

test('custom polling persists, changes real request cadence and keeps protection evidence current', async t => {
    const h = await scheduler(t); await h.pump();
    const initial = h.core.pollingSettings();
    h.core.savePolling({ ...initial.intervals, ship: 300, queue: 120, sovereignty: 3600, skills: 1800 });
    await h.restart();
    assert.equal(h.core.pollingSettings().intervals.ship, 300);
    for (let ms = 3000; ms <= 300000; ms += 3000) {
        h.at(ms); await h.pump(); assert.equal(h.core.stream.getOPSEC().state, 'blue');
    }
    assert.equal(h.count('/characters/42/ship'), 2);
    assert.equal(h.count('/characters/42/skillqueue'), 3);
    assert.equal(h.count('/sovereignty/systems'), 2, 'OPSEC overrides slow routine context when its evidence expires');
    assert.equal(h.count('/characters/42/skills'), 1);
    h.at(330000);
    h.core.savePolling({ ...h.core.pollingSettings().intervals, ship: 30 }); await h.pump();
    assert.equal(h.count('/characters/42/ship'), 3, 'shorter rates are applied to the observation, not to the Save time');
    const reset = h.core.savePolling({});
    assert.equal(reset.intervals.queue, 60); assert.equal(reset.intervals.ship, 60);
});

test('polling updates validate every batch atomically and cannot make failed snapshots or disabled modules ready', async t => {
    const h = await scheduler(t); await h.pump();
    const previous = h.core.pollingSettings(), keys = catalog.flatMap(m => m.datasets.map(d => d.key));
    assert.equal(previous.groups.flatMap(g => g.batches).length, keys.length);
    for (const group of previous.groups) for (const batch of group.batches) {
        assert.ok(batch.description.length > 40); assert.ok(batch.choices.includes(batch.recommended));
    }
    for (const invalid of [null, [], { queue: '60' }, { queue: 0 }, { ship: -1 }, { location: 60 }, { tokens: 1 }, { ship: 120, queue: 61 }]) {
        assert.throws(() => h.core.savePolling(invalid));
        assert.deepEqual(h.core.pollingSettings().intervals, previous.intervals);
    }
    const s = h.store.snapshot(42, 'ship');
    h.store.saveSnapshot(42, 'ship', { ...s, status: 'stale', errorStatus: 403 });
    h.core.savePolling({ ...previous.intervals, ship: 600 });
    assert.equal(h.store.snapshot(42, 'ship').status, 'stale');
    assert.equal(h.store.snapshot(42, 'ship').updatedAt, s.updatedAt);
    assert.equal(bindingProjection(h.store, h.auth, { binding: 'pilot.ship', characterId: 42 }).bindingStatus, 'unavailable');
    h.core.toggle('training', false); h.core.savePolling({ ...previous.intervals, skills: 60 });
    h.at(900000); await h.pump();
    assert.equal(h.count('/characters/42/skills'), 1);
    assert.equal(h.core.snapshots(42).skills.status, 'disabled');
});

test('polling preferences require a local session and CSRF, survive restart and are absent from OBS', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-polling-http-'));
    const options = { port: 18450, streamPort: 18451, dataDir: dir, noSync: true };
    let app = await startKairo(options);
    t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
    const address = '/api/settings/polling';
    assert.equal((await fetch(app.origin + address)).status, 401);
    assert.equal((await fetch(app.streamOrigin + address)).status, 404);
    const cookie = (await fetch(app.origin)).headers.get('set-cookie').split(';')[0];
    const boot = await fetch(app.origin + '/api/bootstrap', { headers: { cookie } }).then(r => r.json());
    const request = (body, csrf) => fetch(app.origin + address, { method: 'PUT', headers: { cookie, origin: app.origin, 'Content-Type': 'application/json', ...(csrf ? { 'X-Kairo-CSRF': csrf } : {}) }, body: JSON.stringify(body) });
    const initial = await fetch(app.origin + address, { headers: { cookie } }).then(r => r.json());
    assert.equal(initial.intervals.queue, 60);
    assert.equal((await request({ intervals: { ship: 300 } })).status, 403);
    assert.equal((await request({ intervals: { location: 300 } }, boot.csrf)).status, 400);
    const saved = await request({ intervals: { ...initial.intervals, ship: 300 } }, boot.csrf);
    assert.equal(saved.status, 200); assert.equal((await saved.json()).intervals.ship, 300);
    await app.close(); app = await startKairo(options);
    const freshCookie = (await fetch(app.origin)).headers.get('set-cookie').split(';')[0];
    const restored = await fetch(app.origin + address, { headers: { cookie: freshCookie } }).then(r => r.json());
    assert.equal(restored.intervals.ship, 300); assert.equal(restored.intervals.queue, 60);
});
