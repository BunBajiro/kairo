import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createMarketCategories} from './market-categories.mjs';
import {DAY} from './market-history.mjs';
import {importRevision} from './import-cache.mjs';
import {IMPORT_CATEGORIES,DEFAULT_IMPORT_SETTINGS,validateImportSettings,tradingRates,importCategory,buildOpportunity,scenario,packCargo,marketPrice} from './import-math.mjs';
const owners=JSON.parse(readFileSync(new URL('./data/npc-market-owners.json',import.meta.url),'utf8')).corporations;
const taxonomy=createMarketCategories(),JITA=60003760,iso=n=>new Date(n).toISOString();
const privateKeys={skills:['training','esi-skills.read_skills.v1'],standings:['combat','esi-characters.read_standings.v1'],orders:['wallet','esi-markets.read_character_orders.v1']};
export function createImports(store,auth,{now=()=>Date.now(),request,refreshCharacter}={}){
 const db=store.db;let memo=null,flight=null,refreshFlight=null;
 const revision=importRevision(db);
 const cacheKey=id=>JSON.stringify([id,revision(),auth.characters().map(c=>[c.id,c.name,!!c.needsReauth,c.scopes])]);
 const hub=id=>{const h=db.prepare('SELECT * FROM market_hubs WHERE id=?').get(Number(id));if(!h)throw new Error('Choose a saved trade hub.');return h;};
 const settings=id=>({...DEFAULT_IMPORT_SETTINGS,characterId:auth.characters()[0]?.id||0,...store.get('market:imports:'+id,{})});
 function snapshot(c,key){const [module,scope]=privateKeys[key];if(!c||c.needsReauth||!c.scopes.includes(scope)||!store.get('module:'+module,true))return null;return store.snapshot(c.id,key);}
 function fresh(s){return s?.status==='ready'&&Date.parse(s.refreshAt||s.expiresAt)>now();}
 function state(id){const h=hub(id),s=settings(h.id),c=auth.characters().find(c=>c.id===s.characterId),skills=snapshot(c,'skills'),standings=snapshot(c,'standings'),owner=store.get('market:owner:'+h.id,null),issues=[];
  const skillsOK=Array.isArray(skills?.data?.skills),level=key=>skillsOK?(skills.data.skills.find(s=>s.skill_id===key)?.active_skill_level??0):null;
  if(!skillsOK)issues.push('Update the selling character’s skills, or enable Training & clones and its skills scope.');
  if(h.kind==='station'&&(!owner||!Array.isArray(standings?.data)))issues.push('Update the station owner and the selling character’s NPC standings. Enable Combat record and its standings scope if needed.');
  if(h.kind==='structure'&&s.structureBroker===null)issues.push('Enter the total broker fee displayed in this structure’s market, including the 0.5% SCC surcharge. ESI does not expose your structure fee.');
  const faction=standings?.data?.find?.(r=>r.from_type==='faction'&&r.from_id===owner?.factionId)?.standing||0,corporation=standings?.data?.find?.(r=>r.from_type==='npc_corp'&&r.from_id===owner?.corporationId)?.standing||0;
  const fees={characterId:c?.id||0,characterName:c?.name||'Choose a selling character',kind:h.kind,accounting:level(16622),brokerRelations:level(3446),advancedBrokerRelations:level(16597),faction,corporation,owner:owner?.corporationName||null,skillsAt:skills?.updatedAt||null,standingsAt:standings?.updatedAt||null,stale:!fresh(skills)||h.kind==='station'&&(!fresh(standings)||owner?.expires<=now()),issues,ready:issues.length===0,rates:null};
  if(fees.ready)fees.rates=tradingRates({...fees,structureBroker:s.structureBroker});
  const buyerId=s.buyingCharacterId||s.characterId,buyingCharacter=auth.characters().find(c=>c.id===buyerId),buyerOrders=snapshot(buyingCharacter,'orders'),buyerIssues=[];
  if(!buyingCharacter)buyerIssues.push('Choose a connected buying character.');
  else if(buyingCharacter.needsReauth)buyerIssues.push('Reconnect the buying character in Connections before analysing imports.');
  else if(!Array.isArray(buyerOrders?.data))buyerIssues.push('Update the buying character’s open orders, or enable Wallet & trade and its character orders scope, so own Jita listings can be excluded.');
  // Immediate purchases do not use buyer skills or standings and incur no buyer fees.
  const buyer={characterId:buyerId,characterName:buyingCharacter?.name||'Choose a buying character',sameAsSeller:buyerId===s.characterId,purchaseMode:'immediate',sourceHubId:JITA,rates:{salesTax:0,broker:0},ordersAt:buyerOrders?.updatedAt||null,stale:!fresh(buyerOrders),issues:buyerIssues,ready:buyerIssues.length===0};
  const watched=auth.characters().map(c=>{const sample=snapshot(c,'orders');return {id:c.id,name:c.name,checkedAt:sample?.updatedAt||null,complete:!!sample&&Array.isArray(sample.data)&&fresh(sample),count:Array.isArray(sample?.data)?sample.data.length:0};});
  return {hub:h,settings:s,fees,buyer,watched,ordersReady:Array.isArray(snapshot(c,'orders')?.data),categories:IMPORT_CATEGORIES.map(({id,name,minimum})=>({id,name,minimum})),plans:db.prepare("SELECT id,json_extract(body,'$.name') name,json_array_length(body,'$.lines') lineCount,json_extract(body,'$.packing.trips') trips,json_extract(body,'$.quotedAt') quotedAt FROM market_import_plans WHERE hub_id=? ORDER BY updated DESC LIMIT 100").all(h.id)};
 }
 function saveSettings(id,input){const h=hub(id),s=validateImportSettings(input);if(s.characterId&&!auth.characters().some(c=>c.id===s.characterId))throw new Error('Choose a connected selling character.');if(s.buyingCharacterId&&!auth.characters().some(c=>c.id===s.buyingCharacterId))throw new Error('Choose a connected buying character.');store.set('market:imports:'+h.id,s);memo=null;return state(h.id);}
 async function refresh(id){const h=hub(id),s=settings(id);if(!store.get('module:markets',true))throw new Error('Enable Markets before updating trader data.');if(refreshFlight)return refreshFlight;
  refreshFlight=(async()=>{const chosen=auth.characters().find(c=>c.id===s.characterId);if(!chosen||chosen.needsReauth)throw new Error('Choose a connected selling character.');
   const buyer=auth.characters().find(c=>c.id===(s.buyingCharacterId||s.characterId));if(!buyer||buyer.needsReauth)throw new Error('Choose a connected buying character, or reconnect it in Connections.');
   if(h.kind==='station'){
    const old=store.get('market:owner:'+h.id,null);if(!old||old.expires<=now()){
     const station=(await request('/universe/stations/'+h.id,{ttl:604800})).data;if(!Number.isSafeInteger(station.owner))throw new Error('Station ownership is unavailable.');const known=owners[station.owner],corp=known?{name:known.name,faction_id:known.factionId}:(await request('/corporations/'+station.owner,{ttl:604800})).data;
     if(!corp.name||!Number.isSafeInteger(corp.faction_id))throw new Error('The NPC owner’s faction is unavailable.');store.set('market:owner:'+h.id,{corporationId:station.owner,corporationName:corp.name,factionId:corp.faction_id,expires:now()+7*DAY});
    }
   }
   if(refreshCharacter)await Promise.allSettled(auth.characters().filter(c=>!c.needsReauth).map(c=>refreshCharacter(c.id,c.id===chosen.id?['skills','standings','orders']:['orders'])));
   memo=null;return state(id);
  })().finally(()=>{refreshFlight=null;});return refreshFlight;
 }
 function ownership(id){const ownIds=new Set(),ownTypes=new Set();for(const c of auth.characters()){const sample=snapshot(c,'orders');if(!Array.isArray(sample?.data))continue;for(const o of sample.data){if(Number.isSafeInteger(o.order_id))ownIds.add(o.order_id);if(o.location_id===id&&!o.is_buy_order&&o.volume_remain>0&&Date.parse(o.issued)+o.duration*DAY>now())ownTypes.add(o.type_id);}}return {ownIds,ownTypes};}
 function levelMap(id,typeIds,ownIds,expires){const map=new Map();if(!typeIds.length)return map;const rows=db.prepare('SELECT type_id,order_id,price,volume,issued,duration FROM market_orders WHERE hub_id=? AND buy=0 AND volume>0 AND type_id IN (SELECT value FROM json_each(?)) ORDER BY type_id,price,order_id').all(id,JSON.stringify(typeIds));
  for(const r of rows){const end=Date.parse(r.issued)+r.duration*DAY;expires(end);if(ownIds.has(r.order_id)||end<=now())continue;if(!map.has(r.type_id))map.set(r.type_id,[]);const levels=map.get(r.type_id),last=levels.at(-1);if(last?.price===r.price)last.volume+=r.volume;else levels.push({price:r.price,volume:r.volume});}return map;
 }
 async function calculate(id){const context=state(id),h=context.hub,s=context.settings,empty=()=>({...context,groups:context.categories.map(g=>({...g,items:[],qualified:0})),screened:0,excluded:{},generatedAt:iso(now()),dataStamp:null});
  const started=now();let until=Math.min(started+30000,(Math.floor(started/DAY)+1)*DAY);
  const expires=at=>{if(Number.isFinite(at)&&at>started)until=Math.min(until,at);};
  expires(store.get('market:owner:'+h.id,null)?.expires);
  for(const c of auth.characters())for(const key of Object.keys(privateKeys)){
   const sample=snapshot(c,key);expires(Date.parse(sample?.refreshAt||sample?.expiresAt));
   if(key==='orders'&&Array.isArray(sample?.data))for(const order of sample.data)expires(Date.parse(order.issued)+order.duration*DAY);
  }
  if(h.id===JITA||!context.fees.ready||!context.ordersReady||!context.buyer.ready)return {result:{...empty(),reason:h.id===JITA?'Choose the destination hub. Jita is the purchasing market.':!context.ordersReady?'Update your selling character’s orders in Wallet & trade, so existing listings can be excluded.':!context.fees.ready?'Update trader data to calculate fees for your selling character.':context.buyer.issues[0]},models:new Map(),until};
  const own=ownership(h.id),full=h.last_full_scan?JSON.parse(h.last_full_scan):null;
  const rows=db.prepare(`SELECT j.type_id,t.name,j.observed jitaObserved,j.scan_id jitaScan,i.observed localObserved,i.buy localBuy,i.scan_id localScan,v.body history,v.updated historyUpdated,v.expires historyExpires,COALESCE(m.source,'ESI') historySource FROM market_items j JOIN market_types t ON t.type_id=j.type_id LEFT JOIN market_items i ON i.hub_id=? AND i.type_id=j.type_id LEFT JOIN market_history v ON v.region_id=? AND v.type_id=j.type_id LEFT JOIN market_history_meta m ON m.region_id=v.region_id AND m.type_id=v.type_id WHERE j.hub_id=? AND j.sell>0 AND (i.type_id IS NOT NULL OR ?=1)`).all(h.id,h.region_id,JITA,full?1:0);
  const excluded={ownOrders:0,noHistory:0,noCargo:0,inactive:0,noReturn:0},inputs=[];
  for(const r of rows){if(own.ownTypes.has(r.type_id)){excluded.ownOrders++;continue;}const info=taxonomy.type(r.type_id);if(!info.volume||info.volume>s.cargo){excluded.noCargo++;continue;}if(!r.history){excluded.noHistory++;continue;}inputs.push({...r,info});}
  const ids=inputs.map(r=>r.type_id),source=levelMap(JITA,ids,own.ownIds,expires),destination=levelMap(h.id,ids,own.ownIds,expires),models=new Map(),all=new Map(IMPORT_CATEGORIES.map(g=>[g.id,[]]));let i=0;
  for(const r of inputs){const levels=source.get(r.type_id)||[],local=destination.get(r.type_id)||[],model={typeId:r.type_id,name:r.name,category:importCategory(r.info.root),volume:r.info.volume,levels,localSell:local[0]?.price||null,localBuy:r.localBuy||0,localSupply:local.reduce((n,l)=>n+l.volume,0),history:JSON.parse(r.history),rates:context.fees.rates,settings:s,now:now()};
   const localAt=r.localObserved||full?.observed;
   expires(Date.parse(r.jitaObserved)+DAY);expires(Date.parse(localAt)+DAY);expires(Date.parse(r.historyExpires));
   const item=buildOpportunity(model);if(item){Object.assign(item,{jitaObserved:r.jitaObserved,localObserved:localAt,historyUpdated:r.historyUpdated,historySource:r.historySource,region:h.region_name,stale:Date.parse(r.jitaObserved)+DAY<=now()||Date.parse(localAt)+DAY<=now()||Date.parse(r.historyExpires)<=now(),feesStale:context.fees.stale});all.get(item.category).push(item);models.set(item.typeId,{model,item});}else excluded.noReturn++;
   if(++i%100===0)await delay(0);
  }
  const groups=context.categories.map(g=>{const items=all.get(g.id).sort((a,b)=>b.score-a.score||a.typeId-b.typeId);return {...g,qualified:items.length,items:items.slice(0,10)};});
  return {result:{...context,groups,screened:rows.length,excluded,generatedAt:iso(now()),dataStamp:{local:h.last_scan?JSON.parse(h.last_scan).observed:null,jita:db.prepare('SELECT last_scan FROM market_hubs WHERE id=?').get(JITA)?.last_scan?JSON.parse(db.prepare('SELECT last_scan FROM market_hubs WHERE id=?').get(JITA).last_scan).observed:null},reason:!rows.length?'Scan this hub and Jita to build a comparison.':null},models,until};
 }
 async function cached(id){
  id=Number(id);
  for(;;){
   const key=cacheKey(id);
   if(memo?.key===key&&memo.until>now())return memo.value;
   if(flight){await flight;continue;}
   const task=calculate(id);flight=task;
   try{
    const value=await task;
    // Calculation yields between batches. Never publish an obsolete mix if a
    // book, access state or expiry changed while that calculation was running.
    if(key!==cacheKey(id)||value.until<=now())continue;
    memo={key,value,until:value.until};return value;
   }finally{if(flight===task)flight=null;}
  }
 }
 async function analyse(id){return (await cached(id)).result;}
 async function detail(id,typeId){const found=(await cached(id)).models.get(Number(typeId));if(!found)throw new Error('This item no longer qualifies with your current cache and import settings.');return {...buildOpportunity({...found.model,detail:true}),...Object.fromEntries(Object.entries(found.item).filter(([k])=>['jitaObserved','localObserved','historyUpdated','historySource','region','stale','feesStale'].includes(k)))};}
 function quoteFrom(cache,input){const found=cache.models.get(Number(input.typeId));if(!found)throw new Error('This item no longer qualifies, or is already listed by one of your characters.');if(!['anchoring','profiteering'].includes(input.strategy))throw new Error('Choose an import strategy.');if(typeof input.price!=='number'||input.price>1e15||input.price!==marketPrice(input.price))throw new Error('Listing prices must use EVE’s four-significant-digit price ticks.');
  const d=found.item.demand,reference=d.windows[7].average||d.windows[30].average||found.item.jita,daily=d.daily*Math.min(1,(reference/input.price)**2),option=scenario({...found.model,...{quantity:input.quantity,price:input.price,duration:input.duration,strategy:input.strategy},daily});if(!option)throw new Error('This quantity exceeds the cached Jita stock or your hauling limits.');return {...option,typeId:found.item.typeId,name:found.item.name,localObserved:found.item.localObserved,jitaObserved:found.item.jitaObserved,historyUpdated:found.item.historyUpdated,historySource:found.item.historySource,feeProfile:cache.result.fees,buyer:cache.result.buyer};
 }
 async function quote(id,input){return quoteFrom(await cached(id),input);}
 async function planQuote(id,input){if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>100)throw new Error('An import plan needs 1–100 items.');if(new Set(input.lines.map(l=>l.typeId)).size!==input.lines.length)throw new Error('Keep one import line per item.');const cache=await cached(id),s=cache.result.settings,lines=input.lines.map(line=>quoteFrom(cache,line));const packing=packCargo(lines,s.cargo),sum=k=>lines.reduce((n,l)=>n+l[k],0),haul=packing.trips*s.haulPerTrip,upfront=sum('upfront')-sum('haul')+haul,net=sum('net')+sum('haul')-haul;return {lines,packing,buyer:cache.result.buyer,feeProfile:cache.result.fees,totals:{purchase:lines.reduce((n,l)=>n+l.buy.cost,0),revenue:sum('revenue'),brokerFee:sum('brokerFee'),salesTax:sum('salesTax'),relistReserve:sum('relistReserve'),haul,upfront,net,roi:net/upfront*100,budget:s.budget,budgetExceeded:upfront>s.budget,maxEta:Math.max(...lines.map(l=>l.eta||0))},settings:s,quotedAt:iso(now())};}
 async function savePlan(id,input){const h=hub(id);if(typeof input.name!=='string'||!input.name.trim()||input.name.length>100)throw new Error('Name the import plan (up to 100 characters).');const prior=input.id?db.prepare('SELECT * FROM market_import_plans WHERE id=? AND hub_id=?').get(input.id,h.id):null;if(input.id&&!prior)throw new Error('Import plan not found.');if(!prior&&db.prepare('SELECT COUNT(*) n FROM market_import_plans WHERE hub_id=?').get(h.id).n>=100)throw new Error('Keep up to 100 plans per hub.');const quote=await planQuote(id,input),plan={id:prior?.id||randomUUID(),name:input.name.trim(),hubId:h.id,hubName:h.name,...quote};db.prepare('INSERT INTO market_import_plans VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated=excluded.updated,body=excluded.body').run(plan.id,h.id,iso(now()),JSON.stringify(plan));return plan;}
 function getPlan(id,planId){hub(id);const r=db.prepare('SELECT body FROM market_import_plans WHERE hub_id=? AND id=?').get(Number(id),String(planId));if(!r)throw new Error('Saved import plan not found.');return JSON.parse(r.body);}
 function removePlan(id,planId){hub(id);db.prepare('DELETE FROM market_import_plans WHERE id=? AND hub_id=?').run(String(planId),Number(id));return {ok:true};}
 return {state,saveSettings,refresh,analyse,detail,quote,planQuote,savePlan,getPlan,removePlan,async close(){await Promise.allSettled([flight,refreshFlight]);}};
}
