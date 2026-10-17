/**
 * Generate synthetic stopped 0.7.3 data for testing upgrade into current Kairo.
 * Usage: node tests/kairo/fixtures/generate-v073-upgrade.mjs <archived-old-root>
 * Archive exactly commit 239794774320fcdebaa1d76ce8a77c5c25cfc48c first; see the
 * generated provenance JSON. Normal tests consume SQL and need no old source/git.
 */
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const sourceCommit = '239794774320fcdebaa1d76ce8a77c5c25cfc48c';
const oldRoot = resolve(process.argv[2] || 'missing-old-source');
const output = dirname(fileURLToPath(import.meta.url));
const digest = body => createHash('sha256').update(body).digest('hex');
const sourceFiles = ['package.json', 'server/index.mjs', 'server/store.mjs', 'server/core.mjs', 'server/vault.mjs'];
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, digest(await readFile(join(oldRoot, path)))])));
assert.deepEqual(sourceHashes, {
    'package.json': '14e8d3058277022cce02ebbbc8c469dc701842dc6b8d94d6a573a2f67851e095',
    'server/index.mjs': 'f67fb7f23754463c8e41bfefd0a69e0222a483252cd8baf981a95acd4d17eb27',
    'server/store.mjs': '040a0b27b723cb14180c537504bbdbed7f1ddb6411dccf37bead34cda58277cd',
    'server/core.mjs': '41c77e5225c0c86236493900565129fb2c41e73c6054d758fe76aa5ee0453c5f',
    'server/vault.mjs': '067e72034722717409da2b65a6b85b398bad5508dd39c56ca83715b23722d82c',
}, 'Use the pinned previous-release source, not a locally modified Store/runtime');
assert.equal(JSON.parse(await readFile(join(oldRoot, 'package.json'))).version, '0.7.3');
const oldImport = path => import(pathToFileURL(join(oldRoot, path)).href);
const {startKairo} = await oldImport('server/index.mjs');
const {openVault} = await oldImport('server/vault.mjs');
const {changeSession} = await oldImport('server/history.mjs');
const {savePlaceNote, setJourneyConnection} = await oldImport('server/places.mjs');
async function freePort() {
    const listener = createServer();
    await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
    const port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    return port;
}
const dataDir = await mkdtemp(join(tmpdir(), 'kairo-old-upgrade-source-'));
let app;
try {
    // Public synthetic fixture key. Never use a user vault or real credential.
    assert.notEqual(process.platform, 'win32', 'Generate this pinned source fixture on POSIX; runtime tests wrap its synthetic key for the current platform.');
    const key = Buffer.alloc(32, 0x51).toString('base64');
    await writeFile(join(dataDir, 'vault.key'), key, {mode: 0o600});
    const port = await freePort(); let streamPort = await freePort(); while (streamPort === port) streamPort = await freePort();
    const providerCalls = [];
    app = await startKairo({dataDir, port, streamPort, noSync: true,
        fetcher: async url => {providerCalls.push(String(url)); throw new Error('Fixture generation must not contact a provider');}});
    const {store, core} = app, db = store.db, vault = openVault(dataDir);
    const at = '2026-01-01T00:00:00.000Z';
    const token = vault.encrypt({access_token: 'synthetic-v073-access', refresh_token: 'synthetic-v073-refresh', expires: Date.parse('2099-01-01T00:00:00.000Z')});
    db.prepare('INSERT INTO characters(id,name,scopes,tokens,owner) VALUES(?,?,?,?,?)').run(42, 'Synthetic upgrade pilot', '["esi-wallet.read_character_wallet.v1"]', token, 'synthetic-owner');
    store.set('clientId', 'synthetic-v073-client'); store.set('theme', 'amber');
    store.set('module:comms', false);
    store.set('market:imports:60008494', {budget: 12345678, characterId: 42});
    store.saveSnapshot(42, 'wallet', {status: 'ready', data: 12345, updatedAt: at, expiresAt: '2099-01-01T00:00:00.000Z'});
    const goal = core.goals.create(42, {title: 'Keep this manual goal', target: 10, source: 'manual'});
    db.prepare('UPDATE goals SET progress=3 WHERE id=?').run(goal.id);
    const tracked = core.goals.create(42, {title: 'Keep tracked accounting', target: 100, source: 'wallet.income'});
    db.prepare('INSERT INTO goal_progress_entries VALUES(?,?,?,?)').run(tracked.id, 'fixture-credit', 20, 20);
    db.prepare('INSERT INTO notes VALUES(?,?,?,?)').run('upgrade-note', 42, 'Keep this private note — 0.7.3', at);
    const session = changeSession(store, core.publish, 42, {action: 'start', label: 'Saved earlier flight'});
    changeSession(store, core.publish, 42, {action: 'end'});
    db.prepare('UPDATE sessions SET started=?,ended=?,notes=? WHERE id=?').run(at, '2026-01-01T01:00:00.000Z', 'Keep session notes', session.id);
    db.prepare('INSERT INTO visits(id,character_id,system_id,name,ship_type_id,at) VALUES(?,?,?,?,?,?)').run(101, 42, 30000142, 'Jita', 587, at);
    db.prepare('INSERT INTO visits(id,character_id,system_id,name,ship_type_id,at) VALUES(?,?,?,?,?,?)').run(102, 42, 30002187, 'Amarr', 587, '2026-01-01T00:30:00.000Z');
    setJourneyConnection(store, 42, 102, true);
    savePlaceNote(store, 'system', 30000142, {name: 'Jita', body: 'Keep place annotation', status: 'home', tags: ['fixture']});
    const killmail = {killmail_id: 777001, killmail_time: at, solar_system_id: 30000142,
        victim: {character_id: 43, ship_type_id: 587, damage_taken: 100},
        attackers: [{character_id: 42, alliance_id: 99000001, damage_done: 100, final_blow: true}], zkb: {totalValue: 1000}};
    store.saveSnapshot(42, 'killmails', {status: 'ready', data: [killmail], updatedAt: at});
    await core.combat.ingest(42, []);
    db.prepare('INSERT INTO alliance_combat_records VALUES(?,?,?,?,?)').run(99000001, 777002, 30000142, at, JSON.stringify({...killmail, killmail_id: 777002}));
    db.prepare('INSERT INTO market_import_plans VALUES(?,?,?,?)').run('upgrade-plan', 60008494, at, JSON.stringify({id: 'upgrade-plan', name: 'Keep saved import', hubId: 60008494, lines: [{typeId: 34, quantity: 10, price: 5}], totals: {upfront: 50, net: 10}}));
    db.prepare('INSERT INTO market_history_days VALUES(?,?,?,?,?,?,?,?,?)').run(10000002, 34, '2020-01-01', 5, 6, 4, 1000, 10, at);
    db.prepare('INSERT INTO market_history_archives VALUES(?,?,?,?)').run('2020-01-01', 1, 1, at);
    db.prepare('INSERT INTO market_orders VALUES(?,?,?,?,?,?,?,?,?,?)').run(60003760, 777003, 34, 0, 5, 10, 1, 'region', at, 90);
    const layout = core.stream.config(); layout.rules[0].message = 'Keep stream copy'; core.stream.save(layout);
    await core.obs.save({...core.obs.config(), enabled: false, password: 'synthetic-v073-obs'});
    db.prepare('INSERT INTO cache VALUES(?,?,?,?,?,?)').run('42:GET:/fixture/obsolete', '{"synthetic":"expired-provider-cache"}', null, 1, 1, '{}');
    await app.close(); app = undefined;
    assert.equal(providerCalls.length, 0, 'The old runtime fixture must remain fully offline');

    // Export schema from the actual stopped old database, not a reconstructed
    // interpretation of its migrations. SQLite internal statistics are excluded.
    const stopped = new DatabaseSync(join(dataDir, 'kairo.sqlite'));
    try {
        assert.equal(stopped.prepare('PRAGMA quick_check').get().quick_check, 'ok');
        const quoteId = value => '"' + value.replaceAll('"', '""') + '"';
        const schema = stopped.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
        const lines = [`-- Synthetic data generated by real Kairo 0.7.3 at ${sourceCommit}.`, '-- Test upgrade INTO current Kairo; all credentials and identities below are synthetic.', 'PRAGMA foreign_keys=OFF;', 'BEGIN;'];
        for (const row of schema.filter(row => row.type === 'table')) lines.push(row.sql + ';');
        const tableCounts = {};
        for (const {name} of schema.filter(row => row.type === 'table')) {
            const columns = stopped.prepare('PRAGMA table_info(' + quoteId(name) + ')').all().map(row => row.name);
            const values = stopped.prepare('SELECT ' + columns.map(column => 'quote(' + quoteId(column) + ') AS ' + quoteId(column)).join(',') + ' FROM ' + quoteId(name) + ' ORDER BY rowid').all();
            tableCounts[name] = values.length;
            for (const row of values) lines.push('INSERT INTO ' + quoteId(name) + '(' + columns.map(quoteId).join(',') + ') VALUES(' + columns.map(column => row[column]).join(',') + ');');
        }
        for (const row of schema.filter(row => row.type !== 'table')) lines.push(row.sql + ';');
        lines.push('COMMIT;', 'PRAGMA foreign_keys=ON;', '');
        const sql = lines.join('\n');
        await writeFile(join(output, 'v073-upgrade.sql'), sql);
        await writeFile(join(output, 'v073-upgrade-provenance.json'), JSON.stringify({
            purpose: 'Synthetic previous-release checkpoint for upgrade INTO current 0.8.0; not an audit or modification of 0.7.3.',
            sourceCommit, sourceTree: 'e665ca3810f0ab3f0336643f30a2369be5cc73b1', sourceVersion: '0.7.3',
            generatedBy: 'generate-v073-upgrade.mjs', generatedAt: new Date().toISOString(), node: process.version, providerCalls: providerCalls.length,
            archiveCommand: `git archive ${sourceCommit} server public package.json | tar -x -C <archived-old-root>`,
            sourceHashes, sqlSha256: digest(sql), syntheticVaultKeyBase64: key, tableCounts,
            exclusions: ['SQLite internal statistics', 'Real identities, grants or credentials', 'Live provider data', 'Other historical versions'],
        }, null, 2) + '\n');
        console.log(JSON.stringify({tables: Object.keys(tableCounts).length, rows: Object.values(tableCounts).reduce((a, b) => a + b, 0), bytes: Buffer.byteLength(sql)}));
    } finally {stopped.close();}
} finally {await app?.close(); await rm(dataDir, {recursive: true, force: true});}
