export const MAP_DISPLAY_GROUP_LIMIT: number;
export const MAP_DISPLAY_MEMBER_LIMIT: number;
export type MapDisplayGroup = {id:string;name:string;kind:'custom'|'region'|'constellation';memberIds:number[];parentSystemId?:number;collapsed:boolean};
export type MapDisplayPrefs = {version:1;knownScale:number;wormholeScale:number;groups:MapDisplayGroup[]};
export type MapDisplayFocus = {enabled:boolean;systemIds?:Iterable<number>;contextScale?:number};
export type MapDisplayGroupProjection = MapDisplayGroup & {anchorSystemId:number;anchor:{x:number;y:number};memberCount:number;visibleCount:number;hiddenCount:number;boundaryIds:number[]};
export function normalizeMapDisplayPrefs(raw:unknown):MapDisplayPrefs;
export function projectMapDisplay<N extends {system_id:number;x:number;y:number}, E extends {from_system_id:number;to_system_id:number}>(input:{
  nodes:N[];connections:E[];byId?:Map<number,{space?:string}>;systems?:Array<{system_id:number;space?:string}>;prefs?:unknown;protectedIds?:Iterable<number>;focus?:MapDisplayFocus;
}):{visibleNodes:Array<N & {displayScale:number;displayDetail:'full'|'compact'}>;visibleConnections:E[];groups:MapDisplayGroupProjection[];hiddenIds:Set<number>};
