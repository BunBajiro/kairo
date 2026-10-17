/**
 * Lean process owner for the launcher: acquire the exclusive data lease, select
 * immutable static data, start one child, and replace it only after accepted work
 * drains. No Core/static indexes are imported here. Lifecycle: docs/ARCHITECTURE.md;
 * generation publication and rollback: docs/DATASETS.md.
 */
import { fork, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defaultDataDirectory } from './dataset-paths.mjs';
import { acquireRuntimeLock } from './runtime-lock.mjs';

const childFile = fileURLToPath(new URL('./runtime-child.mjs', import.meta.url));
function deferred() {
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    // A child can exit before its lifecycle owner gets to await this phase.
    promise.catch(() => {});
    return { promise, resolve, reject };
}
async function bounded(promise, milliseconds, message) {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]); }
    finally { clearTimeout(timer); }
}
function launchBrowser(origin) {
    const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const browser = spawn(command, [origin], { stdio: 'ignore', detached: true });
    browser.on('error', () => {});
    browser.unref();
}

/**
 * Start the runtime and resolve {close, done} after activation. close() is an
 * idempotent awaited shutdown; done resolves 0 on orderly completion or rejects on
 * lifecycle failure. Keep the supervisor alive while done is pending.
 *
 * options.dataDir defaults to the platform directory; runtimeOptions go to the
 * child, while storage/forkRuntime/acquireLock are lifecycle test seams. Default
 * startup/shutdown deadlines are 60/30 seconds (options are milliseconds).
 * manageProcess:false leaves signal handling to the caller. openBrowser is false
 * by default and, when enabled, opens only on the first successful activation.
 */
export async function runKairoSupervisor(options = {}) {
    const dataDir = options.dataDir || defaultDataDirectory();
    // Acquire before even inspecting pending data: a second launch must never
    // clean a download or a generation belonging to the running application.
    const lease = (options.acquireLock || acquireRuntimeLock)(dataDir);
    let storage;
    try {
        if (options.storage) storage = options.storage;
        else {
            const module = await import('./datasets.mjs');
            storage = { prepare: module.prepareDatasetRuntime, commit: module.commitDatasetRuntime, rollback: module.rollbackDatasetRuntime };
        }
    } catch (error) { lease.close(); throw error; }
    const forkRuntime = options.forkRuntime || fork;
    const logger = options.logger || console;
    const startupTimeout = options.startupTimeout ?? 60_000;
    const shutdownTimeout = options.shutdownTimeout ?? 30_000;
    const completion = deferred();
    let current, updating = false, closing = false, finished = false, opened = false, closingPromise, startupTask, updateTask;
    const signals = [];
    function finish(error) {
        if (finished) return;
        finished = true;
        for (const [signal, handler] of signals) process.removeListener(signal, handler);
        lease.close();
        error ? completion.reject(error) : completion.resolve(0);
    }
    function send(record, message) {
        if (record.exited || record.process.connected === false) throw new Error('The Kairo runtime disconnected.');
        record.process.send(message, error => {
            if (error && !record.stopping) record.ready.reject(error);
        });
    }
    // Set selection before child imports. Browser cookies/CSRF travel only through
    // private IPC, never argv, environment variables, dataset files or log output.
    function spawnGeneration(selected, initialSessions, datasetRecovery) {
        const env = { ...process.env, KAIRO_DATA_DIR: dataDir, KAIRO_RUNTIME_CHILD: '1' };
        if (selected?.directory) env.KAIRO_SDE_DIRECTORY = selected.directory;
        else delete env.KAIRO_SDE_DIRECTORY;
        const processChild = forkRuntime(childFile, [], {
            env, stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
            execArgv: options.execArgv || process.execArgv.filter(arg => !arg.startsWith('--test')),
        });
        const record = { process: processChild, selected, ready: deferred(), stopped: deferred(), exit: deferred(), stopping: false, activated: false, exited: false, sessions: [] };
        current = record;
        processChild.on('message', message => {
            if (!message || typeof message !== 'object') return;
            if (message.type === 'ready') record.ready.resolve(message);
            else if (message.type === 'startup-error') {
                const error = new Error(message.error || 'Kairo could not start.'); error.code = message.code;
                record.ready.reject(error);
            } else if (message.type === 'stopped') {
                record.sessions = Array.isArray(message.sessions) ? message.sessions : [];
                record.stopped.resolve(record.sessions);
            } else if (message.type === 'shutdown-error') record.stopped.reject(new Error(message.error || 'Kairo could not finish saving.'));
            else if (message.type === 'dataset-ready' && current === record && record.activated && !closing) void update(record);
            else if (message.type === 'dataset-error') logger.error?.(`Dataset updates: ${message.error}`);
        });
        processChild.on('error', error => { record.ready.reject(error); record.stopped.reject(error); });
        const exited = (code, signal) => {
            if (record.exited) return;
            record.exited = true;
            const error = new Error(`Kairo core stopped unexpectedly${signal ? ` (${signal})` : ` (exit ${code})`}.`);
            record.ready.reject(error);
            record.stopped.reject(error);
            record.exit.resolve({ code, signal });
            if (record === current && record.activated && !record.stopping && !closing) finish(error);
        };
        processChild.once('exit', exited);
        // Failed process creation emits error/close without an exit event.
        processChild.once('close', exited);
        try { send(record, { type: 'start', initialSessions, datasetRecovery, options: options.runtimeOptions || {} }); }
        catch (error) { record.ready.reject(error); }
        return record;
    }
    async function terminate(record) {
        if (!record || record.exited) return;
        record.stopping = true;
        record.process.kill('SIGKILL');
        await bounded(record.exit.promise, 5_000, 'Kairo core did not stop after shutdown.');
    }
    function stop(record, reason) {
        if (record?.stopPromise) return record.stopPromise;
        const stopping = stopOnce(record, reason);
        if (record) record.stopPromise = stopping;
        return stopping;
    }
    // A saved acknowledgment is insufficient if the process still owns resources.
    // Require both acknowledgment and exit before another child can start; forced
    // termination on deadline is a failed handoff, never a successful save.
    async function stopOnce(record, reason) {
        if (!record || record.exited) return record?.sessions || [];
        record.stopping = true;
        try {
            send(record, { type: 'stop', reason });
            const sessions = await bounded(record.stopped.promise, shutdownTimeout, 'Kairo core took too long to finish saving.');
            await bounded(record.exit.promise, 5_000, 'Kairo core did not exit after saving.');
            return sessions;
        } catch (error) { await terminate(record); throw error; }
    }
    // Child readiness precedes the durable pointer commit. Automatic updater work
    // starts only after commit, so it cannot clean or supersede its own activation.
    async function activate(selected, sessions = [], recovery = null) {
        const record = spawnGeneration(selected, sessions, recovery);
        let committed = false;
        try {
            const ready = await bounded(record.ready.promise, startupTimeout, 'Kairo core took too long to start.');
            if (closing) throw new Error('Kairo is shutting down.');
            if (selected?.pending) { await storage.commit(dataDir, selected); committed = true; }
            record.activated = true;
            send(record, { type: 'activated' });
            if (!opened) {
                opened = true;
                logger.log?.(`\nKAIRO — Capsuleer operations\n\nDashboard: ${ready.origin}\nOBS source: ${ready.streamOrigin}/stream\n\nLocal access only. Keep this window open while using Kairo.\n`);
                if (typeof options.openBrowser === 'function') options.openBrowser(ready.origin);
                else if (options.openBrowser) launchBrowser(ready.origin);
            }
            return record;
        } catch (error) {
            // Once active.json is published, the previous generation can have
            // been retired. A subsequent IPC failure must not remove this one.
            if (committed) error.datasetCommitted = true;
            await terminate(record); throw error;
        }
    }
    // Exactly one fallback attempt for an uncommitted pending generation. Do not
    // loop on unexpected exits or roll back after the old payload can be retired.
    async function activateWithRecovery(selected, sessions) {
        try { return await activate(selected, sessions); }
        catch (error) {
            if (closing || !selected?.pending || error.datasetCommitted) throw error;
            logger.error?.(`The new dataset could not start; restoring the previous dataset. ${error.message}`);
            const previous = await storage.rollback(dataDir, selected);
            return activate(previous, sessions, { failedBuild: selected.manifest?.build || null, message: error.message });
        }
    }
    function update(record) {
        if (updating || closing || record !== current) return;
        updating = true;
        updateTask = (async () => {
            let stopped = false;
            try {
                const selected = await storage.prepare(dataDir);
                if (closing || record !== current) return;
                if (!selected?.pending || selected.directory === record.selected?.directory) throw new Error('The prepared dataset is no longer available. Kairo is continuing with its current dataset.');
                const sessions = await stop(record, 'update');
                stopped = true;
                if (!closing) await activateWithRecovery(selected, sessions);
            } catch (error) {
                if (!closing && !stopped && !record.exited) {
                    try { send(record, { type: 'restart-cancelled', error: error.message }); }
                    catch { await terminate(record); finish(error); }
                } else if (!closing) finish(error);
            } finally { updating = false; }
        })();
        return updateTask;
    }
    // Stop promptly, then join startup/update ownership: either may have crossed
    // an await and installed a different current child before observing closing.
    async function close() {
        if (closingPromise) return closingPromise;
        closing = true;
        closingPromise = (async () => {
            const earlyStop = stop(current, 'shutdown');
            earlyStop.catch(() => {});
            try { await startupTask?.catch(() => {}); await updateTask; await earlyStop; await stop(current, 'shutdown'); finish(); }
            catch (error) { finish(error); throw error; }
        })();
        return closingPromise;
    }
    if (options.manageProcess !== false) {
        for (const signal of ['SIGINT', 'SIGTERM']) {
            const handler = () => { void close().catch(error => logger.error?.(error.message)); };
            process.on(signal, handler); signals.push([signal, handler]);
        }
    }
    startupTask = (async () => {
        const selected = await storage.prepare(dataDir);
        if (closing) return;
        await activateWithRecovery(selected, []);
    })();
    try { await startupTask; }
    catch (error) { finish(error); throw error; }
    return { close, done: completion.promise };
}
