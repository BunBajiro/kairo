import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {workspaceRoutes, workspaceGroups, resolveWorkspaceRoute, universeRouteForSpace, universeTabForSpace, workspaceHistoryBootstrap} from '../../components/kairo/workspace-navigation.mjs';

test('Universe has Atlas, Maps and its settings while Sessions remains independent', () => {
  assert.deepEqual(workspaceRoutes.filter(route => route.group === 'UNIVERSE').map(({id, name}) => ({id, name})), [
    {id: 'universe-kspace', name: 'Atlas'},
    {id: 'universe-jspace', name: 'Maps'},
    {id: 'universe-settings', name: 'Universe settings'},
  ]);
  assert.equal(workspaceRoutes.find(route => route.id === 'sessions').group, 'OPERATIONS');
  assert.equal(workspaceRoutes.some(route => route.id === 'universe'), false);
  assert.ok(workspaceGroups.includes('UNIVERSE'));
});

test('legacy Universe and Journey links open Atlas without exposing the retired page', () => {
  assert.deepEqual(resolveWorkspaceRoute('universe'), {id: 'universe-kspace', universeTab: null});
  assert.deepEqual(resolveWorkspaceRoute('journey'), {id: 'universe-kspace', universeTab: null});
  assert.deepEqual(resolveWorkspaceRoute('universe-jspace'), {id: 'universe-jspace', universeTab: null});
  assert.equal(universeRouteForSpace('wormhole'), 'universe-jspace');
  assert.equal(universeRouteForSpace('known'), 'universe-kspace');
});

test('workspace routing preserves extension destinations and bounds unknown links', () => {
  assert.deepEqual(resolveWorkspaceRoute('module:my-tool'), {id: 'module:my-tool', universeTab: null});
  for (const route of [undefined, null, '', 'module:', 'unknown-page']) assert.equal(resolveWorkspaceRoute(route).id, 'overview');
  for (const route of workspaceRoutes) assert.equal(resolveWorkspaceRoute(route.id).id, route.id);
});

test('saved retired tabs never restore hidden pages in either map workspace', () => {
  for (const savedTab of ['atlas', 'journey', 'connections']) {
    assert.equal(universeTabForSpace('wormhole', savedTab), 'atlas');
    assert.equal(universeTabForSpace('known', savedTab), 'atlas');
  }
  const journeyIntent = resolveWorkspaceRoute('journey').universeTab;
  assert.equal(universeTabForSpace('known', journeyIntent), 'atlas');
  assert.equal(universeTabForSpace('wormhole', journeyIntent), 'atlas');
  for (const savedTab of [undefined, null, '', 'removed-tool', {}, ['journey']]) {
    assert.equal(universeTabForSpace('wormhole', savedTab), 'atlas');
    assert.equal(universeTabForSpace('known', savedTab), 'atlas');
  }
});


test('early history bootstrap claims only workspace traversal and supports auth cleanup', () => {
  for (const search of ['', '?profile=local', '?auth=connected']) {
    const listeners = [], routed = [];
    const window = {location:{pathname:'/',search,hash:'#universe-kspace'},addEventListener:(type,listener,capture)=>listeners.push({type,listener,capture}),dispatchEvent:event=>routed.push(event.type)};
    const context = {window,URLSearchParams,Event};
    runInNewContext(workspaceHistoryBootstrap(),context);
    runInNewContext(workspaceHistoryBootstrap(),context);
    assert.equal(listeners.length,1,'Hydration cannot install a second guard');
    assert.equal(listeners[0].type,'popstate');assert.equal(listeners[0].capture,true);
    if (search.startsWith('?auth=')) window.location.search='';
    let stopped=0;const event={stopImmediatePropagation:()=>stopped++};
    const routeHashes = ['', ...workspaceRoutes.map(route => '#' + route.id), '#universe', '#journey', '#module:custom-tool'];
    for (const hash of routeHashes) {
      window.location.hash=hash;listeners[0].listener(event);
    }
    assert.equal(stopped,routeHashes.length);assert.deepEqual(routed,Array(routeHashes.length).fill('kairo:workspace-traverse'));
    for (const hash of ['#unknown-anchor','#module:','#']) {window.location.hash=hash;listeners[0].listener(event);}
    window.location.hash='#universe-kspace';window.location.pathname='/different';listeners[0].listener(event);
    window.location.pathname='/';window.location.search='?different=1';listeners[0].listener(event);
    assert.equal(stopped,routeHashes.length,'Other documents, queries and anchors remain outside Kairo routing');
  }
});
