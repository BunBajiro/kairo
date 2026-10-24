import type {UniverseIntel} from './universe-types';
/** Captured visit evidence; timestamps are ISO strings, never substituted from current ownership. */
export type ReplaySovereigntyOwner = {owner_type:'alliance'|'corporation'|'faction';owner_id:number;owner_name:string|null;observed_at:string;recorded_at:string;source:'esi'};
export function replaySovereigntyIntel(intel: UniverseIntel | null): UniverseIntel | null;
export function replaySovereigntyCaption(intel: UniverseIntel | null): string;
export function historicalSovereigntyLabel(owner?: ReplaySovereigntyOwner | null): {label:string;title:string};
