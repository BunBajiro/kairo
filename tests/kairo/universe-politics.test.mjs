import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../server/store.mjs';
import { compactPoliticsKillmail, createUniversePolitics, inferPolitics, validatePoliticsConfig } from '../../server/universe-politics.mjs';

const DAY = 86400000, AT = Date.parse('2026-09-18T18:00:00Z');
const blank = () => ({ version: 1, revision: 0, inference_enabled: true, blocs: [], independent_alliance_ids: [] });
const event = (id, attackers, days, victim = 999, system = 30000001) => ({ killmail_id: id, at: AT - days * DAY,
    system_id: system, attacker_alliance_ids: attackers, victim_alliance_id: victim });
const partner = (a, b, start = 1, victim = 999) => [15, 7, 1].map((days, index) => event(start + index, [a, b], days, victim));
const raw = row => ({ killmail_id: row.killmail_id, killmail_time: new Date(row.at).toISOString(), solar_system_id: row.system_id,
    victim: { alliance_id: row.victim_alliance_id, ship_type_id: 587 }, attackers: row.attacker_alliance_ids.map(alliance_id => ({ alliance_id, character_id: 42 })) });
async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-politics-')), store = openStore(dir);
    let clock = AT;
    const auth = { characters: () => [{ id: 42 }] }, atlas = { gates: [] };
    const service = createUniversePolitics(store, auth, { now: () => clock, atlas });
    const put = store.db.prepare('INSERT INTO combat_records VALUES(?,?,?,?,?,?) ON CONFLICT(character_id,killmail_id) DO UPDATE SET body=excluded.body');
    const add = (row, characterId = 42) => put.run(characterId, row.killmail_id, 'kill', new Date(row.at).toISOString(), JSON.stringify(raw(row)), 'esi');
    t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
    return { store, service, add, auth, time: value => { clock = value; }, reopen: () => createUniversePolitics(store, auth, { now: () => clock, atlas }) };
}

test('config enforces explicit moves, independence, stable IDs and optimistic revisions', () => {
    const input = { ...blank(), blocs: [{ id: 'bloc-imperium', name: 'Imperium', color: '#123ABC', alliance_ids: [77, 78] }] };
    const config = validatePoliticsConfig(input, blank(), AT);
    assert.equal(config.blocs[0].id, 'bloc-imperium'); assert.equal(config.blocs[0].color, '#123abc'); assert.equal(config.revision, 1);
    assert.throws(() => validatePoliticsConfig(input, config, AT), /changed.*Reload/);
    assert.throws(() => validatePoliticsConfig({ ...input, independent_alliance_ids: [77] }), /cannot also/);
    assert.throws(() => validatePoliticsConfig({ ...input, blocs: [...input.blocs, { id: 'other', name: 'Other', color: '#ffffff', alliance_ids: [78] }] }), /more than one/);
    assert.throws(() => validatePoliticsConfig({ ...input, blocs: [{ ...input.blocs[0], alliance_ids: [77, 77] }] }), /more than once/);
    assert.throws(() => validatePoliticsConfig({ ...input, blocs: [{ ...input.blocs[0], alliance_ids: ['77'] }] }), /valid alliance IDs/);
    assert.throws(() => validatePoliticsConfig({ ...input, blocs: [{ ...input.blocs[0], id: 'inferred-collision' }] }), /reserved/);
    const moved = validatePoliticsConfig({ ...config, blocs: [{ ...config.blocs[0], alliance_ids: [77] }, { id: 'other', name: 'Other', color: '#fffaaa', alliance_ids: [78] }] }, config, AT);
    assert.deepEqual(moved.blocs[1].alliance_ids, [78]);
});

test('compact ingestion deduplicates alliance attackers, rejects malformed/future/huge events and never reads system totals', () => {
    const source = raw(partner(77, 78)[0]); source.attackers.push({ alliance_id: 77 });
    assert.deepEqual(compactPoliticsKillmail(source, AT).attacker_alliance_ids, [77, 78]);
    assert.equal(compactPoliticsKillmail({ system_id: 30000001, ship_kills: 1000 }, AT), null);
    assert.equal(compactPoliticsKillmail({ ...source, killmail_time: new Date(AT + DAY).toISOString() }, AT), null);
    assert.equal(compactPoliticsKillmail({ ...source, attackers: Array.from({ length: 33 }, (_, i) => ({ alliance_id: i + 1 })) }, AT), null);
});

test('one fleet, common enemies, adjacency and low activity alone do not create coalitions', () => {
    const rows = Array.from({ length: 500 }, (_, i) => event(i + 1, [77, 78], 1));
    rows.push(event(900, [79], 1), event(901, [80], 1));
    const snapshot = inferPolitics(rows, { now: AT, sovereignty: [{ system_id: 1, alliance_id: 79 }, { system_id: 2, alliance_id: 80 }], gates: [{ from_system_id: 1, to_system_id: 2 }] });
    assert.equal(snapshot.groups.length, 0);
    assert.equal(snapshot.unresolved.find(row => row.alliance_id === 77).relationships.find(row => row.alliance_ids.includes(78)).cooperative_encounters, 1);
});

test('sustained partnerships share one stable snapshot and deduplicate kills and encounters', () => {
    const rows = [...partner(77, 78), ...partner(77, 78), ...partner(79, 80, 10)];
    const snapshot = inferPolitics(rows, { now: AT, names: { 77: 'Alpha' } });
    assert.equal(snapshot.coverage.killmails, 6); assert.equal(snapshot.groups.length, 2);
    const alpha = snapshot.groups.find(row => row.alliance_ids.includes(77));
    assert.equal(alpha.name, 'Alpha and partners'); assert.equal(alpha.evidence.cooperative_encounters, 3); assert.equal(alpha.evidence.distinct_days, 3);
    const again = inferPolitics(rows.reverse(), { now: AT, names: { 77: 'Alpha' }, previous: snapshot });
    assert.equal(again.groups.find(row => row.alliance_ids.includes(77)).id, alpha.id);
    assert.deepEqual(again.groups.map(row => row.alliance_ids), snapshot.groups.map(row => row.alliance_ids));
});

test('hostility blocks grouping, including three hostile parties', () => {
    const rows = [...partner(77, 78), ...partner(77, 79, 10), ...partner(78, 79, 20)];
    for (const [a, b] of [[77, 78], [77, 79], [78, 79]]) rows.push(event(rows.length + 100, [a], 2, b), event(rows.length + 101, [b], 1, a));
    const snapshot = inferPolitics(rows, { now: AT });
    assert.equal(snapshot.groups.length, 0);
    assert.equal(snapshot.unresolved.find(row => row.alliance_id === 77).relationships[0].label, 'Mixed evidence');
});

test('an ambiguous bridge cannot merge unsupported partners; configured alliances cannot bridge fallback', () => {
    const rows = [...partner(77, 78), ...partner(78, 79, 10)];
    const snapshot = inferPolitics(rows, { now: AT });
    assert.equal(snapshot.groups.length, 0); assert.equal(snapshot.unresolved.find(row => row.alliance_id === 78).evidence_label, 'Mixed evidence');
    const config = { ...blank(), blocs: [{ id: 'manual', name: 'Manual', color: '#ffcc00', alliance_ids: [78] }] };
    assert.equal(inferPolitics(rows, { now: AT, config }).groups.length, 0);
});

test('territory corroborates supported pairs without changing their admission', () => {
    const rows = partner(77, 78), sovereignty = [{ system_id: 1, alliance_id: 77 }, { system_id: 2, alliance_id: 78 }], gates = [{ from_system_id: 1, to_system_id: 2 }];
    const snapshot = inferPolitics(rows, { now: AT, sovereignty, gates });
    assert.equal(snapshot.groups[0].evidence.territory_neighbor_pairs, 1);
    assert.equal(snapshot.groups[0].evidence.shared_opponents, 1);
});

test('expired cooperation dissolves and stable group identity survives a supported member addition', () => {
    const rows = partner(77, 78), previous = inferPolitics(rows, { now: AT });
    assert.equal(inferPolitics(rows, { now: AT + 70 * DAY, previous }).groups.length, 0);
    const added = inferPolitics([...rows, ...partner(77, 79, 10), ...partner(78, 79, 20)], { now: AT, previous });
    assert.equal(added.groups[0].id, previous.groups[0].id); assert.equal(added.groups[0].membership_changed, true);
    assert.deepEqual(added.groups[0].previous_group_ids, [previous.groups[0].id]);
});

test('service resolves configured/independent first, still infers unassigned pairs, and never changes settings', async t => {
    const { service, add, store, reopen } = await fixture(t);
    for (const row of [...partner(77, 78), ...partner(79, 80, 10)]) add(row);
    store.set('names', { 77: 'Alliance Alpha', 79: 'Alliance Gamma' });
    service.refresh({ force: true }); assert.equal(service.read().groups.length, 2);
    const config = service.saveConfig({ ...blank(), blocs: [{ id: 'manual', name: 'Our bloc', color: '#abcdef', alliance_ids: [77] }], independent_alliance_ids: [78] });
    // Resolve edits immediately, withholding old analytical cores until reassessed.
    assert.equal(service.resolver()(77).source, 'configured'); assert.equal(service.resolver()(78).source, 'independent');
    assert.equal(service.resolver()(79).source, 'unassigned');
    service.refresh({ force: true });
    const resolve = service.resolver(); assert.equal(resolve(79).source, 'inferred'); assert.equal(resolve(80).group_id, resolve(79).group_id);
    assert.equal(resolve(999).source, 'unassigned'); assert.notEqual(resolve(999).group_id, resolve(123).group_id);
    assert.deepEqual(service.config(), config); assert.equal(reopen().resolver()(77).name, 'Our bloc');
    const released = service.saveConfig({ ...config, blocs: [], independent_alliance_ids: [] }); service.refresh({ force: true });
    assert.equal(service.resolver()(77).source, 'inferred'); assert.equal(released.revision, 2);
    assert.ok(service.exportData().history.some(row => row.kind === 'config'));
});

test('same kill across personal and alliance caches counts once, and reads never ingest queued records', async t => {
    const { service, add, store } = await fixture(t);
    for (const row of partner(77, 78)) {
        add(row); add(row, 43);
        store.db.prepare('INSERT INTO alliance_combat_records VALUES(?,?,?,?,?)').run(77, row.killmail_id, row.system_id, new Date(row.at).toISOString(), JSON.stringify(raw(row)));
    }
    assert.equal(service.read().coverage.killmails, 0); assert.equal(store.db.prepare('SELECT COUNT(*) count FROM universe_politics_events').get().count, 0);
    service.refresh({ force: true }); assert.equal(service.read().coverage.killmails, 3);
    assert.equal(service.read().groups[0].evidence.cooperative_encounters, 3);
    const revision = service.read().snapshot_id; service.refresh({ force: true }); assert.equal(service.read().snapshot_id, revision);
});

test('queue drains in bounded batches and reports incomplete coverage until caught up', async t => {
    const { service, add } = await fixture(t);
    for (let i = 1; i <= 1005; i++) add(event(i, [77, 78], 1));
    service.refresh({ force: true });
    assert.equal(service.read().coverage.killmails, 1000); assert.equal(service.read().coverage.pending_records, 5); assert.equal(service.read().coverage.truncated, true);
    service.refresh({ force: true });
    assert.equal(service.read().coverage.killmails, 1005); assert.equal(service.read().coverage.pending_records, 0); assert.equal(service.read().groups.length, 0);
});

test('collection outage is distinct from no evidence, and old unrefreshed membership cannot live forever', async t => {
    const { service, add, store, time } = await fixture(t);
    for (const row of partner(77, 78)) add(row);
    store.saveSnapshot(42, 'combat_public', { status: 'ready', expiresAt: new Date(AT + DAY).toISOString() });
    service.refresh({ force: true }); assert.equal(service.read().status, 'limited'); assert.equal(service.read().coverage.collection_status, 'current');
    store.saveSnapshot(42, 'combat_public', { status: 'stale', error: 'Outage' });
    assert.equal(service.read().status, 'stale'); assert.equal(service.resolver()(77).source, 'inferred');
    time(AT + 7 * 3600000); assert.equal(service.read().status, 'stale'); assert.equal(service.resolver()(77).source, 'inferred');
    time(AT + 14 * DAY); assert.equal(service.resolver()(77).source, 'unassigned');
    time(AT + 70 * DAY); service.refresh({ force: true }); assert.equal(service.read().coverage.killmails, 0); assert.equal(service.read().groups.length, 0);
});

test('inference-off retains manual blocs and leaves unknown alliances separate', async t => {
    const { service, add } = await fixture(t);
    for (const row of partner(77, 78)) add(row);
    service.saveConfig({ ...blank(), inference_enabled: false, blocs: [{ id: 'manual', name: 'Our bloc', color: '#abcdef', alliance_ids: [77] }] });
    service.refresh({ force: true });
    assert.equal(service.read().status, 'disabled'); assert.equal(service.resolver()(77).source, 'configured'); assert.equal(service.resolver()(78).source, 'unassigned');
});

test('configured colours reject duplicates and empire reservations before persisting settings', async t => {
    const { service } = await fixture(t), first = { id: 'one', name: 'First', color: '#abcdef', alliance_ids: [77] };
    assert.throws(() => service.saveConfig({ ...blank(), blocs: [first, { ...first, id: 'two', name: 'Second', alliance_ids: [78], color: '#ABCDEF' }] }), /already used/);
    assert.throws(() => service.saveConfig({ ...blank(), blocs: [{ ...first, color: '#4f88c6' }] }), /reserved.*Caldari/);
    assert.equal(service.config().revision, 0);
});

test('a memoized full-roster palette keeps map memberships, empire fills and groups consistent', async t => {
    const { service, store, reopen } = await fixture(t);
    store.saveSnapshot(0, 'sovereignty', { status: 'ready', data: [{ system_id: 1, alliance_id: 77 }, { system_id: 2, alliance_id: 78 }, { system_id: 3, faction_id: 500001 }] });
    service.saveConfig({ ...blank(), blocs: [{ id: 'one', name: 'First', color: '#abcdef', alliance_ids: [77] }] });
    const state = service.read(), again = service.read(), membership = service.resolver(state)(77);
    assert.strictEqual(state.territory_colours, again.territory_colours);
    assert.equal(state.groups[0].color, '#abcdef'); assert.equal(state.groups[0].color, membership.color);
    assert.equal(state.groups[0].outline, membership.outline); assert.equal(state.territory_colours.f500001.fill, '#4f88c6');
    assert.equal(service.resolver(state)(78).color, state.territory_colours.a78.fill);
    assert.equal(new Set(Object.values(state.territory_colours).map(row => row.fill)).size, Object.keys(state.territory_colours).length);
    // Previously saved duplicates remain readable without silently rewriting config.
    const legacy = service.config(); legacy.blocs.push({ id: 'two', name: 'Second', color: '#abcdef', alliance_ids: [78] });
    store.set('universe:politics:config', legacy);
    const restored = reopen(), groups = restored.read().groups;
    assert.notEqual(groups[0].color, groups[1].color); assert.deepEqual(restored.config(), legacy);
});

test('disabled inference bounds queued metadata and resumes complete evidence with corrections behind its cursor',async t=>{
 const {service,add,store,reopen}=await fixture(t);service.saveConfig({...blank(),inference_enabled:false});for(let id=1;id<=4205;id++)add(event(id,[77,78],id%20+1));
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM universe_politics_queue').get().n,0);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM universe_politics_events').get().n,0);assert.deepEqual(store.get('universe:politics:rescan'),{pending:true});
 add(event(1,[77,99],1));const active=reopen();active.saveConfig({...active.config(),inference_enabled:true});active.refresh({force:true});assert.equal(active.read().coverage.rebuilding,true);assert.equal(active.read().coverage.truncated,true);assert.equal(active.read().coverage.killmails,1000);assert.equal(active.read().groups.length,0);assert.equal(store.db.prepare("SELECT COUNT(*) n FROM universe_politics_history WHERE kind='inference'").get().n,0);
 add(event(1,[77,55],1));const duplicate=event(1,[77,88],1);store.db.prepare('INSERT INTO alliance_combat_records VALUES(?,?,?,?,?)').run(77,1,duplicate.system_id,new Date(duplicate.at).toISOString(),JSON.stringify(raw(duplicate)));
 const resumed=reopen();for(let i=0;i<4;i++)resumed.refresh({force:true});assert.equal(resumed.read().coverage.killmails,4205);assert.equal(resumed.read().coverage.rebuilding,false);assert.equal(store.get('universe:politics:rescan',null),null);assert.equal(store.db.prepare("SELECT COUNT(*) n FROM universe_politics_history WHERE kind='inference'").get().n,1);assert.deepEqual(JSON.parse(store.db.prepare('SELECT body FROM universe_politics_events WHERE killmail_id=1').get().body).attacker_alliance_ids,[55,77]);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM combat_records').get().n,4205);
 store.set('module:universe',false);add(event(5000,[77,78],1));assert.equal(store.db.prepare('SELECT COUNT(*) n FROM universe_politics_queue').get().n,0);store.set('module:universe',true);assert.equal(resumed.read().coverage.rebuilding,true);assert.equal(resumed.read().groups.length,0);resumed.refresh({force:true});assert.equal(resumed.read().coverage.rebuilding,true);
});
test('canonical evidence handles conflicting replicas, ineligible corrections and owner deletion deterministically',async t=>{
 const {service,add,store}=await fixture(t),db=store.db,alliance=event(7,[88,99],1),personal=event(7,[77,78],1);db.prepare('INSERT INTO alliance_combat_records VALUES(?,?,?,?,?)').run(77,7,alliance.system_id,new Date(alliance.at).toISOString(),JSON.stringify(raw(alliance)));add(personal,42);service.refresh({force:true});const compact=()=>db.prepare('SELECT * FROM universe_politics_events WHERE killmail_id=7').get();assert.equal(compact().source,'combat_records');assert.equal(compact().owner_id,42);assert.deepEqual(JSON.parse(compact().body).attacker_alliance_ids,[77,78]);
 add(event(7,[11,12],1),41);service.refresh({force:true});assert.equal(compact().owner_id,41);add(event(7,[55,56],1),42);service.refresh({force:true});assert.equal(compact().owner_id,41,'canonical ordering is not newest observed');db.prepare('DELETE FROM combat_records WHERE character_id=41 AND killmail_id=7').run();assert.equal(compact(),undefined);assert.equal(service.read().coverage.rebuilding,true);service.refresh({force:true});assert.equal(compact().owner_id,42);assert.deepEqual(JSON.parse(compact().body).attacker_alliance_ids,[55,56]);
 const invalid=raw(personal);invalid.attackers=[];invalid.victim={};db.prepare('UPDATE combat_records SET body=? WHERE character_id=42 AND killmail_id=7').run(JSON.stringify(invalid));service.refresh({force:true});assert.equal(compact().body,'null');assert.equal(service.read().coverage.killmails,0);db.prepare('UPDATE alliance_combat_records SET body=? WHERE killmail_id=7').run(JSON.stringify(raw(alliance)));service.refresh({force:true});assert.equal(compact().body,'null');db.prepare('DELETE FROM combat_records WHERE character_id=42 AND killmail_id=7').run();service.refresh({force:true});assert.equal(compact().source,'alliance_combat_records');assert.deepEqual(JSON.parse(compact().body).attacker_alliance_ids,[88,99]);
});
test('legacy truncated bootstrap upgrades provenance and replays omitted in-window evidence',async t=>{
 const {store,add,reopen}=await fixture(t),db=store.db;for(let i=1;i<=2505;i++)add(event(i,[77,78],1));db.exec('DELETE FROM universe_politics_queue; DROP TABLE universe_politics_events; CREATE TABLE universe_politics_events(killmail_id INTEGER PRIMARY KEY,at INTEGER NOT NULL,body TEXT NOT NULL)');store.set('universe:politics:bootstrap',{at:new Date(AT).toISOString(),truncated:true});store.set('universe:politics:queue-version',1);const upgraded=reopen();assert.equal(upgraded.read().coverage.rebuilding,true);for(let i=0;i<3;i++)upgraded.refresh({force:true});assert.equal(upgraded.read().coverage.killmails,2505);assert.equal(upgraded.read().coverage.rebuilding,false);assert.equal(store.get('universe:politics:bootstrap').truncated,false);assert.equal(db.prepare('SELECT COUNT(*) n FROM combat_records').get().n,2505);assert.equal(db.prepare("SELECT COUNT(*) n FROM universe_politics_events WHERE source='combat_records'").get().n,2505);
 const plan=db.prepare('EXPLAIN QUERY PLAN SELECT source,row_id FROM universe_politics_queue ORDER BY source,row_id LIMIT 1000').all();assert.doesNotMatch(plan.map(r=>r.detail).join(' '),/TEMP B-TREE/);
});


test('capacity omissions remain explicit after the limiting batch and expire with their evidence window',async t=>{
 const {store,service,time}=await fixture(t),db=store.db;
 store.set('universe:politics:bootstrap',{at:new Date(AT).toISOString(),truncated:false});
 const put=db.prepare('INSERT INTO universe_politics_events VALUES(?,?,?,?,?,?)');
 db.exec('BEGIN');for(let i=1;i<=20001;i++)put.run(i,AT-DAY,'null','combat_records',42,i);db.exec('COMMIT');
 service.refresh({force:true});assert.equal(db.prepare('SELECT COUNT(*) n FROM universe_politics_events').get().n,20000);assert.equal(service.read().coverage.truncated,true);service.refresh({force:true});assert.equal(service.read().coverage.truncated,true);
 time(AT+60*DAY);service.refresh({force:true});assert.equal(service.read().coverage.truncated,false);assert.equal(db.prepare('SELECT COUNT(*) n FROM universe_politics_events').get().n,0);
});
