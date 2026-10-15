// Extends the existing ordinary-item cache without changing its two-item tests.
import {openStore} from '../../server/store.mjs';
import {saveHistory,DAY} from '../../server/market-history.mjs';
import {seedMarketIcons} from './market-icon-fixture.mjs';
export const BLUEPRINT_ITEMS=[{id:27917,name:'Electron Bomb Blueprint'},{id:27925,name:'Shrapnel Bomb Blueprint'},{id:2204,name:'Acolyte I Blueprint'}];
export async function seedMarketBlueprints(dataDir,options){
 await seedMarketIcons(dataDir,options);
 const store=openStore(dataDir),{now}=options,iso=n=>new Date(n).toISOString();
 try{for(const {id,name} of BLUEPRINT_ITEMS){
  store.db.prepare('INSERT INTO market_types(type_id,name) VALUES(?,?)').run(id,name);
  for(const [hub,price,quantity] of [[60003760,1000000,100],[60008494,3000000,5]]){
   store.db.prepare('INSERT INTO market_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(hub,id,500000,price,price,quantity,0,1,0,iso(now),iso(now+DAY),'blueprint-fixture');
   store.db.prepare('INSERT INTO market_orders VALUES(?,?,?,?,?,?,?,?,?,?)').run(hub,id,id,0,price,quantity,1,'station',iso(now-DAY),90);
  }
  saveHistory(store,10000043,id,Array.from({length:30},(_,i)=>({date:iso(now-(i+1)*DAY).slice(0,10),average:1800000,lowest:1400000,highest:2200000,volume:500,order_count:20})),iso(now),iso(now+DAY),'ESI',now);
 }}finally{store.close();}
}
