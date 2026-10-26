export type WorkspaceRoute = {id: string; name: string; group: string; keywords?: string[]};
export const workspaceRoutes: WorkspaceRoute[];
export const workspaceGroups: string[];
export function universeRouteForSpace(space: 'known' | 'wormhole' | string): 'universe-kspace' | 'universe-jspace';
export function universeTabForSpace(space: 'known' | 'wormhole', tab: unknown): 'atlas';
export function resolveWorkspaceRoute(id: unknown): {id: string; universeTab: null};
/** Self-contained head-script source; install before framework history listeners. */
export function workspaceHistoryBootstrap(): string;
