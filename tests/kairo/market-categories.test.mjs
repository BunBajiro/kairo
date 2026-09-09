import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMarketCategories} from '../../server/market-categories.mjs';
import {createMarkets,JITA} from '../../server/markets.mjs';
import {openStore} from '../../server/store.mjs';

test('market taxonomy includes descendants once, isolates sibling categories and keeps unknown items visible',()=>{
 const index=createMarketCategories({build:1,source:'fixture',groups:[{id:4,parentId:0,name:'Ships',types:[]},{id:5,parentId:4,name:'Frigates',types:[587]},{id:6,parentId:4,name:'Cruisers',types:[620]},{id:11,parentId:0,name:'Ammo',types:[222]}]});
 assert.deepEqual(JSON.parse(index.ids('4')),[587,620]);assert.deepEqual(JSON.parse(index.ids('5')),[587]);assert.throws(()=>index.ids('missing'),/existing market category/);
 const view=index.overview([{type_id:587},{type_id:620},{type_id:222},{type_id:999}]);assert.equal(view.total,4);assert.equal(view.unknown,1);assert.equal(view.groups.find(g=>g.id===4).count,2);assert.equal(view.groups.find(g=>g.id===5).count,1);assert.equal(view.groups.find(g=>g.id===11).count,1);assert.equal(view.groups[0].types,undefined);
});

test('existing cached books browse real EVE categories offline, combined with search and supply filters',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'kairo-category-')),store=openStore(dir),m=createMarkets(store,{characters:()=>[]},{request(){throw new Error('Category browsing must stay offline');}});
 try{
  const at=new Date().toISOString();for(const [id,name,volume] of [[587,'Rifter',10],[222,'Antimatter Charge S',0],[2147483000,'Future item',5]]){
   store.db.prepare('INSERT INTO market_types(type_id,name) VALUES(?,?)').run(id,name);
   store.db.prepare('INSERT INTO market_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(JITA,id,null,volume?100:null,volume?100:null,volume,0,volume?1:0,0,at,at,'existing');
  }
  store.set('module:markets',false);
  const categories=m.categories(JITA),ships=categories.groups.find(g=>g.name==='Ships'&&!g.parentId),ammo=categories.groups.find(g=>g.name==='Ammunition & Charges'&&!g.parentId);
  assert.ok(ships);assert.ok(ammo);assert.equal(ships.count,1);assert.equal(ammo.count,1);assert.equal(categories.unknown,1);
  assert.deepEqual(m.browse(JITA,{category:String(ships.id)}).rows.map(r=>r.name),['Rifter']);
  assert.equal(m.browse(JITA,{category:String(ships.id),query:'Antimatter'}).total,0);
  assert.equal(m.browse(JITA,{category:String(ammo.id),filter:'sell'}).total,0);
  assert.equal(m.browse(JITA,{category:String(ammo.id),filter:'empty'}).total,1);
  assert.equal(m.browse(JITA,{category:'unknown'}).rows[0].name,'Future item');
  assert.equal(m.browse(JITA,{category:'all'}).total,3);assert.equal(m.categories(60008494).total,0);
 }finally{await m.close();store.close();await rm(dir,{recursive:true,force:true});}
});
