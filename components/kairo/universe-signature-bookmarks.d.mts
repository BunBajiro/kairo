export const BOOKMARK_DEFAULT: string;
export const BOOKMARK_TOKENS: readonly string[];
export const BOOKMARK_MAPPINGS: readonly {key:string;label:string;value:string}[];
export function validateBookmarkTemplate(value: unknown): string;
export function validateBookmarkMapping(value: unknown): Record<string,string>;
export function formatSignatureBookmark(template: string, signature: any, system: any, destination?: any, options?: {mapping?:Record<string,string>;returnSymbol?:string;startAtZero?:boolean;connection?:any;now?:number;signatures?:any[];systems?:Map<number,any>}): string;
