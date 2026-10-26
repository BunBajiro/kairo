import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {openVault} from '../../server/vault.mjs';
import {createOBS, defaultOBS} from '../../server/obs.mjs';

async function fixture(t) {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-obs-atomic-'));
    const store = openStore(directory), vault = openVault(directory);
    const prior = {...defaultOBS(), port: 4455};
    store.set('obs', prior);
    store.set('obs.space-categories-v3', true);
    const credential = vault.encrypt({password: 'previous-password'});
    store.set('obs.password', credential);
    const writes = [], changes = [];
    const observed = {...store, set(key, value) { writes.push(key); return store.set(key, value); }};
    let connections = 0;
    const obs = createOBS(observed, vault, {
        WebSocketClass: class { constructor() { connections++; throw new Error('A disabled connection must not open a socket'); } },
        onChange: value => changes.push(value),
    });
    t.after(async () => { await obs.close(); store.close(); await rm(directory, {recursive: true, force: true}); });
    return {store, vault, obs, prior, credential, writes, changes, get connections() { return connections; }};
}

function rejectConfigWrite(store) {
    // The first credential statement can succeed while SQLite rejects the
    // subsequent configuration statement. Exercise the real storage boundary.
    store.db.exec(`CREATE TEMP TRIGGER reject_obs_config BEFORE UPDATE ON settings
        WHEN NEW.key='obs' BEGIN SELECT RAISE(ABORT, 'OBS config write rejected'); END`);
}

for (const password of ['replacement-password', '']) test(`a failed OBS save keeps its prior encrypted credential when ${password ? 'replacing' : 'clearing'} the password`, async t => {
    const f = await fixture(t);
    rejectConfigWrite(f.store);
    await assert.rejects(f.obs.save({...f.prior, port: 4466, password}), /OBS config write rejected/);
    assert.deepEqual(f.store.get('obs'), f.prior, 'The failed configuration statement retains the saved port and rules');
    assert.equal(f.changes.length, 0, 'A rejected save cannot publish a connection update');
    assert.equal(f.connections, 0, 'Persistence failure must not start a replacement connection');
    assert.equal(f.store.get('obs.password'), f.credential, 'The rejected operation must retain the exact prior encrypted credential');
    assert.deepEqual(f.vault.decrypt(f.store.get('obs.password')), {password: 'previous-password'});
});

test('OBS save recovers after the rejected statement and commits the matching settings and encrypted password once', async t => {
    const f = await fixture(t);
    rejectConfigWrite(f.store);
    await assert.rejects(f.obs.save({...f.prior, port: 4466, password: 'replacement-password'}), /OBS config write rejected/);
    f.store.db.exec('DROP TRIGGER reject_obs_config');
    f.writes.length = 0;
    await f.obs.save({...f.prior, port: 4466, password: 'replacement-password'});
    assert.equal(f.store.get('obs').port, 4466);
    assert.deepEqual(f.vault.decrypt(f.store.get('obs.password')), {password: 'replacement-password'});
    assert.equal(f.obs.config().passwordSaved, true);
    assert.equal('password' in f.obs.config(), false);
    assert.deepEqual(f.writes, ['obs.password', 'obs']);
    assert.equal(f.changes.length, 1);
    assert.equal(f.connections, 0);
});

test('ordinary OBS config saves retain their credential and explicit clearing persists with the matching config', async t => {
    const f = await fixture(t);
    await f.obs.save({...f.prior, port: 4466});
    assert.equal(f.store.get('obs').port, 4466);
    assert.equal(f.store.get('obs.password'), f.credential);
    assert.deepEqual(f.writes, ['obs']);
    f.writes.length = 0;
    await f.obs.save({...f.prior, port: 4477, password: ''});
    assert.equal(f.store.get('obs').port, 4477);
    assert.equal(f.store.get('obs.password'), null);
    assert.equal(f.obs.config().passwordSaved, false);
    assert.deepEqual(f.writes, ['obs.password', 'obs']);
    assert.equal(f.changes.length, 2);
    assert.equal(f.connections, 0);
});
