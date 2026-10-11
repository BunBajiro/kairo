// External evidence checks only. No application imports, workers or timings.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat, readFile, realpath} from 'node:fs/promises';
import {isAbsolute, join, relative, resolve, sep} from 'node:path';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const errorText = error => error?.stack || String(error);

async function fingerprints(paths) {
  const files = [];
  for (const path of [...new Set(paths)].sort()) {
    const bytes = await readFile(path);
    files.push({path, bytes: bytes.length, sha256: sha(bytes)});
  }
  return {files, sha256: sha(JSON.stringify(files))};
}

async function retainedPayload(directory, entry) {
  assert.ok(entry && typeof entry.path === 'string' && !isAbsolute(entry.path), 'Relative contract file path required');
  const path = await realpath(resolve(directory, entry.path));
  const inside = relative(await realpath(directory), path);
  assert.ok(inside && inside.split(sep)[0] !== '..' && !isAbsolute(inside), 'Contract artifact escapes arm output');
  const bytes = await readFile(path);
  assert.equal(bytes.length, entry.bytes, 'Retained contract byte count differs');
  assert.equal(sha(bytes), entry.sha256, 'Retained contract hash differs');
  return {path, bytes: bytes.length, sha256: sha(bytes)};
}

// Called again at final receipt time, after every worker has exited. Per-child
// success is historical evidence; it does not establish the final file state.
// Preserve all raw files and every failure, including multiple faults in a row.
export async function finalizeRowEvidence(report) {
  const evidence = {complete: true, temporaryDataAbsent: true, checkedAt: new Date().toISOString(), rows: []};
  for (const row of report.rows) {
    const checked = {name: row.name, complete: true, checks: [], errors: []};
    evidence.rows.push(checked);
    async function check(kind, action) {
      try { checked.checks.push({kind, verified: true, ...(await action())}); }
      catch (error) {
        const failure = {stage: 'final-row-evidence', row: row.name, kind, error: errorText(error)};
        checked.complete = evidence.complete = false;
        if (kind === 'temporary-data') evidence.temporaryDataAbsent = false;
        checked.errors.push(failure); report.failures.push(failure);
      }
    }
    await check('child-logs', async () => {
      const actual = await fingerprints([join(row.directory, 'stderr.log'), join(row.directory, 'stdout.log')]);
      assert.deepEqual(actual, row.logs, 'Final child logs differ from the closed-child fingerprint');
      return {fingerprint: actual};
    });
    await check('temporary-data', async () => {
      const path = join(row.directory, 'tmp');
      await lstat(path).then(() => { throw Error('Temporary path reappeared after child cleanup: ' + path); },
        error => { if (error.code !== 'ENOENT') throw error; });
      return {path, absent: true};
    });
    if (row.phase === 'contracts' || row.phase === 'database') {
      await check('retained-result', async () => {
        const path = join(row.directory, 'output', row.phase === 'contracts' ? 'result.json' : 'database.json');
        const bytes = await readFile(path);
        assert.deepEqual(JSON.parse(bytes), row.result, 'Retained result differs from the validated child result');
        return {path, bytes: bytes.length, sha256: sha(bytes)};
      });
    }
    if (row.phase === 'contracts') {
      await check('contract-file-bindings', async () => {
        assert.ok(row.contractFiles && typeof row.contractFiles === 'object', 'Missing validated contract file bindings');
        assert.deepEqual(row.contractFiles, row.result?.files, 'Contract bindings differ from validated result');
        assert.ok(Object.keys(row.contractFiles).length > 0, 'Contract file bindings are empty');
        return {count: Object.keys(row.contractFiles).length};
      });
      for (const [name, entry] of Object.entries(row.contractFiles || {})) {
        await check('contract-payload-' + name, () => retainedPayload(join(row.directory, 'output'), entry));
      }
    }
  }
  report.finalRowEvidence = evidence;
  if (!evidence.complete) report.complete = false;
  return evidence;
}

// Bind the bytes actually captured by the final recursive inventory, rather
// than assuming that an earlier verification read establishes later bytes.
// Successful evidence belongs in artifacts.json. On failure, update the final
// report before it is saved/reinventoried; never overwrite the original pins.
export async function verifyInventoriedRowEvidence(report, artifacts) {
  const evidence = {complete: true, temporaryDataAbsent: true, checkedAt: new Date().toISOString(), rows: []};
  const inventory = new Map(artifacts.files.map(file => [file.path, file]));
  for (const row of report.rows) {
    const checked = {name: row.name, complete: true, checks: [], errors: []};
    evidence.rows.push(checked);
    async function check(kind, action) {
      try { checked.checks.push({kind, verified: true, ...(await action())}); }
      catch (error) {
        const failure = {stage: 'final-inventory-row-evidence', row: row.name, kind, error: errorText(error)};
        checked.complete = evidence.complete = false;
        if (kind === 'temporary-data') evidence.temporaryDataAbsent = false;
        checked.errors.push(failure); report.failures.push(failure);
      }
    }
    await check('child-logs', async () => {
      assert.equal(row.logs?.files?.length, 2, 'Both closed-child log fingerprints required');
      for (const expected of row.logs.files) assert.deepEqual(inventory.get(expected.path), expected,
        'Final inventory log differs from the closed-child fingerprint: ' + expected.path);
      return {files: row.logs.files.length};
    });
    await check('retained-files', async () => {
      const finalRow = report.finalRowEvidence?.rows.find(item => item.name === row.name);
      assert.ok(finalRow, 'Final per-row evidence check is missing');
      const files = finalRow.checks.filter(item => item.kind === 'retained-result' || item.kind.startsWith('contract-payload-'));
      for (const {path, bytes, sha256} of files) assert.deepEqual(inventory.get(path), {path, bytes, sha256},
        'Final inventory retained payload differs from its final checked fingerprint: ' + path);
      return {files: files.length};
    });
    await check('temporary-data', async () => {
      const path = join(row.directory, 'tmp');
      await lstat(path).then(() => { throw Error('Temporary path reappeared during artifact inventory: ' + path); },
        error => { if (error.code !== 'ENOENT') throw error; });
      return {path, absent: true};
    });
  }
  if (!evidence.complete) {
    report.complete = false;
    if (!evidence.temporaryDataAbsent) report.cleanupComplete = false;
    report.finalInventoryEvidence = evidence;
  }
  return evidence;
}
