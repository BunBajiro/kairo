export function connectionEditorPayload(draft:Record<string,any>,expiryInput:string,original?:Record<string,any>|null):Record<string,any>;
export function publicChainScene(map:any,feeds:any,systems:any[],selectedSources?:Record<string,boolean>,now?:number):any;
export type StructureScanRow={line:number;title:string;type_name:string;type_id:number|null;state:string;standing:string;kind:string;body:string;timer_at?:string};
export function previewStructureScan(text:string):{valid:boolean;rows:StructureScanRow[];ignored:{line:number;reason:string}[];error:string|null};
