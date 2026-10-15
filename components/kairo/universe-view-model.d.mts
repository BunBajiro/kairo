import type {UniverseViewConfig} from './universe-types';
export const DEFAULT_UNIVERSE_VIEW: Readonly<UniverseViewConfig>;
export function restoreUniverseView(config: unknown): UniverseViewConfig;
export function restoreUniverseWorkspace(saved: unknown, space: 'known'|'wormhole'): {
 tab:'atlas'; view:UniverseViewConfig; preset:string; selected:number|null; inspector:string; inspectorOpen:boolean;
 routeDraft:{from:string;to:string}; navigationTool:'gate'|'jump'|'range';
};
