// Internal follow-up only. Run under the shared checkpoint flock; stdout is JSON.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { runKairoSupervisor } from '../../../../server/runtime-supervisor.mjs';
import { createDatasetConnection } from '../../../../components/kairo/dataset-connection.mjs';
import { DATASET_TEST_BUILD } from '../../../../tests/helpers/dataset-fixture.mjs';

const root = new URL('../../../../', import.meta.url);
const childFile = fileURLToPath(new URL('./restart-child.mjs', import.meta.url));
const output = { schema: 1, generatedAt: new Date().toISOString(), lane: 'followup-managed-restart',
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    boundaries: [
        'Actual production supervisor, real forked child processes, runtime-child lifecycle, startKairo, HTTP/core/SQLite/ESI and frontend dataset-connection coordinator.',
        'Actual dataset service stages a coherent copied-bundled generation through an injected fixture builder; actual prepare/commit/cleanup activates it. No full archive conversion is measured.',
        'Supported fetcher options serve synthetic public ESI/CCP responses; noSync disables live periodic collectors; a synthetic identity requires no valid credentials.',
        'HTTP accepted writes/reads and dashboard/OBS SSE use loopback networking. This is not a browser or OBS executable test.',
        'Bus ship observation is injected through harness IPC into the real core bus. Normal and forced-late response schedules are separate.',
        'The late-bus scenario deliberately resolves names at actual SQLite close and permits 100 ms child-exit observation grace. It diagnoses an ownership gap, not ordinary restart timing.',
    ], scenarios: [] };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 25000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { const result = await fn(); if (result) return result; await delay(10); }
    throw new Error('Timed out: ' + label);
}
async function freePort() {
    const server = createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve)); return port;
}
async function openSSE(url, headers, onEvent, onDisconnect) {
    const controller = new AbortController();
    const response = await fetch(url, { headers, signal: controller.signal });
    assert.equal(response.status, 200);
    const reader = response.body.getReader(), events = [];
    const done = (async () => {
        const decoder = new TextDecoder(); let text = '';
        try {
            for (;;) {
                const part = await reader.read(); if (part.done) break;
                text += decoder.decode(part.value, { stream: true });
                let boundary;
                while ((boundary = text.indexOf('\n\n')) >= 0) {
                    const packet = text.slice(0, boundary); text = text.slice(boundary + 2);
                    const name = packet.match(/^event: (.+)$/m)?.[1], raw = packet.match(/^data: (.+)$/m)?.[1];
                    if (name && raw) { const event = { name, data: JSON.parse(raw) }; events.push(event); await onEvent?.(event); }
                }
            }
        } catch (error) { if (!controller.signal.aborted) throw error; }
        finally { onDisconnect?.(); }
    })();
    done.catch(() => {});
    return { events, done, async close() { controller.abort(); await done; } };
}

async function scenario(label) {
    const dataDir = await mkdtemp(join(tmpdir(), 'kairo-restart-followup-'));
    const port = await freePort(); let streamPort;
    do { streamPort = await freePort(); } while (streamPort === port);
    const origin = `http://127.0.0.1:${port}`, streamOrigin = `http://127.0.0.1:${streamPort}`;
    const trace = [], children = [], childSummaries = [], stderr = [];
    const mark = (event, data = {}) => { const item = { order: trace.length + 1, event, ...data }; trace.push(item); return item; };
    let supervisor, oldSSE, oldOBS, newSSE, newOBS, connection, cookie, csrf, boot;
    let goalRequest, detailRequest;
    async function api(path, method = 'GET', body) {
        const response = await fetch(origin + '/api' + path, { method,
            headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', 'X-Kairo-CSRF': csrf },
            body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
        const text = await response.text();
        return { status: response.status, body: text ? JSON.parse(text) : null };
    }
    function control(action, keys) { children[0].send({ type: 'probe-control', action, keys }); }
    const messageOf = (event, generation = 1) => trace.find(item => item.event === 'child:' + event && item.generation === generation);
    const coordinate = async event => {
        mark('dashboard:' + event.name, event.name === 'dataset-revision' ? { revision: event.data.revision } : {});
        if (event.name === 'dataset-restarting') connection.restarting(event.data);
        else if (event.name === 'dataset-restart-cancelled') connection.cancelled(event.data);
        else if (event.name === 'dataset-revision') await connection.revision(event.data);
    };
    try {
        supervisor = await runKairoSupervisor({ dataDir, manageProcess: false, startupTimeout: 20000, shutdownTimeout: 20000,
            runtimeOptions: { noSync: true, port, streamPort },
            logger: { log() {}, error(message) { mark('supervisor-error', { message }); } },
            forkRuntime(_productionFile, args, options) {
                const generation = children.length + 1;
                const child = fork(childFile, args, { ...options,
                    env: { ...options.env, KAIRO_RESTART_PROBE_GENERATION: String(generation), KAIRO_RESTART_PROBE_SCENARIO: label },
                    stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
                children.push(child);
                mark('fork', { generation, pid: child.pid });
                let stdout = '';
                child.stdout.on('data', chunk => {
                    stdout += chunk;
                    let boundary;
                    while ((boundary = stdout.indexOf('\n')) >= 0) {
                        const line = stdout.slice(0, boundary); stdout = stdout.slice(boundary + 1);
                        try { const row = JSON.parse(line); if (row.type === 'probe-final') childSummaries.push(row); }
                        catch { if (line.trim()) mark('child-stdout', { generation, text: line.slice(0, 300) }); }
                    }
                });
                child.stderr.on('data', chunk => stderr.push({ generation, text: String(chunk).slice(0, 2000) }));
                child.on('message', message => {
                    if (message.type === 'probe') {
                        const { type, event, ...data } = message;
                        mark('child:' + event, data);
                    } else if (['ready', 'dataset-ready', 'stopped', 'startup-error', 'shutdown-error'].includes(message.type)) {
                        mark('runtime:' + message.type, { generation, pid: child.pid,
                            ...(message.type === 'stopped' ? { sessionCount: message.sessions?.length || 0 } : {}),
                            ...(message.error ? { error: message.error } : {}) });
                    }
                });
                child.on('exit', (code, signal) => mark('exit', { generation, pid: child.pid, code, signal }));
                const nativeSend = child.send.bind(child);
                child.send = (message, ...rest) => {
                    if (['start', 'stop', 'activated'].includes(message?.type)) mark('parent:' + message.type, { generation });
                    return nativeSend(message, ...rest);
                };
                return child;
            },
        });
        const page = await fetch(origin); await page.arrayBuffer();
        assert.ok(page.headers.get('set-cookie'), 'Opening dashboard must establish a session.');
        cookie = page.headers.get('set-cookie').split(';')[0];
        boot = (await api('/bootstrap')).body; csrf = boot.csrf;
        assert.ok(csrf);
        const connectionStates = [], refreshes = [], completions = [];
        connection = createDatasetConnection({ revision: boot.datasetRevision,
            onState: state => { connectionStates.push(state.phase); mark('coordinator:' + state.phase); },
            refresh: async revision => {
                const result = await api('/bootstrap');
                assert.equal(result.status, 200); assert.equal(result.body.datasetRevision, revision);
                assert.equal(result.body.csrf, csrf); refreshes.push(revision);
            }, onComplete: revision => completions.push(revision), seenRecovery: () => false, rememberRecovery() {},
        });
        connection.connect();
        oldSSE = await openSSE(origin + '/api/events', { Cookie: cookie }, coordinate, () => { mark('old-dashboard-disconnected'); connection.disconnect(); });
        oldOBS = await openSSE(streamOrigin + '/events', {}, event => mark('old-obs:' + event.name), () => mark('old-obs-disconnected'));
        await until(() => oldOBS.events.some(event => event.name === 'state') && oldSSE.events.some(event => event.name === 'dataset-revision'), 'initial SSE states');
        assert.equal(oldOBS.events.find(event => event.name === 'state').data.opsec.hidden, true);
        const session = await api('/session?character=42', 'POST', { action: 'start', label: 'Synthetic restart flight' });
        assert.equal(session.status, 200); const sessionId = session.body.id;
        const settings = await api('/settings', 'PUT', { theme: 'amber' }); assert.equal(settings.status, 200);
        control('emit-ship');
        goalRequest = api('/goals?character=42', 'POST', { title: 'Accepted through restart', target: 1, source: 'manual', typeId: 910001 });
        detailRequest = api('/universe/systems/30000142?character=42');
        await until(() => ['accepted-goal', 'accepted-read', 'bus-names'].every(key => trace.some(row => row.event === 'child:gate-pending' && row.key === key)), 'three pending paths');
        mark('three-work-items-in-flight');
        const installing = await api('/datasets/install', 'POST', {}); assert.equal(installing.status, 202);
        await until(() => messageOf('close-started'), 'actual old app close');
        assert.ok(trace.find(row => row.event === 'dashboard:dataset-restarting')?.order < messageOf('close-started').order, 'User must receive planned-update notice before close starts.');
        assert.equal(connection.state.phase, 'restarting');
        assert.equal(children.length, 1, 'No replacement core while accepted handlers remain blocked.');
        assert.equal(messageOf('database-closed'), undefined, 'SQLite cannot close before accepted handlers drain.');
        const refused = await api('/settings', 'PUT', { theme: 'ice' });
        assert.equal(refused.status, 503, 'New writes should be refused during quiesce.');
        if (label === 'drain-accepted') {
            control('release', ['bus-names']);
            await until(() => messageOf('ship-event-persisted'), 'accepted semantic event persists while handlers hold shutdown open', 4000);
        }
        control('release', ['accepted-read', 'accepted-goal']);
        const [goal, detail] = await Promise.all([goalRequest, detailRequest]);
        assert.equal(goal.status, 201); assert.equal(detail.status, 200);
        mark('accepted-http-completed');
        await until(() => trace.some(row => row.event === 'parent:activated' && row.generation === 2), 'replacement activated');
        await until(() => childSummaries.some(row => row.generation === 1), 'old child final diagnostics');
        assert.equal(children.length, 2);
        assert.notEqual(children[0].pid, children[1].pid);
        const oldExit = trace.find(row => row.event === 'exit' && row.generation === 1), newFork = trace.find(row => row.event === 'fork' && row.generation === 2);
        assert.ok(oldExit && newFork && oldExit.order < newFork.order, 'Old PID must exit before replacement starts.');
        const restored = await api('/bootstrap'); assert.equal(restored.status, 200);
        assert.equal(restored.body.csrf, csrf); assert.equal(restored.body.settings.theme, 'amber');
        assert.equal(restored.body.datasetRevision, `${DATASET_TEST_BUILD}:${DATASET_TEST_BUILD}:${DATASET_TEST_BUILD}`);
        const afterGoal = await api('/goals?character=42');
        assert.equal(afterGoal.body.filter(row => row.id === goal.body.id).length, 1);
        const afterSession = await api('/sessions?character=42');
        assert.equal(afterSession.body.items.filter(row => row.id === sessionId && row.ended === null).length, 1);
        const afterWrite = await api('/settings', 'PUT', { theme: 'mint' }); assert.equal(afterWrite.status, 200);
        connection.connect();
        newSSE = await openSSE(origin + '/api/events', { Cookie: cookie }, coordinate);
        newOBS = await openSSE(streamOrigin + '/events', {}, event => mark('new-obs:' + event.name));
        await until(() => completions.length === 1 && newOBS.events.some(event => event.name === 'state'), 'client coordinated recovery');
        assert.equal(connection.state.phase, 'idle');
        assert.deepEqual(refreshes, [restored.body.datasetRevision]);
        assert.deepEqual(completions, [restored.body.datasetRevision]);
        const obsStates = [...oldOBS.events, ...newOBS.events].filter(event => event.name === 'state');
        assert.ok(obsStates.length >= 2 && obsStates.every(event => event.data.opsec.hidden === true));
        const exported = await api('/export'); assert.equal(exported.status, 200);
        const shipEvents = exported.body.events.filter(event => event.type === 'ship.changed' && JSON.parse(event.payload).ship_type_id === 910002);
        const goalEvents = exported.body.events.filter(event => event.type === 'goal.created' && JSON.parse(event.payload).goal_id === goal.body.id);
        assert.equal(goalEvents.length, 1);
        const files = await readdir(join(dataDir, 'datasets'));
        const generations = files.filter(name => /^build-/.test(name));
        assert.equal(generations.length, 1); assert.equal(files.includes('pending.json'), false);
        const active = JSON.parse(await readFile(join(dataDir, 'datasets', 'active.json'), 'utf8'));
        assert.equal(active.build, DATASET_TEST_BUILD); assert.equal(active.directory, generations[0]);
        let sessionSecretOnDatasetDisk = false;
        for (const file of files.filter(name => name.endsWith('.json'))) {
            const data = await readFile(join(dataDir, 'datasets', file), 'utf8');
            sessionSecretOnDatasetDisk ||= data.includes(csrf) || data.includes(cookie.split('=')[1]);
        }
        assert.equal(sessionSecretOnDatasetDisk, false);
        const oldSummary = childSummaries.find(row => row.generation === 1);
        assert.equal(oldSummary.externalNetworkAttempts, 0);
        if (label === 'drain-accepted') {
            assert.equal(shipEvents.length, 1);
            assert.equal(oldSummary.postCloseOperations.length, 0);
            assert.equal(oldSummary.errors.length, 0);
            assert.equal(oldSummary.exitGraceUsed, false);
        } else {
            assert.equal(shipEvents.length, 0, 'Diagnostic expects the presently known dropped semantic event.');
            assert.ok(oldSummary.postCloseOperations.length > 0, 'Forced late response must expose actual operations after close.');
            assert.ok(oldSummary.errors.some(error => error.code === 'ERR_INVALID_STATE'));
            assert.equal(oldSummary.exitGraceUsed, true);
        }
        return { label, completed: true, classification: label === 'late-bus' ? 'known-ownership-gap-reproduced; NOT a safe-shutdown pass' : 'accepted-handler-drain-and-reconnect-controls-passed',
            assertionsPassed: true, acceptedGoalStatus: goal.status, acceptedReadStatus: detail.status, newWriteDuringCloseStatus: refused.status,
            activeSessionRetained: true, goalRowsRetained: 1, goalEventsRetained: goalEvents.length, shipEventsRetained: shipEvents.length,
            sameCookieAccepted: restored.status === 200, csrfPreserved: restored.body.csrf === csrf, postRestartCSRFWriteStatus: afterWrite.status,
            oldExitedBeforeNewFork: true, distinctPIDs: true, newGenerationBuild: active.build, retainedGenerationCount: generations.length,
            plannedNoticeBeforeClose: true, connectionStates, refreshes, completions, allOBSStatesProtected: true,
            sessionSecretOnDatasetDisk, oldChild: oldSummary, trace, stderr };
    } catch (error) {
        error.probeContext = { label, trace, childSummaries, stderr };
        throw error;
    } finally {
        for (const key of ['accepted-goal', 'accepted-read', 'bus-names']) if (children[0]?.connected) control('release', [key]);
        await Promise.allSettled([goalRequest, detailRequest]);
        connection?.dispose();
        await Promise.allSettled([oldSSE?.close(), oldOBS?.close(), newSSE?.close(), newOBS?.close()]);
        await supervisor?.close(); await supervisor?.done;
        await rm(dataDir, { recursive: true, force: true });
    }
}

try {
    const manifest = JSON.parse(await readFile(new URL('analysis/rc16/rc16-source-manifest.json', root), 'utf8'));
    output.sourceCommit = manifest.sourceCommit;
    const sources = ['server/runtime-supervisor.mjs', 'server/runtime-child.mjs', 'server/index.mjs', 'server/core.mjs', 'server/store.mjs',
        'server/esi.mjs', 'server/bus.mjs', 'server/universe-history.mjs', 'server/datasets.mjs', 'components/kairo/dataset-connection.mjs',
        'tests/helpers/dataset-fixture.mjs', 'analysis/rc16/followup/harness/restart-child.mjs', 'analysis/rc16/followup/harness/restart-integrated.mjs'];
    output.sources = await Promise.all(sources.map(async path => ({ path, sha256: createHash('sha256').update(await readFile(new URL(path, root))).digest('hex') })));
    for (const label of ['drain-accepted', 'late-bus']) output.scenarios.push(await scenario(label));
    output.completed = true;
    output.safetyConclusion = 'Tracked HTTP drain and reconnect controls passed; forced-late asynchronous bus work still lacks ownership. Do not interpret diagnostic assertion success as lossless shutdown.';
} catch (error) {
    output.completed = false;
    output.error = { name: error.name, message: error.message, stack: error.stack, context: error.probeContext };
    process.exitCode = 1;
}
output.finishedAt = new Date().toISOString();
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
