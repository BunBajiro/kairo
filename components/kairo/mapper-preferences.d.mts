export type MapperPreferences = {version:1;knownScale:number;wormholeScale:number;focusDetail:boolean};
export const MAPPER_PREFERENCES_EVENT:string;
export function mapperPreferencesKey(character:number):string;
export function normalizeMapperPreferences(value:unknown):MapperPreferences;
export function readMapperPreferences(character:number,storage:Pick<Storage,'getItem'>):MapperPreferences;
export function settledMapFocus(nodes:{system_id:number;x:number;y:number;displayScale?:number}[],camera:{x:number;y:number;zoom:number},size:{width:number;height:number},previous?:Iterable<number>):number[];
