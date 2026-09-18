import test from 'node:test';
import assert from 'node:assert/strict';
import { LY_METRES, ANSIBLEX_RULES, distanceLy, ansiblexZone, buildTravelGraph, planRoute, planJumpRoute } from '../../server/universe-routing.mjs';

const system = (id, x = 0, y = 0, z = 0, more = {}) => ({ system_id: id, name: `System ${id}`, x: x * LY_METRES, y: y * LY_METRES, z: z * LY_METRES, security: 0.8, standing: 0, space: 'known', ...more });
const gate = (from, to) => ({ from_system_id: from, to_system_id: to });
const now = Date.parse('2026-09-18T19:00:00Z');
const wormhole = (more = {}) => ({ id: 'hole', kind: 'wormhole', ...gate(1, 4), enabled: true, accessible: true, expires_at: '2026-09-18T20:00:00Z', ...more });

test('shortest routing chooses exact mixed edges and does not use journey or visual coordinates', () => {
    const systems = [1, 2, 3, 4].map(id => system(id, 0, 0, 0, { map_x: 0, map_y: 0 }));
    const input = { systems, gates: [gate(1, 2), gate(2, 3), gate(3, 4)], connections: [wormhole()], originId: 1, destinationId: 4, now };
    assert.deepEqual(planRoute(input).systemIds, [1, 2, 3, 4]);
    const result = planRoute({ ...input, preferences: { useWormholes: true } });
    assert.equal(result.hops, 1);
    assert.equal(result.edges[0].kind, 'wormhole');
    assert.equal(result.edges[0].id, 'hole');
    assert.deepEqual([result.edges[0].from_system_id, result.edges[0].to_system_id], [1, 4]);
    assert.deepEqual(planRoute({ ...input, preferences: { mapLayers: [], hiddenSystems: [2, 3] } }).systemIds, [1, 2, 3, 4]);
});

test('wormhole expiry and access are enforced at request time, including missing expiry', () => {
    const input = { systems: [system(1), system(4)], gates: [], originId: 1, destinationId: 4, now, preferences: { useWormholes: true } };
    for (const bad of [{ expires_at: '2026-09-18T19:00:00Z' }, { expires_at: 'yesterday' }, { expires_at: undefined }, { enabled: false }, { accessible: false }, { accessible: undefined }]) {
        const result = planRoute({ ...input, connections: [wormhole(bad)] });
        assert.equal(result.status, 'no_route', JSON.stringify(bad));
        assert.ok(result.excluded.length > 0);
    }
    assert.equal(planRoute({ ...input, connections: [wormhole()] }).status, 'ok');
    assert.equal(planRoute({ ...input, connections: [wormhole()], now: now + 3_600_000 }).status, 'no_route');
});

test('gate reciprocity, disconnected nodes and directed manual connections remain distinct', () => {
    const systems = [1, 2, 3, 4].map(id => system(id));
    const input = { systems, gates: [gate(1, 2)], connections: [wormhole({ directional: true })], preferences: { useWormholes: true }, now };
    assert.deepEqual(planRoute({ ...input, originId: 2, destinationId: 1 }).systemIds, [2, 1]);
    assert.equal(planRoute({ ...input, originId: 1, destinationId: 4 }).status, 'ok');
    assert.equal(planRoute({ ...input, originId: 4, destinationId: 1 }).status, 'no_route');
    assert.equal(planRoute({ ...input, originId: 1, destinationId: 3 }).status, 'no_route');
    assert.equal(planRoute({ ...input, originId: 1, destinationId: 99 }).status, 'invalid');
    assert.deepEqual(planRoute({ ...input, originId: 1, destinationId: 1 }).systemIds, [1]);
});

test('safer routing uses the selected pilot standings and recorded activity independently of overlays', () => {
    const systems = [1, 2, 3, 4, 5].map(id => system(id));
    const gates = [gate(1, 2), gate(2, 5), gate(1, 3), gate(3, 4), gate(4, 5)];
    const input = { systems, gates, originId: 1, destinationId: 5 };
    assert.deepEqual(planRoute(input).systemIds, [1, 2, 5]);
    assert.deepEqual(planRoute({ ...input, preferences: { mode: 'safer', standings: { 2: -5 } } }).systemIds, [1, 3, 4, 5]);
    assert.deepEqual(planRoute({ ...input, preferences: { mode: 'safer', standings: { 2: 10 } } }).systemIds, [1, 2, 5]);
    assert.deepEqual(planRoute({ ...input, preferences: { mode: 'safer', activity: { 2: { ship_kills: 100, pod_kills: 80 } } } }).systemIds, [1, 3, 4, 5]);
    assert.deepEqual(planRoute({ ...input, preferences: { avoidHostile: true, standings: { 2: -5 } } }).systemIds, [1, 3, 4, 5]);
    assert.equal(planRoute({ ...input, preferences: { avoidSystemIds: [5] } }).status, 'invalid');
});

test('safer routing favours highsec without labelling zero data as safe', () => {
    const systems = [system(1), system(2, 0, 0, 0, { security: -0.8 }), system(3), system(4), system(5)];
    const gates = [gate(1, 2), gate(2, 5), gate(1, 3), gate(3, 4), gate(4, 5)];
    const result = planRoute({ systems, gates, originId: 1, destinationId: 5, preferences: { mode: 'safer' } });
    assert.deepEqual(result.systemIds, [1, 3, 4, 5]);
    assert.ok(result.warnings.some(w => w.includes('do not guarantee safe')));
});

test('safer routing prefers a friendly nullsec detour over neutral nullsec', () => {
    const systems = [1, 2, 3, 4, 5].map(id => system(id, 0, 0, 0, { security: -0.5 }));
    const gates = [gate(1, 2), gate(2, 5), gate(1, 3), gate(3, 4), gate(4, 5)];
    const input = { systems, gates, originId: 1, destinationId: 5, preferences: { mode: 'safer', standings: { 3: 5, 4: 10, 5: 10 } } };
    assert.deepEqual(planRoute(input).systemIds, [1, 3, 4, 5]);
    assert.deepEqual(planRoute({ ...input, preferences: { ...input.preferences, standings: { 2: 5, 3: 5, 4: 10, 5: 10 } } }).systemIds, [1, 2, 5]);
});

test('announced Ansiblex zones use physical destination distance from the owner capital per direction', () => {
    const systems = [system(1, 4), system(2, 8), system(3, 0)];
    const connection = { id: 'ansi', kind: 'ansiblex', ...gate(1, 2), enabled: true, accessible: true, capital_system_id: 3, owner_alliance_id: 100 };
    const input = { systems, connections: [connection], preferences: { useAnsiblex: true, maxAnsiblexZone: 1 }, now };
    assert.equal(planRoute({ ...input, originId: 1, destinationId: 2 }).status, 'no_route');
    const inbound = planRoute({ ...input, originId: 2, destinationId: 1 });
    assert.equal(inbound.status, 'ok');
    assert.equal(inbound.edges[0].zone, 1);
    assert.equal(inbound.edges[0].capital_distance_ly, 4);
    const outbound = planRoute({ ...input, originId: 1, destinationId: 2, preferences: { useAnsiblex: true, ansiblexZones: [2] } });
    assert.equal(outbound.edges[0].zone, 2);
    assert.equal(planRoute({ ...input, originId: 2, destinationId: 1, preferences: { useAnsiblex: true, ansiblexZones: [2] } }).status, 'no_route');
    assert.equal(ANSIBLEX_RULES.status, 'announced');
    assert.equal(ANSIBLEX_RULES.announcedEffectiveDate, '2026-09-22');
});

test('zone boundaries are continuous and missing capital cannot bypass zone restrictions', () => {
    assert.deepEqual([0, 5, 5.01, 10, 10.01, 15, 15.01, 20, 20.01].map(ansiblexZone), [1, 1, 2, 2, 3, 3, 4, 4, 5]);
    assert.equal(ansiblexZone(null), null);
    assert.equal(ansiblexZone(-1), null);
    const input = { systems: [system(1), system(2)], connections: [{ kind: 'ansiblex', ...gate(1, 2), enabled: true, accessible: true }], originId: 1, destinationId: 2 };
    assert.equal(planRoute({ ...input, preferences: { useAnsiblex: true, maxAnsiblexZone: 2 } }).status, 'no_route');
    const unrestricted = planRoute({ ...input, preferences: { useAnsiblex: true } });
    assert.equal(unrestricted.status, 'ok');
    assert.equal(unrestricted.edges[0].zone, null);
    assert.ok(unrestricted.warnings.some(w => w.includes('zones are unknown')));
});

test('announced access model does not confuse positive standings with owning-alliance membership', () => {
    const systems = [system(1), system(2, 4), system(3, 0)];
    const connections = [{ kind: 'ansiblex', ...gate(1, 2), enabled: true, accessible: true, owner_alliance_id: 100, capital_system_id: 3, reverse_owner_alliance_id: 200 }];
    const input = { systems, connections, originId: 1, destinationId: 2 };
    const prefs = { useAnsiblex: true, ansiblexRules: 'announced', pilotAllianceId: 100 };
    assert.equal(planRoute({ ...input, preferences: prefs }).status, 'ok');
    assert.equal(planRoute({ ...input, originId: 2, destinationId: 1, preferences: prefs }).status, 'no_route');
    assert.equal(planRoute({ ...input, preferences: { ...prefs, pilotAllianceId: 200, standings: { 1: 10, 2: 10 } } }).status, 'no_route');
    assert.equal(planRoute({ ...input, preferences: { ...prefs, shipClass: 'capital' } }).status, 'no_route');
    assert.equal(planRoute({ ...input, preferences: { ...prefs, ansiblexRules: 'current', pilotAllianceId: 200 } }).status, 'ok');
});

test('a differently owned reverse gate cannot inherit the forward owner capital', () => {
    const systems = [system(1), system(2, 4), system(3, 0), system(4, 15)];
    const connection = { kind: 'ansiblex', ...gate(1, 2), enabled: true, accessible: true, owner_alliance_id: 100, capital_system_id: 3, reverse_owner_alliance_id: 200 };
    const input = { systems, connections: [connection], originId: 2, destinationId: 1, preferences: { useAnsiblex: true, maxAnsiblexZone: 2 } };
    assert.equal(planRoute(input).status, 'no_route');
    const unrestricted = planRoute({ ...input, preferences: { useAnsiblex: true } });
    assert.equal(unrestricted.edges[0].zone, null);
    const known = planRoute({ ...input, connections: [{ ...connection, reverse_capital_system_id: 4 }], preferences: { useAnsiblex: true } });
    assert.equal(known.edges[0].zone, 3);
    assert.equal(known.edges[0].owner_alliance_id, 200);
});

test('graph returns the selected exact connection when a parallel gate also exists', () => {
    const graph = buildTravelGraph({ systems: [system(1), system(4)], gates: [gate(1, 4)], connections: [wormhole()], preferences: { useWormholes: true }, now });
    assert.equal(graph.adjacency.get(1).length, 2);
    const result = planRoute({ systems: [system(1), system(4)], gates: [gate(1, 4)], connections: [wormhole()], preferences: { useWormholes: true }, now, originId: 1, destinationId: 4 });
    assert.equal(result.edges[0].kind, 'gate');
});

test('jump projection includes physical Y even when two systems coincide on the 2D map', () => {
    const systems = [system(1, 0, 0, 0, { security: -0.5, map_x: 0, map_y: 0 }), system(2, 0, 10, 0, { security: -0.5, map_x: 0, map_y: 0 })];
    assert.equal(distanceLy(systems[0], systems[1]), 10);
    assert.equal(planJumpRoute({ systems, originId: 1, destinationId: 2, rangeLy: 5 }).status, 'no_route');
    assert.equal(planJumpRoute({ systems, originId: 1, destinationId: 2, rangeLy: 10 }).status, 'ok');
    assert.equal(distanceLy({ x: 0, y: null, z: 0 }, systems[0]), null);
});

test('jump boundary uses the exact EVE light-year rather than the larger scientific light-year', () => {
    assert.equal(LY_METRES, 9_460_000_000_000_000);
    const systems = [system(1, 0, 0, 0, { security: 0 }), system(2, 0, 0, 0, { x: 5 * 9_460_730_472_580_800, security: 0 })];
    assert.equal(planJumpRoute({ systems, originId: 1, destinationId: 2, rangeLy: 5 }).status, 'no_route');
});

test('jump projection finds intermediate cyno systems and preserves each leg distance', () => {
    const systems = [system(1, 0, 0, 0, { security: -0.1 }), system(2, 3, 4, 0, { security: 0.2 }), system(3, 6, 8, 0, { security: -0.5 })];
    const result = planJumpRoute({ systems, originId: 1, destinationId: 3, rangeLy: 5 });
    assert.deepEqual(result.systemIds, [1, 2, 3]);
    assert.deepEqual(result.edges.map(e => e.distance_ly), [5, 5]);
    assert.equal(result.totalDistanceLy, 10);
    assert.equal(result.directDistanceLy, 10);
    assert.equal(planJumpRoute({ systems, originId: 1, destinationId: 3, rangeLy: 4.99 }).status, 'no_route');
});

test('jump destinations exclude highsec and special space while allowing a highsec origin', () => {
    const start = system(1), end = system(3, 8, 0, 0, { security: -0.5 });
    for (const special of [{ security: 0.45 }, { space: 'wormhole' }, { region_id: 10000070 }, { region_id: 10000004 }, { region_id: 10001000 }, { jump_eligible: false }, { cyno_allowed: false }]) {
        const middle = system(2, 4, 0, 0, { security: -0.5, ...special });
        assert.equal(planJumpRoute({ systems: [start, middle, end], originId: 1, destinationId: 3, rangeLy: 5 }).status, 'no_route', JSON.stringify(special));
        assert.equal(planJumpRoute({ systems: [start, middle], originId: 1, destinationId: 2, rangeLy: 5 }).status, 'invalid');
    }
    const result = planJumpRoute({ systems: [start, system(2, 4, 0, 0, { security: 0.449 })], originId: 1, destinationId: 2, rangeLy: 5 });
    assert.equal(result.status, 'ok');
    assert.ok(result.warnings.some(w => w.includes('Fuel, fatigue')));
    assert.equal(planJumpRoute({ systems: [start, end], originId: 1, destinationId: 3, rangeLy: 0 }).status, 'invalid');
});
