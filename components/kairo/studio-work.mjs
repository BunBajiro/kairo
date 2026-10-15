// The preview endpoint reads binding identity only. Layout, wording and notification
// edits remain local drafts and do not invalidate those server projections.
export function studioProjectionKey(elements) {
    return JSON.stringify(elements.filter(e => e.binding && e.binding !== 'none' && !['opsec', 'divider', 'clock'].includes(e.kind)).map(({id, kind, binding, characterId, sourceId, bindingDisplay}) => ({id, kind, binding, characterId, sourceId, bindingDisplay})));
}

// One pending point per animation frame; finishing commits the pointer-up point
// immediately, even when the browser has not delivered its scheduled frame.
export function createStudioDrag({commit, requestFrame, cancelFrame}) {
    let frame = null, point = null;
    const apply = () => {frame = null; const next = point; point = null; if (next) commit(next);};
    return {
        move(next) {point = next; if (frame === null) frame = requestFrame(apply);},
        finish(next) {if (frame !== null) cancelFrame(frame); frame = null; if (next) point = next; apply();},
        cancel() {if (frame !== null) cancelFrame(frame); frame = null; point = null;},
    };
}
export function studioDragPoint(drag, clientX, clientY, bounds) {
    if (!bounds.width || !bounds.height) return null;
    const x = Math.round((drag.x + (clientX - drag.px) / bounds.width * 1920) / 4) * 4;
    const y = Math.round((drag.y + (clientY - drag.py) / bounds.height * 1080) / 4) * 4;
    return {id: drag.id, x: Math.max(0, Math.min(1920 - drag.width, x)), y: Math.max(0, Math.min(1080 - drag.height, y))};
}

// A single transport owner keeps the newest invalidation and rejects an older
// result as soon as the inputs change, including while the debounce is pending.
export function createStudioPreview({read, publish, onError = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, delay = 200}) {
    let generation = 0, timer = null, running = false, ready = false, pending = null, closed = false;
    async function drain() {
        if (closed || running || !ready) return;
        const input = pending, version = generation; ready = false; running = true;
        try {const value = await read(input); if (!closed && version === generation) publish(value);}
        catch (error) {if (!closed && version === generation) onError(error);}
        finally {running = false; void drain();}
    }
    return {
        request(input) {if (closed) return; generation++; pending = input; ready = false; if (timer !== null) clearTimer(timer); timer = setTimer(() => {timer = null; ready = true; void drain();}, delay);},
        close() {closed = true; generation++; if (timer !== null) clearTimer(timer); timer = null; ready = false; pending = null;},
    };
}
const snapshotKeys = {'training.remaining':['queue'], 'wallet.balance':['wallet'], 'pilot.ship':['ship'], 'industry.next':['jobs']};
export function studioSourceChanged(key, detail = {}) {
    const elements = JSON.parse(key);
    if (!elements.length) return false;
    return elements.some(element => {
        if (detail.characterId && element.characterId && element.characterId !== detail.characterId) return false;
        if (detail.resource === 'snapshot') return element.binding.startsWith('goal') || (snapshotKeys[element.binding] || []).includes(detail.key);
        if (!Array.isArray(detail.resources) || detail.resources.some(resource => ['recovery', 'settings', 'characters'].includes(resource))) return true;
        if (element.binding.startsWith('goal')) return detail.resources.includes('goals');
        if (element.binding.startsWith('session.')) return detail.resources.includes('sessions') || element.binding === 'session.report' && detail.resources.includes('activity');
        return detail.resources.includes('settings') || detail.resources.includes('characters');
    });
}
export function studioSourceRevision(key, character, data, sessions) {
    const elements = JSON.parse(key).filter(e => !e.characterId || e.characterId === character);
    const goal = elements.some(e => e.binding.startsWith('goal'));
    const keys = new Set(elements.flatMap(e => snapshotKeys[e.binding] || []));
    return JSON.stringify([
        Object.entries(data).filter(([name]) => goal || keys.has(name)).map(([name, value]) => [name, value.status, value.updatedAt, value.expiresAt]),
        elements.some(e => e.binding.startsWith('session.')) ? sessions.map(s => [s.id, s.started, s.ended, s.label]) : [],
    ]);
}
