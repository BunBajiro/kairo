// Upgrade-equivalent fixture preparation only; never part of a timed operation.
import assert from 'node:assert/strict';

export function seedLegacyDiscovery(store) {
  const expected=store.db.prepare('SELECT DISTINCT character_id,system_id FROM visits WHERE character_id>0 AND system_id>0 ORDER BY character_id,system_id').all();
  const available=!!store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='discovered_systems'").get();
  if(available) {
    // A real upgrade sees pre-existing legacy visits during openStore migration.
    // Synthetic fixtures insert visits after openStore, so reproduce that step.
    store.db.exec('INSERT OR IGNORE INTO discovered_systems(character_id,system_id) SELECT character_id,system_id FROM visits WHERE character_id>0 AND system_id>0');
    const actual=store.db.prepare('SELECT character_id,system_id FROM discovered_systems ORDER BY character_id,system_id').all();
    assert.deepEqual(actual,expected,'Fixture discovery membership must match the migration from existing visits');
  }
  return {available,expectedMemberships:expected.length,seededMemberships:available?expected.length:null,
    method:available?'Migration-equivalent INSERT from legacy visits, before measured startup/work':'Baseline has no separate discovery table; membership is available through legacy visits'};
}
