export type MapNote = {id:string;body:string;created_at:string;system_id?:number|null;connection_id?:string|null;author_id?:number|null;author_name?:string};
export type MapNoteResult = MapNote & {map_id:string;map_name:string;note_id:string;author_name:string;author_id:number|null;location_label:string;archived:boolean};
export function noteAuthor(note:Partial<MapNote>):{id:number|null;name:string};
export function noteTimestamp(value:string,now?:number):{label:string;exact:string;date:string};
export function noteDateHeading(date:string,now?:number):string;
export function searchMapNotes(maps:any[],query?:string,options?:{systemName?:(id:number)=>string;limit?:number;now?:number}):MapNoteResult[];
