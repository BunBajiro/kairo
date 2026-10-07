import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdministrativeRefresh, createOBSControlRefresh, marketRefreshPeriod} from '../../components/kairo/administrative-refresh.mjs';
import {createGoalResourceReads} from '../../components/kairo/goal-resource-reads.mjs';

const flush = async () => {for (let i = 0; i < 12; i++) await Promise.resolve();};
const deferred = () => {let resolve, reject;const promise = new Promise((yes, no) => {resolve = yes; reject = no;});return {promise, resolve, reject};};

test('default administrative timers keep the Window receiver when scheduling, rearming and closing', async t => {
    const calls = [];let callback, id = 0, reads = 0;
    t.mock.method(globalThis, 'setTimeout', function (run, ms) {calls.push(['set', this === globalThis, ms]);callback = run;return ++id;});
    t.mock.method(globalThis, 'clearTimeout', function (timer) {calls.push(['clear', this === globalThis, timer]);});
    const owner = createAdministrativeRefresh({read: async () => ++reads, publish() {}, period: () => 2000});
    await owner.request();await flush();
    callback();await flush();
    owner.close();
    assert.equal(reads, 2);
    assert.deepEqual(calls, [['set', true, 2000], ['set', true, 2000], ['clear', true, 2]]);
});

function clock() {
    let now = 0, id = 0; const jobs = new Map();
    return {setTimeout(run, delay) {jobs.set(++id, {at: now + delay, run}); return id;}, clearTimeout(id) {jobs.delete(id);},
        async advance(ms) {const until = now + ms;for (;;) {const next = [...jobs].sort((a, b) => a[1].at - b[1].at)[0];if (!next || next[1].at > until) break;now = next[1].at;jobs.delete(next[0]);next[1].run();await flush();}now = until;await flush();},
        get pending() {return jobs.size;}};
}

test('Markets uses one completed-read timer: 5 idle reads per visible 120s, none while hidden, immediate resume', async () => {
    const timers = clock();let visible = true, reads = 0;
    const owner = createAdministrativeRefresh({read: async () => {reads++;return {job: null};}, publish() {}, visible: () => visible, timers, period: marketRefreshPeriod});
    await owner.request();await timers.advance(120000);assert.equal(reads, 5);
    visible = false;owner.visibilityChanged();await timers.advance(120000);assert.equal(reads, 5);assert.equal(timers.pending, 0);
    visible = true;owner.visibilityChanged();await flush();assert.equal(reads, 6);
    owner.close();await timers.advance(120000);assert.equal(reads, 6);assert.equal(timers.pending, 0);
});

test('Markets running jobs refresh at 2s then return to idle on complete, cancelled or failed', async () => {
    for (const terminal of ['complete', 'cancelled', 'failed']) {
        const timers = clock();let reads = 0;
        const owner = createAdministrativeRefresh({read: async () => ({job: {status: ++reads < 3 ? 'running' : terminal}}), publish() {}, timers, period: marketRefreshPeriod});
        await owner.request();await timers.advance(4000);assert.equal(reads, 3);
        await timers.advance(29999);assert.equal(reads, 3);await timers.advance(1);assert.equal(reads, 4);owner.close();
    }
});

test('slow administrative reads never overlap and retain only one newer forced invalidation', async () => {
    const timers = clock(), first = deferred(), second = deferred();let calls = 0, active = 0, max = 0;const values = [];
    const owner = createAdministrativeRefresh({read: () => {calls++;active++;max = Math.max(max, active);return (calls === 1 ? first : second).promise.finally(() => active--);}, publish: value => values.push(value), timers});
    const pending = owner.request();await timers.advance(120000);assert.equal(calls, 1);assert.equal(timers.pending, 0);
    for (let i = 0; i < 20; i++) void owner.request({force: true});
    first.resolve('old book');await flush();assert.equal(calls, 2);second.resolve('current book');await pending;await flush();
    assert.equal(max, 1);assert.deepEqual(values, ['old book', 'current book']);assert.equal(timers.pending, 1);owner.close();
});

test('failed administrative read retains old view and recovers; disposal rejects late publication', async () => {
    const timers = clock(), pending = deferred();let reads = 0;const values = [], errors = [];
    const owner = createAdministrativeRefresh({read: async () => {reads++;if (reads === 2) throw new Error('offline');return reads === 4 ? pending.promise : reads;}, publish: value => values.push(value), onError: error => errors.push(error.message), timers});
    await owner.request();await timers.advance(30000);assert.deepEqual(values, [1]);assert.deepEqual(errors, ['offline']);
    await timers.advance(30000);assert.deepEqual(values, [1, 3]);void owner.request();owner.close();pending.resolve(4);await flush();assert.deepEqual(values, [1, 3]);assert.equal(timers.pending, 0);
});

test('OBS stream status wins over a delayed recovery read and dirty configuration survives recovery', async () => {
    const timers = clock(), pending = [];const configs = [], statuses = [];
    const owner = createOBSControlRefresh({read: () => {const d = deferred();pending.push(d);return d.promise;}, publishConfig: value => configs.push(value), publishStatus: value => statuses.push(value), timers});
    let reading = owner.request();owner.stream('new status');pending[0].resolve({config: 'saved config', status: 'old status'});await reading;
    assert.deepEqual(configs, ['saved config']);assert.deepEqual(statuses, ['new status']);
    reading = owner.request();owner.edited();pending[1].resolve({config: 'stale config', status: 'recovered status'});await reading;
    assert.deepEqual(configs, ['saved config']);assert.deepEqual(statuses, ['new status', 'recovered status']);owner.close();
});

test('OBS saving preserves edits made during PUT and a newer stream status; clean save permits future config recovery', async () => {
    const configs = [], statuses = [], timers = clock();
    const owner = createOBSControlRefresh({read: async () => ({config: 'recovered', status: 'current'}), publishConfig: value => configs.push(value), publishStatus: value => statuses.push(value), timers});
    owner.edited();const old = owner.snapshot();owner.edited();owner.stream('stream');
    assert.equal(owner.saved({config: 'old save', status: 'old status'}, old), false);await owner.request();assert.deepEqual(configs, []);
    const current = owner.snapshot();assert.equal(owner.saved({config: 'saved', status: 'saved status'}, current), true);await owner.request();
    assert.deepEqual(configs, ['saved', 'recovered']);assert.ok(!statuses.includes('old status'));owner.close();
});

test('OBS full reads are initial/reconnect only; idle/focus use status and hidden reconnect waits without losing dirty config', async () => {
    const timers = clock(), configs = [], statuses = [];let full = 0, status = 0, visible = true;
    const owner = createOBSControlRefresh({read: async () => ({config: ++full, status: 'full'}), readStatus: async () => {status++;return 'status';},
        publishConfig: value => configs.push(value), publishStatus: value => statuses.push(value), visible: () => visible, timers});
    await owner.request();await timers.advance(120000);assert.equal(full, 1);assert.equal(status, 4);
    owner.visibilityChanged();await flush();assert.equal(full, 1);assert.equal(status, 5);
    owner.edited();visible = false;owner.visibilityChanged();void owner.reconnect();await timers.advance(120000);
    assert.equal(full, 1);assert.equal(status, 5);
    visible = true;owner.visibilityChanged();await flush();assert.equal(full, 2);assert.deepEqual(configs, [1]);
    assert.equal(statuses.at(-1), 'full');owner.close();
});

test('OBS failed initial config read retries config rather than getting stuck on status-only reads', async () => {
    const timers = clock(), configs = [];let full = 0, status = 0;
    const owner = createOBSControlRefresh({read: async () => {if (++full === 1) throw new Error('offline');return {config: 'recovered', status: 'ok'};}, readStatus: async () => ++status,
        publishConfig: value => configs.push(value), publishStatus() {}, onError() {}, timers});
    await owner.request();await timers.advance(30000);assert.equal(full, 2);assert.equal(status, 0);assert.deepEqual(configs, ['recovered']);owner.close();
});

test('Goals eight source updates read eight progress resources and no additional notes or hidden metadata', async () => {
    const calls = [];let dialog = false;
    const owner = createGoalResourceReads({character: 42, read: async path => {calls.push(path);return path;}, publishGoals() {}, publishNotes() {}, publishSources() {}, metadataVisible: () => dialog});
    owner.initial();await flush();assert.equal(calls.length, 3);
    for (let i = 0; i < 8; i++) await owner.progress();
    assert.equal(calls.filter(path => path === '/goals?character=42').length, 9);
    assert.equal(calls.filter(path => path.startsWith('/notes')).length, 1);
    assert.equal(calls.filter(path => path.startsWith('/goals/sources')).length, 1);
    dialog = true;await owner.metadata();assert.equal(calls.filter(path => path.startsWith('/goals/sources')).length, 2);
    await owner.progress();assert.equal(calls.filter(path => path.startsWith('/goals/sources')).length, 3);
    await owner.notes();assert.equal(calls.filter(path => path.startsWith('/notes')).length, 2);owner.close();
});

test('Goals note/source events are pilot scoped, hidden invalidations resume, and old pilot reads cannot publish', async () => {
    let visible = true, dialog = false;const calls = [], published = [], pending = deferred();
    const old = createGoalResourceReads({character: 1, read: () => pending.promise, publishGoals: value => published.push(value), publishNotes() {}, publishSources() {}});
    old.initial();old.close();
    const owner = createGoalResourceReads({character: 2, visible: () => visible, metadataVisible: () => dialog,
        read: async path => {calls.push(path);return path;}, publishGoals: value => published.push(value), publishNotes() {}, publishSources() {}});
    owner.initial();await flush();owner.changed({characterId: 1, resources: ['notes', 'goals', 'goalSources']});await flush();assert.equal(calls.length, 3);
    visible = false;owner.changed({characterId: 2, resources: ['notes', 'goalSources']});await flush();assert.equal(calls.length, 3);
    visible = true;owner.resume();await flush();assert.equal(calls.length, 4);
    dialog = true;owner.resume();await flush();assert.equal(calls.length, 5);
    pending.resolve('OLD PILOT');await flush();assert.deepEqual(published, ['/goals?character=2']);owner.close();
});
