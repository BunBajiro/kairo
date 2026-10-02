import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {setImmediate as turn} from 'node:timers/promises';
import {createBus} from '../../server/bus.mjs';
import {createRegistry} from '../../server/registry.mjs';
import {createCore} from '../../server/core.mjs';
import {openStore} from '../../server/store.mjs';
import {catalog} from '../../server/modules/catalog.mjs';
import {startKairo} from '../../server/index.mjs';

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
}
async function fixture(t, {esi = {}, characters = [], prepare = () => {}, release = () => {}, modules = true} = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-lifecycle-')), store = openStore(directory);
    prepare(store);
    const core = await createCore(store, {characters: () => characters}, {health: () => ({}), ...esi}, modules ? resolve('server/modules') : directory, {noSync: true});
    t.after(async () => { release(); await core.close().catch(() => {}); store.close(); await rm(directory, {recursive: true, force: true}); });
    return {core, store};
}

test('bus keeps immediate delivery and drains awaited nested events to a fixed point', async () => {
    const bus = createBus(), parent = deferred(), child = deferred(), sequence = [];
    bus.on('parent', async () => { sequence.push('parent'); await parent.promise; bus.emit({type: 'child'}); });
    bus.on('child', async () => { sequence.push('child'); await child.promise; sequence.push('saved'); });
    assert.equal(bus.emit({type: 'parent'}), undefined);
    assert.deepEqual(sequence, ['parent']);
    let finished = false;
    const closing = bus.close(); closing.then(() => { finished = true; });
    assert.strictEqual(bus.close(), closing);
    parent.resolve(); await turn();
    assert.deepEqual(sequence, ['parent', 'child']); assert.equal(finished, false);
    child.resolve(); await closing;
    assert.deepEqual(sequence, ['parent', 'child', 'saved']); assert.equal(bus.health().pending, 0);
    assert.throws(() => bus.emit({type: 'parent'}), /closed/);
    assert.throws(() => bus.on('parent', () => {}), /closed/);
});

test('listener failures are visible, bounded and do not discard other listeners', async () => {
    const bus = createBus(); let delivered = 0;
    bus.on('sample', () => { throw new Error('sync failure'); });
    bus.on('sample', async () => { throw new Error('async failure'); });
    bus.on('sample', () => { delivered++; });
    for (let count = 0; count < 15; count++) bus.emit({type: 'sample', payload: {private: 'not retained'}});
    const health = await bus.drain();
    assert.equal(delivered, 15); assert.equal(health.failures, 30); assert.equal(health.recentErrors.length, 20);
    assert.ok(health.recentErrors.some(error => error.message === 'sync failure'));
    assert.ok(health.recentErrors.some(error => error.message === 'async failure'));
    assert.equal(JSON.stringify(health).includes('not retained'), false);
    health.recentErrors[0].message = 'changed';
    assert.notEqual(bus.health().recentErrors[0].message, 'changed');
    await bus.close();
});

test('Core keeps milestone subscribers until deferred names and nested writes finish', async t => {
    const names = deferred(), nested = deferred();
    const {core, store} = await fixture(t, {esi: {names: () => names.promise}, release: () => { names.resolve({3300: 'Gunnery'}); nested.resolve(); }});
    core.bus.on('skill.completed', async event => { await nested.promise; store.set('accepted-skill', event.payload.level); });
    core.bus.emit({type: 'data.skills', characterId: 42, payload: {previous: {skills: [{skill_id: 3300, trained_skill_level: 1}]}, current: {skills: [{skill_id: 3300, trained_skill_level: 2}]}}});
    let finished = false;
    const closing = core.close(); closing.then(() => { finished = true; });
    assert.strictEqual(core.close(), closing);
    await turn(); assert.equal(finished, false);
    names.resolve({3300: 'Gunnery'}); await turn();
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='skill.completed'").get().n, 1);
    assert.equal(finished, false);
    nested.resolve(); await closing;
    assert.equal(store.get('accepted-skill'), 2); assert.equal(core.health().events.failures, 0);
    assert.equal(core.health().events.pending, 0);
});

test('Core finishes accepted killmail enrichment before closing its Combat dependency', async t => {
    const response = deferred(), ref = {killmail_id: 991, killmail_hash: 'a'.repeat(40)};
    const killmail = {killmail_id: 991, killmail_time: new Date().toISOString(), solar_system_id: 30000142, victim: {character_id: 43, ship_type_id: 587}, attackers: [{character_id: 42, ship_type_id: 587}]};
    const {core, store} = await fixture(t, {
        characters: [{id: 42, scopes: ['esi-killmails.read_killmails.v1']}],
        prepare: store => { for (const module of catalog) store.set('module:' + module.id, module.id === 'combat'); },
        esi: {paged: () => response.promise, request: async () => ({data: killmail}), names: async ids => Object.fromEntries(ids.map(id => [id, 'Name ' + id]))},
        release: () => response.resolve({data: [ref], headers: {}, updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString()}),
    });
    let combatClosed = false;
    const closeCombat = core.combat.close;
    core.combat.close = async () => { combatClosed = true; await closeCombat(); };
    const work = core.sync(42), closing = core.close();
    await turn(); assert.equal(combatClosed, false);
    response.resolve({data: [ref], headers: {}, updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString()});
    await Promise.all([work, closing]);
    assert.equal(combatClosed, true);
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM combat_records WHERE character_id=42 AND killmail_id=991').get().n, 1);
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='killmail.kill'").get().n, 1);
});

test('a new listener failure during Core drain is reported after owned work settles', async t => {
    const gate = deferred();
    const {core} = await fixture(t, {modules: false, release: () => gate.resolve()});
    core.bus.on('accepted', async () => { await gate.promise; throw new Error('cannot save accepted event'); });
    core.bus.emit({type: 'accepted'});
    const closing = core.close(), rejected = assert.rejects(closing, error => error instanceof AggregateError && error.errors.some(cause => /Semantic event drain failed/.test(cause.message)));
    gate.resolve(); await rejected;
    assert.strictEqual(core.close(), closing);
    assert.equal(core.health().events.failures, 1); assert.equal(core.health().events.pending, 0);
    assert.equal(core.health().events.recentErrors[0].message, 'cannot save accepted event');
});

test('Registry owns asynchronous cleanup, unsubscribes once and reports cleanup failure', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-registry-close-')), store = openStore(directory), bus = createBus(), gate = deferred();
    await writeFile(join(directory, 'fixture.mjs'), `export default {id:'fixture',register(ctx){ctx.on('sample',()=>ctx.store.set('delivered',true));return async()=>{ctx.store.set('cleanup-count',ctx.store.get('cleanup-count',0)+1);await ctx.esi.names();throw new Error('cleanup failed');};}};`);
    const registry = await createRegistry(directory, {store, db: store.db, bus, esi: {names: () => gate.promise}, publish: event => bus.emit(event)});
    t.after(async () => { gate.resolve(); await registry.close().catch(() => {}); store.close(); await rm(directory, {recursive: true, force: true}); });
    const closing = registry.close(), rejected = assert.rejects(closing, error => error instanceof AggregateError && error.errors[0].message === 'cleanup failed');
    assert.strictEqual(registry.close(), closing);
    bus.emit({type: 'sample'}); assert.equal(store.get('delivered', false), false);
    assert.throws(() => registry.toggle('fixture', true), /closed/);
    gate.resolve(); await rejected;
    assert.equal(store.get('cleanup-count'), 1);
});

for (const disconnected of [false, true]) test(`HTTP quiescence retains an accepted ${disconnected ? 'disconnected' : 'connected'} write and closes storage last`, {timeout: 10000}, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-http-drain-')), type = deferred(), entered = deferred(), calls = [];
    const app = await startKairo({port: 19470, streamPort: 19471, dataDir: directory, noSync: true, fetcher: async url => {
        const path = new URL(url).pathname; calls.push(path);
        if (path === '/universe/types/34') { entered.resolve(); await type.promise; return Response.json({name: 'Tritanium', group_id: 18}); }
        if (path === '/universe/groups/18') return Response.json({category_id: 4});
        throw new Error('Unexpected network request: ' + path);
    }});
    t.after(async () => { type.resolve(); await app.close(); await rm(directory, {recursive: true, force: true}); });
    const page = await fetch(app.origin), cookie = page.headers.get('set-cookie').split(';')[0]; await page.text();
    const bootstrap = await (await fetch(app.origin + '/api/bootstrap', {headers: {cookie}})).json();
    const headers = {cookie, origin: app.origin, 'X-Kairo-CSRF': bootstrap.csrf, 'Content-Type': 'application/json'};
    let databaseClosed = false, coreClosed = false;
    const closeStore = app.store.close, closeCore = app.core.close;
    app.store.close = () => {
        assert.equal(app.store.db.prepare("SELECT COUNT(*) n FROM goals WHERE title='Accepted before shutdown'").get().n, 1);
        assert.equal(app.store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='goal.created'").get().n, 1);
        assert.equal(app.core.health().events.pending, 0); assert.equal(app.core.health().esi.active, 0);
        databaseClosed = true; closeStore();
    };
    app.core.close = () => { coreClosed = true; return closeCore(); };
    const controller = new AbortController();
    const write = fetch(app.origin + '/api/goals', {method: 'POST', headers, signal: controller.signal, body: JSON.stringify({title: 'Accepted before shutdown', typeId: 34, target: 10})});
    await entered.promise;
    if (disconnected) { controller.abort(); await assert.rejects(write, error => error.name === 'AbortError'); }
    const closing = app.close(); assert.strictEqual(app.close(), closing);
    const rejected = await fetch(app.origin + '/api/goals', {method: 'POST', headers, body: JSON.stringify({title: 'Too late'})});
    assert.equal(rejected.status, 503); await rejected.text();
    assert.equal(coreClosed, false); assert.equal(databaseClosed, false);
    type.resolve();
    if (!disconnected) { const result = await write; assert.equal(result.status, 201); await result.json(); }
    await closing;
    assert.deepEqual(calls, ['/universe/types/34', '/universe/groups/18']);
    assert.equal(coreClosed, true); assert.equal(databaseClosed, true);
    const reopened = openStore(directory);
    try { assert.equal(reopened.db.prepare("SELECT COUNT(*) n FROM goals WHERE title='Accepted before shutdown'").get().n, 1); }
    finally { reopened.close(); }
});
