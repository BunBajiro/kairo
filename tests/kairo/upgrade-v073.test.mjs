import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {startKairo} from '../../server/index.mjs';
import {openStore} from '../../server/store.mjs';
import {openVault} from '../../server/vault.mjs';
import {sessionReport} from '../../server/history.mjs';
import {createCacheRetention} from '../../server/cache-retention.mjs';

const provenance = JSON.parse(await readFile(new URL('./fixtures/v073-upgrade-provenance.json', import.meta.url)));
const sql = await readFile(new URL('./fixtures/v073-upgrade.sql', import.meta.url), 'utf8');
assert.equal(createHash('sha256').update(sql).digest('hex'), provenance.sqlSha256, 'Pinned old-runtime fixture must match provenance');
const durable = ['characters', 'goals', 'goal_tracking', 'goal_progress_entries', 'notes', 'sessions', 'events',
    'journey_hidden_links', 'place_notes', 'combat_records', 'alliance_combat_records', 'market_import_plans',
    'market_history_days', 'market_history_archives', 'market_orders', 'snapshots'];
const records = db => Object.fromEntries(durable.map(table => [table, db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()]));
const visits = db => db.prepare('SELECT id,character_id,system_id,name,ship_type_id,at FROM visits ORDER BY id').all();
const privateSettings = db => db.prepare("SELECT * FROM settings WHERE key IN ('clientId','theme','module:comms','market:imports:60008494','stream','obs','obs.password') ORDER BY key").all();

async function fixture(t) {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-upgrade-into-v080-'));
    t.after(() => rm(directory, {recursive: true, force: true}));
    const db = new DatabaseSync(join(directory, 'kairo.sqlite'));
    let expected;
    try {
        db.exec(sql);
        expected = {records: records(db), visits: visits(db), settings: privateSettings(db), migrations: db.prepare('SELECT * FROM migrations ORDER BY id').all()};
        assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {db.close();}
    // Preserve the actual old AES envelopes. On Windows wrap only this public
    // synthetic key for the test account; this is not foreign DPAPI restoration.
    let key = provenance.syntheticVaultKeyBase64;
    if (process.platform === 'win32') {
        const script = 'Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))';
        const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {input: key, encoding: 'utf8', windowsHide: true, timeout: 10000});
        assert.equal(result.status, 0, 'Cannot wrap synthetic fixture key for this Windows account');
        key = result.stdout.trim();
    }
    await writeFile(join(directory, process.platform === 'win32' ? 'vault.dpapi' : 'vault.key'), key, {mode: 0o600});
    return {directory, expected};
}
async function freePort() {
    const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function start(directory) {
    const port = await freePort(); let streamPort = await freePort(); while (streamPort === port) streamPort = await freePort();
    const calls = [];
    const app = await startKairo({dataDir: directory, port, streamPort, noSync: true,
        fetcher: async url => {calls.push(String(url)); throw new Error('Offline upgrade must not call providers');}});
    return {app, calls};
}
function retained(store, expected) {
    assert.deepEqual(records(store.db), expected.records, 'Upgrade preserves the old durable rows and credential envelopes');
    assert.deepEqual(visits(store.db), expected.visits, 'Legacy travel identities and observations survive');
    assert.deepEqual(privateSettings(store.db), expected.settings, 'Saved settings, disabled module, Stream and OBS copy survive');
    for (const migration of expected.migrations) assert.deepEqual(store.db.prepare('SELECT * FROM migrations WHERE id=?').get(migration.id), migration, 'Do not rerun an already completed old migration');
    assert.equal(store.db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
    assert.deepEqual(store.db.prepare('PRAGMA foreign_key_check').all(), []);
}

test('real previous-release 0.7.3 data upgrades into current runtime, retains owners and survives repeated startup and bounded retention', async t => {
    const {directory, expected} = await fixture(t);
    for (let attempt = 0; attempt < 2; attempt++) {
        const {app, calls} = await start(directory);
        try {
            retained(app.store, expected);
            assert.deepEqual(app.store.db.prepare('SELECT character_id,system_id FROM discovered_systems ORDER BY system_id').all().map(row => ({...row})),
                [{character_id: 42, system_id: 30000142}, {character_id: 42, system_id: 30002187}]);
            assert.ok(app.store.db.prepare('SELECT session_id,sovereignty_at_visit FROM visits').all().every(row => row.session_id === null && row.sovereignty_at_visit === null));
            assert.equal(await app.auth.access(42), 'synthetic-v073-access');
            assert.deepEqual(openVault(directory).decrypt(app.store.get('obs.password')), {password: 'synthetic-v073-obs'});
            const session = expected.records.sessions[0];
            const report = sessionReport(app.store, session.id, 42);
            assert.equal(report.session.label, session.label); assert.equal(report.session.notes, session.notes);
            assert.equal(report.durationSeconds, 3600);
            assert.equal(app.core.markets.imports.getPlan(60008494, 'upgrade-plan').lines[0].quantity, 10);
            assert.equal(app.core.moduleList().find(module => module.id === 'comms').enabled, false);
            assert.equal(calls.length, 0);
        } finally {await app.close();}
    }
    const store = openStore(directory);
    try {
        const policy = store.get('retention:transport:v080'); let at = policy.introduced + 3600001;
        const retention = createCacheRetention(store, {now: () => at});
        assert.equal(retention.maintain().deleted, 0, 'Old provider entries receive the installation grace period');
        assert.equal(store.db.prepare("SELECT COUNT(*) n FROM cache WHERE key='42:GET:/fixture/obsolete'").get().n, 1);
        at = policy.introduced + 91 * 86400000;
        const maintenance = retention.maintain();
        assert.ok(maintenance.scanned <= 200); assert.equal(maintenance.deleted, 1);
        retained(store, expected);
    } finally {store.close();}
});

test('a failed 0.8.0 migration on the real 0.7.3 checkpoint rolls back its own schema/marker and recovers without resetting records', async t => {
    const {directory, expected} = await fixture(t);
    let db = new DatabaseSync(join(directory, 'kairo.sqlite'));
    db.exec("CREATE TRIGGER reject_session_travel_marker BEFORE INSERT ON migrations WHEN NEW.id='session-travel-v080' BEGIN SELECT RAISE(ABORT,'Injected upgrade marker failure'); END");
    db.close();
    assert.throws(() => openStore(directory), /Injected upgrade marker failure/);
    db = new DatabaseSync(join(directory, 'kairo.sqlite'));
    try {
        assert.deepEqual(records(db), expected.records); assert.deepEqual(visits(db), expected.visits);
        assert.equal(db.prepare("SELECT 1 FROM migrations WHERE id='session-travel-v080'").get(), undefined);
        assert.equal(db.prepare("SELECT 1 FROM sqlite_schema WHERE name='discovered_systems'").get(), undefined);
        assert.equal(db.prepare('PRAGMA table_info(visits)').all().some(row => row.name === 'session_id'), false);
        db.exec('BEGIN IMMEDIATE;ROLLBACK;DROP TRIGGER reject_session_travel_marker');
    } finally {db.close();}
    const {app} = await start(directory);
    try {
        retained(app.store, expected);
        assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM discovered_systems').get().n, 2);
        assert.equal(app.store.db.prepare("SELECT COUNT(*) n FROM migrations WHERE id='session-travel-v080'").get().n, 1);
    } finally {await app.close();}
});
