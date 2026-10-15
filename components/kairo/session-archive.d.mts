export type SessionPage = {items:any[];more:boolean};
export function mergeSessionRows(previous:any[],incoming:any[],prepend?:boolean):any[];
export function createSessionArchive(options:{read:(offset:number)=>Promise<SessionPage>;publish:(page:SessionPage)=>void;onError?:(error:any)=>void;onBusy?:(busy:boolean)=>void}):{refresh():Promise<void>;loadMore():Promise<void>;close():void};
