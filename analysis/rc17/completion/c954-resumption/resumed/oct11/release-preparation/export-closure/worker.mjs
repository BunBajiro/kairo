// Semantic acceptance only: real RC16 stopped directory -> final -> two reopens.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile, cp} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:net';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sourceAt, filesBelow, sha, BASELINE, CANDIDATE} from '../../first-binding-acceptance/common.mjs';

const [baselineRoot, baselineManifest, candidateRoot, candidateManifest, outputArg] = process.argv.slice(2);
assert.ok(baselineRoot && baselineManifest && candidateRoot && candidateManifest && outputArg);
assert.equal(process.env.KAIRO_EXPORT_LOCKED, '1', 'Use the reviewed outer lifecycle owner');
assert.equal(process.execArgv.length, 0);
const out = resolve(outputArg), oldDir = join(out, 'rc16-original'), newDir = join(out, 'candidate-upgrade');
const sources = [await sourceAt(baselineRoot, baselineManifest), await sourceAt(candidateRoot, candidateManifest)];
assert.equal(sources[0].binding.commit, BASELINE); assert.equal(sources[1].binding.commit, CANDIDATE);
const nativeFetch = globalThis.fetch, AT = '2026-01-02T03:04:05.000Z', FUTURE = '2099-01-01T00:00:00.000Z';
const SECRET = 'SYNTHETIC-EXPORT-MUST-NOT-CONTAIN-TOKEN';
let app, seedingStore, startupBegan = false, startupReturned = false, failure, externalAttempts = 0;
const deny = async () => { externalAttempts++; throw Error('External transport forbidden in export acceptance'); };
globalThis.fetch = deny;
const report = {schemaVersion: 1, suite: 'export-stopped-reopen-acceptance', complete: false,
  syntheticOnly: true, source: sources.map(value => value.binding), observations: [], controls: [],
  scope: 'Actual authenticated HTTP export; actual RC16 schema upgrade; complete decoded export and exact retained SQL rows; two clean final reopens',
  limitations: ['No timings or additional optimization decision', 'Synthetic pre-upgrade directory, not an installed user database',
    'No unsupported export/import round trip', 'noSync disables provider polling; no external EVE/OBS integration claim']};
const evidencePins = {};
async function writeEvidence(name, value) {
  const bytes = Buffer.from(value);
  await writeFile(join(out, name), bytes, {flag: 'wx'});
  assert.deepEqual(await readFile(join(out, name)), bytes, 'Evidence differs from completed write: ' + name);
  evidencePins[name] = {bytes: bytes.length, sha256: sha(bytes)};
}
const save = (name, value) => writeEvidence(name, JSON.stringify(value, null, 2) + '\n');
const plain = value => JSON.parse(JSON.stringify(value));
const rows = (db, query, ...args) => plain(db.prepare(query).all(...args));
const TABLES = ['characters', 'events', 'goals', 'notes', 'visits', 'sessions', 'place_notes',
  'journey_hidden_links', 'goal_tracking', 'goal_progress_entries', 'combat_records', 'alliance_combat_records',
  'market_hubs', 'market_import_plans', 'market_jobs', 'market_types', 'cache', 'snapshots', 'module_data',
  'universe_records', 'universe_operations_records', 'universe_politics_history', 'settings', 'migrations'];
const CONFIG = {version: 1, revision: 1, updated_at: AT, inference_enabled: false, blocs: [], independent_alliance_ids: [99001]};
const INFERENCE = {id: 'fixture-inference', generated_at: AT, expires_at: FUTURE, groups: [], unresolved: [], coverage: {fixture: true}};
const NAV = {itinerary: {map_id: null, revision: 7, originId: 30000142, kind: 'gate',
  stops: [{id: 'fixture-stop', systemId: 30002187}], preferences: {mode: 'shortest', ansiblexRules: 'live'},
  rangeLy: 7, followLocation: false, progress: {completedStopIds: [], lastSystemId: null}, updatedAt: AT}, plan: null, exportStatus: null};
let streamConfig, jumpPresets;
function insert(db, table, value) {
  const keys = Object.keys(value);
  db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map(key => value[key]));
}
async function seed() {
  await mkdir(oldDir);
  process.env.KAIRO_DATA_DIR = oldDir;
  process.env.KAIRO_SDE_DIRECTORY = join(baselineRoot, 'server/data');
  const moduleAt = file => import(pathToFileURL(join(baselineRoot, file)).href);
  const [{openStore}, {openVault}, {sanitizeConfig}, routing] = await Promise.all([
    moduleAt('server/store.mjs'), moduleAt('server/vault.mjs'), moduleAt('server/stream.mjs'), moduleAt('server/universe-routing.mjs')]);
  jumpPresets = plain(routing.JUMP_SHIP_PRESETS);
  seedingStore = openStore(oldDir);
  const {db} = seedingStore, vault = openVault(oldDir);
  for (const [id, name] of [[42, 'Synthetic Alpha'], [43, 'Synthetic Beta']])
    insert(db, 'characters', {id, name, scopes: '[]', tokens: vault.encrypt({access_token: SECRET, refresh_token: SECRET, expires: Date.parse(FUTURE)}), owner: SECRET, reauth: 0});
  streamConfig = plain(sanitizeConfig({elements: [{id: 'fixture-text', kind: 'text', text: 'Preserved synthetic overlay', visible: true, characterId: 42}], rules: []}));
  seedingStore.set('stream', streamConfig);
  seedingStore.set('universe:politics:config', CONFIG); seedingStore.set('universe:politics:snapshot', INFERENCE);
  for (const id of [0, 42, 43]) seedingStore.set('universe:navigation:' + id, NAV);
  seedingStore.set('market:quick', [34, 35]);
  seedingStore.set('market:imports:fixture', {hubId: 60003760, typeIds: [34, 35], label: 'Retained import preferences'});
  seedingStore.set('session:combat:fixture-ended', {status: 'retry', retryAt: Date.parse(FUTURE), records: [90001]});
  for (const [id, pilot, ended] of [['fixture-ended', 42, '2026-01-02T04:04:05.000Z'], ['fixture-open', 43, null]])
    insert(db, 'sessions', {id, character_id: pilot, label: id, started: AT, ended, start_context: JSON.stringify({systemId: 30000142, nested: {retained: true}}), end_context: JSON.stringify({wallet: 123.5}), notes: 'Session notes retained \nwith newline'});
  for (const [id, pilot, system, at] of [[101, 42, 30000142, AT], [102, 42, 30002187, AT], [103, 42, 30000142, '2026-01-02T03:04:06.000Z'], [104, 43, 30000142, AT]])
    insert(db, 'visits', {id, character_id: pilot, system_id: system, name: system === 30000142 ? 'Jita' : 'Amarr', ship_type_id: 587, at, sovereignty_at_visit: JSON.stringify({alliance_id: 99001, name: 'Synthetic sovereignty', observed_at: AT})});
  insert(db, 'journey_hidden_links', {character_id: 42, from_visit_id: 101, to_visit_id: 102, hidden_at: AT});
  insert(db, 'events', {id: 201, character_id: 42, type: 'session.started', module: 'session', summary: 'Synthetic retained event', payload: JSON.stringify({sessionId: 'fixture-ended', nested: [1, 'two']}), at: AT, dedupe: 'fixture-event'});
  insert(db, 'goals', {id: 'fixture-goal', character_id: 42, title: 'Retained goal', target: 100.5, progress: 12.25, kind: 'counter', done: 0, created: AT});
  insert(db, 'goal_tracking', {goal_id: 'fixture-goal', source: 'wallet', type_id: null, state: JSON.stringify({baseline: 4.25}), status: 'waiting', detail: 'Fixture tracking', updated_at: AT, completed_at: null});
  insert(db, 'goal_progress_entries', {goal_id: 'fixture-goal', entry_key: 'entry-a', observed: 20.5, credited: 12.25});
  insert(db, 'notes', {id: 'fixture-note', character_id: 43, body: 'Unicode note: λ 🚀\nSecond line', created: AT});
  insert(db, 'place_notes', {kind: 'system', entity_id: 30000142, name: 'Jita', body: 'Retained place note', tags: '["fixture","trade"]', status: 'visited', updated: AT});
  const combat = {killmail_id: 90001, killmail_time: AT, solar_system_id: 30000142, victim: {character_id: 43, alliance_id: 99002}, attackers: [{character_id: 42, alliance_id: 99001}]};
  insert(db, 'combat_records', {character_id: 42, killmail_id: 90001, result: 'kill', at: AT, body: JSON.stringify(combat), source: 'synthetic'});
  insert(db, 'alliance_combat_records', {alliance_id: 99001, killmail_id: 90001, system_id: 30000142, at: AT, body: JSON.stringify(combat)});
  insert(db, 'market_import_plans', {id: 'fixture-plan', hub_id: 60003760, updated: AT, body: JSON.stringify({id: 'fixture-plan', name: 'Retained plan', lines: [{typeId: 34, quantity: 3}], nested: {retained: true}})});
  for (const [id, status] of [['fixture-queued', 'queued'], ['fixture-complete', 'complete']])
    insert(db, 'market_jobs', {id, body: JSON.stringify({id, status, hubId: 60003760, endedAt: status === 'complete' ? AT : null, progress: {pages: 2}})});
  for (const [type_id, name] of [[34, 'Tritanium'], [35, 'Pyerite']]) insert(db, 'market_types', {type_id, name, group_name: 'Mineral', volume: .01});
  insert(db, 'cache', {key: '42:GET:/characters/42/assets/', body: '[{"item_id":991}]', etag: 'fixture-etag', expires: 1, updated: 1, headers: '{}'});
  insert(db, 'cache', {key: 'esi-retry:42:GET:/characters/42/assets/', body: '{"status":503}', etag: null, expires: Date.parse(FUTURE), updated: 1, headers: '{}'});
  seedingStore.saveSnapshot(42, 'wallet', {status: 'error', data: 12.25, retryAt: FUTURE, updatedAt: AT, expiresAt: AT, error: 'Synthetic retry evidence'});
  insert(db, 'module_data', {module: 'fixture', key: 'durable', value: '{"preserved":true}'});
  assert.equal(db.prepare("SELECT count(*) n FROM migrations WHERE id='session-travel-v080'").get().n, 0);
  assert.equal(rows(db, 'PRAGMA table_info(visits)').some(row => row.name === 'session_id'), false);
  seedingStore.close(); seedingStore = null;
}
async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
  return port;
}
async function start(root, directory) {
  process.env.KAIRO_DATA_DIR = directory; process.env.KAIRO_SDE_DIRECTORY = join(root, 'server/data');
  const {startKairo} = await import(pathToFileURL(join(root, 'server/index.mjs')).href);
  const port = await freePort(); let streamPort = await freePort(); while (streamPort === port) streamPort = await freePort();
  startupBegan = true; startupReturned = false;
  const startAt = Date.now();
  app = await startKairo({port, streamPort, dataDir: directory, noSync: true, fetcher: deny, combatFetcher: deny,
    sessionFeedFetcher: deny, markets: {historyFetcher: deny}, universe: {feeds: {fetcher: deny}}, datasets: {fetcher: deny}, deferDatasetStart: true});
  startupReturned = true;
  return {startAt, readyAt: Date.now()}; // Bounds validate migration metadata only; no performance measurements.
}
async function stop() { await app.close(); app = null; startupBegan = false; startupReturned = false; }
function seedUniverse() {
  const db = app.store.db;
  for (const id of [42, 43]) insert(db, 'universe_records', {character_id: id, kind: 'pin', id: 'fixture-pin-' + id,
    body: JSON.stringify({id: 'fixture-pin-' + id, system_id: 30000142, label: 'Retained pilot pin ' + id, notes: 'Private fixture', updated_at: AT}), updated_at: AT});
  insert(db, 'universe_operations_records', {character_id: 42, kind: 'signature', id: 'fixture-signature',
    body: JSON.stringify({id: 'fixture-signature', system_id: 30000142, signature_id: 'ABC-123', name: 'Retained signature', updated_at: AT}), updated_at: AT});
  insert(db, 'universe_politics_history', {id: 'fixture-history', kind: 'config', at: AT, body: JSON.stringify(CONFIG)});
}
function sqlSnapshot(db) {
  return Object.fromEntries(TABLES.map(table => [table, {columns: rows(db, `PRAGMA table_info(${table})`).map(row => row.name), rows: rows(db, `SELECT * FROM ${table} ORDER BY rowid`)}]));
}
async function stoppedSnapshot(directory, name) {
  assert.equal(app, null, 'Read stopped SQLite only after actual lifecycle close resolves');
  const db = new DatabaseSync(join(directory, 'kairo.sqlite'), {readOnly: true});
  try { const value = sqlSnapshot(db); assert.deepEqual(rows(db, 'PRAGMA integrity_check'), [{integrity_check: 'ok'}]); await save(name, value); return value; }
  finally { db.close(); }
}
function expectedExport(db, version) {
  const result = {version, universe: {version: 2,
    records: rows(db, 'SELECT character_id,kind,id,body FROM universe_records ORDER BY character_id,kind,id').map(({body, ...row}) => ({...row, data: JSON.parse(body)})),
    operations: rows(db, 'SELECT character_id,kind,id,body FROM universe_operations_records ORDER BY character_id,kind,id').map(({body, ...row}) => ({...row, data: JSON.parse(body)})),
    navigation: [42, 43, 0].map(id => ({character_id: id, ...NAV, characterId: id, jumpPresets,
      capabilities: Object.fromEntries([['waypoints', ['esi-ui.write_waypoint.v1']], ['bridgeSearch', ['esi-search.search_structures.v1', 'esi-universe.read_structures.v1']]].map(([key, scopes]) => [key, {available: false, scopes, missingScopes: scopes, reason: id ? 'Additional EVE scopes are required.' : 'Connect a pilot.'}]))})),
    politics: {config: CONFIG, inference: INFERENCE, history: rows(db, 'SELECT kind,at,body FROM universe_politics_history ORDER BY at').map(({body, ...row}) => ({...row, data: JSON.parse(body)}))},
    operationalSettings: rows(db, "SELECT key,value FROM settings WHERE key LIKE 'universe:%' OR key LIKE 'universe-navigation:%'").map(row => ({key: row.key, value: JSON.parse(row.value)}))},
    marketImportPlans: rows(db, 'SELECT body FROM market_import_plans ORDER BY updated').map(row => JSON.parse(row.body)),
    marketImportSettings: rows(db, "SELECT key,value FROM settings WHERE key LIKE 'market:imports:%'").map(row => ({key: row.key, value: JSON.parse(row.value)})),
    marketQuickSupplies: [34, 35], characters: [{id: 42, name: 'Synthetic Alpha'}, {id: 43, name: 'Synthetic Beta'}], stream: streamConfig};
  for (const [key, table, order] of [['allianceCombatRecords', 'alliance_combat_records'], ['marketHubs', 'market_hubs'], ['goalTracking', 'goal_tracking'],
    ['goalProgressEntries', 'goal_progress_entries'], ['hiddenJourneyLinks', 'journey_hidden_links'], ['combatRecords', 'combat_records'], ['places', 'place_notes'],
    ['goals', 'goals'], ['notes', 'notes'], ['events', 'events', 'at'], ['visits', 'visits', 'at'], ['sessions', 'sessions']])
    result[key] = rows(db, `SELECT * FROM ${table}` + (order ? ' ORDER BY ' + order : ''));
  if (version === 9) result.discoveredSystems = rows(db, 'SELECT character_id,system_id FROM discovered_systems ORDER BY character_id,system_id');
  return result;
}
function withoutTimestamp(value) { const copy = structuredClone(value); assert.equal(new Date(copy.exportedAt).toISOString(), copy.exportedAt); delete copy.exportedAt; return copy; }
async function observe(label, version) {
  const beforeSQL = sqlSnapshot(app.store.db);
  const response = await nativeFetch(app.origin + '/', {redirect: 'error', signal: AbortSignal.timeout(5000)});
  assert.equal(response.status, 200); await response.text();
  const setCookie = response.headers.get('set-cookie'); assert.match(setCookie, /kairo_session=/); assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Lax/);
  const cookie = setCookie.split(';')[0], checks = [];
  for (const [name, origin, path, headers, expected] of [
    ['missing-session', app.origin, '/api/export', {}, 401],
    ['invalid-session', app.origin, '/api/export', {Cookie: 'kairo_session=synthetic-invalid'}, 401],
    ['wrong-origin', app.origin, '/api/export', {Cookie: cookie, Origin: 'https://example.invalid'}, 401],
    ['cross-site', app.origin, '/api/export', {Cookie: cookie, Origin: app.origin, 'Sec-Fetch-Site': 'cross-site'}, 401],
    ['broadcast-private-path', app.streamOrigin, '/api/export', {Cookie: cookie}, 404],
    ['broadcast-bare-path', app.streamOrigin, '/export', {Cookie: cookie}, 404]]) {
    const r = await nativeFetch(origin + path, {headers, redirect: 'error', signal: AbortSignal.timeout(5000)}), body = await r.text();
    assert.equal(r.status, expected, name); assert.ok(!body.includes('fixture-note') && !body.includes(SECRET));
    if (expected === 401) assert.deepEqual(JSON.parse(body), {error: 'Open Kairo on this computer to start your session.'});
    checks.push({name, status: r.status, body});
  }
  const r = await nativeFetch(app.origin + '/api/export', {headers: {Cookie: cookie, Origin: app.origin, 'Sec-Fetch-Site': 'same-origin'}, redirect: 'error', signal: AbortSignal.timeout(5000)});
  const raw = await r.text(); await writeEvidence(label + '-export.json', raw);
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /^application\/json/);
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="kairo-history.json"'); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.ok(!raw.includes(SECRET));
  const value = JSON.parse(raw), expected = expectedExport(app.store.db, version);
  await save(label + '-expected.json', expected);
  assert.deepEqual(withoutTimestamp(value), expected, 'Complete decoded response must match all independent SQL/fixture fields');
  const sql = sqlSnapshot(app.store.db); await save(label + '-live-sql.json', sql);
  assert.deepEqual(sql, beforeSQL, 'Auth checks and export must not mutate any retained fixture row');
  if (version === 9) {
    assert.equal(app.store.db.prepare("SELECT count(*) n FROM migrations WHERE id='session-travel-v080'").get().n, 1);
    assert.deepEqual(value.discoveredSystems, [{character_id: 42, system_id: 30000142}, {character_id: 42, system_id: 30002187}, {character_id: 43, system_id: 30000142}]);
    assert.ok(value.visits.every(visit => visit.session_id === null));
    assert.deepEqual(rows(app.store.db, 'SELECT id,terminal FROM market_jobs ORDER BY id'), [{id: 'fixture-complete', terminal: 1}, {id: 'fixture-queued', terminal: 0}]);
  }
  report.observations.push({label, version, authenticationChecks: checks, fullExportSQLOraclePassed: true});
  return {value, sql};
}
function compareExport(oldExport, newExport) {
  const old = withoutTimestamp(oldExport), current = withoutTimestamp(newExport);
  assert.equal(old.version, 8); assert.equal(current.version, 9); delete old.version; delete current.version;
  assert.equal(Object.hasOwn(old, 'discoveredSystems'), false); delete current.discoveredSystems;
  for (const visit of current.visits) { assert.equal(visit.session_id, null); delete visit.session_id; }
  assert.equal(old.universe.operationalSettings.some(row => row.key === 'universe:politics:queue-version'), false);
  const additions = current.universe.operationalSettings.filter(row => row.key === 'universe:politics:queue-version');
  assert.deepEqual(additions, [{key: 'universe:politics:queue-version', value: 3}]);
  current.universe.operationalSettings = current.universe.operationalSettings.filter(row => row.key !== 'universe:politics:queue-version');
  assert.deepEqual(current, old, 'No other export field or record may differ');
}
function compareRetainedSQL(old, current, bounds) {
  const value = structuredClone(current);
  assert.deepEqual(value.visits.columns, [...old.visits.columns, 'session_id']); value.visits.columns.pop();
  for (const row of value.visits.rows) { assert.equal(row.session_id, null); delete row.session_id; }
  // table_info omits SQLite generated columns; SELECT * includes terminal.
  for (const row of value.market_jobs.rows) { assert.equal(row.terminal, JSON.parse(row.body).status === 'complete' ? 1 : 0); delete row.terminal; }
  const extraSettings = value.settings.rows.filter(row => !old.settings.rows.some(prior => prior.key === row.key));
  assert.deepEqual(extraSettings.map(row => row.key).sort(), ['retention:transport:v080', 'universe:politics:queue-version']);
  assert.equal(extraSettings.find(row => row.key === 'universe:politics:queue-version').value, '3');
  const retention = JSON.parse(extraSettings.find(row => row.key === 'retention:transport:v080').value);
  assert.deepEqual(Object.keys(retention).sort(), ['introduced', 'key', 'next', 'updated']);
  assert.ok(retention.introduced >= bounds.startAt && retention.introduced <= bounds.readyAt);
  assert.ok(retention.next >= retention.introduced + 3600000 && retention.next <= bounds.readyAt + 3600000);
  assert.equal(retention.updated, -1); assert.equal(retention.key, '');
  value.settings.rows = value.settings.rows.filter(row => !extraSettings.some(extra => row.key === extra.key));
  const newMigrations = value.migrations.rows.filter(row => !old.migrations.rows.some(prior => prior.id === row.id));
  assert.deepEqual(newMigrations.map(row => row.id).sort(), ['cache-retention-v080', 'session-combat-eligibility-v080', 'session-travel-v080']);
  for (const row of newMigrations) assert.ok(Number.isFinite(Date.parse(row.applied_at)));
  value.migrations.rows = value.migrations.rows.filter(row => !newMigrations.some(extra => row.id === extra.id));
  assert.deepEqual(value, old, 'Every old retained SQLite field/record must remain exact, independently of response normalization');
}
try {
  await seed(); await start(baselineRoot, oldDir); seedUniverse();
  const baseline = await observe('rc16', 8);
  for (const table of TABLES) assert.ok(baseline.sql[table].rows.length, 'Seed each declared retained owner: ' + table);
  await stop(); const stoppedOld = await stoppedSnapshot(oldDir, 'rc16-stopped-sql.json');
  assert.deepEqual(stoppedOld, baseline.sql, 'RC16 close preserves all retained rows');
  const originalFiles = await filesBelow(oldDir); await save('rc16-original-files.json', originalFiles);
  await cp(oldDir, newDir, {recursive: true, errorOnExist: true, force: false});
  assert.deepEqual(await filesBelow(newDir), originalFiles, 'Upgrade receives byte-identical stopped directory');
  const bounds = await start(candidateRoot, newDir), candidate = await observe('candidate-upgrade', 9);
  compareExport(baseline.value, candidate.value); compareRetainedSQL(stoppedOld, candidate.sql, bounds);
  await stop(); let previousSQL = await stoppedSnapshot(newDir, 'candidate-upgrade-stopped-sql.json');
  assert.deepEqual(previousSQL, candidate.sql);
  for (const ordinal of [1, 2]) {
    await start(candidateRoot, newDir); const reopened = await observe('candidate-reopen-' + ordinal, 9);
    assert.deepEqual(withoutTimestamp(reopened.value), withoutTimestamp(candidate.value), 'Complete export stable after clean reopen');
    assert.deepEqual(reopened.sql, previousSQL, 'No retained SQLite mutation on reopen');
    await stop(); previousSQL = await stoppedSnapshot(newDir, 'candidate-reopen-' + ordinal + '-stopped-sql.json');
    assert.deepEqual(previousSQL, reopened.sql, 'Clean stop preserves every current field/record');
  }
  assert.deepEqual(await filesBelow(oldDir), originalFiles, 'Original stopped RC16 directory must never be reopened or changed');
  for (const directory of ['rc16-original', 'candidate-upgrade']) for (const file of await filesBelow(join(out, directory)))
    evidencePins[directory + '/' + file.path] = {bytes: file.bytes, sha256: file.sha256};
  report.controls.push('Private auth and broadcast boundaries on all four actual lifecycles', 'Four complete independent SQL/fixture export oracles',
    'Full RC16/final response comparison with only enumerated additions', 'Exact retained SQLite data separate from export normalization',
    'Byte-identical stopped copy; two clean final reopens; idempotent discovery migration', 'Original RC16 directory preserved unchanged');
} catch (error) { failure = error; report.error = error.stack; }
finally {
  try {
    seedingStore?.close(); seedingStore = null;
    assert.ok(!startupBegan || startupReturned, 'Startup rejected before returning lifecycle owner; keep failed receipt/data');
    if (app) await stop(); report.lifecycleClosed = true;
  } catch (error) { failure ||= error; report.closeError = error.stack; }
  try {
    const after = [await sourceAt(baselineRoot, baselineManifest), await sourceAt(candidateRoot, candidateManifest)];
    assert.deepEqual(after.map(value => value.binding), sources.map(value => value.binding)); report.sourceVerified = true;
  } catch (error) { failure ||= error; report.sourceError = error.stack; }
  try {
    for (const [name, expected] of Object.entries(evidencePins)) {
      const bytes = await readFile(join(out, name));
      assert.deepEqual({bytes: bytes.length, sha256: sha(bytes)}, expected, 'Closed evidence changed: ' + name);
    }
    report.evidencePinsVerified = true;
  } catch (error) { failure ||= error; report.evidencePinError = error.stack; }
  report.closedEvidence = evidencePins;
  report.externalAttempts = externalAttempts;
  if (externalAttempts) failure ||= Error('External transport attempted');
  report.complete = !failure && report.lifecycleClosed && report.sourceVerified;
  await writeFile(join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
}
if (failure) throw failure;
