import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EventEmitter} from 'node:events';
import {openStore} from '../../server/store.mjs';
import {createCore} from '../../server/core.mjs';
import {createCombat} from '../../server/combat.mjs';
import {catalog} from '../../server/modules/catalog.mjs';
import {retainSnapshot} from '../../components/kairo/resource-state.mjs';

const iso = n => new Date(n).toISOString(), hash = 'a'.repeat(40);
async function fixture(t, {alliance = false, privateScope = false, historyCount = 1} = {}) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-live-publication-')), store = openStore(dir), now = Date.now();
    for (const module of catalog) store.set('module:' + module.id, module.id === 'combat');
    const sample = {status: 'ready', data: [], updatedAt: iso(now), expiresAt: iso(now + 3600000), refreshAt: iso(now + 3600000)};
    store.saveSnapshot(42, 'killmails', {...sample, ...(privateScope ? {refreshAt: iso(now - 1)} : {})});
    store.saveSnapshot(42, 'combat_public', {...sample, data: null, retryAt: iso(now + 3600000)});
    store.db.prepare('INSERT INTO sessions(id,character_id,label,started,start_context) VALUES(?,?,?,?,?)')
        .run('live', 42, 'Live flight', iso(now - 600000), JSON.stringify({capturedAt: iso(now - 600000), system: {id: 30000142}, ...(alliance ? {alliance: {id: 77}} : {})}));
    const raw = {killmail_id: 100, killmail_time: iso(now - 60000), solar_system_id: 30000142,
        victim: {character_id: 99, ship_type_id: 587}, attackers: [{character_id: 42, alliance_id: 77, damage_done: 0, final_blow: false}]};
    const history = Array.from({length: historyCount}, (_, index) => ({...raw, killmail_id: 100 + index, zkb: {hash, totalValue: 2500}}));
    const calls = [], details = [];
    const fetcher = async url => {
        calls.push(url);
        if (url.startsWith('https://zkillboard.com/api/')) return Response.json(history);
        if (url.endsWith('sequence.json')) return Response.json({sequence: 100});
        if (url.endsWith('/100.json')) return Response.json({killmail_id: 100, hash, esi: raw, zkb: {hash, totalValue: 2500}, sequence_id: 100});
        return new Response(null, {status: 404});
    };
    const core = await createCore(store, {characters: () => [{id: 42, scopes: privateScope ? ['esi-killmails.read_killmails.v1'] : []}]}, {
        health: () => ({}), names: async () => ({}), request: async path => {details.push(path); return {data: history.find(record => record.killmail_id === Number(path.split('/')[2]))};},
        paged: async path => {calls.push(path); return {...sample, data: [{killmail_id: 100, killmail_hash: hash}], headers: {}};},
    }, fileURLToPath(new URL('../../server/modules', import.meta.url)), {noSync: true, sessionFeedFetcher: fetcher, combatFetcher: fetcher});
    t.after(async () => {await core.close(); store.close(); await rm(dir, {recursive: true, force: true});});
    const goalId = core.goals.create(42, {title: 'Contribute to one kill', source: 'combat.kills', target: 1}).id;
    store.db.prepare('UPDATE goals SET created=? WHERE id=?').run(iso(now - 300000), goalId);
    const frames = [], client = Object.assign(new EventEmitter(), {
        write(frame) {frames.push(String(frame)); return true;},
        end() {this.emit('finish');}, destroy() {this.emit('close');},
    });
    core.connectUI(client); frames.length = 0;
    const packets = () => frames.join('').split('\n\n').filter(Boolean).map(frame => ({
        type: frame.match(/^event: (.*)/m)?.[1], data: JSON.parse(frame.match(/^data: (.*)/m)[1]),
    }));
    return {store, core, calls, details, goalId, packets};
}

test('a verified live assisted kill refreshes the dashboard snapshot identity', async t => {
    const {store, core, calls, details} = await fixture(t);
    const previous = core.snapshots(42).killmails;
    assert.deepEqual(previous.data, []);
    await core.sessionCombat.syncLive();
    await core.bus.drain();
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM combat_records WHERE character_id=42').get().n, 1);
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='killmail.kill'").get().n, 1);
    const current = core.snapshots(42).killmails;
    assert.deepEqual(current.data.map(row => row.killmail_id), [100], 'The live owner has actually retained the record');
    assert.deepEqual(retainSnapshot(previous, current).data.map(row => row.killmail_id), [100], 'The normal dashboard merger must accept the changed durable combat data');
    assert.equal(calls.length, 3, 'One pointer, one packet and one head-of-feed check');
    assert.equal(details.length, 2, 'Keep the existing verification path bound');
});

test('a live assisted kill completes the durable automatic goal and publishes one current combat snapshot', async t => {
    const {store, core, goalId, packets} = await fixture(t);
    await core.sessionCombat.syncLive(); await core.bus.drain();
    assert.equal(store.db.prepare('SELECT done FROM goals WHERE id=?').get(goalId).done, 1, 'The live feed must refresh automatic combat goals');
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='goal.completed'").get().n, 1);
    const snapshots = packets().filter(packet => packet.type === 'snapshot' && packet.data.key === 'killmails');
    assert.equal(snapshots.length, 1, 'One ingested batch publishes one dashboard snapshot');
    assert.deepEqual(snapshots[0].data.snapshot.data.map(row => row.killmail_id), [100]);
});

test('deferred live checks and identical references remain write-free without duplicate publication or requests', async t => {
    const {store, core, goalId, calls, details, packets} = await fixture(t);
    await core.sessionCombat.syncLive(); await core.bus.drain();
    const writes = store.db.prepare('SELECT total_changes() n').get().n;
    const before = core.snapshots(42).killmails, frames = packets().length, requests = [calls.length, details.length];
    for (let i = 0; i < 5; i++) {
        await core.sessionCombat.syncLive();
        await core.combat.ingest(42, [{killmail_id: 100, killmail_hash: hash, zkb: {totalValue: 2500}}], 'zkillboard');
    }
    assert.equal(store.db.prepare('SELECT total_changes() n').get().n, writes);
    assert.equal(packets().length, frames); assert.deepEqual([calls.length, details.length], requests);
    assert.equal(core.snapshots(42).killmails.dataRevision, before.dataRevision);
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM goals WHERE id=?').get(goalId).n, 1);
});

test('Session history ingestion publishes verified personal participation without waiting for a public refresh', async t => {
    const {store, core, calls, details, goalId, packets} = await fixture(t, {alliance: true});
    const before = core.snapshots(42).killmails;
    await core.sessionCombat.sync('live', 42); await core.bus.drain();
    assert.equal(store.get('session:combat:live').status, 'ready');
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM alliance_combat_records').get().n, 1);
    assert.equal(store.db.prepare('SELECT done FROM goals WHERE id=?').get(goalId).done, 1);
    assert.deepEqual(retainSnapshot(before, core.snapshots(42).killmails).data.map(row => row.killmail_id), [100]);
    assert.equal(packets().filter(packet => packet.type === 'snapshot' && packet.data.key === 'killmails').length, 1);
    assert.equal(calls.length, 1); assert.equal(details.length, 2);
    const writes = store.db.prepare('SELECT total_changes() n').get().n;
    await core.sessionCombat.sync('live', 42);
    assert.equal(store.db.prepare('SELECT total_changes() n').get().n, writes);
    assert.equal(calls.length, 1); assert.equal(details.length, 2);
});

test('a Session history backlog publishes one changed combat batch while retaining every verified record', async t => {
    const {store, core, calls, details, packets} = await fixture(t, {alliance: true, historyCount: 25});
    await core.sessionCombat.sync('live', 42); await core.bus.drain();
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM alliance_combat_records').get().n, 25);
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM combat_records').get().n, 25);
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='killmail.kill'").get().n, 25);
    const snapshots = packets().filter(packet => packet.type === 'snapshot' && packet.data.key === 'killmails');
    assert.equal(snapshots.length, 1); assert.equal(snapshots[0].data.snapshot.data.length, 25);
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='goal.completed'").get().n, 1);
    assert.equal(calls.length, 1); assert.equal(details.length, 50, 'The existing per-record verification path is unchanged');
});

test('a corrected retained combat value publishes once without re-fetching or duplicating completion', async t => {
    const {store, core, calls, details, packets} = await fixture(t);
    await core.sessionCombat.syncLive(); await core.bus.drain();
    const before = core.snapshots(42).killmails, requests = [calls.length, details.length];
    const count = () => packets().filter(packet => packet.type === 'snapshot' && packet.data.key === 'killmails').length;
    const published = count();
    await core.combat.ingest(42, [{killmail_id: 100, killmail_hash: hash, zkb: {totalValue: 5000}}], 'zkillboard');
    const current = retainSnapshot(before, core.snapshots(42).killmails);
    assert.equal(current.data[0].zkb.totalValue, 5000);
    assert.notEqual(current.dataRevision, before.dataRevision); assert.equal(count(), published + 1);
    assert.deepEqual([calls.length, details.length], requests);
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='goal.completed'").get().n, 1);
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='killmail.kill'").get().n, 1);
    const writes = store.db.prepare('SELECT total_changes() n').get().n;
    await core.combat.ingest(42, [{killmail_id: 100, killmail_hash: hash, zkb: {totalValue: 5000}}], 'zkillboard');
    assert.equal(store.db.prepare('SELECT total_changes() n').get().n, writes); assert.equal(count(), published + 1);
});

test('the ordinary Core ESI collector retains one snapshot publication and one detail verification', async t => {
    const {store, core, goalId, calls, details, packets} = await fixture(t, {privateScope: true});
    const before = core.snapshots(42).killmails;
    await core.sync(42); await core.bus.drain();
    assert.deepEqual(retainSnapshot(before, core.snapshots(42).killmails).data.map(row => row.killmail_id), [100]);
    assert.equal(store.db.prepare('SELECT done FROM goals WHERE id=?').get(goalId).done, 1);
    assert.equal(packets().filter(packet => packet.type === 'snapshot' && packet.data.key === 'killmails').length, 1);
    assert.deepEqual(calls, ['/characters/42/killmails/recent']); assert.equal(details.length, 1);
});

test('a public refresh spanning changed pages retains one final publication per pass', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-combat-publication-bound-')), store = openStore(dir);
    let clock = Date.now(), requests = 0, details = 0;
    const records = Array.from({length: 201}, (_, i) => ({killmail_id: i + 1, killmail_time: iso(clock - 60000 - i),
        solar_system_id: 30000142, victim: {character_id: 99, ship_type_id: 587}, attackers: [{character_id: 42}], zkb: {hash}}));
    const batches = [], service = createCombat(store, {characters: () => [{id: 42}]}, {
        request: async path => {details++; return {data: records[Number(path.split('/')[2]) - 1]};},
    }, {now: () => clock, spacingMs: 0,
        fetcher: async url => {requests++; return Response.json(url.includes('/page/2/') ? records.slice(200) : records.slice(0, 200));},
        onChange: () => batches.push(store.db.prepare('SELECT COUNT(*) n FROM combat_records').get().n),
        publish: event => store.db.prepare('INSERT OR IGNORE INTO events(character_id,type,module,summary,payload,at,dedupe) VALUES(?,?,?,?,?,?,?)')
            .run(event.characterId, event.type, event.module, event.summary, JSON.stringify(event.payload), event.at, event.dedupe),
    });
    t.after(async () => {await service.close(); store.close(); await rm(dir, {recursive: true, force: true});});
    await service.syncPublic(42); assert.deepEqual(batches, [100]);
    clock += 60000; await service.syncPublic(42);
    assert.deepEqual(batches, [100, 201], 'The second pass changes two pages and publishes only its completed refresh');
    assert.equal(service.coverage(42).status, 'ready'); assert.equal(requests, 2); assert.equal(details, 201);
    await service.syncPublic(42); assert.deepEqual(batches, [100, 201]); assert.equal(requests, 2);
});
