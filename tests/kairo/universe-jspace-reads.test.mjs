import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../../server/store.mjs';
import { createUniverse } from '../../server/universe.mjs';
import { mapSystemIndex, searchMapSystems } from '../../components/kairo/map-discovery-search-model.mjs';
import { searchMapNotes } from '../../components/kairo/jspace-notes-model.mjs';

const AT = Date.parse('2026-09-25T18:00:00Z'), W = 31000001, X = 31000002, Y = 31000003;
const atlas = { metadata: {}, regions: [], constellations: [], gates: [], systems: [W, X, Y].map((id, i) => ({ system_id: id, name: 'J00000' + (i + 1), space: 'wormhole', security: -1, x: i, y: 0, z: 0 })) };

async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-jspace-reads-')), store = openStore(dir);
    let clock = AT, recording = null;
    const prepare = store.db.prepare.bind(store.db);
    store.db.prepare = sql => {
        const statement = prepare(sql);
        for (const method of ['all', 'get']) {
            const original = statement[method].bind(statement);
            statement[method] = (...args) => {
                const result = original(...args);
                if (recording) recording.push({ sql, args, rows: method === 'all' ? result : result ? [result] : [] });
                return result;
            };
        }
        return statement;
    };
    const auth = { characters: () => [{ id: 42, name: 'Scout', scopes: [] }, { id: 43, name: 'Other scout', scopes: [] }] };
    const service = createUniverse(store, auth, { request: async () => { throw new Error('No network expected'); } }, { staticData: atlas, now: () => clock, noSync: true });
    t.after(async () => { await service.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
    const api = service.jspace;
    function create(name, owner = 42) {
        let map = api.create(owner, { name });
        const command = input => { map = api.command(owner, map.id, { revision: map.revision, ...input }); };
        for (const system_id of [W, X, Y]) command({ op: 'node.save', node: { system_id, alias: system_id === W ? 'Staging home' : '' } });
        for (const [system_id, signature_id] of [[W, 'AAA-001'], [X, 'BBB-002'], [Y, 'CCC-003']]) service.operations.saveSignature(owner, { map_id: map.id, system_id, signature_id, type: 'Wormhole' });
        for (const [to_system_id, to_signature] of [[X, 'BBB-002'], [Y, 'CCC-003']]) command({ op: 'connection.save', connection: { from_system_id: W, to_system_id, from_signature: 'AAA-001', to_signature, duration_hours: 1, confirmed: true, accessible: true } });
        for (const edge of [...map.connections]) for (const system_id of [edge.from_system_id, edge.to_system_id]) {
            const signature = map.signatures.find(row => row.system_id === system_id);
            command({ op: 'signature.save', signature: { id: signature.id, system_id, signature_id: signature.signature_id, connection_id: edge.id } });
        }
        command({ op: 'comment.add', comment: { body: 'Scout staging report', system_id: W } });
        command({ op: 'comment.add', comment: { body: 'Connection scout report', connection_id: map.connections[0].id } });
        return map;
    }
    function read(fn) {
        recording = [];
        try {
            const value = fn(), queries = recording;
            const bodies = queries.flatMap(query => query.rows.flatMap(row => typeof row.body === 'string' ? [JSON.parse(row.body)] : []));
            return { value, queries, links: bodies.filter(row => ['wormhole', 'ansiblex'].includes(row.kind)), signatures: bodies.filter(row => row.signature_id && row.system_id) };
        } finally { recording = null; }
    }
    return { service, api, store, create, read, time: value => { clock = value; } };
}

test('selected reads remain scoped and full reads share canonical links and signature records', async t => {
    const f = await fixture(t), first = f.create('Selected map');
    const single = f.read(() => f.api.map(42, first.id));
    for (let i = 0; i < 7; i++) f.create('Other map ' + i);
    const selected = f.read(() => f.api.map(42, first.id));
    assert.deepEqual(selected.value, single.value);
    for (const read of [single, selected]) {
        assert.equal(read.links.length, 2, 'Only selected canonical link bodies cross the SQLite boundary');
        assert.equal(read.signatures.length, 3, 'Signatures are read once per scope, not once per endpoint');
        assert.ok(read.links.every(link => link.map_id === first.id));
        assert.equal(read.queries.filter(query => query.sql.includes('SELECT character_id,body') && query.sql.includes("kind='link'")).length, 1, 'One real expiry sweep per read');
    }
    const full = f.read(() => f.api.state(42));
    assert.equal(full.value.maps.length, 8);
    assert.deepEqual(full.value.maps.find(map => map.id === first.id), single.value);
    assert.equal(full.links.length, 16, 'Full list reads each canonical link once');
    assert.equal(full.signatures.length, 24);
    assert.equal(full.queries.filter(query => query.sql.includes('SELECT character_id,body') && query.sql.includes("kind='link'")).length, 1);
    const sig = selected.value.signatures.find(row => row.system_id === W);
    assert.deepEqual(sig.connection_ids, selected.value.connections.map(row => row.id), 'Reverse bindings keep connection order');
    assert.ok(selected.value.connections.every(row => row.active && row.confirmed && row.accessible && row.expires_at === new Date(AT + 3600000).toISOString()));
    const summary = f.read(() => f.api.summaries(42));
    assert.equal(summary.value.maps.length, 8);
    assert.equal(summary.links.length, 16);
    assert.equal(summary.queries.filter(query => query.sql.includes('universe_operations_records')).length, 0, 'Summaries do not fetch operational payloads');
    assert.equal(summary.value.maps[0].node_count, 3);
    assert.equal(summary.value.maps[0].connection_count, 2);
    assert.equal(summary.value.maps[0].pilot_count, 1);
    assert.equal(summary.value.maps[0].next_expiry_at, new Date(AT + 3600000).toISOString());
    for (const map of [...summary.value.maps, summary.value.source_map]) for (const key of ['nodes', 'connections', 'operations', 'signatures', 'comments', 'pilots']) assert.equal(Object.hasOwn(map, key), false);
    assert.ok(Buffer.byteLength(JSON.stringify(summary.value)) < Buffer.byteLength(JSON.stringify(full.value)) / 5);
    const linkQuery = selected.queries.find(query => query.sql.includes('UNION ALL'));
    const plan = f.store.db.prepare('EXPLAIN QUERY PLAN ' + linkQuery.sql).all(...linkQuery.args);
    assert.equal(plan.filter(row => row.detail.includes('idx_universe_links_scope')).length, 2, 'Both selected and global link scopes use the map index');
    t.diagnostic(JSON.stringify({ selectedLinkBodiesBeforeOtherMaps: single.links.length, selectedLinkBodiesAfterOtherMaps: selected.links.length, fullEightMapsLinkBodies: full.links.length, fullEightMapsSignatureBodies: full.signatures.length, fullQueries: full.queries.length, summaryQueries: summary.queries.length }));
});

test('summary and search reads reconcile expiry and pruning without stale revisions or a cross-request cache', async t => {
    const f = await fixture(t), original = f.create('Expiring map');
    const initial = f.api.summaries(42).maps[0];
    assert.equal(initial.revision, original.revision);
    f.time(AT + 3600000);
    const expired = f.api.summaries(42).maps[0], detail = f.api.map(42, original.id);
    assert.equal(expired.connection_count, 0);
    assert.equal(expired.node_count, 3, 'Disconnected cards retain their grace period');
    assert.equal(expired.next_expiry_at, null);
    assert.ok(expired.revision > original.revision);
    assert.equal(detail.revision, expired.revision);
    assert.deepEqual(detail.connections, []);
    assert.deepEqual(detail.signatures, [], 'Expiry deletes only the exact bound UUIDs');
    assert.equal(f.api.search(42, { kind: 'notes', q: 'Connection scout' }).results.length, 0);
    assert.equal(f.api.search(42, { kind: 'notes', q: 'Scout staging' }).results.length, 1);
    assert.throws(() => f.api.command(42, original.id, { revision: original.revision, op: 'map.update', name: 'Stale write' }), error => error.status === 409);
    f.time(AT + 5400000);
    const pruned = f.api.summaries(42).maps[0];
    assert.equal(pruned.node_count, 0);
    assert.ok(pruned.revision > expired.revision);
    assert.equal(f.api.search(42, { kind: 'systems', q: 'staging' }).results.length, 0);
    const notes = f.api.search(42, { kind: 'notes', q: 'Scout staging' }).results;
    assert.equal(notes.length, 1); assert.equal(notes[0].archived, true);

    f.time(AT);
    const imported = f.create('Fresh canonical data');
    f.api.summaries(42);
    const put = f.store.db.prepare("UPDATE universe_records SET body=? WHERE character_id=42 AND kind='link' AND id=?");
    for (const row of f.store.db.prepare("SELECT body FROM universe_records WHERE character_id=42 AND kind='link'").all()) {
        const link = JSON.parse(row.body);
        if (link.map_id === imported.id) { link.expires_at = new Date(AT - 1).toISOString(); put.run(JSON.stringify(link), link.id); }
    }
    assert.equal(f.api.summaries(42).maps.find(map => map.id === imported.id).connection_count, 0, 'Direct imported canonical changes participate in the next real expiry sweep');
});

test('library search retains shared result semantics and keeps sources and other pilots private', async t => {
    const f = await fixture(t), first = f.create('Library map');
    f.create('Other pilot', 43);
    const full = f.api.state(42).maps;
    for (const query of ['J000001', 'staging home', 'Library', 'missing', '']) {
        const actual = f.read(() => f.api.search(42, { kind: 'systems', q: query }));
        assert.deepEqual(actual.value.results, searchMapSystems(mapSystemIndex(full, atlas.systems), query));
        assert.equal(actual.queries.filter(row => row.sql.includes('universe_operations_records')).length, 0);
    }
    for (const query of ['Scout', 'Connection', 'J000001', 'missing', '']) assert.deepEqual(f.api.search(42, { kind: 'notes', q: query }).results,
        searchMapNotes(full, query, { systemName: id => atlas.systems.find(row => row.system_id === id)?.name || String(id), limit: 8, now: AT }));
    assert.ok(f.api.search(43, { q: 'staging' }).results.every(row => row.map_id !== first.id));
    assert.deepEqual(f.api.summaries(0).maps, []);
    assert.equal(f.api.summaries(0).source_map, null);
    assert.deepEqual(f.api.search(0, { q: 'staging' }).results, []);
    assert.throws(() => f.api.map(43, first.id), /not found/);
    assert.throws(() => f.api.summaries(999), /connected pilot/);
    assert.throws(() => f.api.search(999, { q: 'staging' }), /connected pilot/);
    assert.throws(() => f.api.search(42, { kind: 'all' }), /supported value/);
    assert.throws(() => f.api.search(42, { q: 'x'.repeat(241) }), /too long/);
    assert.throws(() => f.service.jspaceDestinations(42, { map_id: 'tracking-source-42', originId: W, category: 'highsec' }), /private chain map/);
});
