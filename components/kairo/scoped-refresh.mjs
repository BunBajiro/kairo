// One read in flight and one retained invalidation for a mounted resource scope.
// Busy/hidden owners keep invalidations until resume; explicit reads may force a
// refresh (for example conflict recovery inside a mutation).
export function createScopedRefresh({read, publish, canRead = () => true, onError = () => {}}) {
    let closed = false, running = false, dirty = false, forced = false, completion = null;
    function complete() {const waiting = completion; completion = null; waiting?.resolve();}
    async function drain() {
        if (closed || running || !dirty || (!forced && !canRead())) return;
        running = true;
        try {
            while (!closed && dirty && (forced || canRead())) {
                dirty = false; forced = false;
                try {const value = await read(); if (!closed) publish(value);}
                catch (error) {if (!closed) onError(error);}
            }
        } finally {
            running = false;
            // A forced read must release a mutation waiter even if a newer ordinary
            // invalidation is paused by that mutation. Resume retains the pending read.
            if (closed || !dirty || (!forced && !canRead())) complete();
        }
    }
    return {
        request({force = false} = {}) {
            if (closed) return Promise.resolve();
            dirty = true; forced ||= force;
            if (!completion) {
                let resolve; const promise = new Promise(done => {resolve = done;});
                completion = {promise, resolve};
            }
            const promise = completion.promise;
            void drain();
            return promise;
        },
        resume() {void drain();},
        close() {closed = true; dirty = false; forced = false; complete();},
    };
}
