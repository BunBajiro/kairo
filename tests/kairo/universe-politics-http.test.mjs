import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startKairo } from '../../server/index.mjs';

test('Power bloc HTTP settings preserve precedence, authenticate mutations and resolve actual alliances', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-politics-http-')), calls = [];
    const app = await startKairo({ port: 19284, streamPort: 19285, dataDir: dir, noSync: true,
        fetcher: async (url, options) => {
            const path = new URL(url).pathname; calls.push({ path, body: options.body });
            if (path === '/universe/ids') {
                const query = JSON.parse(options.body)[0];
                return Response.json(query === 'Remote Alliance' ? { alliances: [{ id: 99002003, name: query }] } : { corporations: [{ id: 98000001, name: query }] });
            }
            if (path === '/alliances/99002003') return Response.json({ name: 'Remote Alliance', ticker: 'RMTE' });
            return Response.json({ error: 'Alliance not found' }, { status: 404 });
        } });
    t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
    app.core.rememberNames({ 99002001: 'Configured Alliance', 99002002: 'Independent Alliance' });
    app.store.saveSnapshot(0, 'sovereignty', { status: 'ready', updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), data: [
        { system_id: 30002187, alliance_id: 99002001 }, { system_id: 30000142, alliance_id: 99002002 },
    ] });
    const page = await fetch(app.origin), cookie = page.headers.get('set-cookie').split(';')[0];
    const boot = await fetch(app.origin + '/api/bootstrap', { headers: { Cookie: cookie } }).then(r => r.json());
    const headers = { Cookie: cookie, Origin: app.origin, 'Content-Type': 'application/json', 'X-Kairo-CSRF': boot.csrf };
    const request = (path, method = 'GET', body) => fetch(app.origin + '/api/universe' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const read = async (path, method = 'GET', body, status = 200) => {
        const response = await request(path, method, body), value = await response.json();
        assert.equal(response.status, status, JSON.stringify(value)); return value;
    };
    const original = await read('/politics/config');
    const configured = { ...original, blocs: [{ id: 'manual-test', name: 'Configured Bloc', color: '#65b7e8', alliance_ids: [99002001] }], independent_alliance_ids: [99002002] };

    await t.test('settings require a local authenticated session and CSRF', async () => {
        assert.equal((await fetch(app.origin + '/api/universe/politics/config')).status, 401);
        const denied = await fetch(app.origin + '/api/universe/politics/config', { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(configured) });
        assert.equal(denied.status, 403);
        assert.equal((await read('/politics/config')).revision, original.revision);
    });
    let saved;
    await t.test('manual membership and independence resolve consistently in map and detail', async () => {
        saved = await read('/politics/config', 'PUT', configured);
        assert.equal(saved.revision, original.revision + 1);
        const state = await read(''), politics = await read('/politics');
        const member = state.systems.find(s => s.sovereignty?.alliance_id === 99002001);
        assert.equal(member.power_bloc.source, 'configured'); assert.equal(member.power_bloc.name, 'Configured Bloc');
        assert.equal(member.sovereignty.alliance_id, 99002001);
        assert.equal(state.systems.find(s => s.sovereignty?.alliance_id === 99002002).power_bloc.source, 'independent');
        assert.equal(politics.groups.find(g => g.source === 'configured').name, 'Configured Bloc');
        const detail = await read('/systems/' + member.system_id);
        assert.equal(detail.power_bloc?.source || detail.overlay?.power_bloc?.source, 'configured');
        assert.deepEqual(calls, []);
    });
    await t.test('stale edits and duplicate assignments cannot overwrite a saved configuration', async () => {
        await read('/politics/config', 'PUT', configured, 400);
        await read('/politics/config', 'PUT', { ...saved, blocs: [...saved.blocs, { id: 'duplicate', name: 'Other', color: '#e5ad62', alliance_ids: [99002001] }] }, 400);
        assert.deepEqual(await read('/politics/config'), saved);
    });
    await t.test('alliance search is local and exact lookups validate the entity category', async () => {
        const result = await read('/politics/alliances?q=Configured');
        assert.ok(result.items.some(a => a.alliance_id === 99002001 && a.name === 'Configured Alliance'));
        assert.equal((await read('/politics/alliances/resolve', 'POST', { query: 'Configured Alliance' })).alliance_id, 99002001);
        assert.deepEqual(calls, []);
        const resolved = await read('/politics/alliances/resolve', 'POST', { query: 'Remote Alliance' });
        assert.equal(resolved.alliance_id, 99002003); assert.equal(resolved.name, 'Remote Alliance');
        assert.deepEqual(calls.map(c => c.path), ['/universe/ids', '/alliances/99002003']);
        await read('/politics/alliances/resolve', 'POST', { query: 'Corporation Only' }, 400);
        await read('/politics/alliances/resolve', 'POST', { query: '../bad' }, 400);
        await read('/politics/alliances/resolve', 'POST', { query: '2147483647' }, 400);
    });
    await t.test('configured groups survive fallback refresh and stay off the stream server', async () => {
        await read('/politics', 'POST', {});
        assert.deepEqual(await read('/politics/config'), saved);
        for (const path of ['/politics', '/politics/config', '/politics/alliances']) assert.equal((await fetch(app.streamOrigin + '/api/universe' + path)).status, 404);
        assert.equal((await fetch(app.streamOrigin + '/state').then(r => r.text())).includes('Configured Bloc'), false);
    });
});
