import test from 'node:test';
import assert from 'node:assert/strict';
import {factionWarfareContext} from '../../server/universe-faction-warfare.mjs';
test('FW states follow real opposing occupancy, with command neighbors and all remaining rear systems',()=>{
 const rows=[1,2,3,4,5].map(id=>({solar_system_id:id,occupier_faction_id:id===1?500004:500001}));
 const graph=new Map([[1,[2]],[2,[1,3]],[3,[2,4]],[4,[3]],[5,[]]]),result=factionWarfareContext(rows,graph);
 assert.deepEqual([...result.values()].map(row=>row.operational_state),['frontline','frontline','command_operations','rearguard','rearguard']);
 assert.deepEqual(result.get(2).frontline_neighbors,[1]);assert.equal(rows[0].operational_state,undefined);
});
test('allied occupancy, unknown factions and stale snapshots do not fabricate an enemy front',()=>{
 const graph=new Map([[1,[2]],[2,[1,3]],[3,[2]]]);
 const rows=[{solar_system_id:1,occupier_faction_id:500001},{solar_system_id:2,occupier_faction_id:500003},{solar_system_id:3,occupier_faction_id:999}];
 assert.deepEqual([...factionWarfareContext(rows,graph).values()].map(row=>row.operational_state),['rearguard','rearguard','unknown']);
 assert.ok([...factionWarfareContext(rows,graph,{fresh:false}).values()].every(row=>row.operational_state==='unknown'&&row.operational_state_status==='stale'));
});
