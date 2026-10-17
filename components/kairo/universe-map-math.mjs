/**
 * Pure Atlas camera/territory math, independent of filters and DOM. Physical
 * map_x/map_y are projected light-years; this projection normalizes the longest
 * known-space extent to 1,000 world units. Camera translation and viewport sizes
 * use CSS pixels, with `scale` pixels per world unit. See docs/UNIVERSE-DATA.md.
 */
export function projectKnownSystems(systems) {
  const known = systems.filter(system => system.space === 'known' && Number.isFinite(system.map_x) && Number.isFinite(system.map_y));
  if (!known.length) return [];
  const bounds = pointBounds(known.map(system => ({x: system.map_x, y: system.map_y})));
  const scale = 1000 / Math.max(1, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  return known.map(system => ({system, x: (system.map_x - bounds.minX) * scale, y: (system.map_y - bounds.minY) * scale}));
}

/** Extents for finite caller-supplied world points; empty input uses a finite 100-unit square. */
export function pointBounds(points) {
  if (!points.length) return {minX: 0, minY: 0, maxX: 100, maxY: 100};
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);}
  return {minX, minY, maxX, maxY};
}

export function fitCamera(bounds, size) {
  const padding = Math.min(52, Math.max(20, Math.min(size.width, size.height) * .065));
  const scale = Math.min(Math.max(1, size.width - padding * 2) / Math.max(36, bounds.maxX - bounds.minX), Math.max(1, size.height - padding * 2) / Math.max(36, bounds.maxY - bounds.minY));
  return {x: size.width / 2 - (bounds.minX + bounds.maxX) * scale / 2, y: size.height / 2 - (bounds.minY + bounds.maxY) * scale / 2, scale};
}

export function clampCamera(camera, bounds, size) {
  const fitted = fitCamera(bounds, size), scale = Math.max(fitted.scale, Math.min(fitted.scale * 75, camera.scale));
  // Re-clamp around the viewport centre if resizing invalidates the old scale.
  let x = size.width / 2 - (size.width / 2 - camera.x) * scale / camera.scale;
  let y = size.height / 2 - (size.height / 2 - camera.y) * scale / camera.scale;
  const constrain = (offset, low, high, span) => {
    if ((high - low) * scale <= span - 40) return span / 2 - (low + high) * scale / 2;
    // An edge may approach the middle of the screen, but space cannot be lost in the void.
    const margin = Math.min(80, span * .15);
    return Math.max(margin - high * scale, Math.min(span - margin - low * scale, offset));
  };
  x = constrain(x, bounds.minX, bounds.maxX, size.width); y = constrain(y, bounds.minY, bounds.maxY, size.height);
  return {x, y, scale};
}

export function zoomCamera(camera, factor, anchor, bounds, size) {
  const fitted = fitCamera(bounds, size), scale = Math.max(fitted.scale, Math.min(fitted.scale * 75, camera.scale * factor));
  return clampCamera({x: anchor.x - (anchor.x - camera.x) * scale / camera.scale, y: anchor.y - (anchor.y - camera.y) * scale / camera.scale, scale}, bounds, size);
}

export function resizeCamera(camera, previous, size, bounds) {
  const oldFit = fitCamera(bounds, previous), newFit = fitCamera(bounds, size);
  // Preserve the viewed world centre and relative zoom, including the 1× overview.
  const scale = camera.scale / oldFit.scale * newFit.scale;
  return clampCamera({x: size.width / 2 - (previous.width / 2 - camera.x) / camera.scale * scale, y: size.height / 2 - (previous.height / 2 - camera.y) / camera.scale * scale, scale}, bounds, size);
}

export function geometryRevision(points) {return points.map(p => `${p.id}:${p.x}:${p.y}`).join('|');}
export function paintRevision(styles) {return styles.map(s => `${s.key}:${s.colour}:${s.outlineColour || s.colour}:${s.strength}:${s.dim ? 1 : 0}:${s.name || ''}:${s.source || ''}`).join('|');}

function clip(polygon, nx, ny, limit, neighbour) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = a.x * nx + a.y * ny - limit, db = b.x * nx + b.y * ny - limit;
    const insideA = da <= 1e-8, insideB = db <= 1e-8;
    if (insideA !== insideB) {
      const t = da / (da - db);
      result.push({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, from: insideA ? b.from : neighbour});
    }
    if (insideB) result.push(b);
  }
  return result;
}

/** Radius-clipped exact Voronoi cells. A spatial index avoids a galaxy-wide pair scan.
 * Every point participates: filtering changes paint, never geography or ownership.
 * Edges carry the adjacent cell so group interiors can be omitted from outlines.
 */
export function createTerritoryGeometry(points, radius = 24) {
  const buckets = new Map(), key = (x, y) => `${x},${y}`;
  points.forEach((p, i) => {const k = key(Math.floor(p.x / radius), Math.floor(p.y / radius)); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(i);});
  const cells = points.map((p, index) => {
    let polygon = Array.from({length: 16}, (_, i) => ({x: p.x + radius * Math.cos(i * Math.PI / 8), y: p.y + radius * Math.sin(i * Math.PI / 8), from: -1}));
    const neighbours = [], gx = Math.floor(p.x / radius), gy = Math.floor(p.y / radius);
    for (let y = gy - 2; y <= gy + 2; y++) for (let x = gx - 2; x <= gx + 2; x++) for (const other of buckets.get(key(x, y)) || []) {
      if (other === index) continue;
      const q = points[other], squared = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      if (squared < radius * radius * 4) neighbours.push({other, squared});
    }
    neighbours.sort((a, b) => a.squared - b.squared || points[a.other].id - points[b.other].id);
    for (const {other, squared} of neighbours) {
      const q = points[other];
      if (squared < 1e-12) {if (q.id < p.id) polygon = []; continue;}
      polygon = clip(polygon, q.x - p.x, q.y - p.y, (q.x * q.x + q.y * q.y - p.x * p.x - p.y * p.y) / 2, other);
      if (!polygon.length) break;
    }
    return {index, polygon};
  });
  return {points, cells, buckets, radius};
}

/** Return the containing cell index for a world point, or -1 outside the clipped partition. */
export function territoryOwnerAt(geometry, x, y) {
  const {radius, points, cells, buckets} = geometry, gx = Math.floor(x / radius), gy = Math.floor(y / radius);
  let best = -1, distance = Infinity;
  for (let row = gy - 1; row <= gy + 1; row++) for (let col = gx - 1; col <= gx + 1; col++) for (const index of buckets.get(`${col},${row}`) || []) {
    const p = points[index], squared = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (squared < distance || (squared === distance && p.id < points[best]?.id)) {best = index; distance = squared;}
  }
  if (best < 0 || !cells[best].polygon.length) return -1;
  const polygon = cells[best].polygon;
  for (let i = 0; i < polygon.length; i++) {const a = polygon[i], b = polygon[(i + 1) % polygon.length]; if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < -1e-7) return -1;}
  return best;
}

/** Disconnected holdings get their own label; choose real interior systems, never an ocean centroid. */
export function territoryComponents(geometry, styles) {
  const visited = new Set(), components = [];
  for (const cell of geometry.cells) {
    if (!cell.polygon.length || visited.has(cell.index) || !styles[cell.index]?.name || styles[cell.index].dim) continue;
    const indices = [cell.index], style = styles[cell.index]; visited.add(cell.index);
    for (let i = 0; i < indices.length; i++) for (const vertex of geometry.cells[indices[i]].polygon) {
      const next = vertex.from;
      if (next >= 0 && !visited.has(next) && styles[next]?.key === style.key && !styles[next].dim) {visited.add(next); indices.push(next);}
    }
    const centre = indices.reduce((sum, i) => ({x: sum.x + geometry.points[i].x / indices.length, y: sum.y + geometry.points[i].y / indices.length}), {x: 0, y: 0});
    const candidates = [...indices].sort((a, b) => (geometry.points[a].x - centre.x) ** 2 + (geometry.points[a].y - centre.y) ** 2 - (geometry.points[b].x - centre.x) ** 2 - (geometry.points[b].y - centre.y) ** 2).slice(0, 12).map(i => geometry.points[i]);
    components.push({...style, count: indices.length, candidates});
  }
  return components.sort((a, b) => b.count - a.count);
}
