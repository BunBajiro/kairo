import {randomUUID} from 'node:crypto';

export const uiResources = ['activity', 'goals', 'notes', 'sessions', 'goalSources'];
export function eventResources(event) {
    const resources = ['activity'];
    if (event.type?.startsWith('goal.')) resources.push('goals');
    if (event.type?.startsWith('note.')) resources.push('notes');
    if (event.type?.startsWith('session.')) resources.push('sessions');
    return resources;
}

// UI invalidation tokens describe a process generation and the latest relevant
// global/pilot change. They never replace stored history or alter projection data.
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
