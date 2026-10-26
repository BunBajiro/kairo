/** Workspace destinations are shared by the sidebar and the command palette. */
export const workspaceRoutes = [
  {id: 'overview', name: 'Command centre', group: 'OPERATIONS'},
  {id: 'character', name: 'Pilot & training', group: 'OPERATIONS'},
  {id: 'wallet', name: 'Wallet & trade', group: 'OPERATIONS'},
  {id: 'assets', name: 'Hangar & assets', group: 'OPERATIONS'},
  {id: 'markets', name: 'Markets', group: 'OPERATIONS'},
  {id: 'industry', name: 'Industry & planets', group: 'OPERATIONS'},
  {id: 'sessions', name: 'Sessions', group: 'OPERATIONS'},
  {id: 'universe-kspace', name: 'Atlas', group: 'UNIVERSE', keywords: ['universe', 'known space', 'K-Space', 'New Eden', 'sovereignty']},
  {id: 'universe-jspace', name: 'Maps', group: 'UNIVERSE', keywords: ['universe', 'J-Space', 'mapping', 'wormhole', 'chain', 'signatures', 'statics']},
  {id: 'universe-settings', name: 'Universe settings', group: 'UNIVERSE', keywords: ['configuration', 'power blocs', 'coalitions', 'ansiblex', 'bridges', 'connections', 'pins', 'sources', 'alerts']},
  {id: 'goals', name: 'Goals & notes', group: 'INTELLIGENCE'},
  {id: 'studio', name: 'Stream studio', group: 'BROADCAST'},
  {id: 'opsec', name: 'OPSEC control', group: 'BROADCAST'},
  {id: 'modules', name: 'Settings', group: 'SYSTEM'},
  {id: 'connections', name: 'Connections', group: 'SYSTEM'},
];

export const workspaceGroups = ['OPERATIONS', 'UNIVERSE', 'INTELLIGENCE', 'BROADCAST', 'SYSTEM'];

/**
 * Map the exact wormhole space key to Maps; all other values open Atlas.
 */
export function universeRouteForSpace(space) {
  return space === 'wormhole' ? 'universe-jspace' : 'universe-kspace';
}

/** Both map workspaces open their map, including saved workspaces with retired tabs. */
export function universeTabForSpace(space, tab) {
  return 'atlas';
}

/** Keep older bookmarks, module links and session replay launches working. */
export function resolveWorkspaceRoute(id) {
  if (id === 'universe' || id === 'journey') return {id: universeRouteForSpace('known'), universeTab: null};
  return {id: workspaceRoutes.some(route => route.id === id) || (typeof id === 'string' && id.startsWith('module:') && id.length > 7) ? id : 'overview', universeTab: null};
}

/** Runs before the framework bootstrap: Window-targeted events use listener order. */
function installWorkspaceHistoryGuard(routeIds) {
  if (window.__kairoWorkspaceHistoryInstalled) return;
  window.__kairoWorkspaceHistoryInstalled = true;
  const documentKey = window.location.pathname + (new URLSearchParams(window.location.search).has('auth') ? '' : window.location.search);
  window.addEventListener('popstate', event => {
    const hash = window.location.hash;
    const id = hash.slice(1);
    const currentDocument = window.location.pathname + window.location.search;
    if (currentDocument !== documentKey || !(hash === '' || (hash.startsWith('#') && (routeIds.includes(id) || (id.startsWith('module:') && id.length > 7))))) return;
    event.stopImmediatePropagation();
    window.dispatchEvent(new Event('kairo:workspace-traverse'));
  }, true);
}

/**
 * Serialize the early history listener for app/layout's inline head script.
 * The serialized function must remain self-contained: module-closure references
 * would not exist at execution. It claims only recognized hashes in this document,
 * preserving framework handling of other navigation. See ../../docs/ARCHITECTURE.md.
 */
export function workspaceHistoryBootstrap() {
  return '(' + installWorkspaceHistoryGuard.toString() + ')(' + JSON.stringify([...workspaceRoutes.map(route => route.id), 'universe', 'journey']) + ');';
}
