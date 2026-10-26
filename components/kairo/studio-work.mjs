// The preview endpoint reads binding identity only. Layout, wording and notification
// edits remain local drafts and do not invalidate those server projections.
/**
 * Produce the JSON binding-input key shared by preview reads and source filters.
 * Exclude non-bound/decorative elements; geometry and wording cannot trigger a new
 * projection request. Consumers of this key expect its JSON array shape.
 */
export function studioProjectionKey(elements) {
    return JSON.stringify(elements.filter(e => e.binding && e.binding !== 'none' && !['opsec', 'divider', 'clock'].includes(e.kind)).map(({id, kind, binding, characterId, sourceId, bindingDisplay}) => ({id, kind, binding, characterId, sourceId, bindingDisplay})));
}

// One pending point per animation frame; finishing commits the pointer-up point
// immediately, even when the browser has not delivered its scheduled frame.
/**
 * Coalesce pointer moves to a single frame. finish flushes the latest pending point
 * (or its explicit final point); cancel drops it. The editor owns pointer capture
 * and must cancel on disposal. Coordinates already use canonical canvas pixels.
 */
export function createStudioDrag({commit, requestFrame, cancelFrame}) {
    let frame = null, point = null;
    const apply = () => {frame = null; const next = point; point = null; if (next) commit(next);};
    return {
        move(next) {point = next; if (frame === null) frame = requestFrame(apply);},
        finish(next) {if (frame !== null) cancelFrame(frame); frame = null; if (next) point = next; apply();},
        cancel() {if (frame !== null) cancelFrame(frame); frame = null; point = null;},
    };
}
/**
 * Convert a client-pixel delta to the 1920 × 1080 canvas, snap to a 4-pixel grid and
 * clamp the whole widget inside it. Return null for zero-size preview bounds.
 */
export function studioDragPoint(drag, clientX, clientY, bounds) {
    if (!bounds.width || !bounds.height) return null;
    const x = Math.round((drag.x + (clientX - drag.px) / bounds.width * 1920) / 4) * 4;
    const y = Math.round((drag.y + (clientY - drag.py) / bounds.height * 1080) / 4) * 4;
    return {id: drag.id, x: Math.max(0, Math.min(1920 - drag.width, x)), y: Math.max(0, Math.min(1080 - drag.height, y))};
}

// A single transport owner keeps the newest invalidation and rejects an older
// result as soon as the inputs change, including while the debounce is pending.
/**
 * Debounce inputs by delay milliseconds (default 200), allowing one read at a time.
 * Only the latest requested generation may publish a result or error; changing the
 * input retires the old generation immediately. close drops scheduled work and
 * fences transport still in flight. See ../../docs/INTERNAL-API.md.
 */
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
/**
 * Decide whether an SSE-derived notification affects any binding encoded by
 * studioProjectionKey. Honor explicit pilot ownership and avoid layout-only reads;
 * untyped/recovery notifications conservatively refresh configured bindings.
 */
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
/**
 * Build the selected-pilot input dependency from relevant snapshot metadata and
 * Session fields. Other pilots arrive through source events; this is not a complete
 * cache key or a replacement for studioSourceChanged/reconnect recovery.
 */
export function studioSourceRevision(key, character, data, sessions) {
    const elements = JSON.parse(key).filter(e => !e.characterId || e.characterId === character);
    const goal = elements.some(e => e.binding.startsWith('goal'));
    const keys = new Set(elements.flatMap(e => snapshotKeys[e.binding] || []));
    return JSON.stringify([
        Object.entries(data).filter(([name]) => goal || keys.has(name)).map(([name, value]) => [name, value.status, value.updatedAt, value.expiresAt]),
        elements.some(e => e.binding.startsWith('session.')) ? sessions.map(s => [s.id, s.started, s.ended, s.label]) : [],
    ]);
}
