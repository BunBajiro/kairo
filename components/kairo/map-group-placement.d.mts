import type {UniverseAtlas,UniverseLink} from './universe-types';
import type {JSpaceMapData,JSpaceMapNode,JSpaceMapConnection} from './jspace-map';
export type MapGroupPlacement = {name:string;group:{kind:'region'|'constellation';id:number};nodes:JSpaceMapNode[];connections:JSpaceMapConnection[];source:string;existing:number};
export function prepareMapGroup(atlas:UniverseAtlas,map:JSpaceMapData,links:UniverseLink[]|undefined,kind:'region'|'constellation',id:number):MapGroupPlacement;
