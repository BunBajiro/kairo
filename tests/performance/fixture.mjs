// Synthetic workload only. Never opens an installed user's Kairo directory.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {openStore} from '../../server/store.mjs';
import {catalog, allScopes} from '../../server/modules/catalog.mjs';
import {createMarkets, JITA} from '../../server/markets.mjs';
import {DEFAULT_IMPORT_SETTINGS} from '../../server/import-math.mjs';

export const FIXTURE_VERSION = 1;
export const PILOT = 42, ALLIANCE = 77, DESTINATION = 60008494;
export const profiles = {
  typical: {characters:1, assets:2000, events:10000, visits:300, combat:600, sessions:50, marketTypes:1000},
  stress: {characters:4, assets:20000, events:50000, visits:2000, combat:4000, sessions:200, marketTypes:5000},
};
export function workload(profile) {
  if (!profiles[profile]) throw new Error('Profile must be typical or stress.');
  const definition = {version:FIXTURE_VERSION, profile, ...profiles[profile]};
  return {...definition, fingerprint:createHash('sha256').update(JSON.stringify(definition)).digest('hex')};
}
const iso = n => new Date(n).toISOString(), DAY = 86400000;
export async function seedFixture(dir, profile='typical', now=Date.now()) {
  const spec = workload(profile), store = openStore(dir), db = store.db;
  const characters = Array.from({length:spec.characters}, (_,i) => ({id:PILOT+i,name:'Benchmark pilot '+(i+1),scopes:allScopes}));
  const fail = async () => {throw new Error('Fixture seeding must not request EVE data.');};
  const markets = createMarkets(store, {characters:()=>characters}, {request:fail}, {autoUpgrade:false});
  const taxonomy = JSON.parse(readFileSync(new URL('../../server/data/market-categories.json',import.meta.url)));
  const ids = [...new Set(taxonomy.groups.flatMap(g=>g.types))].filter(id=>taxonomy.volumes[id]>0 && taxonomy.volumes[id]<=10000).sort((a,b)=>a-b).slice(0,spec.marketTypes);
  if(ids.length!==spec.marketTypes) throw new Error('Not enough real taxonomy IDs for the synthetic market workload.');
  const names = Object.fromEntries(ids.map(id=>[id,'Benchmark item '+id]));
  const sample = data => ({status:'ready',data,updatedAt:iso(now),expiresAt:iso(now+7*DAY),refreshAt:iso(now+7*DAY)});
  const epoch=now-2*DAY, end=epoch+6*3600000;
  db.exec('BEGIN');
  try {
    const putCharacter=db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)');
    for(const c of characters) {
      putCharacter.run(c.id,c.name,JSON.stringify(c.scopes),'synthetic-not-a-token');
      for(const m of catalog) for(const d of m.datasets) store.saveSnapshot(m.id==='universe'?0:c.id,d.key,sample([]));
      store.saveSnapshot(c.id,'profile',sample({name:c.name,character_id:c.id,corporation_id:88,alliance_id:ALLIANCE,corporation:{name:'Benchmark corporation'},alliance:{name:'Benchmark alliance'}}));
      for(const [key,ownerId] of [['corporation_contacts',88],['alliance_contacts',ALLIANCE]]) store.saveSnapshot(c.id,key,{...sample([]),ownerId});
      store.saveSnapshot(c.id,'location',sample({solar_system_id:30000001,system:{name:'Benchmark system 0',security_status:-.3},constellation:{name:'Benchmark constellation'},region:{name:'Benchmark region'}}));
      store.saveSnapshot(c.id,'ship',sample({ship_type_id:609,ship_id:1234,ship_name:'Benchmark Maulus'}));
      store.saveSnapshot(c.id,'wallet',sample(5e9));
      store.saveSnapshot(c.id,'skills',sample({total_sp:25000000,skills:[16622,3446,16597].map(skill_id=>({skill_id,active_skill_level:5,trained_skill_level:5}))}));
      store.saveSnapshot(c.id,'online',sample({online:true}));
      store.saveSnapshot(c.id,'clones',sample({jump_clones:[],home_location:{location_id:DESTINATION}}));
      store.saveSnapshot(c.id,'assets',sample(Array.from({length:spec.assets},(_,i)=>({item_id:100000+i, type_id:ids[i%ids.length],quantity:1+i%100,location_id:DESTINATION,root_location_id:DESTINATION,location_name:'Benchmark hangar',is_singleton:false}))));
      store.saveSnapshot(c.id,'journal',sample(Array.from({length:1000},(_,i)=>({id:i,date:iso(now-i*60000),amount:i%2?1e6:-1e5,balance:5e9+i*1000,ref_type:'bounty_prizes',description:'Synthetic wallet entry'}))));
      store.saveSnapshot(c.id,'combat_public',{...sample(null),retryAt:iso(now+7*DAY)});
    }
    for(let i=0;i<100;i++) {
      names[30000001+i]='Benchmark system '+i;
      db.prepare('INSERT INTO universe_systems(system_id,name,region_id,region_name,security,x,y,z) VALUES(?,?,?,?,?,?,?,?)').run(30000001+i,names[30000001+i],10000043,'Benchmark region',-.3,Math.sin(i)*1e17,Math.cos(i)*1e17,i*1e15);
    }
    store.set('names',names);
    const context={capturedAt:iso(epoch),system:{id:30000001,name:names[30000001]},shipTypeId:609,ship:{id:1234},alliance:{id:ALLIANCE,name:'Benchmark alliance'},wallet:{value:5e9,sampledAt:iso(epoch)},skillpoints:25000000,coverage:{profile:'ready'}};
    const putSession=db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)');
    putSession.run('benchmark-session',PILOT,'Benchmark populated session',iso(epoch),iso(end),JSON.stringify(context),JSON.stringify({...context,capturedAt:iso(end),wallet:{value:5.1e9,sampledAt:iso(end)}}));
    for(let i=1;i<spec.sessions;i++) putSession.run('older-'+i,PILOT,'Benchmark archive '+i,iso(epoch-i*DAY),iso(epoch-i*DAY+3600000),'{}','{}');
    const event=db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)');
    for(let i=0;i<spec.events;i++) event.run(PILOT,i%5?'session.note':'wallet.entry','journey','Benchmark activity '+i,JSON.stringify(i%5?{}:{amount:1000}),iso(epoch+1000+i*(end-epoch-2000)/spec.events));
    const visit=db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)');
    for(let i=0;i<spec.visits;i++) visit.run(PILOT,30000001+i%100,names[30000001+i%100],iso(epoch+i*(end-epoch)/spec.visits));
    const combat=db.prepare('INSERT INTO combat_records VALUES(?,?,?,?,?,?)'), alliance=db.prepare('INSERT INTO alliance_combat_records VALUES(?,?,?,?,?)');
    for(let i=0;i<spec.combat;i++) {
      const at=iso(epoch+1000+i*(end-epoch-2000)/spec.combat),system=30000001+Math.floor((Date.parse(at)-epoch)*spec.visits/(end-epoch))%100;
      const loss=i%5===0;
      const k={killmail_id:1000000+i,killmail_time:at,solar_system_id:system,result:loss?'loss':'kill',victim:{character_id:loss?PILOT:99,alliance_id:loss?ALLIANCE:99,ship_type_id:609},attackers:[{character_id:loss?99:PILOT,alliance_id:loss?99:ALLIANCE,damage_done:500}],zkb:{totalValue:1000000+i*100}};
      combat.run(PILOT,k.killmail_id,k.result,at,JSON.stringify(k),'synthetic');alliance.run(ALLIANCE,k.killmail_id,system,at,JSON.stringify(k));
    }
    const history=JSON.stringify(Array.from({length:30},(_,i)=>({date:iso(now-(i+1)*DAY).slice(0,10),average:1800000,lowest:1500000,highest:2100000,volume:100000,order_count:200})));
    const type=db.prepare('INSERT INTO market_types(type_id,name) VALUES(?,?)'), item=db.prepare('INSERT INTO market_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'), order=db.prepare('INSERT INTO market_orders VALUES(?,?,?,?,?,?,?,?,?,?)');
    const hist=db.prepare('INSERT INTO market_history VALUES(?,?,?,?,?,?,?,?,?,?)');
    for(const id of ids) {
      type.run(id,names[id]);
      for(const [hub,price,quantity] of [[JITA,1000000,10000],[DESTINATION,3000000,5]]) {
        item.run(hub,id,500000,price,price,quantity,0,1,0,iso(now),iso(now+DAY),'synthetic');
        order.run(hub,id,id,0,price,quantity,1,'station',iso(now-DAY),90);
      }
      hist.run(10000043,id,history,iso(now),iso(now+DAY),100000,1800000,30,iso(now-30*DAY).slice(0,10),iso(now-DAY).slice(0,10));
    }
    const scan=JSON.stringify({at:iso(now),observed:iso(now),expires:iso(now+DAY),mode:'full',items:ids.length});
    db.prepare('UPDATE market_hubs SET last_scan=?,last_full_scan=? WHERE id IN (?,?)').run(scan,scan,JITA,DESTINATION);
    store.set('market:quick',ids.slice(0,20));
    store.set('market:owner:'+DESTINATION,{corporationId:1000084,corporationName:'Synthetic owner',factionId:500003,expires:now+DAY});
    store.set('market:imports:'+DESTINATION,{...DEFAULT_IMPORT_SETTINGS,characterId:PILOT,minProfit:0,cargo:10000});
    db.exec('COMMIT');
  } catch(e) {db.exec('ROLLBACK');throw e;} finally {await markets.close();store.close();}
  return {...spec,now};
}
