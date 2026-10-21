import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createMarkets, JITA} from '../../server/markets.mjs';
import {DEFAULT_IMPORT_SETTINGS} from '../../server/import-math.mjs';
import {createMarketCategories} from '../../server/market-categories.mjs';
import {saveHistory, DAY} from '../../server/market-history.mjs';
import {allScopes} from '../../server/modules/catalog.mjs';

const NOW=Date.parse('2026-10-21T12:00:00Z'), AMARR=60008494, TYPE=1403;
const iso=n=>new Date(n).toISOString();
const history=()=>Array.from({length:30},(_,i)=>({date:iso(NOW-(i+1)*DAY).slice(0,10),average:1800000,volume:500}));
const reply=data=>({data,headers:{'x-pages':'1'},updatedAt:iso(NOW),expiresAt:iso(NOW+300000)});
const order=(type=TYPE)=>({order_id:type,type_id:type,location_id:JITA,is_buy_order:false,price:1000000,volume_remain:100,min_volume:1,range:'station',issued:iso(NOW-DAY),duration:90});
const recipe=item=>({typeId:item.typeId,strategy:'profiteering',...item.best.profiteering});
async function desk(t){
 const dir=await mkdtemp(join(tmpdir(),'kairo-market-import-edge-')),store=openStore(dir),calls=[];
 const pilots=[{id:42,name:'Trader',scopes:allScopes}];let roster=pilots,handler=()=>reply([]);
 const m=createMarkets(store,{characters:()=>roster},{request:async(path,options)=>{calls.push(path);return handler(path,options);}},{now:()=>NOW,spacingMs:0,historySource:'esi',retryWait:async()=>{}});
 store.set('market:quick',[TYPE]);
 const sample=data=>({status:'ready',updatedAt:iso(NOW),expiresAt:iso(NOW+DAY),data});
 store.saveSnapshot(42,'skills',sample({skills:[16622,3446,16597].map(skill_id=>({skill_id,active_skill_level:5}))}));
 store.saveSnapshot(42,'standings',sample([]));store.saveSnapshot(42,'orders',sample([]));
 store.set('market:owner:'+AMARR,{corporationId:1000084,corporationName:'Amarr Navy',factionId:500003,expires:NOW+DAY});
 m.imports.saveSettings(AMARR,{...DEFAULT_IMPORT_SETTINGS,characterId:42,minProfit:0});
 const seed=(type=TYPE)=>{
  store.db.prepare('INSERT OR IGNORE INTO market_types(type_id,name) VALUES(?,?)').run(type,'Item '+type);
  for(const [hub,price,quantity] of [[JITA,1000000,100],[AMARR,3000000,5]]){
   store.db.prepare('INSERT INTO market_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(hub,type,500000,price,price,quantity,0,1,0,iso(NOW),iso(NOW+300000),'seed');
   store.db.prepare('INSERT INTO market_orders VALUES(?,?,?,?,?,?,?,?,?,?)').run(hub,type,type,0,price,quantity,1,'station',iso(NOW-DAY),90);
  }
  saveHistory(store,10000043,type,history(),iso(NOW),iso(NOW+DAY),'ESI',NOW);
 };
 const scan=async(input={})=>{m.start({hubId:JITA,mode:'full',compareJita:false,...input});await m.idle();return m.overview().job;};
 const bytes=id=>store.db.prepare('SELECT body FROM market_import_plans WHERE id=?').get(id)?.body;
 t.after(async()=>{try{await m.close();}finally{store.close();await rm(dir,{recursive:true,force:true});}});
 return {store,m,calls,seed,scan,bytes,setHandler:next=>handler=next,setRoster:next=>roster=next,pilots};
}

test('an empty completed full book removes import stock but retains historical plan bytes',async t=>{
 const f=await desk(t);f.seed();
 const item=(await f.m.imports.analyse(AMARR)).groups.flatMap(g=>g.items)[0];assert.ok(item);
 const saved=await f.m.imports.savePlan(AMARR,{name:'Historical plan',lines:[recipe(item)]}),before=f.bytes(saved.id);
 assert.equal((await f.scan()).status,'complete');
 const view=f.m.detail(JITA,TYPE);assert.equal(view.item.sell,null);assert.equal(view.orders.length,0);
 assert.equal((await f.m.imports.analyse(AMARR)).groups.flatMap(g=>g.items).length,0);
 assert.equal(f.bytes(saved.id),before);
 assert.equal(f.calls.filter(path=>path.includes('/orders?')).length,1);
 assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM market_stage').get().n,0);
});

test('cancellation while resolving new order names retains the previous book and permits a healthy retry',async t=>{
 const f=await desk(t);f.seed();const old=JSON.stringify(f.m.browse(JITA));
 let release,arrived;const held=new Promise(resolve=>release=resolve),seen=new Promise(resolve=>arrived=resolve);
 let pending=true;f.setHandler(async(path,options)=>{
  if(path.includes('/orders?'))return reply([order(999999)]);
  if(path==='/universe/names'){if(pending){arrived();await held;}return reply(options.body.map(id=>({id,name:'New item',category:'inventory_type'})));}
  return reply([]);
 });
 const work=f.scan();await seen;assert.equal(JSON.stringify(f.m.browse(JITA)),old);f.m.cancel();release();
 assert.equal((await work).status,'cancelled');assert.equal(JSON.stringify(f.m.browse(JITA)),old);
 assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM market_stage').get().n,0);
 pending=false;assert.equal((await f.scan()).status,'complete');assert.equal(f.m.detail(JITA,999999).orders.length,1);
 assert.equal(f.calls.filter(path=>path.includes('/orders?')).length,2);
});

test('a disconnect during yielded import quoting cannot overwrite an existing saved plan, and reconnect permits explicit retry',async t=>{
 const f=await desk(t);f.seed();const first=(await f.m.imports.analyse(AMARR)).groups.flatMap(g=>g.items)[0];
 const line=recipe(first),saved=await f.m.imports.savePlan(AMARR,{name:'Original',lines:[line]}),before=f.bytes(saved.id);
 const catalog=JSON.parse(readFileSync(new URL('../../server/data/market-categories.json',import.meta.url),'utf8')),taxonomy=createMarketCategories();
 const ids=[...new Set(catalog.groups.flatMap(g=>g.types))].filter(id=>id!==TYPE&&taxonomy.type(id).root===9&&taxonomy.type(id).volume>0&&taxonomy.type(id).volume<=100).slice(0,120);
 assert.equal(ids.length,120);for(const id of ids)f.seed(id);
 const pending=f.m.imports.savePlan(AMARR,{id:saved.id,name:'Interrupted',lines:[line]});f.setRoster([]);
 await assert.rejects(pending,/no longer qualifies/);assert.equal(f.bytes(saved.id),before);
 f.setRoster(f.pilots);const retry=await f.m.imports.savePlan(AMARR,{id:saved.id,name:'Recovered',lines:[line]});
 assert.equal(retry.id,saved.id);assert.equal(retry.name,'Recovered');assert.equal(f.calls.length,0);
});

test('a saved-plan database write failure preserves the existing quote and does not poison explicit retry',async t=>{
 const f=await desk(t);f.seed();const first=(await f.m.imports.analyse(AMARR)).groups.flatMap(g=>g.items)[0],line=recipe(first);
 const saved=await f.m.imports.savePlan(AMARR,{name:'Original',lines:[line]}),before=f.bytes(saved.id);
 f.store.db.exec("CREATE TEMP TRIGGER reject_plan_update BEFORE UPDATE ON market_import_plans BEGIN SELECT RAISE(ABORT,'edge probe write failure'); END");
 await assert.rejects(f.m.imports.savePlan(AMARR,{id:saved.id,name:'Rejected',lines:[line]}),/edge probe write failure/);
 assert.equal(f.bytes(saved.id),before);assert.equal(f.m.imports.getPlan(AMARR,saved.id).name,'Original');
 f.store.db.exec('DROP TRIGGER reject_plan_update');
 const retry=await f.m.imports.savePlan(AMARR,{id:saved.id,name:'Recovered',lines:[line]});
 assert.equal(retry.id,saved.id);assert.equal(f.m.imports.state(AMARR).plans.length,1);assert.equal(f.calls.length,0);
});
