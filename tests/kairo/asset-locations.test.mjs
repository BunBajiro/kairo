import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAssetLocations,enrichAssetLocations} from '../../server/asset-locations.mjs';

test('containment preserves shared parents, missing roots, duplicate IDs and first repeated cycle IDs',()=>{
 const assets=[
  {item_id:1,location_id:60000001},{item_id:2,location_id:1},{item_id:3,location_id:1},
  {item_id:4,location_id:3},{item_id:5,location_id:999},
  {item_id:10,location_id:11},{item_id:11,location_id:12},{item_id:12,location_id:10},
  {item_id:13,location_id:11},{item_id:14,location_id:13},{item_id:15,location_id:15},
  {item_id:20,location_id:60000002},{item_id:20,location_id:60000003},{item_id:21,location_id:20},
 ];
 const before=structuredClone(assets),{rows,locations}=prepareAssetLocations(assets);
 assert.deepEqual(rows.map(a=>a.root_location_id),[60000001,60000001,60000001,60000001,999,11,12,10,11,11,15,60000002,60000003,60000003]);
 assert.deepEqual(locations,[60000001,999,11,12,10,15,60000002,60000003]);
 assert.deepEqual(assets,before);
});

test('a long shared containment chain is read in linear work without recursion',()=>{
 const count=10000;let reads=0;
 const assets=Array.from({length:count},(_,i)=>({item_id:i+1,get location_id(){reads++;return i===count-1?60000001:i+2;}}));
 const result=prepareAssetLocations(assets);
 assert.equal(result.rows.length,count);assert.ok(result.rows.every(a=>a.root_location_id===60000001));
 assert.ok(reads<=count*3,'Each row needs at most copy, start and one parent traversal');
 assert.deepEqual(result.locations,[60000001]);
});

test('enrichment retains public name fallback and structure permission/pilot scope',async()=>{
 const structure=1000000000001,denied=1000000000002;
 const assets=[{item_id:1,location_id:60000001},{item_id:2,location_id:1},{item_id:3,location_id:structure},{item_id:4,location_id:denied}];
 async function run(canReadStructures){
  const names={},calls=[],requested=[];
  const rows=await enrichAssetLocations(assets,{names,rememberNames:values=>Object.assign(names,values),characterId:42,canReadStructures,
   esi:{names:async ids=>{requested.push(ids);return {};},request:async(path,options)=>{calls.push([path,options]);if(path.endsWith(String(denied)))throw new Error('Access denied');return {data:{name:path.includes('stations')?'Station':'Structure'}};}}});
  return {rows,calls,requested};
 }
 const deniedRun=await run(false);
 assert.deepEqual(deniedRun.requested,[[60000001]]);assert.equal(deniedRun.calls.length,1);
 assert.deepEqual(deniedRun.rows.map(a=>a.location_name),['Station','Station',String(structure),String(denied)]);
 const allowedRun=await run(true);
 assert.deepEqual(allowedRun.calls,[['/universe/stations/60000001',{ttl:86400}],['/universe/structures/'+structure,{characterId:42,ttl:3600}],['/universe/structures/'+denied,{characterId:42,ttl:3600}]]);
 assert.deepEqual(allowedRun.rows.map(a=>a.location_name),['Station','Station','Structure',String(denied)]);
});
