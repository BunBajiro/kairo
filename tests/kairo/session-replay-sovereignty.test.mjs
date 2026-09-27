import test from 'node:test';
import assert from 'node:assert/strict';
import {replaySovereigntyIntel, replaySovereigntyCaption, historicalSovereigntyLabel} from '../../components/kairo/session-replay-sovereignty.mjs';

test('replay ownership backdrop preserves owner colours without admitting live operational context', () => {
    const live = {character_id: 42, location: {system_id: 1}, systems: [
        {system_id: 1, sovereignty: {alliance_id: 77, alliance_name: 'Present owner'}, power_bloc: {name: 'Live bloc'}, kills: {ship_kills: 20}, note: 'private'},
        {system_id: 2, sovereignty: null, visits: 30},
    ], sources: {sovereignty: {status: 'ready', updatedAt: '2026-09-27T04:00:00Z'}, kills: {status: 'ready'}},
    politics: {territory_colours: {a77: {fill: '#aabbcc'}}, groups: [{name: 'Bloc'}]},
    links: [{id: 'live-wormhole'}], pins: [{system_id: 2}], operations: {intel: ['live intel']}, feeds: {thera: ['current report']},
    journey: {visits: [1], connections: [1], systems: [1]}};
    const before = JSON.stringify(live), backdrop = replaySovereigntyIntel(live);
    assert.deepEqual(backdrop.systems, [{system_id: 1, sovereignty: live.systems[0].sovereignty}]);
    assert.deepEqual(backdrop.politics, {territory_colours: live.politics.territory_colours});
    for (const key of ['location','operations','feeds']) assert.equal(backdrop[key], undefined);
    for (const key of ['links','link_lists','pins','views','structures']) assert.deepEqual(backdrop[key], []);
    assert.deepEqual(backdrop.journey, {visits: [], connections: [], systems: []});
    assert.deepEqual(Object.keys(backdrop.sources), ['sovereignty']);
    assert.equal(replaySovereigntyCaption(backdrop), 'Current sovereignty · cached 2026-09-27 04:00 EVE');
    assert.equal(JSON.stringify(live), before);
});

test('replay labels missing or stale sovereignty without inventing historical ownership', () => {
    assert.equal(replaySovereigntyIntel(null), null);
    assert.match(replaySovereigntyCaption(null), /unavailable/);
    const backdrop = replaySovereigntyIntel({character_id: 42, systems: [{system_id: 1, sovereignty: {faction_id: 500001}}], sources: {sovereignty: {status: 'stale', updatedAt: '2026-09-26T12:00:00Z'}}});
    assert.equal(backdrop.politics, undefined, 'A missing saved palette allows the normal owner colour allocator');
    assert.match(replaySovereigntyCaption(backdrop), /2026-09-26 12:00 EVE · stale$/);
});

test('the replay location owner label uses only the captured visit, with an explicit legacy gap', () => {
    assert.equal(historicalSovereigntyLabel(null).label, 'At visit: not recorded');
    const recorded = {owner_type:'alliance',owner_id:77,owner_name:'Former owner',observed_at:'2026-09-20T04:00:00Z',recorded_at:'2026-09-20T04:05:00Z',source:'esi'};
    assert.equal(historicalSovereigntyLabel(recorded).label, 'At visit: Former owner');
    assert.match(historicalSovereigntyLabel(recorded).title, /2026-09-20T04:00:00Z/);
    assert.equal(historicalSovereigntyLabel({...recorded,owner_name:null}).label, 'At visit: Alliance 77');
});
