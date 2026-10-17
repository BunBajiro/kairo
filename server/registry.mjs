/**
 * Trusted local extension discovery and lifecycle, separate from built-in ESI
 * collectors. Descriptors and the executable example live in docs/INTERNAL-API.md.
 */
import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
/**
 * Import .mjs defaults from directory and activate enabled descriptors. Context
 * contains shared Store/DB/ESI/bus owners; modules are not sandboxed. register(ctx)
 * and migrate(db) must be synchronous; register may return an async disposer.
 * ctx.on subscriptions are removed on disable, failed registration and close.
 *
 * Migrations run once per module ID/version, only for activating register hooks;
 * modules own any required SQL transaction. Descriptor scopes/datasets are
 * metadata, not additions to Core collectors or the OAuth allowlist. Discovery
 * or activation errors reject; completed activations are cleaned up on failure.
 */
export async function createRegistry(directory, context) {
    const modules = [], disposers = new Map(), pending = new Set(), cleanupErrors = [];
    let closed = false, closing, failures = 0;
    function failed(error) { failures++; cleanupErrors.push(error); if (cleanupErrors.length > 20) cleanupErrors.shift(); }
    // Disable removes subscriptions immediately; returned cleanup is retained
    // until close. Re-enable need not await an earlier disposer, so extensions
    // must retain ownership of their own retiring resources.
    function dispose(id) {
        const stop = disposers.get(id);
        if (!stop) return;
        disposers.delete(id);
        try {
            const task = Promise.resolve(stop()).catch(failed).finally(() => pending.delete(task));
            pending.add(task);
        } catch (error) { failed(error); }
    }
    /** Stop activation, dispose once, drain all cleanup, then report failures. */
    function close() {
        if (!closing) {
            closed = true;
            closing = (async () => {
                for (const id of disposers.keys()) dispose(id);
                while (pending.size) await Promise.all([...pending]);
                if (failures) throw new AggregateError(cleanupErrors, `Module cleanup failed (${failures} errors).`);
            })();
        }
        return closing;
    }
    for (const file of await readdir(directory)) {
        if (!file.endsWith('.mjs'))
            continue;
        const m = (await import(pathToFileURL(join(directory, file)).href)).default;
        if (!m)
            continue;
        if (!/^[a-z][\w-]*$/.test(m.id) || modules.some(x => x.id === m.id))
            throw new Error('Invalid or duplicate module id.');
        modules.push(m);
    }
    const enabled = m => context.store.get('module:' + m.id, true);
    function activate(m) { if (m.register && !disposers.has(m.id) && enabled(m)) {
        const unsub = [];
        const ctx = { ...context, on: (type, fn) => { const off = context.bus.on(type, fn); unsub.push(off); return off; }, publish: e => context.publish({ ...e, module: m.id }), get: (key, fallback) => { const row = context.db.prepare('SELECT value FROM module_data WHERE module=? AND key=?').get(m.id, key); return row ? JSON.parse(row.value) : fallback; }, set: (key, val) => context.db.prepare('INSERT INTO module_data VALUES(?,?,?) ON CONFLICT(module,key) DO UPDATE SET value=excluded.value').run(m.id, key, JSON.stringify(val)) };
        if (m.migrate) {
            const key = 'module:' + m.id + ':' + m.version;
            if (!context.db.prepare('SELECT id FROM migrations WHERE id=?').get(key)) {
                m.migrate(ctx.db);
                context.db.prepare('INSERT INTO migrations VALUES(?,?)').run(key, new Date().toISOString());
            }
        }
        try {
            const stop = m.register(ctx);
            disposers.set(m.id, () => { unsub.forEach(f => f()); return stop?.(); });
        } catch (error) { unsub.forEach(f => f()); throw error; }
    } }
    try { modules.forEach(activate); }
    catch (error) {
        try { await close(); } catch (cleanupError) {
            // A cleanup failure must not replace the activation error/code.
            try { Object.defineProperty(error, 'cleanupErrors', {value: [...(error.cleanupErrors || []), cleanupError], configurable: true}); } catch {}
        }
        throw error;
    }
    // toggle persists the preference before activation and is not an async
    // cleanup barrier. pages reflects current preferences; read is invoked by
    // the private HTTP dispatcher, with the selected pilot passed explicitly.
    return { modules, enabled, toggle(id, value) { if (closed) throw new Error('The module registry is closed.'); const m = modules.find(m => m.id === id); if (!m)
            throw new Error('Module not found.'); context.store.set('module:' + id, value); if (value)
            activate(m);
        else {
            dispose(id);
        } }, pages: () => modules.filter(enabled).filter(m => m.page).map(m => ({ id: m.id, ...m.page })), close };
}
