import test from 'node:test';
import assert from 'node:assert/strict';
import {getUniverseStatic} from '../../server/universe-static.mjs';
import {schematicLayout} from '../../lib/universe-schematic-layout.mjs';
import {buildGateGraph, tacticalLayout} from '../../components/kairo/universe-map-operations.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} differs from ${expected}`);
const atlas = getUniverseStatic(), known = atlas.systems.filter(system => system.space === 'known');
const tenerifis = known.filter(system => system.region_id === 10000061);

test('every bundled known-space system has a unique CCP schematic position', () => {
  assert.equal(known.length, atlas.metadata.counts.space.known);
  assert.ok(known.length > 5400);
  assert.ok(known.every(system => Number.isFinite(system.schematic_x) && Number.isFinite(system.schematic_y)));
  assert.equal(new Set(known.map(system => `${system.schematic_x}:${system.schematic_y}`)).size, known.length);
  assert.equal(schematicLayout(known).source, 'sde');
});

test('Tenerifis preserves the in-game geometry instead of collapsing single-system hop bands', () => {
  const result = schematicLayout(tenerifis), byName = new Map(result.points.map(point => [point.system.name, point]));
  assert.equal(result.points.length, 81);
  const ualx = byName.get('UALX-3'), dt = byName.get('DT-PXH'), left = byName.get('3L3N-X'), right = byName.get('Y-ORBJ');
  assert.ok(dt.x > ualx.x && dt.y < ualx.y);
  assert.ok(left.x < ualx.x && left.y > ualx.y && right.x > ualx.x);
  close(left.y, right.y);
  const vertical = ['0P-U0Q', 'XGH-SH', 'G-D0N3', 'T-AKQZ'].map(name => byName.get(name));
  for (let index = 1; index < vertical.length; index++) {
    close(vertical[index].x, vertical[0].x);
    assert.ok(vertical[index].y > vertical[index - 1].y);
  }
  for (const point of result.points) {
    close(point.x - ualx.x, (point.system.schematic_x - ualx.system.schematic_x) * result.scale);
    close(point.y - ualx.y, (point.system.schematic_y - ualx.system.schematic_y) * result.scale);
  }
  assert.deepEqual(schematicLayout([...tenerifis].reverse()), result);
});

test('schematic works galaxy-wide, region-wide and constellation-wide without a pilot or gate-hop cutoff', () => {
  const gates = buildGateGraph(atlas.gates);
  const all = tacticalLayout(atlas.systems, gates, {mode: 'schematic'});
  assert.equal(all.total, known.length); assert.equal(all.limited, false);
  assert.deepEqual(tacticalLayout(atlas.systems, gates, {mode: 'schematic', centerSystemId: 30000142}).points, all.points);
  const regional = tacticalLayout(atlas.systems, gates, {mode: 'schematic', regionId: 10000061});
  assert.equal(regional.total, 81); assert.deepEqual(regional.points, schematicLayout(tenerifis).points);
  const constellation = tacticalLayout(atlas.systems, gates, {mode: 'schematic', constellationId: 20000703});
  assert.deepEqual(constellation.points.map(point => point.system.system_id), tenerifis.filter(system => system.constellation_id === 20000703).map(system => system.system_id));
});

test('region card placement uses one uniform scale, with readable spacing and no overlapping rectangles', () => {
  const width = 260, height = 132, gap = 32;
  const result = schematicLayout(tenerifis, {nodeWidth: width, nodeHeight: height, gap});
  assert.equal(result.source, 'sde');
  close(result.bounds.minX + result.bounds.maxX, 0); close(result.bounds.minY + result.bounds.maxY, 0);
  for (let a = 0; a < result.points.length; a++) for (let b = a + 1; b < result.points.length; b++) {
    const one = result.points[a], two = result.points[b];
    assert.ok(Math.abs(one.x - two.x) >= width + gap - 1e-7 || Math.abs(one.y - two.y) >= height + gap - 1e-7);
    close(one.x - two.x, (one.system.schematic_x - two.system.schematic_x) * result.scale);
    close(one.y - two.y, (one.system.schematic_y - two.system.schematic_y) * result.scale);
  }
});

test('incomplete references fall back explicitly without mixing coordinate spaces or dropping systems', () => {
  const systems = [{system_id: 1, schematic_x: 800, schematic_y: 900, map_x: 2, map_y: 3}, {system_id: 2, map_x: 3, map_y: 4}];
  const physical = schematicLayout(systems);
  assert.equal(physical.source, 'physical'); assert.equal(physical.points.length, 2);
  close(physical.points[1].x - physical.points[0].x, physical.points[1].y - physical.points[0].y);
  const partial = [...systems, {system_id: 3}], grid = schematicLayout(partial);
  assert.equal(grid.source, 'grid'); assert.equal(grid.points.length, 3);
  assert.deepEqual(schematicLayout([...partial].reverse()), grid);
  const coincident = schematicLayout([{system_id: 1, schematic_x: 0, schematic_y: 0}, {system_id: 2, schematic_x: 0, schematic_y: 0}]);
  assert.equal(coincident.source, 'grid'); assert.notEqual(coincident.points[0].x, coincident.points[1].x);
});

test('empty, singleton and zero coordinates remain finite; source records are not mutated', () => {
  assert.deepEqual(schematicLayout([]).points, []);
  const record = Object.freeze({system_id: 1, schematic_x: 0, schematic_y: 0});
  const single = schematicLayout(Object.freeze([record]), {nodeWidth: 260, nodeHeight: 132});
  assert.deepEqual(single.points, [{system: record, x: 0, y: 0}]); assert.equal(single.source, 'sde');
  assert.ok(Object.values(single.bounds).every(Number.isFinite));
});
