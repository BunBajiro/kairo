export const goalSourceKeys = ['wallet', 'journal', 'skills', 'queue', 'assets', 'mining', 'jobs', 'killmails'];

// Small resource metadata, session rows and flat name maps. Large snapshot data
// is deliberately excluded; its identity follows the server's dataRevision.
export function sameValue(left, right) {
    if (Object.is(left, right)) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}
export function retainValue(previous, next) { return sameValue(previous, next) ? previous : next; }
// Snapshot name payloads merge into a flat ID -> string map. Unchanged full
// maps need no copy and no recursive equality traversal; partial maps retain
// names omitted from that event. Copy only when an own key/value changes.
export function mergeResourceNames(previous, incoming) {
    if (!incoming) return previous;
    for (const key of Object.keys(incoming)) {
        if (!Object.hasOwn(previous, key) || !Object.is(previous[key], incoming[key])) return {...previous, ...incoming};
    }
    return previous;
}
export function retainSnapshot(previous, next) {
    if (!previous || !next) return next;
    const data = next.dataRevision !== undefined && next.dataRevision === previous.dataRevision ? previous.data : next.data;
    const value = {...next, data};
    const keys = Object.keys(value);
    if (keys.length === Object.keys(previous).length && keys.every(key => key === 'data' ? Object.is(previous.data, data) : sameValue(previous[key], value[key]))) return previous;
    return value;
}
export function retainSnapshots(previous, next) {
    let changed = Object.keys(previous).length !== Object.keys(next).length;
    const value = {};
    for (const key of Object.keys(next)) {value[key] = retainSnapshot(previous[key], next[key]); changed ||= value[key] !== previous[key];}
    return changed ? value : previous;
}
export function changeAffectsPilot(detail, characterId) { return !detail?.characterId || Number(detail.characterId) === characterId; }
export function changeNeedsState(detail) { return !Array.isArray(detail?.resources) || detail.resources.some(resource => resource === 'state' || resource === 'sessions'); }
export function mergeResourceRevisions(previous, next = {}, resources = Object.keys(next)) {
    const result = {...previous}; let changed = false;
    for (const resource of resources) {
        const before = previous[resource], after = next[resource];
        if (after === undefined || before === after) continue;
        const oldParts = before?.split(':'), newParts = after.split(':');
        if (oldParts?.[0] === newParts[0] && Number(oldParts[1]) > Number(newParts[1])) continue;
        result[resource] = after; changed = true;
    }
    return changed ? result : previous;
}
export function goalInputRevision(data, now = Date.now()) {
    return JSON.stringify(goalSourceKeys.map(key => {
        const sample = data[key]; if (!sample) return null;
        const {data: payload, ...metadata} = sample;
        // Finishing a queue entry changes the inferred skill level without a new
        // ESI body. Recovery reads must retain this narrow clock invalidation.
        if (key === 'queue') return [metadata, (Array.isArray(payload) ? payload : []).filter(row => row.finish_date && Date.parse(row.finish_date) <= now).length];
        if (key === 'killmails') return [metadata, sample.participation?.status === 'ready' && Date.parse(sample.participation.expiresAt || '') > now];
        return metadata;
    }));
}
