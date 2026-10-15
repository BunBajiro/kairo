// Coordinates the deliberate core restart without replacing the mounted workspace.
// SSE announces intent before disconnect, then proves the entire data generation
// after reconnect. An open socket by itself is not proof of a successful update.
export function createDatasetConnection({ revision: initialRevision = '', onState = () => {}, refresh, onComplete = () => {}, seenRecovery = () => false, rememberRecovery = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, timeoutMs = 90_000 } = {}) {
    let revision = initialRevision, pending = null, connected = true, disconnected = false, refreshAfterReconnect = false;
    let state = { phase: 'idle', build: null, message: '' }, timer = null, generation = 0, disposed = false, refreshingRevision = null;
    const publish = next => { state = next; if (!disposed) onState(state); };
    const clearDeadline = () => { if (timer !== null) clearTimer(timer); timer = null; };
    const armDeadline = () => {
        clearDeadline();
        timer = setTimer(() => { timer = null; if (pending && !disposed) publish({ phase: 'delayed', build: pending.build, message: 'The dataset update is taking longer than expected. Your workspace is still here.' }); }, timeoutMs);
    };
    const invalidate = () => { generation++; refreshingRevision = null; };
    async function receive({ revision: nextRevision, recovery = null } = {}) {
        if (disposed || !nextRevision || typeof nextRevision !== 'string') return;
        const target = pending;
        const matches = target && nextRevision.split(':').length === 3 && nextRevision.split(':').every(build => build === String(target.build));
        // A same-build retry must really reconnect; pre-restart revision messages
        // and partial generations must never dismiss the update notice.
        if (target && !recovery && (!matches || (nextRevision === revision && !disconnected))) return;
        const recoveryKey = recovery ? `${recovery.failedBuild || ''}:${recovery.message || ''}` : null;
        const showRecovery = recoveryKey && !seenRecovery(recoveryKey);
        if (!target && nextRevision === revision && !showRecovery && !refreshAfterReconnect) return;
        if (refreshingRevision === nextRevision) return;
        const token = ++generation;
        refreshingRevision = nextRevision;
        if (target && state.phase !== 'delayed') publish({ phase: 'refreshing', build: target.build, message: '' });
        const isCurrent = () => !disposed && token === generation;
        try {
            await refresh(nextRevision, isCurrent);
            if (!isCurrent()) return;
            const changed = revision !== nextRevision;
            revision = nextRevision; pending = null; disconnected = false; refreshAfterReconnect = false; refreshingRevision = null; clearDeadline();
            if (showRecovery) {
                rememberRecovery(recoveryKey);
                publish({ phase: 'warning', build: recovery.failedBuild || null, message: recovery.message || 'The dataset update could not be activated. Kairo restored the previous dataset.' });
            } else {
                publish({ phase: 'idle', build: null, message: '' });
                if (!recovery && (target || changed)) onComplete(nextRevision);
            }
        } catch {
            if (!isCurrent()) return;
            refreshingRevision = null;
            publish({ phase: 'delayed', build: pending?.build || null, message: 'Kairo reconnected, but the updated workspace could not be loaded. Retry when the core is ready.' });
        }
    }
    return {
        get state() { return state; },
        restarting({ build, startedAt } = {}) {
            if (disposed || !Number.isSafeInteger(Number(build)) || Number(build) <= 0) return;
            if (pending?.build === Number(build) && pending.startedAt === startedAt) return;
            invalidate(); pending = { build: Number(build), startedAt }; disconnected = false;
            publish({ phase: 'restarting', build: pending.build, message: '' }); armDeadline();
        },
        connect() { connected = true; },
        disconnect() { if (connected) invalidate(); connected = false; refreshAfterReconnect = true; if (pending) disconnected = true; },
        revision: receive,
        cancelled({ message } = {}) {
            invalidate(); pending = null; disconnected = false; clearDeadline();
            publish({ phase: 'warning', build: null, message: message || 'The dataset update was postponed. Kairo is continuing with the current dataset.' });
        },
        retry() { if (pending) { invalidate(); publish({ phase: 'restarting', build: pending.build, message: '' }); armDeadline(); } },
        dismiss() { if (state.phase === 'warning') publish({ phase: 'idle', build: null, message: '' }); },
        dispose() { disposed = true; invalidate(); clearDeadline(); },
    };
}
