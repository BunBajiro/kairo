import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSovereignty,sovereigntyStructures} from '../../server/universe-sovereignty.mjs';

test('current ESI claims preserve ownership, development, capital and authoritative hub windows',()=>{
 const claim={alliance:{alliance_id:99,corporation_id:98,is_capital_system:true,claimed_since:'2026-01-01T00:00:00Z',
  development:{activity_defense_multiplier:4.6,industrial_level:4,military_level:5,strategic_level:3},
  sovereignty_hub:{id:1040000000001,vulnerability_window:{start:'2026-09-25T18:00:00Z',end:'2026-09-25T20:00:00Z'}}}};
 const result=normalizeSovereignty({solar_systems:[{solar_system_id:30000001,claim},{solar_system_id:30000002,claim:{faction:{faction_id:500001}}},{solar_system_id:30000003,claim:{unclaimed:true}}]});
 assert.equal(result[0].system_id,30000001);assert.equal(result[0].alliance_id,99);assert.deepEqual(result[0].claim,claim);
 assert.equal(result[0].development.activity_defense_multiplier,4.6);assert.equal(result[1].faction_id,500001);assert.equal(result[2].alliance_id,undefined);
 const hubs=sovereigntyStructures(result);assert.equal(hubs.length,1);assert.equal(hubs[0].structure_id,1040000000001);assert.equal(hubs[0].is_capital_system,true);
 assert.equal(hubs[0].vulnerability_end_time,'2026-09-25T20:00:00Z');assert.equal(hubs[0].vulnerability_status,'window');assert.equal(hubs[0].structure_type_id,undefined);
});

test('legacy snapshots remain readable, empty replacement clears claims and malformed data is rejected',()=>{
 assert.deepEqual(normalizeSovereignty([{system_id:30000001,alliance_id:99}]).map(row=>[row.system_id,row.alliance_id]),[[30000001,99]]);
 assert.deepEqual(normalizeSovereignty({solar_systems:[]}),[]);assert.deepEqual(sovereigntyStructures([]),[]);
 assert.throws(()=>normalizeSovereignty({}),/invalid sovereignty/);
 const rows=normalizeSovereignty({solar_systems:[{solar_system_id:30000001,claim:{alliance:{alliance_id:99,sovereignty_hub:{id:1040000000001}}}}]});
 assert.equal(sovereigntyStructures(rows)[0].vulnerability_status,'campaign');assert.equal(sovereigntyStructures(rows)[0].vulnerability_end_time,null);
});
