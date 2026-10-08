// External synthetic fixture ownership; never imported by the application.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const BASE_COMMIT = '9afa9a7197fa6b5a802e9efdaa322dedf2439150';
export const AT = Date.parse('2026-09-25T18:00:00.000Z');
export const STAMP = new Date(AT).toISOString();
export const EXPIRY = new Date(AT + 3600000).toISOString();
export const hash = value => createHash('sha256').update(value).digest('hex');
export const configs = [
    ...['plain', 'wide'].flatMap(flavor => [1, 8, 24].map(maps => ({id: `${flavor}-${maps}`, flavor, maps}))),
    ...[1, 8].map(maps => ({id: `dense-notes-${maps}`, flavor: 'dense-notes', maps})),
    {id: 'primitive-fallback-8', flavor: 'primitive-fallback', maps: 8},
    {id: 'wide-source-1', flavor: 'wide-source', maps: 1},
];

export async function modules(source) {
    const load = name => import(pathToFileURL(join(source.root, 'server', name)));
    const [store, auth, universe, atlas] = await Promise.all([
        load('store.mjs'), load('auth.mjs'), load('universe.mjs'), load('universe-static.mjs'),
    ]);
    return {openStore: store.openStore, createAuth: auth.createAuth,
        createUniverse: universe.createUniverse, atlas: atlas.getUniverseStatic()};
}

export function connect(api, directory, clock, deny) {
    const store = api.openStore(directory);
    try {
        const auth = api.createAuth(store, {}, {origin: 'http://127.0.0.1', fetcher: deny});
        const service = api.createUniverse(store, auth, {request: deny, names: deny}, {
            staticData: api.atlas, now: () => clock.value, noSync: true,
            feeds: {noSync: true, fetcher: deny},
        });
        return {store, auth, service};
    } catch (error) { store.close(); throw error; }
}

export function authoritative(db) {
    const digest = createHash('sha256'), normalized = createHash('sha256'), ids = new Map();
    let count = 0, bodyBytes = 0;
    const byKind = {};
    for (const row of db.prepare('SELECT character_id,kind,id,body,updated_at FROM universe_records ORDER BY character_id,kind,id').iterate()) {
        const bytes = Buffer.byteLength(row.body);
        const encoded = JSON.stringify(row) + '\n';
        digest.update(encoded);
        normalized.update(encoded.replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g, id => {
            if (!ids.has(id)) ids.set(id, `generated-uuid-${ids.size}`);
            return ids.get(id);
        }));
        count++; bodyBytes += bytes;
        byKind[row.kind] = (byKind[row.kind] || 0) + 1;
    }
    return {sha256: digest.digest('hex'), uuidNormalizedSha256: normalized.digest('hex'),
        normalizedUUIDs: ids.size, rows: count, bodyBytes, byKind};
}

async function bytes(path) {
    try { return (await stat(path)).size; } catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
}

export async function storage(db, directory) {
    const scalar = name => Number(Object.values(db.prepare('PRAGMA ' + name).get())[0]);
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'universe_jspace_summary_inputs_%' ORDER BY name").all();
    const derivatives = tables.map(({name}) => {
        assert.match(name, /^universe_jspace_summary_inputs_[a-zA-Z0-9_]+$/);
        const row = db.prepare(`SELECT count(*) AS rows, sum(body IS NULL) AS fallbackRows,
            COALESCE(sum(length(CAST(body AS BLOB))),0) AS bodyBytes FROM "${name}"`).get();
        return {name, ...row};
    });
    const pageSize = scalar('page_size'), pageCount = scalar('page_count');
    return {pageSize, pageCount, freelistCount: scalar('freelist_count'), allocatedPageBytes: pageSize * pageCount,
        databaseBytes: await bytes(join(directory, 'kairo.sqlite')),
        walBytes: await bytes(join(directory, 'kairo.sqlite-wal')),
        shmBytes: await bytes(join(directory, 'kairo.sqlite-shm')), derivatives};
}

export function checkpoint(db) {
    const result = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    assert.equal(Number(result.busy), 0, 'Checkpoint must complete without another reader');
    return result;
}

function document(api, id, flavor, source = false) {
    const systems = api.atlas.systems.filter(row => row.space === 'wormhole').slice(0, 100);
    assert.equal(systems.length, 100);
    const wide = flavor === 'wide' || source && flavor === 'wide-source';
    const dense = flavor === 'dense-notes' && !source;
    const nodes = systems.map((row, index) => ({system_id: row.system_id, x: index * 340, y: 0,
        locked: false, alias: '', label: '', description: wide ? 'n'.repeat(1800) : '',
        status: 'unknown', role: '', tags: []}));
    const value = {id, name: source ? 'Live source' : id, description: '', scope: null, scope_version: 2,
        revision: 7, created_at: STAMP, updated_at: STAMP, track_passages: false,
        ...(source ? {kind: 'tracking_source'} : {}), nodes, connections: [], passages: [], observations: [],
        comments: [], archived_nodes: [], pings: [], activity: [], pilots: [{character_id: 42, tracking: true}]};
    const links = [];
    for (let index = 0; index < (dense ? 1000 : 99); index++) {
        const from = systems[index % 99].system_id, to = systems[index % 99 + 1].system_id;
        const link = {id: `${id}-link-${index}`, map_id: id, kind: 'wormhole', from_system_id: from,
            to_system_id: to, enabled: true, confirmed: true, accessible: true, reverse_accessible: true,
            directional: false, life_status: 'stable', mass: 'stable', expires_at: EXPIRY, updated_at: STAMP};
        links.push(link);
        value.connections.push({id: `${id}-edge-${index}`, link_id: link.id, kind: 'wormhole',
            from_system_id: from, to_system_id: to, ...(dense ? {notes: 'Dense connection notes '.repeat(80)} : {})});
    }
    if (wide) {
        value.comments = Array.from({length: 499}, (_, index) => ({id: `${id}-note-${index}`, body: 'c'.repeat(3000),
            system_id: null, connection_id: null, author_id: 42, author_name: 'Synthetic pilot', created_at: STAMP}));
        value.passages = Array.from({length: 1000}, (_, index) => {
            const edge = value.connections[index % value.connections.length];
            return {id: `${id}-passage-${index}`, connection_id: edge.id, link_id: edge.link_id,
                from_system_id: edge.from_system_id, to_system_id: edge.to_system_id, occurred_at: STAMP,
                pilot_name: 'Synthetic pilot', ship_name: '', ship_type_id: null, mass_kg: null,
                notes: 'p'.repeat(1400), source: 'manual_observation', reviewed: true, created_at: STAMP, updated_at: STAMP};
        });
    }
    if (flavor === 'primitive-fallback' && !source) value.comments.push('primitive legacy comment');
    assert.ok(value.connections.every(row => !row.notes || row.notes.length <= 2000));
    assert.ok(value.passages.every(row => row.notes.length <= 2000));
    assert.ok(value.comments.every(row => typeof row !== 'object' || row.body.length <= 4000));
    assert.ok(Buffer.byteLength(JSON.stringify(value)) < 4_000_000, `${id} exceeds map byte limit`);
    return {value, links};
}

// Shared seed bytes are created once through the selected baseline and reused by
// every arm. Parent owns the shared directory's lifetime; samples copy it first.
export async function seedFixture(api, baseline, directory, config, harnessFingerprint, deny) {
    const receiptPath = join(directory, 'fixture.json');
    let receipt;
    try { receipt = JSON.parse(await readFile(receiptPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (receipt) {
        assert.equal(receipt.baselineFingerprint, baseline.fingerprint);
        assert.equal(receipt.harnessFingerprint, harnessFingerprint);
        assert.deepEqual(receipt.config, config);
        assert.equal(hash(await readFile(join(directory, 'kairo.sqlite'))), receipt.databaseSha256);
        return receipt;
    }
    await mkdir(directory, {recursive: true});
    const store = api.openStore(directory);
    let service;
    try {
        store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)')
            .run(42, 'Synthetic pilot', '["esi-location.read_location.v1"]', 'synthetic-unusable');
        const auth = api.createAuth(store, {}, {origin: 'http://127.0.0.1', fetcher: deny});
        service = api.createUniverse(store, auth, {request: deny, names: deny}, {
            staticData: api.atlas, now: () => AT, noSync: true, feeds: {noSync: true, fetcher: deny},
        });
        service.jspace.setActivePilot(42);
        const put = store.db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?) ON CONFLICT(character_id,kind,id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at');
        store.db.exec('BEGIN');
        const inputs = [];
        for (let index = 0; index <= config.maps; index++) {
            const source = index === config.maps, id = source ? 'tracking-source-42' : `map-${index}`;
            const {value, links} = document(api, id, config.flavor, source);
            for (const link of links) put.run(42, 'link', link.id, JSON.stringify(link), STAMP);
            const body = JSON.stringify(value); put.run(42, 'jspace_map', id, body, STAMP);
            inputs.push({id, bytes: Buffer.byteLength(body), sha256: hash(body), nodes: value.nodes.length,
                connections: value.connections.length, comments: value.comments.length, passages: value.passages.length});
        }
        store.db.exec('COMMIT');
        assert.equal(store.db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name LIKE 'universe_jspace_summary_inputs_%'").get().n, 0,
            'Fixture must predate the side table');
        const beforeRead = authoritative(store.db), summary = service.jspace.summaries(42);
        assert.equal(summary.maps.length, config.maps); assert.equal(summary.source_map.node_count, 100);
        assert.deepEqual(authoritative(store.db), beforeRead, 'Baseline fixture must start reconciled');
        await service.close(); service = null;
        checkpoint(store.db);
        receipt = {schemaVersion: 1, config, baselineFingerprint: baseline.fingerprint, harnessFingerprint,
            inputs, inputSha256: hash(JSON.stringify(inputs)), authoritative: authoritative(store.db),
            summarySha256: hash(JSON.stringify(summary)), summary, storage: await storage(store.db, directory)};
    } finally { await service?.close(); store.close(); }
    receipt.databaseSha256 = hash(await readFile(join(directory, 'kairo.sqlite')));
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
    return receipt;
}
