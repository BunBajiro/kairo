/** Append one fixed-cursor event page; null means retired scope, and transport errors reject. */
export function loadSessionReportPage(report:any, read:(offset:number,snapshot:{eventCursor:number;eventEnd:string})=>Promise<any>, isCurrent?:()=>boolean):Promise<any|null>;
