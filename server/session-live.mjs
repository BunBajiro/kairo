/**
 * Session collector for the public R2Z2 sequence feed. Core may inject its shared
 * raw transport, but this owner retains its own durable cursor and retry policy.
 * The accept callback verifies/persists relevant records before acknowledgment.
 * See ../docs/SESSIONS.md for live versus settling collection.
 */
import {setTimeout as delay} from 'node:timers/promises';
import {SESSION_LIVE_INTERVAL,SESSION_RECHECK_WINDOW} from './session-policy.mjs';

const origin='https://r2z2.zkillboard.com/ephemeral/',key='session:live-feed';
const iso=at=>new Date(at).toISOString(),validId=id=>Number.isSafeInteger(id)&&id>0;

/**
 * One bounded cursor serves the installation. accept discards unrelated packets;
 * they are never retained as a global killmail cache.
 * getTargets builds current live owners only when due; isTargetActive rechecks
 * them after awaits. accept must reject until matching records are durable, or
 * the cursor advances. force bypasses cadence, never a persisted cooldown.
 * One sync flight is shared; an explicit Session change refreshes its targets
 * after an await without replaying transport. A target change during acceptance
 * permits one re-offer; further churn retains the cursor for the next pass.
 * close aborts and drains the flight.
 * maxItems and budgetMs bound each pass (budget checked between packet requests).
 */
export function createSessionLiveFeed(store,{getTargets,isTargetActive,accept,onCheck=()=>{},fetcher=fetch,now=Date.now,spacingMs=200,maxItems=300,budgetMs=45000}={}){
 let pending=null,closed=false,lastRequest=0,targetsChanged=false,targetRevision=0;
 const controller=new AbortController();
 const deferred=(state,force)=>Date.parse(state.notBefore||'')>now()||(!force&&Date.parse(state.nextCheckAt||'')>now());
 async function read(path,active){
  const pause=spacingMs-(now()-lastRequest);
  if(pause>0)await delay(pause,undefined,{signal:controller.signal});
  if(!active())return null;
  lastRequest=now();
  const response=await fetcher(origin+path,{headers:{Accept:'application/json','Accept-Encoding':'gzip','User-Agent':'Kairo/0.7.3 (https://github.com/BunBajiro/kairo)'},redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
  if(response.status===404)return null;
  if(!response.ok){
   const error=new Error('Live killmail feed unavailable (HTTP '+response.status+').');
   const retry=response.headers.get('retry-after'),seconds=Number(retry);
   error.retryAt=retry?(Number.isFinite(seconds)?now()+seconds*1000:Date.parse(retry)):0;
   if(response.status===429)error.retryAt=Math.max(error.retryAt||0,now()+15*60000);
   throw error;
  }
  const limit=4*1024*1024,reader=response.body?.getReader();
  if(!reader)throw new Error('Live killmail feed returned no data.');
  let size=0;const chunks=[];
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit)throw new Error('Live killmail packet exceeds the size limit.');chunks.push(part.value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
 }
 async function run(targets,force){
  let state=store.get(key,{});
  if(deferred(state,force))return;
  const started=now(),deadline=Date.now()+budgetMs;
  const active=()=>{
   if(closed)return false;
   if(targetsChanged){targetsChanged=false;targets=getTargets();}
   return targets.some(isTargetActive);
  };
  const save=patch=>{state={...state,...patch};store.set(key,state);};
  try{
   if(!validId(state.nextSequence)||Date.parse(state.lastAdvanceAt||state.checkedAt||'')<now()-SESSION_RECHECK_WINDOW){
    const pointer=await read('sequence.json',active);
    if(!validId(pointer?.sequence))throw new Error('Live killmail feed returned an invalid sequence.');
    if(!active())return;
    save({nextSequence:pointer.sequence,lastAdvanceAt:iso(now())});
   }
   let count=0,caughtUp=false;
   while(count<maxItems&&Date.now()<deadline&&active()){
    const sequence=state.nextSequence,packet=await read(sequence+'.json',active);
    if(!active())return;
    if(packet===null){caughtUp=true;save({notBefore:iso(now()+6000)});break;}
    const body=packet.esi||packet,hash=packet.hash||packet.zkb?.hash;
    if(!validId(packet.killmail_id)||body.killmail_id!==packet.killmail_id||!validId(body.solar_system_id)||!Array.isArray(body.attackers)||!validId(body.victim?.ship_type_id)||!Number.isFinite(Date.parse(body.killmail_time))||!/^[a-f0-9]{40}$/i.test(hash||'')||(packet.sequence_id!==undefined&&Number(packet.sequence_id)!==sequence))throw new Error('Live killmail feed returned an invalid packet.');
    for(let attempt=0;attempt<2;attempt++){
     const acceptingRevision=targetRevision;
     await accept({...body,zkb:packet.zkb},hash,targets.filter(isTargetActive));
     if(!active())return;
     if(acceptingRevision===targetRevision)break;
     // Reuse the packet once for newly eligible owners. Continuous lifecycle
     // changes must neither skip evidence nor turn acceptance into an open loop.
     if(attempt===1)return;
    }
    // Advance only after matching records have been verified and retained.
    save({nextSequence:sequence+1,lastAdvanceAt:iso(now())});count++;
   }
   if(active())save({status:caughtUp?'ready':'catching_up',checkedAt:iso(now()),nextCheckAt:iso(Math.max(started+SESSION_LIVE_INTERVAL,now()+6000)),error:null,failures:0,processed:count});
  }catch(error){
   if(active()){
    const failures=(state.failures||0)+1,retry=Math.max(now()+Math.min(3600000,SESSION_LIVE_INTERVAL*2**Math.min(failures-1,5)),Number.isFinite(error.retryAt)?error.retryAt:0);
    save({status:'error',error:error.message,failures,notBefore:iso(retry),nextCheckAt:iso(retry)});
   }
  }finally{if(active())onCheck(targets);}
 }
 function sync({force=false,refreshTargets=false}={}){
  if(closed)return Promise.resolve();
  if(pending){if(refreshTargets){targetsChanged=true;targetRevision++;}return pending;}
  // Routes can span a long session. Build current targets only when work is due.
  if(deferred(store.get(key,{}),force))return Promise.resolve();
  targetsChanged=false;const targets=getTargets();if(!targets.length)return Promise.resolve();
  pending=run(targets,force).finally(()=>{pending=null;});return pending;
 }
 return {sync,async close(){closed=true;controller.abort();await pending?.catch(()=>{});}};
}
