import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate as turn } from 'node:timers/promises';
import { openStore } from '../../server/store.mjs';
import { createESI } from '../../server/esi.mjs';

async function fixture(t, fetcher = async () => Response.json({ ok: true }, { headers: { 'Cache-Control': 'max-age=300' } })) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-esi-pacing-')), store = openStore(dir);
    let clock = Date.now(); const calls = [], waits = [];
    const esi = createESI(store, {}, { fetcher: (url, options) => { calls.push({ path: new URL(url).pathname, at: clock }); return fetcher(url, options); } });
    t.after(async () => { await esi.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
    return { esi, calls, paced: esi.paced({ spacingMs: 250, now: () => clock,
        wait: milliseconds => new Promise(resolve => waits.push({ at: clock + milliseconds, resolve })) }),
        async tick(ms) { clock += ms; for (const row of waits.splice(0)) { if (row.at <= clock) row.resolve(); else waits.push(row); } await turn(); },
    };
}

test('courtesy spacing applies to transport misses while warm reads and priority work bypass the wait', async t => {
    const f = await fixture(t);
    await f.paced('/first');
    const second = f.paced('/second'); await turn();
    assert.equal(f.esi.health().active, 0, 'A courtesy wait owns no scarce ESI network slot');
    await f.paced('/first');
    await f.esi.request('/priority', { priority: true });
    assert.deepEqual(f.calls.map(row => row.path), ['/first', '/priority']);
    await f.tick(249); assert.equal(f.calls.length, 2);
    await f.tick(1); await second;
    assert.equal(f.calls[2].path, '/second');
    assert.equal(f.calls[2].at - f.calls[0].at, 250);
    assert.equal(f.esi.health().cacheHits, 1);
});

test('queued paced callers serialize true misses and recheck the cache before spending another wait', async t => {
    const f = await fixture(t);
    await f.paced('/initial');
    const first = f.paced('/queued'), duplicate = f.paced('/queued'), next = f.paced('/next');
    await turn(); await f.tick(250);
    await Promise.all([first, duplicate]);
    assert.deepEqual(f.calls.map(row => row.path), ['/initial', '/queued']);
    await f.tick(249); assert.equal(f.calls.length, 2);
    await f.tick(1); await next;
    assert.deepEqual(f.calls.map(row => row.at - f.calls[0].at), [0, 250, 500]);
    assert.equal(f.esi.health().cacheHits, 1);
});

test('cancelling a paced admission cannot cancel or poison another consumer of the same path', async t => {
    const blocked = Promise.withResolvers(), arrived = Promise.withResolvers();
    const f = await fixture(t, async url => {
        if (url.endsWith('/shared')) { arrived.resolve(); await blocked.promise; }
        return Response.json({ ok: true }, { headers: { 'Cache-Control': 'max-age=300' } });
    });
    await f.paced('/initial');
    const controller = new AbortController();
    const cancelled = assert.rejects(f.paced('/shared', {}, () => controller.signal.throwIfAborted()), { name: 'AbortError' });
    await turn();
    const independent = f.esi.request('/shared'); await arrived.promise;
    controller.abort(); await f.tick(250); await cancelled;
    assert.equal(f.calls.filter(row => row.path === '/shared').length, 1);
    blocked.resolve(); assert.equal((await independent).data.ok, true);
    assert.equal((await f.paced('/shared')).data.ok, true);
    assert.equal(f.calls.filter(row => row.path === '/shared').length, 1);
    assert.equal(f.esi.health().failed, 0, 'A rejected admission is not a failed provider attempt');
});

test('a paced reader joins an independent in-flight request after its wait without duplicating transport', async t => {
    const blocked = Promise.withResolvers(), arrived = Promise.withResolvers();
    const f = await fixture(t, async url => {
        if (url.endsWith('/shared')) { arrived.resolve(); await blocked.promise; }
        return Response.json([]);
    });
    await f.paced('/initial');
    const paced = f.paced('/shared'); await turn();
    const independent = f.esi.request('/shared'); await arrived.promise;
    await f.tick(250);
    assert.equal(f.esi.health().coalesced, 1);
    blocked.resolve(); await Promise.all([paced, independent]);
    assert.equal(f.calls.filter(row => row.path === '/shared').length, 1);
});

test('ESI close drains already accepted paced work and rejects new paced callers', async t => {
    const f = await fixture(t);
    await f.paced('/initial');
    const accepted = f.paced('/accepted'); await turn();
    let closed = false; const closing = f.esi.close().then(() => { closed = true; });
    await assert.rejects(f.paced('/new'), /shutting down/);
    assert.throws(() => f.esi.paced(), /shutting down/);
    assert.equal(closed, false);
    await f.tick(250); await accepted; await closing;
    assert.equal(closed, true);
    assert.deepEqual(f.calls.map(row => row.path), ['/initial', '/accepted']);
});
