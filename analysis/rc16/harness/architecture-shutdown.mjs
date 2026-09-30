// Internal RC16 diagnostic: asserts the currently observed shutdown gap.
// No production imports are changed; no network, disk database or CPU timing.
// Run: node analysis/rc16/harness/architecture-shutdown.mjs \
//   > analysis/rc16/raw/architecture-shutdown.json
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createBus } from '../../../server/bus.mjs';
import { registerUniverseHistory } from '../../../server/universe-history.mjs';

const root = new URL('../../../', import.meta.url);
const output = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    mode: 'deterministic-shutdown-diagnostic',
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    notes: [
        'Asserts the observed RC16 gap; it is not a test asserting correct shutdown behavior.',
        'Uses the real semantic bus and Universe history subscriber with controlled deferred names and in-memory SQLite.',
        'A listener wrapper records rejection then rethrows it to the unchanged real bus, which catches it.',
        'Disposal/store-close ordering is controlled; this does not launch the full core or supervisor.',
        'No wall-clock sleeps, external requests, CPU timings or production edits.',
    ],
    scenarios: [],
};
let networkAttempts = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkAttempts++; throw new Error('Network is forbidden in this diagnostic.'); };
const unhandled = [];
const unhandledListener = reason => unhandled.push({ name: reason?.name, message: reason?.message || String(reason) });
process.on('unhandledRejection', unhandledListener);
const flush = () => new Promise(resolve => setImmediate(resolve));
const errorInfo = error => ({ name: error.name, code: error.code || null, message: error.message });
const event = { type: 'data.ship', characterId: 1,
    payload: { current: { ship_id: 2, ship_type_id: 10 }, previous: { ship_id: 1, ship_type_id: 9 } } };

async function scenario(label, { closeDatabase = false, rejectNames = false } = {}) {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE visits(character_id INTEGER,system_id INTEGER,name TEXT,ship_type_id INTEGER,at TEXT,sovereignty_at_visit TEXT);
        CREATE TABLE events(type TEXT,body TEXT);`);
    let resolveNames, rejectLookup, namesRequests = 0, disposed = false, databaseClosed = false;
    let latePublishAttempts = 0, completedPublishes = 0;
    const callbacks = [], lookup = new Promise((resolve, reject) => { resolveNames = resolve; rejectLookup = reject; });
    const bus = createBus();
    // Observational wrapper: retain exactly the same return/rejection semantics.
    const observedBus = { on(type, handler) {
        return bus.on(type, event => Promise.resolve(handler(event)).catch(error => {
            callbacks.push({ type, afterDisposal: disposed, databaseClosed, ...errorInfo(error) });
            throw error;
        }));
    } };
    const store = { db, get: (_key, fallback) => fallback, snapshot: () => null };
    const stop = registerUniverseHistory({ store, bus: observedBus,
        esi: { names() { namesRequests++; return lookup; } },
        publish(value) {
            if (disposed) latePublishAttempts++;
            db.prepare('INSERT INTO events VALUES(?,?)').run(value.type, JSON.stringify(value));
            completedPublishes++;
        },
    });
    try {
        const returned = bus.emit(event);
        assert.equal(returned, undefined, 'RC16 emit does not expose the in-flight listener promise.');
        assert.equal(namesRequests, 1);
        assert.equal(completedPublishes, 0);
        stop(); disposed = true;
        bus.emit(event);
        assert.equal(namesRequests, 1, 'Disposal must prevent new dispatches even though one callback is in flight.');
        if (closeDatabase) { db.close(); databaseClosed = true; }
        if (rejectNames) rejectLookup(new Error('Synthetic deferred name lookup failure'));
        else resolveNames({ 10: 'Synthetic test ship' });
        await flush();
        await flush(); // Allow Node to report an unhandled rejection if the real bus did not catch it.
        assert.equal(typeof bus.drain, 'undefined', 'RC16 has no public drain mechanism.');
        if (rejectNames) {
            assert.equal(latePublishAttempts, 0);
            assert.equal(callbacks.length, 1);
            assert.equal(callbacks[0].message, 'Synthetic deferred name lookup failure');
        } else if (closeDatabase) {
            assert.equal(latePublishAttempts, 1, 'The disposed callback must reach the publish path after close.');
            assert.equal(completedPublishes, 0);
            assert.equal(callbacks.length, 1, 'Capture the actual SQLite error before the real bus swallows it.');
            assert.match(callbacks[0].message, /database is not open|database.*closed/i);
            assert.equal(callbacks[0].databaseClosed, true);
        } else {
            assert.equal(latePublishAttempts, 1);
            assert.equal(completedPublishes, 1);
            assert.equal(db.prepare('SELECT COUNT(*) n FROM events').get().n, 1);
            assert.equal(callbacks.length, 0);
        }
        assert.equal(unhandled.length, 0, 'The unchanged real bus consumes listener rejections.');
        return { label, assertionsPassed: true, emitReturnType: typeof returned, busHasDrain: typeof bus.drain === 'function',
            namesRequests, disposed, databaseClosedBeforeNameSettlement: closeDatabase,
            latePublishAttempts, completedPublishes, capturedCallbackErrors: callbacks,
            unhandledRejections: unhandled.length };
    } finally {
        stop();
        if (!databaseClosed) db.close();
    }
}

try {
    const manifest = JSON.parse(await readFile(new URL('analysis/rc16/rc16-source-manifest.json', root), 'utf8'));
    output.sourceCommit = manifest.sourceCommit;
    output.sourceFiles = await Promise.all(['server/bus.mjs', 'server/universe-history.mjs', 'server/core.mjs', 'server/index.mjs',
        'analysis/rc16/harness/architecture-shutdown.mjs'].map(async path => ({ path,
        sha256: createHash('sha256').update(await readFile(new URL(path, root))).digest('hex') })));
    output.scenarios.push(await scenario('dispose_listener_then_resolve_names'));
    output.scenarios.push(await scenario('dispose_listener_close_database_then_resolve_names', { closeDatabase: true }));
    output.scenarios.push(await scenario('dispose_listener_then_reject_names', { rejectNames: true }));
    assert.equal(networkAttempts, 0);
    output.assertionsPassed = true;
} catch (error) {
    output.assertionsPassed = false;
    output.error = { ...errorInfo(error), stack: error.stack };
    process.exitCode = 1;
} finally {
    output.networkAttempts = networkAttempts;
    output.unhandledRejections = unhandled;
    process.removeListener('unhandledRejection', unhandledListener);
    globalThis.fetch = originalFetch;
}
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
