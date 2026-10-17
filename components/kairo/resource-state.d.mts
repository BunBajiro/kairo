/** Immutable private-resource identity helpers; detailed revision semantics live in resource-state.mjs. */
export const goalSourceKeys: string[];
export function sameValue(left: any, right: any): boolean;
export function retainValue<T>(previous: T, next: T): T;
export function mergeResourceNames(previous: Record<string, string>, incoming?: Record<string, string> | null): Record<string, string>;
export function retainSnapshot<T>(previous: T, next: T): T;
export function retainSnapshots<T extends Record<string, any>>(previous: T, next: T): T;
export function changeAffectsPilot(detail: any, characterId: number): boolean;
export function changeNeedsState(detail: any): boolean;
export function mergeResourceRevisions(previous: Record<string,string>, next?: Record<string,string>, resources?: string[]): Record<string,string>;
export function goalInputRevision(data: Record<string, any>, now?: number): string;
