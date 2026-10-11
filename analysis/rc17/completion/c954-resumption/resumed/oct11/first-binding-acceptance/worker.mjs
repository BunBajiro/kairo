// Fresh-process actual-Core acceptance supplement; no production instrumentation.
import assert from 'node:assert/strict';
import {readFile, rm, lstat, writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {cpus} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {sourceAt, filesBelow, sha, expectedElements, PROFILE, WARM_CALLS} from './common.mjs';

const [rootArg, manifestArg, setupArg, outputArg] = process.argv.slice(2);
assert.ok(rootArg && manifestArg && setupArg && outputArg);
assert.equal(process.env.KAIRO_FIRST_BINDING_LOCKED, '1', 'Use the reviewed outer ownership/lock envelope');
assert.equal(process.execArgv.length, 0, 'No profiling, counters, coverage or forced GC in this child');
const root = resolve(rootArg), output = resolve(outputArg), setupBytes = await readFile(setupArg);
const setup = JSON.parse(setupBytes), directory = resolve(setup.directory);
assert.equal(setup.suite, 'configured-first-binding-acceptance');
assert.equal(setup.phase, 'setup'); assert.equal(setup.complete, true);
assert.equal(setup.root, root); assert.equal(setup.profile, PROFILE);
assert.equal(setup.externalAttempts, 0); assert.equal(setup.storeClosed, true);
assert.equal(setup.sourceVerified, true);
const before = await sourceAt(root, manifestArg);
assert.deepEqual(setup.source, before.binding);
assert.deepEqual(await filesBelow(directory), setup.payloadFiles, 'Seeded database/config changed before cold child');
assert.equal(sha(JSON.stringify(setup.payloadFiles)), setup.payloadFingerprint);
process.env.KAIRO_DATA_DIR = directory;
process.env.KAIRO_SDE_DIRECTORY = join(root, 'server/data');
const nativeFetch = globalThis.fetch;
let externalAttempts = 0, app, failure, startupBegan = false, startupReturned = false;
const deny = async () => { externalAttempts++; throw Error('External transport forbidden in first-binding acceptance'); };
globalThis.fetch = deny;
const report = {schemaVersion: 1, suite: 'configured-first-binding-acceptance', phase: 'observation',
  complete: false, cleanupComplete: false, sourceVerified: false, source: before.binding,
  setupSha256: sha(setupBytes), payloadFingerprint: setup.payloadFingerprint, profile: PROFILE,
  timingScope: 'Cold index import and real configured startKairo; startup already projects the first Wallet/Goal pair',
  limitations: ['noSync:true suppresses provider polling; ordinary mixed gate owns scheduler/load coverage',
    'First projection is included in configured startup, not separately instrumented',
    'First wire read includes local HTTP/client overhead', 'No browser, GPU, physical OBS or total OBS CPU claim',
    'Sparse fresh-process observations do not reopen the accepted lazy-formatter decision'],
  timings: {}, controls: [], environment: {node: process.version, cpu: cpus()[0]?.model,
    platform: process.platform, arch: process.arch}};
async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
  return port;
}
const timed = async (name, action) => {
  const start = performance.now(), value = await action();
  report.timings[name] = performance.now() - start;
  return value;
};
try {
  const port = await freePort(); let streamPort = await freePort();
  while (streamPort === port) streamPort = await freePort();
  const {startKairo} = await timed('coldIndexImportMs', () => import(pathToFileURL(join(root, 'server/index.mjs')).href));
  startupBegan = true;
  app = await timed('configuredStartKairoMs', () => startKairo({port, streamPort, dataDir: directory,
    noSync: true, fetcher: deny, combatFetcher: deny, sessionFeedFetcher: deny,
    markets: {historyFetcher: deny}, universe: {feeds: {fetcher: deny}}, datasets: {fetcher: deny}, deferDatasetStart: true}));
  startupReturned = true;
  // No updateBindings/save/projection call may precede this first observation.
  const firstBytes = await timed('firstStreamHTTPReadMs', async () => {
    const response = await nativeFetch(app.streamOrigin + '/state', {signal: AbortSignal.timeout(5000)});
    assert.equal(response.status, 200);
    return await response.text();
  });
  report.timings.coldImportConfiguredStartupMs = report.timings.coldIndexImportMs + report.timings.configuredStartKairoMs;
  report.timings.coldImportStartupFirstWireMs = report.timings.coldImportConfiguredStartupMs + report.timings.firstStreamHTTPReadMs;
  const first = JSON.parse(firstBytes), expected = expectedElements(setup.config);
  report.firstWire = first; report.firstWireBytes = Buffer.byteLength(firstBytes); report.firstWireSha256 = sha(firstBytes);
  assert.deepEqual(first.elements, expected, 'Persisted Wallet/Goal must already be formatted at first actual read');
  assert.equal(first.position, setup.config.position); assert.equal(first.muted, false); assert.equal(first.paused, false);
  assert.deepEqual(first.toasts, []);
  assert.equal(first.opsec.hidden, true);
  report.controls.push('Exact persisted Wallet/Goal output before any explicit projection or configuration update');
  report.warmUpdateBindingsMs = [];
  for (let index = 0; index < WARM_CALLS; index++) {
    const start = performance.now(); app.core.updateBindings();
    report.warmUpdateBindingsMs.push(performance.now() - start);
    assert.deepEqual(app.core.stream.state().elements, expected);
    await new Promise(setImmediate);
  }
  report.controls.push('All 100 warm real Core updateBindings calls preserve exact output');
  assert.deepEqual(app.core.stream.config(), setup.config, 'Observation must not change saved bindings');
  report.finalWire = app.core.stream.state();
  report.controls.push('Saved configuration preserved and both visible bindings retained');
  assert.equal(externalAttempts, 0);
} catch (error) { failure = error; report.error = error.stack; }
finally {
  try {
    assert.ok(!startupBegan || startupReturned,
      'startKairo rejected before returning its lifecycle owner; retain data rather than assume rollback completed');
    if (app) { await app.close(); app = null; }
    report.appClosed = true;
    await rm(directory, {recursive: true, force: false, maxRetries: 4, retryDelay: 100});
    try { await lstat(directory); throw Error('Synthetic data directory survived cleanup'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    report.cleanupComplete = true;
  } catch (error) { failure ||= error; report.cleanupError = error.stack; }
  try {
    const after = await sourceAt(root, manifestArg);
    assert.deepEqual(after.binding, before.binding);
    assert.equal(sha(await readFile(setupArg)), sha(setupBytes), 'Setup receipt changed during observation');
    report.sourceVerified = true;
  } catch (error) { failure ||= error; report.finalGuardError = error.stack; }
  report.externalAttempts = externalAttempts;
  if (externalAttempts) failure ||= Error('Observation attempted external transport');
  report.complete = !failure && report.cleanupComplete && report.sourceVerified;
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
}
if (failure) throw failure;
