import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createMarkets,JITA} from '../../server/markets.mjs';
import {allScopes} from '../../server/modules/catalog.mjs';
import {DEFAULT_IMPORT_SETTINGS} from '../../server/import-math.mjs';
import {saveHistory,DAY} from '../../server/market-history.mjs';

const NOW=Date.parse('2026-10-15T12:00:00Z'),AMARR=60008494,UNKNOWN=2147483000,iso=n=>new Date(n).toISOString();
// Classification must follow type identity, not translated or misleading labels.
const items=[[27917,'Plan de fabrication', 'bp'],[27925,'Second plan','bp'],[2204,'Drone plan','bp'],[46166,'Reaction formula','bp'],[1403,'Blueprint-looking ordinary module','icon'],[519,'Ordinary module','icon'],[27916,'Ordinary bomb','icon'],[UNKNOWN,'Unknown Blueprint','icon']];
const expected=new Map(items.map(([id,,variant])=>[id,variant]));
const variants=rows=>rows.map(r=>[r.type_id??r.typeId,r.iconVariant]).sort((a,b)=>a[0]-b[0]);
const wanted=ids=>ids.map(id=>[id,expected.get(id)]).sort((a,b)=>a[0]-b[0]);

async function desk(t){
 const dir=await mkdtemp(join(tmpdir(),'kairo-blueprint-icons-')),store=openStore(dir),network=[];
 const m=createMarkets(store,{characters:()=>[{id:42,name:'Icon trader',scopes:allScopes}]},{request:async path=>{network.push(path);throw new Error('Cached image classification must stay offline');}},{now:()=>NOW,historySource:'esi'});
 t.after(async()=>{await m.close();store.close();await rm(dir,{recursive:true,force:true});});
 const sample=data=>({status:'ready',updatedAt:iso(NOW),expiresAt:iso(NOW+DAY),data});
 store.saveSnapshot(42,'skills',sample({skills:[{skill_id:16622,active_skill_level:5},{skill_id:3446,active_skill_level:5},{skill_id:16597,active_skill_level:5}]}));
 store.saveSnapshot(42,'standings',sample([{from_id:1000084,from_type:'npc_corp',standing:5},{from_id:500003,from_type:'faction',standing:4}]));
 store.saveSnapshot(42,'orders',sample([]));
 store.set('market:owner:'+AMARR,{corporationId:1000084,corporationName:'Amarr Navy',factionId:500003,expires:NOW+DAY});
 store.set('market:imports:'+AMARR,{...DEFAULT_IMPORT_SETTINGS,characterId:42,minProfit:0});
 for(const [id,name] of items){
  store.db.prepare('INSERT INTO market_types(type_id,name) VALUES(?,?)').run(id,name);
  for(const [hub,price,quantity] of [[JITA,1000000,100],[AMARR,3000000,5]]){
   store.db.prepare('INSERT INTO market_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(hub,id,500000,price,price,quantity,0,1,0,iso(NOW),iso(NOW+DAY),'blueprint-icons');
   store.db.prepare('INSERT INTO market_orders VALUES(?,?,?,?,?,?,?,?,?,?)').run(hub,id,id,0,price,quantity,1,'station',iso(NOW-DAY),90);
  }
  saveHistory(store,10000043,id,Array.from({length:30},(_,i)=>({date:iso(NOW-(i+1)*DAY).slice(0,10),average:1800000,lowest:1400000,highest:2200000,volume:500,order_count:20})),iso(NOW),iso(NOW+DAY),'ESI',NOW);
 }
 const statements=[],prepare=store.db.prepare.bind(store.db);
 store.db.prepare=sql=>{statements.push(sql);return prepare(sql);};
 return {store,m,imports:m.imports,network,statements};
}

test('cached market category, mixed browse, selected detail and report choose the actual type image variation',async t=>{
 const {m,network}=await desk(t);
 await t.test('blueprint category supplies bp even without an English Blueprint label',()=>assert.deepEqual(variants(m.browse(AMARR,{category:'1016'}).rows),wanted([27917,27925])));
 await t.test('mixed All items includes ordinary and unknown icon controls',()=>assert.deepEqual(variants(m.browse(AMARR,{category:'all'}).rows),wanted(items.map(([id])=>id))));
 await t.test('selected blueprint and ordinary details preserve their own variation',()=>assert.deepEqual(items.map(([id])=>[id,m.detail(AMARR,id).item.iconVariant]),items.map(([id,,variant])=>[id,variant])));
 await t.test('hub report has the same complete per-item image contract',()=>assert.deepEqual(variants(m.report(AMARR).rows),wanted(items.map(([id])=>id))));
 assert.deepEqual(network,[]);
});

test('image classification keeps existing market read and external-request bounds',async t=>{
 const {store,m,network,statements}=await desk(t);
 const changes=store.db.prepare('SELECT total_changes() n').get().n;
 // Includes the existing hub lookup; history metadata accounts for the fifth
 // detail query. No per-image classification query may be added to these paths.
 for(const [label,read,bound] of [['browse',()=>m.browse(AMARR),3],['detail',()=>m.detail(AMARR,27917),5],['report',()=>m.report(AMARR),7]]){
  statements.length=0;const value=read();
  assert.equal(statements.length,bound,label+' keeps its existing SQL count');
  assert.ok(value.rows?.length||value.item?.sell===3000000,label+' retains real cached market data');
 }
 assert.equal(store.db.prepare('SELECT total_changes() n').get().n,changes,'Read-only classification never rewrites cached books');
 assert.deepEqual(network,[],'No ESI or provider metadata request is added');
});

test('import opportunities, quotes and durable plans retain the blueprint image contract',async t=>{
 const {store,imports,network}=await desk(t),analysis=await imports.analyse(AMARR),qualified=analysis.groups.flatMap(g=>g.items);
 const ids=[27917,27925,2204,46166,1403,519];
 await t.test('healthy import quantities, prices and exclusions remain meaningful',()=>{
  assert.deepEqual(qualified.map(i=>i.typeId).sort((a,b)=>a-b),[...ids].sort((a,b)=>a-b));
  assert.ok(qualified.every(i=>i.best.profiteering.quantity>0&&i.best.profiteering.net>0));
  assert.equal(analysis.excluded.noCargo,1,'An unknown type has no assumed cargo volume');
 });
 await t.test('analysis gives cards the correct type variation',()=>assert.deepEqual(variants(qualified),wanted(ids)));
 await t.test('opportunity detail preserves the same variation',async()=>assert.deepEqual(variants(await Promise.all(ids.map(id=>imports.detail(AMARR,id)))),wanted(ids)));
 const lines=qualified.map(item=>({typeId:item.typeId,strategy:'profiteering',quantity:item.best.profiteering.quantity,price:item.best.profiteering.price,duration:item.best.profiteering.duration}));
 await t.test('custom quotes carry image metadata',async()=>assert.deepEqual(variants(await Promise.all(lines.map(line=>imports.quote(AMARR,line)))),wanted(ids)));
 await t.test('combined manifest quotes carry image metadata',async()=>assert.deepEqual(variants((await imports.planQuote(AMARR,{lines})).lines),wanted(ids)));
 const saved=await imports.savePlan(AMARR,{name:'Existing blueprint shipment',lines});
 await t.test('newly saved plan lines keep their type variation',()=>assert.deepEqual(variants(saved.lines),wanted(ids)));
 await t.test('reopened plan lines keep their type variation',()=>assert.deepEqual(variants(imports.getPlan(AMARR,saved.id).lines),wanted(ids)));
 // Model a plan saved by the prior build, before this display metadata existed.
 const legacy=structuredClone(saved);for(const line of legacy.lines)delete line.iconVariant;
 const body=JSON.stringify(legacy);store.db.prepare('UPDATE market_import_plans SET body=? WHERE id=?').run(body,saved.id);
 const changes=store.db.prepare('SELECT total_changes() n').get().n,reopened=imports.getPlan(AMARR,saved.id);
 await t.test('legacy plans gain image metadata without a migration or repricing',()=>assert.deepEqual(variants(reopened.lines),wanted(ids)));
 await t.test('legacy financial snapshot, durable identity and stored body remain untouched',()=>{
  assert.deepEqual(reopened.totals,legacy.totals);assert.deepEqual(reopened.packing,legacy.packing);assert.equal(reopened.quotedAt,legacy.quotedAt);assert.equal(reopened.id,legacy.id);
  assert.equal(store.db.prepare('SELECT body FROM market_import_plans WHERE id=?').get(saved.id).body,body);
  assert.equal(store.db.prepare('SELECT total_changes() n').get().n,changes);assert.deepEqual(network,[]);
 });
});
