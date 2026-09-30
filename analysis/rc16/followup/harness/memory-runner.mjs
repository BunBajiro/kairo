// Each fresh child holds the shared benchmark lock for its entire execution.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { analysisRoot, builds, sha } from './memory-common.mjs';
if (!process.argv.includes('--run')) { console.log('Reserved-slot command: node analysis/rc16/followup/harness/memory-runner.mjs --run [residency|sessions|all]'); process.exit(0); }
const lane = process.argv[3] || 'all';
if (!['residency', 'sessions', 'all'].includes(lane)) throw new Error('Unknown lane');
const destination = join(analysisRoot, 'raw/followup'); mkdirSync(destination, { recursive: true });
const jobs = [];
if (lane !== 'sessions') {
  for (const mode of ['ordinary', 'retention']) for (const [index, build] of ['v073', 'rc16', 'rc16', 'v073'].entries()) jobs.push({ script: 'memory-residency.mjs', build, mode, index });
}
if (lane !== 'residency') {
  for (const [index, build] of ['v073', 'rc16', 'rc16', 'v073'].entries()) jobs.push({ script: 'memory-sessions.mjs', build, mode: 'timings', index });
  for (const [index, build] of ['v073', 'rc16'].entries()) jobs.push({ script: 'memory-sessions.mjs', build, mode: 'diagnostics', index });
}
const results = [];
const sessionSemantics = new Map();
for (const job of jobs) {
  const script = fileURLToPath(new URL(job.script, import.meta.url));
  const args = ['-x', '/tmp/kairo-rc16-benchmark.lock', process.execPath, ...(job.mode === 'retention' ? ['--expose-gc'] : []), script, job.build, job.mode];
  const launchedAt = new Date().toISOString();
  const result = spawnSync('flock', args, { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024, timeout: 120000 });
  const name = `memory-${job.script.includes('sessions') ? 'sessions' : 'residency'}-${job.mode}-${job.build}-${job.index + 1}.json`;
  writeFileSync(join(destination, name), result.stdout || '');
  if (result.stderr) writeFileSync(join(destination, name.replace('.json', '.stderr.log')), result.stderr);
  if (result.status !== 0 || result.error) throw new Error(`Failed ${name}: ${result.error || result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  if (parsed.sourceCommit !== builds[job.build].commit) throw new Error('Unexpected source revision');
  if (job.script.includes('sessions')) for (const entry of parsed.results) {
    const key = JSON.stringify(entry.fixture), actual = JSON.stringify({ routeLength: entry.routeLength, groupCount: entry.groupCount, semantic: entry.semantic });
    if (sessionSemantics.has(key) && sessionSemantics.get(key) !== actual) throw new Error(`Session semantic mismatch for ${key}`);
    sessionSemantics.set(key, actual);
  }
  results.push({ ...job, launchedAt, finishedAt: new Date().toISOString(), result: name, sha256: sha(result.stdout), networkAttempts: parsed.networkAttempts });
  process.stderr.write(`${name} complete\n`);
}
writeFileSync(join(destination, `memory-${lane}-run.json`), JSON.stringify({ recordedAt: new Date().toISOString(), lane, lock: '/tmp/kairo-rc16-benchmark.lock', lockAcquisition: 'Runner acquires flock for each child; do not wrap this runner in another flock.', order: 'ABBA per comparable lane; SQL diagnostics separately', semanticFixtureComparisons: sessionSemantics.size, results }, null, 2) + '\n');
