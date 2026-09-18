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
