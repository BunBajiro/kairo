/**
 * Core's shared market cache and single scan-job owner. Hub books are shared by
 * local pilots, although structure reads require the chosen pilot's access.
 * Jobs stage complete books before promotion; analysis/report reads stay local.
 * See ../docs/MARKETS.md and ../docs/IMPORT-ANALYSER.md.
 */
import {pruneMarketJobs} from './cache-retention.mjs';
import {historySummary,saveHistory,createHistoryArchive,CORE_HUBS} from './market-history.mjs';
import {createImports} from './imports.mjs';
export {historySummary} from './market-history.mjs';
import {createMarketCategories} from './market-categories.mjs';
const categoryIndex=createMarketCategories();
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
export const JITA=60003760;
export const MARKET_SCOPE='esi-markets.structure_markets.v1';
const day=86400000,iso=n=>new Date(n).toISOString(),validId=n=>Number.isSafeInteger(n)&&n>0;
const defaults=[
 [JITA,'Jita','Jita IV - Moon 4 - Caldari Navy Assembly Plant',30000142,'Jita',10000002,'The Forge'],
 [60008494,'Amarr','Amarr VIII (Oris) - Emperor Family Academy',30002187,'Amarr',10000043,'Domain'],
 [60011866,'Dodixie','Dodixie IX - Moon 20 - Federation Navy Assembly Plant',30002659,'Dodixie',10000032,'Sinq Laison'],
 [60005686,'Hek','Hek VIII - Moon 12 - Boundless Creation Factory',30002053,'Hek',10000042,'Metropolis']
];
export const QUICK_NAMES=['Nanite Repair Paste','Cap Booster 800','Navy Cap Booster 800','Antimatter Charge S','Antimatter Charge M','Antimatter Charge L','EMP S','EMP M','EMP L','Scourge Light Missile','Scourge Heavy Missile','Scourge Cruise Missile','Multifrequency S','Multifrequency M','Multifrequency L','Hobgoblin II','Warrior II','Hornet EC-300','Mobile Depot','Mobile Tractor Unit','Liquid Ozone','Heavy Water','Tritanium','Isotopes'];
// Only actual names returned by ESI enter the quick basket. Fuel uses all four exact isotope types.
QUICK_NAMES.splice(QUICK_NAMES.indexOf('Isotopes'),1,'Helium Isotopes','Hydrogen Isotopes','Nitrogen Isotopes','Oxygen Isotopes');
/**
 * Initialize/recover shared hub state, retire interrupted jobs and own Imports.
 * start() synchronously accepts a job and returns status; idle() waits for it,
 * while failure is recorded on the job instead of rejected by idle(). close()
 * stops new requests, cancels current work and drains before Store/ESI may close.
 * spacingMs is a minimum dispatch gap; the shared ESI owner still limits traffic.
 * retryWait accepts milliseconds; test clocks must advance with its waits.
 */
export function createMarkets(store,auth,esi,{spacingMs=250,now=()=>Date.now(),historySource='everef',historyFetcher,historyDecode,refreshCharacter,autoUpgrade=false,retryWait=delay}={}){
 const db=store.db,archives=createHistoryArchive(store,{fetcher:historyFetcher,decode:historyDecode,now,spacingMs});let task=null,current=null,stopped=false,lastRequest=0;
 const pacedRequest=esi.paced?.({spacingMs,now});
 const insertHub=db.prepare('INSERT OR IGNORE INTO market_hubs(id,name,station_name,kind,system_id,system_name,region_id,region_name,builtin) VALUES(?,?,?,\'station\',?,?,?,?,1)');
 if(!store.get('market:initialized',false)){for(const h of defaults)insertHub.run(...h);store.set('market:initialized',true);}
 for(const r of db.prepare("SELECT * FROM market_jobs WHERE json_extract(body,'$.status')='running'").all()){const j=JSON.parse(r.body);if(j.status==='running'){j.status='interrupted';j.detail='Kairo closed during this scan. Completed books were kept; run the scan again to continue using cached responses.';j.endedAt=iso(now());db.prepare('UPDATE market_jobs SET body=? WHERE id=?').run(JSON.stringify(j),j.id);}}
 db.exec('DELETE FROM market_stage');pruneMarketJobs(db,now());
 const hub=id=>{const h=db.prepare('SELECT * FROM market_hubs WHERE id=?').get(Number(id));if(!h)throw new Error('Choose a saved trade hub.');return h;};
 const enabled=()=>{if(stopped)throw new Error('Kairo is shutting down.');if(!store.get('module:markets',true))throw new Error('Enable Markets in Modules before requesting new data.');};
 function character(id,scope){if(!id){if(scope)throw new Error('Choose a connected character with structure market access.');return null;}const c=auth.characters().find(c=>c.id===id);if(!c||c.needsReauth)throw new Error('Reconnect the scan character in Connections.');if(scope&&!c.scopes.includes(scope))throw new Error('Reconnect '+c.name+' with '+scope+' in Connections.');return c;}
 function check(job){enabled();if(job?.cancelled)throw new Error('Scan cancelled. Completed books and earlier cached results are kept.');if(job?.characterId)character(job.characterId);}
 function saveJob(job){db.prepare('INSERT INTO market_jobs VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(job.id,JSON.stringify(job));if(job.status!=='running')pruneMarketJobs(db,now());}
 function progress(job,detail,part={}){Object.assign(job,part,{detail,updatedAt:iso(now())});saveJob(job);}
 async function request(path,options={},job){const eligible=()=>{check(job);if(path.startsWith('/markets/structures/'))character(options.characterId,MARKET_SCOPE);};eligible();let r;if(pacedRequest)r=await pacedRequest(path,options,eligible);else{const wait=spacingMs-(now()-lastRequest);if(wait>0)await delay(wait);eligible();lastRequest=now();r=await esi.request(path,options);}check(job);if(r.stale||r.truncated){const e=new Error(r.error||'ESI returned incomplete or stale data. Previous scan retained.');e.status=r.errorStatus;e.code=r.errorCode;e.retryAt=r.retryAt;e.serverRetryAfter=r.serverRetryAfter;throw e;}if(!Number.isFinite(Date.parse(r.updatedAt))||!Number.isFinite(Date.parse(r.expiresAt)))throw Object.assign(new Error('ESI response has no valid cache dates.'),{code:options.validate?'ESI_INVALID_RESPONSE':undefined});return r;}
 const typePut=db.prepare('INSERT INTO market_types(type_id,name) VALUES(?,?) ON CONFLICT(type_id) DO UPDATE SET name=excluded.name');
 async function resolveQuick(job){let ids=store.get('market:quick',null);if(ids)return ids;const r=await request('/universe/ids',{method:'POST',body:QUICK_NAMES,ttl:86400},job),types=r.data.inventory_types||[];if(types.length!==QUICK_NAMES.length)throw new Error('The quick-scan supply list could not be resolved completely. Please retry.');ids=store.get('market:quick',null);if(ids)return ids;ids=[];for(const t of types){typePut.run(t.id,t.name);ids.push(t.id);}store.set('market:quick',ids);return ids;}
 async function lookupType(name){enabled();if(typeof name!=='string'||!name.trim()||name.length>150)throw new Error('Enter an exact item name.');const r=await request('/universe/ids',{method:'POST',body:[name.trim()],ttl:86400});const t=r.data.inventory_types?.find(t=>t.name.toLowerCase()===name.trim().toLowerCase());if(!t)throw new Error('No exact market item found. Use its full in-game name.');const v=await request('/universe/types/'+t.id,{ttl:86400});if(!v.data.market_group_id)throw new Error('This item is not listed on the market.');typePut.run(t.id,t.name);return {id:t.id,name:t.name};}
 async function quickChange(body){const checkEditable=()=>{if(task)throw new Error('Wait for the active scan before editing the quick list.');};checkEditable();await resolveQuick();
  // Item resolution yields. Apply this edit to the current basket and scan
  // state, so another window's completed edit cannot be silently overwritten.
  if(body.remove||body.removeName){checkEditable();const ids=store.get('market:quick',[]),id=Number(body.remove)||db.prepare('SELECT type_id FROM market_types WHERE name=?').get(body.removeName)?.type_id,next=ids.filter(i=>i!==id);if(!next.length)throw new Error('Keep at least one quick-scan item.');store.set('market:quick',next);}
  else{if(store.get('market:quick',[]).length>=80)throw new Error('Quick scans support up to 80 items.');const t=await lookupType(body.name);checkEditable();const next=[...new Set([...store.get('market:quick',[]),t.id])];if(next.length>80)throw new Error('Quick scans support up to 80 items.');store.set('market:quick',next);}return overview();}
 async function resolveHub(input,job){const id=Number(input.locationId);if(!validId(id))throw new Error('Enter a valid station or structure ID.');const kind=id>=1000000000000?'structure':'station',charId=Number(input.characterId||0);character(charId,kind==='structure'?'esi-universe.read_structures.v1':null);const loc=(await request('/universe/'+(kind==='structure'?'structures':'stations')+'/'+id,{characterId:kind==='structure'?charId:0,ttl:86400},job)).data;
 const systemId=loc.system_id||loc.solar_system_id;if(!validId(systemId)||!loc.name)throw new Error('This location could not be resolved.');
 const system=(await request('/universe/systems/'+systemId,{ttl:86400},job)).data,con=(await request('/universe/constellations/'+system.constellation_id,{ttl:86400},job)).data,reg=(await request('/universe/regions/'+con.region_id,{ttl:86400},job)).data;
 if(kind==='station'&&Array.isArray(loc.services)&&!loc.services.includes('market'))throw new Error('This station does not offer a market.');
 return {id,name:typeof input.name==='string'&&input.name.trim()?input.name.trim().slice(0,80):loc.name,station_name:loc.name,kind,system_id:systemId,system_name:system.name,region_id:con.region_id,region_name:reg.name};}
 async function addHub(input){enabled();const checkSlot=id=>{if(!db.prepare('SELECT id FROM market_hubs WHERE id=? AND enabled=1').get(id)&&db.prepare('SELECT COUNT(*) n FROM market_hubs WHERE enabled=1').get().n>=32)throw new Error('Up to 32 hubs can be followed. Remove one first.');};checkSlot(Number(input.locationId));const h=await resolveHub(input);checkSlot(h.id);db.prepare('INSERT INTO market_hubs(id,name,station_name,kind,system_id,system_name,region_id,region_name) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=1,name=excluded.name,station_name=excluded.station_name,system_id=excluded.system_id,system_name=excluded.system_name,region_id=excluded.region_id,region_name=excluded.region_name').run(h.id,h.name,h.station_name,h.kind,h.system_id,h.system_name,h.region_id,h.region_name);return h;}
 function removeHub(id){hub(id);if(current?.status==='running'&&(current.hubId===Number(id)||Number(id)===JITA&&current.compareJita))throw new Error('Cancel the active scan before removing this hub.');db.prepare('UPDATE market_hubs SET enabled=0 WHERE id=?').run(Number(id));return overview();}
 function restoreDefaults(){const missing=defaults.filter(h=>!db.prepare('SELECT id FROM market_hubs WHERE id=? AND enabled=1').get(h[0])).length;if(db.prepare('SELECT COUNT(*) n FROM market_hubs WHERE enabled=1').get().n+missing>32)throw new Error('Remove a hub before restoring the core hubs; up to 32 can be followed.');for(const h of defaults){insertHub.run(...h);db.prepare('UPDATE market_hubs SET enabled=1 WHERE id=?').run(h[0]);}return overview();}
 async function discover(input){enabled();let systemId,locationId=0;const charId=Number(input.characterId||0);if(input.current){character(charId,'esi-location.read_location.v1');const l=(await request('/characters/'+charId+'/location',{characterId:charId,ttl:5})).data;systemId=l.solar_system_id;locationId=l.station_id||l.structure_id||0;}else{if(typeof input.system!=='string'||!input.system.trim()||input.system.length>100)throw new Error('Enter a system name.');const r=await request('/universe/ids',{method:'POST',body:[input.system.trim()],ttl:86400});systemId=r.data.solar_systems?.[0]?.id;}if(!validId(systemId))throw new Error('System not found.');const s=(await request('/universe/systems/'+systemId,{ttl:86400})).data;const stations=[];if(locationId>=1000000000000){const l=await resolveHub({locationId,characterId:charId});stations.push(l);}for(const id of (s.stations||[]).slice(0,30)){const station=(await request('/universe/stations/'+id,{ttl:86400})).data;if(!Array.isArray(station.services)||station.services.includes('market'))stations.push({id,name:station.name,kind:'station'});}return {system:s.name,dockedId:locationId,stations,truncated:(s.stations||[]).length>30};}
 function overview(){const hubs=db.prepare('SELECT * FROM market_hubs WHERE enabled=1 ORDER BY builtin DESC,name').all().map(h=>({...h,last_scan:h.last_scan?JSON.parse(h.last_scan):null,updateSuggested:!!h.last_scan&&Date.parse(JSON.parse(h.last_scan).at)+day<=now(),historySource:CORE_HUBS.has(h.id)?'EVE Ref':'ESI',item_count:db.prepare('SELECT COUNT(*) n FROM market_items WHERE hub_id=?').get(h.id).n}));const quick=store.get('market:quick',null);const jobs=db.prepare('SELECT body FROM market_jobs ORDER BY rowid DESC LIMIT 8').all().map(r=>JSON.parse(r.body));return {hubs,upgrade:store.get('market:upgrade',null),historyArchive:archives.status(),job:current?.status==='running'?current:jobs[0]||null,jobs,quick:quick?quick.map(id=>db.prepare('SELECT type_id id,name FROM market_types WHERE type_id=?').get(id)).filter(Boolean):QUICK_NAMES.map(name=>({name})),jita:db.prepare('SELECT last_scan FROM market_hubs WHERE id=?').get(JITA)?.last_scan?JSON.parse(db.prepare('SELECT last_scan FROM market_hubs WHERE id=?').get(JITA).last_scan):null,enabled:store.get('module:markets',true)};}
 const invalidOrderResponse=message=>Object.assign(new Error(message),{code:'ESI_INVALID_RESPONSE'});
 function validateOrderPage(r){
  if(!r||!Number.isFinite(Date.parse(r.updatedAt))||!Number.isFinite(Date.parse(r.expiresAt)))throw invalidOrderResponse('ESI response has no valid cache dates.');
  const count=Number(r.headers?.['x-pages']??1);if(!Number.isInteger(count)||count<1||count>2000)throw invalidOrderResponse('ESI reported an unsupported page count. No partial book was saved.');
  if(!Array.isArray(r.data))throw invalidOrderResponse('Invalid market order response.');
  // ESI briefly retains exhausted duration-zero orders; they contribute no depth.
  for(const o of r.data){if(!o||typeof o!=='object'||!validId(o.location_id)||!validId(o.order_id)||!validId(o.type_id)||typeof o.is_buy_order!=='boolean'||!Number.isFinite(o.price)||o.price<=0||!Number.isSafeInteger(o.volume_remain)||o.volume_remain<0||!Number.isFinite(Date.parse(o.issued))||!Number.isInteger(o.duration)||o.duration<0||(o.duration===0&&o.volume_remain!==0))throw invalidOrderResponse('ESI returned a malformed order. Previous book retained.');}
 }
 async function orderPage(path,options,job,h,page){
  const eligible=()=>{check(job);if(path.startsWith('/markets/structures/'))character(options.characterId,MARKET_SCOPE);};
  // One budget spans every page and comparison hub. Validation stays outside
  // staging, and ESI rejects bad cache representations before the next attempt.
  for(;;){
   let validated;
   const validate=r=>{validateOrderPage(r);validated=r;};
   try{const r=await request(path,{...options,validate},job);if(validated!==r)validate(r);return r;}
   catch(e){
    eligible();
    if(!['ESI_INVALID_RESPONSE','ESI_READ_FAILED'].includes(e.code)&&![408,420,429,500,502,503,504].includes(e.status))throw e;
    const used=job.retries||0,waitMs=Math.max(1000*2**used,(Date.parse(e.retryAt)||0)-now());
    const message=e.message.replace(' Retrying automatically.','').replace('; retry scheduled.','.');
    if(used>=2)throw new Error(message+' Recovery attempts exhausted.');
    if(waitMs>60000-(job.retryWaitMs||0))throw new Error(message+' Recovery paused; retry the scan after '+(e.retryAt||'the provider cooldown')+'.');
    job.retries=used+1;job.retryWaitMs=(job.retryWaitMs||0)+waitMs;
    progress(job,h.name+' · page '+page+' · retry '+job.retries+'/2 in '+Math.ceil(waitMs/1000)+'s',{phase:'orders',scanningHub:h.name});
    // Chunking keeps Cancel, module/access changes and shutdown responsive.
    for(let left=waitMs;left>0;left-=Math.min(250,left)){eligible();await retryWait(Math.min(250,left));}
    eligible();
   }
  }
 }
 const stagePut=db.prepare('INSERT INTO market_stage VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(job_id,hub_id,order_id) DO UPDATE SET price=excluded.price,volume=excluded.volume');
 /**
  * Validate every page before promoting this hub's book. Each request series must
  * keep a stable advertised page count of at most 2,000; the whole scan admits at
  * most two million received orders. Either limit fails without partial promotion.
  * A later hub/history failure does not roll back a book already promoted.
  * Quick/item scans replace selected types; full scans also clear absent types.
  */
 async function scanBook(h,ids,job,full){
  if(h.kind==='structure')character(job.characterId,MARKET_SCOPE);
  const paths=h.kind==='structure'?['/markets/structures/'+h.id]:full?['/markets/'+h.region_id+'/orders?order_type=all']:ids.map(id=>'/markets/'+h.region_id+'/orders?order_type=all&type_id='+id);
  let oldest=iso(now()),expires=iso(now()+day),pageCount=0,received=0;const wanted=new Set(ids);db.prepare('DELETE FROM market_stage WHERE job_id=? AND hub_id=?').run(job.id,h.id);
  for(let n=0;n<paths.length;n++){
   let pages=1;
   for(let page=1;page<=pages;page++){
    progress(job,h.name+' · order pages '+(n+1)+'/'+paths.length+' · page '+page+'/'+pages,{phase:'orders',scanningHub:h.name});
    const r=await orderPage(paths[n]+(paths[n].includes('?')?'&':'?')+'page='+page,{characterId:h.kind==='structure'?job.characterId:0,ttl:300},job,h,page);
    const count=Number(r.headers?.['x-pages']??1);if(page>1&&count!==pages)throw new Error('The market changed its page count during this scan. Run it again to obtain a complete book.');pages=count;
    pageCount++;received+=r.data.length;if(received>2000000)throw new Error('The scan exceeded two million orders. Use a quick scan for this hub.');oldest=oldest<r.updatedAt?oldest:r.updatedAt;expires=expires<r.expiresAt?expires:r.expiresAt;
    const accepted=r.data.filter(o=>o.location_id===h.id&&(full||wanted.has(o.type_id))&&o.volume_remain);
    db.exec('BEGIN IMMEDIATE');try{for(const o of accepted)stagePut.run(job.id,h.id,o.order_id,o.type_id,o.is_buy_order?1:0,o.price,o.volume_remain,Math.max(1,Number(o.min_volume)||1),String(o.range||'station'),o.issued,o.duration);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    job.pages=(job.pages||0)+1;
   }
  }
  check(job);const typeIds=full?[...new Set([...ids,...db.prepare('SELECT DISTINCT type_id FROM market_stage WHERE job_id=? AND hub_id=?').all(job.id,h.id).map(r=>r.type_id),...db.prepare('SELECT type_id FROM market_items WHERE hub_id=?').all(h.id).map(r=>r.type_id)])]:ids;
  const known=esi.cachedNames?.(typeIds)||{};
  for(const [id,name] of Object.entries(known))typePut.run(Number(id),name);
  const missing=typeIds.filter(id=>!db.prepare('SELECT type_id FROM market_types WHERE type_id=?').get(id));
  for(let i=0;i<missing.length;i+=500){progress(job,h.name+' · resolving item names '+Math.min(i+500,missing.length)+'/'+missing.length,{phase:'names'});const r=await request('/universe/names',{method:'POST',body:missing.slice(i,i+500),ttl:86400},job);if(!Array.isArray(r.data))throw new Error('Item names could not be read.');for(const t of r.data)if(t.category==='inventory_type')typePut.run(t.id,t.name);}
  // Promotion is one transaction: readers see either complete old or complete new books.
  const observed=oldest,summary={at:iso(now()),observed,expires,mode:full?'full':'quick',characterId:job.characterId,characterName:job.characterName,items:typeIds.length,pages:pageCount,jobId:job.id};
  progress(job,h.name+' · saving complete order book',{phase:'saving'});check(job);
  db.exec('BEGIN IMMEDIATE');try{
   if(full){db.prepare('DELETE FROM market_orders WHERE hub_id=?').run(h.id);db.prepare('DELETE FROM market_items WHERE hub_id=?').run(h.id);}else{const del=db.prepare('DELETE FROM market_orders WHERE hub_id=? AND type_id=?');for(const id of ids)del.run(h.id,id);}
   db.prepare('INSERT INTO market_orders SELECT hub_id,order_id,type_id,buy,price,volume,minimum,range,issued,duration FROM market_stage WHERE job_id=? AND hub_id=?').run(job.id,h.id);
   if(!full)db.prepare('DELETE FROM market_items WHERE hub_id=? AND type_id IN (SELECT value FROM json_each(?))').run(h.id,JSON.stringify(ids));
   db.prepare(`INSERT INTO market_items SELECT hub_id,type_id,MAX(CASE WHEN buy=1 THEN price END),MIN(CASE WHEN buy=0 THEN price END),SUM(CASE WHEN buy=0 THEN price*volume ELSE 0 END)/NULLIF(SUM(CASE WHEN buy=0 THEN volume ELSE 0 END),0),SUM(CASE WHEN buy=0 THEN volume ELSE 0 END),SUM(CASE WHEN buy=1 THEN volume ELSE 0 END),SUM(CASE WHEN buy=0 THEN 1 ELSE 0 END),SUM(CASE WHEN buy=1 THEN 1 ELSE 0 END),?,?,? FROM market_stage WHERE job_id=? AND hub_id=? GROUP BY hub_id,type_id`).run(observed,expires,job.id,job.id,h.id);
   db.prepare('INSERT OR IGNORE INTO market_items SELECT ?,value,NULL,NULL,NULL,0,0,0,0,?,?,? FROM json_each(?)').run(h.id,observed,expires,job.id,JSON.stringify(typeIds));
   db.prepare('UPDATE market_hubs SET last_scan=?,last_full_scan=CASE WHEN ? THEN ? ELSE last_full_scan END WHERE id=?').run(JSON.stringify(summary),full?1:0,full?JSON.stringify(summary):null,h.id);db.prepare('DELETE FROM market_stage WHERE job_id=? AND hub_id=?').run(job.id,h.id);db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  job.books.push({hubId:h.id,name:h.name,items:typeIds.length});saveJob(job);return typeIds;
 }
 async function scanHistory(h,id,job){const cached=db.prepare('SELECT expires FROM market_history WHERE region_id=? AND type_id=?').get(h.region_id,id);if(cached&&Date.parse(cached.expires)>now())return;const r=await request('/markets/'+h.region_id+'/history?type_id='+id,{ttl:86400},job);if(!Array.isArray(r.data))throw new Error('Invalid regional history response.');for(const row of r.data)if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(row.average)||row.average<0||!Number.isSafeInteger(row.volume)||row.volume<0)throw new Error('Invalid regional history data.');saveHistory(store,h.region_id,id,r.data.filter(r=>Date.parse(r.date)>=now()-90*day),r.updatedAt,r.expiresAt,'ESI',now());}
 function start(input,{internalReference=false}={}){enabled();const h=hub(Number(input.hubId));if(!h.enabled&&!(internalReference&&h.id===JITA))throw new Error('Restore this hub before scanning.');if(!['quick','full','item','history'].includes(input.mode))throw new Error('Choose quick, full or item scan.');const charId=Number(input.characterId||0),c=character(charId,h.kind==='structure'&&input.mode!=='history'?MARKET_SCOPE:null);if((input.mode==='item'||input.mode==='history'&&input.typeId)&&(!validId(input.typeId)||!db.prepare('SELECT type_id FROM market_types WHERE type_id=?').get(input.typeId)))throw new Error('Choose a known market item.');
  if(task){if(!current.cancelled&&current.hubId===h.id&&current.mode===input.mode&&current.typeId===(input.typeId||null)&&current.characterId===charId&&current.compareJita===(input.compareJita!==false&&h.id!==JITA))return {...current};throw new Error('One market scan runs at a time. Let it finish or cancel it first.');}
  const job={id:randomUUID(),hubId:h.id,mode:input.mode,typeId:input.typeId||null,characterId:charId,characterName:c?.name||'Public ESI',compareJita:input.compareJita!==false&&h.id!==JITA,status:'running',phase:'starting',startedAt:iso(now()),updatedAt:iso(now()),detail:'Preparing scan',books:[],historyDone:0,historyTotal:0,pages:0};current=job;saveJob(job);
  // Install ownership before work can fail synchronously (for example, history
  // on a hub without a first book), so finally always retires the active task.
  task=Promise.resolve().then(async()=>{try{
   const quick=job.mode==='history'?[]:await resolveQuick(job),ids=job.typeId?[job.typeId]:quick;let historyIds=job.mode==='history'&&!job.typeId?db.prepare('SELECT type_id FROM market_items WHERE hub_id=? ORDER BY type_id').all(h.id).map(r=>r.type_id):ids;if(!historyIds.length&&!(job.mode==='history'&&CORE_HUBS.has(h.id)&&historySource==='everef'))throw new Error('Scan an order book before collecting its histories.');
   if(job.mode!=='history')historyIds=await scanBook(h,ids,job,job.mode==='full');
   if(job.compareJita&&job.mode!=='history'){let reference=db.prepare('SELECT * FROM market_hubs WHERE id=?').get(JITA);if(!reference){insertHub.run(...defaults[0]);reference=hub(JITA);}await scanBook(reference,ids,job,job.mode==='full');}
   job.historyTotal=historyIds.length;
   if(CORE_HUBS.has(h.id)&&historySource==='everef'){await archives.update({check:()=>check(job),progress:(detail,part)=>progress(job,detail,part)});}else{
   for(let i=0;i<historyIds.length;i++){check(job);progress(job,h.name+' · regional history '+(i+1)+'/'+historyIds.length,{phase:'history',historyDone:i});try{await scanHistory(h,historyIds[i],job);}catch(e){if(e.status!==404||(job.missingHistory||0)>=5)throw new Error((db.prepare('SELECT name FROM market_types WHERE type_id=?').get(historyIds[i])?.name||'Item '+historyIds[i])+': '+e.message);job.missingHistory=(job.missingHistory||0)+1;}job.historyDone=i+1;if(i%100===99)await delay(0);}}
   progress(job,job.missingHistory?'Books saved. '+job.missingHistory+' item histories were unavailable from ESI; gaps remain explicitly unscanned.':'Scan complete. Books and regional history are available to every local character.',{status:'complete',endedAt:iso(now())});
  }catch(e){progress(job,e.message,{status:job.cancelled?'cancelled':stopped?'interrupted':'failed',endedAt:iso(now())});}finally{db.prepare('DELETE FROM market_stage WHERE job_id=?').run(job.id);task=null;const upgrade=store.get('market:upgrade',null);if(upgrade?.queue.some(q=>q.hubId===job.hubId)){if(job.status==='complete'){upgrade.queue=upgrade.queue.filter(q=>q.hubId!==job.hubId);upgrade.completed++;upgrade.detail=upgrade.queue.length?'Fresh market scans are continuing.':'Upgrade refresh complete. All queued books use the new data model.';}else{upgrade.paused=true;upgrade.detail='Upgrade refresh paused: '+job.detail;}store.set('market:upgrade',upgrade);}if(autoUpgrade&&!stopped)queueMicrotask(()=>resumeUpgrade());}});return {...job};
 }
 function resumeUpgrade(manual=false){
  const u=store.get('market:upgrade',null);if(!u||!u.queue.length||task||stopped)return overview();if(manual)u.paused=false;if(u.paused)return overview();
  if(!store.get('module:markets',true)){u.detail='Enable Markets to refresh the retired books.';store.set('market:upgrade',u);return overview();}
  let selected=null,access=0;for(const q of u.queue){const h=db.prepare('SELECT * FROM market_hubs WHERE id=?').get(q.hubId);if(!h||!h.enabled&&h.id!==JITA)continue;if(h.kind==='station'){selected=q;access=auth.characters().find(c=>c.id===q.characterId&&!c.needsReauth)?.id||0;break;}const c=auth.characters().find(c=>c.id===q.characterId&&!c.needsReauth&&c.scopes.includes(MARKET_SCOPE))||auth.characters().find(c=>!c.needsReauth&&c.scopes.includes(MARKET_SCOPE));if(c){selected=q;access=c.id;break;}}
  if(!selected){u.detail='Fresh structure scans need a connected alt with market access. Reconnect the alt or restore the queued hub, then resume.';store.set('market:upgrade',u);return overview();}
  u.detail='Refreshing '+hub(selected.hubId).name+' from fresh market responses.';store.set('market:upgrade',u);try{start({...selected,characterId:access,compareJita:false},{internalReference:true});}catch(e){u.paused=true;u.detail=e.message;store.set('market:upgrade',u);}return overview();
 }
 function cancel(){if(current?.status==='running'){current.cancelled=true;archives.cancel();progress(current,'Stopping the current download. Completed books are kept.');}return current;}
 function history(h,id){const r=db.prepare('SELECT * FROM market_history WHERE region_id=? AND type_id=?').get(h.region_id,id);return r?{daily_volume:r.daily_volume,average:r.average,reported_days:r.reported_days,from:r.period_from,to:r.period_to,days:JSON.parse(r.body).filter(d=>d.date>=r.period_from&&d.date<=r.period_to),updated:r.updated,expires:r.expires,stale:Date.parse(r.expires)<now(),region:h.region_name,source:db.prepare('SELECT source FROM market_history_meta WHERE region_id=? AND type_id=?').get(h.region_id,id)?.source||'ESI'}:null;}
 // Coverage days compare local stock with REGION-wide daily volume; they are
 // not station demand. Cache expiry and the one-day stale indication are distinct.
 function decorate(r,h){const hist=r.history_updated?{daily_volume:r.daily_volume,average:r.history_average,reported_days:r.reported_days,from:r.period_from,to:r.period_to,updated:r.history_updated,expires:r.history_expires,stale:Date.parse(r.history_expires)<now(),region:h.region_name}:null;const premium=r.sell&&r.jita_sell?(r.sell/r.jita_sell-1)*100:null,averagePremium=r.sell_average&&r.jita_average?(r.sell_average/r.jita_average-1)*100:null;const coverage=hist?.daily_volume>0?r.sell_volume/hist.daily_volume:null;return {...r,iconVariant:categoryIndex.imageVariant(r.type_id),history:hist,premium,average_premium:averagePremium,coverage_days:coverage,cache_expired:Date.parse(r.expires)<now(),stale:Date.parse(r.observed)+day<=now(),jita_stale:r.jita_observed?Date.parse(r.jita_observed)+day<=now():true,spread:r.sell&&r.buy?(r.sell-r.buy)/r.sell*100:null};}
 const base=`SELECT i.*,COALESCE(t.name,'Item '||i.type_id) name,t.group_name,j.sell jita_sell,j.buy jita_buy,j.sell_average jita_average,j.observed jita_observed,j.expires jita_expires,v.daily_volume,v.average history_average,v.reported_days,v.period_from,v.period_to,v.updated history_updated,v.expires history_expires FROM market_items i LEFT JOIN market_hubs mh ON mh.id=i.hub_id LEFT JOIN market_types t ON t.type_id=i.type_id LEFT JOIN market_items j ON j.hub_id=${JITA} AND j.type_id=i.type_id LEFT JOIN market_history v ON v.region_id=mh.region_id AND v.type_id=i.type_id WHERE i.hub_id=?`;
 function categories(id){const h=hub(id);return categoryIndex.overview(db.prepare('SELECT type_id FROM market_items WHERE hub_id=?').all(h.id));}
 /** Local reads: zero-based pages, 60 items per page; shrinking books clamp the page. */
 function browse(id,params={}){const h=hub(id),requested=Math.max(0,Math.min(10000,Math.floor(Number(params.page)||0))),q=String(params.query||'').trim().toLowerCase().slice(0,150),filter=String(params.filter||'all');let where='',args=[h.id];if(params.category&&params.category!=='all'){where+=' AND i.type_id '+(params.category==='unknown'?'NOT IN':'IN')+' (SELECT value FROM json_each(?))';args.push(params.category==='unknown'?categoryIndex.known:categoryIndex.ids(params.category));}if(q){where+=' AND (instr(lower(COALESCE(t.name,\'\')),?)>0 OR CAST(i.type_id AS TEXT)=?)';args.push(q,q);}if(filter==='quick'){const ids=store.get('market:quick',[]);where+=' AND i.type_id IN ('+(ids.map(()=>'?').join(',')||'NULL')+')';args.push(...ids);}if(filter==='sell')where+=' AND i.sell_volume>0';if(filter==='empty')where+=' AND i.sell_volume=0';const sorts={name:'name COLLATE NOCASE ASC',sell:'i.sell IS NULL,i.sell ASC',premium:'(i.sell / NULLIF(j.sell,0)) DESC',quantity:'i.sell_volume ASC'};const count=db.prepare('SELECT COUNT(*) n FROM ('+base+where+')').get(...args).n;const page=Math.min(requested,Math.max(0,Math.ceil(count/60)-1));const rows=db.prepare(base+where+' ORDER BY '+(sorts[params.sort]||sorts.name)+' LIMIT 60 OFFSET ?').all(...args,page*60).map(r=>decorate(r,h));return {rows,total:count,page,pages:Math.max(1,Math.ceil(count/60)),hub:h.name};}
 /** Return one cached item with at most 40 sorted orders; an unscanned item throws. */
 function detail(id,typeId,params={}){const h=hub(id),r=db.prepare(base+' AND i.type_id=?').get(h.id,Number(typeId));if(!r)throw new Error('Scan this item at the selected hub first.');const side=params.side==='buy'?1:0,total=side?r.buy_orders:r.sell_orders,orderPage=Math.max(0,Math.min(20000,Math.floor(Number(params.page)||0),Math.ceil(total/40)-1)),orders=db.prepare('SELECT * FROM market_orders WHERE hub_id=? AND type_id=? AND buy=? ORDER BY price '+(side?'DESC':'ASC')+',order_id LIMIT 40 OFFSET ?').all(h.id,r.type_id,side,orderPage*40);return {item:decorate(r,h),history:history(h,r.type_id),orders,page:orderPage,total,station:h.station_name};}
 /** Local signal report: percentage thresholds, regional cover in days, 40 rows/page. */
 function report(id,params={}){const h=hub(id),requested=Math.max(0,Math.min(10000,Math.floor(Number(params.page)||0))),threshold=Math.max(1,Math.min(1000,Number(params.threshold)||20)),cover=Math.max(.01,Math.min(30,Number(params.cover)||1)),signal=params.signal||'premium';
  const conditions={premium:['(i.sell / NULLIF(j.sell,0)-1)*100>=?',[threshold],'i.sell / NULLIF(j.sell,0) DESC'],undersupply:['v.expires>? AND v.reported_days>=7 AND v.daily_volume>=1 AND i.sell_volume/v.daily_volume<?',[iso(now()),cover],'i.sell_volume/v.daily_volume ASC'],bargain:['(i.sell / NULLIF(j.sell,0)-1)*100<=?',[-threshold],'i.sell / NULLIF(j.sell,0) ASC'],spread:['(i.sell-i.buy)/NULLIF(i.sell,0)*100>=?',[threshold],'(i.sell-i.buy)/NULLIF(i.sell,0) DESC']};
  const counts={};for(const [key,[where,args]] of Object.entries(conditions))counts[key]=db.prepare('SELECT COUNT(*) n FROM ('+base+' AND '+where+')').get(h.id,...args).n;
  const total=counts[signal]??counts.premium,page=Math.min(requested,Math.max(0,Math.ceil(total/40)-1));const [where,args,sort]=conditions[signal]||conditions.premium,rows=db.prepare(base+' AND '+where+' ORDER BY '+sort+' LIMIT 40 OFFSET ?').all(h.id,...args,page*40).map(r=>decorate(r,h));
  const stats=db.prepare('SELECT COUNT(*) items,SUM(CASE WHEN jita_sell>0 AND sell>0 THEN 1 ELSE 0 END) comparable,SUM(CASE WHEN history_updated IS NOT NULL THEN 1 ELSE 0 END) historyCount,SUM(CASE WHEN observed<=? THEN 1 ELSE 0 END) stale FROM ('+base+')').get(iso(now()-day),h.id);
  return {...stats,rows,total,page,pages:Math.max(1,Math.ceil(total/40)),counts,threshold,cover,generatedAt:iso(now())};}
 async function enrichType(id){enabled();id=Number(id);if(!validId(id)||!db.prepare('SELECT type_id FROM market_types WHERE type_id=?').get(id))throw new Error('Choose an existing item.');const r=await request('/universe/types/'+id,{ttl:86400}),t=r.data;if(!t.market_group_id)return null;const g=(await request('/markets/groups/'+t.market_group_id,{ttl:86400})).data;db.prepare('UPDATE market_types SET group_name=?,volume=? WHERE type_id=?').run(g.name,Number.isFinite(t.volume)?t.volume:null,id);return {group:g.name,volume:t.volume};}
 const imports=createImports(store,auth,{now,request,refreshCharacter});
 if(autoUpgrade)queueMicrotask(()=>resumeUpgrade());
 return {overview,resumeUpgrade,categories,addHub,removeHub,restoreDefaults,discover,lookupType,quickChange,start,cancel,browse,detail,report,enrichType,imports,async idle(){await task;},async close(){stopped=true;if(current?.status==='running')current.cancelled=true;archives.cancel();await task;await imports.close();}};
}
