import {setTimeout as wait} from 'node:timers/promises';
import {killValue} from './session-details.mjs';

const HOUR=3600000, DAY=24*HOUR;
const validId=id=>Number.isSafeInteger(id)&&id>0;
// Credit every recorded attacker, including zero-damage EWAR, independently of
// the final_blow flag. Membership in the same fleet/corporation is insufficient.
export function participation(killmail,characterId){
 if(killmail?.victim?.character_id===characterId)return 'loss';
 return Array.isArray(killmail?.attackers)&&killmail.attackers.some(a=>a.character_id===characterId)?'kill':null;
}
export function createCombat(store,auth,esi,{publish,resolveNames=async()=>{},onChange=()=>{},fetcher=fetch,now=Date.now,spacingMs=1100}={}){
 const pending=new Map(),publicPending=new Map();let nextRequest=0,closed=false,queue=Promise.resolve();
 const active=id=>!closed&&store.get('module:combat',true)&&auth.characters().some(c=>c.id===id&&!c.needsReauth);
 const recent=id=>store.db.prepare('SELECT body FROM combat_records WHERE character_id=? ORDER BY at DESC,killmail_id DESC LIMIT 200').all(id).map(r=>JSON.parse(r.body));
 const coverage=id=>store.snapshot(id,'combat_public')||{status:'waiting',data:null};
 const get=store.db.prepare('SELECT body FROM combat_records WHERE character_id=? AND killmail_id=?');
 function record(id,raw,source){
  const result=participation(raw,id),time=Date.parse(raw?.killmail_time);
  if(!result||!validId(raw.killmail_id)||!validId(raw.solar_system_id)||!validId(raw.victim?.ship_type_id)||!Number.isFinite(time)||time>now()+60000)return false;
  const killmail={...raw,killmail_time:new Date(time).toISOString(),result};delete killmail.zkb;
  const existing=get.get(id,raw.killmail_id),value=killValue(raw)??(existing?killValue(JSON.parse(existing.body)):null);
  if(value!==null)killmail.zkb={totalValue:value};
  store.db.prepare(`INSERT INTO combat_records VALUES(?,?,?,?,?,?) ON CONFLICT(character_id,killmail_id) DO UPDATE SET result=excluded.result,at=excluded.at,body=excluded.body,source=CASE WHEN source='esi' THEN source ELSE excluded.source END`).run(id,killmail.killmail_id,result,killmail.killmail_time,JSON.stringify(killmail),source);
  const names=store.get('names',{}),started=store.get('combat.started:'+id,now()),historical=time<started;
  publish?.({type:'killmail.'+result,module:'combat',characterId:id,at:killmail.killmail_time,historical,summary:(result==='loss'?'Lost ':'Participated in kill: ')+(names[killmail.victim.ship_type_id]||'ship'),payload:{killmail_id:killmail.killmail_id,system_id:killmail.solar_system_id,system_name:names[killmail.solar_system_id],ship_type_id:killmail.victim.ship_type_id,hull_name:names[killmail.victim.ship_type_id],attackers:killmail.attackers?.length||0,damage_taken:killmail.victim.damage_taken,participation:result==='kill',source},dedupe:'killmail:'+id+':'+killmail.killmail_id});
  return true;
 }
 async function ingest(id,refs,source='esi'){
  if(!active(id)||!Array.isArray(refs))return {pending:0,failed:0};
  if(!store.get('combat.started:'+id,0))store.set('combat.started:'+id,now());
  // Migrate retained snapshots into the durable ledger before the first refresh.
  for(const old of store.snapshot(id,'killmails')?.data||[])if(!get.get(id,old.killmail_id))record(id,old,'esi');
  let remaining=0,failed=0,fetched=0;
  const records=[];
  for(const ref of refs){
   if(!active(id))break;
   if(!validId(ref?.killmail_id))continue;
   const existing=get.get(id,ref.killmail_id);
   if(existing){const raw=JSON.parse(existing.body);if(killValue(ref)!==null)raw.zkb={totalValue:killValue(ref)};if(killValue(ref)!==null||!store.db.prepare('SELECT 1 FROM events WHERE dedupe=?').get('killmail:'+id+':'+ref.killmail_id))record(id,raw,source);continue;}
   // Both current full ESI-format zKillboard responses and historical hash-only
   // responses are accepted. Details are always verified with the ESI hash.
   const hash=ref.killmail_hash||ref.zkb?.hash;
   if(!/^[a-f0-9]{40}$/i.test(hash||'')){failed++;continue;}
   if(fetched>=100){remaining++;continue;}
   fetched++;
   try{
    const response=await esi.request('/killmails/'+ref.killmail_id+'/'+hash,{ttl:86400});
    if(response.stale||response.data?.killmail_id!==ref.killmail_id){failed++;continue;}
    if(active(id)&&participation(response.data,id))records.push({...response.data,...(killValue(ref)!==null?{zkb:{totalValue:killValue(ref)}}:{})});
   }catch{failed++;}
  }
  if(records.length&&active(id)){
   await resolveNames(records);
   if(active(id))for(const raw of records)record(id,raw,source);
  }
  return {pending:remaining,failed};
 }
 async function fetchPublicPage(id,path,key){
  const cached=store.db.prepare('SELECT * FROM cache WHERE key=?').get(key);
  if(cached&&cached.expires>now())return {refs:JSON.parse(cached.body),updatedAt:new Date(cached.updated).toISOString(),expiresAt:new Date(cached.expires).toISOString()};
  const task=queue.then(async()=>{
   if(nextRequest>now())await wait(nextRequest-now());
   if(!active(id))throw new Error('Combat collection is paused.');
   const cooldown=store.get('combat.public.cooldown',0);if(cooldown>now())throw new Error('zKillboard is cooling down; saved kills are retained.');
   nextRequest=now()+spacingMs;
   const response=await fetcher('https://zkillboard.com/api/'+path,{headers:{Accept:'application/json','Accept-Encoding':'gzip','User-Agent':'Kairo/0.7.3 (https://github.com/BunBajiro/kairo)'},signal:AbortSignal.timeout(15000),redirect:'error'});
   if(!response.ok){
    const retry=response.headers.get('retry-after'),ms=retry?(Number.isFinite(Number(retry))?Number(retry)*1000:Date.parse(retry)-now()):HOUR;
    if([403,420,429,503].includes(response.status))store.set('combat.public.cooldown',now()+Math.max(HOUR,Number.isFinite(ms)?ms:HOUR));
    throw new Error('zKillboard is unavailable ('+response.status+'). Saved participation records are retained.');
   }
   const rows=await response.json();if(!Array.isArray(rows))throw new Error('zKillboard returned an invalid response. Saved kills are retained.');
   const refs=rows.slice(0,1000).map(r=>({killmail_id:r.killmail_id,killmail_hash:r.killmail_hash||r.zkb?.hash,killmail_time:r.killmail_time,...(killValue(r)!==null?{zkb:{totalValue:killValue(r)}}:{})})).filter(r=>validId(r.killmail_id)&&/^[a-f0-9]{40}$/i.test(r.killmail_hash||''));
   if(refs.length!==rows.length)throw new Error('zKillboard returned incomplete killmail references. Retrying later.');
   const max=Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/i)?.[1]||0)*1000,expiresHeader=Date.parse(response.headers.get('expires')||''),at=now(),expires=Math.max(at+HOUR,at+max,Number.isFinite(expiresHeader)?expiresHeader:0);
   store.db.prepare('INSERT INTO cache VALUES(?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body,expires=excluded.expires,updated=excluded.updated,headers=excluded.headers').run(key,JSON.stringify(refs),null,expires,at,'{}');
   return {refs,updatedAt:new Date(at).toISOString(),expiresAt:new Date(expires).toISOString()};
  });queue=task.catch(()=>{});return task;
 }
 function publicPage(id,path,key='zkill:query:'+path){
  if(!active(id))return Promise.reject(new Error('Combat collection is paused.'));
  if(publicPending.has(key))return publicPending.get(key);
  const task=fetchPublicPage(id,path,key).finally(()=>publicPending.delete(key));publicPending.set(key,task);return task;
 }
 const page=(id,number)=>publicPage(id,'characterID/'+id+'/'+(number===1?'':'page/'+number+'/'),'zkill:character:'+id+':page:'+number);
 async function run(id){
  if(!active(id))return;
  const prior=coverage(id);if(Date.parse(prior.retryAt||prior.expiresAt||'')>now())return;
  const started=now();if(!store.get('combat.started:'+id,0))store.set('combat.started:'+id,started);
  try{
   let expiresAt,updatedAt,pages=0,partial=false,limitReached=false;
   // First collect the latest page; walk older pages when needed. Local records
   // never fall out of a report when the source's recent window moves forward.
   for(let number=1;number<=100&&active(id);number++){
    const r=await page(id,number);expiresAt=expiresAt&&expiresAt<r.expiresAt?expiresAt:r.expiresAt;updatedAt=r.updatedAt;pages++;
    const refs=r.refs.filter(k=>!k.killmail_time||Date.parse(k.killmail_time)>=started-90*DAY);
    const result=await ingest(id,refs,'zkillboard');
    if(result.pending||result.failed){partial=true;break;}
    if(r.refs.length<200||refs.length<r.refs.length)break;
    if(number===100){partial=true;limitReached=true;}
   }
   if(active(id))store.saveSnapshot(id,'combat_public',{status:partial?'partial':'ready',updatedAt,expiresAt,retryAt:partial&&!limitReached?new Date(now()+60000).toISOString():expiresAt,pages,limitReached,windowDays:90,data:null,detail:limitReached?'The public API page limit was reached; coverage is incomplete.':partial?'More killmail details are awaiting collection.':'Public participation records collected. zKillboard responses are cached for at least one hour.'});
  }catch(error){if(active(id))store.saveSnapshot(id,'combat_public',{...prior,status:prior.updatedAt?'stale':'error',error:error.message,retryAt:new Date(Math.max(now()+60000,store.get('combat.public.cooldown',0))).toISOString(),data:null});}
  if(active(id))onChange(id);
 }
 function syncPublic(id){if(pending.has(id))return pending.get(id);const task=run(id).finally(()=>pending.delete(id));pending.set(id,task);return task;}
 return {ingest,recent,coverage,syncPublic,publicPage,async close(){closed=true;await Promise.allSettled([...pending.values(),...publicPending.values()]);}};
}
