import {chainNodeSize} from './jspace-map-geometry.mjs';
export const MAPPER_PREFERENCES_EVENT = 'kairo-mapper-preferences';
export const mapperPreferencesKey = character => `kairo:mapper:preferences:${Number(character)||0}`;
export function normalizeMapperPreferences(value) {
  const scale = number => typeof number === 'number' && Number.isFinite(number) ? Math.max(.5, Math.min(1.5, number)) : 1;
  return {version:1, knownScale:scale(value?.knownScale), wormholeScale:scale(value?.wormholeScale), focusDetail:value?.focusDetail === true};
}
export function readMapperPreferences(character, storage) {
  try { return normalizeMapperPreferences(JSON.parse(storage.getItem(mapperPreferencesKey(character)) || 'null')); }
  catch { return normalizeMapperPreferences(null); }
}
/** Camera-end focus uses inner/outer rectangles to avoid flapping near an edge. */
export function settledMapFocus(nodes, camera, size, previous = []) {
  const retained = new Set(previous), ids = [];
  for (const node of nodes) {
    const margin = retained.has(node.system_id) ? .1 : .2;
    const {width,height}=chainNodeSize(node);
    const x = camera.x + (node.x + width/2) * camera.zoom, y = camera.y + (node.y + height/2) * camera.zoom;
    if (x >= size.width*margin && x <= size.width*(1-margin) && y >= size.height*margin && y <= size.height*(1-margin)) ids.push(node.system_id);
  }
  return ids;
}
