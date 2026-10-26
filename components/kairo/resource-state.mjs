/**
 * Private dashboard identity helpers. Revisions are supplied by the server; these
 * functions never establish freshness by comparing large payloads. Treat retained
 * objects as immutable. See ../../docs/INTERNAL-API.md for the revision families.
 */
export const goalSourceKeys = ['wallet', 'journal', 'skills', 'queue', 'assets', 'mining', 'jobs', 'killmails'];

// Small resource metadata, session rows and flat name maps. Large snapshot data
// is deliberately excluded; its identity follows the server's dataRevision.
/**
 * Compare JSON-like small values recursively through own enumerable keys. This is
 * not a general object/deep-cycle comparator and must not traverse snapshot rows.
 */
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
/**
 * Retain the old data body only when an explicit dataRevision matches. Metadata
 * still compares separately: errors, expiry or participation changes must render
 * even if the body is unchanged. Missing samples pass through unchanged.
 */
export function retainSnapshot(previous, next) {
    if (!previous || !next) return next;
    const data = next.dataRevision !== undefined && next.dataRevision === previous.dataRevision ? previous.data : next.data;
    const value = {...next, data};
    const keys = Object.keys(value);
    if (keys.length === Object.keys(previous).length && keys.every(key => key === 'data' ? Object.is(previous.data, data) : sameValue(previous[key], value[key]))) return previous;
    return value;
}
/**
 * Reconcile a complete dataset-key map, including removed keys. Preserve the map
 * identity only when every retained sample and the key set remain unchanged.
 */
export function retainSnapshots(previous, next) {
    let changed = Object.keys(previous).length !== Object.keys(next).length;
    const value = {};
    for (const key of Object.keys(next)) {value[key] = retainSnapshot(previous[key], next[key]); changed ||= value[key] !== previous[key];}
    return changed ? value : previous;
}
/**
 * Absent/zero event owner means global; otherwise route only to the selected ID.
 */
export function changeAffectsPilot(detail, characterId) { return !detail?.characterId || Number(detail.characterId) === characterId; }
/**
 * Legacy untyped invalidations recover state; typed changes do so only for state
 * or Sessions, leaving narrower resource readers to their own consumers.
 */
export function changeNeedsState(detail) { return !Array.isArray(detail?.resources) || detail.resources.some(resource => resource === 'state' || resource === 'sessions'); }
/**
 * Merge selected epoch:counter tokens, rejecting a lower counter only within the
 * same epoch. Epoch changes are legitimate resets; tokens are not wall-clock time.
 */
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
/**
 * Build a small Goal invalidation key from source metadata plus queue-completion
 * and participation-expiry boundaries at `now` (epoch milliseconds). Avoid hashing
 * large source bodies; their metadata/revisions already describe observation changes.
 */
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
