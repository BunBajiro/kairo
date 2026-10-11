// Separate setup process: never import this file into the measured child.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sourceAt, filesBelow, sha, GOAL, PROFILE} from './common.mjs';

const [rootArg, manifestArg, directoryArg, receiptArg] = process.argv.slice(2);
assert.ok(rootArg && manifestArg && directoryArg && receiptArg);
const root = resolve(rootArg), directory = resolve(directoryArg), receiptPath = resolve(receiptArg);
const before = await sourceAt(root, manifestArg);
await mkdir(directory); // Existing data, including an earlier failed attempt, is never reused.
process.env.KAIRO_PERF_APP_ROOT = root;
process.env.KAIRO_DATA_DIR = directory;
process.env.KAIRO_SDE_DIRECTORY = join(root, 'server/data');
let externalAttempts = 0, store;
globalThis.fetch = async () => { externalAttempts++; throw Error('External network forbidden in first-binding setup'); };
const report = {schemaVersion: 1, suite: 'configured-first-binding-acceptance', phase: 'setup', complete: false,
  directory, root, source: before.binding, syntheticOnly: true, profile: PROFILE};
let failure;
try {
  const moduleAt = path => import(pathToFileURL(join(root, path)).href);
  const [{seedFixture}, {openStore}, {openVault}, {sanitizeConfig}] = await Promise.all([
    import('../../../../../harness/backend/fixture.mjs'), moduleAt('server/store.mjs'),
    moduleAt('server/vault.mjs'), moduleAt('server/stream.mjs'),
  ]);
  const now = Date.now();
  report.fixture = await seedFixture(directory, PROFILE, now);
  store = openStore(directory);
  const vault = openVault(directory);
  for (const character of store.db.prepare('SELECT id FROM characters').all()) {
    store.db.prepare('UPDATE characters SET tokens=? WHERE id=?')
      .run(vault.encrypt({access_token: 'synthetic-first-binding-' + character.id, expires: now + 86400000}), character.id);
  }
  const sample = store.snapshot(42, 'wallet');
  store.saveSnapshot(42, 'wallet', {...sample, data: GOAL.progress});
  store.db.prepare('INSERT INTO goals(id,character_id,title,target,progress,kind,done,created) VALUES(?,?,?,?,?,?,?,?)')
    .run(GOAL.id, GOAL.characterId, GOAL.title, GOAL.target, GOAL.progress, 'counter', 0, new Date(now).toISOString());
  const common = {kind: 'text', visible: true, characterId: 42, bindingDisplay: 'both',
    x: 40, y: 40, width: 400, height: 120, fontSize: 24, opacity: .7, color: '#97ebce'};
  report.config = sanitizeConfig({rules: [], elements: [
    {...common, id: 'first-wallet', name: 'Synthetic wallet', binding: 'wallet.balance'},
    {...common, id: 'first-goal', name: 'Synthetic goal', y: 180, binding: 'goal.progress', sourceId: GOAL.id},
  ]});
  store.set('stream', report.config);
  store.set('opsec', {characterId: 42, manual: true, allowHighsec: false, blueAlliances: [], hostileAlliances: []});
  assert.deepEqual(store.get('stream'), report.config, 'Visible bindings must exist in persistent storage before startup');
  report.syntheticChanges = ['Valid encrypted synthetic access values', 'Wallet 42 set to 1234567.89',
    'One manual counter Goal', 'Two saved visible Wallet/Goal elements', 'Manual broadcast protection'];
} catch (error) { failure = error; report.error = error.stack; }
finally {
  try { store?.close(); report.storeClosed = true; } catch (error) { failure ||= error; report.closeError = error.stack; }
  try {
    const after = await sourceAt(root, manifestArg);
    assert.deepEqual(after.binding, before.binding);
    report.sourceVerified = true;
    report.payloadFiles = await filesBelow(directory);
    report.payloadFingerprint = sha(JSON.stringify(report.payloadFiles));
  } catch (error) { failure ||= error; report.finalGuardError = error.stack; }
  report.externalAttempts = externalAttempts;
  if (externalAttempts) failure ||= Error('Setup attempted external transport');
  report.complete = !failure;
  await writeFile(receiptPath, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
}
if (failure) throw failure;
