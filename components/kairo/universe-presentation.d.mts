import type {UniverseAtlas,UniverseSystem,UniverseIntel} from './universe-types';
import type {PoliticalTerritory} from '../../lib/universe-political-atlas.mjs';
export type UniverseSearchDestination = {id:string;name:string;detail:string;kind:'system'|'region'|'territory';value:string;search:string;color?:string};
export function isWormholeSystem(system?:Partial<UniverseSystem>|null):boolean;
export function wormholeClassLabel(system?:Partial<UniverseSystem>|null):string;
export function systemLocationLabel(system?:Partial<UniverseSystem>|null):string;
export function universeSearchCatalogue(atlas:UniverseAtlas,territories?:PoliticalTerritory[],options?:{space?:'known'|'wormhole';ownershipAvailable?:boolean}):UniverseSearchDestination[];
export function knownWormholeSystemIds(atlas:UniverseAtlas|null,intel:UniverseIntel|null,selectedSystemId?:number|null,now?:number):Set<number>;
