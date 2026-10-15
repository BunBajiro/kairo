import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {EventEmitter} from 'node:events';
import {openStore} from '../../server/store.mjs';
import {createCore} from '../../server/core.mjs';
import {defaultStream} from '../../server/stream.mjs';
import {bindingProjections} from '../../server/projections.mjs';
import {catalog} from '../../server/modules/catalog.mjs';

async function fixture(t) {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-hidden-bindings-')), store = openStore(directory), now = Date.now();
    const sample = data => ({status: 'ready', data, updatedAt: new Date(now - 1000).toISOString(), refreshAt: new Date(now + 60000).toISOString()});
    for (const module of catalog) store.set('module:' + module.id, ['pilot', 'wallet', 'training'].includes(module.id));
    store.set('names', {100: 'Original hull', 101: 'Original skill'});
    store.saveSnapshot(42, 'wallet', sample(10)); store.saveSnapshot(43, 'wallet', sample(20));
    store.saveSnapshot(43, 'ship', sample({ship_type_id: 100}));
    store.saveSnapshot(42, 'queue', sample([{skill_id: 101, queue_position: 0, finished_level: 4, start_date: new Date(now - 1000).toISOString(), finish_date: new Date(now + 30000).toISOString()}]));
    const elements = [
        {id: 'wallet', kind: 'text', visible: false, binding: 'wallet.balance', characterId: 42},
        {id: 'ship', kind: 'text', visible: false, binding: 'pilot.ship', characterId: 43},
        {id: 'queue', kind: 'text', visible: false, binding: 'training.remaining', characterId: 42},
    ];
    store.set('stream', {...defaultStream(), elements});
    const reads = {snapshots: [], names: 0, roster: 0}, pilots = [{id: 42, scopes: []}, {id: 43, scopes: []}];
    const auth = {characters: () => { reads.roster++; return pilots; }};
    const observed = {...store, get(key, fallback) { if (key === 'names') reads.names++; return store.get(key, fallback); }, snapshot(id, key) { reads.snapshots.push([id, key]); return store.snapshot(id, key); }};
    const core = await createCore(observed, auth, {health: () => ({}), names: async () => ({}), request: async () => assert.fail('No ESI transport permitted')}, directory, {noSync: true});
    core.quiesce();
    t.after(async () => { await core.close(); store.close(); await rm(directory, {recursive: true, force: true}); });
    const reset = () => { reads.snapshots.length = 0; reads.names = reads.roster = 0; };
    reset(); return {core, store, auth, pilots, sample, reads, reset};
}
function consumer() {
    const client = new EventEmitter(); client.frames = [];
    client.write = chunk => { client.frames.push(chunk); return true; };
    client.end = () => { client.writableEnded = true; client.emit('finish'); };
    client.destroy = () => { client.destroyed = true; client.emit('close'); };
    return client;
}

test('Core skips source reads for hidden saved bindings without retaining them in broadcast output', async t => {
    const f = await fixture(t), version = f.core.stream.state().version;
    for (let count = 0; count < 3; count++) f.core.updateBindings();
    assert.deepEqual(f.reads, {snapshots: [], names: 0, roster: 0});
    assert.deepEqual(f.core.stream.state().elements, []); assert.equal(f.core.stream.state().version, version);
});

test('hidden preview and show/save project fresh values, names, exact expiry and pilot ownership', async t => {
    const f = await fixture(t), config = f.core.stream.config();
    f.store.saveSnapshot(42, 'wallet', {...f.sample(99), refreshAt: new Date(Date.now()).toISOString()});
    assert.equal(bindingProjections(f.store, f.auth, config.elements).wallet.bindingStatus, 'unavailable');
    f.store.saveSnapshot(42, 'wallet', f.sample(99)); f.core.rememberNames({100: 'Current hull'});
    let preview = bindingProjections(f.store, f.auth, config.elements);
    assert.equal(preview.wallet.text, '99 ISK'); assert.equal(preview.ship.text, 'Current hull');
    const other = f.pilots.pop(); assert.equal(bindingProjections(f.store, f.auth, config.elements).ship.bindingStatus, 'unavailable'); f.pilots.push(other);
    config.elements.forEach(element => { element.visible = true; });
    f.core.stream.save(config, bindingProjections(f.store, f.auth, config.elements));
    assert.equal(f.core.stream.state().elements.find(element => element.id === 'wallet').text, '99 ISK');
    assert.equal(f.core.stream.state().elements.find(element => element.id === 'ship').text, 'Current hull');
    assert.ok(f.core.stream.state().elements.every(element => !('characterId' in element) && !('binding' in element)));
});

test('visible bindings stay fresh with no clients and OPSEC publication remains independent', async t => {
    const f = await fixture(t), config = f.core.stream.config(); config.elements[0].visible = true;
    f.core.stream.save(config, bindingProjections(f.store, f.auth, config.elements));
    assert.equal(f.core.stream.clients.size, 0); f.store.saveSnapshot(42, 'wallet', f.sample(765)); f.reset(); f.core.updateBindings();
    assert.deepEqual(f.reads.snapshots, [[42, 'wallet']]); assert.equal(f.reads.names, 0);
    const client = consumer(); f.core.stream.connect(client);
    const state = JSON.parse(Buffer.concat(client.frames).toString().split('data: ')[1]);
    assert.equal(state.elements[0].text, '765 ISK'); f.core.stream.setOPSEC({state: 'blue', hidden: false}); client.frames = [];
    f.core.stream.setOPSEC({state: 'unknown', hidden: true});
    assert.ok(client.frames.length > 0); assert.equal(f.core.stream.state().opsec.hidden, true);
});
