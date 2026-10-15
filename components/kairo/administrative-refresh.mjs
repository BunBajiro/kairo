import {createScopedRefresh} from './scoped-refresh.mjs';

// Mounted administrative reads only. Server polling and OBS sources have their
// own lifetimes. Schedule from completion so a slow read cannot build a queue.
export function createAdministrativeRefresh({read, publish, onError, visible = () => true,
    period = () => 30000,
    timers = {setTimeout: (run, ms) => globalThis.setTimeout(run, ms), clearTimeout: id => globalThis.clearTimeout(id)}}) {
    let closed = false, timer = null, value, requested = 0;
    const clear = () => {if (timer !== null) timers.clearTimeout(timer); timer = null;};
    const owner = createScopedRefresh({read: () => {clear(); return read();},
        publish: next => {value = next; publish(next);}, onError, canRead: visible});
    function arm() {
        clear();
        if (!closed && visible()) timer = timers.setTimeout(() => {timer = null; void request();}, period(value));
    }
    function request(options) {
        if (closed) return Promise.resolve();
        clear();
        const generation = ++requested;
        const done = owner.request(options);
        void done.then(() => {if (generation === requested) arm();});
        return done;
    }
    return {request, visibilityChanged() {clear(); if (visible()) void request();},
        close() {closed = true; clear(); owner.close();}};
}

export const marketRefreshPeriod = value => value?.job?.status === 'running' ? 2000 : 30000;

// A recovery read may finish after a newer stream event or a local edit. Keep
// status and configuration generations separate so neither rolls the other back.
export function createOBSControlRefresh({read, readStatus, publishConfig, publishStatus, onError, visible, timers}) {
    let edit = 0, status = 0, dirty = false, configWanted = true;
    const snapshot = () => ({edit, status});
    const owner = createAdministrativeRefresh({visible, timers, onError,
        read: async () => {
            const generation = snapshot(), full = configWanted || !readStatus; configWanted = false;
            try {return {generation, value: full ? await read() : {status: await readStatus()}};}
            catch (error) {if (full) configWanted = true;throw error;}
        },
        publish: ({generation, value}) => {
            if ('config' in value && !dirty && edit === generation.edit) publishConfig(value.config);
            if (status === generation.status) publishStatus(value.status);
        }});
    return {...owner, snapshot,
        reconnect() {configWanted = true; return owner.request();},
        edited() {edit++; dirty = true;},
        stream(value) {status++; publishStatus(value);},
        statusResponse(value, generation) {if (status === generation.status) {status++; publishStatus(value);}},
        saved(value, generation) {
            this.statusResponse(value.status, generation);
            if (edit !== generation.edit) return false;
            edit++; dirty = false; publishConfig(value.config); return true;
        }};
}
