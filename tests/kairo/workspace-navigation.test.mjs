import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceRoutes, workspaceGroups, resolveWorkspaceRoute, universeRouteForSpace} from '../../components/kairo/workspace-navigation.mjs';

test('Universe has separate atlas destinations while Sessions remains independent', () => {
  assert.deepEqual(workspaceRoutes.filter(route => route.group === 'UNIVERSE').map(({id, name}) => ({id, name})), [
    {id: 'universe-kspace', name: 'K-Space'},
    {id: 'universe-jspace', name: 'J-Space'},
  ]);
  assert.equal(workspaceRoutes.find(route => route.id === 'sessions').group, 'OPERATIONS');
  assert.equal(workspaceRoutes.some(route => route.id === 'universe'), false);
  assert.ok(workspaceGroups.includes('UNIVERSE'));
});

test('legacy Universe and Journey links resolve without discarding Journey intent', () => {
  assert.deepEqual(resolveWorkspaceRoute('universe'), {id: 'universe-kspace', universeTab: null});
  assert.deepEqual(resolveWorkspaceRoute('journey'), {id: 'universe-kspace', universeTab: 'journey'});
  assert.deepEqual(resolveWorkspaceRoute('universe-jspace'), {id: 'universe-jspace', universeTab: null});
  assert.equal(universeRouteForSpace('wormhole'), 'universe-jspace');
  assert.equal(universeRouteForSpace('known'), 'universe-kspace');
});

test('workspace routing preserves extension destinations and bounds unknown links', () => {
  assert.deepEqual(resolveWorkspaceRoute('module:my-tool'), {id: 'module:my-tool', universeTab: null});
  for (const route of [undefined, null, '', 'module:', 'unknown-page']) assert.equal(resolveWorkspaceRoute(route).id, 'overview');
  for (const route of workspaceRoutes) assert.equal(resolveWorkspaceRoute(route.id).id, route.id);
});
