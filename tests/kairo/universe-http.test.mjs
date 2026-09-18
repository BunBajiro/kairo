import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startKairo } from '../../server/index.mjs';

test('Universe HTTP contract: local planning, private records, CSRF and stream isolation', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-universe-http-'));
    const networkCalls = [];
    const app = await startKairo({ port: 19180, streamPort: 19181, dataDir: dir, noSync: true,
        fetcher: async url => { networkCalls.push(String(url)); throw new Error('Universe local planning must not request ESI.'); } });
    t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
    const page = await fetch(app.origin);
    // Session establishment is independent of whether frontend assets have been built.
    assert.ok(page.headers.get('set-cookie')?.startsWith('kairo_session='));
    const cookie = page.headers.get('set-cookie').split(';')[0];
    const boot = await fetch(app.origin + '/api/bootstrap', { headers: { Cookie: cookie } }).then(r => r.json());
    const headers = { Cookie: cookie, Origin: app.origin, 'Content-Type': 'application/json', 'X-Kairo-CSRF': boot.csrf };
    const req = (path, method = 'GET', body) => fetch(app.origin + '/api/universe' + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = async (path, method = 'GET', body, expected = 200) => {
        const response = await req(path, method, body), value = await response.json();
        assert.equal(response.status, expected, JSON.stringify(value));
        return value;
    };
    let atlas, jita, amarr, staging, destination;

    await t.test('guest pilot receives the full local graph and valid route without network access', async () => {
        assert.equal((await fetch(app.origin + '/api/universe/static')).status, 401);
        atlas = await json('/static');
        assert.ok(atlas.systems.length > 8000);
        assert.ok(atlas.gates.length > 6000);
        const named = name => atlas.systems.find(system => system.name === name).system_id;
        jita = named('Jita'); amarr = named('Amarr'); staging = named('UALX-3'); destination = named('C-J6MT');
        const state = await json('');
        assert.equal(state.character_id, 0);
        assert.deepEqual(state.links, []);
        const route = await json('/route', 'POST', { originId: jita, destinationId: amarr });
        assert.equal(route.status, 'ok');
        assert.equal(route.systemIds[0], jita);
        assert.equal(route.systemIds.at(-1), amarr);
        assert.equal(route.edges.length, route.hops);
        const gatePairs = new Set(atlas.gates.flatMap(gate => [
            `${gate.from_system_id}:${gate.to_system_id}`, `${gate.to_system_id}:${gate.from_system_id}`,
        ]));
        for (const edge of route.edges) {
            assert.equal(edge.kind, 'gate');
            assert.ok(gatePairs.has(`${edge.from_system_id}:${edge.to_system_id}`));
        }
        const detail = await json('/systems/' + jita);
        assert.equal(detail.system_id, jita);
        assert.ok(Array.isArray(detail.neighbors));
        assert.deepEqual(networkCalls, []);
    });

    await t.test('static graph cache supports gzip and authenticated conditional requests', async () => {
        const compressed = await fetch(app.origin + '/api/universe/static', { headers: { ...headers, 'Accept-Encoding': 'gzip' } });
        assert.equal(compressed.status, 200);
        assert.equal(compressed.headers.get('content-encoding'), 'gzip');
        assert.match(compressed.headers.get('cache-control'), /private/);
        const etag = compressed.headers.get('etag');
        assert.ok(etag);
        assert.equal((await compressed.json()).systems.length, atlas.systems.length);
        const cached = await fetch(app.origin + '/api/universe/static', { headers: { ...headers, 'If-None-Match': etag } });
        assert.equal(cached.status, 304);
        assert.equal(await cached.text(), '');
        assert.equal((await fetch(app.origin + '/api/universe/static', { headers: { 'If-None-Match': etag } })).status, 401);
    });

    await t.test('view and link writes require CSRF before reaching the service', async () => {
        for (const [path, body] of [
            ['/views', { name: 'Denied view', config: { mode: 'security' } }],
            ['/links', { from_system_id: jita, to_system_id: amarr, kind: 'wormhole' }],
        ]) {
            const denied = await fetch(app.origin + '/api/universe' + path, {
                method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            });
            assert.equal(denied.status, 403);
        }
        const state = await json('');
        assert.deepEqual(state.views, []);
        assert.deepEqual(state.links, []);
    });

    await t.test('selected pilots keep views and manual route connections separate', async () => {
        for (const id of [42, 43]) app.store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)')
            .run(id, 'Universe pilot ' + id, '[]', '{}');
        const view = await json('/views?character=42', 'POST', { name: 'Private fleet view', config: { mode: 'standings', pinned: staging } });
        const link = await json('/links?character=42', 'POST', {
            label: 'Private wormhole', from_system_id: jita, to_system_id: amarr,
            kind: 'wormhole', enabled: true, accessible: true, confirmed: true, duration_hours: 1,
        });
        const mine = await json('?character=42'), other = await json('?character=43'), guest = await json('');
        assert.equal(mine.views[0].id, view.id);
        assert.equal(mine.links[0].id, link.id);
        assert.deepEqual(other.views, []); assert.deepEqual(other.links, []);
        assert.deepEqual(guest.views, []); assert.deepEqual(guest.links, []);
        await json('/views/' + view.id + '?character=43', 'DELETE', undefined, 400);
        await json('/links/' + link.id + '?character=43', 'DELETE', undefined, 400);
        await json('/views?character=43', 'POST', { id: view.id, name: 'Cannot overwrite', config: {} }, 400);
        const preferences = { useWormholes: true };
        const personalRoute = await json('/route?character=42', 'POST', { originId: jita, destinationId: amarr, preferences });
        const otherRoute = await json('/route?character=43', 'POST', { originId: jita, destinationId: amarr, preferences });
        assert.equal(personalRoute.hops, 1);
        assert.equal(personalRoute.edges[0].id, link.id);
        assert.equal(personalRoute.edges[0].kind, 'wormhole');
        assert.ok(otherRoute.hops > 1);
        assert.ok(otherRoute.edges.every(edge => edge.kind === 'gate'));
        await json('/links/' + link.id + '?character=42', 'DELETE');
        assert.deepEqual((await json('?character=42')).links, []);
    });

    await t.test('invalid pilot and system identifiers fail through the public API', async () => {
        for (const character of ['999999', '-1', '1.5', 'not-a-pilot']) {
            await json('?character=' + character, 'GET', undefined, 400);
            await json('/views?character=' + character, 'POST', { name: 'Invalid identity', config: {} }, 400);
        }
        await json('/systems/999999999', 'GET', undefined, 400);
        await json('/route', 'POST', { originId: jita, destinationId: 999999999 }, 400);
    });

    await t.test('connection-list import is atomic, updates in place and deletion removes its links', async () => {
        const input = { name: 'Local travel network', links: [
            { from_system_id: staging, to_system_id: destination, accessible: true },
            { from_system_id: jita, to_system_id: amarr, accessible: true },
        ] };
        const list = await json('/link-lists?character=42', 'POST', input);
        assert.equal(list.imported, 2);
        const before = await json('?character=42');
        assert.equal(before.links.length, 2);
        await json('/link-lists?character=42', 'POST', { id: list.id, name: 'Should roll back', links: [
            { from_system_id: staging, to_system_id: destination, accessible: true },
            { from_system_id: 'Not a real system', to_system_id: amarr },
        ] }, 400);
        const after = await json('?character=42');
        assert.deepEqual(after.links, before.links);
        assert.deepEqual(after.link_lists, before.link_lists);
        assert.deepEqual((await json('?character=43')).link_lists, []);
        await json('/link-lists/' + list.id + '?character=43', 'DELETE', undefined, 400);
        await json('/link-lists/' + list.id + '?character=42', 'DELETE');
        const deleted = await json('?character=42');
        assert.deepEqual(deleted.link_lists, []);
        assert.deepEqual(deleted.links, []);
    });

    await t.test('jump-plan API returns physical range legs and source metadata', async () => {
        const jump = await json('/jump-plan?character=42', 'POST', { originId: staging, destinationId: destination, rangeLy: 5 });
        assert.equal(jump.status, 'ok');
        assert.equal(jump.systemIds[0], staging);
        assert.equal(jump.systemIds.at(-1), destination);
        assert.equal(jump.rangeLy, 5);
        assert.ok(jump.edges.length > 0);
        assert.ok(jump.edges.every(edge => edge.kind === 'jump' && edge.distance_ly <= 5));
        assert.ok(jump.sources);
        assert.ok(jump.warnings.some(warning => warning.includes('Fuel, fatigue')));
        const prohibited = await json('/jump-plan', 'POST', { originId: staging, destinationId: jita, rangeLy: 5 });
        assert.equal(prohibited.status, 'invalid');
        assert.deepEqual(networkCalls, []);
    });

    await t.test('stream output exposes neither Universe APIs nor private labels', async () => {
        for (const path of ['', '/static', '/systems/' + jita, '/views', '/links', '/link-lists', '/route', '/jump-plan']) {
            assert.equal((await fetch(app.streamOrigin + '/api/universe' + path)).status, 404);
        }
        assert.equal((await fetch(app.streamOrigin + '/api/universe/views', { method: 'POST', headers, body: '{}' })).status, 405);
        const output = await fetch(app.streamOrigin + '/state').then(response => response.text());
        for (const privateText of ['Private fleet view', 'Private wormhole', 'Universe pilot 42', 'csrf', 'link_lists']) assert.equal(output.includes(privateText), false);
        assert.deepEqual(networkCalls, []);
    });
});
