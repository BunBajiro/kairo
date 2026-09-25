/** Workspace destinations are shared by the sidebar and the command palette. */
export const workspaceRoutes = [
  {id: 'overview', name: 'Command centre', group: 'OPERATIONS'},
  {id: 'character', name: 'Pilot & training', group: 'OPERATIONS'},
  {id: 'wallet', name: 'Wallet & trade', group: 'OPERATIONS'},
  {id: 'assets', name: 'Hangar & assets', group: 'OPERATIONS'},
  {id: 'markets', name: 'Markets', group: 'OPERATIONS'},
  {id: 'industry', name: 'Industry & planets', group: 'OPERATIONS'},
  {id: 'sessions', name: 'Sessions', group: 'OPERATIONS'},
  {id: 'universe-kspace', name: 'K-Space', group: 'UNIVERSE', keywords: ['universe', 'known space', 'New Eden', 'sovereignty', 'journey']},
  {id: 'universe-jspace', name: 'J-Space', group: 'UNIVERSE', keywords: ['universe', 'wormhole', 'chain', 'signatures', 'statics']},
  {id: 'goals', name: 'Goals & notes', group: 'INTELLIGENCE'},
  {id: 'studio', name: 'Stream studio', group: 'BROADCAST'},
  {id: 'opsec', name: 'OPSEC control', group: 'BROADCAST'},
  {id: 'modules', name: 'Settings', group: 'SYSTEM'},
  {id: 'connections', name: 'Connections', group: 'SYSTEM'},
];

export const workspaceGroups = ['OPERATIONS', 'UNIVERSE', 'INTELLIGENCE', 'BROADCAST', 'SYSTEM'];

export function universeRouteForSpace(space) {
  return space === 'wormhole' ? 'universe-jspace' : 'universe-kspace';
}

/** J-Space always opens its chain, including workspaces saved before the split. */
export function universeTabForSpace(space, tab) {
  return space === 'wormhole' ? 'atlas' : tab === 'journey' || tab === 'connections' ? tab : 'atlas';
}

/** Keep older bookmarks, module links and session replay launches working. */
export function resolveWorkspaceRoute(id) {
  if (id === 'universe' || id === 'journey') return {id: universeRouteForSpace('known'), universeTab: id === 'journey' ? 'journey' : null};
  return {id: workspaceRoutes.some(route => route.id === id) || (typeof id === 'string' && id.startsWith('module:') && id.length > 7) ? id : 'overview', universeTab: null};
}
