import type {UniverseAtlas, UniverseIntel} from '../components/kairo/universe-types';

export type PoliticalTerritorySource = 'configured' | 'inferred' | 'independent' | 'unassigned' | 'sovereignty';
export type PoliticalAtlasLayer = 'power_blocs' | 'sovereignty';
export type PoliticalRegion = {regionId: number; name: string; systemCount: number};
/** Physical gate adjacency is geography, not diplomatic alignment or hostility. */
export type PoliticalNeighbour = {
  key: string; name: string; color: string; gateCount: number;
  /** Endpoints are oriented from this territory to its neighbour. */
  connections: {fromSystemId: number; toSystemId: number}[];
};
export type PoliticalTerritory = {
  key: string; name: string; source: PoliticalTerritorySource; color: string; outline: string;
  /** Unique observed K-space holdings only. No area/control percentage implied. */
  systemIds: number[];
  /** Full known group membership, including members without observed holdings. */
  allianceIds: number[];
  regions: PoliticalRegion[]; neighbours: PoliticalNeighbour[];
  /** Each total is null when its source or any member value is unknown. An
   * explicit null is never converted into zero; supplied defaults may fill
   * absent values. Empty configured groups have null activity. */
  activity: {shipKills: number | null; podKills: number | null; jumps: number | null};
};
export type PoliticalAtlas = {
  territories: PoliticalTerritory[];
  totalSovereignSystems: number;
  /** Known-space atlas systems without a usable reported sovereignty owner.
   * They may be unclaimed or unobserved; the model does not distinguish these. */
  unobservedSystemCount: number;
  /** Ownership source has a ready/stale snapshot; a valid empty snapshot counts. */
  available: boolean;
  /** At least one usable ownership/activity/inference source is marked stale. */
  stale: boolean;
};
/** Pure full-roster analysis. No view/filter/zoom inputs, fetching or mutations. */
export function buildPoliticalAtlas(atlas: UniverseAtlas | null, intel: UniverseIntel | null, layer?: PoliticalAtlasLayer): PoliticalAtlas;
