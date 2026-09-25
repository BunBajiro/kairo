export type UniverseBackground = 'power_blocs' | 'sovereignty' | 'standings' | 'security' | 'activity' | 'none';
export type UniverseIndicator = 'none' | 'ship_kills' | 'pod_kills' | 'npc_kills' | 'jumps' | 'mining' | 'industry' | 'fw' | 'incursions' | 'visits';
export type UniverseStandingFilter = 'all' | 'friendly' | 'hostile' | 'neutral' | 'unknown';
export type UniverseTerritoryFocus = {
 key:string;label:string;color:string;systemIds:number[];
 /** Zero selects without moving the camera; positive changes request a frame. */
 requestId:number;
};
export type UniverseSystem = {
  system_id: number; name: string; constellation_id: number; constellation_name: string;
  region_id: number; region_name: string; security: number; security_known?:boolean; x: number; y: number; z: number;
  map_x: number; map_y: number; space: string; planet_count?: number; moon_count?: number;
  station_count?: number; effect?: string | null; wormhole_class?: number | null;
};
export type UniverseRegion = {region_id:number;name:string;x?:number;y?:number;z?:number;map_x?:number;map_y?:number;space?:string;[key:string]:unknown};
export type UniverseAtlas = {
  metadata: Record<string, any>;
  systems: UniverseSystem[];
  regions: UniverseRegion[];
  constellations: {constellation_id:number;name:string;region_id:number;[key:string]:unknown}[];
  gates: any[];
};
export type UniverseOverlay = {
 system_id:number;
 power_bloc?: UniversePowerBlocMembership | null;
 sovereignty?: {alliance_id?:number;alliance_name?:string;corporation_id?:number;corporation_name?:string;faction_id?:number;faction_name?:string;color?:string;outline?:string;[key:string]:unknown}|null;
 standing?: {value:number|null;label:string;source?:string;status?:string};
 kills?: {ship_kills:number;pod_kills:number;npc_kills:number}|null;
 mining?:{quantity:number;entries:number;last_date:string}|null; jumps?:number|null; faction_warfare?:any|null; incursions?:any[]; industry?:any[]|null;
 visits?:number;last_visit?:string|null;note?:any|null;
};
export type UniverseSource = {status:string;updatedAt?:string;expiresAt?:string;stale?:boolean;error?:string;count?:number;[key:string]:unknown};
export type UniverseLink = {id:string;kind:string;from_system_id:number;to_system_id:number;enabled?:boolean;expires_at?:string|null;list_id?:string|null;zone?:number;[key:string]:any};
export type UniverseView = {id:string;name:string;config?:any;[key:string]:any};
export type PowerBlocConfig = {
 version:number;revision:number;updated_at?:string|null;inference_enabled:boolean;
 blocs:{id:string;name:string;color:string;alliance_ids:number[]}[];independent_alliance_ids:number[];
};
export type UniversePowerBlocMembership = {
 alliance_id:number;group_id:string|null;name:string;color:string;outline?:string|null;
 source:'configured'|'inferred'|'independent'|'unassigned';
 evidence?:Record<string,any>;[key:string]:any;
};
export type UniverseIntel = {
 character_id:number;location?:{system_id?:number;status?:string;updatedAt?:string};systems:UniverseOverlay[];
 sources:Record<string,UniverseSource>;links:UniverseLink[];link_lists:any[];pins:any[];views:UniverseView[];
 journey:{visits:any[];connections:any[];systems:any[]};structures:any[];[key:string]:any;
};
