import test from 'node:test';
import {publicChainScene} from '../../components/kairo/jspace-workspace-model.mjs';
import assert from 'node:assert/strict';
import { createUniverseFeeds } from '../../server/universe-feeds.mjs';
import { FEED_URLS, normalizeConnections, normalizeObservations, normalizeDevelopment, npcDeltas, npcSample, stormArea } from '../../server/universe-feed-model.mjs';

const AT = Date.parse('2026-09-25T12:00:00Z');
const iso = delta => new Date(AT + delta).toISOString();
const A = 30000001, B = 30000002, C = 30000003, D = 30000004, T = 31000005, U = 30002086;
const atlas = { systems: [
    { system_id: A, name: 'Alpha', space: 'known', security: -.2 }, { system_id: B, name: 'Beta', space: 'known', security: -.2 },
    { system_id: C, name: 'Gamma', space: 'known', security: -.2 }, { system_id: D, name: 'Delta', space: 'known', security: -.2 },
    { system_id: T, name: 'Thera', space: 'wormhole', security: -1 }, { system_id: U, name: 'Turnur', space: 'known', security: .4 },
], gates: [{ from_system_id: A, to_system_id: B }, { from_system_id: B, to_system_id: C }, { from_system_id: C, to_system_id: D }] };
const wh = (extra = {}) => ({ id: '4', signature_type: 'wormhole', out_system_id: T, in_system_id: A,
    out_signature: 'AAA-111', in_signature: 'BBB-222', completed: true, expires_at: iso(3600000), updated_at: iso(-10000), max_ship_size: 'large', wh_type: 'N110', ...extra });
const observation = (extra = {}) => ({ id: '8', observation_category: 'storm', observation_type: 'electric_a', system_id: A,
    created_at: iso(-3600000), display_name: 'Electric storm', observed_in_person: false, ...extra });
const kill = (sequence, killId = sequence) => ({ sequence_id: sequence, killmail_id: killId,
    esi: { killmail_time: iso(-30000), solar_system_id: A, victim: { ship_type_id: 587, alliance_id: 99 } }, zkb: { totalValue: 300000 } });
const response = (data, status = 200, headers = {}) => new Response(status === 304 ? null : JSON.stringify(data), { status, headers });
const sample = (data, extra = {}) => ({ status: 'ready', data, updatedAt: iso(0), expiresAt: iso(3600000), ...extra });
function fixture(t, fetcher = async () => { throw new Error('Unexpected network call'); }, options = {}) {
    const values = new Map(), snapshots = new Map(); let time = AT, calls = [];
    const store = { get: (k, fallback) => values.has(k) ? structuredClone(values.get(k)) : fallback,
        set: (k, value) => values.set(k, structuredClone(value)), snapshot: (id, key) => snapshots.get(id + ':' + key) || null };
    const service = createUniverseFeeds(store, {}, { atlas, now: () => time, fetcher: async (url, options) => { calls.push({ url, options }); return fetcher(url, options); }, points: { items: [], metadata: {} }, ...options });
    t.after(() => service.close());
    return { service, store, calls, snapshots, time: v => { time = v; } };
}
function cacheFreshFeeds(store) {
    for (const source of Object.keys(FEED_URLS)) store.set('universe:feeds:' + source, {
        status: 'ready', updated_at: iso(0), expires_at: iso(3600000),
        data: source === 'storms' ? { storms: [], points: [] } : [],
    });
}
function trackReads(store) {
    const reads = { get: [], snapshot: [] }, get = store.get, snapshot = store.snapshot;
    store.get = (...args) => { reads.get.push(args[0]); return get(...args); };
    store.snapshot = (...args) => { reads.snapshot.push(args); return snapshot(...args); };
    return reads;
}
test('quiet scheduled feed upkeep records NPC windows without reading or building display data', async t => {
    let notifications = 0;
    const { service, store, calls, snapshots, time } = fixture(t, undefined, { onChange: () => notifications++ });
    cacheFreshFeeds(store);
    snapshots.set('0:kills', sample([{ system_id: A, npc_kills: 20 }], { sourceModifiedAt: iso(-10000) }));
    const reads = trackReads(store);
    assert.equal(await service.tick(), undefined);
    const first = store.get('universe:feeds:npc-windows');
    assert.equal(first.previous, null); assert.equal(first.current.at, iso(-10000));
    assert.equal(await service.tick(), undefined);
    assert.deepEqual(store.get('universe:feeds:npc-windows'), first);
    time(AT + 2000);
    snapshots.set('0:kills', sample([{ system_id: A, npc_kills: 5 }], { sourceModifiedAt: iso(1000) }));
    await service.tick();
    const next = store.get('universe:feeds:npc-windows');
    assert.deepEqual(next.previous, first.current); assert.equal(next.current.at, iso(1000));
    assert.deepEqual(reads.snapshot, [[0, 'kills'], [0, 'kills'], [0, 'kills']]);
    assert.ok(!reads.get.includes('universe:feeds:manual-storms'));
    assert.equal(calls.length, 0); assert.equal(notifications, 0);
});
test('explicit feed refresh still validates sources and returns the full current view', async t => {
    const { service, store, snapshots } = fixture(t, undefined, { noSync: true });
    cacheFreshFeeds(store);
    snapshots.set('0:sovereignty_campaigns', sample([{ campaign_id: 7, solar_system_id: A,
        constellation_id: 2, structure_id: 300, event_type: 'ihub_defense', start_time: iso(-10000) }]));
    snapshots.set('0:sovereignty', sample([{ system_id: A, claim: { alliance: { alliance_id: 88,
        development: { activity_defense_multiplier: 3.2 }, sovereignty_hub: { id: 300 } } } }]));
    snapshots.set('0:kills', sample([{ system_id: A, npc_kills: 20 }], { sourceModifiedAt: iso(-10000) }));
    const reads = trackReads(store);
    await assert.rejects(service.refresh('arbitrary-url'), /known public source/);
    assert.deepEqual(reads.snapshot, []);
    const value = await service.refresh({ source: 'campaigns' });
    assert.deepEqual(value, service.state());
    assert.equal(value.campaigns[0].id, 7); assert.equal(value.development[0].adm, 3.2);
    assert.equal(value.sources.npc_deltas.status, 'waiting');
    assert.equal(store.get('universe:feeds:npc-windows').current.at, iso(-10000));
});
test('scheduled upkeep prunes connection deadlines crossed during collection, including a module disable', async t => {
    for (const disableWhileWaiting of [false, true]) {
        let release, started, notifications = 0;
        const waiting = new Promise(resolve => { started = resolve; }), forgotten = [];
        const { service, store, calls, time } = fixture(t, async url => {
            assert.equal(url, FEED_URLS.storms); started();
            return new Promise(resolve => { release = resolve; });
        }, { onChange: () => notifications++, onForgetConnections: rows => forgotten.push(...rows),
            setExpiryTimer: () => 1, clearExpiryTimer: () => {} });
        cacheFreshFeeds(store);
        store.set('universe:feeds:thera', { ...store.get('universe:feeds:thera'),
            data: normalizeConnections([wh({ expires_at: iso(1000) })], 'thera', atlas, AT) });
        store.set('universe:feeds:storms', { ...store.get('universe:feeds:storms'), expires_at: iso(-1) });
        const reads = trackReads(store), pending = service.tick();
        await waiting;
        time(AT + 2000);
        if (disableWhileWaiting) store.set('module:universe', false);
        release(response([]));
        assert.equal(await pending, undefined);
        assert.deepEqual(store.get('universe:feeds:thera').data, []);
        assert.deepEqual(forgotten.map(row => row.id), ['thera:4']);
        assert.deepEqual(reads.snapshot, [[0, 'kills']]);
        assert.equal(calls.length, 1); assert.equal(notifications, 1);
    }
});
test('disabled and noSync scheduled ticks expire connections without collecting or projecting feeds', async t => {
    for (const noSync of [false, true]) {
        let notifications = 0; const forgotten = [];
        const { service, store, calls, snapshots } = fixture(t, undefined, { noSync,
            onChange: () => notifications++, onForgetConnections: rows => forgotten.push(...rows),
            setExpiryTimer: () => 1, clearExpiryTimer: () => {} });
        if (!noSync) store.set('module:universe', false);
        store.set('universe:feeds:thera', { data: [{ id: 'thera:4', expires_at: iso(-1) }] });
        snapshots.set('0:kills', sample([{ system_id: A, npc_kills: 20 }]));
        const reads = trackReads(store);
        assert.equal(await service.tick(), undefined);
        assert.deepEqual(store.get('universe:feeds:thera').data, []);
        assert.deepEqual(forgotten.map(row => row.id), ['thera:4']);
        assert.equal(store.get('universe:feeds:npc-windows', null), null);
        assert.deepEqual(reads.snapshot, []);
        assert.ok(!reads.get.includes('universe:feeds:manual-storms'));
        assert.equal(calls.length, 0); assert.equal(notifications, 0);
    }
});
test('closing a scheduled feed collection drains its request without post-close storage work', async t => {
    let started, closing = false, notifications = 0;
    const waiting = new Promise(resolve => { started = resolve; });
    const { service, store } = fixture(t, async (_url, { signal }) => {
        started();
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
    }, { onChange: () => notifications++ });
    cacheFreshFeeds(store);
    store.set('universe:feeds:storms', { ...store.get('universe:feeds:storms'), expires_at: iso(-1) });
    for (const method of ['get', 'set', 'snapshot']) {
        const original = store[method];
        store[method] = (...args) => { assert.equal(closing, false, 'storage work after feed close: ' + method); return original(...args); };
    }
    const pending = service.tick(); await waiting;
    const closed = service.close(); closing = true;
    await closed; assert.equal(await pending, undefined);
    assert.equal(await service.tick(), undefined); assert.equal(notifications, 0);
});
test('wormhole reports retain limitations, discard incomplete or expired, and validate the actual hub', () => {
    const rows = normalizeConnections([wh(), wh({ id: '5', completed: false }), wh({ id: '6', expires_at: iso(-1) })], 'thera', atlas, AT);
    assert.equal(rows.length, 1); assert.equal(rows[0].max_ship_size, 'large'); assert.equal(rows[0].completed, true);
    assert.equal(rows[0].reported, true); assert.equal(rows[0].from_signature, 'AAA-111');
    assert.throws(() => normalizeConnections([wh({ out_system_id: B })], 'thera', atlas, AT), /matched/);
});
test('public connection expiry physically removes cached reports at their deadline, including while disabled', async t => {
    const timers=new Map(),removed=[];let next=0;
    const {service,store,time}=fixture(t,async()=>response([wh({expires_at:iso(60000)})]),{setExpiryTimer:(fn,ms)=>{const key=++next;timers.set(key,{fn,ms});return key;},clearExpiryTimer:key=>timers.delete(key),onForgetConnections:rows=>removed.push(...rows)});
    await service.refresh({source:'thera'});assert.equal([...timers.values()][0].ms,60000);
    store.set('module:universe',false);time(AT+60000);const callback=[...timers.values()][0].fn;timers.clear();callback();
    assert.deepEqual(store.get('universe:feeds:thera').data,[]);assert.deepEqual(removed.map(row=>row.id),['thera:4']);assert.equal(timers.size,0);
});
test('304 and failed in-flight refreshes cannot restore a report that expired while waiting', async t => {
    for(const failed of [false,true]) {
        let count=0,release;const waiting=new Promise(resolve=>release=resolve);
        const {service,store,time}=fixture(t,async()=>{if(++count===1)return response([wh({expires_at:iso(600000)})]);await waiting;if(failed)throw new Error('Provider unavailable');return response(null,304);});
        await service.refresh({source:'thera'});time(AT+300001);const pending=service.refresh({source:'thera'});
        time(AT+600000);service.pruneExpired();assert.deepEqual(store.get('universe:feeds:thera').data,[]);
        release();await pending;assert.deepEqual(store.get('universe:feeds:thera').data,[]);assert.deepEqual(service.state().connections,[]);
    }
});
test('combat display window is explicit, bounded and preserves retained observations when shortened', t => {
    const {service,store}=fixture(t);
    store.set('universe:feeds:combat',{status:'ready',updated_at:iso(0),expires_at:iso(60000),data:[
        {killmail_id:1,time:iso(-10*60000)},{killmail_id:2,time:iso(-90*60000)}]});
    service.saveConfig({combat_enabled:true});assert.equal(service.state().combat.length,1);
    service.saveConfig({combat_enabled:true,combat_window_minutes:120});assert.equal(service.state().combat.length,2);
    service.saveConfig({combat_enabled:true,combat_window_minutes:5});assert.equal(service.state().combat.length,0);
    assert.equal(store.get('universe:feeds:combat').data.length,2);
    assert.throws(()=>service.saveConfig({combat_enabled:true,combat_window_minutes:121}),/5 to 120/);
});
test('storm areas follow real gates and preserve report age rather than confirmation claims', () => {
    assert.deepEqual(stormArea(A, atlas), { strong_system_ids: [A, B], weak_system_ids: [C, D] });
    const value = normalizeObservations([observation({ created_at: iso(-30 * 3600000) }), observation({ id: '9', observation_category: 'space_oddity', display_name: "Tom's Shuttle" })], atlas, AT);
    assert.equal(value.storms[0].stale, true); assert.equal(value.storms[0].expires_at, null); assert.equal(value.storms[0].observed_in_person, false);
    assert.equal(value.points[0].kind, 'space_oddity');
    assert.throws(() => normalizeObservations([observation({ system_id: U })], atlas, AT), /matched/);
});
test('feed fetches are cached, attributed, conditional, bounded and preserve stale data after a failure', async t => {
    let step = 0;
    const { service, calls, time } = fixture(t, async () => ++step === 1 ? response([wh()], 200, { 'cache-control': 'max-age=300', etag: 'first' }) : step === 2 ? response(null, 304) : response({}, 429, { 'retry-after': '120' }));
    await service.refresh({ source: 'thera' }); await service.refresh({ source: 'thera', force: true });
    assert.equal(calls.length, 1); assert.equal(calls[0].options.redirect, 'error'); assert.ok(calls[0].options.headers['User-Agent']);
    time(AT + 300001); await service.refresh('thera'); assert.equal(calls[1].options.headers['If-None-Match'], 'first');
    assert.equal(service.state().sources.thera.status, 'ready');
    time(AT + 600002); await service.refresh('thera');
    assert.equal(service.state().sources.thera.status, 'stale'); assert.equal(service.state().connections[0].stale, true);
    await service.refresh({ source: 'thera', force: true }); assert.equal(calls.length, 3);
    time(AT + 4000000); assert.equal(service.state().connections.length, 0);
});
test('wrong schemas and oversized payloads cannot erase last good reports', async t => {
    const { service, store } = fixture(t, async () => response({}, 200, { 'content-length': String(3 * 1024 * 1024) }));
    store.set('universe:feeds:storms', { status: 'ready', data: normalizeObservations([observation()], atlas, AT), updated_at: iso(-4000000), expires_at: iso(-1) });
    await service.refresh('storms'); const value = service.state();
    assert.equal(value.sources.storms.status, 'stale'); assert.equal(value.storms.length, 1); assert.match(value.sources.storms.error, /size limit/);
    await assert.rejects(service.refresh('arbitrary-url'), /known public source/);
});
test('wormhole type limits are nominal and never become remaining mass or confirmed lifetime', async t => {
    const { service, time } = fixture(t, async url => url === FEED_URLS.wormhole_types ? response([{ identifier: 'N110', type_id: 300,
        max_jump_mass: 62000000, max_stable_mass: 1000000000, mass_regeneration: 0, max_stable_time: 1440 }]) : response([wh({ remaining_hours: 1 })]));
    await service.refresh('thera'); let connection = service.state().connections[0];
    assert.equal(connection.max_jump_mass_kg, null); assert.equal(connection.mass_status, 'unknown');
    await service.refresh('wormhole_types'); connection = service.state().connections[0];
    assert.equal(connection.max_jump_mass_kg, 62000000); assert.equal(connection.max_stable_mass_kg, 1000000000);
    assert.equal(connection.nominal_lifetime_minutes, 1440); assert.equal(connection.remaining_mass_kg, null);
    assert.equal(connection.life, 'near_expiry'); assert.equal(connection.reported_remaining_hours, 1);
    assert.equal(connection.out_system_id, T); assert.equal(connection.in_system_id, A);
    time(AT + 1800000); assert.equal(service.state().connections[0].remaining_hours, .5);
});
test('manual storm import is atomic and keeps source provenance and explicit expiry', t => {
    const { service } = fixture(t);
    const valid = { system_id: A, type: 'Gamma', observed_at: iso(-1000), expires_at: iso(100000) };
    service.saveStorms([valid]); assert.equal(service.state().storms[0].source, 'manual');
    service.saveStorms(service.state().storms); assert.equal(service.state().storms[0].id, 'manual:report-0');
    assert.throws(() => service.saveStorms([valid, { ...valid, system_id: U }]), /null-security/);
    assert.equal(service.state().storms.length, 1);
    assert.throws(() => service.saveStorms([{ ...valid, observed_at: iso(3600000) }]), /observation time/);
});
test('shutdown aborts and waits for pending requests before returning without later writes', async t => {
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    const { service, store } = fixture(t, async (_url, { signal }) => {
        started(); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
    });
    const pending = service.refresh('thera'); await ready; await service.close(); await pending;
    assert.equal(store.get('universe:feeds:thera', null), null);
});
test('public combat is opt-in, independent, deduplicated by kill ID, and respects end-of-feed cooldown', async t => {
    let next = 10;
    const { service, calls, store, time } = fixture(t, async url => url === FEED_URLS.combat ? response({ sequence: 10 }) : next < 12 ? response(kill(next++, 100)) : response({}, 404));
    await service.refresh('combat'); assert.equal(calls.length, 0); assert.equal(service.state().sources.combat.status, 'disabled');
    service.saveConfig({ combat_enabled: true }); await service.refresh('combat');
    assert.equal(service.state().combat.length, 1); assert.equal(store.get('universe:feeds:combat-cursor').sequence, 12);
    const count = calls.length; await service.refresh({ source: 'combat', force: true }); assert.equal(calls.length, count);
    time(AT + 6001); await service.refresh('combat'); assert.equal(calls.length, count + 1);
    service.saveConfig({ combat_enabled: false }); assert.equal(service.state().combat.length, 0);
});
test('combat resumes successfully persisted steps after a later response fails', async t => {
    let step = 0;
    const { service, store } = fixture(t, async url => url === FEED_URLS.combat ? response({ sequence: 30 }) : ++step === 1 ? response(kill(30)) : response({}, 503));
    service.saveConfig({ combat_enabled: true }); await service.refresh('combat');
    assert.equal(service.state().combat[0].killmail_id, 30); assert.equal(service.state().sources.combat.status, 'stale');
    assert.equal(store.get('universe:feeds:combat-cursor').sequence, 31);
});
test('malformed combat entries are not silently skipped by advancing the cursor', async t => {
    const { service, store } = fixture(t, async url => url === FEED_URLS.combat ? response({ sequence: 40 }) : response({ sequence_id: 40, error: 'invalid' }));
    service.saveConfig({ combat_enabled: true }); await service.refresh('combat');
    assert.equal(service.state().sources.combat.status, 'unavailable'); assert.equal(store.get('universe:feeds:combat-cursor', null), null);
});
test('combat resumes at current pointer after a gap beyond source retention and labels missing coverage', async t => {
    const { service, store } = fixture(t, async url => url === FEED_URLS.combat ? response({ sequence: 500 }) : response({}, 404));
    store.set('universe:feeds:combat-cursor', { sequence: 2, updated: AT - 24 * 3600000 }); service.saveConfig({ combat_enabled: true });
    await service.refresh('combat'); assert.equal(store.get('universe:feeds:combat-cursor').sequence, 500);
    assert.match(service.state().sources.combat.notice, /gap/);
});
test('campaign and development state use existing public snapshots with honest unknowns and no requests', t => {
    const { service, snapshots, calls } = fixture(t);
    snapshots.set('0:sovereignty_campaigns', sample([{ campaign_id: 7, solar_system_id: A, constellation_id: 2, structure_id: 300,
        event_type: 'ihub_defense', start_time: iso(-10000), attackers_score: .4 }]));
    snapshots.set('0:sovereignty', sample([{ system_id: A, claim: { alliance: { alliance_id: 88, is_capital_system: false,
        development: { activity_defense_multiplier: 3.2, industrial_level: 0 }, sovereignty_hub: { id: 300 } } } }]));
    const value = service.state(); assert.equal(value.campaigns[0].defender_score, null); assert.equal(value.campaigns[0].status, 'active');
    assert.equal(value.development[0].adm, 3.2); assert.equal(value.development[0].industrial_level, 0);
    assert.equal(value.development[0].military_level, null); assert.equal(value.development[0].active_campaign, true); assert.equal(calls.length, 0);
    assert.deepEqual(normalizeDevelopment([{ system_id: A, claim: { unclaimed: true } }], atlas), []);
});
test('NPC rolling-window changes keep negative values, sparse zeros, identities and wormhole exclusion', () => {
    const a = npcSample(sample([{ system_id: A, npc_kills: 30 }, { system_id: T, npc_kills: 50 }], { sourceModifiedAt: iso(-3600000) }));
    const b = npcSample(sample([{ system_id: B, npc_kills: 10 }], { sourceModifiedAt: iso(0) }));
    const result = npcDeltas(a, b, atlas); assert.deepEqual(result.map(r => [r.system_id, r.delta]), [[A, -30], [B, 10]]);
    assert.equal(result[0].window_kind, 'provider'); assert.equal(result[0].from, iso(-3600000));
    assert.deepEqual(npcDeltas(a, a, atlas), []);
});
test('same cached NPC window never creates a comparison; stale or disabled feed state remains explicit', t => {
    const { service, store, snapshots, time } = fixture(t);
    snapshots.set('0:kills', sample([{ system_id: A, npc_kills: 20 }], { sourceModifiedAt: iso(-10000) }));
    service.observeNpc();assert.equal(service.state().sources.npc_deltas.status, 'waiting');
    snapshots.set('0:kills', sample([{ system_id: A, npc_kills: 20 }], { sourceModifiedAt: iso(-10000), updatedAt: iso(1000) }));
    service.observeNpc();assert.equal(service.state().npc_deltas.length, 0);
    time(AT + 2000); snapshots.set('0:kills', sample([{ system_id: A, npc_kills: 5 }], { sourceModifiedAt: iso(1000) }));
    const before=store.get('universe:feeds:npc-windows');service.state();assert.deepEqual(store.get('universe:feeds:npc-windows'),before);
    service.observeNpc();assert.equal(service.state().npc_deltas[0].delta, -15);
    store.set('module:universe', false); assert.equal(service.state().npc_deltas.length, 0); assert.equal(service.state().sources.storms.status, 'disabled');
});

test('invalid provider timestamps never advertise ready reports',t=>{
 const {service,store}=fixture(t);store.set('universe:feeds:thera',{status:'ready',updated_at:'not-a-date',expires_at:'also-invalid',data:[]});
 assert.equal(service.state().sources.thera.status,'stale');
});

test('public chain retains cached cards through refresh and reconciles only the resulting snapshot',async t=>{
 let release,started,call=0;const waiting=new Promise(resolve=>{started=resolve;});
 const {service,time}=fixture(t,async()=>{if(++call===1)return response([wh(),wh({id:'5',in_system_id:B})],200,{'cache-control':'max-age=300'});started();return new Promise(resolve=>{release=resolve;});});
 await service.refresh('thera');const map={id:'public-refresh',nodes:[],connections:[]},before=publicChainScene(map,service.state(),atlas.systems,{thera:true},AT);
 assert.equal(before.connections.length,2);time(AT+300001);const pending=service.refresh('thera');await waiting;
 try{const during=publicChainScene(map,service.state(),atlas.systems,{thera:true},AT+300001,before);assert.deepEqual(during.nodes,before.nodes);assert.deepEqual(during.connections.map(row=>row.id),before.connections.map(row=>row.id));assert.ok(during.connections.every(row=>row.stale&&!row.active&&!row.portal.routingEligible));}
 finally{release(response([wh({wh_type:'K162'}),wh({id:'6',in_system_id:C})],200,{'cache-control':'max-age=300'}));await pending;}
 const after=publicChainScene(map,service.state(),atlas.systems,{thera:true},AT+300001,before);
 assert.equal(after.connections.length,2);assert.equal(after.connections.find(row=>row.to_system_id===A||row.from_system_id===A).wh_type,'K162');assert.ok(!after.nodes.some(node=>node.system_id===B));assert.ok(after.nodes.some(node=>node.system_id===C));
 for(const id of [T,A]){const old=before.nodes.find(node=>node.system_id===id),next=after.nodes.find(node=>node.system_id===id);assert.deepEqual({x:next.x,y:next.y},{x:old.x,y:old.y});}
});
