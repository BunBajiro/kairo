// Untimed, separate-process semantic/counter guard; never used as latency evidence.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {loadSourceManifest, verifySource} from '../../../../../harness/source-manifest.mjs';

assert.equal(process.env.KAIRO_M9_MATCHED_LOCK_HELD, '1', 'Use the matched parent runner');
const [manifestPath, outputPath] = process.argv.slice(2), output = resolve(outputPath);
const source = await loadSourceManifest(manifestPath);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const self = fileURLToPath(import.meta.url), harnessSha256 = hash(await readFile(self));
const module = name => import(pathToFileURL(join(source.root, 'server', name)));
const [{openStore}, {createAuth}, {createUniverse}, {getUniverseStatic}] = await Promise.all([
    module('store.mjs'), module('auth.mjs'), module('universe.mjs'), module('universe-static.mjs'),
]);
const at = Date.parse('2026-09-25T18:00:00.000Z'), stamp = new Date(at).toISOString();
let clock = at, calls = 0, rows = 0, external = 0;
const deny = async () => { external++; throw new Error('No external traffic in M9 semantic guard'); };
const atlas = getUniverseStatic(), [first, second] = atlas.systems.filter(row => row.space === 'wormhole');
const scopes = ['esi-location.read_location.v1', 'esi-location.read_ship_type.v1', 'esi-location.read_online.v1'];
const dir = await mkdtemp(join(tmpdir(), 'kairo-m9-guards-')), store = openStore(dir);
let service;
const result = {schemaVersion: 1, startedAt: new Date().toISOString(), complete: false,
    diagnosticOnly: true, performanceAcceptance: false, harnessSha256,
    source: {commit: source.sourceCommit, fingerprint: source.fingerprint}, phases: []};
try {
    const insertPilot = store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)');
    for (const id of [42, 43]) insertPilot.run(id, 'Pilot ' + id, JSON.stringify(scopes), 'synthetic-unused');
    const auth = createAuth(store, {}, {origin: 'http://127.0.0.1', fetcher: deny});
    const originalCharacters = auth.characters;
    auth.characters = () => { const value = originalCharacters(); calls++; rows += value.length; return value; };
    service = createUniverse(store, auth, {request: deny, names: deny}, {
        staticData: atlas, now: () => clock, noSync: true, feeds: {noSync: true, fetcher: deny},
    });
    const expiry = new Date(at + 3600000).toISOString(), sampleExpiry = new Date(at + 60000).toISOString();
    const link = {id: 'guard-link', map_id: 'guard-map', kind: 'wormhole',
        from_system_id: first.system_id, to_system_id: second.system_id,
        enabled: true, confirmed: true, accessible: true, reverse_accessible: true,
        directional: false, life_status: 'stable', mass: 'stable', expires_at: expiry, updated_at: stamp};
    const map = {id: 'guard-map', name: 'Guard map', description: 'Complete retained data',
        scope: null, scope_version: 2, revision: 7, created_at: stamp, updated_at: stamp,
        track_passages: false, nodes: [first, second].map((system, index) => ({
            system_id: system.system_id, x: index * 340, y: 0, locked: false,
            alias: '', label: '', description: 'Retained system note', status: 'unknown', role: '', tags: [],
        })), connections: [{id: 'guard-edge', link_id: link.id, kind: 'wormhole',
            from_system_id: first.system_id, to_system_id: second.system_id}],
        passages: [{id: 'guard-passage', connection_id: 'guard-edge', mass_kg: 1000, notes: 'Retained passage'}],
        observations: [], pings: [], activity: [], comments: [
            {id: 'guard-system-note', system_id: first.system_id, connection_id: null, body: 'Permanent note'},
            {id: 'guard-edge-note', system_id: null, connection_id: 'guard-edge', body: 'Temporary edge note'},
        ], pilots: [42, 43].map(character_id => ({character_id, tracking: true, last_location: {
            system_id: first.system_id, source: 'esi', updated_at: stamp, expires_at: sampleExpiry,
        }}))};
    const put = store.db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?) ON CONFLICT(character_id,kind,id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at');
    const saveMap = value => put.run(42, 'jspace_map', map.id, JSON.stringify(value), stamp);
    const saveLink = value => put.run(42, 'link', link.id, JSON.stringify(value), stamp);
    const readMap = () => JSON.parse(store.db.prepare("SELECT body FROM universe_records WHERE character_id=42 AND kind='jspace_map' AND id=?").get(map.id).body);
    saveMap(map); saveLink(link); service.jspace.setActivePilot(42);
    for (const id of [42, 43]) for (const [key, data] of [['location', {solar_system_id: first.system_id}], ['ship', {ship_type_id: 587}], ['online', {online: true}]]) {
        store.saveSnapshot(id, key, {status: 'ready', data, updatedAt: stamp, expiresAt: sampleExpiry});
    }
    result.fixtureSha256 = hash(JSON.stringify({map, link, scopes, systems: [first.system_id, second.system_id]}));
    const tracked = value => value.selected.pilots.find(pilot => pilot.character_id === 43);
    const operational = value => value.selected.operations.pilots.find(pilot => pilot.character_id === 43);
    function capture(name, check, noWrites = true) {
        const previousCalls = calls, previousRows = rows;
        const changesBefore = Number(store.db.prepare('SELECT total_changes() n').get().n);
        const value = {selected: service.jspace.map(42, map.id), full: service.jspace.state(42), summary: service.jspace.summaries(42)};
        assert.deepEqual(value.full.maps.find(row => row.id === map.id), value.selected);
        check(value);
        const changes = Number(store.db.prepare('SELECT total_changes() n').get().n) - changesBefore;
        if (noWrites) assert.equal(changes, 0, name + ': unchanged read must not persist data');
        const stored = readMap(), encoded = JSON.stringify(value);
        result.phases.push({name, value, outputSha256: hash(encoded), outputBytes: Buffer.byteLength(encoded),
            stored, storedSha256: hash(JSON.stringify(stored)), databaseChanges: changes,
            auth: {calls: calls - previousCalls, rows: rows - previousRows}});
    }
    capture('initial-ready-notes-passages', value => {
        assert.equal(tracked(value).system_id, first.system_id); assert.equal(operational(value).ship_type_id, 587);
        assert.equal(value.selected.passages.length, 1); assert.equal(value.selected.comments.length, 2);
        assert.ok(value.selected.connections[0].active);
    });
    store.db.prepare("UPDATE characters SET name='Renamed pilot' WHERE id=43").run();
    capture('rename-between-reads', value => assert.equal(tracked(value).name, 'Renamed pilot'));
    store.db.prepare("UPDATE characters SET scopes='[]' WHERE id=43").run();
    capture('scope-revoked-between-reads', value => {
        assert.equal(tracked(value).system_id, null); assert.equal(operational(value).status, 'missing_scope');
        assert.equal(operational(value).ship_type_id, null); assert.equal(operational(value).online, null);
    });
    store.db.prepare('UPDATE characters SET scopes=?,reauth=1 WHERE id=43').run(JSON.stringify(scopes));
    capture('reauth-between-reads', value => { assert.equal(tracked(value).status, 'reauth_required'); assert.equal(tracked(value).system_id, null); });
    store.db.prepare('UPDATE characters SET reauth=0 WHERE id=43').run();
    store.set('module:pilot', false);
    capture('pilot-module-disabled', value => { assert.equal(tracked(value).system_id, null); assert.equal(operational(value).ship_type_id, null); });
    store.set('module:pilot', true); store.set('module:universe', false);
    capture('universe-module-disabled', value => { assert.equal(tracked(value).system_id, null); assert.deepEqual(value.selected.operations.pilots, []); });
    store.set('module:universe', true);
    service.operations.saveConfig(43, {...service.operations.config(43), location_source: 'logs', logs_enabled: false});
    capture('esi-location-no-longer-authorized', value => assert.equal(tracked(value).system_id, null));
    service.operations.saveConfig(43, {...service.operations.config(43), location_source: 'esi'});
    store.db.prepare('DELETE FROM characters WHERE id=43').run();
    capture('tracked-pilot-disconnected', value => { assert.equal(tracked(value).status, 'disconnected'); assert.equal(operational(value), undefined); });
    insertPilot.run(43, 'Reconnected pilot', JSON.stringify(scopes), 'synthetic-unused');
    capture('tracked-pilot-reconnected', value => { assert.equal(tracked(value).name, 'Reconnected pilot'); assert.equal(tracked(value).system_id, first.system_id); });
    clock = at + 60000;
    capture('location-ship-online-expired', value => {
        assert.equal(tracked(value).system_id, null); assert.equal(operational(value).status, 'stale');
        assert.equal(operational(value).ship_type_id, null); assert.equal(operational(value).online, null);
    });
    const paused = readMap(); paused.pilots[1].tracking = false; saveMap(paused);
    capture('tracking-paused-direct-mutation', value => assert.equal(tracked(value).status, 'paused'));
    const legacy = readMap(); legacy.connections[0].locked = false; legacy.archived_connections = []; delete legacy.activity;
    legacy.passages.push({id: 'dangling-passage', connection_id: 'missing'});
    legacy.comments.push({id: 'dangling-comment', connection_id: 'missing', body: 'Must be removed'}); saveMap(legacy);
    capture('legacy-and-dangling-reference-normalization', value => {
        assert.equal(value.selected.passages.length, 1); assert.equal(value.selected.comments.length, 2);
        assert.ok(!Object.hasOwn(value.selected.connections[0], 'locked'));
        assert.ok(!Object.hasOwn(readMap(), 'archived_connections')); assert.deepEqual(readMap().activity, []);
    }, false);
    saveLink({...link, expires_at: '2026-09-25T19:00:00+01:00'});
    capture('canonical-timezone-expiry-injected', value => {
        assert.deepEqual(value.selected.connections, []); assert.deepEqual(value.selected.passages, []);
        assert.deepEqual(value.selected.comments.map(note => note.id), ['guard-system-note']);
        assert.ok(value.selected.revision > map.revision);
    }, false);
    saveMap(map); saveLink(link); clock = at;
    capture('replacement-canonical-and-map-document-injected', value => {
        assert.ok(value.selected.connections[0].active); assert.equal(value.selected.passages.length, 1);
        assert.equal(tracked(value).system_id, first.system_id);
    });
    saveLink({...link, life_status: 'collapsed', expires_at: null});
    capture('canonical-collapsed-unknown-lifetime-injected', value => {
        assert.deepEqual(value.selected.connections, []); assert.deepEqual(value.selected.passages, []);
        assert.equal(value.selected.comments.length, 1);
    }, false);
    store.db.prepare('DELETE FROM characters WHERE id=42').run();
    for (const call of [() => service.jspace.map(42, map.id), () => service.jspace.state(42), () => service.jspace.summaries(42),
        () => service.jspace.command(42, map.id, {revision: 7, op: 'map.update', name: 'Forbidden stale author'})]) assert.throws(call, /connected pilot/);
    result.disconnectedOwnerReadAndMutationRejected = true;
    assert.equal(external, 0);
    await verifySource(source); assert.equal(hash(await readFile(self)), harnessSha256);
    result.sourceVerified = true; result.complete = true;
} catch (error) { result.failure = error.stack; throw error; }
finally {
    await service?.close(); store.close(); await rm(dir, {recursive: true, force: true});
    result.endedAt = new Date().toISOString(); result.external = external;
    await writeFile(output, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
}
