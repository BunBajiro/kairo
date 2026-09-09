import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
export async function createRegistry(directory, context) {
    const modules = [], disposers = new Map();
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
        const stop = m.register(ctx);
        disposers.set(m.id, () => { unsub.forEach(f => f()); stop?.(); });
    } }
    modules.forEach(activate);
    return { modules, enabled, toggle(id, value) { const m = modules.find(m => m.id === id); if (!m)
            throw new Error('Module not found.'); context.store.set('module:' + id, value); if (value)
            activate(m);
        else {
            disposers.get(id)?.();
            disposers.delete(id);
        } }, pages: () => modules.filter(enabled).filter(m => m.page).map(m => ({ id: m.id, ...m.page })), close() { for (const stop of disposers.values())
            stop(); } };
}
