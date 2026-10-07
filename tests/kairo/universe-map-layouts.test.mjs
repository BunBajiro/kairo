import test from 'node:test';
import assert from 'node:assert/strict';
import {createAtlasLayouts} from '../../components/kairo/universe-map-layouts.mjs';
import {projectKnownSystems, pointBounds} from '../../components/kairo/universe-map-math.mjs';
import {schematicLayout} from '../../lib/universe-schematic-layout.mjs';

const systems = [{system_id: 9, space: 'known', map_x: 0, map_y: -4, schematic_x: 30, schematic_y: 20}, {system_id: 2, space: 'known', map_x: 20, map_y: 4, schematic_x: -10, schematic_y: -30}, {system_id: 5, space: 'wormhole', map_x: 1e9, map_y: -1e9}];
test('unused schematic coordinates are never read and both first-use orders preserve exact projections', () => {
  let schematicReads = 0;
  const input = systems.map(system => ({...system, get schematic_x() {schematicReads++; return system.schematic_x;}}));
  const owner = createAtlasLayouts(input);
  assert.equal(schematicReads, 0);
  const physical = owner.get('physical');
  assert.equal(schematicReads, 0);
  assert.deepEqual(physical, projectKnownSystems(input));
  assert.equal(owner.get('physical'), physical);
  const schematic = owner.get('schematic');
  assert.ok(schematicReads > 0);
  assert.deepEqual(schematic, schematicLayout(input.filter(system => system.space === 'known')).points);
  const reads = schematicReads;
  assert.equal(owner.get('schematic'), schematic);
  assert.equal(schematicReads, reads);
  const reverse = createAtlasLayouts(input);
  assert.deepEqual(reverse.get('schematic'), schematic);
  assert.deepEqual(reverse.get('physical'), physical);
});
test('replacement Atlas revision cannot retain stale coordinates and leaves the prior revision intact', () => {
  const first = createAtlasLayouts(systems), old = first.get('physical');
  const changed = systems.map(system => ({...system, map_y: system.map_y + (system.system_id === 9 ? 70 : 0), schematic_x: (system.schematic_x || 0) + 40}));
  const next = createAtlasLayouts(changed);
  assert.notDeepEqual(next.get('physical'), old);
  assert.deepEqual(first.get('physical'), old);
  assert.deepEqual(next.get('physical'), projectKnownSystems(changed));
  assert.deepEqual(next.get('schematic'), schematicLayout(changed.filter(system => system.space === 'known')).points);
});
test('radar fallback and physical distance scale preserve valid-coordinate filtering and empty bounds', () => {
  for (const input of [systems, [], [{system_id: 1, space: 'known', map_x: NaN, map_y: 0}, ...systems]]) {
    const owner = createAtlasLayouts(input), projected = projectKnownSystems(input), raw = pointBounds(projected.map(point => ({x: point.system.map_x, y: point.system.map_y})));
    assert.equal(owner.firstSystemId, projected[0]?.system.system_id);
    assert.equal(owner.worldUnitsPerLightYear, 1000 / Math.max(1, raw.maxX - raw.minX, raw.maxY - raw.minY));
  }
});
