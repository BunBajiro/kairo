import test from 'node:test';
import assert from 'node:assert/strict';
import {projectKnownSystems, pointBounds, fitCamera, clampCamera, zoomCamera, resizeCamera, createTerritoryGeometry, territoryOwnerAt, territoryComponents, geometryRevision, paintRevision} from '../../components/kairo/universe-map-math.mjs';

const size = {width: 1200, height: 650};
const bounds = {minX: 0, minY: 0, maxX: 850, maxY: 1000};
const close = (actual, expected, delta = 1e-7) => assert.ok(Math.abs(actual - expected) < delta, `${actual} ≠ ${expected}`);

test('known-space extents exclude J-space, abyssal and other-space outliers, preserving zero coordinates', () => {
  const systems = [{space: 'known', map_x: 0, map_y: 0}, {space: 'known', map_x: 100, map_y: 80}];
  const before = projectKnownSystems(systems);
  const after = projectKnownSystems([...systems, ...['wormhole', 'abyssal', 'other'].map(space => ({space, map_x: 1e9, map_y: -1e9}))]);
  assert.deepEqual(after, before);
  assert.deepEqual(pointBounds(after), {minX: 0, maxX: 1000, minY: 0, maxY: 800});
});

test('overview has modest padding and repeated wheel zoom-out cannot shrink known space', () => {
  const fitted = fitCamera(bounds, size);
  close(fitted.y, 42.25);
  let camera = fitted;
  for (let i = 0; i < 80; i++) camera = zoomCamera(camera, .5, {x: 60, y: 200}, bounds, size);
  assert.deepEqual(camera, fitted);
});

test('active region and independent J-space bounds get their own minimum fit', () => {
  const region = {minX: 100, minY: 250, maxX: 200, maxY: 330};
  const jspace = pointBounds([{x: 125, y: 125}, {x: 230, y: 125}]);
  assert.ok(fitCamera(region, size).scale > fitCamera(bounds, size).scale * 5);
  assert.ok(fitCamera(jspace, size).scale > fitCamera(bounds, size).scale * 5);
  const fitted = fitCamera(region, size);
  assert.deepEqual(zoomCamera(fitted, .01, {x: 800, y: 600}, region, size), fitted);
});

test('overview resize preserves 1× and zoomed resize preserves the world centre and relative zoom', () => {
  const next = {width: 550, height: 950}, fitted = fitCamera(bounds, size);
  const resizedFit = resizeCamera(fitted, size, next, bounds);
  assert.deepEqual(resizedFit, fitCamera(bounds, next));
  const zoomed = zoomCamera(fitted, 4, {x: 600, y: 325}, bounds, size), resized = resizeCamera(zoomed, size, next, bounds);
  close(resized.scale / resizedFit.scale, 4);
  close((size.width / 2 - zoomed.x) / zoomed.scale, (next.width / 2 - resized.x) / resized.scale);
  close((size.height / 2 - zoomed.y) / zoomed.scale, (next.height / 2 - resized.y) / resized.scale);
});

test('panning at the overview is locked; zoomed panning retains visible space at every edge', () => {
  const fitted = fitCamera(bounds, size);
  assert.deepEqual(clampCamera({...fitted, x: 1e8, y: -1e8}, bounds, size), fitted);
  for (const direction of [-1, 1]) {
    const panned = clampCamera({...fitted, scale: fitted.scale * 8, x: direction * 1e8, y: direction * 1e8}, bounds, size);
    assert.ok(panned.x + bounds.maxX * panned.scale >= 79);
    assert.ok(panned.x + bounds.minX * panned.scale <= size.width - 79);
    assert.ok(panned.y + bounds.maxY * panned.scale >= 79);
    assert.ok(panned.y + bounds.minY * panned.scale <= size.height - 79);
  }
});

test('a singleton and an empty discovery graph produce finite cameras', () => {
  for (const points of [[], [{x: 0, y: 0}]]) for (const viewport of [{width: 1, height: 1}, size]) {
    const camera = fitCamera(pointBounds(points), viewport);
    assert.ok(Object.values(camera).every(Number.isFinite)); assert.ok(camera.scale > 0);
  }
});

test('vector cell boundary is the exact bisector and survives arbitrary zoom without raster quantisation', () => {
  const points = [{id: 1, x: 0, y: 0}, {id: 2, x: 13.375, y: 0}], geometry = createTerritoryGeometry(points);
  for (const [index, cell] of geometry.cells.entries()) {
    const cut = cell.polygon.findIndex(vertex => vertex.from === 1 - index);
    assert.ok(cut >= 0);
    close(cell.polygon[cut].x, 6.6875);
    close(cell.polygon[(cut + cell.polygon.length - 1) % cell.polygon.length].x, 6.6875);
  }
  assert.equal(territoryOwnerAt(geometry, 6.68, 0), 0);
  assert.equal(territoryOwnerAt(geometry, 6.69, 0), 1);
  assert.equal(territoryOwnerAt(geometry, 1000, 0), -1);
});

test('spatial clipping agrees with an independent nearest-point oracle throughout dense and sparse space', () => {
  let seed = 7; const random = () => {seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32;};
  const points = Array.from({length: 180}, (_, id) => ({id, x: random() * 200, y: random() * 200})), geometry = createTerritoryGeometry(points);
  points.forEach((p, i) => assert.equal(territoryOwnerAt(geometry, p.x, p.y), i));
  for (let sample = 0; sample < 1000; sample++) {
    const x = random() * 300 - 50, y = random() * 300 - 50;
    let expected = -1, minimum = Infinity;
    points.forEach((point, i) => {const distance = Math.hypot(point.x - x, point.y - y); if (distance < minimum) {minimum = distance; expected = i;}});
    // Ignore the narrow annulus between the clipped polygon's inner and outer radii.
    if (minimum < 23) assert.equal(territoryOwnerAt(geometry, x, y), expected);
    if (minimum > 24) assert.equal(territoryOwnerAt(geometry, x, y), -1);
  }
});

test('standing filters dim the same full partition and never transfer enemy territory', () => {
  const points = [{id: 1, x: 0, y: 0}, {id: 2, x: 10, y: 0}, {id: 3, x: 20, y: 0}], geometry = createTerritoryGeometry(points);
  const styles = points.map((p, i) => ({key: i === 1 ? 'hostile' : 'friendly', colour: '#888888', strength: 1, name: i === 1 ? 'Enemy' : 'Ally'}));
  const original = JSON.stringify(geometry.cells);
  const filtered = styles.map(style => ({...style, dim: style.key === 'hostile'}));
  assert.notEqual(paintRevision(styles), paintRevision(filtered));
  territoryComponents(geometry, filtered);
  assert.equal(JSON.stringify(geometry.cells), original);
  assert.equal(territoryOwnerAt(geometry, 10, 0), 1);
  assert.equal(filtered[territoryOwnerAt(geometry, 10, 0)].key, 'hostile');
});

test('disconnected holdings get separate interior anchors and an enclave remains its own component', () => {
  const points = [{id: 1, x: 0, y: 0}, {id: 2, x: 100, y: 0}, {id: 3, x: 104, y: 0}, {id: 4, x: 0, y: 9}, {id: 5, x: 0, y: -9}, {id: 6, x: -9, y: 0}, {id: 7, x: 9, y: 0}];
  const geometry = createTerritoryGeometry(points), styles = points.map((p, i) => ({key: i === 0 ? 'enclave' : 'outer', colour: '#888888', strength: 1, name: i === 0 ? 'Enclave' : 'Outer'}));
  const components = territoryComponents(geometry, styles);
  assert.equal(components.filter(c => c.key === 'outer').length, 2);
  assert.equal(components.filter(c => c.key === 'enclave').length, 1);
  for (const component of components) for (const anchor of component.candidates) assert.equal(styles[territoryOwnerAt(geometry, anchor.x, anchor.y)].key, component.key);
});

test('relevant revisions ignore object replacement and unrelated refreshes but detect politics changes', () => {
  const points = [{id: 1, x: 0, y: 5}], styles = [{key: 'bloc:a', colour: '#123456', strength: 1, name: 'A', source: 'configured'}];
  assert.equal(geometryRevision(points), geometryRevision(structuredClone(points)));
  assert.equal(paintRevision(styles), paintRevision(styles.map(s => ({...s, kills: 100, refreshedAt: 'later'}))));
  assert.notEqual(paintRevision(styles), paintRevision(styles.map(s => ({...s, key: 'bloc:b'}))));
  assert.notEqual(paintRevision(styles), paintRevision(styles.map(s => ({...s, source: 'inferred'}))));
  assert.notEqual(paintRevision(styles), paintRevision(styles.map(s => ({...s, outlineColour: '#cbddec'}))));
  assert.notEqual(geometryRevision(points), geometryRevision([{id: 1, x: 0, y: 6}]));
});

test('duplicate projected points resolve deterministically without corrupting neighbours', () => {
  const geometry = createTerritoryGeometry([{id: 8, x: 0, y: 0}, {id: 4, x: 0, y: 0}, {id: 12, x: 10, y: 0}]);
  assert.equal(geometry.cells[0].polygon.length, 0);
  assert.equal(territoryOwnerAt(geometry, 0, 0), 1);
  assert.equal(territoryOwnerAt(geometry, 10, 0), 2);
});
