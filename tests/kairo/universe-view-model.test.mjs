import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_UNIVERSE_VIEW, restoreUniverseView, restoreUniverseWorkspace} from '../../components/kairo/universe-view-model.mjs';

const oldView = {background:'security',indicator:'visits',space:'known',region:'10000002',standingFilter:'friendly',showConnections:false,showSpecialLinks:false};

test('legacy footprint workspaces retain selected context and supported choices as a custom view', () => {
 const saved = {tab:'journey',view:oldView,preset:'journey',selected:30000142,inspector:'route',inspectorOpen:true,routeDraft:{from:'Jita',to:'Amarr'},navigationTool:'jump'};
 const before = structuredClone(saved), restored = restoreUniverseWorkspace(saved, 'known');
 assert.deepEqual(restored, {...saved,tab:'atlas',view:{...oldView,indicator:'none'},preset:'custom'});
 assert.deepEqual(saved, before, 'Restoring one workspace does not mutate another pilot’s saved object');
 assert.deepEqual(restoreUniverseWorkspace(restored, 'known'), restored, 'Repeated restore is stable');
});

test('named saved views use the same retired-indicator migration without losing their identity', () => {
 const config = {...oldView,background:'standings',toolbox:'intel'};
 assert.deepEqual(restoreUniverseView(config), {...oldView,background:'standings',indicator:'none'});
 const workspace = restoreUniverseWorkspace({view:config,preset:'saved-view-123',selected:30000142}, 'known');
 assert.equal(workspace.preset, 'saved-view-123');
 assert.equal(workspace.selected, 30000142);
 assert.equal(workspace.view.background, 'standings');
 assert.equal(config.toolbox, 'intel', 'The caller still restores the named view’s independent toolbox');
 assert.equal(config.indicator, 'visits');
});

test('space, malformed state and supported indicators retain established restoration boundaries', () => {
 for (const saved of [null, undefined, false, 'bad state', []]) assert.deepEqual(restoreUniverseWorkspace(saved, 'known').view, DEFAULT_UNIVERSE_VIEW);
 const wormhole = restoreUniverseWorkspace({tab:'journey',view:oldView,preset:'journey',selected:30000142,inspectorOpen:true}, 'wormhole');
 assert.equal(wormhole.tab, 'atlas'); assert.equal(wormhole.preset, 'custom');
 assert.equal(wormhole.view.space, 'wormhole'); assert.equal(wormhole.view.region, 'all');
 assert.equal(wormhole.selected, null); assert.equal(wormhole.inspectorOpen, false);
 assert.equal(restoreUniverseWorkspace(null, 'wormhole').preset, 'exploration');
 for (const indicator of ['none','ship_kills','pod_kills','npc_kills','npc_delta','adm','jumps','mining','industry','fw','incursions']) assert.equal(restoreUniverseView({...oldView,indicator}).indicator, indicator);
 assert.equal(restoreUniverseView({...oldView,indicator:'future-unknown'}).indicator, 'none');
 assert.equal(restoreUniverseView({...oldView,region:'bad'}).region, 'all');
});
