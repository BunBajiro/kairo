export type TerritoryColour = Readonly<{fill: string; outline: string}>;
export type TerritoryColourEntity = {key: string; preferredColor?: string; factionId?: number; priority?: number};
export type TerritoryColourGroup = {id: string; color: string; source?: string; name?: string; configured_color?: string};
export const FACTION_TERRITORY_COLOURS: Readonly<Record<number, Readonly<{name: string; fill: string; outline: string}>>>;
/** Deterministic full-roster palette keyed by stable identity; input order does
 * not matter but roster changes may change allocations. Empire colours are always
 * reserved. Throws for missing keys, duplicate faction aliases or >16,384 keys. */
export function allocateTerritoryColours(entities: readonly TerritoryColourEntity[]): ReadonlyMap<string, TerritoryColour>;
/** Unitless OKLab distance for six-digit hex strings; invalid colours throw. */
export function territoryColourDistance(first: string, second: string): number;
/** Build owner/bloc keys from observed sovereignty and configured/inferred groups.
 * Static atlas faction labels and standings are not ownership evidence. */
export function territoryColourEntities(sovereignty: readonly {alliance_id?: number; faction_id?: number; corporation_id?: number}[], groups?: readonly TerritoryColourGroup[]): TerritoryColourEntity[];
/** Return a validation message for malformed/reserved/duplicate fill, else null.
 * excludingId lets a saved bloc retain its own current colour. */
export function configuredTerritoryColourConflict(colour: string, blocs: readonly {id?: string; name?: string; color: string}[], excludingId?: string | null): string | null;
/** Suggest an unused fill while reserving all supplied bloc and empire colours. */
export function suggestTerritoryColour(key: string, blocs?: readonly {color: string}[]): string;
