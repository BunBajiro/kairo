import test from 'node:test';
import assert from 'node:assert/strict';
import { FACTION_TERRITORY_COLOURS, allocateTerritoryColours, territoryColourDistance, territoryColourEntities,
    configuredTerritoryColourConflict, suggestTerritoryColour } from '../../lib/universe-territory-colours.mjs';

const empires = Object.keys(FACTION_TERRITORY_COLOURS).map(id => ({ key: 'f' + id, factionId: Number(id) }));
const contrast = (a, b) => {
    const luminance = value => {
        const rgb = [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const first = luminance(a), second = luminance(b);
    return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
};

test('the four empire territories retain canonical distinct colours and readable outlines', () => {
    const palette = allocateTerritoryColours(empires);
    assert.equal(palette.get('f500001').fill, '#4f88c6');
    assert.equal(palette.get('f500004').fill, '#3da891');
    assert.equal(palette.get('f500003').fill, '#c7a44b');
    assert.equal(palette.get('f500002').fill, '#b86b4b');
    for (const paint of palette.values()) assert.ok(contrast(paint.outline, '#080f18') >= 4.5);
    // Empire hues remain reserved even if none of those factions is visible.
    const absent = allocateTerritoryColours([{ key: 'a77', preferredColor: '#4f88c6' }]);
    assert.notEqual(absent.get('a77').fill, '#4f88c6');
});

test('1,200 owner identities plus blocs never reuse fill or outline and ignore input ordering', () => {
    const rows = [...empires, { key: 'bloc:manual', preferredColor: '#eda187', priority: 10 },
        ...Array.from({ length: 1200 }, (_, i) => ({ key: 'a' + (99000000 + i * 360) }))];
    const forward = allocateTerritoryColours(rows), backward = allocateTerritoryColours([...rows].reverse());
    assert.deepEqual([...forward], [...backward]);
    assert.equal(new Set([...forward.values()].map(value => value.fill)).size, rows.length);
    assert.equal(new Set([...forward.values()].map(value => value.outline)).size, rows.length);
    assert.equal(forward.get('bloc:manual').fill, '#eda187');
    for (const paint of forward.values()) assert.ok(contrast(paint.outline, '#080f18') >= 4.5);
});

test('configured preference wins deterministic legacy conflicts without changing input definitions', () => {
    const rows = [{ key: 'a77', preferredColor: '#abcdef' }, { key: 'bloc:z', preferredColor: '#abcdef', priority: 10 },
        { key: 'bloc:a', preferredColor: '#abcdef', priority: 10 }], before = structuredClone(rows);
    const result = allocateTerritoryColours(rows);
    assert.equal(result.get('bloc:a').fill, '#abcdef'); assert.notEqual(result.get('bloc:z').fill, '#abcdef');
    assert.notEqual(result.get('a77').fill, '#abcdef'); assert.equal(new Set([...result.values()].map(row => row.fill)).size, rows.length);
    assert.deepEqual(rows, before);
});

test('small generated palettes separate nearby shades instead of recycling a short hue list', () => {
    const result = allocateTerritoryColours(Array.from({ length: 12 }, (_, i) => ({ key: 'a' + (99000100 + i) })));
    const colors = [...result.values()].map(row => row.fill);
    for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++)
        assert.ok(territoryColourDistance(colors[i], colors[j]) > .045);
});

test('custom black fills have readable outlines, with collision-safe individual shades', () => {
    const result = allocateTerritoryColours(Array.from({ length: 40 }, (_, i) => ({ key: 'bloc:' + i, preferredColor: '#' + i.toString(16).padStart(6, '0'), priority: 10 })));
    assert.equal(result.get('bloc:0').fill, '#000000');
    assert.equal(new Set([...result.values()].map(row => row.outline)).size, result.size);
    for (const paint of result.values()) assert.ok(contrast(paint.outline, '#080f18') >= 4.5);
});

test('one ownership/group roster uses live sovereignty and preserves source priority', () => {
    const entities = territoryColourEntities([{ alliance_id: 77, faction_id: 500001 }, { alliance_id: 77 }, { faction_id: 500004 }, { corporation_id: 88 }, {}], [
        { id: 'manual', color: '#abcdef', source: 'configured' }, { id: 'inferred-one', color: '#abcdef', source: 'inferred' },
        { id: 'alliance-77', color: '#123456', source: 'independent' },
    ]);
    assert.deepEqual(entities.map(row => row.key).sort(), ['a77', 'bloc:inferred-one', 'bloc:manual', 'c88', 'f500004']);
    assert.equal(entities.find(row => row.key === 'bloc:inferred-one').preferredColor, undefined);
    const palette = allocateTerritoryColours(entities);
    assert.equal(palette.get('bloc:manual').fill, '#abcdef'); assert.equal(palette.get('f500004').fill, '#3da891');
    assert.equal(new Set([...palette.values()].map(row => row.fill)).size, entities.length);
});

test('settings reject exact duplicate/reserved colours and suggest genuinely unused replacements', () => {
    const blocs = [{ id: 'one', name: 'First bloc', color: '#abcdef' }, { id: 'two', name: 'Second bloc', color: '#abcdef' }];
    assert.match(configuredTerritoryColourConflict('#ABCDEF', blocs, 'one'), /Second bloc/);
    assert.match(configuredTerritoryColourConflict('#4F88C6', blocs), /Caldari State/);
    assert.equal(configuredTerritoryColourConflict('#abcdef', [blocs[0]], 'one'), null);
    const replacement = suggestTerritoryColour('one', blocs);
    assert.notEqual(replacement, '#abcdef'); assert.equal(configuredTerritoryColourConflict(replacement, blocs, 'one'), null);
});

test('repeated systems share one owner colour and inconsistent faction aliases fail visibly', () => {
    assert.equal(allocateTerritoryColours([{ key: 'a77' }, { key: 'a77' }]).size, 1);
    assert.throws(() => allocateTerritoryColours([{ key: 'one', factionId: 500001 }, { key: 'two', factionId: 500001 }]), /canonical territory key/);
});
