import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { enrichWormholeSystem, getWormholeCatalogue, getWormholeReference, getWormholeType } from '../../server/universe-wormholes.mjs';

const atlasFile = new URL('../../server/data/universe.json.gz', import.meta.url);
const atlas = JSON.parse(gunzipSync(readFileSync(atlasFile)));
const byName = new Map(atlas.systems.map(system => [system.name, system]));
const reference = name => getWormholeReference(byName.get(name).system_id);

test('wormhole reference covers the complete SDE J-space and records exact source provenance', () => {
    const { metadata, types, effects } = getWormholeCatalogue();
    assert.equal(metadata.revision, '6c5d43936e88f1d2acabc4d45fc82cbb67d4a08a');
    assert.equal(metadata.sdeBuild, atlas.metadata.build);
    assert.equal(metadata.atlasSha256, createHash('sha256').update(readFileSync(atlasFile)).digest('hex'));
    assert.equal(Object.keys(metadata.files).length, 5);
    for (const digest of Object.values(metadata.files)) assert.match(digest, /^[a-f0-9]{64}$/);
    assert.equal(types.length, 100);
    assert.equal(effects.length, 6);
    let count = 0;
    for (const system of atlas.systems) {
        const result = getWormholeReference(system.system_id);
        if (system.space !== 'wormhole') assert.equal(result, null);
        else {
            count++;
            assert.equal(result.classId, system.wormhole_class);
            assert.equal(result.referenceOnly, true);
            for (const type of result.statics) assert.ok(type.destinationClasses?.length);
        }
    }
    assert.equal(count, 2604);
    assert.equal(metadata.counts.systems, count);
});

test('J225111 has C4 identity and P060 C1 / C247 C3 statics without invented endpoints', () => {
    const actual = reference('J225111');
    assert.equal(actual.classLabel, 'C4');
    assert.equal(actual.effect, null);
    assert.deepEqual(actual.statics.map(type => [type.type, type.destinationClasses.map(row => row.label)]), [
        ['C247', ['C3']], ['P060', ['C1']],
    ]);
    const p060 = actual.statics.find(row => row.type === 'P060');
    assert.equal(p060.maxJumpMassKg, 62000000);
    assert.equal(p060.totalMassKg, 500000000);
    assert.equal(p060.lifetimeHours, 16);
    assert.equal(p060.massRegenerationKg, 0);
    for (const type of actual.statics) {
        assert.equal(type.to_system_id, undefined);
        assert.equal(type.expires_at, undefined);
        assert.equal(type.remainingMassKg, undefined);
    }
    assert.deepEqual(actual.wanderingTypes, ['K329', 'N290', 'S047']);
});

test('CCP effect identity and power correct upstream errors and retain class-specific modifiers', () => {
    assert.equal(reference('J005926').effect.name, 'Red Giant');
    assert.equal(reference('J010569').effect.name, 'Wolf-Rayet Star');
    const c13 = atlas.systems.find(system => system.wormhole_class === 13);
    const c13Effect = getWormholeReference(c13.system_id).effect;
    assert.equal(c13Effect.power, 6);
    assert.equal(c13Effect.modifiers.find(row => row.name === 'Small Weapon Damage').value, '+200%');
    const drifter = reference('Azdaja Redoubt');
    assert.equal(drifter.effect.power, 2);
    assert.equal(drifter.effect.modifiers.find(row => row.name === 'Small Weapon Damage').value, '+88%');
    const blackHole = getWormholeCatalogue().effects.find(row => row.name === 'Black Hole');
    assert.equal(blackHole.modifiers.find(row => row.name === 'Ship Velocity').powers[5], '+100%');
    const corrections = getWormholeCatalogue().metadata.corrections;
    assert.equal(corrections.filter(row => row.kind === 'effect_identity').length, 2);
    assert.equal(corrections.filter(row => row.kind === 'modifier_unit').length, 1);
});

test('all C13 systems and Thera are shattered and special identities use authoritative SDE names', () => {
    const c13 = atlas.systems.filter(system => system.wormhole_class === 13);
    assert.equal(c13.length, 25);
    for (const system of c13) {
        const actual = getWormholeReference(system.system_id);
        assert.equal(actual.shattered, true);
        assert.equal(actual.frigateOnly, true);
        assert.equal(actual.classLabel, 'C13');
    }
    const thera = enrichWormholeSystem(byName.get('Thera'));
    assert.equal(thera.name, 'Thera');
    assert.equal(thera.wormhole.classLabel, 'Thera');
    assert.equal(thera.wormhole.shattered, true);
    assert.equal(thera.wormhole.hub, true);
    assert.equal(thera.wormhole.frigateOnly, false);
    assert.equal(thera.wormhole.effect, null);
    assert.deepEqual(thera.wormhole.statics.map(row => row.destinationClasses[0].label).sort(), ['High-sec', 'Low-sec', 'Null-sec']);
    const drifter = enrichWormholeSystem(byName.get('Liberated Barbican'));
    assert.equal(drifter.name, 'Liberated Barbican');
    assert.equal(drifter.wormhole.classLabel, 'Drifter');
    assert.equal(drifter.wormhole.drifter, true);
    assert.equal(drifter.wormhole.shattered, true);
    assert.equal(getWormholeCatalogue().metadata.counts.shattered, 106);
});

test('unknown hole values stay unknown while enrichment is immutable and never changes graph topology', () => {
    const k162 = getWormholeType(' k162 ');
    for (const key of ['destinationClasses', 'maxJumpMassKg', 'totalMassKg', 'lifetimeHours', 'massRegenerationKg']) {
        assert.equal(k162[key], null);
    }
    assert.equal(getWormholeType('B735').massRegenerationKg, null);
    assert.equal(getWormholeType('C247').massRegenerationKg, 0);
    assert.equal(getWormholeType('unknown'), null);
    assert.equal(getWormholeType(null), null);
    assert.equal(getWormholeReference(-1), null);
    const source = byName.get('J225111'), actual = enrichWormholeSystem(source);
    assert.notEqual(actual, source);
    assert.equal(source.wormhole, undefined);
    const { wormhole, ...rest } = actual;
    assert.deepEqual(rest, source);
    assert.equal(actual.gate_count, 0);
    assert.equal(actual.jump_eligible, false);
    assert.equal(enrichWormholeSystem(byName.get('Jita')), byName.get('Jita'));
    assert.equal(enrichWormholeSystem(null), null);
    assert.equal(wormhole, getWormholeReference(source.system_id));
    assert.throws(() => { wormhole.statics[0].destinationClasses[0].label = 'C6'; }, TypeError);
    assert.throws(() => { getWormholeCatalogue().types.push(k162); }, TypeError);
});
