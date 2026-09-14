import {snapshotFresh} from './polling.mjs';
import {sessionCollection} from './session-policy.mjs';

export const COMBAT_BUFFER_MS = 10 * 60 * 1000;
const iso = at => new Date(at).toISOString();
const validId = id => Number.isSafeInteger(id) && id > 0;
export const killValue = k => typeof k?.zkb?.totalValue === 'number' && Number.isFinite(k.zkb.totalValue) && k.zkb.totalValue >= 0 ? k.zkb.totalValue : null;

export function loyaltySample(snapshot) {
    if (!snapshotFresh(snapshot) || !Array.isArray(snapshot.data) || !Number.isFinite(Date.parse(snapshot.updatedAt))) return null;
    if (snapshot.data.some(r => !validId(r.corporation_id) || !Number.isSafeInteger(r.loyalty_points) || r.loyalty_points < 0)) return null;
    return {balances: snapshot.data.map(r => ({corporation_id:r.corporation_id, loyalty_points:r.loyalty_points})), sampledAt:snapshot.updatedAt, expiresAt:snapshot.expiresAt};
}

// Keep the original end sample. A later balance has no transaction timestamps,
// so expose reconciliation as an estimate and never assign it across sessions.
export function reconcileSessionLoyalty(store, characterId) {
    const sample = loyaltySample(store.snapshot(characterId, 'loyalty'));
    if (!sample) return;
    const rows = store.db.prepare(`SELECT * FROM sessions WHERE character_id=? AND ended IS NOT NULL
        AND json_type(start_context,'$.loyalty')='object' AND json_type(end_context,'$.loyaltyReconciliation') IS NULL`).all(characterId);
    for (const session of rows) {
        if (Date.parse(sample.sampledAt) <= Date.parse(session.ended)) continue;
        const finish = JSON.parse(session.end_context);
        const next = store.db.prepare('SELECT id FROM sessions WHERE character_id=? AND started>=? AND started<=? AND id<>? LIMIT 1').get(characterId, session.ended, sample.sampledAt, session.id);
        finish.loyaltyReconciliation = next || JSON.parse(session.start_context).loyaltyBaselineOverlap ? {status:'overlap', checkedAt:sample.sampledAt} : {status:'delayed', sample};
        store.db.prepare('UPDATE sessions SET end_context=? WHERE id=?').run(JSON.stringify(finish), session.id);
    }
}

export function loyaltyReport(start, finish, ended, names={}) {
    const a = start.loyalty, reconciliation = finish.loyaltyReconciliation;
    const b = reconciliation?.status === 'delayed' ? reconciliation.sample : finish.loyalty;
    if (!a || !b) return {status:'unavailable', rows:[], delta:null, startSampledAt:a?.sampledAt, endSampledAt:b?.sampledAt};
    const before = new Map(a.balances.map(r => [r.corporation_id,r.loyalty_points]));
    const after = new Map(b.balances.map(r => [r.corporation_id,r.loyalty_points]));
    const rows = [...new Set([...before.keys(),...after.keys()])].map(id => ({corporationId:id, name:names[id] || 'Corporation '+id, start:before.get(id)||0, end:after.get(id)||0, delta:(after.get(id)||0)-(before.get(id)||0)})).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.name.localeCompare(b.name));
    const status = start.loyaltyBaselineOverlap ? 'overlap' : reconciliation?.status || (ended ? 'pending' : 'live');
    return {status, rows, delta:rows.reduce((n,r)=>n+r.delta,0), startSampledAt:a.sampledAt, endSampledAt:b.sampledAt, sameSample:a.sampledAt===b.sampledAt, scope:'esi-characters.read_loyalty.v1'};
}

export function sessionRoute(store, session, start, end) {
    const from = Date.parse(session.started), to = Date.parse(end);
    const names = store.get('names',{});
    const rows = store.db.prepare(`SELECT v.*,u.region_id,u.region_name,u.security FROM visits v
        LEFT JOIN universe_systems u USING(system_id) WHERE character_id=? AND at>=? AND at<? ORDER BY at,id`).all(session.character_id,session.started,end);
    let initial = start.system && validId(start.system.id) ? {system_id:start.system.id, name:start.system.name, at:session.started, ship_type_id:start.shipTypeId, clipped:true} : null;
    if (!initial && !start.capturedAt) {
        const prior = store.db.prepare('SELECT * FROM visits WHERE character_id=? AND at<=? ORDER BY at DESC,id DESC LIMIT 1').get(session.character_id,session.started);
        if (prior) initial = {...prior, at:session.started, clipped:true, inferred:true};
    }
    const points = [];
    if(initial&&rows[0]?.system_id===initial.system_id&&Date.parse(rows[0].at)===from)initial=null;
    for (const row of [...(initial?[initial]:[]), ...rows]) {
        const system = store.db.prepare('SELECT * FROM universe_systems WHERE system_id=?').get(row.system_id);
        points.push({...row, name:row.name||system?.name||names[row.system_id]||String(row.system_id), region_id:system?.region_id??row.region_id, region_name:system?.region_name??row.region_name, security:system?.security??row.security});
    }
    return points.map((v,i) => {
        const entered = Math.max(from,Date.parse(v.at)), exited = Math.min(to,Date.parse(points[i+1]?.at||end));
        return {id:v.id||'start', systemId:v.system_id, name:v.name, regionId:v.region_id, regionName:v.region_name, security:v.security, entered:iso(entered), exited:iso(exited), seconds:Math.max(0,Math.floor((exited-entered)/1000)), shipTypeId:v.ship_type_id, clipped:!!v.clipped, inferred:!!v.inferred, active:!session.ended && i===points.length-1};
    });
}

export function sessionShips(store, session, start, end, names) {
    const rows = store.db.prepare(`SELECT payload,at FROM events WHERE character_id=? AND type='ship.changed' AND at>=? AND at<? AND (at>? OR id>?) ORDER BY at,id`).all(session.character_id,session.started,end,session.started,start.eventCursor??0);
    const points = start.shipTypeId ? [{typeId:start.shipTypeId, shipId:start.ship?.id||null, at:session.started}] : [];
    for (const row of rows) {
        const p = JSON.parse(row.payload);
        if (validId(p.ship_type_id)) points.push({typeId:p.ship_type_id, shipId:p.ship_id||null, at:row.at});
    }
    const changes = points.map((p,i)=>({...p, name:names[p.typeId]||'Hull '+p.typeId, until:points[i+1]?.at||end, seconds:Math.max(0,Math.floor((Date.parse(points[i+1]?.at||end)-Date.parse(p.at))/1000))}));
    const types = new Map();
    for (const p of changes) {
        const hull = types.get(p.typeId)||{typeId:p.typeId,name:p.name,seconds:0,stints:0};
        hull.seconds+=p.seconds; hull.stints++; types.set(p.typeId,hull);
    }
    return {hulls:[...types.values()], changes, initialRecorded:!!start.shipTypeId};
}

export function allianceSides(k, allianceId) {
    // A friendly attacker can appear on an alliance member's loss. The victim
    // determines the side first, so that ship never also adds destroyed ISK.
    const loss=!!allianceId && k.victim?.alliance_id===allianceId;
    return {kill:!!allianceId && !loss && !!k.attackers?.some(a=>a.alliance_id===allianceId),loss};
}

export function mergeCombatWindows(windows) {
    const merged = [];
    for (const w of [...windows].sort((a,b)=>a.systemId-b.systemId||Date.parse(a.from)-Date.parse(b.from))) {
        const last = merged.at(-1);
        if (last && last.systemId===w.systemId && Date.parse(w.from)<=Date.parse(last.to)) {
            if (Date.parse(w.to)>Date.parse(last.to)) last.to=w.to;
            last.visitIds=[...new Set([...last.visitIds,...w.visitIds])];
        } else merged.push({...w,visitIds:[...w.visitIds]});
    }
    return merged;
}

export function allianceSummary(route, records, allianceId, now=Date.now()) {
    const relevant = [...new Map(records.filter(k=>{const s=allianceSides(k,allianceId);return s.kill||s.loss;}).map(k=>[k.killmail_id,k])).values()];
    // Presence qualifies the visit FIRST. A buffered kill must never qualify a
    // quiet transit or recursively extend a window into another engagement.
    const visits = route.map(v=>({...v, combatActive:relevant.some(k=>k.solar_system_id===v.systemId && Date.parse(k.killmail_time)>=Date.parse(v.entered) && Date.parse(k.killmail_time)<Date.parse(v.exited))}));
    const windows = mergeCombatWindows(visits.filter(v=>v.combatActive).map(v=>({systemId:v.systemId,name:v.name,from:iso(Date.parse(v.entered)-COMBAT_BUFFER_MS),to:iso(Date.parse(v.exited)+COMBAT_BUFFER_MS),visitIds:[v.id]})));
    const matches = relevant.filter(k=>Date.parse(k.killmail_time)<=now && windows.some(w=>w.systemId===k.solar_system_id && Date.parse(k.killmail_time)>=Date.parse(w.from) && Date.parse(k.killmail_time)<Date.parse(w.to)));
    let kills=0,losses=0,destroyed=0,lost=0,missingDestroyed=0,missingLost=0;
    const items = matches.sort((a,b)=>Date.parse(b.killmail_time)-Date.parse(a.killmail_time)||b.killmail_id-a.killmail_id).map(k=>{
        const sides=allianceSides(k,allianceId),value=killValue(k);
        if(sides.kill){kills++;if(value===null)missingDestroyed++;else destroyed+=value;}
        if(sides.loss){losses++;if(value===null)missingLost++;else lost+=value;}
        return {killmailId:k.killmail_id,at:k.killmail_time,systemId:k.solar_system_id,shipTypeId:k.victim.ship_type_id,...sides,value};
    });
    return {allianceId,visits,windows,items,kills,losses,destroyed,lost,missingDestroyed,missingLost,combatVisits:visits.filter(v=>v.combatActive).length};
}

export function sessionDetails(store, session, start, finish, end) {
    const names=store.get('names',{}),route=sessionRoute(store,session,start,end);
    // The alliance current at session start stays attached to the historical
    // flight. Older sessions without this evidence cannot reconstruct it.
    const allianceId=start.alliance?.id||null;
    const records=[];
    if(allianceId)for(const systemId of new Set(route.map(v=>v.systemId))){
        records.push(...store.db.prepare('SELECT body FROM alliance_combat_records WHERE alliance_id=? AND system_id=? AND at>=? AND at<?').all(allianceId,systemId,iso(Date.parse(session.started)-COMBAT_BUFFER_MS),iso(Date.parse(end)+COMBAT_BUFFER_MS)).map(r=>JSON.parse(r.body)));
    }
    const personal=store.db.prepare('SELECT body FROM combat_records WHERE character_id=? AND at>=? AND at<? ORDER BY at DESC,killmail_id DESC').all(session.character_id,session.started,end).map(r=>JSON.parse(r.body));
    const personalCombat={items:personal.map(k=>({killmailId:k.killmail_id,at:k.killmail_time,systemId:k.solar_system_id,shipTypeId:k.victim.ship_type_id,result:k.result,value:killValue(k)})),destroyed:0,lost:0,missingDestroyed:0,missingLost:0};
    for(const k of personal){const key=k.result==='loss'?'lost':'destroyed',missing=k.result==='loss'?'missingLost':'missingDestroyed',value=killValue(k);if(value===null)personalCombat[missing]++;else personalCombat[key]+=value;}
    const allianceCombat=allianceSummary(route,records,allianceId);
    allianceCombat.name=start.alliance?.name||names[allianceId]||null;
    allianceCombat.coverage=store.get('session:combat:'+session.id,{status:allianceId?'waiting':start.coverage?.profile==='ready'?'no_alliance':'unavailable'});
    if(!store.get('module:combat',true))allianceCombat.coverage={...allianceCombat.coverage,status:'disabled'};
    const recordNames=Object.fromEntries([...new Set([...personalCombat.items,...allianceCombat.items].flatMap(k=>[k.systemId,k.shipTypeId]))].filter(id=>names[id]).map(id=>[id,names[id]]));
    const collection=sessionCollection(session),feed=collection.phase==='live'?store.get('session:live-feed',null):null;
    return {route:allianceCombat.visits,ships:sessionShips(store,session,start,end,names),loyalty:loyaltyReport(start,finish,!!session.ended,names),personalCombat,allianceCombat,names:recordNames,collection,liveFeed:feed?{status:feed.status,checkedAt:feed.checkedAt,nextCheckAt:feed.nextCheckAt,error:feed.error}:null};
}
