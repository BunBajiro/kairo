import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, chmod, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const storeURL = new URL('../../server/store.mjs', import.meta.url).href;
const lockURL = new URL('../../server/runtime-lock.mjs', import.meta.url).href;
// An isolated process supplies the ordinary 022 umask without changing the test
// runner or concurrent suites. The fixture parent is deliberately traversable.
async function fixture(t) {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-store-permissions-'));
    await chmod(directory, 0o755);
    t.after(() => rm(directory, {recursive: true, force: true}));
    return {directory, dataDir: join(directory, 'data')};
}
function run(dataDir, body) {
    const script = `import assert from 'node:assert/strict';
        import fs from 'node:fs';
        import {statSync,chmodSync} from 'node:fs';
        import {syncBuiltinESMExports} from 'node:module';
        import {join,dirname} from 'node:path';
        import {openStore} from ${JSON.stringify(storeURL)};
        import {acquireRuntimeLock} from ${JSON.stringify(lockURL)};
        const dataDir=${JSON.stringify(dataDir)}, originalMask=process.umask(0o022);
        const mode=path=>statSync(path).mode&0o777;
        try {${body}} finally {process.umask(originalMask);}`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr || result.error?.message || 'Child failed');
}
const posix = {skip: process.platform === 'win32' ? 'POSIX mode contract; Windows ACL/DPAPI requires native checks.' : false};

test('the launcher creates a private data root before opening its lease and database', posix, async t => {
    const {dataDir} = await fixture(t);
    run(dataDir, `const lease=acquireRuntimeLock(dataDir); let store;
        try {
            assert.equal(mode(dataDir),0o700,'New launcher data root must be private');
            assert.equal(mode(dirname(dataDir)),0o755,'Do not change an existing parent');
            store=openStore(dataDir); store.set('private-note','synthetic private data');
            for(const name of ['kairo.sqlite','kairo.sqlite-wal','kairo.sqlite-shm'])
                assert.equal(mode(join(dataDir,name)),0o600,name+' must be private');
        } finally {store?.close();lease.close();}`);
});

test('a fresh store in an existing shared-readable directory never creates readable WAL sidecars', posix, async t => {
    const {dataDir} = await fixture(t);
    await mkdir(dataDir, {mode: 0o755});
    run(dataDir, `const store=openStore(dataDir);
        try {
            store.set('private-note','synthetic private data');
            assert.equal(mode(dataDir),0o755,'Do not chmod an existing configured directory');
            for(const name of ['kairo.sqlite','kairo.sqlite-wal','kairo.sqlite-shm'])
                assert.equal(mode(join(dataDir,name)),0o600,name+' must be private');
        } finally {store.close();}`);
});

test('startup restricts old database and crash-retained sidecars while preserving committed records', posix, async t => {
    const {dataDir} = await fixture(t);
    await mkdir(dataDir, {mode: 0o755});
    // Simulate a pre-correction installation stopping without SQLite close. Its
    // committed private record remains in the WAL and must survive recovery.
    run(dataDir, `const store=openStore(dataDir);store.set('retained-note','keep this record');
        for(const name of ['kairo.sqlite','kairo.sqlite-wal','kairo.sqlite-shm']) chmodSync(join(dataDir,name),0o644);
        process.exit(0);`);
    run(dataDir, `for(const name of ['kairo.sqlite','kairo.sqlite-wal','kairo.sqlite-shm'])
            assert.equal(mode(join(dataDir,name)),0o644,'Fixture must retain old permissions');
        const lease=acquireRuntimeLock(dataDir);let store;
        try {
            store=openStore(dataDir);assert.equal(store.get('retained-note'),'keep this record');
            assert.equal(mode(dataDir),0o755,'Leave the existing configured directory alone');
            for(const name of ['kairo.sqlite','kairo.sqlite-wal','kairo.sqlite-shm'])
                assert.equal(mode(join(dataDir,name)),0o600,name+' must be repaired');
            assert.equal(store.db.prepare('PRAGMA quick_check').get().quick_check,'ok');
            store.close();store=openStore(dataDir);
            assert.equal(store.get('retained-note'),'keep this record','Repeated startup preserves the recovered record');
            for(const name of ['kairo.sqlite','kairo.sqlite-wal','kairo.sqlite-shm'])
                assert.equal(mode(join(dataDir,name)),0o600,name+' remains private after restart');
        } finally {store?.close();lease.close();}`);
});

for (const operation of ['fchmodSync', 'chmodSync']) test(`startup fails closed when ${operation} cannot restrict a private file`, posix, async t => {
    const {dataDir} = await fixture(t);
    run(dataDir, `let store=openStore(dataDir);store.set('retained-note','keep this record');store.close();
        const database=join(dataDir,'kairo.sqlite'),before=fs.readFileSync(database);
        const operation=${JSON.stringify(operation)},original=fs[operation],fault=Object.assign(new Error('Injected private-file permission failure'),{code:'EPERM'});
        let descriptor;
        fs[operation]=(...args)=>{if(operation==='fchmodSync')descriptor=args[0];throw fault;};
        syncBuiltinESMExports();
        try {
            assert.throws(()=>openStore(dataDir),error=>error===fault,'Do not accept startup with unrestricted private files');
        } finally {fs[operation]=original;syncBuiltinESMExports();}
        if(descriptor!==undefined)assert.throws(()=>fs.fstatSync(descriptor),error=>error.code==='EBADF','Failed construction must close its descriptor');
        assert.deepEqual(fs.readFileSync(database),before,'Permission failure must not begin SQLite mutation');
        store=openStore(dataDir);
        try {assert.equal(store.get('retained-note'),'keep this record','Retry retains prior data');}finally{store.close();}`);
});
