// Exact-source isolated conversion comparison, sequential under the common lock.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadSourceManifest, verifySource } from '../../harness/source-manifest.mjs';
const self = fileURLToPath(import.meta.url), here = dirname(self);
if (process.env.KAIRO_UPDATER_LOCKED !== '1') {
  const code = await new Promise((done, reject) => {
    const child = spawn('flock', ['/tmp/kairo-performance.lock', process.execPath, self, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, KAIRO_UPDATER_LOCKED: '1' } });
    child.once('error', reject); child.once('exit', code => done(code ?? 1));
  });
  process.exit(code);
}
const [baselineFile, candidateFile, archiveFile, output] = process.argv.slice(2);
const baseline = await loadSourceManifest(resolve(baselineFile)), candidate = await loadSourceManifest(resolve(candidateFile));
const archive = resolve(archiveFile), out = resolve(output), build = 3552227;
const hash = async file => { const digest = createHash('sha256'); for await (const bytes of createReadStream(file)) digest.update(bytes); return digest.digest('hex'); };
assert.equal((await stat(archive)).size, 99197259);
assert.equal(await hash(archive), '0788ec9352556fcb2eb28ba084eb1f408cb0ad22f8e30d91bfa49f534ec1ad83');
await mkdir(out, { recursive: true });
const harnessHash = await hash(join(here, 'archive-measure.mjs'));
const report = { schema: 1, generatedAt: new Date().toISOString(), baselineCommit: baseline.sourceCommit, candidateCommit: candidate.sourceCommit,
  harnessHash, order: ['baseline-1', 'candidate-1', 'candidate-2', 'baseline-2', 'baseline-3', 'candidate-3'], complete: false, runs: [],
  scope: 'Three fresh processes per source, identical pinned archive, full real service/default Worker conversion, pending validation and commit. Isolated process only; loaded HTTP/SSE acceptance is separate.' };
const save = () => writeFile(join(out, 'comparison.json'), JSON.stringify(report, null, 2) + '\n');
try {
  for (const label of report.order) {
    const source = label.startsWith('baseline') ? baseline : candidate, manifestFile = label.startsWith('baseline') ? baselineFile : candidateFile;
    const entry = { label, complete: false }; report.runs.push(entry);
    let stdout = '', stderr = '';
    const code = await new Promise((done, reject) => {
      const child = spawn(process.execPath, [join(here, 'archive-measure.mjs'), 'archive', archive, String(build)], {
        env: { ...process.env, KAIRO_PERF_APP_ROOT: source.root, KAIRO_SOURCE_MANIFEST: resolve(manifestFile) }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
      child.once('error', reject); child.once('exit', code => done(code ?? 1));
    });
    await writeFile(join(out, label + '.json'), stdout);
    await writeFile(join(out, label + '.stderr'), stderr);
    entry.exitCode = code; assert.equal(code, 0, stderr);
    const value = JSON.parse(stdout); assert.ok(!value.error); assert.equal(value.endVerified, true);
    assert.equal(value.manifest.sourceArchiveSha256, '0788ec9352556fcb2eb28ba084eb1f408cb0ad22f8e30d91bfa49f534ec1ad83');
    entry.sourceCommit = value.sourceCommit; entry.measurements = value.measurements;
    entry.files = value.manifest.files; entry.counts = value.manifest.counts; entry.complete = true;
    await save();
  }
  for (const entry of report.runs) {
    assert.deepEqual(entry.files, report.runs[0].files, 'All source/repetition outputs must have identical byte hashes and shard boundaries');
    assert.deepEqual(entry.counts, report.runs[0].counts);
  }
  assert.equal(await hash(join(here, 'archive-measure.mjs')), harnessHash);
  await verifySource(baseline); await verifySource(candidate);
  report.complete = true; report.endVerified = true;
} finally { await save(); }
