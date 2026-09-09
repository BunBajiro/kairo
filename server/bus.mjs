export function createBus() { const listeners = new Map(); return { on(type, fn) { if (!listeners.has(type))
        listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type)?.delete(fn); }, emit(event) { for (const fn of [...(listeners.get(event.type) || []), ...(listeners.get('*') || [])]) {
        try {
            Promise.resolve(fn(event)).catch(() => { });
        }
        catch { }
    } } }; }
