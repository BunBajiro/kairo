// Untimed exact-output supplement. Never loaded by the ordinary timing children.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve, join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadSourceManifest, verifySource} from '../../../../harness/source-manifest.mjs';
assert.equal(process.env.KAIRO_MODELS_LOCKED, '1');
const [baselineManifest, candidateManifest, outputArg] = process.argv.slice(2);
const sources = await Promise.all([baselineManifest, candidateManifest].map(file => loadSourceManifest(file)));
const modules = await Promise.all(sources.map(source => import(pathToFileURL(join(source.root, 'components/kairo/model.ts')))));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const outputs = [], checks = [];
function equal(label, invoke, oracle) {
  const values = modules.map(invoke);
  assert.deepEqual(values[1], values[0], label);
  if (oracle) assert.deepEqual(values[0], oracle(), label + ' original Intl oracle');
  outputs.push(values[0]);
  checks.push(label);
}
const numbers = [undefined, null, '10', {}, 0, -0, 0.1, -0.1, 1234.56, -1234.56, 999999, 1e12, NaN, Infinity, -Infinity];
for (const [index, value] of numbers.entries()) for (const compact of [false, true]) equal('number-' + index + '-' + compact,
  module => module.isk(value, compact), () => typeof value === 'number' ? new Intl.NumberFormat('en-GB', {maximumFractionDigits:compact ? 2 : 0, notation:compact ? 'compact' : 'standard'}).format(value) : '—');
for (const [index, value] of [undefined, null, '', 'not a date', '2026-03-29T00:59:00Z', '2026-03-29T02:00:00+01:00', '2026-10-25T01:30:00Z', '2026-12-31T23:59:00Z'].entries()) equal('date-' + index,
  module => module.stamp(value), () => value ? new Date(value).toLocaleString('en-GB', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'UTC'}) + ' EVE' : 'Awaiting data');
const fixture = [];
for (let i = 0; i < 10000; i++) {
  const value = i * 1234.56, date = '2026-10-07T10:20:00Z';
  const pair = modules.map(module => [module.isk(value), module.isk(value, true), module.stamp(date)]);
  assert.deepEqual(pair[1], pair[0], 'representative row ' + i);
  fixture.push(pair[0]);
}
await Promise.all(sources.map(source => verifySource(source)));
await writeFile(resolve(outputArg), JSON.stringify({schemaVersion:1, complete:true, mode:'untimed-exact-output', node:process.version,
  sources:sources.map(s => ({commit:s.sourceCommit, fingerprint:s.fingerprint, dirty:s.dirty})), checks,
  edgeOutputSha256:sha(JSON.stringify(outputs)), representative:{rows:10000, calls:30000, outputSha256:sha(JSON.stringify(fixture)), outputCharacters:fixture.flat().reduce((n, value) => n + value.length, 0)},
  sourceVerified:true, harnessSha256:sha(await readFile(new URL(import.meta.url)))}, null, 2) + '\n');
