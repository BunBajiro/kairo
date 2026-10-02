// External candidate-only child adapter; never copy into the production tree.
// Candidate supervisor, child lifecycle, HTTP/core/ESI/bus/store are real.
import { DatabaseSync } from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
if (!process.env.KAIRO_CANDIDATE_ROOT) throw new Error('KAIRO_CANDIDATE_ROOT must identify the candidate worktree.');
const candidate = pathToFileURL(resolve(process.env.KAIRO_CANDIDATE_ROOT) + '/');
const {runRuntimeChild} = await import(new URL('server/runtime-child.mjs', candidate));
const {DATASET_TEST_BUILD, DATASET_TEST_RELEASE, writeDatasetFixture} = await import(new URL('tests/helpers/dataset-fixture.mjs', candidate));

const generation = Number(process.env.KAIRO_RESTART_PROBE_GENERATION);
const scenario = process.env.KAIRO_RESTART_PROBE_SCENARIO;
const diagnostics = { generation, scenario, pid: process.pid, externalNetworkAttempts: 0, unplannedFakeRequests: [],
    fakeRequests: [], pending: [], postCloseOperations: [], errors: [] };
let app, closed = false, closing = false;
const gates = new Map();
const send = (event, data = {}) => {
    if (process.connected) process.send({ type: 'probe', event, generation, pid: process.pid, ...data });
};
function gate(key, signal) {
    if (gates.has(key)) return gates.get(key).promise;
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    const abort = () => reject(signal.reason || new Error('Gate aborted'));
    signal?.addEventListener('abort', abort, { once: true });
    promise.then(() => signal?.removeEventListener('abort', abort), () => signal?.removeEventListener('abort', abort));
    gates.set(key, { promise, resolve, reject, settled: false });
    send('gate-pending', { key });
    return promise;
}
function release(key) {
    const entry = gates.get(key);
    if (!entry || entry.settled) return;
    entry.settled = true;
    send('gate-released', { key, afterDatabaseClose: closed });
    entry.resolve();
}
function summary() {
    return { ...diagnostics, pending: [...gates].filter(([, entry]) => !entry.settled).map(([key]) => key),
        databaseClosed: closed, closeStarted: closing, exitGraceUsed: false, eventWork: app?.core.health().events };
}
function describe(sql) {
    return /^\s*(\w+)\s+(?:OR\s+\w+\s+)?(?:INTO\s+|FROM\s+)?([a-z_]+)/i.exec(sql)?.slice(1).join(' ') || 'SQL';
}
// Observe native calls without replacing their result or exception. Wrapper
// overhead means this probe supplies ordering evidence, not production timing.
const nativePrepare = DatabaseSync.prototype.prepare;
DatabaseSync.prototype.prepare = function(sql, ...args) {
    const statement = nativePrepare.call(this, sql, ...args);
    return new Proxy(statement, { get(target, key) {
        const value = Reflect.get(target, key, target);
        if (typeof value !== 'function') return value;
        if (!['run', 'get', 'all', 'iterate'].includes(key)) return value.bind(target);
        return (...params) => {
            if (closed) diagnostics.postCloseOperations.push({ method: key, sql: describe(sql) });
            try {
                const result = value.apply(target, params);
                if (key === 'run' && /INSERT OR IGNORE INTO events/.test(sql)) send('semantic-insert', { changes: Number(result.changes) });
                return result;
            }
            catch (error) {
                diagnostics.errors.push({ source: 'prepared-statement', method: key, code: error.code, message: error.message, afterDatabaseClose: closed });
                send('observed-sql-error', diagnostics.errors.at(-1));
                throw error;
            }
        };
    } });
};
const prepareObserver = DatabaseSync.prototype.prepare;
DatabaseSync.prototype.prepare = function(sql, ...args) {
    if (closed) diagnostics.postCloseOperations.push({ method: 'prepare', sql: describe(sql) });
    try { return prepareObserver.call(this, sql, ...args); }
    catch (error) {
        diagnostics.errors.push({ source: 'prepare', code: error.code, message: error.message, afterDatabaseClose: closed });
        send('observed-sql-error', diagnostics.errors.at(-1));
        throw error;
    }
};
const nativeClose = DatabaseSync.prototype.close;
DatabaseSync.prototype.close = function(...args) {
    const result = nativeClose.apply(this, args);
    closed = true;
    send('database-closed', { pending: summary().pending });
    return result;
};

globalThis.fetch = async () => {
    diagnostics.externalNetworkAttempts++;
    throw new Error('Real network access is disabled by the restart probe.');
};
async function fakeFetch(input, options = {}) {
    const url = new URL(String(input));
    diagnostics.fakeRequests.push({ origin: url.origin, path: url.pathname, method: options.method || 'GET' });
    if (url.origin === 'https://developers.eveonline.com') {
        if (url.pathname.endsWith('/latest.jsonl')) return new Response(JSON.stringify({ _key: 'sde', buildNumber: DATASET_TEST_BUILD, releaseDate: DATASET_TEST_RELEASE }) + '\n',
            { headers: { 'Cache-Control': 'max-age=300' } });
        if (url.pathname.endsWith(`eve-online-static-data-${DATASET_TEST_BUILD}-jsonl.zip`)) return new Response('Synthetic archive; injected fixture builder copies validated bundled public data.');
    }
    if (url.origin === 'https://esi.evetech.net') {
        const headers = { 'Cache-Control': 'max-age=300', 'Content-Type': 'application/json' };
        if (url.pathname === '/universe/types/910001') {
            await gate('accepted-goal', options.signal);
            return new Response(JSON.stringify({ name: 'Synthetic restart test item', group_id: 25 }), { headers });
        }
        if (url.pathname === '/universe/groups/25') return new Response(JSON.stringify({ category_id: 6 }), { headers });
        if (url.pathname === '/universe/names') {
            const ids = JSON.parse(options.body);
            if (ids.includes(99000091)) await gate('accepted-read', options.signal);
            if (ids.includes(910002)) await gate('bus-names', options.signal);
            send('fake-names-response', { ids, afterDatabaseClose: closed });
            return new Response(JSON.stringify(ids.map(id => ({ id, name: 'Synthetic entity ' + id, category: id === 99000091 ? 'alliance' : 'inventory_type' }))), { headers });
        }
    }
    diagnostics.unplannedFakeRequests.push({origin: url.origin, path: url.pathname, method: options.method || 'GET'});
    throw new Error('Unplanned fake request: ' + url.origin + url.pathname);
}

process.on('message', message => {
    if (message?.type !== 'probe-control') return;
    if (message.action === 'release') for (const key of message.keys || []) release(key);
    else if (message.action === 'emit-skills') {
        app.core.bus.emit({type: 'data.skills', characterId: 42, payload: {
            previous: {skills: [{skill_id: 910002, trained_skill_level: 1}]},
            current: {skills: [{skill_id: 910002, trained_skill_level: 2}]},
        }});
        send('skill-observation-dispatched');
    } else if (message.action === 'inspect') send('summary', { summary: summary() });
});

runRuntimeChild({
    loadRuntime: async () => {
        const { startKairo } = await import(new URL('server/index.mjs', candidate));
        return { startKairo: async options => {
            app = await startKairo({ ...options, noSync: true, fetcher: fakeFetch,
                combatFetcher: fakeFetch, sessionFeedFetcher: fakeFetch,
                datasets: { fetcher: fakeFetch, build: writeDatasetFixture },
                universe: { feeds: { fetcher: fakeFetch } },
            });
            const now = Date.now(), ready = data => ({ status: 'ready', data,
                updatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 3600000).toISOString(), refreshAt: new Date(now + 3600000).toISOString() });
            if (generation === 1) {
                // Synthetic identity; no tokens are used because collectors are
                // disabled and every exercised ESI endpoint is public.
                app.store.db.prepare('INSERT INTO characters(id,name,scopes,tokens,owner,reauth) VALUES(?,?,?,?,?,0)').run(42, 'Synthetic restart pilot', '[]', '{}', 'synthetic');
                app.store.set('opsec', { manual: true, characterId: 42 });
                app.store.saveSnapshot(42, 'location', ready({ solar_system_id: 30000142, system: { name: 'Jita' } }));
                app.store.saveSnapshot(42, 'profile', ready({ corporation_id: 98000091 }));
                app.store.saveSnapshot(0, 'sovereignty', ready([{ system_id: 30000142, alliance_id: 99000091 }]));
                app.core.refreshOPSEC();
            }
            const close = app.close.bind(app);
            app.close = async () => {
                closing = true; send('close-started', { pending: summary().pending });
                await close();
                send('close-returned', { summary: summary() });
            };
            const closeCore = app.core.close;
            app.core.close = () => { send('core-close-started', {eventWork: app.core.health().events}); return closeCore(); };
            // Read-only observer of the actual shipped Milestones subscriber.
            app.core.bus.on('skill.completed', event => {
                send('milestone-event-persisted', { semanticType: event.type, afterDatabaseClose: closed });
            });
            send('runtime-created', { summary: summary() });
            return app;
        } };
    },
    exit: code => {
        const finish = () => {
            if (!process.connected) { process.stdout.write(JSON.stringify({ type: 'probe-final', ...summary() }) + '\n', () => process.exit(code)); }
            else process.send({ type: 'probe', event: 'final', generation, summary: summary() }, () => process.exit(code));
        };
        finish();
    },
});
