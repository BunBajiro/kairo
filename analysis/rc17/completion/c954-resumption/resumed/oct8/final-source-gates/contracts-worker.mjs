// External, untimed full decoded contracts. Original measured workers stay unchanged.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const [rootArg, manifestArg, outputArg, role] = process.argv.slice(2);
assert.ok(rootArg && manifestArg && outputArg && ['baseline', 'candidate'].includes(role));
const root = resolve(rootArg), output = resolve(outputArg), manifestPath = resolve(manifestArg);
await mkdir(output, {recursive: true});
const AT = Date.parse('2026-09-30T09:00:00Z'), iso = value => new Date(value).toISOString();
const hash = value => createHash('sha256').update(value).digest('hex');
const decoded = value => JSON.parse(JSON.stringify(value));
const moduleAt = name => import(pathToFileURL(join(root, 'server', name)).href);
const originalNow = Date.now, originalFetch = globalThis.fetch;
let externalAttempts = 0, activeStore;
const directories = [], cleanupErrors = [];
const report = {schemaVersion: 1, role, diagnosticOnly: true, timingClaims: false, complete: false,
    cleanupComplete: false, sourceVerified: false, fixedTime: iso(AT), controls: [], files: {}};
const raw = {schemaVersion: 1, reports: {}, routes: [], routeBoundary: null};
const common = {schemaVersion: 1, reports: {}, routes: [], routeBoundary: null};
const normalization = [];
let primary;
async function temporary(label) {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-final-contract-' + label + '-'));
    directories.push(directory); return directory;
}
async function writeJSON(name, value) {
    const bytes = Buffer.from(JSON.stringify(value) + '\n');
    await writeFile(join(output, name), bytes, {flag: 'wx'});
    return {path: name, bytes: bytes.length, sha256: hash(bytes)};
}
function durableEvidence(store) {
    // SELECT only; hashing every durable fixture row also checks readers do not mutate it.
    return Object.fromEntries(['sessions', 'events', 'visits', 'combat_records', 'alliance_combat_records']
        .map(table => [table, hash(JSON.stringify(store.db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()))]));
}
try {
    Date.now = () => AT;
    globalThis.fetch = async () => { externalAttempts++; throw Error('External network forbidden in final contract gate'); };
    process.env.KAIRO_PERF_APP_ROOT = root;
    const [{openStore}, {sessionReport}, {sessionRoute}, {sessionCombatQueries}, {seedFixture, profiles, PILOT}] = await Promise.all([
        moduleAt('store.mjs'), moduleAt('history.mjs'), moduleAt('session-details.mjs'), moduleAt('session-combat.mjs'),
        import('../../../../../harness/backend/fixture.mjs'),
    ]);
    const backendProfiles = {};
    for (const profile of ['typical', 'stress']) {
        const directory = await temporary(profile);
        const spec = await seedFixture(directory, profile, AT);
        assert.deepEqual(Object.fromEntries(Object.keys(profiles[profile]).map(key => [key, spec[key]])), profiles[profile]);
        backendProfiles[profile] = spec.fingerprint;
        activeStore = openStore(directory);
        const before = durableEvidence(activeStore);
        raw.reports[profile] = {}; common.reports[profile] = {};
        for (const offset of [0, 100, spec.events - 100, spec.events]) {
            // Preserve the complete actual decoded report, not a selected projection/hash.
            const value = decoded(sessionReport(activeStore, 'benchmark-session', PILOT, offset));
            raw.reports[profile][offset] = value;
            assert.equal(value.stats.events, spec.events);
            assert.equal(value.personalCombat.items.length, spec.combat);
            assert.ok(value.allianceCombat.items.length > 0);
            assert.equal(value.visits.length, spec.visits);
            assert.equal(value.route.length, spec.visits);
            assert.equal(value.offset, offset);
            assert.equal(value.events.length, Math.min(100, Math.max(0, spec.events - offset)));
            assert.equal(value.more, offset + 100 < spec.events);
            assert.deepEqual(value.events.map(event => event.id), Array.from({length: value.events.length}, (_, index) => offset + index + 1));
            assert.equal(value.durationSeconds, 6 * 3600);
            // Original stress visits are 10.8 seconds apart; each public duration
            // intentionally floors separately, so their sum is not wall duration.
            assert.equal(value.route.reduce((sum, row) => sum + row.seconds, 0), Math.floor(6 * 3600 / spec.visits) * spec.visits);
            assert.ok(value.route.every(row => typeof row.name === 'string' && Object.hasOwn(row, 'sovereignty_at_visit')));
            const normalized = structuredClone(value);
            if (role === 'candidate') {
                for (const row of normalized.visits) {
                    assert.ok(Object.hasOwn(row, 'session_id'), 'Candidate migration must expose visit ownership');
                    assert.equal(row.session_id, null, 'Unchanged legacy fixture must remain unowned');
                    delete row.session_id;
                }
                normalization.push({path: `reports.${profile}.${offset}.visits[*].session_id`, operation: 'remove asserted-null additive candidate column', rows: spec.visits});
            } else assert.ok(normalized.visits.every(row => !Object.hasOwn(row, 'session_id')), 'Canonical RC16 fixture shape changed');
            common.reports[profile][offset] = normalized;
        }
        assert.throws(() => sessionReport(activeStore, 'benchmark-session', PILOT + 1), /Session not found/);
        assert.deepEqual(durableEvidence(activeStore), before, 'Report reader changed durable evidence');
        report.controls.push({name: 'full-report-' + profile, events: spec.events, visits: spec.visits, personalCombat: spec.combat,
            offsets: [0, 100, spec.events - 100, spec.events], fullDecodedObjects: true, durableUnchanged: true, foreignPilotRejected: true});
        activeStore.close(); activeStore = null;
    }

    // Same five shapes, times and raw inputs as memory-sessions.mjs; this untimed
    // companion preserves every returned field and every pilot, not just its subset digest.
    const shapes = [100, 1000, 10000].map(visits => ({visits, pilots: 1, olderVisits: 0}));
    shapes.push({visits: 100, pilots: 1, olderVisits: 10000}, {visits: 1000, pilots: 4, olderVisits: 0});
    for (const shape of shapes) {
        activeStore = openStore(await temporary('route'));
        const from = AT - shape.visits * 60000;
        const start = {capturedAt: iso(from), system: {id: 30000001, name: 'Synthetic system 0'}, alliance: {id: 99000000}, shipTypeId: 609};
        const putSystem = activeStore.db.prepare('INSERT INTO universe_systems(system_id,name,region_id,region_name,security) VALUES(?,?,?,?,?)');
        const putSession = activeStore.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context) VALUES(?,?,?,?,?,?)');
        const putVisit = activeStore.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)');
        activeStore.db.exec('BEGIN');
        try {
            for (let index = 0; index < 100; index++) putSystem.run(30000001 + index, `Synthetic system ${index}`, 10000001, 'Synthetic region', -.3);
            for (let pilot = 0; pilot < shape.pilots; pilot++) {
                putSession.run('long-' + pilot, 42 + pilot, 'Synthetic live session', iso(from), null, JSON.stringify(start));
                for (let index = 0; index < shape.visits; index++) putVisit.run(42 + pilot, 30000001 + index % 100, `Synthetic system ${index % 100}`, iso(from + index * 60000));
                for (let index = 0; index < shape.olderVisits; index++) putVisit.run(42 + pilot, 30000001 + index % 100, `Synthetic system ${index % 100}`, iso(from - (index + 1) * 60000));
            }
            activeStore.set('session:live-feed', {nextCheckAt: iso(AT + 3600000), nextSequence: 100, lastAdvanceAt: iso(AT)});
            activeStore.db.exec('COMMIT');
        } catch (error) { activeStore.db.exec('ROLLBACK'); throw error; }
        const before = durableEvidence(activeStore), result = {fixture: shape, pilots: []};
        raw.routes.push(result);
        for (let pilot = 0; pilot < shape.pilots; pilot++) {
            const session = activeStore.db.prepare('SELECT * FROM sessions WHERE id=?').get('long-' + pilot);
            const route = decoded(sessionRoute(activeStore, session, start, iso(AT)));
            const pilotResult = {characterId: 42 + pilot, route}; result.pilots.push(pilotResult);
            const groups = decoded(sessionCombatQueries(route));
            pilotResult.groups = groups;
            assert.equal(route.length, shape.visits);
            assert.deepEqual(route.map(row => row.id), Array.from({length: shape.visits}, (_, index) => pilot * (shape.visits + shape.olderVisits) + index + 1));
            assert.ok(route.every(row => row.seconds === 60 && row.regionId === 10000001 && row.regionName === 'Synthetic region' && row.security === -.3));
            assert.ok(route.every((row, index) => row.name === `Synthetic system ${index % 100}` && row.systemId === 30000001 + index % 100 && row.sovereignty_at_visit === null));
            assert.equal(route.filter(row => row.active).length, 1); assert.equal(route.at(-1).active, true);
            assert.equal(route.reduce((sum, row) => sum + row.seconds, 0), shape.visits * 60);
            assert.equal(new Set(groups.map(group => [group.systemId, group.year, group.month].join(':'))).size, groups.length);
        }
        assert.deepEqual(durableEvidence(activeStore), before);
        common.routes.push(structuredClone(result));
        activeStore.close(); activeStore = null;
    }

    // Small explicit field controls accompany (and never replace) the five shapes.
    activeStore = openStore(await temporary('boundary'));
    const at = offset => iso(AT + offset), owner = {owner_type: 'alliance', owner_id: 99000001, owner_name: 'Recorded owner', observed_at: at(-1000), recorded_at: at(0), source: 'esi'};
    const initial = {capturedAt: at(0), system: {id: 30000001, name: 'Recorded origin', sovereignty_at_visit: owner}, shipTypeId: 587};
    const session = {id: 'boundary', character_id: 42, started: at(0), ended: at(40000)};
    activeStore.db.prepare('INSERT INTO universe_systems(system_id,name,region_id,region_name,security) VALUES(?,?,?,?,?)').run(30000001, 'Current origin', 10000001, 'Recorded region', -.3);
    activeStore.db.prepare('INSERT INTO universe_systems(system_id,name,region_id,region_name,security) VALUES(?,?,?,?,?)').run(30000002, 'Database name', 10000002, 'Second region', .4);
    activeStore.set('names', {'30000003': 'Directory name'});
    const put = activeStore.db.prepare('INSERT INTO visits(character_id,system_id,name,ship_type_id,at,sovereignty_at_visit) VALUES(?,?,?,?,?,?)');
    put.run(42, 30000002, '', 588, at(10000), JSON.stringify(owner));
    put.run(42, 30000001, 'Recorded loop', 589, at(20000), JSON.stringify(owner));
    put.run(42, 30000003, '', 590, at(20000), null);
    put.run(42, 30000004, '', 591, at(30000), null);
    put.run(42, 30000002, 'Excluded exclusive end', 592, at(40000), null);
    put.run(43, 30000002, 'Other pilot', 593, at(15000), null);
    const boundary = decoded(sessionRoute(activeStore, session, initial, at(40000)));
    raw.routeBoundary = {route: boundary};
    assert.deepEqual(boundary.map(row => row.name), ['Recorded origin', 'Database name', 'Recorded loop', 'Directory name', '30000004']);
    assert.deepEqual(boundary.map(row => row.id), ['start', 1, 2, 3, 4]);
    assert.deepEqual(boundary.map(row => row.seconds), [10, 10, 0, 10, 10]);
    assert.deepEqual(boundary.map(row => row.shipTypeId), [587, 588, 589, 590, 591]);
    assert.deepEqual(boundary.slice(0, 3).map(row => row.sovereignty_at_visit), [owner, owner, owner]);
    assert.equal(boundary[0].clipped, true); assert.equal(boundary[0].inferred, false);
    assert.ok(boundary.every(row => row.active === false));
    // No captured context: prior legacy visit supplies the explicitly inferred start.
    const inferredSession = {...session, started: at(15000), ended: at(18000)};
    const inferred = decoded(sessionRoute(activeStore, inferredSession, {}, at(18000)));
    raw.routeBoundary.inferred = inferred;
    assert.equal(inferred.length, 1); assert.equal(inferred[0].inferred, true); assert.equal(inferred[0].clipped, true);
    assert.equal(inferred[0].name, 'Database name'); assert.equal(inferred[0].seconds, 3);
    raw.routeBoundary.groups = decoded(sessionCombatQueries(boundary));
    common.routeBoundary = structuredClone(raw.routeBoundary);
    activeStore.close(); activeStore = null;
    report.controls.push({name: 'full-route-fields', shapes: shapes.length, pilotsCompared: 8, syntheticStart: true,
        legacyInferredStart: true, recordedSovereignty: true, namePrecedence: true, equalTimeLoopOrder: true, exclusiveEnd: true, foreignPilot: true});

    if (role === 'candidate') {
        // Deliberate product delta: new explicit ownership excludes foreign/unowned
        // Pilot evidence. It is asserted here, never normalized into RC16 equality.
        activeStore = openStore(await temporary('ownership'));
        const start = {capturedAt: at(0), eventCursor: 0, system: {id: 30000001, name: 'Start', sovereignty_at_visit: owner}, shipTypeId: 587, ship: {id: 111}};
        const finish = {capturedAt: at(40000), eventCursor: 3};
        activeStore.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)')
            .run('owner-A', 42, 'Owner A', at(0), at(40000), JSON.stringify(start), JSON.stringify(finish));
        const visit = activeStore.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)');
        visit.run(42, 30000002, 'Legacy', at(10000), null);
        visit.run(42, 30000003, 'Owned', at(20000), 'owner-A');
        visit.run(42, 30000004, 'Other session', at(25000), 'owner-B');
        visit.run(43, 30000005, 'Other pilot', at(30000), 'owner-A');
        visit.run(42, 30000006, 'Inclusive raw end', at(40000), 'owner-A');
        const event = activeStore.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)');
        const add = (pilot, type, payload, offset) => event.run(pilot, type, 'pilot', type, JSON.stringify(payload), at(offset));
        add(42, 'location.changed', {}, 10000);
        add(42, 'location.changed', {session_id: null}, 20000);
        add(42, 'ship.changed', {session_id: 'owner-A', ship_type_id: 588, ship_id: 112}, 30000);
        add(42, 'ship.changed', {session_id: 'owner-B', ship_type_id: 589}, 35000);
        add(42, 'location.changed', {session_id: 'owner-A'}, 40000);
        add(42, 'session.ended', {session_id: 'owner-A'}, 40000);
        add(42, 'killmail.kill', {session_id: 'owner-A'}, 40000);
        add(43, 'location.changed', {session_id: 'owner-A'}, 30000);
        add(42, 'location.changed', {session_id: 'owner-A'}, 50000);
        add(42, 'session.note', {}, 40000);
        const value = decoded(sessionReport(activeStore, 'owner-A', 42));
        report.files.candidateOwnership = await writeJSON('candidate-ownership.json', value);
        assert.deepEqual(value.events.map(row => row.id), [1, 3, 5, 6]);
        assert.equal(value.stats.events, 4);
        assert.deepEqual(value.visits.map(row => row.id), [1, 2, 5]);
        assert.deepEqual(value.route.map(row => row.id), ['start', 1, 2]);
        assert.deepEqual(value.ships.changes.map(row => row.typeId), [587, 588]);
        assert.equal(value.route[0].sovereignty_at_visit.owner_name, 'Recorded owner');
        report.controls.push({name: 'candidate-explicit-ownership', eventIds: [1, 3, 5, 6], rawVisitIds: [1, 2, 5], routeIds: ['start', 1, 2],
            missingOwnerIsLegacy: true, explicitNullExcluded: true, foreignOwnerExcluded: true, foreignPilotExcluded: true,
            lateOwnedEndAccepted: true, occurrenceEndKillExcluded: true, endCursorApplied: true, noComparisonNormalization: true});
        activeStore.close(); activeStore = null;
    }
    report.fixture = {fixedTime: iso(AT), backendProfiles, routeShapes: shapes, reportOffsets: '0,100,eventCount-100,eventCount', originalWorkloadInputsRetained: true};
    report.normalization = normalization;
    report.files.rawContracts = await writeJSON('raw-contracts.json', raw);
    report.files.commonContracts = await writeJSON('common-contracts.json', common);
    assert.equal(externalAttempts, 0);
} catch (error) { primary = error; report.failure = error.stack; }
finally {
    try { activeStore?.close(); } catch (error) { cleanupErrors.push({owner: 'store', error: error.stack}); }
    for (const directory of directories) {
        try { await rm(directory, {recursive: true, force: true, maxRetries: 5, retryDelay: 100}); }
        catch (error) { cleanupErrors.push({owner: directory, error: error.stack}); }
    }
    Date.now = originalNow; globalThis.fetch = originalFetch;
    report.cleanupErrors = cleanupErrors; report.cleanupComplete = cleanupErrors.length === 0;
    report.externalAttempts = externalAttempts;
    // Preserve actual decoded data even if the assertion consuming it failed.
    // Separate partial names keep a successful immutable artifact untouched.
    for (const [key, name, value] of [['rawContracts', 'raw-contracts.partial.json', raw], ['commonContracts', 'common-contracts.partial.json', common]]) {
        if (!report.files[key]) {
            try { report.files[key] = {...await writeJSON(name, value), partial: true}; }
            catch (error) { report.artifactFailures ||= []; report.artifactFailures.push({path: name, error: error.stack}); primary ||= error; }
        }
    }
    try {
        const {loadSourceManifest} = await import('../../../../../harness/source-manifest.mjs');
        const source = await loadSourceManifest(manifestPath, root);
        assert.equal(source.dirty, false);
        report.source = {commit: source.sourceCommit, fingerprint: source.fingerprint, dirty: source.dirty}; report.sourceVerified = true;
    } catch (error) { report.sourceVerificationFailure = error.stack; primary ||= error; }
    report.complete = !primary && report.cleanupComplete && report.sourceVerified && externalAttempts === 0;
    await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
}
if (!report.complete) { process.stderr.write((primary?.stack || JSON.stringify(cleanupErrors)) + '\n'); process.exitCode = 1; }
