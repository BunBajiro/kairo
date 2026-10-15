import test from 'node:test';
import assert from 'node:assert/strict';
import {mapSystemIndex,searchMapSystems,mapPlacementGroupIndex,searchPlacementGroups} from '../../components/kairo/map-discovery-search-model.mjs';

const systems=[
 {system_id:1,name:'UALX-3',space:'known',region_id:10,region_name:'Tenerifis',constellation_id:20,constellation_name:'3-U491'},
 {system_id:2,name:'JI1-SY',space:'known',region_id:10,region_name:'Tenerifis',constellation_id:20,constellation_name:'3-U491'},
 {system_id:3,name:'J100338',space:'wormhole',region_id:30,region_name:'A-R00001',constellation_id:40,constellation_name:'A-C00001'},
 {system_id:4,name:'Not mapped',space:'known',region_id:50,region_name:'Catch',constellation_id:60,constellation_name:'4-07MU'}
];
test('landing searches only visible user map instances, retaining independent aliases and map context',()=>{
 const maps=[{id:'a',name:'Home',nodes:[{system_id:1,alias:'Front door'},{system_id:3}]},{id:'b',name:'Exploration',nodes:[{system_id:1,alias:'Old entrance'}]},
 {id:'service',name:'Source',kind:'tracking_source',nodes:[{system_id:2}]},{id:'read',name:'Read only',read_only:true,nodes:[{system_id:2}]}];
 const index=mapSystemIndex(maps,systems);
 assert.equal(searchMapSystems(index,'UALX-3').length,2);
 assert.equal(searchMapSystems(index,'front home')[0].map_id,'a');
 assert.equal(searchMapSystems(index,'Old entrance')[0].map_id,'b');
 assert.equal(searchMapSystems(index,'3')[0].system.system_id,3);
 assert.deepEqual(searchMapSystems(index,'Not mapped'),[]);
 assert.deepEqual(searchMapSystems(index,'JI1-SY'),[]);
 assert.deepEqual(searchMapSystems(index,''),[]);
 assert.equal(maps[0].nodes[0].alias,'Front door');
});
test('placement catalog exposes known-space groups and exact membership without organizational wormhole regions',()=>{
 const groups=mapPlacementGroupIndex({systems});
 assert.deepEqual(groups.region.map(row=>row.name),['Catch','Tenerifis']);
 assert.deepEqual(searchPlacementGroups(groups.region,'tener')[0].system_ids,[1,2]);
 assert.equal(searchPlacementGroups(groups.constellation,'Tenerifis')[0].name,'3-U491');
 assert.deepEqual(searchPlacementGroups(groups.region,'A-R00001'),[]);
 assert.deepEqual(searchPlacementGroups(groups.constellation,'40'),[]);
 assert.equal(searchPlacementGroups(groups.region,'',1).length,1);
});
