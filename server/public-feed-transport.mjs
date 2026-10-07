import { setTimeout as delay } from 'node:timers/promises';

const POINTER = 'https://r2z2.zkillboard.com/ephemeral/sequence.json';
const packetUrl = /^https:\/\/r2z2\.zkillboard\.com\/ephemeral\/[1-9][0-9]{0,14}\.json$/;
const MAX_BODY = 4 * 1024 * 1024;
const aborted = signal => signal?.reason || new DOMException('Public feed request aborted.', 'AbortError');

/**
 * One Core owns this bounded raw transport. Collectors retain validation,
 * acknowledgement, deadlines and retry policy. Different injected fetchers
 * never share flights, bytes or pacing state. No response object is shared.
 * Reuse expires on access; idle bytes remain bounded until access or close.
 */
export function createPublicFeedTransport({ now = Date.now, spacingMs = 110, cacheMs = 30000,
    maxEntries = 32, maxBytes = 8 * 1024 * 1024, maxPending = 16, wait = delay } = {}) {
    const providers = new Map();
    let closed = false, closing;
    function provider(fetcher) {
        if (!providers.has(fetcher)) providers.set(fetcher, {
            flights: new Map(), tasks: new Set(), cache: new Map(), bytes: 0, queue: Promise.resolve(), lastStarted: -Infinity,
        });
        return providers.get(fetcher);
    }
    function forget(state, key) {
        const old = state.cache.get(key);
        if (old) { state.bytes -= old.body?.byteLength || 0; state.cache.delete(key); }
    }
    function expire(state) {
        for (const [key, row] of state.cache) if (row.until <= now()) forget(state, key);
    }
    function remember(state, key, result) {
        const size = result.body?.byteLength || 0;
        if (size > maxBytes || maxEntries < 1 || cacheMs <= 0) return;
        expire(state); forget(state, key);
        state.cache.set(key, { ...result, until: now() + cacheMs }); state.bytes += size;
        while (state.cache.size > maxEntries || state.bytes > maxBytes) forget(state, state.cache.keys().next().value);
    }
    function tooLarge(waiter) { return new Error(waiter.sizeError); }
    function exceeds(waiter, result, size = result.body?.byteLength || 0) {
        return size > waiter.maximum || waiter.checkContentLength && Number(new Headers(result.headers).get('content-length')) > waiter.maximum;
    }
    function response(result) {
        // fetch has already decoded transfer/content encoding. Response does not
        // decode again; preserve original headers for each collector's policy.
        return new Response(result.body === null ? null : Buffer.from(result.body), {
            status: result.status, statusText: result.statusText, headers: result.headers,
        });
    }
    function settle(entry, waiter, error, result) {
        if (!entry.waiters.delete(waiter)) return;
        waiter.signal?.removeEventListener('abort', waiter.onAbort);
        if (error) waiter.reject(error); else waiter.resolve(response(result));
        if (!entry.waiters.size && !entry.done) entry.controller.abort();
    }
    function checkSizes(entry, result, size) {
        for (const waiter of [...entry.waiters]) if (exceeds(waiter, result, size)) settle(entry, waiter, tooLarge(waiter));
        entry.controller.signal.throwIfAborted();
    }
    async function collect(fetcher, url, init, entry) {
        const signal = AbortSignal.any([entry.controller.signal, AbortSignal.timeout(15000)]);
        const received = await fetcher(url, { ...init, redirect: 'error', signal });
        const result = { status: received.status, statusText: received.statusText, headers: [...received.headers], body: null };
        entry.headers = result;
        // Consumers inspect failure status before reading a body. Release that
        // body here and never retain non-success responses in the reuse cache.
        if (!received.ok || !received.body?.getReader) {
            await received.body?.cancel().catch(() => {});
            return result;
        }
        const reader = received.body.getReader(), chunks = [];
        let size = 0;
        const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
        signal.addEventListener('abort', cancel, { once: true });
        try {
            signal.throwIfAborted();
            checkSizes(entry, result, 0);
            while (true) {
                const part = await reader.read();
                signal.throwIfAborted();
                if (part.done) break;
                size += part.value.byteLength; entry.size = size;
                checkSizes(entry, result, size);
                chunks.push(Buffer.from(part.value));
            }
            result.body = Buffer.concat(chunks, size);
            return result;
        } catch (error) {
            await reader.cancel(error).catch(() => {});
            throw error;
        } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
    }
    function wrap(fetcher = fetch, { maximum = MAX_BODY, checkContentLength = false,
        sizeError = 'Live killmail packet exceeds the size limit.' } = {}) {
        if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > MAX_BODY) throw new Error('Invalid public feed body limit.');
        return (url, init = {}) => {
            if (closed) return Promise.reject(new Error('Public feed transport is closed.'));
            if (init.signal?.aborted) return Promise.reject(aborted(init.signal));
            // Only the fixed public GET feed is shared. Unrelated providers and
            // requests with credentials/body keep their original transport.
            const headers = new Headers(init.headers);
            if (url !== POINTER && !packetUrl.test(url) || init.method && init.method !== 'GET' || init.body != null ||
                init.credentials === 'include' || headers.has('authorization') || headers.has('cookie')) return fetcher(url, init);
            const state = provider(fetcher);
            // User-Agent and compression negotiation differ between the two
            // collectors; both receive the same decoded public JSON bytes.
            const keyHeaders = new Headers(headers); keyHeaders.delete('user-agent'); keyHeaders.delete('accept-encoding');
            const key = url + ':' + JSON.stringify([...keyHeaders].sort());
            expire(state);
            const cached = state.cache.get(key);
            const policy = { maximum, checkContentLength, sizeError };
            if (cached) {
                if (exceeds(policy, cached)) return Promise.reject(tooLarge(policy));
                return Promise.resolve(response(cached));
            }
            let entry = state.flights.get(key);
            if (entry?.done || entry?.controller.signal.aborted) entry = null;
            if (!entry) {
                // A canceled same-key flight can be replaced before its queued
                // task runs. Charge every accepted task until it actually exits.
                if (state.tasks.size >= maxPending) return Promise.reject(new Error('Public feed request queue is full.'));
                entry = { waiters: new Set(), controller: new AbortController(), done: false, size: 0 };
                state.flights.set(key, entry);
                entry.task = state.queue.then(async () => {
                    entry.controller.signal.throwIfAborted();
                    const pause = spacingMs - (now() - state.lastStarted);
                    if (pause > 0) await wait(pause, undefined, { signal: entry.controller.signal });
                    entry.controller.signal.throwIfAborted(); state.lastStarted = now();
                    return collect(fetcher, url, init, entry);
                }).then(result => {
                    entry.done = true;
                    if (state.flights.get(key) === entry) state.flights.delete(key);
                    if (result.status >= 200 && result.status < 300 && !entry.controller.signal.aborted) {
                        if (url === POINTER) { state.cache.clear(); state.bytes = 0; }
                        else if (result.body !== null) remember(state, key, result);
                    }
                    for (const waiter of [...entry.waiters]) settle(entry, waiter, null, result);
                }, error => {
                    entry.done = true;
                    if (state.flights.get(key) === entry) state.flights.delete(key);
                    for (const waiter of [...entry.waiters]) settle(entry, waiter, error);
                }).finally(() => {
                    if (state.flights.get(key) === entry) state.flights.delete(key);
                    state.tasks.delete(entry.task);
                });
                state.tasks.add(entry.task);
                // Aggregate provider pacing applies to actual network work only.
                state.queue = entry.task.catch(() => {});
            }
            return new Promise((resolve, reject) => {
                const waiter = { ...policy, resolve, reject, signal: init.signal };
                waiter.onAbort = () => settle(entry, waiter, aborted(waiter.signal));
                entry.waiters.add(waiter);
                if (waiter.signal?.aborted) waiter.onAbort();
                else if (entry.headers && exceeds(waiter, entry.headers, entry.size)) settle(entry, waiter, tooLarge(waiter));
                else waiter.signal?.addEventListener('abort', waiter.onAbort, { once: true });
            });
        };
    }
    function close() {
        if (closing) return closing;
        closed = true;
        const tasks = [];
        for (const state of providers.values()) {
            state.cache.clear(); state.bytes = 0;
            for (const entry of state.flights.values()) {
                for (const waiter of [...entry.waiters]) settle(entry, waiter, new DOMException('Public feed transport closed.', 'AbortError'));
                entry.controller.abort();
            }
            tasks.push(...state.tasks);
        }
        closing = Promise.allSettled(tasks).then(() => { providers.clear(); });
        return closing;
    }
    return { wrap, close };
}
