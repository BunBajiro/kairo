/** Atlas gesture math: viewport coordinates are CSS pixels; durations/sample ages are milliseconds. */
import {clampCamera, zoomCamera} from './universe-map-math.mjs';

/** WheelEvent deltas use pixels, lines or pages depending on browser/device. */
export function wheelZoomFactor(delta, mode = 0, pageHeight = 600) {
  const pixels = Number(delta) * (mode === 1 ? 16 : mode === 2 ? pageHeight : 1);
  return Math.exp(-Math.max(-160, Math.min(160, Number.isFinite(pixels) ? pixels : 0)) * .0035);
}

/** Accumulate scale, while anchoring the world point actually under the current cursor. */
export function anchoredWheelCamera(current, pending, factor, anchor, bounds, size) {
  const scale = (pending?.scale || current.scale) * factor;
  return zoomCamera(current, scale / current.scale, anchor, bounds, size);
}

export function pinchCamera(start, firstMidpoint, midpoint, firstDistance, distance, bounds, size) {
  const ratio = firstDistance > 1 ? Math.max(1, distance) / firstDistance : 1;
  return clampCamera({x: midpoint.x - (firstMidpoint.x - start.x) * ratio, y: midpoint.y - (firstMidpoint.y - start.y) * ratio, scale: start.scale * ratio}, bounds, size);
}

/**
 * Derive one finite coast target from CSS-pixels/ms velocity and ms sample age.
 * Old/stationary samples or a fully constrained target return null. The renderer
 * owns the returned animation duration; this helper schedules no ongoing physics.
 */
export function dragCoast(camera, velocity, sampleAge, bounds, size) {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (sampleAge > 90 || speed < .08 || !Number.isFinite(speed)) return null;
  const distance = Math.min(speed * 155, Math.min(size.width, size.height) * .42);
  const target = clampCamera({...camera, x: camera.x + velocity.x / speed * distance, y: camera.y + velocity.y / speed * distance}, bounds, size);
  if (Math.hypot(target.x - camera.x, target.y - camera.y) < 1) return null;
  return {target, duration: Math.min(580, Math.max(280, distance * 1.5))};
}

export function overviewTransform(bounds, width = 164, height = 108, padding = 9) {
  const scale = Math.min((width - 2 * padding) / Math.max(36, bounds.maxX - bounds.minX), (height - 2 * padding) / Math.max(36, bounds.maxY - bounds.minY));
  return {x: width / 2 - (bounds.minX + bounds.maxX) * scale / 2, y: height / 2 - (bounds.minY + bounds.maxY) * scale / 2, scale, width, height};
}

export function overviewViewport(camera, size, overview) {
  const left = -camera.x / camera.scale * overview.scale + overview.x;
  const top = -camera.y / camera.scale * overview.scale + overview.y;
  return {x: Math.max(0, left), y: Math.max(0, top), width: Math.max(0, Math.min(overview.width, left + size.width / camera.scale * overview.scale) - Math.max(0, left)), height: Math.max(0, Math.min(overview.height, top + size.height / camera.scale * overview.scale) - Math.max(0, top))};
}

/** Scale measures projected X–Z distance, never a ship's true 3-D jump distance. */
export function projectedDistanceScale(cameraScale, worldUnitsPerLightYear, maxPixels = 114) {
  const pixelsPerLightYear = cameraScale * worldUnitsPerLightYear;
  if (!Number.isFinite(pixelsPerLightYear) || pixelsPerLightYear <= 0) return null;
  const maximum = maxPixels / pixelsPerLightYear, magnitude = 10 ** Math.floor(Math.log10(maximum));
  const distance = [5, 2, 1].find(step => step * magnitude <= maximum) * magnitude;
  return {distance, width: distance * pixelsPerLightYear, label: `${Number(distance.toPrecision(3))} ly`};
}
