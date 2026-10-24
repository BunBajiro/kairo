export const CHAIN_NODE_WIDTH: number;
export const CHAIN_NODE_HEIGHT: number;
export const CHAIN_MAX_ZOOM: number;
/** x/y translate viewport CSS pixels; zoom multiplies unscaled diagram coordinates. */
export type ChainCamera = {x:number;y:number;zoom:number};
export type ChainPoint = {x:number;y:number};
/** Diagram coordinates; displayScale changes the whole card envelope, not its stored position. */
export type ChainDisplayPoint = ChainPoint & {displayScale?:number};
export type ChainViewport = {width:number;height:number};
export type ChainGeometryNode = ChainDisplayPoint & {system_id:number};
export function chainNodeSize(node: Partial<ChainDisplayPoint>): {width:number;height:number};
export function chainBounds(nodes: ChainGeometryNode[]): {minX:number;minY:number;maxX:number;maxY:number};
export function fitChainCamera(nodes: ChainGeometryNode[], viewport:ChainViewport, padding?:number, maxZoom?:number):ChainCamera;
export function chainZoomLimits(nodes:ChainGeometryNode[], viewport:ChainViewport):{min:number;max:number};
export function zoomChainAt(camera:ChainCamera,point:ChainPoint,factor:number,limits?:{min:number;max:number}):ChainCamera;
export function boundChainCamera(camera:ChainCamera,nodes:ChainGeometryNode[],viewport:ChainViewport):ChainCamera;
export type ChainEdgeGeometry={start:ChainPoint;end:ChainPoint;label:ChainPoint;controls:[ChainPoint,ChainPoint];path:string};
export type ChainPort = 'left'|'right'|'top'|'bottom';
export const CHAIN_PORTS: ChainPort[];
export function chainPortPoint(node:ChainDisplayPoint,port:ChainPort):ChainPoint;
export function nearestChainPort(node:ChainDisplayPoint,point:ChainPoint):ChainPort;
export function chainEdgeGeometry(from:ChainDisplayPoint,to:ChainDisplayPoint,parallelOffset?:number,ports?:{from_port?:ChainPort;to_port?:ChainPort}):ChainEdgeGeometry;
export function placeChainEdgeLabels<T extends ChainEdgeGeometry & {labelWidth?:number;labelHeight?:number}>(edges:T[],nodes:ChainGeometryNode[]):Array<T & {labelBox:{left:number;right:number;top:number;bottom:number};leader:{from:ChainPoint;to:ChainPoint}|null}>;
export function traceChainPath(nodes:ChainGeometryNode[],connections:Array<{id:string;from_system_id:number;to_system_id:number;kind?:string;directional?:boolean;expired?:boolean;life_status?:string;enabled?:boolean;expires_at?:string|null}>,fromId:number,toId:number,now?:number):{nodes:number[];edges:string[]};
export function placeChainPopover(point:ChainPoint,size:ChainViewport,viewport:ChainViewport,padding?:number):ChainPoint;
export function visibleChainLabels(nodes:ChainGeometryNode[],camera:ChainCamera,viewport:ChainViewport,priorityIds?:(number|null|undefined)[]):Set<number>;

export function draggedChainPositions(originals:ChainGeometryNode[],start:ChainPoint,end:ChainPoint,zoom:number):ChainGeometryNode[];
export function chainConnectionTarget<T extends ChainGeometryNode & {public_report?:boolean}>(nodes:T[],point:ChainPoint,fromId:number,padding?:number):T|null;
export function chainConnectionPreview(from:ChainDisplayPoint,side:ChainPort,point:ChainPoint,target?:ChainDisplayPoint|null,portExtent?:number,targetSide?:ChainPort|null):string;
