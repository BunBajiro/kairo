import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../../server/store.mjs';
import { createJSpaceTracking } from '../../server/universe-jspace-tracking.mjs';

const AT = Date.parse('2026-09-27T03:00:00Z'), A = 30000001, B = 30000002, W = 31000001, X = 31000002, Y = 31000003;
const atlas = { systems: [A, B, W, X, Y].map(system_id => ({ system_id, name: String(system_id), space: system_id >= W ? 'wormhole' : 'known' })),
    gates: [{ from_system_id: A, to_system_id: B }, { from_system_id: X, to_system_id: Y }] };
const snapshot = (system, at, extra = {}) => ({ status: 'ready', data: { solar_system_id: system }, updatedAt: new Date(at).toISOString(), expiresAt: new Date(at + 60000).toISOString(), ...extra });
async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-jspace-tracking-')), store = openStore(dir);
    store.db.exec('CREATE TABLE universe_records(character_id INTEGER NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(character_id,kind,id))');
    let clock = AT, connections = 0, active = 42, copiesEnabled = true;
    const pilots = [42, 43, 44].map(id => ({ id, name: `Pilot ${id}`, scopes: ['esi-location.read_location.v1'] }));
    const locations = new Map(), configurations = new Map(), events = [], connectionReads = [], scopeChecks = [], auth = { characters: () => pilots };
    const write = (owner, map) => store.db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?) ON CONFLICT(character_id,kind,id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at').run(owner, 'jspace_map', map.id, JSON.stringify(map), map.updated_at);
    const read = (owner, id) => JSON.parse(store.db.prepare("SELECT body FROM universe_records WHERE character_id=? AND kind='jspace_map' AND id=?").get(owner, id).body);
    const operations = { location: id => locations.get(id) || { status: 'waiting' }, config: id => configurations.get(id) || { enabled: true, location_source: 'esi' } };
    const tracking = createJSpaceTracking(store, auth, { atlas, now: () => clock, operations, onChange: owner => events.push(owner),
        isActivePilot: id => id === active,
        scopeMatches: (_owner, map, id) => { scopeChecks.push(map.id); return map.scope?.system_ids?.includes(id); },
        getConnections: (owner, map) => { connectionReads.push(owner); return map.connections; },
        addSystem: (map, system_id, anchorId) => {
            if (map.nodes.some(node => node.system_id === system_id)) return;
            const previous = map.archived_nodes?.find(node => node.system_id === system_id);
            map.nodes.push({ notes: '', ...previous, system_id, anchorId });
            if (previous) map.archived_nodes = map.archived_nodes.filter(node => node !== previous);
        },
        saveConnection: (owner, map, input) => { connections++; map.connections.push({ ...input, owner, id: randomUUID(), expires_at: new Date(clock + input.duration_hours * 3600000).toISOString() }); },
        copyConnection: (owner, map, edge) => { if (!copiesEnabled) return null; connections++; const copied = { owner, id: randomUUID(), from_system_id: edge.from_system_id, to_system_id: edge.to_system_id,
            kind: 'wormhole', expires_at: edge.expires_at, observed_at: edge.observed_at, duration_hours: 16, mass: 'stable', max_ship_size: 'large',
            confirmed: false, accessible: false, reverse_accessible: false, notes: '' }; map.connections.push(copied); return copied; },
        writeMap: write,
        recordPassage: (owner, map, edge, input) => { if (!edge.active || !edge.confirmed || map.passages.some(row => row.sample_key === input.sample_key)) return false; map.passages.push({ ...input, owner, connection_id: edge.id }); return true; } });
    t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
    const create = (owner = 42, input = {}) => { const map = { id: randomUUID(), nodes: [], connections: [], passages: [], pilots: [], revision: 1, updated_at: new Date(clock).toISOString(), ...input }; write(owner, map); tracking.syncMap(owner, map); return map; };
    const command = (owner, map, op, input) => { const fresh = read(owner, map.id); tracking.rosterCommand(owner, fresh, op, input); write(owner, fresh); tracking.syncMap(owner, fresh); return fresh; };
    const observe = (id, system, at = clock, extra = {}) => { clock = at; return tracking.observeLocation(id, snapshot(system, at, extra)); };
    return { store, tracking, pilots, locations, configurations, events, connectionReads, scopeChecks, create, command, observe, read, write,
        time: value => { clock = value; }, count: () => connections,
        allowCopies: enabled => { copiesEnabled = enabled; },
        activate: id => { tracking.resetSourceBaseline(active); active = id; tracking.resetSourceBaseline(active); },
        update: (owner, map) => { write(owner, map); tracking.syncMap(owner, map); } };
}

test('adding a map pilot enables tracking and seeds only the current fresh J-Space location', async t => {
    const f = await fixture(t), map = f.create();
    f.locations.set(42, snapshot(W, AT));
    const added = f.command(42, map, 'pilot.add', { character_id: 42 });
    assert.equal(added.pilots[0].tracking, true);
    assert.deepEqual(added.nodes.map(row => row.system_id), [W]); assert.deepEqual(added.connections, []);
    assert.equal(f.tracking.projectPilots(added)[0].system_id, W);
    assert.throws(() => f.command(42, map, 'pilot.add', { character_id: 99 }), /connected pilot/);
    assert.throws(() => f.command(42, map, 'pilot.add', { character_id: 42 }), /already/);
    f.pilots[1].scopes = []; f.locations.set(43, snapshot(X, AT));
    const noScope = f.command(42, map, 'pilot.add', { character_id: 43 });
    assert.equal(noScope.pilots[1].tracking, true); assert.equal(noScope.pilots[1].last_location, undefined);
    assert.deepEqual(noScope.nodes.map(row => row.system_id), [W]);
});

test('normal nonoverlapping ESI cache windows populate entry, internal and exit connections without renewing a known hole', async t => {
    const f = await fixture(t), map = f.create();
    f.command(42, map, 'pilot.add', { character_id: 42 });
    for (const [index, system] of [A, W, X, B].entries()) {
        const at = AT + index * 6000;
        f.observe(42, system, at, { expiresAt: new Date(at + 5000).toISOString() });
    }
    const populated = f.read(42, map.id);
    assert.deepEqual(new Set(populated.nodes.map(row => row.system_id)), new Set([A, W, X, B]));
    assert.equal(populated.connections.length, 3);
    for (const edge of populated.connections) {
        assert.equal(edge.duration_hours, 16); assert.equal(edge.mass, 'stable'); assert.equal(edge.max_ship_size, 'large'); assert.equal(edge.confirmed, false); assert.equal(edge.accessible, false); assert.equal(edge.reverse_accessible, false);
    }
    const expiry = populated.connections[2].expires_at;
    f.observe(42, X, AT + 24000, { expiresAt: new Date(AT + 29000).toISOString() });
    assert.equal(f.count(), 3); assert.equal(f.read(42, map.id).connections[2].expires_at, expiry);
    assert.equal(f.read(42, map.id).passages.length, 0);
});

test('pause and resume establish a new baseline and removing even a disconnected pilot unsubscribes the map', async t => {
    const f = await fixture(t), map = f.create();
    f.command(42, map, 'pilot.add', { character_id: 42 }); f.observe(42, W, AT);
    const paused = f.command(42, map, 'pilot.tracking', { character_id: 42, tracking: false });
    assert.equal(paused.pilots[0].last_location, undefined); assert.equal(f.tracking.projectPilots(paused)[0].status, 'paused');
    f.observe(42, X, AT + 20000); assert.deepEqual(f.read(42, map.id).nodes.map(row => row.system_id), [W]);
    f.locations.set(42, snapshot(X, AT + 20000));
    f.command(42, map, 'pilot.tracking', { character_id: 42, tracking: true });
    f.observe(42, Y, AT + 40000); // A static gate cannot be invented as a wormhole.
    assert.equal(f.count(), 0); assert.deepEqual(new Set(f.read(42, map.id).nodes.map(row => row.system_id)), new Set([W, X, Y]));
    f.pilots.splice(0, 1); const removed = f.command(42, map, 'pilot.remove', { character_id: 42 });
    assert.deepEqual(removed.pilots, []);
});

test('one dispatcher fans out to subscribed maps with independent data and per-pilot baselines', async t => {
    const f = await fixture(t), a = f.create(42), b = f.create(43), untouched = f.create(44);
    f.command(42, a, 'pilot.add', { character_id: 42 }); f.command(42, a, 'pilot.add', { character_id: 43 }); f.command(43, b, 'pilot.add', { character_id: 42 });
    assert.equal(f.observe(42, W, AT).maps, 2);
    f.observe(43, B, AT); const result = f.observe(42, X, AT + 20000);
    assert.equal(result.connections, 2); assert.equal(f.count(), 2);
    const left = f.read(42, a.id), right = f.read(43, b.id);
    assert.notEqual(left.connections[0].id, right.connections[0].id);
    assert.equal(left.connections[0].owner, 42); assert.equal(right.connections[0].owner, 43);
    left.nodes[0].notes = 'This map only'; f.write(42, left); assert.equal(f.read(43, b.id).nodes[0].notes, '');
    assert.deepEqual(f.read(44, untouched.id).nodes, []);
    assert.equal(f.observe(42, X, AT + 20000).maps, 0, 'duplicate stream delivery is dispatched once');
    const revision = f.read(42, a.id).revision, count = f.events.length;
    f.observe(42, X, AT + 40000);
    assert.equal(f.read(42, a.id).revision, revision, 'location freshness alone does not invalidate open editors');
    assert.equal(f.events.length, count, 'stationary refresh does not publish redundant map changes');
    assert.equal(f.read(42, a.id).pilots[1].last_location.system_id, B);
});

test('stale, future, out-of-order, missed and docked samples cannot invent connections', async t => {
    const f = await fixture(t), map = f.create(); f.command(42, map, 'pilot.add', { character_id: 42 });
    f.observe(42, W, AT);
    f.time(AT + 20000);
    assert.equal(f.tracking.observeLocation(42, snapshot(X, AT - 20000)).maps, 0);
    assert.equal(f.tracking.observeLocation(42, snapshot(X, AT + 30000)).maps, 0);
    assert.equal(f.tracking.observeLocation(42, snapshot(X, AT + 10000, { status: 'stale' })).maps, 0);
    assert.equal(f.tracking.observeLocation(42, snapshot(X, AT + 10000, { expiresAt: new Date(AT).toISOString() })).maps, 0);
    f.observe(42, X, AT + 120000); assert.equal(f.count(), 0, 'large sample gap adds a card but no connection');
    f.observe(42, W, AT + 140000, { data: { solar_system_id: W, structure_id: 9001 } });
    f.observe(42, A, AT + 160000); assert.equal(f.count(), 0, 'docked departure or arrival is not traversal evidence');
    f.time(AT + 240000); assert.equal(f.tracking.projectPilots(f.read(42, map.id))[0].system_id, null, 'expired location is not presented as current');
});

test('K-Space legs, known gates and recent pod losses never create wormholes', async t => {
    const f = await fixture(t), map = f.create(); f.command(42, map, 'pilot.add', { character_id: 42 });
    f.observe(42, A, AT); f.observe(42, B, AT + 20000);
    assert.deepEqual(f.read(42, map.id).nodes, []);
    f.observe(42, X, AT + 140000); f.observe(42, Y, AT + 160000); assert.equal(f.count(), 0);
    f.store.db.prepare('INSERT INTO combat_records VALUES(?,?,?,?,?,?)').run(42, 123, 'loss', new Date(AT + 160000).toISOString(), JSON.stringify({ victim: { ship_type_id: 670 } }), 'test');
    f.observe(42, W, AT + 180000); assert.equal(f.count(), 0);
    assert.equal(f.read(42, map.id).nodes.some(row => row.system_id === W), true, 'current system still populates after a discontinuity');
});

test('selected authorised chat-log samples can track without ESI scope and source changes cannot bridge travel', async t => {
    const f = await fixture(t), map = f.create(); f.command(42, map, 'pilot.add', { character_id: 42 });
    f.observe(42, W, AT); f.pilots[0].scopes = [];
    f.configurations.set(42, { enabled: true, logs_enabled: true, location_source: 'logs' });
    const log = (system_id, at) => ({ system_id, source: 'chat_log', status: 'ready', updated_at: new Date(at).toISOString(), expires_at: new Date(at + 60000).toISOString() });
    f.time(AT + 20000); const selected = log(X, AT + 20000); f.locations.set(42, selected);
    assert.equal(f.tracking.observeLocation(42, log(A, AT + 20000)).maps, 0, 'unselected log report is ignored');
    f.tracking.observeLocation(42, selected); assert.equal(f.count(), 0, 'new source starts its own baseline');
    f.time(AT + 40000); const next = log(W, AT + 40000); f.locations.set(42, next);
    f.tracking.observeLocation(42, next); assert.equal(f.count(), 1);
    f.configurations.set(42, { enabled: true, logs_enabled: false, location_source: 'logs' });
    assert.equal(f.tracking.projectPilots(f.read(42, map.id))[0].system_id, null);
});

test('optional passages are recorded only against one already trusted connection and stay map-local', async t => {
    const f = await fixture(t), map = f.create(); f.command(42, map, 'pilot.add', { character_id: 43 });
    f.observe(43, W, AT); f.observe(43, X, AT + 20000);
    const fresh = f.read(42, map.id); fresh.track_passages = true; fresh.connections[0].confirmed = true; fresh.connections[0].active = true; f.write(42, fresh);
    const expiry = fresh.connections[0].expires_at;
    assert.equal(f.observe(43, W, AT + 40000).passages, 1);
    f.observe(43, W, AT + 40000);
    const recorded = f.read(42, map.id);
    assert.equal(recorded.passages.length, 1); assert.equal(recorded.passages[0].character_id, 43);
    assert.equal(recorded.connections[0].expires_at, expiry); assert.equal(f.count(), 1);
});

test('a later matching exit backfills the whole live source chain while retaining independent IDs and original expiry', async t => {
    const f = await fixture(t), source = f.create(42, { kind: 'tracking_source' }), scoped = f.create(42, { scope: { system_ids: [A] } });
    f.command(42, source, 'pilot.add', { character_id: 42 }); f.command(42, scoped, 'pilot.add', { character_id: 42 });
    f.observe(42, W, AT); f.observe(42, X, AT + 20000);
    assert.deepEqual(f.read(42, scoped.id).nodes, [], 'a scoped map waits for a matching anchor instead of filtering an already populated map');
    const original = f.read(42, source.id).connections[0];
    f.observe(42, A, AT + 40000);
    const populated = f.read(42, scoped.id);
    assert.deepEqual(new Set(populated.nodes.map(row => row.system_id)), new Set([W, X, A])); assert.equal(populated.connections.length, 2);
    const copy = populated.connections.find(edge => edge.from_system_id === W);
    assert.notEqual(copy.id, original.id); assert.equal(copy.expires_at, original.expires_at); assert.equal(copy.observed_at, original.observed_at);
    assert.equal(copy.duration_hours, 16); assert.equal(copy.mass, 'stable'); assert.equal(copy.max_ship_size, 'large'); assert.equal(copy.confirmed, false);
    assert.ok(f.read(42, source.id).connections.every(edge => edge.notes === ''), 'the source stores topology without generated annotations');
    populated.nodes[0].notes = 'Private home'; populated.connections[0].mass = 'reduced'; f.update(42, populated);
    f.tracking.populateScopes(42, scoped.id);
    assert.equal(f.read(42, scoped.id).nodes[0].notes, 'Private home'); assert.equal(f.read(42, scoped.id).connections[0].mass, 'reduced');
    assert.equal(f.read(42, source.id).nodes[0].notes, '', 'interactive annotations never flow back into the source');
    const trusted = f.read(42, scoped.id); trusted.track_passages = true;
    const exit = trusted.connections.find(edge => edge.to_system_id === A); exit.confirmed = true; exit.active = true; f.update(42, trusted);
    f.observe(42, X, AT + 60000); assert.equal(f.read(42, scoped.id).passages.length, 1, 'scoped maps retain optional passage tracking after explicit confirmation');
});

test('scope population skips expired source edges and unrelated components and never removes existing annotations on scope edits', async t => {
    const f = await fixture(t), source = f.create(42, { kind: 'tracking_source' }), scoped = f.create(42, { scope: { system_ids: [A] } });
    f.command(42, source, 'pilot.add', { character_id: 42 }); f.command(42, scoped, 'pilot.add', { character_id: 42 });
    f.observe(42, W, AT); f.observe(42, X, AT + 20000);
    const old = f.read(42, source.id); old.connections[0].expires_at = new Date(AT + 30000).toISOString(); f.update(42, old);
    f.observe(42, A, AT + 40000);
    assert.deepEqual(new Set(f.read(42, scoped.id).nodes.map(row => row.system_id)), new Set([X, A]), 'an expired connection cannot bridge the component to W');
    f.observe(42, Y, AT + 160000); f.observe(42, B, AT + 180000);
    assert.equal(f.read(42, scoped.id).nodes.some(row => row.system_id === Y), false);
    const configured = f.read(42, scoped.id); configured.scope = { system_ids: [B] }; configured.nodes[0].notes = 'Kept through scope changes'; f.update(42, configured);
    f.tracking.populateScopes(42, scoped.id);
    const updated = f.read(42, scoped.id);
    assert.deepEqual(new Set(updated.nodes.map(row => row.system_id)), new Set([X, A, Y, B]));
    assert.equal(updated.nodes[0].notes, 'Kept through scope changes');
});

test('the lightweight source follows only the active pilot while explicit interactive rosters keep tracking their pilots', async t => {
    const f = await fixture(t), source = f.create(43, { kind: 'tracking_source' }), global = f.create(42), scoped = f.create(42, { scope: { system_ids: [W] } });
    f.command(43, source, 'pilot.add', { character_id: 43 }); f.command(42, global, 'pilot.add', { character_id: 43 }); f.command(42, scoped, 'pilot.add', { character_id: 43 });
    f.observe(43, W, AT); f.observe(43, X, AT + 20000);
    assert.deepEqual(f.read(43, source.id).nodes, []); assert.equal(f.read(42, global.id).connections.length, 1);
    assert.equal(f.read(42, scoped.id).connections.length, 1, 'a nonselected explicitly tracked pilot can populate a directly matching scoped chain');
    f.activate(43); f.observe(43, W, AT + 40000);
    assert.equal(f.read(43, source.id).connections.length, 0, 'selecting a pilot starts a new source baseline');
    f.observe(43, X, AT + 60000);
    assert.equal(f.read(43, source.id).connections.length, 1); assert.equal(f.read(42, scoped.id).connections.length, 1);
    f.command(42, scoped, 'pilot.tracking', { character_id: 43, tracking: false });
    f.observe(43, A, AT + 80000);
    assert.equal(f.read(42, scoped.id).nodes.some(row => row.system_id === A), false);
    f.locations.set(43, snapshot(A, AT + 80000)); f.command(42, scoped, 'pilot.tracking', { character_id: 43, tracking: true }); f.tracking.populateScopes(42, scoped.id);
    assert.equal(f.read(42, scoped.id).nodes.some(row => row.system_id === A), true, 'resume can backfill the still-live matching component');
});

test('explicit global-map creation can copy live source topology without source notes or passage data', async t => {
    const f = await fixture(t), source = f.create(42, { kind: 'tracking_source', track_passages: true }), global = f.create(42);
    f.command(42, source, 'pilot.add', { character_id: 42 }); f.observe(42, W, AT); f.observe(42, X, AT + 20000);
    const raw = f.read(42, source.id); raw.nodes[0].notes = 'Must not copy'; raw.connections[0].active = true; raw.connections[0].confirmed = true; f.update(42, raw);
    f.observe(42, W, AT + 40000); assert.deepEqual(f.read(42, source.id).passages, [], 'source never records passages');
    f.command(42, global, 'pilot.add', { character_id: 42 });
    assert.equal(f.tracking.populateScopes(42, global.id).connections, 0);
    assert.equal(f.tracking.populateScopes(42, global.id, { includeGlobal: true }).connections, 1);
    const copy = f.read(42, global.id);
    assert.ok(copy.nodes.every(node => node.notes === '')); assert.deepEqual(copy.passages, []); assert.equal(copy.connections[0].confirmed, false);
});

test('a source update visits only that pilot\'s subscribed scoped maps and reads its graph once', async t => {
    const f = await fixture(t), source = f.create(42, { kind: 'tracking_source' });
    f.create(43, { kind: 'tracking_source' }); f.create(44, { kind: 'tracking_source' });
    const first = f.create(42, { scope: { system_ids: [W] } }), second = f.create(43, { scope: { system_ids: [W] } }), unrelated = f.create(44, { scope: { system_ids: [W] } });
    f.command(42, source, 'pilot.add', { character_id: 42 });
    f.command(42, first, 'pilot.add', { character_id: 42 }); f.command(42, first, 'pilot.add', { character_id: 43 });
    f.command(43, second, 'pilot.add', { character_id: 42 }); f.command(43, second, 'pilot.add', { character_id: 44 });
    f.command(44, unrelated, 'pilot.add', { character_id: 43 });
    f.observe(42, W, AT); f.connectionReads.length = 0; f.scopeChecks.length = 0;
    f.observe(42, X, AT + 20000);
    assert.deepEqual(f.connectionReads, [42], 'other roster pilots\' source graphs are not rebuilt for this pilot\'s event');
    assert.deepEqual(new Set(f.scopeChecks), new Set([first.id, second.id]));
    assert.equal(f.read(42, first.id).connections.length, 1); assert.equal(f.read(43, second.id).connections.length, 1);
    assert.deepEqual(f.read(44, unrelated.id).nodes, []);
    f.connectionReads.length = 0; f.tracking.populateScopes(42, first.id);
    assert.deepEqual(f.connectionReads, [42, 43], 'an explicit configuration refresh still considers all tracked pilots');
});

test('stationary samples do not resurrect a source system after pruning but new movement rediscovers it', async t => {
    const f = await fixture(t), source = f.create(42, { kind: 'tracking_source' });
    f.command(42, source, 'pilot.add', { character_id: 42 }); f.observe(42, W, AT);
    const pruned = f.read(42, source.id); pruned.nodes = []; f.update(42, pruned);
    f.observe(42, W, AT + 20000); assert.deepEqual(f.read(42, source.id).nodes, []);
    f.observe(42, X, AT + 40000);
    assert.deepEqual(new Set(f.read(42, source.id).nodes.map(node => node.system_id)), new Set([W, X]));
    assert.equal(f.read(42, source.id).connections.length, 1);
});

test('old source topology cannot revive deleted connections or removed cards, but a new observed traversal can rediscover them', async t => {
    const f = await fixture(t), source = f.create(42, { kind: 'tracking_source' }), scoped = f.create(42, { scope: { system_ids: [A] } });
    f.command(42, source, 'pilot.add', { character_id: 42 }); f.command(42, scoped, 'pilot.add', { character_id: 42 });
    f.observe(42, W, AT); f.observe(42, X, AT + 20000); f.observe(42, A, AT + 40000);
    const edited = f.read(42, scoped.id), removed = edited.connections.find(edge => edge.from_system_id === W);
    edited.connections = edited.connections.filter(edge => edge !== removed);
    edited.archived_nodes = edited.nodes.filter(node => node.system_id === W); edited.archived_nodes[0].notes = 'Home annotation';
    edited.nodes = edited.nodes.filter(node => node.system_id !== W); f.update(42, edited);
    f.observe(42, B, AT + 60000); // An unrelated K-Space gate cannot resurrect the old edge or card.
    f.tracking.populateScopes(42, scoped.id);
    assert.equal(f.read(42, scoped.id).connections.length, 1); assert.equal(f.read(42, scoped.id).nodes.some(node => node.system_id === W), false);
    assert.equal(JSON.stringify(f.read(42, scoped.id)).includes(removed.id), false, 'suppression retains no deleted connection identity');
    f.observe(42, X, AT + 80000); // A genuinely new branch extends the chain, but not its removed W branch.
    assert.equal(f.read(42, scoped.id).connections.length, 2); assert.equal(f.read(42, scoped.id).nodes.some(node => node.system_id === W), false);
    f.observe(42, W, AT + 100000);
    const rediscovered = f.read(42, scoped.id);
    assert.equal(rediscovered.connections.length, 3); assert.equal(rediscovered.nodes.find(node => node.system_id === W).notes, 'Home annotation');
    assert.notEqual(rediscovered.connections.find(edge => [edge.from_system_id, edge.to_system_id].includes(W)).id, removed.id);
});

test('an earlier expiry in an interactive map is not renewed by its still-live source copy', async t => {
    const f = await fixture(t), source = f.create(42, { kind: 'tracking_source' }), scoped = f.create(42, { scope: { system_ids: [A] } });
    f.command(42, source, 'pilot.add', { character_id: 42 }); f.command(42, scoped, 'pilot.add', { character_id: 42 });
    f.observe(42, W, AT); f.observe(42, X, AT + 20000); f.observe(42, A, AT + 40000);
    const expired = f.read(42, scoped.id); expired.connections = expired.connections.filter(edge => edge.from_system_id !== W); f.update(42, expired);
    f.time(AT + 70000); f.tracking.populateScopes(42, scoped.id);
    assert.equal(f.read(42, source.id).connections.length, 2); assert.equal(f.read(42, scoped.id).connections.length, 1);
    const reusedSource = f.read(42, source.id); reusedSource.connections = reusedSource.connections.filter(edge => edge.from_system_id !== W); f.update(42, reusedSource);
    f.observe(42, X, AT + 80000); f.observe(42, W, AT + 100000);
    assert.equal(f.read(42, scoped.id).connections.length, 2, 'fresh source evidence has a later generation and can discover a new connection');
});

test('a source connection that vanishes during copying leaves no new orphan cards or false copy count', async t => {
    const f = await fixture(t), source = f.create(42, { kind: 'tracking_source' }); f.command(42, source, 'pilot.add', { character_id: 42 });
    f.observe(42, W, AT); f.observe(42, X, AT + 20000);
    const scoped = f.create(42, { scope: { system_ids: [W] } }); f.command(42, scoped, 'pilot.add', { character_id: 42 });
    f.allowCopies(false); const result = f.tracking.populateScopes(42, scoped.id);
    assert.equal(result.connections, 0); assert.equal(result.maps, 0); assert.deepEqual(f.read(42, scoped.id).nodes, []);
    f.allowCopies(true); assert.equal(f.tracking.populateScopes(42, scoped.id).connections, 1);
});

test('a component blocked by map capacity remains eligible when space becomes available', async t => {
    const f = await fixture(t), source = f.create(42, { kind: 'tracking_source' }); f.command(42, source, 'pilot.add', { character_id: 42 });
    f.observe(42, W, AT); f.observe(42, X, AT + 20000);
    const scoped = f.create(42, { scope: { system_ids: [W] }, nodes: [W, X, A, B].map(system_id => ({ system_id })),
        connections: Array.from({ length: 1000 }, () => ({ id: randomUUID(), kind: 'wormhole', from_system_id: A, to_system_id: B })) });
    f.command(42, scoped, 'pilot.add', { character_id: 42 });
    assert.equal(f.tracking.populateScopes(42, scoped.id).connections, 0);
    assert.equal(f.read(42, scoped.id).nodes.find(node => node.system_id === W).source_coverage, undefined, 'undelivered topology is not marked as consumed');
    const freed = f.read(42, scoped.id); freed.connections.pop(); f.update(42, freed);
    assert.equal(f.tracking.populateScopes(42, scoped.id).connections, 1); assert.equal(f.read(42, scoped.id).connections.length, 1000);
});
