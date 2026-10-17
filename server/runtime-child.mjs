/**
 * Private IPC adapter between the supervisor and one runtime generation. Each
 * child has isolated module/static-index caches and uses the same durable data
 * directory; browser sessions cross replacements in memory over IPC only.
 * Lifecycle ordering: docs/ARCHITECTURE.md and docs/DATASETS.md.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/**
 * Install one child's lifecycle handlers and return its stop entrypoint.
 * `start` admits startup once; `ready` means listeners opened, while the later
 * `activated` message permits automatic dataset work only after parent commit.
 * Parent disconnect/SIGINT/SIGTERM all request shutdown.
 *
 * stop() drains accepted startup and app.close() before acknowledging `stopped`.
 * An update transfers browser sessions only after that drain. shutdownTimeout is
 * milliseconds (30 seconds by default); cleanup failure/deadline exits nonzero
 * without a successful handoff. channel/loadRuntime/exit are injectable for tests.
 */
export function runRuntimeChild({ channel = process, loadRuntime = () => import('./index.mjs'), exit = code => process.exit(code), shutdownTimeout = 30_000 } = {}) {
    let app, starting = false, stopping = false, activated = false, startup;
    const send = (message, callback) => {
        if (!channel.connected || typeof channel.send !== 'function') return callback?.();
        try { channel.send(message, callback || (() => {})); } catch { callback?.(); }
    };
    // The first stop owns the drain. Duplicate signals return promptly; the parent
    // waits for acknowledgment AND process exit rather than awaiting this twice.
    async function stop(reason = 'shutdown') {
        if (stopping) return;
        stopping = true;
        const deadline = setTimeout(() => exit(1), shutdownTimeout);
        deadline.unref?.();
        try {
            // Startup can already own resources before it returns the app. Drain
            // that owner before claiming the child has saved and stopped.
            await startup?.catch(error => {
                if (error?.cleanupErrors?.length) throw new AggregateError(error.cleanupErrors,
                    'Kairo startup cleanup failed (' + error.message + '): ' + error.cleanupErrors.map(cause => cause?.message || String(cause)).join('; '), {cause: error});
            });
            await app?.close();
            const sessions = reason === 'update' ? app?.exportSessions?.() || [] : [];
            send({ type: 'stopped', sessions }, () => {
                clearTimeout(deadline);
                if (channel.connected) channel.disconnect?.();
                exit(0);
            });
        } catch (error) {
            send({ type: 'shutdown-error', error: error.message }, () => exit(1));
        }
    }
    async function message(message) {
        if (!message || typeof message !== 'object') return;
        if (message.type === 'start' && !starting && !stopping) {
            starting = true;
            try {
                startup = Promise.resolve().then(async () => {
                    const { startKairo } = await loadRuntime();
                    if (stopping) return;
                    const options = message.options || {};
                    app = await startKairo({
                        ...options,
                        dataDir: process.env.KAIRO_DATA_DIR,
                        initialSessions: message.initialSessions || [],
                        datasetRecovery: message.datasetRecovery || null,
                        deferDatasetStart: true,
                        onDatasetsReady: () => send({ type: 'dataset-ready' }),
                    });
                });
                await startup;
                if (stopping) return;
                send({ type: 'ready', origin: app.origin, streamOrigin: app.streamOrigin });
            } catch (error) {
                if (!stopping) send({ type: 'startup-error', error: error.message, code: error.code }, () => exit(1));
            }
        } else if (message.type === 'activated' && app && !activated && !stopping) {
            activated = true;
            try { await app.startDatasetUpdates?.(); }
            catch (error) { send({ type: 'dataset-error', error: error.message }); }
        } else if (message.type === 'restart-cancelled' && app && !stopping) {
            app.cancelDatasetRestart?.(new Error(message.error || 'The dataset update could not be activated.'));
        } else if (message.type === 'stop') {
            await stop(message.reason);
        }
    }
    channel.on('message', message);
    channel.once('disconnect', () => { void stop(); });
    channel.once('SIGTERM', () => { void stop(); });
    channel.once('SIGINT', () => { void stop(); });
    return { stop };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (typeof process.send !== 'function') throw new Error('Start Kairo through server/index.mjs.');
    runRuntimeChild();
}
