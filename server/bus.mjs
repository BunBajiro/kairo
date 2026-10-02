export function createBus() {
    const listeners = new Map(), pending = new Set(), recentErrors = [];
    let failures = 0, closed = false, closing;
    function failed(event, error) {
        recentErrors.push({sequence: ++failures, type: String(event.type).slice(0, 100), message: String(error?.message || error).slice(0, 500)});
        if (recentErrors.length > 20) recentErrors.shift();
    }
    function health() { return {pending: pending.size, failures, recentErrors: recentErrors.map(error => ({...error}))}; }
    async function drain() {
        // A listener can publish another event after an await. Keep its children
        // owned too; callers must stop producers before relying on this barrier.
        while (pending.size) await Promise.all([...pending]);
        return health();
    }
    return {
        on(type, fn) {
            if (closed) throw new Error('The event bus is closed.');
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
            return () => listeners.get(type)?.delete(fn);
        },
        emit(event) {
            if (closed) throw new Error('The event bus is closed.');
            for (const fn of [...(listeners.get(event.type) || []), ...(listeners.get('*') || [])]) {
                try {
                    const result = fn(event);
                    if (result && typeof result.then === 'function') {
                        const task = Promise.resolve(result).catch(error => failed(event, error)).finally(() => pending.delete(task));
                        pending.add(task);
                    }
                } catch (error) { failed(event, error); }
            }
        },
        health, drain,
        close() {
            if (!closing) closing = (async () => { await drain(); closed = true; listeners.clear(); return health(); })();
            return closing;
        },
    };
}
