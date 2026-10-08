// Ordinary persistence timings only. Parent owns both runtime exclusion and ABBA.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, mkdtemp, copyFile, rm} from 'node:fs/promises';
import {join, dirname, resolve} from 'node:path';
import {tmpdir, cpus} from 'node:os';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import {syncBuiltinESMExports} from 'node:module';
import {loadSourceManifest, verifySource} from '../../../../../harness/source-manifest.mjs';
import {BASE_COMMIT, AT, STAMP, EXPIRY, configs, hash, modules, connect, authoritative,
    storage, checkpoint, seedFixture} from './persistence-fixtures.mjs';

assert.equal(process.env.KAIRO_M9_MATCHED_LOCK_HELD, '1', 'Exclusive slot must be held by matched parent');
const [baselinePath, armPath, outputPath, seedDirectory, mode = 'measure'] = process.argv.slice(2);
assert.ok(baselinePath && armPath && outputPath && seedDirectory,
    'baseline-manifest arm-manifest output.json shared-seed-directory [measure|seed-only]');
assert.ok(['measure', 'seed-only'].includes(mode));
const output = resolve(outputPath), seeds = resolve(seedDirectory);
const baseline = await loadSourceManifest(baselinePath), arm = await loadSourceManifest(armPath);
assert.equal(baseline.sourceCommit, BASE_COMMIT); assert.equal(baseline.dirty, false);
const repeats = Number(process.env.KAIRO_M9_PERSISTENCE_REPEATS || '2');
assert.ok(Number.isInteger(repeats) && repeats >= 1 && repeats <= 5);
const self = fileURLToPath(import.meta.url), helper = fileURLToPath(new URL('./persistence-fixtures.mjs', import.meta.url));
const guardFiles = [self, helper, fileURLToPath(new URL('../../../../../harness/source-manifest.mjs', import.meta.url))];
const harness = await Promise.all(guardFiles.map(async path => ({path, sha256: hash(await readFile(path))})));
const harnessFingerprint = hash(JSON.stringify(harness));
let external = 0;
const block = () => { external++; throw new Error('External IO forbidden in persistence workload'); };
const deny = async () => block();
globalThis.fetch = deny;
http.request = http.get = https.request = https.get = block;
net.connect = net.createConnection = tls.connect = block;
net.Socket.prototype.connect = block;
syncBuiltinESMExports();

const result = {schemaVersion: 1, startedAt: new Date().toISOString(), complete: false, mode,
    baseline: {commit: baseline.sourceCommit, fingerprint: baseline.fingerprint},
    source: {commit: arm.sourceCommit, fingerprint: arm.fingerprint}, harness, harnessFingerprint,
    environment: {node: process.version, cpu: cpus()[0]?.model, platform: process.platform}, repeats,
    performanceAcceptance: false, cases: [],
    limitations: [
        'Synthetic bounded supported documents; real populated user-database startup remains a separate gate.',
        'Cold first installation means fresh copied database with no side table; OS page cache is not cold and module import is excluded.',
        'Services use production Auth and SQLite; provider/socket IO is blocked, no traffic, UI or HTTP latency is measured.',
        'Only synchronous operation wall time and process CPU are timed. File copies, fixture construction, hashes, assertions and storage queries are outside timings.',
        'maxRSS is cumulative process high water (KiB on this Linux host), not per-operation peak or retained-memory proof; samples also record ordinary before/after memory.',
        'No forced GC, heap sampling, VACUUM, timing-path JSON instrumentation or synthetic timer scheduling is applied.',
        'SQL write windows use actual changed full bodies and ordinary autocommit; durability settings remain openStore defaults.',
        'One write/one summary is measured explicitly; no production polling or read/write ratio is assumed.',
        'API mutations use real random UUIDs. Exact authoritative hashes are retained; UUID-normalized output hashes are supplementary and cannot replace semantic guards.',
        'Seed documents must contain zero UUIDs. Normalization thereafter changes only generated version-4 UUID spelling, preserving repeated-ID relationships and all remaining serialized data.',
        'Lock contention/duration under concurrent readers or writers and background tracking updates are not measured by this exclusive-worker lane.',
    ]};

function measured(fn) {
    const memoryBefore = process.memoryUsage(), maxRssKiBBefore = process.resourceUsage().maxRSS;
    const cpu = process.cpuUsage(), start = performance.now();
    const value = fn();
    const elapsedMs = performance.now() - start, used = process.cpuUsage(cpu);
    const memoryAfter = process.memoryUsage(), maxRssKiBAfter = process.resourceUsage().maxRSS;
    return {value, metrics: {elapsedMs, cpuUserMs: used.user / 1000, cpuSystemMs: used.system / 1000,
        memoryBefore, memoryAfter, maxRssKiBBefore, maxRssKiBAfter}};
}

function normalizedOutput(value) {
    // Only process-generated UUID spelling is replaced; relationship equality and
    // every other field are retained. Each output has its own encounter-order map.
    const ids = new Map();
    const text = JSON.stringify(value).replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g, id => {
        if (!ids.has(id)) ids.set(id, `generated-uuid-${ids.size}`);
        return ids.get(id);
    });
    return {exactSha256: hash(JSON.stringify(value)), uuidNormalizedSha256: hash(text), normalizedUUIDs: ids.size,
        bytes: Buffer.byteLength(JSON.stringify(value))};
}

function totalChanges(db) { return Number(db.prepare('SELECT total_changes() AS n').get().n); }

async function phase(run, name, count, call, check) {
    run.entry.incompletePhase = name;
    const before = await storage(run.store.db, run.directory), changesBefore = totalChanges(run.store.db);
    const observation = measured(call);
    check?.(observation.value);
    const after = await storage(run.store.db, run.directory);
    const entry = {name, count, ...observation.metrics,
        databaseChanges: totalChanges(run.store.db) - changesBefore, storageBefore: before, storageAfter: after,
        authoritative: authoritative(run.store.db), output: normalizedOutput(observation.value)};
    run.entry.phases.push(entry);
    delete run.entry.incompletePhase;
    return observation.value;
}

async function close(run) {
    if (!run.store) return;
    await run.service?.close(); run.service = null;
    run.store.close(); run.store = null;
}

function comparableAuthority(value) {
    const {sha256, ...rest} = value;
    return value.normalizedUUIDs ? rest : value;
}

function comparableOutput(value) {
    const {exactSha256, ...rest} = value;
    return value.normalizedUUIDs ? rest : value;
}

function parity(entry) {
    return {id: entry.id, fixtureDatabaseSha256: entry.fixture.databaseSha256,
        fixtureInputSha256: entry.fixture.inputSha256, initialAuthoritative: entry.fixture.authoritative,
        samples: entry.samples.map(sample => ({repeat: sample.repeat,
            firstOpenAuthoritative: sample.firstOpen.authoritative, reopenAuthoritative: sample.reopen.authoritative,
            phases: sample.phases.map(row => ({name: row.name, count: row.count,
                authoritative: comparableAuthority(row.authoritative), output: comparableOutput(row.output)})),
            finalAuthoritative: comparableAuthority(sample.finalAuthoritative), finalSummary: comparableOutput(sample.finalSummary)}))};
}

await mkdir(dirname(output), {recursive: true});
const scratch = mode === 'measure' ? await mkdtemp(join(tmpdir(), 'kairo-m9-persistence-')) : null;
try {
    // Seed-only child constructs baseline; all measured arms import only their own
    // source and consume the same immutable, previously closed database bytes.
    const api = await modules(mode === 'seed-only' ? baseline : arm);
    for (const config of configs) {
        const seed = join(seeds, config.id);
        if (mode === 'measure') await readFile(join(seed, 'fixture.json'), 'utf8');
        const fixture = await seedFixture(mode === 'seed-only' ? api : null, baseline, seed, config, harnessFingerprint, deny);
        assert.equal(fixture.authoritative.normalizedUUIDs, 0, 'Seed must have no identifiers hidden by UUID normalization');
        if (mode === 'seed-only') { result.cases.push({id: config.id, config, fixture}); continue; }
        const entry = {id: config.id, config, fixture: {databaseSha256: fixture.databaseSha256, inputSha256: fixture.inputSha256,
            authoritative: fixture.authoritative, storage: fixture.storage, inputs: fixture.inputs}, samples: []};
        result.cases.push(entry);
        for (let repeat = 0; repeat < repeats; repeat++) {
            const directory = join(scratch, config.id + '-' + repeat);
            await mkdir(directory);
            await copyFile(join(seed, 'kairo.sqlite'), join(directory, 'kairo.sqlite'));
            assert.equal(hash(await readFile(join(directory, 'kairo.sqlite'))), fixture.databaseSha256);
            const clock = {value: AT}, sample = {repeat, phases: [], initialFileSha256: fixture.databaseSha256};
            entry.samples.push(sample);
            const run = {directory, clock, entry: sample, store: null, service: null};
            try {
                const first = measured(() => connect(api, directory, clock, deny));
                Object.assign(run, first.value);
                result.environment.sqlite ||= run.store.db.prepare('SELECT sqlite_version() AS version').get().version;
                assert.deepEqual(authoritative(run.store.db), fixture.authoritative, 'Installation changed authoritative documents');
                sample.firstOpen = {...first.metrics, authoritative: authoritative(run.store.db), storage: await storage(run.store.db, directory)};
                assert.deepEqual(run.service.jspace.summaries(42), fixture.summary, 'Initial descriptor parity');
                sample.firstOpen.checkpoint = checkpoint(run.store.db);
                sample.firstOpen.afterCheckpoint = await storage(run.store.db, directory);
                await close(run);
                const reopen = measured(() => connect(api, directory, clock, deny));
                Object.assign(run, reopen.value);
                assert.deepEqual(authoritative(run.store.db), fixture.authoritative, 'Reopen changed authoritative documents');
                sample.reopen = {...reopen.metrics, authoritative: authoritative(run.store.db), storage: await storage(run.store.db, directory)};
                assert.deepEqual(run.service.jspace.summaries(42), fixture.summary, 'Reopen descriptor parity');
                const db = run.store.db, raw = db.prepare("SELECT body FROM universe_records WHERE character_id=42 AND kind='jspace_map' AND id=?");
                const update = db.prepare("UPDATE universe_records SET body=?,updated_at=? WHERE character_id=42 AND kind='jspace_map' AND id=?");
                let sequence = 0;
                function changes(count, source = false) {
                    const rows = [];
                    for (let index = 0; index < count; index++) {
                        const id = source ? 'tracking-source-42' : `map-${index % config.maps}`;
                        const value = JSON.parse(raw.get(id).body);
                        value.description = 'Changed body ' + (++sequence); value.revision += sequence;
                        rows.push({id, body: JSON.stringify(value)});
                    }
                    return rows;
                }
                function apply(rows, summaries) {
                    let summary = null;
                    for (const row of rows) {
                        update.run(row.body, STAMP, row.id);
                        if (summaries) summary = run.service.jspace.summaries(42);
                    }
                    return summaries ? summary : {changedRows: rows.length};
                }
                function assertChanged(rows) {
                    const last = new Map(rows.map(row => [row.id, row.body]));
                    for (const [id, body] of last) assert.equal(raw.get(id).body, body);
                }
                for (let window = 0; window < 2; window++) {
                    const rows = changes(8);
                    await phase(run, `raw-changed-body-write-${window}`, rows.length, () => apply(rows, false), () => assertChanged(rows));
                }
                const paired = changes(4);
                await phase(run, 'raw-changed-body-write-plus-summary-1-to-1', paired.length, () => apply(paired, true), value => {
                    assertChanged(paired); assert.equal(value.maps.length, config.maps);
                });
                const sourceRows = changes(2, true);
                await phase(run, 'raw-populated-source-writes', sourceRows.length, () => apply(sourceRows, false), () => assertChanged(sourceRows));

                const originals = db.prepare("SELECT * FROM universe_records WHERE character_id=42 AND kind='jspace_map' AND id<>'tracking-source-42' ORDER BY id").all();
                assert.equal(originals.length, config.maps);
                const remove = db.prepare("DELETE FROM universe_records WHERE character_id=42 AND kind='jspace_map' AND id=?");
                await phase(run, 'raw-map-deletes', originals.length, () => {
                    for (const row of originals) remove.run(row.id);
                    return {deleted: originals.length};
                }, () => assert.equal(db.prepare("SELECT count(*) AS n FROM universe_records WHERE kind='jspace_map'").get().n, 1));
                // Identical untimed restoration separates deletion cost from the
                // following API work. It is included in the next storage snapshot.
                const insert = db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?)');
                db.exec('BEGIN');
                try { for (const row of originals) insert.run(row.character_id, row.kind, row.id, row.body, row.updated_at); db.exec('COMMIT'); }
                catch (error) { db.exec('ROLLBACK'); throw error; }

                if (config.flavor !== 'primitive-fallback') {
                    let revision = JSON.parse(raw.get('map-0').body).revision;
                    const systemId = JSON.parse(raw.get('map-0').body).nodes[0].system_id;
                    const beforeNode = JSON.parse(raw.get('map-0').body).nodes[0];
                    const moved = await phase(run, 'api-node-save', 1, () => run.service.jspace.command(42, 'map-0', {
                        revision, op: 'node.save', node: {system_id: systemId, x: 91, y: 27},
                    }), value => assert.equal(value.nodes[0].x, 91));
                    revision = moved.revision;
                    const undone = await phase(run, 'api-undo-node-save', 1, () => run.service.jspace.command(42, 'map-0', {
                        revision, op: 'undo',
                    }), value => { assert.equal(value.nodes[0].x, beforeNode.x); assert.equal(value.nodes[0].y, beforeNode.y); });
                    revision = undone.revision;
                    const priorComments = JSON.parse(raw.get('map-0').body).comments.length;
                    const commented = await phase(run, 'api-comment-add', 1, () => run.service.jspace.command(42, 'map-0', {
                        revision, op: 'comment.add', comment: {body: 'Measured new comment', system_id: systemId},
                    }), value => assert.equal(value.comments.length, priorComments + 1));
                    await phase(run, 'api-undo-comment', 1, () => run.service.jspace.command(42, 'map-0', {
                        revision: commented.revision, op: 'undo',
                    }), value => assert.equal(value.comments.length, priorComments));
                } else sample.apiMutationSkip = 'Legacy primitive fallback is read-compatible but not used as a normalized API-edit fixture.';

                if (config.id === 'plain-1') {
                    const firstMap = JSON.parse(raw.get('map-0').body);
                    const document = {format: 'kairo-jspace', version: 1, map: {name: 'Measured import',
                        nodes: firstMap.nodes.slice(0, 2), connections: [], comments: [], passages: [],
                        observations: [], archived_nodes: [], signatures: [], scope: null}};
                    const imported = await phase(run, 'api-native-import-two-nodes', 1,
                        () => run.service.jspace.importMap(42, {document}), value => assert.equal(value.nodes.length, 2));
                    await phase(run, 'api-remove-imported-map', 1,
                        () => run.service.jspace.remove(42, imported.id, {revision: imported.revision}),
                        () => assert.equal(raw.get(imported.id), undefined));
                }

                sample.beforeExpiry = await storage(db, directory);
                clock.value = Date.parse(EXPIRY);
                await phase(run, 'api-summary-at-bulk-canonical-expiry', 1, () => run.service.jspace.summaries(42), value => {
                    assert.equal(value.maps.length, config.maps);
                    assert.ok(value.maps.every(row => row.connection_count === 0));
                    assert.equal(value.source_map.connection_count, 0);
                    assert.equal(db.prepare("SELECT count(*) AS n FROM universe_records WHERE kind='link'").get().n, 0);
                });
                sample.beforeCheckpoint = await storage(db, directory);
                sample.checkpoint = checkpoint(db);
                sample.afterCheckpoint = await storage(db, directory);
                sample.finalAuthoritative = authoritative(db);
                sample.finalSummary = normalizedOutput(run.service.jspace.summaries(42));
            } finally { await close(run); await rm(directory, {recursive: true, force: true}); }
        }
        entry.parity = parity(entry);
        assert.equal(hash(await readFile(join(seed, 'kairo.sqlite'))), fixture.databaseSha256, 'Immutable seed changed');
        await writeFile(output, JSON.stringify(result, null, 2) + '\n');
    }
    assert.equal(external, 0);
    await verifySource(baseline); await verifySource(arm);
    for (const entry of harness) assert.equal(hash(await readFile(entry.path)), entry.sha256);
    result.sourceVerified = true; result.complete = true;
} catch (error) { result.failure = error.stack; throw error; }
finally {
    if (scratch) await rm(scratch, {recursive: true, force: true});
    result.external = external; result.endedAt = new Date().toISOString();
    await writeFile(output, JSON.stringify(result, null, 2) + '\n');
}
