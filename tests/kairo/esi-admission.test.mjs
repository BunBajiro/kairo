import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setImmediate as turn} from 'node:timers/promises';
import {openStore} from '../../server/store.mjs';
import {createESI} from '../../server/esi.mjs';

async function fixture(t, {auth = {}, response = () => Response.json([])} = {}) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-esi-admission-')), store = openStore(dir), calls = [];
    const gates = Array.from({length: 4}, () => Promise.withResolvers());
    const esi = createESI(store, auth, {fetcher: async (url, options) => {
        const path = new URL(url).pathname; calls.push({path, headers: {...options.headers}});
        if (path.startsWith('/hold')) await gates[Number(path.slice(5))].promise;
        return response(path, options);
    }});
    t.after(async () => { gates.forEach(gate => gate.resolve()); await esi.close(); store.close(); await rm(dir, {recursive: true, force: true}); });
    return {esi, store, calls, read: esi.paced({spacingMs: 0}), release: () => gates[0].resolve(),
        async occupy() { gates.forEach((_, index) => { esi.request('/hold' + index).catch(() => {}); }); await turn(); assert.equal(esi.health().active, 4); }};
}
function consumer() {
    let allowed = true;
    return {cancel() { allowed = false; }, check() { if (!allowed) throw new Error('Consumer cancelled'); }};
}

test('a cancelled paced consumer releases its queued slot without dispatch or retry-cache pollution', async t => {
    const f = await fixture(t), owner = consumer(); await f.occupy();
    const queued = f.read('/read', {}, owner.check).catch(error => error); await turn();
    assert.equal(f.esi.health().queued, 1); owner.cancel(); f.release();
    assert.match((await queued).message, /cancelled/);
    assert.equal(f.calls.some(call => call.path === '/read'), false);
    assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM cache WHERE key LIKE '%:/read:%'").get().n, 0);
    assert.equal(f.esi.health().failed, 0); assert.equal(f.esi.health().queued, 0);
});

test('a cancelled flight leader cannot cancel an eligible unguarded follower or its reusable cache', async t => {
    const f = await fixture(t), owner = consumer(); await f.occupy();
    const leader = f.read('/read', {}, owner.check).catch(error => error); await turn();
    const follower = f.esi.request('/read'); owner.cancel(); f.release();
    assert.deepEqual((await follower).data, []); assert.match((await leader).message, /cancelled/);
    assert.equal(f.calls.filter(call => call.path === '/read').length, 1);
    await f.esi.request('/read'); assert.equal(f.calls.filter(call => call.path === '/read').length, 1);
    assert.equal(f.esi.health().coalesced, 1); assert.equal(f.esi.health().failed, 0);
});

test('a cancelled guarded follower cannot cancel its eligible leader', async t => {
    const f = await fixture(t), owner = consumer(); await f.occupy();
    const leader = f.esi.request('/read'); await turn();
    const follower = f.read('/read', {}, owner.check).catch(error => error); owner.cancel(); f.release();
    assert.deepEqual((await leader).data, []); assert.match((await follower).message, /cancelled/);
    assert.equal(f.calls.filter(call => call.path === '/read').length, 1); assert.equal(f.esi.health().failed, 0);
});

test('a queued shared flight with no eligible consumers dispatches nothing and permits a later healthy read', async t => {
    const f = await fixture(t), first = consumer(), second = consumer(); await f.occupy();
    const a = f.read('/read', {}, first.check).catch(error => error); await turn();
    const b = f.read('/read', {}, second.check).catch(error => error); first.cancel(); second.cancel(); f.release();
    assert.match((await a).message, /cancelled/); assert.match((await b).message, /cancelled/);
    assert.equal(f.calls.filter(call => call.path === '/read').length, 0);
    assert.equal(f.esi.health().failed, 0);
    assert.deepEqual((await f.esi.request('/read')).data, []); assert.equal(f.calls.filter(call => call.path === '/read').length, 1);
});

for (const phase of ['token lookup', '401 refresh']) test(`eligibility lost during ${phase} prevents the next private dispatch without recording a provider failure`, async t => {
    const entered = Promise.withResolvers(), gate = Promise.withResolvers(), owner = consumer(); let tokenCalls = 0, sends = 0;
    const auth = {access: async () => { tokenCalls++; if (tokenCalls === (phase === 'token lookup' ? 1 : 2)) { entered.resolve(); await gate.promise; } return 'synthetic'; }};
    const f = await fixture(t, {auth, response: () => Response.json([], {status: ++sends === 1 && phase === '401 refresh' ? 401 : 200})});
    t.after(() => gate.resolve());
    const pending = f.read('/private', {characterId: 42}, owner.check).catch(error => error); await entered.promise;
    owner.cancel(); gate.resolve(); assert.match((await pending).message, /cancelled/);
    assert.equal(f.calls.length, phase === 'token lookup' ? 0 : 1);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM cache').get().n, 0);
    assert.equal(f.esi.health().failed, 0); assert.equal(f.esi.health().active, 0);
});

test('an already cancelled 401 consumer does not initiate a forced token refresh', async t => {
    const owner = consumer(); let tokenCalls = 0;
    const f = await fixture(t, {auth: {access: async () => { tokenCalls++; return 'synthetic'; }}, response: () => { owner.cancel(); return Response.json({}, {status: 401}); }});
    const outcome = await f.read('/private', {characterId: 42}, owner.check).catch(error => error);
    assert.match(outcome.message, /cancelled/); assert.equal(tokenCalls, 1); assert.equal(f.calls.length, 1);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM cache').get().n, 0); assert.equal(f.esi.health().failed, 0);
});
