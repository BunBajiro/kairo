import type {UniverseAtlas, UniverseSystem} from './universe-types';
export type MapSystemResult = {map_id:string;map_name:string;system:UniverseSystem;alias:string;search:string};
export type PlacementGroup = {id:number;name:string;region_name:string;system_ids:number[]};
export function mapSystemIndex(maps:any[],systems:UniverseSystem[]):MapSystemResult[];
export function searchMapSystems(index:MapSystemResult[],query:string,limit?:number):MapSystemResult[];
export function mapPlacementGroupIndex(atlas:UniverseAtlas):{region:PlacementGroup[];constellation:PlacementGroup[]};
export function searchPlacementGroups(groups:PlacementGroup[],query:string,limit?:number):PlacementGroup[];
