import {projectKnownSystems} from './universe-map-math.mjs';
import {schematicLayout} from '../../lib/universe-schematic-layout.mjs';

/** One owner per immutable Atlas systems revision; unselected layouts stay absent. */
export function createAtlasLayouts(systems) {
  let physical, schematic, firstSystemId;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  // Scale and the radar fallback use physical coordinates, even in schematic mode.
  // Reading their extents does not require allocating the full physical layout.
  for (const system of systems) {
    if (system.space !== 'known' || !Number.isFinite(system.map_x) || !Number.isFinite(system.map_y)) continue;
    firstSystemId ??= system.system_id;
    minX = Math.min(minX, system.map_x); minY = Math.min(minY, system.map_y);
    maxX = Math.max(maxX, system.map_x); maxY = Math.max(maxY, system.map_y);
  }
  const worldUnitsPerLightYear = 1000 / (minX === Infinity ? 100 : Math.max(1, maxX - minX, maxY - minY));
  return {
    firstSystemId, worldUnitsPerLightYear,
    get(projection) {
      if (projection === 'schematic') return schematic ??= schematicLayout(systems.filter(system => system.space === 'known')).points;
      return physical ??= projectKnownSystems(systems);
    },
  };
}
