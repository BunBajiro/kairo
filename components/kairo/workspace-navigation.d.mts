export type WorkspaceRoute = {id: string; name: string; group: string; keywords?: string[]};
export const workspaceRoutes: WorkspaceRoute[];
export const workspaceGroups: string[];
export function universeRouteForSpace(space: 'known' | 'wormhole' | string): 'universe-kspace' | 'universe-jspace';
export function resolveWorkspaceRoute(id: unknown): {id: string; universeTab: 'journey' | null};
