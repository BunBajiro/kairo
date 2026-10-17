/**
 * Private read-model invalidation identities. These tokens are process-local,
 * opaque to clients, and independent of snapshot data or durable map revisions.
 * See docs/INTERNAL-API.md for resource ownership and browser refresh fences.
 */
import {randomUUID} from 'node:crypto';

export const uiResources = ['activity', 'goals', 'notes', 'sessions', 'goalSources'];
/** Persisted semantic events always affect activity; domain lists are selective. */
export function eventResources(event) {
    const resources = ['activity'];
    if (event.type?.startsWith('goal.')) resources.push('goals');
    if (event.type?.startsWith('note.')) resources.push('notes');
    if (event.type?.startsWith('session.')) resources.push('sessions');
    return resources;
}

// UI invalidation tokens describe a process generation and the latest relevant
// global/pilot change. They never replace stored history or alter projection data.
/**
 * current(pilot) combines the latest global (owner 0) and pilot change for each
 * recognized resource. changed defaults to all resources; unknown names do not
 * gain version slots. Core can still forward those names as invalidation detail.
 */
export function createUIResourceVersions(epoch = randomUUID()) {
    let version = 0;
    const pilots = new Map();
    function changed(characterId = 0, resources = uiResources) {
        const id = Number(characterId) || 0, values = pilots.get(id) || {};
        for (const resource of resources) if (uiResources.includes(resource)) values[resource] = ++version;
        pilots.set(id, values);
        return current(id);
    }
    function current(characterId = 0) {
        const global = pilots.get(0) || {}, pilot = pilots.get(Number(characterId)) || {};
        return Object.fromEntries(uiResources.map(resource => [resource, `${epoch}:${Math.max(global[resource] || 0, pilot[resource] || 0)}`]));
    }
    return {changed, current};
}
