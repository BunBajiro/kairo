import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from '../../server/store.mjs';
import {createCore} from '../../server/core.mjs';
import {createESI} from '../../server/esi.mjs';
import {catalog} from '../../server/modules/catalog.mjs';

test('Core mail collection resolves displayed senders once while retaining known senders and raw headers', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-mail-names-')), store = openStore(dir), calls = [];
    for (const module of catalog) store.set('module:' + module.id, module.id === 'comms');
    store.set('names', {90000002: 'Known sender'});
    const mail = [{mail_id: 1, from: 90000001, subject: 'First'}, {mail_id: 2, from: 90000001, subject: 'Second'},
        {mail_id: 3, from: 90000002, subject: 'Known'}];
    const auth = {characters: () => [{id: 42, scopes: ['esi-mail.read_mail.v1']}], access: async () => 'token'};
    const esi = createESI(store, auth, {fetcher: async (url, options) => {
        const path = new URL(url).pathname; calls.push({path, body: options.body && JSON.parse(options.body)});
        return Response.json(path === '/universe/names' ? [{id: 90000001, name: 'Resolved sender', category: 'character'}] : mail,
            {headers: {'Cache-Control': 'max-age=600'}});
    }});
    const core = await createCore(store, auth, esi, dir, {noSync: true}); core.quiesce();
    t.after(async () => {await core.close(); await esi.close(); store.close(); await rm(dir, {recursive: true, force: true});});
    await core.resolveNames({from: 90000003});
    assert.deepEqual(calls, [], 'A numeric from field outside the mail dataset is not treated as a sender ID');
    await core.sync(42);
    const sample = core.snapshots(42).mail;
    assert.equal(sample.status, 'ready'); assert.deepEqual(sample.data, mail);
    assert.equal(core.names()[90000002], 'Known sender');
    assert.deepEqual(sample.data.map(row => core.names()[row.from] || String(row.from)), ['Resolved sender', 'Resolved sender', 'Known sender']);
    assert.deepEqual(calls.filter(call => call.path === '/universe/names'), [{path: '/universe/names', body: [90000001]}]);
    await core.requestSync(42); await core.sync(42);
    assert.equal(calls.length, 2, 'One mail source transport and one deduplicated missing-sender batch; no repeated transport');
});

test('mail remains ready when public sender lookup fails and a later collection recovers without refetching headers', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-mail-name-recovery-')), store = openStore(dir), calls = [];
    let now = Date.now(), failNames = true;
    t.mock.method(Date, 'now', () => now);
    for (const module of catalog) store.set('module:' + module.id, module.id === 'comms');
    const mail = [{mail_id: 1, from: 90000001, subject: 'Retained header'}];
    const auth = {characters: () => [{id: 42, scopes: ['esi-mail.read_mail.v1']}], access: async () => 'token'};
    const esi = createESI(store, auth, {fetcher: async url => {
        const path = new URL(url).pathname; calls.push(path);
        if (path === '/universe/names' && failNames) return Response.json({error: 'Temporary name service failure'}, {status: 503});
        return Response.json(path === '/universe/names' ? [{id: 90000001, name: 'Recovered sender', category: 'character'}] : mail,
            {headers: {'Cache-Control': 'max-age=600'}});
    }});
    const core = await createCore(store, auth, esi, dir, {noSync: true}); core.quiesce();
    t.after(async () => {await core.close(); await esi.close(); store.close(); await rm(dir, {recursive: true, force: true});});
    await core.sync(42);
    assert.equal(core.snapshots(42).mail.status, 'ready'); assert.deepEqual(core.snapshots(42).mail.data, mail);
    assert.equal(core.names()[90000001], undefined); assert.equal(calls.length, 2);
    await core.requestSync(42); assert.equal(calls.length, 2, 'The name-service retry deadline prevents an immediate repeated transport');
    failNames = false; now += 60000; await core.requestSync(42);
    assert.equal(core.names()[90000001], 'Recovered sender'); assert.deepEqual(core.snapshots(42).mail.data, mail);
    assert.equal(calls.filter(path => path === '/characters/42/mail').length, 1);
    assert.equal(calls.filter(path => path === '/universe/names').length, 2);
});
