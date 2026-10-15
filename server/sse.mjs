// A response may contain one large snapshot without being a slow consumer.
// Keep writes small, respect drain, and bound only the work waiting behind it.
const writers = new WeakMap();
const chunkBytes = 64 * 1024;
const defaults = {maxQueuedBytes: 16 * 1024 * 1024, maxQueuedFrames: 128, stallTimeoutMs: 15_000};
export const sseHeartbeat = Buffer.from(': heartbeat\n\n');
export const sseConnected = Buffer.from(': connected\n\n');
export function sseEvent(type, data) { return Buffer.from(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); }

function writer(response, options) {
    if (writers.has(response)) return writers.get(response);
    const limits = {...defaults, ...options};
    let active = null, offset = 0, queue = [], queuedBytes = 0;
    let blocked = false, closing = false, ended = !!response.writableEnded, closed = false, deadline, closeDeadline;
    let resolveClosed;
    const done = new Promise(resolve => { resolveClosed = resolve; });
    function finish() {
        if (closed) return;
        closed = true; clearTimeout(deadline); clearTimeout(closeDeadline); deadline = closeDeadline = null;
        active = null; queue = []; queuedBytes = 0;
        response.off('drain', drained); response.off('close', finish); response.off('finish', finish);
        resolveClosed();
    }
    function abort() { finish(); response.destroy(); }
    function armDeadline() {
        if (deadline) return;
        deadline = setTimeout(abort, limits.stallTimeoutMs);
        deadline.unref?.();
    }
    function pump() {
        if (closed || blocked) return;
        try {
            while (active || queue.length) {
                if (!active) { active = queue.shift(); queuedBytes -= active.length; offset = 0; }
                const end = Math.min(offset + chunkBytes, active.length);
                const chunk = active.subarray(offset, end);
                offset = end;
                if (offset === active.length) active = null;
                // Buffer slices preserve UTF-8 even when a character spans writes.
                const ready = response.write(chunk);
                if (closed) return;
                if (ready === false) { blocked = true; armDeadline(); return; }
            }
            if (closing && !ended) { ended = true; armDeadline(); response.end(); }
        } catch { abort(); }
    }
    function drained() { blocked = false; clearTimeout(deadline); deadline = null; pump(); }
    response.on('drain', drained);
    response.once('close', finish);
    response.once('finish', finish);
    // Responses can emit error before close; never allow a failed client to
    // escape into the collector that is broadcasting to the other clients.
    response.once('error', abort);
    const result = {
        write(frame, {heartbeat = false, requireImmediate = false} = {}) {
            if (closed || closing || response.destroyed || response.writableEnded) return false;
            // OBS must fail closed instead of leaving an old visible state on
            // screen while a protection transition waits behind stale traffic.
            if (requireImmediate && (active || queue.length || blocked)) { abort(); return false; }
            if (heartbeat && (active || queue.length || blocked)) return true;
            const buffer = Buffer.isBuffer(frame) ? frame : Buffer.from(frame);
            if (!active && !blocked && !queue.length) {
                // This sole active frame may exceed the waiting-work budget.
                // It is shared by a broadcast, not copied into each response.
                active = buffer; offset = 0;
            } else {
                if (queue.length >= limits.maxQueuedFrames || queuedBytes + buffer.length > limits.maxQueuedBytes) { abort(); return false; }
                queue.push(buffer); queuedBytes += buffer.length;
            }
            pump(); return !closed;
        },
        close() {
            if (!closed && !closing) {
                closing = true;
                // A trickling reader must not extend shutdown indefinitely.
                closeDeadline = setTimeout(abort, limits.stallTimeoutMs);
                closeDeadline.unref?.();
                pump();
            }
            return done;
        },
    };
    writers.set(response, result);
    if (response.destroyed || response.writableFinished) finish();
    return result;
}

export function writeSSE(response, frame, options) { return writer(response, options).write(frame, options); }
export function heartbeatSSE(response) { return writer(response).write(sseHeartbeat, {heartbeat: true}); }
export function closeSSE(response) { return writer(response).close(); }
