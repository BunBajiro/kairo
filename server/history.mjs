/**
 * Private Session commands, boundary snapshots and paginated reports. Session
 * ownership is per pilot; travel, combat and LP projections retain their own
 * evidence rules in the session-* helpers. See ../docs/SESSIONS.md.
 */
import {randomUUID} from 'node:crypto';
import {snapshotFresh} from './polling.mjs';
import {loyaltySample,reconcileSessionLoyalty,sessionDetails} from './session-details.mjs';
import {captureVisitSovereignty} from './visit-sovereignty.mjs';
import {readSessionVisits} from './session-travel.mjs';
import {sessionEventWindow} from './session-event-window.mjs';
/**
 * Capture fresh enabled-source baselines and the current event cursor without
 * collecting data. Missing values remain null with explicit coverage; do not
 * backfill the baseline from a later snapshot.
 */
export function captureContext(store,characterId){
 const owners={wallet:'wallet',journal:'wallet',skills:'training',location:'pilot',ship:'pilot',profile:'pilot',loyalty:'combat',killmails:'combat',jobs:'industry'};
 const snap=key=>{const s=store.snapshot(characterId,key);return store.get('module:'+owners[key],true)&&snapshotFresh(s)?s:null;},wallet=snap('wallet'),skills=snap('skills'),location=snap('location'),ship=snap('ship'),profile=snap('profile');
 const capturedAt=new Date().toISOString();
 return {capturedAt,eventCursor:store.db.prepare('SELECT COALESCE(MAX(id),0) id FROM events').get().id,wallet:wallet?{value:wallet.data,sampledAt:wallet.updatedAt}:null,skillpoints:skills?.data?.total_sp??null,system:location?{id:location.data.solar_system_id,name:location.data.system?.name,sovereignty_at_visit:captureVisitSovereignty(store,location.data.solar_system_id,capturedAt)}:null,shipTypeId:ship?.data?.ship_type_id||null,ship:ship?{id:ship.data.ship_id,name:ship.data.ship_name,sampledAt:ship.updatedAt}:null,alliance:profile?.data?.alliance_id?{id:profile.data.alliance_id,name:profile.data.alliance?.name||store.get('names',{})[profile.data.alliance_id],sampledAt:profile.updatedAt}:null,loyalty:loyaltySample(snap('loyalty')),coverage:Object.fromEntries(['wallet','journal','skills','jobs','killmails','location','ship','profile','loyalty'].map(key=>[key,!store.get('module:'+owners[key],true)?'disabled':snap(key)?'ready':store.snapshot(characterId,key)?.status==='ready'?'stale':store.snapshot(characterId,key)?.status||'waiting']))};
}
/**
 * Start/end one pilot's active Session, persist its boundary before publishing
 * the semantic event, and return {id}. Duplicate starts, invalid actions and
 * ending without an active Session throw. Caller owns pilot authorization.
 */
export function changeSession(store,publish,characterId,input){
 if(!characterId)throw new Error('Connect a character before starting a session.');const active=store.db.prepare('SELECT * FROM sessions WHERE character_id=? AND ended IS NULL').get(characterId),at=new Date().toISOString();
 if(input.action==='start'){
  reconcileSessionLoyalty(store,characterId);
  if(active)throw new Error('A session is already active for this character.');const id=randomUUID(),label=String(input.label||'Flight session').trim().slice(0,100)||'Flight session';
  const context=captureContext(store,characterId);
  if(context.loyalty)context.loyaltyBaselineOverlap=!!store.db.prepare('SELECT id FROM sessions WHERE character_id=? AND ended>? AND ended<=? LIMIT 1').get(characterId,context.loyalty.sampledAt,at);
  store.db.prepare('INSERT INTO sessions(id,character_id,label,started,start_context) VALUES(?,?,?,?,?)').run(id,characterId,label,at,JSON.stringify(context));
  publish({type:'session.started',module:'sessions',characterId,at,summary:'Session started: '+label,payload:{session_id:id,session_name:label}});return {id};
 }
 if(input.action==='end'&&active){store.db.prepare('UPDATE sessions SET ended=?,end_context=? WHERE id=?').run(at,JSON.stringify(captureContext(store,characterId)),active.id);publish({type:'session.ended',module:'sessions',characterId,at,summary:'Session ended: '+active.label,payload:{session_id:active.id,session_name:active.label,duration_minutes:Math.floor((Date.parse(at)-Date.parse(active.started))/60000)}});return {id:active.id};}
 throw new Error('There is no active session to end.');
}
/**
 * Read an owned Session and 100 events at an offset. Reuse returned eventCursor
 * and eventEnd on later pages to hold event membership stable; detail projections
 * can still gain delayed evidence. Unknown ownership/invalid snapshot bounds throw.
 * Report durations are seconds, wallet values ISK, and unavailable deltas null.
 */
export function sessionReport(store,id,characterId,offset=0,paging={}){
 const session=store.db.prepare('SELECT * FROM sessions WHERE id=? AND character_id=?').get(id,characterId);if(!session)throw new Error('Session not found for this character.');
 const currentEnd=session.ended||new Date().toISOString(),maxCursor=store.db.prepare('SELECT COALESCE(MAX(id),0) id FROM events').get().id;
 const eventCursor=paging.eventCursor??maxCursor,eventEnd=paging.eventEnd??currentEnd;
 if(!Number.isSafeInteger(eventCursor)||eventCursor<0||eventCursor>maxCursor||typeof eventEnd!=='string'||!Number.isFinite(Date.parse(eventEnd))||Date.parse(eventEnd)<Date.parse(session.started)||Date.parse(eventEnd)>Date.parse(currentEnd))throw new Error('Choose a valid session event snapshot.');
 const end=new Date(eventEnd).toISOString(),start=JSON.parse(session.start_context),finish=session.ended?JSON.parse(session.end_context):captureContext(store,characterId);
 const {where,params}=sessionEventWindow(session,start,finish,end,{eventCursor});
 const counts=store.db.prepare(`SELECT type,COUNT(*) count FROM events WHERE ${where} GROUP BY type`).all(...params),events=store.db.prepare(`SELECT * FROM events WHERE ${where} ORDER BY at,id LIMIT 101 OFFSET ?`).all(...params,offset),stats=Object.fromEntries(counts.map(c=>[c.type,c.count]));
 const travel=readSessionVisits(store,session,end,{inclusiveEnd:true}),visits=travel.map(({system_name,...visit})=>visit);
 const cash=store.db.prepare(`SELECT COALESCE(SUM(CASE WHEN json_extract(payload,'$.amount')>0 THEN json_extract(payload,'$.amount') ELSE 0 END),0) income,COALESCE(SUM(CASE WHEN json_extract(payload,'$.amount')<0 THEN -json_extract(payload,'$.amount') ELSE 0 END),0) expenses FROM events WHERE ${where} AND type='wallet.entry'`).get(...params);
 const details=sessionDetails(store,session,start,finish,end,travel);
 details.personalCombat.missingDestroyed+=Math.max(0,(stats['killmail.kill']||0)-details.personalCombat.items.filter(k=>k.result==='kill').length);
 details.personalCombat.missingLost+=Math.max(0,(stats['killmail.loss']||0)-details.personalCombat.items.filter(k=>k.result==='loss').length);
 // Only event membership is snapshotted; external combat/source projections
 // can change independently. A paging UI retains its initial summary/details.
 return {session:{...session,start_context:undefined,end_context:undefined},start,finish,...details,combatCoverage:store.snapshot(characterId,'combat_public')||{status:'waiting'},durationSeconds:Math.max(0,Math.floor((Date.parse(end)-Date.parse(session.started))/1000)),stats:{...stats,events:counts.reduce((n,c)=>n+c.count,0),systems:new Set(details.route.map(v=>v.systemId)).size,kills:stats['killmail.kill']||0,losses:stats['killmail.loss']||0,skillLevels:stats['skill.completed']||0,jobs:stats['industry.ready']||0,goals:stats['goal.completed']||0,shipChanges:stats['ship.changed']||0,walletDelta:typeof start.wallet?.value==='number'&&typeof finish.wallet?.value==='number'?finish.wallet.value-start.wallet.value:null,skillpointDelta:typeof start.skillpoints==='number'&&typeof finish.skillpoints==='number'?finish.skillpoints-start.skillpoints:null,...cash},visits,events:events.slice(0,100).map(e=>({...e,payload:JSON.parse(e.payload)})),more:events.length>100,offset,eventCursor,eventEnd:end};
}
