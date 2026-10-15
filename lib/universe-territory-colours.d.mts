export type TerritoryColour = Readonly<{fill: string; outline: string}>;
export type TerritoryColourEntity = {key: string; preferredColor?: string; factionId?: number; priority?: number};
export type TerritoryColourGroup = {id: string; color: string; source?: string; name?: string; configured_color?: string};
export const FACTION_TERRITORY_COLOURS: Readonly<Record<number, Readonly<{name: string; fill: string; outline: string}>>>;
export function allocateTerritoryColours(entities: readonly TerritoryColourEntity[]): ReadonlyMap<string, TerritoryColour>;
export function territoryColourDistance(first: string, second: string): number;
export function territoryColourEntities(sovereignty: readonly {alliance_id?: number; faction_id?: number; corporation_id?: number}[], groups?: readonly TerritoryColourGroup[]): TerritoryColourEntity[];
export function configuredTerritoryColourConflict(colour: string, blocs: readonly {id?: string; name?: string; color: string}[], excludingId?: string | null): string | null;
export function suggestTerritoryColour(key: string, blocs?: readonly {color: string}[]): string;
