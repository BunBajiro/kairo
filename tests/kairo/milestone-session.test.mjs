import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createCore} from '../../server/core.mjs';
import {catalog} from '../../server/modules/catalog.mjs';
import {changeSession, sessionReport} from '../../server/history.mjs';
import {sessionReplay} from '../../server/session-replay.mjs';

const epoch = Date.parse('2026-10-01T12:00:00Z');
const at = ms => new Date(epoch + ms).toISOString();
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return {promise, resolve};
}
async function fixture(t, {key = 'skills', known = true, namesFail = false, stale = false} = {}) {
    t.mock.timers.enable({apis: ['Date'], now: epoch});
    const directory = await mkdtemp(join(tmpdir(), 'kairo-milestone-session-')), store = openStore(directory);
    const skills = level => ({total_sp: level * 1000, skills: [{skill_id: 3300, trained_skill_level: level}]}),
        jobs = status => [{job_id: 991, product_type_id: 587, runs: 2, status}],
        fresh = data => ({status: 'ready', data, updatedAt: at(0), expiresAt: at(600000), refreshAt: at(600000), headers: {}});
    for (const module of catalog) store.set('module:' + module.id, module.id === (key === 'skills' ? 'training' : 'industry'));
    if (known) store.set('names', {3300: 'Gunnery', 587: 'Rifter'});
    store.saveSnapshot(42, key, {...fresh(key === 'skills' ? skills(1) : jobs('active')), refreshAt: at(-1)});
    store.saveSnapshot(42, 'attributes', fresh({intelligence: 20}));
    const namesStarted = deferred(), names = deferred(), calls = {source: 0, names: 0};
    const core = await createCore(store, {characters: () => [{id: 42, scopes: [key === 'skills' ? 'esi-skills.read_skills.v1' : 'esi-industry.read_character_jobs.v1']}]}, {
        health: () => ({}),
        async request(path) {
            calls.source++;
            assert.equal(path, key === 'skills' ? '/characters/42/skills' : '/characters/42/industry/jobs?include_completed=true');
            return {...fresh(key === 'skills' ? skills(2) : jobs('ready')), stale,
                // Source cache dates are not local completion-observation times.
                updatedAt: '2030-01-01T00:00:00.000Z'};
        },
        async names(ids) {
            calls.names++;
            namesStarted.resolve(ids);
            await names.promise;
            if (namesFail) throw new Error('Names temporarily unavailable');
            return Object.fromEntries(ids.map(id => [id, id === 3300 ? 'Gunnery' : 'Rifter']));
        }
    }, resolve('server/modules'), {noSync: true});
    t.after(async () => { names.resolve(); await core.close().catch(() => {}); store.close(); await rm(directory, {recursive: true, force: true}); });
    return {store, core, names, namesStarted, calls, eventType: key === 'skills' ? 'skill.completed' : 'industry.ready'};
}

for (const [key, known] of [['skills', true], ['skills', false], ['jobs', false]]) {
    test(`real Core retains ${key} receipt ownership across deferred ${known ? 'milestone' : 'Core'} names`, {timeout: 5000}, async t => {
        const {store, core, names, namesStarted, calls, eventType} = await fixture(t, {key, known});
        const a = changeSession(store, core.publish, 42, {action: 'start', label: 'A'}).id;
        t.mock.timers.tick(1000);
        const work = core.sync(42); await namesStarted.promise;
        t.mock.timers.tick(1000);
        changeSession(store, core.publish, 42, {action: 'end'});
        const b = changeSession(store, core.publish, 42, {action: 'start', label: 'B'}).id;
        names.resolve(); await work; await core.bus.drain();
        const event = store.db.prepare('SELECT * FROM events WHERE type=?').get(eventType);
        assert.equal(event.at, at(1000), 'Display-name latency must not timestamp a completion in a later Session');
        assert.equal(JSON.parse(event.payload).session_id, a);
        assert.equal(sessionReport(store, a, 42).events.filter(e => e.type === eventType).length, 1);
        assert.equal(sessionReport(store, b, 42).events.filter(e => e.type === eventType).length, 0);
        assert.equal(sessionReplay(store, a, 42).events.filter(e => e.type === eventType).length, 1);
        assert.equal(sessionReplay(store, b, 42).events.filter(e => e.type === eventType).length, 0);
        assert.deepEqual(calls, {source: 1, names: key === 'skills' && !known ? 2 : 1}, 'Ownership does not add transport requests');
    });
}

test('a failed optional milestone name lookup does not permanently lose the completed level', {timeout: 5000}, async t => {
    const {store, core, names, namesStarted, calls} = await fixture(t, {namesFail: true});
    const a = changeSession(store, core.publish, 42, {action: 'start'}).id;
    t.mock.timers.tick(1000);
    const work = core.sync(42); await namesStarted.promise; names.resolve(); await work; await core.bus.drain();
    assert.equal(store.snapshot(42, 'skills').data.skills[0].trained_skill_level, 2, 'The fresh source snapshot has already advanced');
    const events = sessionReport(store, a, 42).events.filter(e => e.type === 'skill.completed');
    assert.equal(events.length, 1, 'Display metadata failure must not discard the only observed completion transition');
    assert.equal(events[0].payload.skill_name, 'Gunnery');
    assert.equal(core.bus.health().failures, 0);
    t.mock.timers.tick(700000); await core.sync(42); await core.bus.drain();
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='skill.completed'").get().n, 1);
    assert.deepEqual(calls, {source: 2, names: 1}, 'An unchanged level does not retry display metadata or publish a duplicate');
});

for (const key of ['skills', 'jobs']) for (const owner of ['active', 'none', 'deleted']) {
    test(`${key} keeps its ${owner} owner across a same-millisecond Session boundary`, {timeout: 5000}, async t => {
        const {store, core, names, namesStarted, eventType} = await fixture(t, {key, known: false});
        const a = owner === 'none' ? null : changeSession(store, core.publish, 42, {action: 'start', label: 'A'}).id;
        t.mock.timers.tick(1000);
        const work = core.sync(42); await namesStarted.promise;
        if (a) changeSession(store, core.publish, 42, {action: 'end'});
        if (owner === 'deleted') store.db.prepare('DELETE FROM sessions WHERE id=?').run(a);
        const b = changeSession(store, core.publish, 42, {action: 'start', label: 'B'}).id;
        names.resolve(); await work; await core.bus.drain();
        const event = store.db.prepare('SELECT * FROM events WHERE type=?').get(eventType);
        assert.equal(event.at, at(1000));
        assert.equal(JSON.parse(event.payload).session_id, a);
        for (const read of [sessionReport, sessionReplay]) {
            assert.equal(read(store, b, 42).events.filter(e => e.type === eventType).length, 0, 'A late event never transfers into the successor');
            if (owner === 'active') assert.equal(read(store, a, 42).events.filter(e => e.type === eventType).length, 1, 'An accepted completion at the end survives the captured event cursor');
        }
    });
}

for (const key of ['skills', 'jobs']) test(`stale ${key} responses do not publish fresh milestones`, {timeout: 5000}, async t => {
    const {store, core, names, eventType} = await fixture(t, {key, stale: true});
    const a = changeSession(store, core.publish, 42, {action: 'start'}).id;
    t.mock.timers.tick(1000); names.resolve(); await core.sync(42); await core.bus.drain();
    assert.equal(store.snapshot(42, key).status, 'stale');
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM events WHERE type=?').get(eventType).n, 0);
    assert.equal(sessionReport(store, a, 42).events.filter(e => e.type === eventType).length, 0);
});

test('historic skill and industry events without receipt ownership retain Session membership', async t => {
    const {store, core, names} = await fixture(t); names.resolve();
    const a = changeSession(store, core.publish, 42, {action: 'start'}).id;
    t.mock.timers.tick(1000);
    core.publish({characterId: 42, type: 'skill.completed', payload: {skill_id: 3300, level: 2}});
    core.publish({characterId: 42, type: 'industry.ready', payload: {job_id: 991}});
    t.mock.timers.tick(1000); changeSession(store, core.publish, 42, {action: 'end'});
    for (const read of [sessionReport, sessionReplay]) {
        const events = read(store, a, 42).events;
        assert.equal(events.filter(e => e.type === 'skill.completed').length, 1);
        assert.equal(events.filter(e => e.type === 'industry.ready').length, 1);
    }
});
