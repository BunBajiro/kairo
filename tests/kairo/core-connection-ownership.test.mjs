import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createCore} from '../../server/core.mjs';
import {createAuth} from '../../server/auth.mjs';
import {openStore} from '../../server/store.mjs';
import {catalog} from '../../server/modules/catalog.mjs';

const walletScope = 'esi-wallet.read_character_wallet.v1';
async function fixture(t, {enrichment = false} = {}) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-core-ownership-')), store = openStore(dir);
    const connect = (scopes = [walletScope]) => store.db.prepare('INSERT OR REPLACE INTO characters(id,name,scopes,tokens,owner,reauth) VALUES(?,?,?,?,?,0)')
        .run(42, 'Pilot', JSON.stringify(scopes), '{}', 'owner');
    connect();
    for (const module of catalog) store.set('module:' + module.id, module.id === 'wallet');
    const auth = createAuth(store, {decrypt: JSON.parse}, {origin: 'http://127.0.0.1:4380', fetcher: async () => { throw new Error('No provider access needed'); }});
    const sample = data => ({data, updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), headers: {}});
    store.saveSnapshot(42, 'wallet', {...sample(10), status: 'ready'});
    const entered = Promise.withResolvers(), gate = Promise.withResolvers(), calls = [], events = [];
    let block = true;
    const request = async path => {
        calls.push(path);
        if (path.endsWith('/wallet')) {
            if (block && !enrichment) { entered.resolve(); await gate.promise; }
            return sample(500);
        }
        if (path.endsWith('/journal')) return sample(enrichment ? [{id: 1, from_id: 99}] : []);
        return sample([]);
    };
    const core = await createCore(store, auth, {request, paged: request, health: () => ({}), names: async () => {
        if (block && enrichment) { entered.resolve(); await gate.promise; }
        return {99: 'Resolved'};
    }}, dir, {noSync: true});
    core.quiesce(); core.bus.on('*', event => events.push(event));
    t.after(async () => { gate.resolve(); await core.close(); store.close(); await rm(dir, {recursive: true, force: true}); });
    return {store, auth, core, connect, sample, entered, gate, calls, events, release: () => { block = false; gate.resolve(); }};
}

for (const failed of [false, true]) test(`a disconnected pilot's pending ${failed ? 'failed' : 'successful'} dataset cannot recreate purged snapshots`, async t => {
    const f = await fixture(t), work = f.core.sync(42);
    await f.entered.promise;
    await f.auth.disconnect(42);
    if (failed) f.gate.reject(new Error('Old request failed')); else f.release();
    await work;
    assert.equal(f.store.snapshot(42, 'wallet'), null, 'The removed pilot must not regain a ready/stale/error private snapshot');
    assert.equal(f.events.some(event => event.type === 'data.wallet'), false);
    assert.equal(f.calls.includes('/characters/42/orders'), false, 'Later batches must not dispatch for the removed connection');
});

test('narrower access during a request cannot publish or retain the old response as fresh', async t => {
    const f = await fixture(t), work = f.core.sync(42);
    await f.entered.promise;
    f.connect([]);
    f.release(); await work;
    assert.notEqual(f.store.snapshot(42, 'wallet')?.data, 500);
    assert.equal(f.events.some(event => event.type === 'data.wallet'), false);
});

test('revoked access during a request suppresses new snapshots and later collection batches', async t => {
    const f = await fixture(t), work = f.core.sync(42);
    await f.entered.promise;
    f.store.db.prepare('UPDATE characters SET reauth=1 WHERE id=42').run();
    f.release(); await work;
    assert.equal(f.store.snapshot(42, 'wallet').data, 10);
    assert.equal(f.events.some(event => event.type === 'data.wallet'), false);
    assert.equal(f.calls.includes('/characters/42/orders'), false);
});

test('disconnect then reconnect with the same scope rejects the old connection and permits a new collection', async t => {
    const f = await fixture(t), work = f.core.sync(42);
    await f.entered.promise;
    await f.auth.disconnect(42); f.connect();
    f.release(); await work;
    assert.equal(f.store.snapshot(42, 'wallet'), null);
    assert.equal(f.events.some(event => event.type === 'data.wallet'), false);
    await f.core.requestSync(42);
    assert.equal(f.store.snapshot(42, 'wallet').data, 500);
    assert.equal(f.events.filter(event => event.type === 'data.wallet').length, 1);
});

test('a disconnect during optional name enrichment also fences dataset publication', async t => {
    const f = await fixture(t, {enrichment: true}), work = f.core.sync(42);
    await f.entered.promise;
    await f.auth.disconnect(42);
    f.release(); await work;
    assert.equal(f.store.snapshot(42, 'journal'), null);
    assert.equal(f.events.some(event => event.type === 'data.journal'), false);
});

test('ordinary token rotation preserves accepted dataset work and its event', async t => {
    const f = await fixture(t), work = f.core.sync(42);
    await f.entered.promise;
    f.store.db.prepare('UPDATE characters SET tokens=? WHERE id=42').run('{"refreshed":true}');
    f.release(); await work;
    assert.equal(f.store.snapshot(42, 'wallet').data, 500);
    assert.equal(f.events.filter(event => event.type === 'data.wallet').length, 1);
});
