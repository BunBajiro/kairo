import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createUniverseFeeds} from '../../server/universe-feeds.mjs';

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return {promise, resolve}; };
async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-feed-dispatch-')), store = openStore(dir), waiting = deferred(), calls = [];
    let time = Date.parse('2026-10-15T12:00:00Z'), resume;
    const original = globalThis.setTimeout;
    // Hold the actual courtesy delay after one accepted packet was persisted.
    // Network deadlines keep their real timer and no wall-clock sleep decides the race.
    t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
        if (delay !== 110) return original(callback, delay, ...args);
        resume = () => callback(...args); waiting.resolve(); return {unref() {}};
    });
    const feeds = createUniverseFeeds(store, {}, {atlas: {systems: [{system_id: 30000001, name: 'Alpha', space: 'known', security: -.1}], gates: []}, now: () => time, points: {items: [], metadata: {}}, fetcher: async url => {
        calls.push(url);
        const sequence = Number(String(url).match(/\/(\d+)\.json$/)?.[1]);
        return new Response(JSON.stringify(sequence === 1 ? {sequence_id: 1, killmail_id: 1, esi: {killmail_time: new Date(time - 1000).toISOString(), solar_system_id: 30000001, victim: {ship_type_id: 587}}, zkb: {totalValue: 1}} : {}), {status: sequence === 1 ? 200 : 404});
    }});
    store.set('universe:feeds:combat-cursor', {sequence: 1, updated: time}); feeds.saveConfig({combat_enabled: true});
    t.after(async () => { resume?.(); await feeds.close(); store.close(); await rm(dir, {recursive: true, force: true}); });
    return {store, feeds, calls, waiting, resume: () => resume(), advance: () => { time += 60000; }};
}

for (const stop of ['combat disabled', 'Universe disabled', 'service closed']) test('a paused public combat batch does not dispatch another packet after ' + stop, async t => {
    const f = await fixture(t), refresh = f.feeds.refresh('combat'); await f.waiting.promise;
    assert.equal(f.calls.length, 1); assert.equal(f.store.get('universe:feeds:combat-cursor').sequence, 2, 'The accepted first packet remains durable');
    let closing;
    if (stop === 'combat disabled') f.feeds.saveConfig({combat_enabled: false});
    else if (stop === 'Universe disabled') f.store.set('module:universe', false);
    else closing = f.feeds.close();
    f.resume(); await refresh; await closing;
    assert.equal(f.calls.length, 1, 'No request was in flight at disable/close; the unsent next packet must stay unsent');
    assert.equal(f.store.get('universe:feeds:combat-cursor').sequence, 2);
    if (stop !== 'service closed') {
        f.advance(); f.store.set('module:universe', true); f.feeds.saveConfig({combat_enabled: true}); await f.feeds.refresh('combat');
        assert.equal(f.calls.length, 2, 'Explicit re-enable retries the retained next sequence once'); assert.match(f.calls[1], /\/2\.json$/);
    }
});

test('an enabled public combat batch retains the courtesy pause and reads its next packet once', async t => {
    const f = await fixture(t), refresh = f.feeds.refresh('combat'); await f.waiting.promise;
    assert.equal(f.calls.length, 1); f.resume(); await refresh;
    assert.equal(f.calls.length, 2); assert.match(f.calls[1], /\/2\.json$/); assert.equal(f.store.get('universe:feeds:combat-cursor').sequence, 2);
    await f.feeds.refresh('combat'); assert.equal(f.calls.length, 2, 'Immediate explicit refresh still respects provider backoff');
});
