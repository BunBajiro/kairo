/**
 * CCP's in-game 2D layout, shared by the Atlas and user-map group placement.
 * The SDE importer already projects position2D as x / LY, -y / LY; these
 * coordinates are schematic, never a physical distance or jump-range input.
 * https://developers.eveonline.com/docs/guides/map-data/#2d-schematic-map
 */
export function schematicLayout(systems, {nodeWidth = 0, nodeHeight = 0, gap = 32} = {}) {
  const chosen = [...new Map(systems.filter(system => Number.isSafeInteger(system.system_id) && system.system_id > 0)
    .map(system => [system.system_id, system])).values()].sort((a, b) => a.system_id - b.system_id);
  const emptyBounds = {minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0};
  if (!chosen.length) return {points: [], bounds: emptyBounds, scale: 1, source: 'sde'};
  const complete = (x, y) => chosen.every(system => Number.isFinite(system[x]) && Number.isFinite(system[y]));
  let source = complete('schematic_x', 'schematic_y') ? 'sde' : complete('map_x', 'map_y') ? 'physical' : 'grid';
  let raw = chosen.map(system => ({system, x: system[source === 'sde' ? 'schematic_x' : 'map_x'], y: system[source === 'sde' ? 'schematic_y' : 'map_y']}));
  // A fixture or future non-New-Eden group may not have a usable 2D reference.
  // Fall back as one group, never mix incompatible coordinate spaces or stack
  // coincident cards. The result identifies the fallback for the caller.
  if (source === 'grid' || new Set(raw.map(point => `${point.x}:${point.y}`)).size !== raw.length) {
    source = 'grid';
    const columns = Math.ceil(Math.sqrt(chosen.length));
    raw = chosen.map((system, index) => ({system, x: index % columns, y: Math.floor(index / columns)}));
  }
  const extent = points => {
    const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y)), maxY = Math.max(...points.map(point => point.y));
    return {minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY};
  };
  const bounds = extent(raw), centerX = (bounds.minX + bounds.maxX) / 2, centerY = (bounds.minY + bounds.maxY) / 2;
  let scale = 1000 / Math.max(1, bounds.width, bounds.height);
  if (Number.isFinite(nodeWidth) && nodeWidth > 0 && Number.isFinite(nodeHeight) && nodeHeight > 0) {
    const padding = Number.isFinite(gap) ? Math.max(0, gap) : 32;
    // A single uniform scale keeps every angle and relative distance intact.
    // For each pair, separation on either axis is enough to avoid overlapping
    // rectangular cards. Regions contain at most a few hundred systems; this
    // bounded calculation runs once when the placement preview is created.
    for (let a = 0; a < raw.length; a++) for (let b = a + 1; b < raw.length; b++) {
      const dx = Math.abs(raw[a].x - raw[b].x), dy = Math.abs(raw[a].y - raw[b].y);
      scale = Math.max(scale, Math.min(dx ? (nodeWidth + padding) / dx : Infinity, dy ? (nodeHeight + padding) / dy : Infinity));
    }
  }
  const points = raw.map(point => ({system: point.system, x: (point.x - centerX) * scale, y: (point.y - centerY) * scale}));
  return {points, bounds: extent(points), scale, source};
}
