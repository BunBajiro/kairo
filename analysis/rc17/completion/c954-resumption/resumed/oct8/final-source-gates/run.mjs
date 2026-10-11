// External final-source envelope. No application code is imported here.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile} from 'node:fs/promises';
import {finished} from 'node:stream/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {cpus} from 'node:os';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {observeOwnedGroup} from './ownership.mjs';
import {finalizeRowEvidence, verifyInventoriedRowEvidence} from './final-row-evidence.mjs';
import {loadSourceManifest, verifySource} from '../../../../../harness/source-manifest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rc17 = resolve(here, '../../../../..');
const analysis = dirname(rc17);
const RC16 = '57c8dcc7fbd8fc2b62129498d1819050c78381a1';
const SELECTED = 'c954c0d808847f249df0659ed15fdce2e89f84c4';
const EXCLUDED = '508f2d450c7cc17cc464cf316b80748367adc9e2';
const [configArg, outputArg, phase] = process.argv.slice(2);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const errorText = error => error?.stack || String(error);
const stamp = () => new Date().toISOString();
const sources = {}, manifestPaths = {}, sourceBytes = {};
const locks = [], rows = [], failures = [];
let config, configBytes, harnessBefore, destination, report, interruptedSignal;
const protectInt = () => { interruptedSignal ||= 'SIGINT'; if (report) report.interrupted = interruptedSignal; };
const protectTerm = () => { interruptedSignal ||= 'SIGTERM'; if (report) report.interrupted = interruptedSignal; };

async function save() {
  if (!report) return;
  await writeFile(join(destination, 'receipt.json.tmp'), JSON.stringify(report, null, 2) + '\n');
  await rename(join(destination, 'receipt.json.tmp'), join(destination, 'receipt.json'));
}

function integer(value, fallback, min, max, label) {
  value ??= fallback;
  assert.ok(Number.isSafeInteger(value) && value >= min && value <= max, label);
  return value;
}

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else { assert.ok(entry.isFile(), 'Unexpected non-file artifact: ' + path); files.push(path); }
  }
  return files.sort();
}

async function fingerprint(paths) {
  const files = [];
  for (const path of [...new Set(paths)].sort()) {
    const bytes = await readFile(path);
    files.push({path, bytes: bytes.length, sha256: sha(bytes)});
  }
  return {files, sha256: sha(JSON.stringify(files))};
}

async function harnessFiles() {
  // Preserve original workers and their static/dynamic literal relative imports.
  // Measured application imports are instead covered by full source manifests.
  const pending = [join(here, 'run.mjs'), join(here, 'contracts-worker.mjs'),
    join(here, 'README.md'), join(here, 'config.example.json'),
    join(here, 'ownership-bridge.py'), join(here, '../final-merged-frontend/ownership.py'),
    join(rc17, 'completion/startup/worker.mjs'), join(rc17, 'completion/atlas/worker.mjs'),
    join(analysis, 'rc16/harness/legacy/rc-database.mjs')];
  // These partial source excerpts are review evidence, never executable imports.
  // Bind their complete file set without trying to resolve their application imports.
  const seen = new Set(await filesBelow(join(here, 'reference')));
  while (pending.length) {
    const path = pending.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    if (!path.endsWith('.mjs')) continue;
    const text = await readFile(path, 'utf8');
    const patterns = [/(?:import|export)\s+(?:[^;]*?\s+from\s+)?['"](\.[^'"]+)['"]/g,
      /import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g];
    for (const pattern of patterns) for (const match of text.matchAll(pattern)) {
      const imported = resolve(dirname(path), match[1]);
      assert.ok(relative(analysis, imported).split(sep)[0] !== '..', 'Harness import escapes analysis tree');
      pending.push(imported);
    }
  }
  return [...seen].sort();
}

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 30000});
  assert.equal(result.error, undefined, 'Git execution error: ' + errorText(result.error));
  assert.equal(result.signal, null, 'Git terminated by signal');
  return result;
}

function lineage(root, candidate) {
  // Missing objects/shallow history and all statuses other than 0/1 are errors.
  for (const commit of [candidate, SELECTED, EXCLUDED]) {
    const object = git(root, ['cat-file', '-e', commit + '^{commit}']);
    assert.equal(object.status, 0, `Cannot resolve complete lineage object ${commit}: ${object.stderr}`);
  }
  const shallow = git(root, ['rev-parse', '--is-shallow-repository']);
  assert.equal(shallow.status, 0, shallow.stderr);
  assert.equal(shallow.stdout.trim(), 'false', 'Lineage requires a non-shallow checkout');
  const selected = git(root, ['merge-base', '--is-ancestor', SELECTED, candidate]);
  assert.ok(selected.status === 0 || selected.status === 1, 'Selected ancestry check failed: ' + selected.stderr);
  assert.equal(selected.status, 0, 'Final candidate must descend from selected build #54');
  const excluded = git(root, ['merge-base', '--is-ancestor', EXCLUDED, candidate]);
  assert.ok(excluded.status === 0 || excluded.status === 1, 'Excluded ancestry check failed: ' + excluded.stderr);
  assert.equal(excluded.status, 1, 'Excluded build #55 must not be an ancestor');
  return {selected: SELECTED, selectedStatus: selected.status, excluded: EXCLUDED, excludedStatus: excluded.status,
    nonShallow: true, caveat: 'Ancestry checks do not detect manually copied or cherry-picked excluded content; source review remains required.'};
}

async function guards() {
  assert.equal(sha(await readFile(resolve(configArg))), sha(configBytes), 'Configuration changed');
  assert.deepEqual(await fingerprint(await harnessFiles()), harnessBefore, 'Harness/file set changed');
  for (const [name, source] of Object.entries(sources)) {
    assert.equal(sha(await readFile(config[name + 'Manifest'])), sha(sourceBytes[name]), name + ' input manifest changed');
    assert.equal(sha(await readFile(manifestPaths[name])), sha(sourceBytes[name]), name + ' copied manifest changed');
    await verifySource(source);
  }
}

async function lockFile(path) {
  assert.equal(interruptedSignal, undefined, 'Run interrupted before lock acquisition');
  const handle = await open(path, 'a+');
  locks.push({path, handle});
  // flock and this process share one open file description via child fd 3.
  // The lock remains held after flock exits until this parent closes its handle.
  const outcome = await new Promise((done, reject) => {
    const child = spawn('flock', ['--exclusive', '--timeout', String(config.lockTimeoutSeconds), '3'],
      {stdio: ['ignore', 'pipe', 'pipe', handle.fd]});
    const stop = () => child.kill('SIGTERM');
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    let stderr = '';
    child.stderr.on('data', bytes => { stderr += bytes; });
    child.stdout.resume();
    child.once('error', error => { process.off('SIGINT', stop); process.off('SIGTERM', stop); reject(error); });
    child.once('close', (code, signal) => {
      process.off('SIGINT', stop); process.off('SIGTERM', stop);
      done({code, signal, stderr});
    });
  });
  report.locks.push({path, acquiredAt: stamp(), ...outcome, acquired: outcome.code === 0 && outcome.signal === null});
  await save();
  assert.equal(outcome.code, 0, 'Could not acquire lock: ' + path + ': ' + outcome.stderr);
  assert.equal(outcome.signal, null, 'Lock helper received a signal');
}

async function childProcess(args, row, env, timeoutMs) {
  const stdoutPath = join(row.directory, 'stdout.log'), stderrPath = join(row.directory, 'stderr.log');
  const stdout = createWriteStream(stdoutPath, {flags: 'wx'}), stderr = createWriteStream(stderrPath, {flags: 'wx'});
  // Attach completion handlers before spawn so stream failures cannot be unhandled.
  const streamResults = [finished(stdout).then(() => null, errorText), finished(stderr).then(() => null, errorText)];
  let child, timer, killTimer, spawnError;
  row.process = {command: [process.execPath, ...args], timeoutMs, launchedAt: stamp(), timedOut: false,
    terminationAttempts: [], exitCode: null, signal: null, closed: false};
  const terminate = signal => {
    if (!child?.pid) return;
    const attempt = {signal, at: stamp()};
    try { process.kill(-child.pid, signal); attempt.sent = true; }
    catch (error) { attempt.error = errorText(error); if (error.code !== 'ESRCH') spawnError ||= error; }
    row.process.terminationAttempts.push(attempt);
  };
  const groupState = async () => child?.pid ? observeOwnedGroup(child.pid) :
    {at: stamp(), exists: false, members: [], live: [], unknown: false};
  const needsDrain = state => state.unknown || state.live.length > 0;
  const waitForGroupDrain = async milliseconds => {
    const deadline = performance.now() + milliseconds;
    let state = await groupState();
    while (needsDrain(state) && performance.now() < deadline) { await delay(50); state = await groupState(); }
    return state;
  };
  const onStop = signal => {
    row.process.interrupted = signal;
    if (row.process.groupCleanupComplete) return;
    terminate('SIGTERM');
    killTimer ||= setTimeout(() => terminate('SIGKILL'), config.terminationGraceMs);
  };
  const onInt = () => onStop('SIGINT'), onTerm = () => onStop('SIGTERM');
  try {
    child = spawn(process.execPath, args, {cwd: here, env, detached: true, stdio: ['ignore', 'pipe', 'pipe']});
    row.process.pid = child.pid ?? null;
    child.stdout.pipe(stdout); child.stderr.pipe(stderr);
    process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
    timer = setTimeout(() => {
      row.process.timedOut = true;
      terminate('SIGTERM');
      killTimer ||= setTimeout(() => terminate('SIGKILL'), config.terminationGraceMs);
    }, timeoutMs);
    await new Promise(done => {
      child.once('error', error => { spawnError = error; });
      child.once('exit', (code, signal) => {
        row.process.exitObserved = {code, signal, at: stamp()};
      });
      // close waits for actual process exit AND inherited stdio handles to close.
      child.once('close', (code, signal) => {
        Object.assign(row.process, {exitCode: code, signal, closed: true, closedAt: stamp()});
        done();
      });
    });
  } finally {
    clearTimeout(timer); clearTimeout(killTimer); killTimer = null;
    // A leader can close cleanly while a detached descendant that inherited no
    // output pipe survives. Never equate leader close with group disposal.
    let state = await groupState();
    row.process.groupAfterClose = state;
    row.process.survivingGroupAfterClose = state.exists || state.unknown;
    if (needsDrain(state)) {
      terminate('SIGTERM');
      state = await waitForGroupDrain(config.terminationGraceMs);
      if (needsDrain(state)) {
        terminate('SIGKILL');
        state = await waitForGroupDrain(config.terminationGraceMs);
      }
    }
    // A live/uninspectable group keeps both locks and all temporary data. After
    // bounded termination attempts, save a visible blocked receipt and wait for
    // real disposal. Zombie-only groups cannot execute/write and fail the worker
    // receipt without hanging this envelope indefinitely waiting for external init.
    while (needsDrain(state)) {
      row.process.cleanupBlocked = true; row.process.groupPending = state;
      try { await save(); }
      catch (error) {
        // Receipt IO failure must never unwind and release locks around a live
        // worker. Preserve the error in memory/stderr and continue draining.
        row.process.blockedReceiptError = errorText(error);
        process.stderr.write('Cleanup remains blocked; receipt update failed: ' + errorText(error) + '\n');
      }
      await delay(1000);
      state = await groupState();
    }
    row.process.cleanupBlocked = false; row.process.groupFinal = state;
    row.process.groupCleanupComplete = true;
    clearTimeout(killTimer); killTimer = null;
    try {
      stdout.end(); stderr.end();
      row.logErrors = (await Promise.all(streamResults)).filter(Boolean);
      row.logs = await fingerprint([stdoutPath, stderrPath]);
      if (spawnError) row.process.error = errorText(spawnError);
    } finally {
      process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
    }
  }
  assert.equal(row.process.closed, true, 'No child close receipt');
  assert.equal(row.process.groupCleanupComplete, true, 'Child process group has not disappeared');
  assert.equal(row.process.survivingGroupAfterClose, false, 'Worker left a surviving process group; forced cleanup is not a passing worker');
  assert.equal(spawnError, undefined, 'Child spawn/termination failed: ' + errorText(spawnError));
  assert.deepEqual(row.logErrors, [], 'Child output logs failed');
  assert.equal(row.process.timedOut, false, 'Child timed out; actual exit was awaited');
  assert.equal(row.process.interrupted, undefined, 'Run interrupted');
  assert.equal(row.process.exitCode, 0, 'Child exited unsuccessfully; see stderr.log');
  assert.equal(row.process.signal, null, 'Child terminated by signal');
}

async function recordedPayload(directory, entry) {
  assert.ok(entry && typeof entry.path === 'string' && !isAbsolute(entry.path), 'Relative contract file path required');
  const path = await realpath(resolve(directory, entry.path));
  const inside = relative(await realpath(directory), path);
  assert.ok(inside && inside.split(sep)[0] !== '..' && !isAbsolute(inside), 'Contract artifact escapes arm output');
  const bytes = await readFile(path);
  assert.equal(bytes.length, entry.bytes, 'Contract artifact byte count differs');
  assert.equal(sha(bytes), entry.sha256, 'Contract artifact hash differs');
  return JSON.parse(bytes);
}

const semantics = new Map();
let commonContracts, contractFixture, databaseContract;
function sameSemantic(key, value) {
  if (semantics.has(key)) assert.deepEqual(value, semantics.get(key), key + ' differs');
  else semantics.set(key, value);
}

async function validate(job, row) {
  const source = sources[job.arm];
  let result;
  if (job.phase === 'startup') {
    result = JSON.parse(await readFile(join(row.directory, 'stdout.log'), 'utf8'));
    assert.equal(result.complete, true); assert.equal(result.endVerified, true);
    assert.equal(result.networkAttempts, 0); assert.equal(result.mode, 'timing'); assert.equal(result.lane, job.lane);
    assert.equal(result.forcedGC, false); assert.equal(result.instrumentedCounters, false);
    assert.equal(result.source.commit, source.sourceCommit); assert.equal(result.source.fingerprint, source.fingerprint);
    assert.equal(result.source.manifestSha256, sha(sourceBytes[job.arm])); assert.equal(result.source.dirty, false);
    for (const [key, value] of Object.entries(result.semantic)) sameSemantic(job.lane + '/' + key, value);
    assert.ok(Object.keys(result.semantic).length > 0);
    const cumulative = job.lane === 'core' ? 'coldImportConstructionFirstMarketMs' : 'coldImportFirstFormattedPairMs';
    assert.ok(Number.isFinite(result.timings[cumulative]), 'Within-worker cumulative first use missing');
    row.metrics = flattenMetrics(result.timings);
  } else if (job.phase === 'contracts') {
    result = JSON.parse(await readFile(join(row.directory, 'output/result.json'), 'utf8'));
    assert.equal(result.schemaVersion, 1); assert.equal(result.complete, true);
    assert.equal(result.cleanupComplete, true); assert.equal(result.sourceVerified, true); assert.equal(result.externalAttempts, 0);
    assert.equal(result.source.commit, source.sourceCommit); assert.equal(result.source.fingerprint, source.fingerprint); assert.equal(result.source.dirty, false);
    assert.equal(result.role, job.arm); assert.equal(result.diagnosticOnly, true); assert.equal(result.timingClaims, false);
    assert.equal(result.fixture.fixedTime, '2026-09-30T09:00:00.000Z');
    assert.equal(result.fixture.originalWorkloadInputsRetained, true);
    assert.deepEqual(result.fixture.routeShapes, [
      {visits: 100, pilots: 1, olderVisits: 0}, {visits: 1000, pilots: 1, olderVisits: 0},
      {visits: 10000, pilots: 1, olderVisits: 0}, {visits: 100, pilots: 1, olderVisits: 10000},
      {visits: 1000, pilots: 4, olderVisits: 0},
    ]);
    assert.deepEqual(Object.keys(result.fixture.backendProfiles).sort(), ['stress', 'typical']);
    for (const value of Object.values(result.fixture.backendProfiles)) assert.match(value, /^[0-9a-f]{64}$/);
    const raw = await recordedPayload(join(row.directory, 'output'), result.files.rawContracts);
    const common = await recordedPayload(join(row.directory, 'output'), result.files.commonContracts);
    assert.deepEqual(Object.keys(raw.reports).sort(), ['stress', 'typical']);
    assert.equal(raw.routes.length, 5);
    assert.equal(raw.routes.reduce((sum, shape) => sum + shape.pilots.length, 0), 8);
    const expectedNormalization = [];
    for (const [profile, events, visits] of [['typical', 10000, 300], ['stress', 50000, 2000]]) {
      const offsets = [0, 100, events - 100, events];
      assert.deepEqual(Object.keys(raw.reports[profile]).sort(), offsets.map(String).sort());
      if (job.arm === 'candidate') for (const offset of offsets) expectedNormalization.push({
        path: `reports.${profile}.${offset}.visits[*].session_id`, operation: 'remove asserted-null additive candidate column', rows: visits,
      });
    }
    assert.deepEqual(result.normalization, expectedNormalization, 'Normalization allowlist differs');
    assert.ok(result.controls.some(control => control.name === 'full-route-fields' && control.shapes === 5 && control.pilotsCompared === 8));
    const owner = result.controls.find(control => control.name === 'candidate-explicit-ownership');
    if (job.arm === 'candidate') {
      assert.ok(owner, 'Missing candidate ownership control');
      assert.deepEqual(owner.eventIds, [1, 3, 5, 6]); assert.deepEqual(owner.rawVisitIds, [1, 2, 5]); assert.deepEqual(owner.routeIds, ['start', 1, 2]);
      for (const flag of ['missingOwnerIsLegacy', 'explicitNullExcluded', 'foreignOwnerExcluded', 'foreignPilotExcluded',
        'lateOwnedEndAccepted', 'occurrenceEndKillExcluded', 'endCursorApplied', 'noComparisonNormalization']) assert.equal(owner[flag], true);
      await recordedPayload(join(row.directory, 'output'), result.files.candidateOwnership);
    } else { assert.equal(owner, undefined); assert.equal(result.files.candidateOwnership, undefined); }
    // The worker asserts/removes only candidate legacy visits.session_id === null.
    // There is no additional runner normalization or partial field projection.
    if (commonContracts !== undefined) assert.deepEqual(common, commonContracts, 'Complete common contracts differ');
    else commonContracts = common;
    if (contractFixture !== undefined) assert.deepEqual(result.fixture, contractFixture, 'Contract fixtures differ');
    else contractFixture = result.fixture;
    row.contractFiles = result.files; row.controls = result.controls; row.fixture = result.fixture;
  } else {
    result = JSON.parse(await readFile(join(row.directory, 'output/database.json'), 'utf8'));
    assert.equal(result.schemaVersion, 1); assert.equal(result.complete, true); assert.equal(result.suite, 'rc-database');
    assert.equal(result.application, source.sourceCommit);
    const contract = {fixedTime: result.fixedTime, before: result.before, after: result.after,
      agedImportBytes: result.agedImports.responseBytes, agedImportHash: result.agedImports.outputHash,
      historyWriteHash: result.historyWrite.outputHash};
    if (databaseContract !== undefined) assert.deepEqual(contract, databaseContract, 'Original database outputs differ');
    else databaseContract = contract;
    row.metrics = {firstOpenMs: result.firstOpenMs, agedImportsP50Ms: result.agedImports.ms.p50,
      agedImportsMaxMs: result.agedImports.ms.max, eventInsertP50Ms: result.eventInsert.ms.p50,
      eventInsertMaxMs: result.eventInsert.ms.max, historyWriteP50Ms: result.historyWrite.ms.p50,
      historyWriteMaxMs: result.historyWrite.ms.max, historyWriteBlockP50Ms: result.historyWrite.synchronousBlockMs.p50,
      historyWriteBlockMaxMs: result.historyWrite.synchronousBlockMs.max,
      eventIndexBytes: result.eventIndexBytes, workingHistoryJsonBytes: result.after.historyJsonBytes};
    row.databaseContract = contract;
  }
  row.result = result;
}

function flattenMetrics(timings) {
  const metrics = {};
  for (const [name, value] of Object.entries(timings)) {
    if (typeof value === 'number') metrics[name] = value;
    else for (const suffix of ['p50', 'p95', 'max']) if (value[suffix] !== undefined) metrics[name + '.' + suffix] = value[suffix];
  }
  for (const value of Object.values(metrics)) assert.ok(Number.isFinite(value) && value >= 0, 'Invalid timing value');
  return metrics;
}

async function runJob(job) {
  assert.equal(interruptedSignal, undefined, 'Run interrupted before next child');
  const name = [job.phase, job.lane || 'full', job.cycle, job.position, job.arm].join('-');
  const directory = join(destination, name), tempDirectory = join(directory, 'tmp');
  const row = {...job, name, directory, complete: false, cleanupComplete: false, preVerified: false, postVerified: false};
  rows.push(row); await save();
  try {
    await mkdir(directory); await mkdir(tempDirectory); await mkdir(join(directory, 'output'));
    await guards(); row.preVerified = true; await save();
    const source = sources[job.arm];
    const env = {...process.env, TMPDIR: tempDirectory, TMP: tempDirectory, TEMP: tempDirectory};
    // Keep ordinary children free of inherited profiler/coverage injection.
    delete env.NODE_OPTIONS; delete env.NODE_V8_COVERAGE;
    let args;
    if (job.phase === 'startup') {
      const worker = job.lane === 'core' ? 'completion/startup/worker.mjs' : 'completion/atlas/worker.mjs';
      args = [join(rc17, worker), source.root, manifestPaths[job.arm], job.lane, 'timing'];
    } else if (job.phase === 'contracts') {
      args = [join(here, 'contracts-worker.mjs'), source.root, manifestPaths[job.arm], join(directory, 'output'), job.arm];
    } else {
      args = [join(analysis, 'rc16/harness/legacy/rc-database.mjs'), source.root, join(directory, 'output')];
      Object.assign(env, {KAIRO_PERF_APP_ROOT: sources.baseline.root, KAIRO_PERF_SEED_LEGACY: '1', KAIRO_PERF_APP_REF: source.sourceCommit});
      row.seed = {root: sources.baseline.root, commit: RC16, legacyStore: true};
    }
    await childProcess(args, row, env, config.timeoutsMs[job.phase]);
    await validate(job, row);
    row.childValidated = true;
  } catch (error) { row.error = errorText(error); }
  finally {
    // Cleanup and provenance checks are independent: either may fail without
    // suppressing the other's receipt, including a child timeout/parse failure.
    try {
      assert.ok(!row.process || row.process.groupCleanupComplete === true,
        'Process group cleanup is unconfirmed; preserve its temporary data rather than delete beneath a surviving worker');
      row.tempEntriesAfterExit = await readdir(tempDirectory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      await rm(tempDirectory, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
      await stat(tempDirectory).then(() => { throw Error('Temporary directory remains'); }, error => { if (error.code !== 'ENOENT') throw error; });
      row.cleanupComplete = true;
    } catch (error) { row.cleanupError = errorText(error); }
    try { await guards(); row.postVerified = true; }
    catch (error) { row.postVerifyError = errorText(error); }
    row.complete = row.childValidated === true && row.cleanupComplete && row.postVerified && !row.error;
    row.finishedAt = stamp(); await save();
  }
  assert.equal(row.complete, true, name + ' failed; full receipt/logs retained');
}

function comparisons() {
  const groups = {};
  for (const row of rows.filter(row => row.complete && row.metrics)) (groups[row.phase + '/' + row.lane] ||= []).push(row);
  const summary = {};
  for (const [group, members] of Object.entries(groups)) {
    const metrics = {};
    for (const metric of Object.keys(members[0].metrics)) {
      const baseline = members.filter(row => row.arm === 'baseline'), candidate = members.filter(row => row.arm === 'candidate');
      assert.equal(baseline.length, candidate.length);
      const timeMetric = /Ms(?:\.|$)/.test(metric);
      const pairs = baseline.map(base => {
        const candidatePosition = base.position === 1 ? 2 : 3;
        const trial = candidate.find(row => row.cycle === base.cycle && row.position === candidatePosition);
        assert.ok(trial, 'Missing ABBA pair');
        const a = base.metrics[metric], b = trial.metrics[metric];
        assert.ok(Number.isFinite(a) && Number.isFinite(b), 'Missing numeric metric');
        const delta = b - a, percent = a === 0 ? null : (b / a - 1) * 100;
        return {cycle: base.cycle, baseline: base.name, candidate: trial.name, a, b, delta, percent,
          adverseOver1MsAnd10Percent: timeMetric && delta > 1 && percent !== null && percent > 10};
      });
      const cycles = [...new Set(pairs.map(pair => pair.cycle))].map(cycle => {
        const cyclePairs = pairs.filter(pair => pair.cycle === cycle);
        assert.equal(cyclePairs.length, 2, 'Each ABBA cycle must retain both pairs');
        return {cycle, pairs: cyclePairs,
          bothPairsAdverseOver1MsAnd10Percent: cyclePairs.every(pair => pair.adverseOver1MsAnd10Percent)};
      });
      const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
      const a = mean(pairs.map(pair => pair.a)), b = mean(pairs.map(pair => pair.b));
      metrics[metric] = {baseline: pairs.map(pair => pair.a), candidate: pairs.map(pair => pair.b),
        meanBaseline: a, meanCandidate: b, meanDelta: b - a, meanPercent: a === 0 ? null : (b / a - 1) * 100,
        pairs, cycles, allPairsAdverseOver1MsAnd10Percent: pairs.every(pair => pair.adverseOver1MsAnd10Percent)};
    }
    summary[group] = metrics;
  }
  return summary;
}

try {
  assert.ok(configArg && outputArg, 'Usage: node run.mjs <config.json> <unique-output-dir> <startup|contracts|database|all>');
  destination = resolve(outputArg);
  // This is intentionally non-recursive: an existing attempt is never reused.
  await mkdir(destination);
  report = {schemaVersion: 1, phase, startedAt: stamp(), complete: false, endVerified: false, cleanupComplete: false,
    preparedHarness: true, performanceAcceptance: false, scope: 'Final-source startup components, complete domain contracts, original database rows only; not whole RC17 closure.',
    configPath: resolve(configArg), output: destination, sources, locks: [], rows, failures,
    environment: {node: process.version, sqlite: process.versions.sqlite, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, logicalCpus: cpus().length},
    artifactManifest: 'artifacts.json'};
  await save();
  // Keep finalization alive for receipts/lock disposal even after repeated stops.
  // Active-child handlers additionally terminate the owned process group.
  process.on('SIGINT', protectInt); process.on('SIGTERM', protectTerm);
  assert.ok(['startup', 'contracts', 'database', 'all'].includes(phase), 'Unknown phase');
  assert.equal(process.platform, 'linux', 'This flock/process-group envelope requires Linux');
  assert.deepEqual(process.execArgv, [], 'Run without Node profiler/heap/loader flags');
  assert.ok(!process.env.NODE_OPTIONS && !process.env.NODE_V8_COVERAGE, 'Unset inherited Node instrumentation');
  configBytes = await readFile(resolve(configArg));
  await writeFile(join(destination, 'config.json'), configBytes, {flag: 'wx'});
  report.config = {bytes: configBytes.length, sha256: sha(configBytes)};
  config = JSON.parse(configBytes);
  assert.equal(config.schemaVersion, 1); assert.equal(config.requireBuilt, true);
  assert.match(config.candidateCommit, /^[0-9a-f]{40}$/, 'Pin final candidate full lowercase SHA');
  assert.notEqual(config.candidateCommit, EXCLUDED); assert.notEqual(config.candidateCommit, RC16);
  config.startupCycles = integer(config.startupCycles, 3, 1, 10, 'startupCycles 1..10');
  config.databaseCycles = integer(config.databaseCycles, 1, 1, 10, 'databaseCycles 1..10');
  config.lockTimeoutSeconds = integer(config.lockTimeoutSeconds, 600, 1, 3600, 'lockTimeoutSeconds 1..3600');
  config.terminationGraceMs = integer(config.terminationGraceMs, 5000, 1000, 30000, 'terminationGraceMs 1000..30000');
  config.timeoutsMs ||= {};
  for (const [name, fallback] of Object.entries({startup: 120000, contracts: 600000, database: 1200000}))
    config.timeoutsMs[name] = integer(config.timeoutsMs[name], fallback, 1000, 3600000, name + ' timeout 1000..3600000');
  for (const name of ['baseline', 'candidate']) {
    assert.equal(typeof config[name + 'Manifest'], 'string');
    config[name + 'Manifest'] = resolve(dirname(resolve(configArg)), config[name + 'Manifest']);
  }
  report.settings = {startupCycles: config.startupCycles, databaseCycles: config.databaseCycles, timeoutsMs: config.timeoutsMs,
    lockTimeoutSeconds: config.lockTimeoutSeconds, terminationGraceMs: config.terminationGraceMs};
  await lockFile('/tmp/kairo-performance.lock');
  await lockFile('/tmp/kairo-rc16-benchmark.lock');
  harnessBefore = await fingerprint(await harnessFiles());
  report.harnessBefore = harnessBefore;
  const harnessHead = git(dirname(analysis), ['rev-parse', 'HEAD']);
  const harnessStatus = git(dirname(analysis), ['status', '--porcelain', '--untracked-files=all']);
  assert.equal(harnessHead.status, 0, harnessHead.stderr); assert.equal(harnessStatus.status, 0, harnessStatus.stderr);
  report.analysisCheckout = {root: dirname(analysis), commit: harnessHead.stdout.trim(), status: harnessStatus.stdout,
    dirty: !!harnessStatus.stdout, informational: true, authoritativeHarnessBinding: harnessBefore.sha256};
  for (const name of ['baseline', 'candidate']) {
    sourceBytes[name] = await readFile(config[name + 'Manifest']);
    const source = await loadSourceManifest(config[name + 'Manifest']);
    assert.equal(source.requireClean, true); assert.equal(source.dirty, false); assert.equal(source.status, '');
    const expected = name === 'baseline' ? RC16 : config.candidateCommit;
    assert.equal(source.sourceCommit, expected); assert.equal(source.expectedCommit, expected);
    assert.ok(source.builtFiles.length > 0, 'Fresh compiled assets must be manifest-bound');
    sources[name] = source;
    manifestPaths[name] = join(destination, name + '-source.json');
    await writeFile(manifestPaths[name], sourceBytes[name], {flag: 'wx'});
  }
  assert.notEqual(sources.baseline.root, sources.candidate.root, 'Distinct fixed source trees required');
  report.lineage = lineage(sources.candidate.root, config.candidateCommit);
  for (const path of ['server/data/universe.json.gz', 'server/data/market-categories.json']) {
    const a = sources.baseline.files.find(file => file.path === path), b = sources.candidate.files.find(file => file.path === path);
    assert.ok(a?.sha256 && b?.sha256, 'Missing common fixture ' + path); assert.equal(a.sha256, b.sha256, 'Common fixture differs: ' + path);
  }
  const jobs = [];
  function abba(selectedPhase, lane, cycles) {
    for (let cycle = 1; cycle <= cycles; cycle++) for (const [offset, arm] of ['baseline', 'candidate', 'candidate', 'baseline'].entries())
      jobs.push({phase: selectedPhase, lane, cycle, position: offset + 1, arm});
  }
  if (phase === 'startup' || phase === 'all') for (const lane of ['core', 'format']) abba('startup', lane, config.startupCycles);
  if (phase === 'contracts' || phase === 'all') for (const [offset, arm] of ['baseline', 'candidate'].entries()) jobs.push({phase: 'contracts', lane: 'full', cycle: 1, position: offset + 1, arm});
  if (phase === 'database' || phase === 'all') abba('database', 'original', config.databaseCycles);
  report.jobs = jobs; await guards(); await save();
  for (const job of jobs) await runJob(job);
  report.summary = comparisons();
  report.semanticDigests = Object.fromEntries(semantics);
  await guards(); report.endVerified = true;
  report.complete = rows.length === jobs.length && rows.every(row => row.complete);
} catch (error) {
  failures.push({stage: 'run', error: errorText(error), at: stamp()});
  if (!report) process.stderr.write(errorText(error) + '\n');
  process.exitCode = 1;
} finally {
  if (report) {
    if (interruptedSignal) failures.push({stage: 'interrupted', signal: interruptedSignal});
    // Capture independent final provenance results even if preparation failed.
    if (configBytes) try {
      report.configAfter = await fingerprint([resolve(configArg), join(destination, 'config.json')]);
      assert.ok(report.configAfter.files.every(file => file.sha256 === sha(configBytes)), 'Config changed');
    } catch (error) { failures.push({stage: 'final-config', error: errorText(error)}); }
    if (harnessBefore) try {
      report.harnessAfter = await fingerprint(await harnessFiles());
      assert.deepEqual(report.harnessAfter, harnessBefore, 'Harness changed');
    } catch (error) { failures.push({stage: 'final-harness', error: errorText(error)}); }
    report.sourceAfter = {};
    for (const [name, source] of Object.entries(sources)) try {
      const checked = await verifySource(source);
      const manifests = await fingerprint([config[name + 'Manifest'], manifestPaths[name]]);
      assert.ok(manifests.files.every(file => file.sha256 === sha(sourceBytes[name])), name + ' manifest changed');
      report.sourceAfter[name] = {verified: true, commit: checked.sourceCommit, fingerprint: checked.fingerprint, manifests};
    } catch (error) { report.sourceAfter[name] = {verified: false, error: errorText(error)}; failures.push({stage: 'final-source-' + name, error: errorText(error)}); }
  }
  // Final receipt serialization and recursive artifact IO stay inside the locks.
  // That receipt is immutable once inventoried. Only the small, separate release
  // receipt below is written after unlocking, so it cannot change its own input hash.
  const release = {schemaVersion: 1, complete: false, evidenceComplete: false, evidence: null,
    releases: [], errors: [], excludedFromArtifactInventory: true};
  if (report) {
    if (interruptedSignal && !failures.some(item => item.stage === 'interrupted')) failures.push({stage: 'interrupted', signal: interruptedSignal});
    // Recheck retained child bytes and cleanup at final receipt time. A prior
    // per-row pass cannot establish that later files still match its evidence.
    try { await finalizeRowEvidence(report); }
    catch (error) {
      failures.push({stage: 'final-row-evidence', error: errorText(error)});
      report.finalRowEvidence = {complete: false, temporaryDataAbsent: false, error: errorText(error)};
      report.complete = false;
    }
    report.cleanupComplete = rows.every(row => row.cleanupComplete) && report.finalRowEvidence.temporaryDataAbsent;
    report.complete = report.complete && failures.length === 0 && report.cleanupComplete;
    report.finishedAt = stamp();
    report.finalization = {heldLocks: report.locks.filter(lock => lock.acquired).map(lock => lock.path),
      releaseReceipt: 'lock-release.json', releaseReceiptExcludedFromArtifactInventory: true,
      cleanupCompleteScope: 'Worker process groups and temporary data; lock release is recorded separately.'};
    try {
      await save();
      const artifactPaths = () => filesBelow(destination).then(paths => paths.filter(path =>
        path !== join(destination, 'artifacts.json') && path !== join(destination, 'lock-release.json')));
      let artifacts = await fingerprint(await artifactPaths());
      const finalRowEvidence = await verifyInventoriedRowEvidence(report, artifacts);
      if (!finalRowEvidence.complete) {
        // Preserve the fault and damaged raw bytes, then bind the failed receipt.
        // A failed attempt never becomes passing by adopting the new file hashes.
        await save();
        artifacts = await fingerprint(await artifactPaths());
      }
      const artifactBytes = Buffer.from(JSON.stringify({schemaVersion: 1, complete: report.complete, finalRowEvidence, ...artifacts}, null, 2) + '\n');
      await writeFile(join(destination, 'artifacts.json'), artifactBytes, {flag: 'wx'});
      const receipt = artifacts.files.find(file => file.path === join(destination, 'receipt.json'));
      assert.ok(receipt, 'Final receipt is missing from the artifact inventory');
      release.evidence = {receipt: {path: 'receipt.json', bytes: receipt.bytes, sha256: receipt.sha256},
        artifacts: {path: 'artifacts.json', bytes: artifactBytes.length, sha256: sha(artifactBytes)}};
      release.evidenceComplete = report.complete;
    } catch (error) {
      release.errors.push({stage: 'final-artifacts', error: errorText(error)});
      report.complete = false;
      failures.push({stage: 'final-artifacts', error: errorText(error)});
      try { await save(); }
      catch (saveError) { release.errors.push({stage: 'failed-receipt', error: errorText(saveError)}); }
      process.stderr.write('Final artifact write failed: ' + errorText(error) + '\n'); process.exitCode = 1;
    }
  }
  for (const {path, handle} of [...locks].reverse()) try {
    await handle.close();
    release.releases.push({path, closed: true, at: stamp()});
  } catch (error) { release.errors.push({stage: 'unlock', path, error: errorText(error)}); }
  if (report) {
    release.interrupted = interruptedSignal || null;
    release.complete = release.evidenceComplete && release.errors.length === 0 && !interruptedSignal;
    release.finishedAt = stamp();
    try {
      await writeFile(join(destination, 'lock-release.json'), JSON.stringify(release, null, 2) + '\n', {flag: 'wx'});
    } catch (error) {
      release.complete = false;
      process.stderr.write('Lock release receipt write failed: ' + errorText(error) + '\n');
    }
    if (!release.complete) process.exitCode = 1;
    process.stdout.write(JSON.stringify({output: destination, complete: release.complete, rows: rows.length,
      failures: failures.length + release.errors.length, releaseReceipt: 'lock-release.json'}) + '\n');
  }
  process.off('SIGINT', protectInt); process.off('SIGTERM', protectTerm);
}
