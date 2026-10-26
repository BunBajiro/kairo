import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPortalNetworks} from '../../components/kairo/universe-map-portals.mjs';
import {usablePublicConnections} from '../../components/kairo/universe-map-operations.mjs';

const NOW = Date.parse('2026-09-25T17:00:00Z');
const at = delta => new Date(NOW + delta).toISOString();
const THERA = {system_id: 31000005, name: 'Thera', space: 'wormhole'};
const TURNUR = {system_id: 30002086, name: 'Turnur', space: 'known', map_x: 20, map_y: 30};
const ALPHA = {system_id: 30000001, name: 'Alpha', space: 'known', map_x: 10, map_y: 20};
const BRAVO = {system_id: 31000010, name: 'J123456', space: 'wormhole'};
const systems = [THERA, TURNUR, ALPHA, BRAVO];
const report = (patch = {}) => ({id: 'thera:42', source: 'thera', from_system_id: THERA.system_id, to_system_id: ALPHA.system_id,
  from_signature: 'AAA-111', to_signature: 'BBB-222', completed: true, reported: true, stale: false,
  observed_at: at(-60000), expires_at: at(3600000), wh_type: 'N110', max_ship_size: 'large',
  remaining_mass_kg: null, comment: 'Reported entrance', ...patch});
const source = (patch = {}) => ({status: 'ready', updated_at: at(-30000), expires_at: at(270000), attribution: 'EVE-Scout / Signal Cartel', ...patch});
const feeds = (connections, sources = {}) => ({connections, sources: {thera: source(), turnur: source(), ...sources}});

test('networks use actual hubs and retain K-space entrances without assigning a Thera position', () => {
  const first = report();
  const second = report({id: 'turnur:9', source: 'turnur', from_system_id: TURNUR.system_id, to_system_id: BRAVO.system_id});
  const result = buildPortalNetworks(feeds([second, first]), systems, NOW);
  assert.deepEqual(result.map(network => network.source), ['thera', 'turnur']);
  assert.equal(result[0].hub, THERA); assert.equal(result[1].hub, TURNUR);
  assert.equal(result[0].hub.map_x, undefined);
  assert.equal(result[0].endpoints[0].system, ALPHA);
  assert.equal(result[0].endpoints[0].space, 'known');
  assert.equal(result[1].endpoints[0].space, 'wormhole');
  assert.equal(result[0].ageMs, 30000);
  assert.equal(result[0].endpoints[0].ageMs, 60000);
  assert.equal(result[0].endpoints[0].remainingMs, 3600000);
  assert.equal(result[0].endpoints[0].report, first);
  assert.equal(result[0].endpoints[0].report.remaining_mass_kg, null);
  assert.equal(result[0].usableCount, 1);
});

test('both hub orientations preserve each endpoint signature and the original report', () => {
  const reverse = report({from_system_id: ALPHA.system_id, to_system_id: THERA.system_id, from_signature: 'OUT-321', to_signature: 'HUB-456'});
  const endpoint = buildPortalNetworks(feeds([reverse]), new Map(systems.map(system => [system.system_id, system])), NOW)[0].endpoints[0];
  assert.equal(endpoint.systemId, ALPHA.system_id);
  assert.equal(endpoint.hubSignature, 'HUB-456'); assert.equal(endpoint.signature, 'OUT-321');
  assert.equal(endpoint.report, reverse); assert.equal(endpoint.routingEligible, true);
});

test('stale source and row reports remain inspectable but cannot advertise current public routing', () => {
  for (const [sources, patch] of [
    [{thera: source({status: 'stale'})}, {}],
    [{thera: source({expires_at: at(0)})}, {}],
    [{thera: source({expires_at: 'bad date'})}, {}],
    [{thera: source({status: 'unavailable'})}, {}],
    [{}, {stale: true}],
  ]) {
    const input = feeds([report(patch)], sources), [network] = buildPortalNetworks(input, systems, NOW);
    assert.equal(network.endpoints.length, 1);
    assert.equal(network.endpoints[0].state, 'stale');
    assert.equal(network.endpoints[0].routingEligible, false); assert.equal(network.staleCount, 1);
    assert.match(network.endpoints[0].reasons.join(' '), /stale or unavailable/);
    assert.equal(usablePublicConnections(input, NOW).length, 0);
  }
  const [missing] = buildPortalNetworks({connections: [report()]}, systems, NOW);
  assert.equal(missing.status, 'waiting'); assert.equal(missing.endpoints[0].routingEligible, false);
});

test('incomplete and unreported connections remain distinct from fresh candidates', () => {
  const rows = [report(), report({id: 'incomplete', completed: false}), report({id: 'unreported', reported: false}), report({id: 'excluded', route_eligible: false})];
  const [network] = buildPortalNetworks(feeds(rows), systems, NOW);
  const states = new Map(network.endpoints.map(endpoint => [endpoint.reportId, endpoint.state]));
  assert.equal(states.get('thera:42'), 'usable');
  assert.equal(states.get('incomplete'), 'incomplete');
  assert.equal(states.get('unreported'), 'not_eligible');
  assert.equal(states.get('excluded'), 'not_eligible');
  assert.equal(network.usableCount, 1);
  assert.equal(network.endpoints.find(row => row.usable).report.max_ship_size, 'large');
});

test('expired, malformed, unknown and false-hub connections are hidden without fake coordinates', () => {
  const invalid = [
    report({expires_at: at(0)}), report({expires_at: at(-1)}), report({expires_at: 'invalid'}),
    report({id: ''}), report({id: NaN}), report({id: null}),
    report({to_system_id: 99999}), report({from_system_id: '31000005'}),
    report({from_system_id: ALPHA.system_id, to_system_id: BRAVO.system_id}),
    report({to_system_id: THERA.system_id}), report({source: 'custom'}), null,
  ];
  assert.deepEqual(buildPortalNetworks(feeds(invalid), systems, NOW).flatMap(row => row.endpoints), []);
  const missingHub = buildPortalNetworks(feeds([report()]), [ALPHA], NOW)[0];
  assert.equal(missingHub.hub, null); assert.deepEqual(missingHub.endpoints, []);
  assert.deepEqual(buildPortalNetworks(null, null, NOW).map(row => [row.status, row.endpoints.length]), [['waiting', 0], ['waiting', 0]]);
});

test('duplicate IDs resolve versions deterministically without conflating reciprocal report metadata', () => {
  const older = report({comment: 'Old report', observed_at: at(-120000)});
  const current = report({comment: 'Updated report'});
  const reversed = report({from_system_id: ALPHA.system_id, to_system_id: THERA.system_id, from_signature: 'CCC-333', to_signature: 'DDD-444', comment: 'Reverse record'});
  const independent = report({id: 'thera:43', comment: 'A separate hole in the same system'});
  const rows = [older, current, {...current}, reversed, independent];
  const a = buildPortalNetworks(feeds(rows), systems, NOW)[0].endpoints;
  const b = buildPortalNetworks(feeds([...rows].reverse()), [...systems].reverse(), NOW)[0].endpoints;
  assert.deepEqual(a, b); assert.equal(a.length, 3); assert.equal(new Set(a.map(row => row.id)).size, 3);
  assert.deepEqual(a.map(row => row.report.comment).sort(), ['A separate hole in the same system', 'Reverse record', 'Updated report']);
  assert.equal(a.find(row => row.report.comment === 'Reverse record').signature, 'CCC-333');
  const later = buildPortalNetworks(feeds([report({comment: 'New observations', observed_at: at(-1000), expires_at: at(6000000)})]), systems, NOW)[0].endpoints[0];
  assert.equal(later.id, a.find(row => row.report.comment === 'Updated report').id);
});

test('time refresh changes state and expiry without moving or mutating report identities', () => {
  const input = feeds([report()]); const before = structuredClone(input);
  const fresh = buildPortalNetworks(input, systems, NOW)[0].endpoints[0];
  const stale = buildPortalNetworks(input, systems, NOW + 300000)[0].endpoints[0];
  assert.equal(fresh.id, stale.id); assert.equal(fresh.state, 'usable'); assert.equal(stale.state, 'stale');
  assert.equal(stale.remainingMs, 3300000);
  assert.equal(buildPortalNetworks(input, systems, NOW + 3600000)[0].endpoints.length, 0);
  assert.deepEqual(input, before);
});
