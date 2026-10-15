import test from 'node:test';
import assert from 'node:assert/strict';
import {fitCamera, zoomCamera} from '../../components/kairo/universe-map-math.mjs';
import {wheelZoomFactor, anchoredWheelCamera, pinchCamera, dragCoast, overviewTransform, overviewViewport, projectedDistanceScale} from '../../components/kairo/universe-map-navigation.mjs';

const bounds = {minX: 0, minY: 0, maxX: 1000, maxY: 1000}, size = {width: 1000, height: 600};
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} differs from ${expected}`);

test('pixel, line and page wheel events produce equivalent zoom for equivalent physical delta', () => {
  close(wheelZoomFactor(48, 0, 600), wheelZoomFactor(3, 1, 600));
  close(wheelZoomFactor(48, 0, 600), wheelZoomFactor(.08, 2, 600));
  assert.equal(wheelZoomFactor(NaN), 1);
  assert.ok(wheelZoomFactor(-1e8) < 2);
  assert.ok(wheelZoomFactor(1e8) > .5);
});

test('changing cursor during a queued zoom preserves the currently pointed world coordinate', () => {
  const current = {x: -900, y: -600, scale: 3}, cursor = {x: 230, y: 180};
  const pending = zoomCamera(current, 1.4, {x: 850, y: 420}, bounds, size);
  const target = anchoredWheelCamera(current, pending, 1.3, cursor, bounds, size);
  close((cursor.x - current.x) / current.scale, (cursor.x - target.x) / target.scale);
  close((cursor.y - current.y) / current.scale, (cursor.y - target.y) / target.scale);
  close(target.scale, pending.scale * 1.3);
});

test('wheel accumulation respects overview minimum and bounded maximum', () => {
  const fit = fitCamera(bounds, size);
  assert.deepEqual(anchoredWheelCamera(fit, null, .01, {x: 33, y: 90}, bounds, size), fit);
  const target = anchoredWheelCamera(fit, null, 1e8, {x: 500, y: 300}, bounds, size);
  close(target.scale, fit.scale * 75);
});

test('pinch combines translation and scaling around its original world midpoint', () => {
  const start = {x: -800, y: -600, scale: 3}, first = {x: 400, y: 300}, next = {x: 480, y: 350};
  const target = pinchCamera(start, first, next, 120, 240, bounds, size);
  close(target.scale, 6);
  close((first.x - start.x) / start.scale, (next.x - target.x) / target.scale);
  close((first.y - start.y) / start.scale, (next.y - target.y) / target.scale);
  const zero = pinchCamera(start, first, next, 0, 0, bounds, size);
  assert.ok(Object.values(zero).every(Number.isFinite));
});

test('pinching inward cannot expose a smaller-than-overview galaxy', () => {
  const start = {x: -800, y: -600, scale: 3};
  const target = pinchCamera(start, {x: 400, y: 300}, {x: 400, y: 300}, 200, 1, bounds, size);
  close(target.scale, fitCamera(bounds, size).scale);
});

test('release coast is directional, capped in distance and finite in time', () => {
  const start = {x: -800, y: -600, scale: 3};
  const coast = dragCoast(start, {x: 4, y: -3}, 10, bounds, size);
  assert.ok(coast);
  assert.ok(coast.target.x > start.x && coast.target.y < start.y);
  assert.ok(Math.hypot(coast.target.x - start.x, coast.target.y - start.y) <= 252.000001);
  assert.ok(coast.duration >= 280 && coast.duration <= 580);
  close(coast.target.scale, start.scale);
});

test('old, stationary, invalid and outward-at-edge release samples do not drift', () => {
  const start = {x: -800, y: -600, scale: 3};
  assert.equal(dragCoast(start, {x: 2, y: 0}, 100, bounds, size), null);
  assert.equal(dragCoast(start, {x: .01, y: .01}, 0, bounds, size), null);
  assert.equal(dragCoast(start, {x: Infinity, y: 0}, 0, bounds, size), null);
  assert.equal(dragCoast({x: 920, y: 520, scale: 3}, {x: 1, y: 1}, 0, bounds, size), null);
  assert.equal(dragCoast(fitCamera(bounds, size), {x: 3, y: 2}, 0, bounds, size), null);
});

test('overview reports actual camera footprint and stays inside its inset at all edges', () => {
  const overview = overviewTransform(bounds), fit = fitCamera(bounds, size), full = overviewViewport(fit, size, overview);
  const zoomed = overviewViewport(zoomCamera(fit, 4, {x: 500, y: 300}, bounds, size), size, overview);
  assert.ok(zoomed.width < full.width && zoomed.height < full.height);
  for (const camera of [fit, {x: 900, y: 500, scale: 8}, {x: -7900, y: -7900, scale: 8}]) {
    const rect = overviewViewport(camera, size, overview);
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.width >= 0 && rect.height >= 0);
    assert.ok(rect.x + rect.width <= overview.width + 1e-7 && rect.y + rect.height <= overview.height + 1e-7);
  }
});

test('projected scale gives readable 1/2/5 distances with exact geometric pixel widths', () => {
  assert.deepEqual(projectedDistanceScale(1, 10), {distance: 10, width: 100, label: '10 ly'});
  assert.deepEqual(projectedDistanceScale(2, 10), {distance: 5, width: 100, label: '5 ly'});
  assert.deepEqual(projectedDistanceScale(4, 10), {distance: 2, width: 80, label: '2 ly'});
  assert.equal(projectedDistanceScale(0, 10), null);
  assert.equal(projectedDistanceScale(1, NaN), null);
  for (const zoom of [.001, .03, .7, 3, 19, 75]) {const scale = projectedDistanceScale(zoom, 10); assert.ok(scale.width <= 114 && scale.width > 40); close(scale.width, scale.distance * 10 * zoom);}
});
