import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from '../../server/store.mjs';
import {createMarkets,JITA} from '../../server/markets.mjs';
import {createImports} from '../../server/imports.mjs';
import {historyWindow,saveHistory,decodeArchive,createHistoryArchive,DAY} from '../../server/market-history.mjs';
import {tradingRates,marketPrice,undercut,purchaseQuote,scenario,packCargo,buildOpportunity,importCategory,DEFAULT_IMPORT_SETTINGS,validateImportSettings,demandEvidence} from '../../server/import-math.mjs';
import {createMarketCategories} from '../../server/market-categories.mjs';
import {allScopes} from '../../server/modules/catalog.mjs';
import {startKairo} from '../../server/index.mjs';
const NOW=Date.parse('2026-09-08T12:00:00Z'),AMARR=60008494,iso=n=>new Date(n).toISOString();
const fixture=JSON.parse(readFileSync(new URL('./fixtures/market-history-archives.json',import.meta.url),'utf8'));
const chars=[{id:42,name:'Main trader',scopes:allScopes},{id:43,name:'Market alt',scopes:allScopes}],auth={characters:()=>chars};
const history=(volume=500,average=1800000)=>Array.from({length:30},(_,i)=>({date:iso(NOW-(i+1)*DAY).slice(0,10),average,lowest:average*.8,highest:average*1.2,volume,order_count:20}));
const rates=tradingRates({accounting:5,brokerRelations:5,advancedBrokerRelations:5});
async function storage(t){const dir=await mkdtemp(join(tmpdir(),'kairo-imports-')),store=openStore(dir);t.after(async()=>{try{store.close();}catch{}await rm(dir,{recursive:true,force:true});});return {dir,store};}
function seedProfile(store,id=42){const sample=data=>({status:'ready',updatedAt:iso(NOW),expiresAt:iso(NOW+DAY),data});store.saveSnapshot(id,'skills',sample({skills:[{skill_id:16622,active_skill_level:5,trained_skill_level:5},{skill_id:3446,active_skill_level:5,trained_skill_level:5},{skill_id:16597,active_skill_level:5,trained_skill_level:5}]}));store.saveSnapshot(id,'standings',sample([{from_id:1000084,from_type:'npc_corp',standing:5},{from_id:500003,from_type:'faction',standing:4}]));store.saveSnapshot(id,'orders',sample([]));store.set('market:owner:'+AMARR,{corporationId:1000084,corporationName:'Amarr Navy',factionId:500003,expires:NOW+DAY});}
function seedItem(store,typeId,name='Imported module',volume=500){store.db.prepare('INSERT OR IGNORE INTO market_types(type_id,name) VALUES(?,?)').run(typeId,name);for(const [hub,price,quantity] of [[JITA,1000000,100],[AMARR,3000000,5]]){store.db.prepare('INSERT INTO market_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(hub,typeId,500000,price,price,quantity,0,1,0,iso(NOW),iso(NOW+300000),'seed');store.db.prepare('INSERT INTO market_orders VALUES(?,?,?,?,?,?,?,?,?,?)').run(hub,typeId,typeId,0,price,quantity,1,'station',iso(NOW-DAY),90);}saveHistory(store,10000043,typeId,history(volume),iso(NOW),iso(NOW+DAY),'ESI',NOW);}
async function desk(t){const {dir,store}=await storage(t),m=createMarkets(store,auth,{request(){throw new Error('Analysis must not call ESI.');}},{now:()=>NOW,historySource:'esi',spacingMs:0});seedProfile(store);seedProfile(store,43);store.set('market:imports:'+AMARR,{...DEFAULT_IMPORT_SETTINGS,characterId:42,minProfit:0});t.after(()=>m.close());return {dir,store,m,imports:m.imports};}

test('calendar history windows deduplicate days, exclude today and never inflate missing-day volume',()=>{const rows=[{date:'2026-09-07',average:100,volume:30},{date:'2026-09-07',average:200,volume:60},{date:'2026-09-05',average:100,volume:30},{date:'2026-09-08',average:999,volume:9000}];const w=historyWindow(rows,3,NOW);assert.equal(w.volume,90);assert.equal(w.daily_volume,30);assert.equal(w.reported_days,2);assert.equal(w.average,500/3);assert.equal(w.to,'2026-09-07');assert.equal(w.from,'2026-09-05');});
test('trading fees use active character skills, unmodified standings, structure rates and seller-only taxes',()=>{const max=tradingRates({accounting:5,brokerRelations:5,faction:10,corporation:10});assert.ok(Math.abs(max.salesTax-.03375)<1e-10);assert.ok(Math.abs(max.broker-.01)<1e-10);assert.equal(max.buyTax,0);const bad=tradingRates({accounting:0,brokerRelations:0,faction:-10,corporation:-10});assert.equal(bad.broker,.035);const structure=tradingRates({accounting:5,brokerRelations:5,faction:10,corporation:10,kind:'structure',structureBroker:2.5});assert.equal(structure.broker,.025);assert.throws(()=>tradingRates({accounting:5,brokerRelations:5,kind:'structure'}),/total broker fee/);});
test('depth-weighted purchases, valid EVE ticks and minimum/relisting fees produce exact net returns',()=>{const levels=[{price:100,volume:10},{price:150,volume:30}],buy=purchaseQuote(levels,20);assert.equal(buy.cost,2500);assert.equal(buy.average,125);assert.equal(buy.maxPrice,150);assert.equal(purchaseQuote(levels,50).complete,false);assert.equal(undercut(1000000),999900);assert.equal(marketPrice(1234567),1234000);assert.equal(marketPrice(1234567,true),1235000);
 const q=scenario({levels,quantity:20,price:250,duration:7,volume:1,daily:5,rates,settings:{...DEFAULT_IMPORT_SETTINGS,haulPerTrip:100},strategy:'profiteering'});assert.equal(q.buy.cost,2500);assert.equal(q.brokerFee,100);assert.equal(q.relistReserve,100);assert.equal(q.haul,100);assert.equal(q.upfront,2700);assert.ok(Math.abs(q.net-2031.25)<1e-8);assert.equal(q.eta,4);});
test('break-even reports the first non-loss-making price instead of double-counting fee minima',()=>{
 const input={levels:[{price:100,volume:10},{price:150,volume:30}],quantity:20,price:250,duration:7,volume:1,daily:5,rates,settings:{...DEFAULT_IMPORT_SETTINGS,haulPerTrip:100},strategy:'profiteering'};
 const quote=scenario(input);assert.equal(quote.breakEven,144.9);
 assert.ok(scenario({...input,price:144.9}).net>=0);assert.ok(scenario({...input,price:144.8}).net<0);
});
test('break-even follows minimum, mixed and proportional fees, including no possible recovery',()=>{
 const cases=[
  {name:'both minimum fees',purchase:20,quantity:1,relistCount:1,brokerMinimum:true,relistMinimum:true},
  {name:'percentage broker and minimum relisting',purchase:1000,quantity:10,relistCount:1,brokerMinimum:false,relistMinimum:true},
  {name:'both percentage fees',purchase:100000,quantity:1,relistCount:1,brokerMinimum:false,relistMinimum:false},
  {name:'no planned repricing',purchase:100000,quantity:1,relistCount:0,brokerMinimum:false,relistMinimum:null},
  {name:'power-of-ten tick boundary',purchase:1000,levels:[{price:941.2,volume:5},{price:941.3,volume:5}],quantity:10,relistCount:1,brokerMinimum:false,relistMinimum:true,expected:1000}
 ];
 for(const c of cases){
  const input={levels:c.levels||[{price:c.purchase,volume:c.quantity}],quantity:c.quantity,price:c.purchase*2,duration:7,volume:1,daily:5,rates,settings:{...DEFAULT_IMPORT_SETTINGS,relistCount:c.relistCount},strategy:'profiteering'};
  const initial=scenario(input),at=scenario({...input,price:initial.breakEven}),below=scenario({...input,price:undercut(initial.breakEven)});
  if(c.expected)assert.equal(initial.breakEven,c.expected,c.name);
  assert.ok(at.net>=-1e-8,c.name+' reaches nonnegative net');assert.ok(below.net<0,c.name+' previous tick still loses ISK');
  assert.equal(at.brokerFee===100,c.brokerMinimum,c.name+' exercises the intended broker regime');
  assert.equal(at.relistReserve, c.relistCount?Math.max(100,at.revenue*rates.broker*(1-rates.relistDiscount)):0);
  if(c.relistMinimum!==null)assert.equal(at.relistReserve===100,c.relistMinimum,c.name+' exercises the intended relisting regime');
 }
 const impossible=scenario({levels:[{price:100,volume:1}],quantity:1,price:1000,duration:7,volume:1,daily:5,rates:tradingRates({accounting:0,brokerRelations:0,kind:'structure',structureBroker:50}),settings:{...DEFAULT_IMPORT_SETTINGS,relistCount:20},strategy:'profiteering'});
 assert.equal(impossible.breakEven,null,'When proportional fees exceed revenue, no break-even price exists');
});
test('cargo packing counts indivisible hulls and shares unused space between plan lines',()=>{const p=packCargo([{typeId:1,quantity:3,unitVolume:6},{typeId:2,quantity:3,unitVolume:4}],10);assert.equal(p.trips,3);assert.equal(p.utilization,100);assert.ok(p.loads.every(l=>l.used<=10));assert.throws(()=>packCargo([{typeId:1,quantity:1,unitVolume:11}],10),/larger/);const q=scenario({levels:[{price:100,volume:3}],quantity:3,price:200,duration:3,volume:6,daily:3,rates,settings:{...DEFAULT_IMPORT_SETTINGS,cargo:10},strategy:'profiteering'});assert.equal(q.trips,3);});
test('activity thresholds use the assumed local share and prefer shorter active windows by type',()=>{const ammo=importCategory(11);assert.equal(demandEvidence(history(1000),ammo,10,NOW).eligible,false);const active=demandEvidence(history(100000),ammo,10,NOW);assert.equal(active.activeWindow,1);assert.equal(active.eligible,true);assert.equal(demandEvidence(history(500),importCategory(9),10,NOW).eligible,true);assert.equal(demandEvidence(history(500),importCategory(4),10,NOW).eligible,true);assert.equal(demandEvidence([{...history()[0],volume:1000000}],ammo,100,NOW).eligible,false);});
test('recommendations respect real depth, budget, margin, cargo and price-correction objectives',()=>{const model={typeId:1403,name:'Module',category:importCategory(9),volume:5,levels:[{price:1000000,volume:2},{price:1100000,volume:100}],localSell:10000000,localBuy:500000,localSupply:5,history:history(),rates,settings:{...DEFAULT_IMPORT_SETTINGS,budget:10000000,minProfit:0,cargo:100},now:NOW,detail:true};const r=buildOpportunity(model);assert.ok(r);assert.equal(r.tier,500);assert.deepEqual(r.scarcity,[3,7,30]);assert.ok(r.best.anchoring.price<=model.localSell*.9);for(const o of Object.values(r.best).filter(Boolean)){assert.ok(o.upfront<=model.settings.budget);assert.ok(o.roi>=15);assert.ok(o.quantity<=102);assert.ok(o.eta<=7);assert.ok(o.trips<=3);assert.ok(o.buy.fills.length>0);}assert.ok(Math.max(...Object.values(r.best).filter(Boolean).map(o=>o.upfront))>7000000);assert.equal(buildOpportunity({...model,volume:101}),null);});
test('ranking rewards fewer trips for an otherwise identical import',()=>{const model={typeId:1403,name:'Module',category:importCategory(9),levels:[{price:1000000,volume:100}],localSell:3000000,localBuy:500000,localSupply:5,history:history(),rates,settings:{...DEFAULT_IMPORT_SETTINGS,cargo:100,maxTrips:20,minProfit:0},now:NOW};const small=buildOpportunity({...model,volume:1}),large=buildOpportunity({...model,volume:5});assert.ok(small.score>large.score);assert.ok(small.best.profiteering.trips<=large.best.profiteering.trips);});
test('real market ancestry groups drones, rigs and subsystems with equipment, using packaged hull volume',()=>{const index=createMarketCategories();assert.equal(index.type(587).volume,2500);assert.equal(importCategory(index.type(587).root).id,'ships');assert.equal(importCategory(index.type(2488).root).id,'equipment');for(const root of [9,157,955])assert.equal(importCategory(root).id,'equipment');assert.equal(importCategory(11).id,'ammo');assert.equal(importCategory(987654).id,'misc');});
test('analysis stays offline, returns at most ten per category and excludes all connected alts’ local sales',async t=>{const {store,imports}=await desk(t);const catalog=JSON.parse(readFileSync(new URL('../../server/data/market-categories.json',import.meta.url),'utf8')),index=createMarketCategories(),ids=catalog.groups.flatMap(g=>g.types).filter(id=>index.type(id).root===9&&index.type(id).volume>0&&index.type(id).volume<=100).slice(0,14);for(const [i,id] of ids.entries())seedItem(store,id,'Module '+i);const sample=store.snapshot(43,'orders');sample.data=[{order_id:999,type_id:ids[0],location_id:AMARR,is_buy_order:false,volume_remain:1,issued:iso(NOW),duration:90}];store.saveSnapshot(43,'orders',sample);const a=await imports.analyse(AMARR),g=a.groups.find(g=>g.id==='equipment');assert.equal(g.items.length,10);assert.equal(g.qualified,13);assert.equal(a.excluded.ownOrders,1);assert.ok(g.items.every(i=>i.typeId!==ids[0]));assert.ok(g.items.every((x,i)=>!i||g.items[i-1].score>=x.score));const d=await imports.detail(AMARR,g.items[0].typeId);assert.ok(d.alternatives.anchoring.length);assert.ok(d.levels.length);assert.equal((await imports.analyse(JITA)).reason,'Choose the destination hub. Jita is the purchasing market.');});
test('own Jita orders and expired depth are excluded; missing trading scopes never become zero fees',async t=>{const {store,imports}=await desk(t);seedItem(store,1403);let sample=store.snapshot(43,'orders');sample.data=[{order_id:1403,type_id:1403,location_id:JITA,is_buy_order:false,volume_remain:100,issued:iso(NOW),duration:90}];store.saveSnapshot(43,'orders',sample);assert.equal((await imports.analyse(AMARR)).groups.flatMap(g=>g.items).length,0);store.saveSnapshot(43,'orders',{...sample,data:[]});store.db.prepare('UPDATE market_orders SET issued=? WHERE hub_id=?').run(iso(NOW-100*DAY),JITA);assert.equal((await imports.analyse(AMARR)).groups.flatMap(g=>g.items).length,0);store.set('module:training',false);assert.equal(imports.state(AMARR).fees.ready,false);assert.equal((await imports.analyse(AMARR)).groups.flatMap(g=>g.items).length,0);});
test('fee refresh resolves NPC faction from CCP static data and only requests required trader datasets',async t=>{const {store}=await storage(t);const m=createMarkets(store,auth,{request(){throw new Error('unexpected');}},{now:()=>NOW,historySource:'esi'});t.after(()=>m.close());seedProfile(store);store.set('market:imports:'+AMARR,{...DEFAULT_IMPORT_SETTINGS,characterId:42});store.db.prepare('DELETE FROM settings WHERE key=?').run('market:owner:'+AMARR);const calls=[];const imports=createImports(store,auth,{now:()=>NOW,request:async path=>{calls.push(path);return {data:{owner:1000035}};},refreshCharacter:async(id,keys)=>calls.push({id,keys})});await imports.refresh(AMARR);assert.equal(imports.state(AMARR).fees.owner,'Caldari Navy');assert.equal(calls.filter(c=>typeof c==='string').length,1);assert.deepEqual(calls.find(c=>c.id===42).keys,['skills','standings','orders']);assert.deepEqual(calls.find(c=>c.id===43).keys,['orders']);await imports.refresh(AMARR);assert.equal(calls.filter(c=>typeof c==='string').length,1);});
test('saved plans recompute values server-side, combine hauling costs and survive restart without changing other data',async t=>{const {store,dir,imports}=await desk(t);seedItem(store,1403);seedItem(store,519,'Other module');imports.saveSettings(AMARR,{...DEFAULT_IMPORT_SETTINGS,characterId:42,minProfit:0,haulPerTrip:100000});const a=await imports.analyse(AMARR),items=a.groups.flatMap(g=>g.items);assert.equal(items.length,2);const lines=items.map(i=>({typeId:i.typeId,...i.best.profiteering,net:999999999999}));const q=await imports.planQuote(AMARR,{lines});assert.equal(q.totals.haul,q.packing.trips*100000);assert.ok(q.totals.net<999999999999);const saved=await imports.savePlan(AMARR,{name:'Group resupply',lines});assert.equal(imports.state(AMARR).plans[0].lineCount,2);const reopened=openStore(dir),next=createImports(reopened,auth,{now:()=>NOW});assert.equal(next.getPlan(AMARR,saved.id).name,'Group resupply');assert.equal(next.getPlan(AMARR,saved.id).totals.net,q.totals.net);reopened.close();await assert.rejects(imports.planQuote(AMARR,{lines:[lines[0],lines[0]]}),/one import line/);await assert.rejects(imports.quote(AMARR,{...lines[0],price:1234567}),/price ticks/);imports.removePlan(AMARR,saved.id);assert.equal(imports.state(AMARR).plans.length,0);});
test('settings reject invalid capacities, impossible fee inputs and unknown fields atomically',async t=>{const {imports}=await desk(t),before=imports.state(AMARR).settings;for(const settings of [{...before,cargo:0},{...before,maxTrips:1.5},{...before,structureBroker:.1},{...before,demandShare:NaN},{...before,anything:true}])assert.throws(()=>imports.saveSettings(AMARR,settings));assert.deepEqual(imports.state(AMARR).settings,before);assert.throws(()=>validateImportSettings([]));});
test('plan item uniqueness follows the quoted item identity and cannot purchase the same cached stock twice',async t=>{
 const {store,imports}=await desk(t);seedItem(store,1403);seedItem(store,519,'Other module');
 const line={typeId:1403,strategy:'profiteering',quantity:100,price:2000000,duration:90};
 const single=await imports.planQuote(AMARR,{lines:[line]});assert.equal(single.lines[0].buy.quantity,100);
 const distinct=await imports.planQuote(AMARR,{lines:[line,{...line,typeId:519}]});assert.equal(distinct.lines.length,2);
 const before=imports.state(AMARR).plans.length;
 for(const duplicateId of [1403,'1403','01403'])await t.test('Reject duplicate identity '+JSON.stringify(duplicateId),async()=>{
  try{
   await assert.rejects(imports.savePlan(AMARR,{name:'Duplicate stock',lines:[line,{...line,typeId:duplicateId}]}),/one import line/);
   assert.equal(imports.state(AMARR).plans.length,before,'An invalid duplicate plan must not persist');
  }finally{store.db.prepare("DELETE FROM market_import_plans WHERE json_extract(body,'$.name')='Duplicate stock'").run();}
 });
 await assert.rejects(imports.planQuote(AMARR,{lines:[]}),/1–100 items/);
 await assert.rejects(imports.planQuote(AMARR,{lines:Array.from({length:101},()=>line)}),/1–100 items/);
 await assert.rejects(imports.planQuote(AMARR,{lines:[{...line,typeId:'missing'}]}),/no longer qualifies/);
 const saved=await imports.savePlan(AMARR,{name:'Distinct stock',lines:[line,{...line,typeId:'519'}]});
 assert.deepEqual(saved.lines.map(l=>l.typeId),[1403,519]);assert.equal(imports.state(AMARR).plans.length,before+1);
});
test('buying character defaults to the seller for old settings and remains independent per destination',async t=>{
 const {store,imports}=await desk(t),legacy={...imports.state(AMARR).settings,characterId:43,cargo:32000};delete legacy.buyingCharacterId;store.set('market:imports:'+AMARR,legacy);
 const original=imports.state(AMARR);assert.equal(original.settings.buyingCharacterId,0);assert.equal(original.buyer.characterId,43);assert.equal(original.buyer.sameAsSeller,true);assert.equal(original.settings.cargo,32000);
 const chosen=imports.saveSettings(AMARR,{...original.settings,buyingCharacterId:42});assert.equal(chosen.buyer.characterId,42);assert.equal(chosen.fees.characterId,43);assert.equal(chosen.buyer.sameAsSeller,false);assert.equal(imports.state(JITA).settings.buyingCharacterId,0);
 for(const buyingCharacterId of [-1,1.5,'42',null,NaN,Infinity,1e12+1,999])assert.throws(()=>imports.saveSettings(AMARR,{...chosen.settings,buyingCharacterId}));
 assert.deepEqual(imports.state(AMARR).settings,chosen.settings);
 assert.equal(imports.saveSettings(AMARR,{...chosen.settings,characterId:42}).buyer.characterId,42);
 const follow=imports.saveSettings(AMARR,{...chosen.settings,buyingCharacterId:0,characterId:42});assert.equal(follow.buyer.characterId,42);assert.equal(follow.buyer.sameAsSeller,true);
});
test('a separate buyer needs only orders and cannot change seller fees, capital or immediate purchase costs',async t=>{
 const {store,imports}=await desk(t);seedItem(store,1403);const initial=await imports.analyse(AMARR),item=initial.groups.flatMap(g=>g.items)[0],input={typeId:item.typeId,...item.best.profiteering},before=await imports.quote(AMARR,input);
 const buyerAuth={characters:()=>chars.map(c=>c.id===43?{...c,scopes:['esi-markets.read_character_orders.v1']}:c)},split=createImports(store,buyerAuth,{now:()=>NOW});
 split.saveSettings(AMARR,{...initial.settings,buyingCharacterId:43});const after=await split.quote(AMARR,input);
 assert.equal(after.buyer.characterId,43);assert.equal(after.buyer.ready,true);assert.deepEqual(after.buyer.rates,{salesTax:0,broker:0});assert.deepEqual(after.feeProfile,before.feeProfile);
 for(const key of ['net','upfront','salesTax','brokerFee','relistReserve'])assert.equal(after[key],before[key]);assert.deepEqual(after.buy,before.buy);assert.equal(split.state(AMARR).settings.budget,initial.settings.budget);
 const sample=store.snapshot(43,'orders');store.saveSnapshot(43,'orders',{...sample,data:[{order_id:1403,type_id:1403,location_id:JITA,is_buy_order:false,volume_remain:100,issued:iso(NOW),duration:90}]});
 assert.equal((await split.analyse(AMARR)).groups.flatMap(g=>g.items).length,0);
});
test('missing, unauthorized or disconnected buyers block analysis while older usable orders remain explicit',async t=>{
 const {store,imports}=await desk(t);seedItem(store,1403);const settings=imports.state(AMARR).settings;imports.saveSettings(AMARR,{...settings,buyingCharacterId:43});
 for(const list of [chars.filter(c=>c.id!==43),chars.map(c=>c.id===43?{...c,needsReauth:true}:c),chars.map(c=>c.id===43?{...c,scopes:[]}:c)]){
  const service=createImports(store,{characters:()=>list},{now:()=>NOW}),state=service.state(AMARR),result=await service.analyse(AMARR);
  assert.equal(state.buyer.characterId,43);assert.equal(state.buyer.ready,false);assert.equal(state.fees.ready,true);assert.match(result.reason,/buying character/);assert.equal(result.groups.flatMap(g=>g.items).length,0);
 }
 const sample=store.snapshot(43,'orders');store.saveSnapshot(43,'orders',{...sample,data:null});assert.equal(imports.state(AMARR).buyer.ready,false);assert.equal((await imports.analyse(AMARR)).groups.flatMap(g=>g.items).length,0);
 store.saveSnapshot(43,'orders',{...sample,expiresAt:iso(NOW-1)});const cached=await imports.analyse(AMARR);assert.equal(cached.buyer.ready,true);assert.equal(cached.buyer.stale,true);assert.equal(cached.groups.flatMap(g=>g.items).length,1);
});
test('saved plans retain both traders after settings change and restart, and legacy plans remain readable',async t=>{
 const {store,dir,imports}=await desk(t);seedItem(store,1403);imports.saveSettings(AMARR,{...imports.state(AMARR).settings,buyingCharacterId:43});
 const a=await imports.analyse(AMARR),item=a.groups.flatMap(g=>g.items)[0],lines=[{typeId:item.typeId,...item.best.profiteering}],saved=await imports.savePlan(AMARR,{name:'Separate traders',lines,buyer:{characterId:999,characterName:'Ignore client identity'}});
 assert.equal(saved.buyer.characterId,43);assert.equal(saved.buyer.characterName,'Market alt');assert.equal(saved.feeProfile.characterId,42);assert.equal(saved.settings.buyingCharacterId,43);assert.equal(saved.lines[0].buyer.characterId,43);
 imports.saveSettings(AMARR,{...a.settings,characterId:43,buyingCharacterId:42});
 const reopened=openStore(dir);try{const next=createImports(reopened,auth,{now:()=>NOW}),plan=next.getPlan(AMARR,saved.id);assert.equal(plan.buyer.characterId,43);assert.equal(plan.feeProfile.characterId,42);assert.equal(next.state(AMARR).buyer.characterId,42);assert.equal(next.state(AMARR).fees.characterId,43);
  const old={...plan};delete old.buyer;delete old.feeProfile;delete old.settings.buyingCharacterId;old.lines=old.lines.map(({buyer,...line})=>line);reopened.db.prepare('UPDATE market_import_plans SET body=? WHERE id=?').run(JSON.stringify(old),old.id);const legacy=next.getPlan(AMARR,old.id);assert.equal(legacy.buyer,undefined);assert.equal(legacy.lines[0].feeProfile.characterName,'Main trader');assert.deepEqual(legacy.totals,saved.totals);
 }finally{reopened.close();}
});
test('trader refresh covers the buyer once without requesting buyer skills or standings',async t=>{
 const {store,imports}=await desk(t),calls=[];imports.saveSettings(AMARR,{...imports.state(AMARR).settings,buyingCharacterId:43});
 const service=createImports(store,auth,{now:()=>NOW,request(){throw new Error('Owner is already cached.');},refreshCharacter:async(id,keys)=>calls.push({id,keys})});
 await service.refresh(AMARR);assert.deepEqual(calls,[{id:42,keys:['skills','standings','orders']},{id:43,keys:['orders']}]);
 calls.length=0;service.saveSettings(AMARR,{...service.state(AMARR).settings,buyingCharacterId:0});await service.refresh(AMARR);assert.equal(calls.filter(c=>c.id===42).length,1);assert.equal(calls.length,2);
});
test('overlapping trader refreshes preserve each destination and selling character',async t=>{
 const {store}=await desk(t),calls=[],requests=[];let release;
 const gate=new Promise(resolve=>{release=resolve;});
 const service=createImports(store,auth,{now:()=>NOW,request:async path=>{requests.push(path);return {data:{owner:1000035}};},refreshCharacter:async(id,keys)=>{calls.push({id,keys});await gate;}});
 service.saveSettings(JITA,{...DEFAULT_IMPORT_SETTINGS,characterId:43});
 const amarr=service.refresh(AMARR),jita=service.refresh(JITA);release();
 const [a,b]=await Promise.all([amarr,jita]);
 assert.equal(a.hub.id,AMARR);assert.equal(b.hub.id,JITA,'Each refresh must return its requested destination');
 assert.ok(requests.includes('/universe/stations/'+JITA),'The second destination resolves its own broker-fee owner');
 assert.ok(calls.some(c=>c.id===43&&c.keys.includes('skills')),'The second seller receives a fee-profile refresh');
 await service.close();
});
test('trader refresh coalesces the same context but refreshes a newly selected seller',async t=>{
 const {store}=await desk(t),calls=[];let release;const gate=new Promise(resolve=>{release=resolve;});
 const service=createImports(store,auth,{now:()=>NOW,refreshCharacter:async(id,keys)=>{calls.push({id,keys});await gate;}});
 const first=service.refresh(AMARR),duplicate=service.refresh(AMARR);
 assert.equal(calls.length,2,'An identical refresh shares the two existing character requests');
 service.saveSettings(AMARR,{...service.state(AMARR).settings,characterId:43});
 const changed=service.refresh(AMARR);release();await Promise.all([first,duplicate,changed]);
 assert.equal(calls.length,4);assert.equal(calls.filter(c=>c.id===43&&c.keys.includes('skills')).length,1);
 await service.close();
});
test('trader refresh failure permits retry and close drains every destination',async t=>{
 const {store}=await desk(t);let rejectOwner=true,releaseA,releaseB;
 const gateA=new Promise(resolve=>{releaseA=resolve;}),gateB=new Promise(resolve=>{releaseB=resolve;});
 const service=createImports(store,auth,{now:()=>NOW,request:async()=>{if(rejectOwner)throw new Error('Owner unavailable');return {data:{owner:1000035}};},refreshCharacter:async(id,keys)=>{if(keys.includes('skills'))await (id===42?gateA:gateB);}});
 service.saveSettings(JITA,{...DEFAULT_IMPORT_SETTINGS,characterId:43});
 await assert.rejects(service.refresh(JITA),/Owner unavailable/);rejectOwner=false;
 const a=service.refresh(AMARR),b=service.refresh(JITA);let closed=false;
 const closing=service.close().then(()=>{closed=true;});releaseA();await a;
 assert.equal(closed,false,'A second destination still owns pending refresh work');
 releaseB();const result=await b;await closing;assert.equal(result.hub.id,JITA);assert.equal(closed,true);
});
test('a pending plan save cannot recreate a plan deleted during its quote',async t=>{
 const {store,imports}=await desk(t);seedItem(store,1403);
 const item=(await imports.analyse(AMARR)).groups.flatMap(g=>g.items)[0],lines=[{typeId:item.typeId,...item.best.profiteering}];
 const saved=await imports.savePlan(AMARR,{name:'Original',lines});
 const updating=imports.savePlan(AMARR,{id:saved.id,name:'Pending revision',lines});
 imports.removePlan(AMARR,saved.id);
 await assert.rejects(updating,/Import plan not found/);
 assert.equal(imports.state(AMARR).plans.length,0,'Deletion remains durable after the pending save completes');
});
test('concurrent new plan saves enforce the destination limit at publication',async t=>{
 const {store,imports}=await desk(t);seedItem(store,1403);
 const item=(await imports.analyse(AMARR)).groups.flatMap(g=>g.items)[0],lines=[{typeId:item.typeId,...item.best.profiteering}];
 const saved=await imports.savePlan(AMARR,{name:'Seed',lines});
 const insert=store.db.prepare('INSERT INTO market_import_plans VALUES(?,?,?,?)');
 for(let i=1;i<99;i++)insert.run('plan-limit-'+i,AMARR,iso(NOW),JSON.stringify({...saved,id:'plan-limit-'+i}));
 const outcomes=await Promise.allSettled([imports.savePlan(AMARR,{name:'New A',lines}),imports.savePlan(AMARR,{name:'New B',lines})]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1,'Only the final free saved-plan slot can be filled');
 assert.match(outcomes.find(r=>r.status==='rejected')?.reason.message||'',/100 plans/);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM market_import_plans WHERE hub_id=?').get(AMARR).n,100);
});
test('EVE Ref decoder validates CRC/truncation and retains only the four core market regions',async()=>{const bytes=Buffer.from(fixture['2026-09-07'],'hex'),r=await decodeArchive(bytes,'2026-09-07');assert.equal(r.records,10);assert.equal(r.rows.length,8);assert.equal(new Set(r.rows.map(r=>r.region_id)).size,4);await assert.rejects(decodeArchive(bytes.subarray(0,bytes.length-8),'2026-09-07'));await assert.rejects(decodeArchive(bytes,'2026-09-06'),/Invalid history/);const corrupt=Buffer.from(bytes);corrupt[Math.floor(corrupt.length/2)]^=255;await assert.rejects(decodeArchive(corrupt,'2026-09-07'));});
test('EVE Ref bulk history imports changed days once, shares all four regions and resumes from disk',async t=>{const {store,dir}=await storage(t),calls=[];let total=10;const fetcher=async(url,options)=>{calls.push({url,options});if(url.endsWith('totals.json'))return new Response(JSON.stringify({'2026-09-06':total,'2026-09-07':10}));const d=url.match(/market-history-(\d{4}-\d{2}-\d{2})/)[1];return new Response(Buffer.from(fixture[d],'hex'));};const service=createHistoryArchive(store,{fetcher,now:()=>NOW,spacingMs:0});const status=await service.update();assert.equal(status.archiveDays,2);assert.equal(status.downloaded,2);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM market_history').get().n,8);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM market_history_days').get().n,16);assert.equal(store.db.prepare('SELECT source FROM market_history_meta LIMIT 1').get().source,'EVE Ref');await service.update();assert.equal(calls.length,3);const next=openStore(dir);await createHistoryArchive(next,{fetcher,now:()=>NOW,spacingMs:0}).update();next.close();assert.equal(calls.length,3);assert.ok(calls.every(c=>!Object.keys(c.options.headers).some(h=>/authorization|cookie/i.test(h))));total=11;store.db.prepare('DELETE FROM settings WHERE key=?').run('market:everef:manifest');await assert.rejects(service.update(),/incomplete/);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM market_history_days').get().n,16);});
test('archive cancellation and rate limits preserve old data and enforce cooldown',async t=>{const {store}=await storage(t);const limited=createHistoryArchive(store,{now:()=>NOW,spacingMs:0,fetcher:async()=>new Response('',{status:429,headers:{'Retry-After':'600'}})});await assert.rejects(limited.update(),/429/);await assert.rejects(limited.update(),/asked us to wait/);store.db.prepare('DELETE FROM settings WHERE key=?').run('market:everef:retry');let arrived;const seen=new Promise(r=>arrived=r);const cancelled=createHistoryArchive(store,{now:()=>NOW,spacingMs:0,fetcher:async(url,o)=>{arrived();return new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}));}});const task=cancelled.update();await seen;cancelled.cancel();await assert.rejects(task,/cancelled/);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM market_history_archives').get().n,0);});
test('only the four built-in hubs use EVE Ref; custom hubs retain the ESI history path',async t=>{const {store}=await storage(t),calls=[],historyCalls=[];store.set('market:quick',[587]);store.db.prepare('INSERT INTO market_types VALUES(?,?,?,?)').run(587,'Rifter',null,2500);const m=createMarkets(store,auth,{request:async(path)=>{historyCalls.push(path);return {data:history(),updatedAt:iso(NOW),expiresAt:iso(NOW+DAY),headers:{}};}},{now:()=>NOW,spacingMs:0,historyFetcher:async url=>{calls.push(url);return url.endsWith('totals.json')?new Response(JSON.stringify({'2026-09-07':10})):new Response(Buffer.from(fixture['2026-09-07'],'hex'));}});t.after(()=>m.close());for(const id of [JITA,AMARR,60011866,60005686]){m.start({hubId:id,mode:'history',compareJita:false});await m.idle();assert.equal(m.overview().job.status,'complete');}assert.equal(calls.length,2);assert.equal(historyCalls.length,0);store.db.prepare('INSERT INTO market_hubs(id,name,station_name,kind,system_id,system_name,region_id,region_name) VALUES(?,?,?,?,?,?,?,?)').run(60000001,'Custom','Custom','station',30000001,'System',10000099,'Region');m.start({hubId:60000001,mode:'history',typeId:587,compareJita:false});await m.idle();assert.equal(historyCalls.length,1);assert.ok(historyCalls[0].startsWith('/markets/10000099/history'));});
test('Jita comparisons use the lowest sell prices and update reminders wait a full day',async t=>{const {store}=await storage(t);let clock=NOW;const m=createMarkets(store,auth,{request(){throw new Error('Offline');}},{now:()=>clock});t.after(()=>m.close());seedItem(store,1403);store.db.prepare('UPDATE market_items SET sell_average=999999999 WHERE hub_id=?').run(JITA);store.db.prepare('UPDATE market_items SET sell_average=1 WHERE hub_id=?').run(AMARR);store.db.prepare('UPDATE market_hubs SET last_scan=? WHERE id=?').run(JSON.stringify({at:iso(NOW),observed:iso(NOW-300000),expires:iso(NOW-1),mode:'full'}),AMARR);const row=m.report(AMARR,{threshold:100}).rows[0];assert.equal(row.premium,200);assert.equal(m.report(AMARR,{threshold:100}).total,1);assert.equal(m.overview().hubs.find(h=>h.id===AMARR).updateSuggested,false);clock=NOW+DAY-1;assert.equal(m.overview().hubs.find(h=>h.id===AMARR).updateSuggested,false);clock++;assert.equal(m.overview().hubs.find(h=>h.id===AMARR).updateSuggested,true);});
test('upgrade invalidates legacy market responses once and queues fresh scans while preserving player data',async t=>{const {store,dir}=await storage(t),m=createMarkets(store,auth,{request(){throw new Error('offline');}},{now:()=>NOW});await m.close();seedItem(store,1403);store.db.prepare('UPDATE market_hubs SET enabled=0 WHERE id=?').run(JITA);store.db.prepare('UPDATE market_hubs SET last_scan=? WHERE id=?').run(JSON.stringify({at:iso(NOW),characterId:43,mode:'quick'}),AMARR);store.set('market:quick',[1403]);store.set('market:imports:'+AMARR,{...DEFAULT_IMPORT_SETTINGS,characterId:42,cargo:32100});store.db.prepare('INSERT INTO goals VALUES(?,?,?,?,?,?,?,?)').run('kept',42,'Keep goal',10,3,'manual',0,iso(NOW));for(const key of ['0:GET:/markets/10000043/orders?order_type=all&page=1:','43:GET:/markets/structures/1040000000001?page=1:','0:GET:/markets/10000043/history?type_id=1403:','esi-name:1403','42:GET:/characters/42/skills:'])store.db.prepare('INSERT INTO cache VALUES(?,?,?,?,?,?)').run(key,'[]',null,NOW+DAY,NOW,'{}');store.db.prepare("DELETE FROM migrations WHERE id='market-rebuild-v6'").run();
 const next=openStore(dir);try{assert.equal(next.db.prepare('SELECT COUNT(*) n FROM market_items').get().n,0);assert.equal(next.db.prepare('SELECT COUNT(*) n FROM market_history').get().n,0);assert.equal(next.db.prepare('SELECT COUNT(*) n FROM cache').get().n,2);assert.equal(next.db.prepare('SELECT progress FROM goals WHERE id=?').get('kept').progress,3);assert.equal(next.get('market:imports:'+AMARR).cargo,32100);assert.deepEqual(next.get('market:upgrade').queue.map(q=>q.hubId),[JITA,AMARR]);const calls=[];const refreshed=createMarkets(next,auth,{request:async path=>{calls.push(path);const at=iso(NOW);return {data:path.includes('/history?')?history():[{order_id:777,type_id:1403,location_id:path.includes('10000002')?JITA:AMARR,price:1000,volume_remain:50,is_buy_order:false,min_volume:1,issued:at,duration:90}],headers:{},updatedAt:at,expiresAt:iso(NOW+300000)};}},{now:()=>NOW,spacingMs:0,historySource:'esi'});try{assert.throws(()=>refreshed.start({hubId:JITA,mode:'quick',internalReference:true}),/Restore/);refreshed.resumeUpgrade();await refreshed.idle();refreshed.resumeUpgrade();await refreshed.idle();assert.equal(next.get('market:upgrade').queue.length,0);assert.equal(next.db.prepare('SELECT enabled FROM market_hubs WHERE id=?').get(JITA).enabled,0);assert.ok(!refreshed.overview().hubs.some(h=>h.id===JITA));assert.equal(refreshed.browse(AMARR).rows[0].sell,1000);assert.ok(calls.filter(p=>p.includes('/orders')).length>=2);const again=openStore(dir);assert.equal(again.db.prepare('SELECT COUNT(*) n FROM market_items').get().n,2);again.close();}finally{await refreshed.close();}}finally{next.close();}});
test('upgrade refresh explains missing structure access without exposing or silently dropping the pending hub',async t=>{const {store}=await storage(t),m=createMarkets(store,{characters:()=>[]},{request(){throw new Error('Must not request unauthorized structure data');}},{now:()=>NOW});t.after(()=>m.close());const id=1040000000001;store.db.prepare('INSERT INTO market_hubs(id,name,station_name,kind,system_id,system_name,region_id,region_name) VALUES(?,?,?,?,?,?,?,?)').run(id,'Staging','Fortizar','structure',30000001,'Home',10000099,'Region');store.set('market:upgrade',{queue:[{hubId:id,mode:'full',characterId:99}],total:1,completed:0,paused:false});const status=m.resumeUpgrade();assert.equal(status.upgrade.queue.length,1);assert.match(status.upgrade.detail,/connected alt/);assert.equal(status.job,null);});
test('import endpoints and saved plans require private sessions and CSRF and never appear on the OBS service',async t=>{const {dir}=await storage(t);const app=await startKairo({port:18460,streamPort:18461,dataDir:dir,noSync:true,fetcher:async()=>new Response('[]')});t.after(()=>app.close());for(const path of ['/api/markets/imports?hub='+AMARR,'/api/markets/imports/analyse?hub='+AMARR,'/api/markets/imports/plans?hub='+AMARR+'&id=missing']){assert.equal((await fetch(app.origin+path)).status,401);assert.equal((await fetch(app.streamOrigin+path)).status,404);}const page=await fetch(app.origin+'/'),cookie=page.headers.get('set-cookie').split(';')[0],boot=await(await fetch(app.origin+'/api/bootstrap',{headers:{cookie}})).json();assert.equal((await fetch(app.origin+'/api/markets/imports?hub='+AMARR,{headers:{cookie}})).status,200);const input=JSON.stringify({hubId:AMARR,settings:DEFAULT_IMPORT_SETTINGS});assert.equal((await fetch(app.origin+'/api/markets/imports/settings',{method:'PUT',headers:{cookie,'Content-Type':'application/json'},body:input})).status,403);const valid=await fetch(app.origin+'/api/markets/imports/settings',{method:'PUT',headers:{cookie,origin:app.origin,'X-Kairo-CSRF':boot.csrf,'Content-Type':'application/json'},body:input});assert.equal(valid.status,200);assert.equal((await valid.json()).settings.cargo,10000);assert.equal((await fetch(app.streamOrigin+'/api/markets/upgrade',{method:'POST'})).status,405);});

test('import cache ignores unrelated writes but follows books, profiles, plans and access changes',async t=>{
 const {store,imports}=await desk(t);seedItem(store,1403);
 const first=await imports.analyse(AMARR);
 store.set('ui:theme','mint');store.saveSnapshot(42,'assets',{status:'ready',data:[]});
 assert.strictEqual(await imports.analyse(AMARR),first);
 store.db.prepare('UPDATE market_orders SET price=? WHERE hub_id=?').run(1200000,JITA);
 const changed=await imports.analyse(AMARR);assert.notStrictEqual(changed,first);assert.equal(changed.groups.flatMap(g=>g.items)[0].jita,1200000);
 const orders=store.snapshot(43,'orders');store.saveSnapshot(43,'orders',{...orders,data:[{order_id:1403,type_id:1403,location_id:JITA,is_buy_order:false,volume_remain:1,issued:iso(NOW),duration:90}]});
 assert.equal((await imports.analyse(AMARR)).groups.flatMap(g=>g.items).length,0);
 store.saveSnapshot(43,'orders',orders);
 const restored=await imports.analyse(AMARR),item=restored.groups.flatMap(g=>g.items)[0];
 const plan=await imports.savePlan(AMARR,{name:'Cache freshness',lines:[{typeId:item.typeId,...item.best.profiteering}]});
 assert.equal((await imports.analyse(AMARR)).plans[0].id,plan.id);
 imports.removePlan(AMARR,plan.id);assert.equal((await imports.analyse(AMARR)).plans.length,0);
 store.set('module:training',false);assert.equal((await imports.analyse(AMARR)).fees.ready,false);
 store.set('module:training',true);assert.equal((await imports.analyse(AMARR)).fees.ready,true);
 let connected=chars;const service=createImports(store,{characters:()=>connected},{now:()=>NOW});
 await service.analyse(AMARR);connected=chars.map(c=>c.id===42?{...c,needsReauth:true}:c);
 assert.equal((await service.analyse(AMARR)).buyer.ready,false);
});

test('import revisions cannot reuse rolled-back data and observe other database connections',async t=>{
 const {store,dir,imports}=await desk(t);seedItem(store,1403);await imports.analyse(AMARR);
 store.db.exec('BEGIN');store.db.prepare('UPDATE market_orders SET price=? WHERE hub_id=?').run(1100000,JITA);
 assert.equal((await imports.analyse(AMARR)).groups.flatMap(g=>g.items)[0].jita,1100000);
 store.db.exec('ROLLBACK');store.db.prepare('UPDATE market_orders SET price=? WHERE hub_id=?').run(1250000,JITA);
 assert.equal((await imports.analyse(AMARR)).groups.flatMap(g=>g.items)[0].jita,1250000);
 const other=openStore(dir);try{other.db.prepare('UPDATE market_orders SET price=? WHERE hub_id=?').run(1300000,JITA);}finally{other.close();}
 assert.equal((await imports.analyse(AMARR)).groups.flatMap(g=>g.items)[0].jita,1300000);
});

test('import cache expires at freshness and order deadlines before its thirty-second ceiling',async t=>{
 const {store}=await desk(t);seedItem(store,1403);let clock=NOW;
 const sample=store.snapshot(42,'skills');store.saveSnapshot(42,'skills',{...sample,expiresAt:iso(NOW+500)});
 store.db.prepare('UPDATE market_orders SET issued=?,duration=1 WHERE hub_id=?').run(iso(NOW-DAY+1000),JITA);
 const service=createImports(store,auth,{now:()=>clock});
 assert.equal((await service.analyse(AMARR)).fees.stale,false);
 clock+=500;assert.equal((await service.analyse(AMARR)).fees.stale,true);
 clock+=500;assert.equal((await service.analyse(AMARR)).groups.flatMap(g=>g.items).length,0);
});

test('import single-flight retries when a book changes during a yielded calculation',async t=>{
 const {store,imports}=await desk(t),catalog=JSON.parse(readFileSync(new URL('../../server/data/market-categories.json',import.meta.url),'utf8')),index=createMarketCategories();
 const ids=[...new Set(catalog.groups.flatMap(g=>g.types))].filter(id=>index.type(id).root===9&&index.type(id).volume>0&&index.type(id).volume<=100).slice(0,120);
 assert.equal(ids.length,120);for(const id of ids)seedItem(store,id);
 const pending=imports.analyse(AMARR),second=imports.analyse(AMARR);
 store.db.prepare('UPDATE market_orders SET price=? WHERE hub_id=?').run(1300000,JITA);
 const [a,b]=await Promise.all([pending,second]);assert.strictEqual(a,b);
 assert.ok(a.groups.flatMap(g=>g.items).length>0);assert.ok(a.groups.flatMap(g=>g.items).every(item=>item.jita===1300000));
});
