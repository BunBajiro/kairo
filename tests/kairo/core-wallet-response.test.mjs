import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {openVault} from '../../server/vault.mjs';
import {createAuth} from '../../server/auth.mjs';
import {createESI} from '../../server/esi.mjs';
import {createCore} from '../../server/core.mjs';
import {catalog} from '../../server/modules/catalog.mjs';

async function fixture(t) {
    let clock = Date.UTC(2026, 9, 21), supplied = 10, core;
    t.mock.method(Date, 'now', () => clock);
    const dir = await mkdtemp(join(tmpdir(), 'kairo-wallet-response-')), store = openStore(dir), vault = openVault(dir), events = [], calls = [];
    for (const module of catalog) store.set('module:' + module.id, module.id === 'wallet');
    store.db.prepare('INSERT INTO characters(id,name,scopes,tokens,owner,reauth) VALUES(?,?,?,?,?,0)').run(42, 'Synthetic pilot', '["esi-wallet.read_character_wallet.v1"]',
        vault.encrypt({access_token: 'synthetic', refresh_token: 'synthetic', expires: clock + 3600000}), 'synthetic');
    const auth = createAuth(store, vault, {origin: 'http://127.0.0.1:4380', fetcher: async () => { throw Error('No live SSO'); }});
    const esi = createESI(store, auth, {fetcher: async (url, options) => {
        const wallet = new URL(url).pathname.endsWith('/wallet');
        if (wallet) calls.push({...options.headers});
        return Response.json(wallet ? supplied : [], {headers: {'Cache-Control': 'max-age=1', ETag: '"wallet"'}});
    }});
    t.after(async () => { await core?.close(); await esi.close(); store.close(); await rm(dir, {recursive: true, force: true}); });
    core = await createCore(store, auth, esi, dir, {noSync: true}); core.quiesce(); core.bus.on('data.wallet', event => events.push(event));
    return {store, core, esi, events, calls, set(value) { supplied = value; }, tick(ms) { clock += ms; }, async sync() { await core.requestSync(42); await core.bus.drain(); }};
}

for (const malformed of [null, {}, [], '500']) test(`invalid wallet ${JSON.stringify(malformed)} retains last good observation and recovers without publishing bad data`, async t => {
    const f = await fixture(t); await f.sync(); const before = f.store.snapshot(42, 'wallet');
    assert.equal(before.data, 10); assert.equal(before.status, 'ready'); assert.equal(f.events.length, 1);
    f.tick(2000); f.set(malformed); await f.sync();
    const failed = f.store.snapshot(42, 'wallet');
    assert.equal(failed.status, 'stale'); assert.equal(failed.data, 10); assert.equal(failed.updatedAt, before.updatedAt);
    assert.ok(Date.parse(failed.retryAt) > Date.now()); assert.equal(f.events.length, 1);
    assert.equal(JSON.parse(f.store.db.prepare('SELECT body FROM cache WHERE key=?').get('42:GET:/characters/42/wallet:').body), 10);
    assert.equal(f.calls.length, 2);
    // Routine collection respects the failed sample's durable retry deadline.
    await f.core.sync(42); assert.equal(f.calls.length, 2);
    f.tick(60001); f.set(0); await f.core.sync(42); await f.core.bus.drain();
    assert.equal(f.store.snapshot(42, 'wallet').status, 'ready'); assert.equal(f.store.snapshot(42, 'wallet').data, 0);
    assert.equal(f.events.length, 2); assert.equal(f.calls.length, 3);
    assert.equal(f.store.snapshot(42, 'journal').status, 'ready', 'An empty journal remains valid');
});

test('a poisoned warm wallet cache is rejected once, then a negative balance is a valid fresh observation', async t => {
    const f = await fixture(t); f.set({unexpected: true});
    await f.esi.request('/characters/42/wallet', {characterId: 42});
    f.store.saveSnapshot(42, 'wallet', {status: 'ready', data: 10, updatedAt: new Date(Date.now() - 60000).toISOString(), expiresAt: new Date(Date.now() - 1000).toISOString()});
    await f.sync();
    assert.equal(f.store.snapshot(42, 'wallet').status, 'stale'); assert.equal(f.store.snapshot(42, 'wallet').data, 10);
    assert.equal(f.events.length, 0); assert.equal(f.calls.length, 1);
    assert.equal(f.store.db.prepare('SELECT body FROM cache WHERE key=?').get('42:GET:/characters/42/wallet:'), undefined);
    f.tick(60001); f.set(-42.5); await f.core.sync(42); await f.core.bus.drain();
    assert.equal(f.store.snapshot(42, 'wallet').status, 'ready'); assert.equal(f.store.snapshot(42, 'wallet').data, -42.5);
    assert.equal(f.events.length, 1); assert.equal(f.calls.length, 2); assert.equal(f.calls[1]['If-None-Match'], undefined);
});
