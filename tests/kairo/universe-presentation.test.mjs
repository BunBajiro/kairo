import test from 'node:test';
import assert from 'node:assert/strict';
import {systemLocationLabel,universeSearchCatalogue,wormholeClassLabel,knownWormholeSystemIds} from '../../components/kairo/universe-presentation.mjs';

const known={system_id:30000142,name:'Jita',space:'known',region_id:10000002,region_name:'The Forge'};
const wormhole={system_id:31000001,name:'J100001',space:'wormhole',region_id:11000001,region_name:'A-R00001',constellation_name:'A-C00001',wormhole_class:3};
const atlas={systems:[known,wormhole],regions:[{region_id:10000002,name:'The Forge'},{region_id:11000001,name:'A-R00001'}]};
const territory={key:'bloc:example',name:'Example bloc',source:'configured',systemIds:[30000142],color:'#aabbcc'};

test('wormhole location labels expose class and J-Space without organizational region or constellation names',()=>{
 assert.equal(systemLocationLabel(wormhole),'C3 · J-Space');
 assert.equal(systemLocationLabel({...wormhole,wormhole_class:null}),'Class unknown · J-Space');
 assert.equal(systemLocationLabel({...wormhole,wormhole_class:13}),'C13 · J-Space');
 assert.equal(wormholeClassLabel({...wormhole,wormhole_class:12,name:'Thera'}),'Thera hub');
 assert.equal(wormholeClassLabel({...wormhole,wormhole_class:14}),'Class 14');
 assert.equal(systemLocationLabel(known),'The Forge');
 assert.equal(wormholeClassLabel(known),'');
});

test('K-Space search retains regions and politics while all-space system results hide J-Space partitions',()=>{
 const items=universeSearchCatalogue(atlas,[territory],{space:'known',ownershipAvailable:true});
 assert.deepEqual(items.map(row=>row.id),['system-30000142','system-31000001','region-10000002','territory-bloc:example']);
 assert.equal(items.find(row=>row.id==='system-31000001').detail,'C3 · J-Space');
 assert.equal(items.find(row=>row.id==='system-30000142').detail,'The Forge · K-Space');
 assert.equal(items.find(row=>row.kind==='territory').detail,'Configured bloc · 1 observed systems');
 assert.equal(JSON.stringify(items).includes('A-R00001'),false);
 assert.equal(JSON.stringify(items).includes('A-C00001'),false);
});

test('J-Space search finds either endpoint across spaces without region or political destinations',()=>{
 const items=universeSearchCatalogue(atlas,[territory],{space:'wormhole'});
 assert.ok(items.every(row=>row.kind==='system'));
 assert.equal(items.find(row=>row.search.includes('j100001')).value,'31000001');
 assert.equal(items.find(row=>row.search.includes('31000001')).name,'J100001');
 assert.equal(items.find(row=>row.search.includes('jita')).name,'Jita');
 assert.equal(items.some(row=>row.search.includes('a-r00001')),false);
});

test('known J-Space counts include usable public endpoints without retaining expired public-only discoveries',()=>{
 const now=Date.parse('2026-09-25T12:00:00Z');
 const row={from_system_id:wormhole.system_id,to_system_id:known.system_id,source:'thera',reported:true,completed:true,expires_at:new Date(now+3600000).toISOString()};
 const intel={feeds:{connections:[row],sources:{thera:{status:'ready'}}}};
 assert.deepEqual([...knownWormholeSystemIds(atlas,intel,null,now)],[wormhole.system_id]);
 assert.equal(knownWormholeSystemIds(atlas,intel,null,now+3600000).size,0);
 assert.equal(knownWormholeSystemIds(atlas,{feeds:{...intel.feeds,sources:{thera:{status:'stale'}}}},null,now).size,0);
 assert.deepEqual([...knownWormholeSystemIds(atlas,{...intel,pins:[{system_id:wormhole.system_id}]},null,now+3600000)],[wormhole.system_id]);
 assert.deepEqual([...knownWormholeSystemIds(atlas,{operations:{location:{system_id:wormhole.system_id}}},null,now)],[wormhole.system_id]);
});
