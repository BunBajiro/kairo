import type {SchematicSystem} from '../../lib/universe-schematic-layout.mjs';
export function createAtlasLayouts<T extends SchematicSystem & {space: string; map_x: number; map_y: number}>(systems: T[]): {
  firstSystemId: number | undefined;
  worldUnitsPerLightYear: number;
  get(projection: 'physical' | 'schematic'): {system: T; x: number; y: number}[];
};
