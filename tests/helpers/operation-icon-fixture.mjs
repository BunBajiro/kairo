import {openStore} from '../../server/store.mjs';
import {allScopes} from '../../server/modules/catalog.mjs';

// Persist the pre-fix provider representation: no iconVariant is seeded. The
// actual Core HTTP projection must supply it to the compiled operation tables.
export function seedOperationIcons(dataDir, now) {
 const store=openStore(dataDir),at=new Date(now).toISOString(),future=new Date(now+3600000).toISOString();
 try {
  store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42,'Operation icon pilot',JSON.stringify(allScopes),'synthetic-test-token');
  store.set('names',{27917:'Electron Bomb Blueprint',1403:'Inertial Stabilizers I',1:'Unavailable legacy type',60003760:'Jita station'});
  const sample=data=>({status:'ready',updatedAt:at,expiresAt:future,refreshAt:future,data});
  const ids=[27917,1403,1];
  store.saveSnapshot(42,'assets',sample(ids.map((type_id,i)=>({item_id:100+i,type_id,quantity:i+1,location_id:60003760,location_flag:'Hangar',location_type:'station',is_singleton:false,...(i===0?{is_blueprint_copy:true}:{})}))));
  store.saveSnapshot(42,'wallet',sample(5000000));store.saveSnapshot(42,'journal',sample([]));
  store.saveSnapshot(42,'transactions',sample(ids.map((type_id,i)=>({transaction_id:200+i,type_id,quantity:i+1,date:at,unit_price:100000,client_id:90000001,location_id:60003760,is_buy:i===0,is_personal:true,journal_ref_id:300+i}))));
  store.saveSnapshot(42,'orders',sample(ids.map((type_id,i)=>({order_id:400+i,type_id,volume_remain:i+1,volume_total:10,price:100000,location_id:60003760,is_buy_order:false,issued:at,duration:90,range:'station',min_volume:1,region_id:10000002}))));
  store.saveSnapshot(42,'jobs',sample(ids.map((type_id,i)=>({job_id:500+i,activity_id:i===0?4:1,blueprint_type_id:27917,...(i?{product_type_id:type_id}:{}),status:'active',runs:i+1,start_date:at,end_date:future,cost:10000,blueprint_id:100,blueprint_location_id:60003760,output_location_id:60003760,station_id:60003760,facility_id:60003760,installer_id:42,licensed_runs:10,successful_runs:0}))));
  store.saveSnapshot(0,'prices',sample([{type_id:1403,average_price:100000}]));
 } finally {store.close();}
}
