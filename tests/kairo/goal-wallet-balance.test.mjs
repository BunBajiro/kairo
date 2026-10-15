import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from '../../server/store.mjs';
import {createGoals, listGoals} from '../../server/goals.mjs';

async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-wallet-goal-')), store = openStore(dir), events = [];
    t.after(async () => { store.close(); await rm(dir, {recursive: true, force: true}); });
    const auth = {characters: () => [{id: 42, scopes: ['esi-wallet.read_character_wallet.v1']}]};
    const service = createGoals(store, auth, event => events.push(event));
    const sample = (data, status = 'ready') => store.saveSnapshot(42, 'wallet', {data, status,
        updatedAt: new Date().toISOString(), refreshAt: new Date(Date.now() + 60000).toISOString()});
    sample(250);
    const {id} = service.create(42, {title: 'Hull fund', source: 'wallet.balance', target: 1000});
    const goal = () => listGoals(store, auth, 42).find(goal => goal.id === id);
    return {store, service, sample, goal, events};
}

test('fresh negative wallet balance removes unmet goal progress and a later balance recovers normally', async t => {
    const f = await fixture(t);
    assert.equal(f.goal().progress, 250);
    f.sample(-100); f.service.refresh(42, 'wallet');
    assert.equal(f.goal().progress, 0, 'A current balance below zero has no progress toward a positive balance target');
    assert.equal(f.goal().tracking.status, 'ready'); assert.equal(f.goal().done, 0);
    const writes = f.store.db.prepare('SELECT total_changes() n').get().n;
    assert.equal(f.service.refresh(42, 'wallet'), 0);
    assert.equal(f.store.db.prepare('SELECT total_changes() n').get().n, writes, 'Repeated below-zero samples remain write-free');
    f.sample(0); assert.equal(f.service.refresh(42, 'wallet'), 0);
    f.sample(400); f.service.refresh(42, 'wallet'); assert.equal(f.goal().progress, 400);
    f.sample(1200); f.service.refresh(42, 'wallet'); assert.equal(f.goal().progress, 1000); assert.equal(f.goal().done, 1);
    f.sample(-200); f.service.refresh(42, 'wallet'); assert.equal(f.goal().progress, 1000);
    assert.equal(f.events.filter(event => event.type === 'goal.completed').length, 1);
});

test('stale and invalid wallet samples retain prior progress until a fresh finite balance arrives', async t => {
    const f = await fixture(t);
    f.sample(-100, 'stale'); f.service.refresh(42, 'wallet');
    assert.equal(f.goal().progress, 250); assert.equal(f.goal().tracking.status, 'stale');
    f.sample('0'); f.service.refresh(42, 'wallet');
    assert.equal(f.goal().progress, 250); assert.equal(f.goal().tracking.status, 'error');
    f.sample(0); f.service.refresh(42, 'wallet');
    assert.equal(f.goal().progress, 0); assert.equal(f.goal().tracking.status, 'ready');
    assert.equal(f.events.filter(event => event.type === 'goal.completed').length, 0);
});
