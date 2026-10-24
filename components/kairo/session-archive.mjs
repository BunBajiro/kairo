/**
 * Merge by Session ID in display order. The first occurrence wins: prepend lets
 * an authoritative incoming head replace older copies without duplicating cards.
 */
export function mergeSessionRows(previous, incoming, prepend = false) {
    const rows = [], seen = new Set();
    for (const row of prepend ? [...incoming, ...previous] : [...previous, ...incoming]) {
        if (!seen.has(row.id)) {seen.add(row.id); rows.push(row);}
    }
    return rows;
}

// One mounted pilot owns archive transport. Refreshes supersede in-flight pages;
// a requested next page survives that invalidation and runs after the refresh.
// The loaded prefix is refreshed in full so renamed older rows stay correct.
/**
 * Own one pilot's archive with offset-based `read(offset) -> {items,more}` pages.
 * Refresh rereads at least the first page and the entire previously loaded prefix;
 * loadMore intent survives an intervening refresh. Failures retain rows/intent for
 * explicit retry and report through onError without rejecting drain waiters.
 * close releases waiters and fences late callbacks, not transport. See
 * ../../docs/INTERNAL-API.md for the archive/report distinction.
 */
export function createSessionArchive({read, publish, onError = () => {}, onBusy = () => {}}) {
    let closed = false, running = false, refreshPending = false, morePending = false, generation = 0;
    let rows = [], more = false, completion = null;
    function complete() {const pending = completion; completion = null; pending?.resolve();}
    function wait() {if (!completion) {let resolve; const promise = new Promise(done => {resolve = done;}); completion = {promise,resolve};} return completion.promise;}
    async function drain() {
        if (closed || running || !refreshPending && !morePending) return;
        running = true; onBusy(true);
        try {
            while (!closed && (refreshPending || morePending)) {
                const refresh = refreshPending, requested = generation;
                if (refresh) refreshPending = false; else morePending = false;
                try {
                    let next = refresh ? [] : rows, nextMore = more;
                    if (refresh) {
                        const target = Math.max(30, rows.length); let offset = 0;
                        do {
                            const page = await read(offset);
                            if (closed || generation !== requested) break;
                            next = mergeSessionRows(next, page.items); nextMore = page.more;
                            offset += page.items.length;
                            if (!page.items.length) break;
                        } while (nextMore && next.length < target);
                    } else if (more) {
                        const page = await read(rows.length);
                        next = mergeSessionRows(rows, page.items); nextMore = page.more;
                    }
                    if (!closed && generation === requested) {rows = next; more = nextMore; publish({items:rows,more});}
                    else if (!refresh) morePending = true;
                } catch (error) {
                    if (!closed && generation === requested) {
                        // A failed head refresh must not be hidden by a queued
                        // tail append using the old offset. Keep both intents
                        // for the user's retry without spinning on failures.
                        if (refresh) refreshPending = true; else morePending = true;
                        onError(error); break;
                    } else if (!refresh) morePending = true;
                }
            }
        } finally {running = false; if (!closed) onBusy(false); complete();}
    }
    return {
        refresh() {if (closed) return Promise.resolve(); generation++; refreshPending = true; const done = wait(); void drain(); return done;},
        loadMore() {if (closed) return Promise.resolve(); morePending = true; const done = wait(); void drain(); return done;},
        close() {closed = true; generation++; refreshPending = false; morePending = false; complete();},
    };
}
