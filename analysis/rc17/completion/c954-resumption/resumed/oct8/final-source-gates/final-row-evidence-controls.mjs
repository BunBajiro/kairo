import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, rm, symlink, writeFile, lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {finalizeRowEvidence, verifyInventoriedRowEvidence} from './final-row-evidence.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'kairo-final-evidence-control-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  await mkdir(join(directory, 'output'));
  const raw = Buffer.from('{"reports":{"typical":{}}}\n');
  const path = join(directory, 'output', 'contracts.json');
  await writeFile(path, raw);
  const contractFiles = {rawContracts: {path: 'contracts.json', bytes: raw.length, sha256: sha(raw)}};
  const result = {complete: true, files: contractFiles};
  await writeFile(join(directory, 'output', 'result.json'), JSON.stringify(result) + '\n');
  const files = [];
  for (const [name, bytes] of [['stderr.log', Buffer.alloc(0)], ['stdout.log', Buffer.from('{"complete":true}\n')]]) {
    const path = join(directory, name); await writeFile(path, bytes);
    files.push({path, bytes: bytes.length, sha256: sha(bytes)});
  }
  const row = {name: 'synthetic-contract', phase: 'contracts', directory, complete: true, cleanupComplete: true,
    logs: {files, sha256: sha(JSON.stringify(files))}, result, contractFiles};
  return {report: {complete: true, rows: [row], failures: []}, row, directory, raw};
}

async function inventory(directory) {
  const files = [];
  for (const name of ['stderr.log', 'stdout.log', 'output/result.json', 'output/contracts.json']) {
    const path = join(directory, name), bytes = await readFile(path);
    files.push({path, bytes: bytes.length, sha256: sha(bytes)});
  }
  return {files, sha256: sha(JSON.stringify(files))};
}

test('unchanged closed logs, retained result/contracts and absent temp preserve passing receipt', async t => {
  const {report, directory} = await fixture(t);
  const result = await finalizeRowEvidence(report);
  assert.equal(result.complete, true); assert.equal(result.temporaryDataAbsent, true);
  assert.equal(report.complete, true); assert.deepEqual(report.failures, []);
  assert.equal(result.rows[0].checks.length, 5);
  assert.equal((await verifyInventoriedRowEvidence(report, await inventory(directory))).complete, true);
  assert.equal(report.complete, true);
});

test('truncated log fails final receipt while keeping original pin and damaged raw file', async t => {
  const {report, row, directory} = await fixture(t);
  const original = structuredClone(row.logs);
  await writeFile(join(directory, 'stdout.log'), '');
  await finalizeRowEvidence(report);
  assert.equal(report.complete, false); assert.equal(row.complete, true);
  assert.deepEqual(report.failures.map(f => f.kind), ['child-logs']);
  assert.deepEqual(row.logs, original); assert.equal((await readFile(join(directory, 'stdout.log'))).length, 0);
});

test('reappeared empty temp directory fails cleanup and remains available for investigation', async t => {
  const {report, directory} = await fixture(t);
  await mkdir(join(directory, 'tmp'));
  await finalizeRowEvidence(report);
  assert.equal(report.complete, false); assert.equal(report.finalRowEvidence.temporaryDataAbsent, false);
  assert.deepEqual(report.failures.map(f => f.kind), ['temporary-data']);
  assert.equal((await lstat(join(directory, 'tmp'))).isDirectory(), true);
});

test('dangling temp symlink is present, never accepted as removed', async t => {
  const {report, directory} = await fixture(t);
  await symlink(join(directory, 'missing-target'), join(directory, 'tmp'));
  await finalizeRowEvidence(report);
  assert.equal(report.complete, false); assert.equal(report.finalRowEvidence.temporaryDataAbsent, false);
  assert.deepEqual(report.failures.map(f => f.kind), ['temporary-data']);
  assert.equal((await lstat(join(directory, 'tmp'))).isSymbolicLink(), true);
});

test('same-size changed contract payload fails its retained content hash', async t => {
  const {report, directory, raw} = await fixture(t);
  const changed = Buffer.from(raw); changed[changed.indexOf(Buffer.from('typical'))] = 'T'.charCodeAt(0);
  await writeFile(join(directory, 'output', 'contracts.json'), changed);
  await finalizeRowEvidence(report);
  assert.equal(report.complete, false);
  assert.deepEqual(report.failures.map(f => f.kind), ['contract-payload-rawContracts']);
  assert.deepEqual(await readFile(join(directory, 'output', 'contracts.json')), changed);
});

test('changed retained result is rejected even when referenced payloads remain intact', async t => {
  const {report, row, directory} = await fixture(t);
  await writeFile(join(directory, 'output', 'result.json'), JSON.stringify({...row.result, complete: false}) + '\n');
  await finalizeRowEvidence(report);
  assert.equal(report.complete, false);
  assert.deepEqual(report.failures.map(f => f.kind), ['retained-result']);
});

test('independent log and temporary-path failures are both preserved', async t => {
  const {report, directory} = await fixture(t);
  await writeFile(join(directory, 'stdout.log'), ''); await mkdir(join(directory, 'tmp'));
  await finalizeRowEvidence(report);
  assert.equal(report.complete, false);
  assert.deepEqual(report.failures.map(f => f.kind), ['child-logs', 'temporary-data']);
  assert.equal(report.finalRowEvidence.rows[0].errors.length, 2);
});

test('log mutation between final row verification and inventory fails the saved receipt', async t => {
  const {report, row, directory} = await fixture(t);
  await finalizeRowEvidence(report); assert.equal(report.complete, true);
  const pin = structuredClone(row.logs);
  await writeFile(join(directory, 'stdout.log'), '');
  const captured = await inventory(directory);
  assert.equal((await verifyInventoriedRowEvidence(report, captured)).complete, false);
  const saved = JSON.parse(JSON.stringify(report));
  assert.equal(saved.complete, false);
  assert.deepEqual(saved.failures.map(f => f.kind), ['child-logs']);
  assert.deepEqual(row.logs, pin); assert.equal((await readFile(join(directory, 'stdout.log'))).length, 0);
});

test('payload mutation between final row verification and inventory is rejected', async t => {
  const {report, directory} = await fixture(t);
  await finalizeRowEvidence(report); assert.equal(report.complete, true);
  await writeFile(join(directory, 'output', 'contracts.json'), '{}\n');
  assert.equal((await verifyInventoriedRowEvidence(report, await inventory(directory))).complete, false);
  assert.equal(report.complete, false);
  assert.deepEqual(report.failures.map(f => f.kind), ['retained-files']);
});

test('temporary directory recreated during inventory is preserved and fails cleanup', async t => {
  const {report, directory} = await fixture(t);
  report.cleanupComplete = true;
  await finalizeRowEvidence(report); assert.equal(report.complete, true);
  const captured = await inventory(directory);
  await mkdir(join(directory, 'tmp'));
  assert.equal((await verifyInventoriedRowEvidence(report, captured)).complete, false);
  assert.equal(report.complete, false); assert.equal(report.cleanupComplete, false);
  assert.deepEqual(report.failures.map(f => f.kind), ['temporary-data']);
  assert.equal((await lstat(join(directory, 'tmp'))).isDirectory(), true);
});
