import type {UniverseSystem} from './universe-types';

export type PortalSource = 'thera' | 'turnur';
export type PortalEndpoint = {
  /** Stable, direction-aware map identity; reportId remains the source identity. */
  id: string; reportId: string; source: PortalSource;
  hub: UniverseSystem; system: UniverseSystem; systemId: number; space: string;
  hubSignature: string; signature: string;
  state: 'usable' | 'stale' | 'incomplete' | 'not_eligible';
  /** Fresh report candidate, subject to the route planner's ship/access rules. */
  usable: boolean; routingEligible: boolean; reasons: string[];
  expiresAt: string; observedAt: string | null; remainingMs: number; ageMs: number | null;
  /** Unmodified provider record, retaining type, ship limits, comments and times. */
  report: any;
};
export type PortalNetwork = {
  source: PortalSource; name: string; hub: UniverseSystem | null; status: string;
  updatedAt: string | null; expiresAt: string | null; ageMs: number | null;
  attribution: string; endpoints: PortalEndpoint[]; usableCount: number; staleCount: number;
};
export function buildPortalNetworks(feeds: any, systems: UniverseSystem[] | Map<number, UniverseSystem>, now?: number): PortalNetwork[];
