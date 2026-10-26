import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, cp, rename, rm, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, basename} from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {openStore} from '../../server/store.mjs';
import {openVault} from '../../server/vault.mjs';
import {createAuth} from '../../server/auth.mjs';
import {acquireRuntimeLock} from '../../server/runtime-lock.mjs';
import {prepareDatasetRuntime, commitDatasetRuntime} from '../../server/datasets.mjs';

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'kairo-persistence-recovery-'));
    t.after(() => rm(root, {recursive: true, force: true}));
    return {root, dataDir: join(root, 'data'), backup: join(root, 'backup')};
}
// A small valid managed generation exercises the real selection/commit owners;
// it is not a live CCP archive, nor a complete replacement Universe index.
async function installGeneration(dataDir) {
    const bundled = await Promise.all(['universe-provenance.json', 'market-categories.json', 'npc-market-owners.json']
        .map(name => readFile(new URL('../../server/data/' + name, import.meta.url), 'utf8').then(JSON.parse)));
    const build = Math.max(...bundled.map(row => row.build)) + 1;
    const directory = join(dataDir, 'datasets', `build-${build}-${randomUUID()}`);
    await mkdir(directory, {recursive: true});
    const bodies = {
        'universe.json.gz': gzipSync(JSON.stringify({metadata: {build}})),
        'universe-provenance.json': Buffer.from(JSON.stringify({build})),
        'market-categories.json': Buffer.from(JSON.stringify({build, groups: [], volumes: {}})),
        'npc-market-owners.json': Buffer.from(JSON.stringify({build, corporations: []})),
        'universe-details-000.bin': gzipSync('{}'),
    };
    const files = [];
    for (const [name, body] of Object.entries(bodies)) {
        await writeFile(join(directory, name), body);
        files.push({name, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex')});
    }
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({schema: 1, build, files}));
    await writeFile(join(dataDir, 'datasets', 'pending.json'), JSON.stringify({schema: 1, directory: basename(directory), build}));
    const selected = await prepareDatasetRuntime(dataDir);
    assert.equal(selected.pending, true);
    await commitDatasetRuntime(dataDir, selected);
    return {build, directory: basename(directory), files};
}
function storedRecords(store) {
    return Object.fromEntries(['settings', 'characters', 'goals', 'notes', 'sessions', 'visits', 'snapshots', 'market_import_plans', 'migrations']
        .map(table => [table, store.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}

test('a complete stopped-directory backup restores records, credentials and the managed dataset across repeated same-version startup', async t => {
    const {root, dataDir, backup} = await fixture(t);
    let lease = acquireRuntimeLock(dataDir), store;
    let expected, generation;
    try {
        store = openStore(dataDir);
        const vault = openVault(dataDir);
        store.set('clientId', 'recovery-fixture-client');
        store.set('obs.password', vault.encrypt({password: 'synthetic-obs-secret'}));
        store.db.prepare('INSERT INTO characters(id,name,scopes,tokens,owner) VALUES(?,?,?,?,?)').run(
            42, 'Recovery pilot', '[]', vault.encrypt({access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires: Date.now() + 3600000}), 'fixture-owner');
        store.db.prepare('INSERT INTO notes VALUES(?,?,?,?)').run('note', 42, 'Private note — preserved', '2026-01-01T00:00:00.000Z');
        store.db.prepare('INSERT INTO goals VALUES(?,?,?,?,?,?,?,?)').run('goal', 42, 'Saved goal', 10, 3, 'manual', 0, '2026-01-01T00:00:00.000Z');
        store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,notes) VALUES(?,?,?,?,?,?)').run('session', 42, 'Saved session', '2026-01-01T00:00:00.000Z', '2026-01-01T01:00:00.000Z', 'Session note');
        store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)').run(42, 30000142, 'Jita', '2026-01-01T00:30:00.000Z', 'session');
        store.db.prepare('INSERT INTO market_import_plans VALUES(?,?,?,?)').run('plan', 60003760, '2026-01-01T00:00:00.000Z', JSON.stringify({id: 'plan', items: [{typeId: 34, quantity: 10}]}));
        store.saveSnapshot(42, 'wallet', {status: 'ready', data: 12345, updatedAt: '2026-01-01T00:00:00.000Z'});
        generation = await installGeneration(dataDir);
        expected = storedRecords(store);
    } finally {store?.close(); lease.close();}
    // Mirror the documented procedure: stop, copy everything, keep the current
    // installation separately, restore the complete unit, then reopen it.
    await cp(dataDir, backup, {recursive: true});
    store = openStore(dataDir);
    try {store.db.exec("UPDATE notes SET body='Later unwanted edit'");} finally {store.close();}
    await rename(dataDir, join(root, 'preserved-current'));
    await cp(backup, dataDir, {recursive: true});
    for (let attempt = 0; attempt < 2; attempt++) {
        lease = acquireRuntimeLock(dataDir); store = undefined;
        try {
            const selected = await prepareDatasetRuntime(dataDir);
            assert.equal(selected.pending, false);
            assert.equal(selected.manifest.build, generation.build);
            assert.equal(basename(selected.directory), generation.directory);
            for (const file of generation.files) assert.equal(createHash('sha256').update(await readFile(join(selected.directory, file.name))).digest('hex'), file.sha256);
            store = openStore(dataDir);
            assert.deepEqual(storedRecords(store), expected, 'All seeded records and migration markers survive intact');
            assert.equal(store.db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
            const vault = openVault(dataDir);
            const auth = createAuth(store, vault, {origin: 'http://127.0.0.1:4380', fetcher: async () => {throw new Error('Recovery must not contact SSO');}});
            assert.equal(await auth.access(42), 'synthetic-access');
            assert.deepEqual(vault.decrypt(store.get('obs.password')), {password: 'synthetic-obs-secret'});
        } finally {store?.close();lease.close();}
    }
    const preserved = openStore(join(root, 'preserved-current'));
    try {assert.equal(preserved.db.prepare('SELECT body FROM notes').get().body, 'Later unwanted edit');} finally {preserved.close();}
});

for (const omission of ['missing', 'wrong']) test(`a ${omission} vault cannot decrypt copied credentials or silently replace the encrypted record`, async t => {
    const {dataDir, backup} = await fixture(t);
    let store = openStore(dataDir);
    const envelope = openVault(dataDir).encrypt({password: 'synthetic-private-password'});
    store.set('obs.password', envelope); store.close();
    await cp(dataDir, backup, {recursive: true});
    const keyName = process.platform === 'win32' ? 'vault.dpapi' : 'vault.key';
    await rm(join(backup, keyName));
    if (omission === 'wrong') openVault(backup);
    store = openStore(backup);
    try {
        // Missing key files create a new key; they do not recover the old secret.
        // This proves the documented limitation, not portable DPAPI recovery.
        const vault = openVault(backup);
        assert.throws(() => vault.decrypt(store.get('obs.password')));
        assert.equal(store.get('obs.password'), envelope);
    } finally {store.close();}
});
