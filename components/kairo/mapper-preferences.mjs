/** Pilot/device display preferences and settled-camera focus; no backend map records are changed. */
import {chainNodeSize} from './jspace-map-geometry.mjs';
export const MAPPER_PREFERENCES_EVENT = 'kairo-mapper-preferences';
export const mapperPreferencesKey = character => `kairo:mapper:preferences:${Number(character)||0}`;
export function normalizeMapperPreferences(value) {
  const scale = number => typeof number === 'number' && Number.isFinite(number) ? Math.max(.5, Math.min(1.5, number)) : 1;
  return {version:1, knownScale:scale(value?.knownScale), wormholeScale:scale(value?.wormholeScale), focusDetail:value?.focusDetail === true};
}
/** Corrupt or unavailable storage restores normalized defaults; character 0 uses the no-pilot key. */
export function readMapperPreferences(character, storage) {
  try { return normalizeMapperPreferences(JSON.parse(storage.getItem(mapperPreferencesKey(character)) || 'null')); }
  catch { return normalizeMapperPreferences(null); }
}
/**
 * Compute focus only after camera movement settles. Node/world centres are
 * projected into viewport CSS pixels; previous members use a wider rectangle
 * than new members to avoid repeated detail changes near an edge.
 */
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
