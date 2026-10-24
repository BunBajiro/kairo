import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPoliticalAtlas } from '../../lib/universe-political-atlas.mjs';
import { allocateTerritoryColours, territoryColourEntities } from '../../lib/universe-territory-colours.mjs';

const system = (id, region = 10, extra = {}) => ({ system_id: id, name: 'System ' + id, region_id: region, region_name: 'Region ' + region, space: 'known', ...extra });
const gate = (from, to, extra = {}) => ({ from_system_id: from, to_system_id: to, ...extra });
const group = (id, alliance_ids, source = 'configured') => ({ id, alliance_ids, name: id === 'home' ? 'Home bloc' : 'Empty bloc', source, color: '#bc93d8' });
const member = (id, groupId = 'home', source = 'configured') => ({ alliance_id: id, group_id: groupId, name: 'Home bloc', source, color: '#bc93d8' });
const overlay = (system_id, alliance_id, extra = {}) => ({ system_id, sovereignty: { alliance_id, alliance_name: 'Alliance ' + alliance_id }, ...extra });
function fixture() {
    const atlas = { systems: [system(1), system(2), system(3, 20), system(4, 20), system(5, 20, { faction_id: 500003 }), system(6, 30, { space: 'wormhole' })],
        regions: [{ region_id: 10, name: 'Region 10' }, { region_id: 20, name: 'Region 20' }],
        gates: [gate(1, 2), gate(2, 1), gate(2, 3), gate(3, 2), gate(2, 3), gate(1, 3), gate(3, 4), gate(4, 5), gate(3, 6), gate(2, 2), gate(1, 4, { kind: 'wormhole' })] };
    const intel = { systems: [overlay(1, 77, { power_bloc: member(77), kills: { ship_kills: 3, pod_kills: 1 }, jumps: 10 }),
        overlay(2, 78, { power_bloc: member(78), kills: { ship_kills: 2, pod_kills: 0 }, jumps: 5 }),
        overlay(3, 79, { power_bloc: member(79, 'alliance-79', 'independent'), kills: { ship_kills: 4, pod_kills: 2 }, jumps: 8 }),
        { system_id: 4, sovereignty: { faction_id: 500001, faction_name: 'Caldari State' } },
        { system_id: 5, sovereignty: null }, overlay(6, 88)],
        sources: { sovereignty: { status: 'ready' }, kills: { status: 'ready' }, jumps: { status: 'ready' } },
        defaults: { kills: { ship_kills: 0, pod_kills: 0 }, jumps: 0 },
        politics: { status: 'limited', groups: [group('home', [77, 78, 81]), group('empty', [90])] },
        links: [gate(2, 4, { kind: 'ansiblex' })] };
    return { atlas, intel };
}

test('group union preserves exact holdings, membership and observed-region denominators', () => {
    const { atlas, intel } = fixture(), result = buildPoliticalAtlas(atlas, intel), home = result.territories.find(row => row.key === 'bloc:home');
    assert.equal(result.available, true); assert.equal(result.stale, false); assert.equal(result.totalSovereignSystems, 4); assert.equal(result.unobservedSystemCount, 1);
    assert.deepEqual(home.systemIds, [1, 2]); assert.deepEqual(home.allianceIds, [77, 78, 81]);
    assert.deepEqual(home.regions, [{ regionId: 10, name: 'Region 10', systemCount: 2 }]);
    assert.deepEqual(home.activity, { shipKills: 5, podKills: 1, jumps: 15 });
    const empty = result.territories.find(row => row.key === 'bloc:empty');
    assert.deepEqual(empty.systemIds, []); assert.deepEqual(empty.allianceIds, [90]); assert.deepEqual(empty.activity, { shipKills: null, podKills: null, jumps: null });
    assert.equal(result.territories.some(row => row.key === 'a88'), false); // J-space is never political territory here.
    assert.equal(result.territories.some(row => row.key === 'f500003'), false); // Static faction metadata is not sovereignty evidence.
});

test('frontiers deduplicate bidirectional gates and internal bloc crossings; adjacency is never a relationship', () => {
    const { atlas, intel } = fixture(), rows = buildPoliticalAtlas(atlas, intel).territories;
    const home = rows.find(row => row.key === 'bloc:home'), independent = rows.find(row => row.key === 'a79');
    assert.equal(home.neighbours.length, 1); assert.equal(home.neighbours[0].key, 'a79'); assert.equal(home.neighbours[0].gateCount, 2);
    assert.deepEqual(home.neighbours[0].connections, [{ fromSystemId: 1, toSystemId: 3 }, { fromSystemId: 2, toSystemId: 3 }]);
    assert.equal(independent.source, 'independent'); assert.deepEqual(independent.allianceIds, [79]);
    assert.deepEqual(independent.neighbours.find(row => row.key === 'bloc:home').connections, [{ fromSystemId: 3, toSystemId: 1 }, { fromSystemId: 3, toSystemId: 2 }]);
    assert.ok(independent.neighbours.some(row => row.key === 'f500001')); assert.equal(home.neighbours.some(row => row.key === 'f500001'), false);
    for (const neighbour of home.neighbours) { assert.equal(neighbour.hostile, undefined); assert.equal(neighbour.standing, undefined); }
});

test('sovereignty view separates the alliances inside a configured group and reveals their real gate frontier', () => {
    const { atlas, intel } = fixture(), result = buildPoliticalAtlas(atlas, intel, 'sovereignty');
    assert.equal(result.territories.some(row => row.key.startsWith('bloc:')), false);
    const first = result.territories.find(row => row.key === 'a77');
    assert.equal(first.source, 'sovereignty'); assert.deepEqual(first.systemIds, [1]); assert.deepEqual(first.allianceIds, [77]);
    assert.equal(first.neighbours.find(row => row.key === 'a78').gateCount, 1);
    assert.equal(result.totalSovereignSystems, 4);
});

test('missing activity members make the whole aggregate unknown; explicit null never inherits zero defaults', () => {
    const { atlas, intel } = fixture();
    intel.systems[1].kills = { ship_kills: null, pod_kills: 0 }; intel.systems[1].jumps = null;
    const home = buildPoliticalAtlas(atlas, intel).territories.find(row => row.key === 'bloc:home');
    assert.deepEqual(home.activity, { shipKills: null, podKills: 1, jumps: null });
    intel.systems[1].kills = null;
    assert.equal(buildPoliticalAtlas(atlas, intel).territories.find(row => row.key === 'bloc:home').activity.podKills, null);
    delete intel.systems[1].kills; delete intel.systems[1].jumps;
    assert.deepEqual(buildPoliticalAtlas(atlas, intel).territories.find(row => row.key === 'bloc:home').activity, { shipKills: 3, podKills: 1, jumps: 10 });
    delete intel.defaults;
    assert.deepEqual(buildPoliticalAtlas(atlas, intel).territories.find(row => row.key === 'bloc:home').activity, { shipKills: null, podKills: null, jumps: null });
});

test('unavailable activity sources ignore leftover values; stale sources preserve cached totals with a stale flag', () => {
    const { atlas, intel } = fixture();
    intel.sources.kills = { status: 'error' }; intel.sources.jumps = { status: 'disabled' };
    assert.deepEqual(buildPoliticalAtlas(atlas, intel).territories.find(row => row.key === 'bloc:home').activity, { shipKills: null, podKills: null, jumps: null });
    intel.sources.kills = { status: 'stale' }; intel.sources.jumps = { status: 'ready', stale: true };
    const stale = buildPoliticalAtlas(atlas, intel);
    assert.equal(stale.stale, true); assert.deepEqual(stale.territories.find(row => row.key === 'bloc:home').activity, { shipKills: 5, podKills: 1, jumps: 15 });
    intel.sources.kills = { status: 'ready' }; intel.sources.jumps = { status: 'ready' }; intel.politics.status = 'stale';
    assert.equal(buildPoliticalAtlas(atlas, intel).stale, true); assert.equal(buildPoliticalAtlas(atlas, intel, 'sovereignty').stale, false);
});

test('unavailable ownership never converts cached or static rows into current territory, while stale ownership is explicit', () => {
    const { atlas, intel } = fixture();
    intel.sources.sovereignty.status = 'error';
    const unavailable = buildPoliticalAtlas(atlas, intel);
    assert.equal(unavailable.available, false); assert.equal(unavailable.totalSovereignSystems, 0); assert.equal(unavailable.unobservedSystemCount, 5);
    assert.ok(unavailable.territories.every(row => row.source === 'configured' && row.systemIds.length === 0));
    intel.sources.sovereignty = { status: 'stale' };
    const cached = buildPoliticalAtlas(atlas, intel);
    assert.equal(cached.available, true); assert.equal(cached.stale, true); assert.equal(cached.totalSovereignSystems, 4);
    assert.deepEqual(buildPoliticalAtlas(atlas, null), { territories: [], totalSovereignSystems: 0, unobservedSystemCount: 5, available: false, stale: false });
});

test('territory, neighbour and server palette colours agree and empire hues stay fixed', () => {
    const { atlas, intel } = fixture();
    intel.politics.territory_colours = Object.fromEntries(allocateTerritoryColours(territoryColourEntities(intel.systems.map(row => row.sovereignty).filter(Boolean), intel.politics.groups)));
    const result = buildPoliticalAtlas(atlas, intel), faction = result.territories.find(row => row.key === 'f500001');
    assert.equal(faction.color, '#4f88c6'); assert.equal(faction.outline, '#9cbbdd');
    for (const row of result.territories) {
        assert.equal(row.color, intel.politics.territory_colours[row.key].fill);
        for (const neighbour of row.neighbours) assert.equal(neighbour.color, result.territories.find(other => other.key === neighbour.key).color);
    }
});

test('view filters, selected regions, standings and camera state never change the full atlas or mutate inputs', () => {
    const { atlas, intel } = fixture(), before = structuredClone({ atlas, intel }), first = buildPoliticalAtlas(atlas, intel);
    assert.deepEqual({ atlas, intel }, before);
    intel.view = { standingFilter: 'friendly', focusedRegionId: 10, zoom: 20 }; intel.systems[2].standing = { label: 'terrible', value: -10 };
    atlas.systems.reverse(); atlas.gates.reverse(); intel.systems.reverse();
    assert.deepEqual(buildPoliticalAtlas(atlas, intel), first);
});

test('mismatched membership cannot move an owner into a different alliance group and each owner key stays separate', () => {
    const { atlas, intel } = fixture();
    intel.systems[2].power_bloc = member(77); // Owner 79 does not match this claimed assignment.
    intel.systems.push({ system_id: 5, sovereignty: { corporation_id: 900, corporation_name: 'Corporation only' } });
    const result = buildPoliticalAtlas(atlas, intel);
    assert.deepEqual(result.territories.find(row => row.key === 'bloc:home').systemIds, [1, 2]);
    assert.equal(result.territories.find(row => row.key === 'a79').source, 'unassigned');
    assert.deepEqual(result.territories.find(row => row.key === 'c900').allianceIds, []);
});
