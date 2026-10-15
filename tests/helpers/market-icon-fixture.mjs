// Shared synthetic cache for the compiled market icon browser regressions.
import {openStore} from '../../server/store.mjs';
import {allScopes} from '../../server/modules/catalog.mjs';
import {createMarkets,JITA} from '../../server/markets.mjs';
import {saveHistory,DAY} from '../../server/market-history.mjs';
import {DEFAULT_IMPORT_SETTINGS} from '../../server/import-math.mjs';
const iso=n=>new Date(n).toISOString(),AMARR=60008494;
const items=[{id:1403,name:'Domination Large Armor Repairer with an extended market item name'},{id:519,name:'Compact Warp Scrambler with a deliberately long item label'}];
export async function seedMarketIcons(dataDir,{now,denyNetwork}){
 const store=openStore(dataDir);let markets;
 try{
  store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42,'Icon review trader',JSON.stringify(allScopes),'synthetic-test-token');
  markets=createMarkets(store,{characters:()=>[{id:42,name:'Icon review trader',scopes:allScopes}]},{request:denyNetwork},{now:()=>now,historySource:'esi'});
  const sample=data=>({status:'ready',updatedAt:iso(now),expiresAt:iso(now+DAY),data});
  store.saveSnapshot(42,'skills',sample({skills:[{skill_id:16622,active_skill_level:5,trained_skill_level:5},{skill_id:3446,active_skill_level:5,trained_skill_level:5},{skill_id:16597,active_skill_level:5,trained_skill_level:5}]}));
  store.saveSnapshot(42,'standings',sample([{from_id:1000084,from_type:'npc_corp',standing:5},{from_id:500003,from_type:'faction',standing:4}]));
  store.saveSnapshot(42,'orders',sample([]));
  store.set('market:owner:'+AMARR,{corporationId:1000084,corporationName:'Amarr Navy',factionId:500003,expires:now+DAY});
  store.set('market:imports:'+AMARR,{...DEFAULT_IMPORT_SETTINGS,characterId:42,minProfit:0});
  for(const {id,name} of items){
   store.db.prepare('INSERT INTO market_types(type_id,name) VALUES(?,?)').run(id,name);
   for(const [hub,price,quantity] of [[JITA,1000000,100],[AMARR,3000000,5]]){
    store.db.prepare('INSERT INTO market_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(hub,id,500000,price,price,quantity,0,1,0,iso(now),iso(now+DAY),'icon-fixture');
    store.db.prepare('INSERT INTO market_orders VALUES(?,?,?,?,?,?,?,?,?,?)').run(hub,id,id,0,price,quantity,1,'station',iso(now-DAY),90);
    store.db.prepare('UPDATE market_hubs SET last_scan=? WHERE id=?').run(JSON.stringify({at:iso(now),observed:iso(now),mode:'full',jobId:'icon-fixture'}),hub);
   }
   saveHistory(store,10000043,id,Array.from({length:30},(_,i)=>({date:iso(now-(i+1)*DAY).slice(0,10),average:1800000,lowest:1400000,highest:2200000,volume:500,order_count:20})),iso(now),iso(now+DAY),'ESI',now);
  }
 }finally{await markets?.close();store.close();}
}
