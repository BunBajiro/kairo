export function groupSystemObservations<T extends {kind?:string}>(rows?:T[]):{structures:T[];timers:T[];reports:T[]};
export function connectionHasEnded(connection:Record<string,any>,now?:number):boolean;
export function connectionEditorPayload(draft:Record<string,any>,expiryInput:string,original?:Record<string,any>|null):Record<string,any>;
export function drawnConnectionPayload(fromSystemId:number,toSystemId:number):Record<string,any>;
export function createLayoutSaveQueue():<T>(save:()=>Promise<T>)=>Promise<T>;
export function createLayoutSaveScope(key:string):{key:string;readonly closed:boolean;readonly pending:number;cancel:()=>void;run:<T>(save:()=>Promise<T>)=>Promise<T|null>};
export function publicChainScene(map:any,feeds:any,systems:any[],selectedSources?:Record<string,boolean>,now?:number,previous?:any):any;
export type StructureScanRow={line:number;title:string;type_name:string;type_id:number|null;state:string;standing:string;kind:string;body:string;timer_at?:string};
export function previewStructureScan(text:string):{valid:boolean;rows:StructureScanRow[];ignored:{line:number;reason:string}[];error:string|null};
