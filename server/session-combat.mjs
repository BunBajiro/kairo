/**
 * Core-owned Session alliance evidence and live personal participation collection.
 * Collection retains verified candidates; session-details.mjs decides whether
 * presence qualifies them for report totals. Historical alliance identity comes
 * from Session start, not today's profile. See ../docs/SESSIONS.md.
 */
import {allianceSides, COMBAT_BUFFER_MS, killValue, sessionRoute} from './session-details.mjs';
import {sessionCollection} from './session-policy.mjs';
import {createSessionLiveFeed} from './session-live.mjs';

const HOUR=3600000, DAY=24*HOUR;
const iso=at=>new Date(at).toISOString();

// Keep the two eligible ranges separate so archived Sessions are not scanned
// on every scheduler tick. Rowid preserves insertion order for equal starts.
export const SESSION_COMBAT_RECENT_SQL=`SELECT id FROM (
    SELECT id,started,1 AS is_open,rowid AS sequence FROM sessions WHERE character_id=? AND ended IS NULL
    UNION ALL
    SELECT id,started,0 AS is_open,rowid AS sequence FROM sessions WHERE character_id=? AND ended>?
) ORDER BY is_open DESC,started DESC,sequence`;

// The current zKill API supports entity + system + calendar month + page.
// Its retired startTime/endTime filters are deliberately not used. Precise
// session/visit windows are applied locally to verified, retained killmails.
/** Group buffered visits by system/UTC month; from/to are epoch milliseconds. */
export function sessionCombatQueries(route) {
    const groups=new Map();
    for(const v of route){
        const from=Date.parse(v.entered)-COMBAT_BUFFER_MS,to=Date.parse(v.exited)+COMBAT_BUFFER_MS;
        const d=new Date(from);d.setUTCDate(1);d.setUTCHours(0,0,0,0);
        while(d.getTime()<to){
            const year=d.getUTCFullYear(),month=d.getUTCMonth()+1,key=v.systemId+':'+year+':'+month;
            const group=groups.get(key)||{systemId:v.systemId,year,month,from,to};
            group.from=Math.min(group.from,from);group.to=Math.max(group.to,to);groups.set(key,group);
            d.setUTCMonth(d.getUTCMonth()+1);
        }
    }
    return [...groups.values()].sort((a,b)=>a.systemId-b.systemId||a.year-b.year||a.month-b.month);
}

/**
 * Share one history flight per Session plus one installation-wide live feed.
 * Live collection stops at Session end; history may settle for 24 hours after it.
 * close() drains this owner before combat/ESI/Store close. Every history pass is
 * bounded to six public pages and 100 new alliance verifications, resuming progress.
 */
export function createSessionCombat(store,auth,esi,combat,{resolveNames=async()=>{},onChange=()=>{},now=Date.now,feedFetcher=fetch,feedOptions={}}={}) {
    const pending=new Map();let closed=false;
    const active=id=>!closed&&store.get('module:combat',true)&&auth.characters().some(c=>c.id===id&&!c.needsReauth);
    const get=store.db.prepare('SELECT body FROM alliance_combat_records WHERE alliance_id=? AND killmail_id=?');
    const put=store.db.prepare(`INSERT INTO alliance_combat_records VALUES(?,?,?,?,?) ON CONFLICT(alliance_id,killmail_id) DO UPDATE SET body=excluded.body`);
    const collecting=session=>active(session.character_id)&&sessionCollection(session,now()).phase!=='static';
    const liveTarget=target=>active(target.session.character_id)&&store.db.prepare('SELECT ended FROM sessions WHERE id=?').get(target.session.id)?.ended===null;
    function liveTargets(){
        return store.db.prepare('SELECT * FROM sessions WHERE ended IS NULL ORDER BY started').all().filter(s=>active(s.character_id)).map(session=>{
            const start=JSON.parse(session.start_context),route=sessionRoute(store,session,start,iso(now()));
            return {session,start,groups:sessionCombatQueries(route)};
        });
    }
    function matches(k,target){
        const t=Date.parse(k.killmail_time),s=target.session,side=allianceSides(k,target.start.alliance?.id);
        const personal=t>=Date.parse(s.started)&&t<=now()&&(k.victim?.character_id===s.character_id||k.attackers?.some(a=>a.character_id===s.character_id));
        const alliance=(side.kill||side.loss)&&target.groups.some(g=>g.systemId===k.solar_system_id&&t>=g.from&&t<g.to);
        return {personal,alliance,any:personal||alliance};
    }
    const live=createSessionLiveFeed(store,{
        ...feedOptions,now,fetcher:feedFetcher,getTargets:liveTargets,isTargetActive:liveTarget,
        onCheck:targets=>{for(const id of new Set(targets.filter(liveTarget).map(t=>t.session.character_id)))onChange(id);},
        accept:async(raw,hash,targets)=>{
            const potential=targets.filter(t=>matches(raw,t).any);if(!potential.length)return;
            const response=await esi.request('/killmails/'+raw.killmail_id+'/'+hash,{ttl:86400}),k=response.data;
            if(response.stale||k?.killmail_id!==raw.killmail_id||!Number.isSafeInteger(k.solar_system_id)||!Number.isSafeInteger(k.victim?.ship_type_id)||!Array.isArray(k.attackers)||!Number.isFinite(Date.parse(k.killmail_time))||Date.parse(k.killmail_time)>now()+60000)throw new Error('A live killmail is awaiting ESI verification.');
            for(const target of potential.filter(liveTarget)){
                const match=matches(k,target),id=target.session.character_id;
                if(match.alliance){
                    const allianceId=target.start.alliance.id,existing=get.get(allianceId,k.killmail_id);
                    const value=killValue(raw)??(existing?killValue(JSON.parse(existing.body)):null),saved={...k,killmail_time:iso(Date.parse(k.killmail_time))};delete saved.zkb;
                    if(value!==null)saved.zkb={totalValue:value};
                    put.run(allianceId,k.killmail_id,k.solar_system_id,saved.killmail_time,JSON.stringify(saved));
                    await resolveNames([saved]);
                }
                if(match.personal&&liveTarget(target)){
                    const result=await combat.ingest(id,[{killmail_id:k.killmail_id,killmail_hash:hash,...(killValue(raw)!==null?{zkb:{totalValue:killValue(raw)}}:{})}],'zkillboard');
                    if(result.failed||result.pending)throw new Error('Personal live killmail verification is pending.');
                }
                if(match.any&&liveTarget(target)){const key='session:combat:'+target.session.id;store.set(key,{...store.get(key,{}),liveUpdatedAt:iso(now())});onChange(id);}
            }
        }
    });

    async function run(session,id){
        if(!collecting(session))return;
        const start=JSON.parse(session.start_context),allianceId=start.alliance?.id;
        if(!allianceId)return;
        const key='session:combat:'+session.id,prior=store.get(key,{});
        const justEnded=!!session.ended&&prior.ended!==session.ended;
        if(Date.parse(prior.retryAt||'')>now()&&!justEnded)return;
        if(store.get('combat.public.cooldown',0)>now())return;
        const route=sessionRoute(store,session,start,session.ended||iso(now())),groups=sessionCombatQueries(route);
        if(!groups.length)return;
        const signature=JSON.stringify(groups.map(g=>[g.systemId,g.year,g.month]));
        const progress=prior.progress?.signature===signature?{...prior.progress}:{signature,index:0,page:1,pages:0,expires:null,limited:false};
        store.set(key,{...prior,status:'collecting',error:undefined,retryAt:undefined,progress,ended:session.ended});
        onChange(id);
        let requests=0,verifications=0,failed=0,combatChanged=false;
        const retainCombatChange=()=>{combatChanged=true;};
        try{
            while(progress.index<groups.length && requests<6 && collecting(session)){
                const g=groups[progress.index];
                const path=`allianceID/${allianceId}/solarSystemID/${g.systemId}/year/${g.year}/month/${g.month}/`+(progress.page===1?'':`page/${progress.page}/`);
                const page=await combat.publicPage(id,path); requests++;
                progress.expires=Math.min(progress.expires||Infinity,Date.parse(page.expiresAt));
                let unfinished=false;
                for(const ref of page.refs){
                    if(!collecting(session))return;
                    // Full responses expose a time; hash-only responses are
                    // verified before local time filtering can take place.
                    const time=Date.parse(ref.killmail_time);
                    if(Number.isFinite(time)&&(time<g.from||time>=g.to))continue;
                    const existing=get.get(allianceId,ref.killmail_id);
                    if(existing){
                        const saved=JSON.parse(existing.body);
                        if(killValue(ref)!==null&&killValue(ref)!==killValue(saved)){
                            saved.zkb={totalValue:killValue(ref)};put.run(allianceId,saved.killmail_id,saved.solar_system_id,saved.killmail_time,JSON.stringify(saved));
                        }
                        if(saved.victim?.character_id===id||saved.attackers?.some(a=>a.character_id===id))await combat.ingest(id,[ref],'zkillboard',{notify:retainCombatChange});
                        continue;
                    }
                    if(verifications>=100){unfinished=true;break;}
                    verifications++;
                    try{
                        const response=await esi.request('/killmails/'+ref.killmail_id+'/'+ref.killmail_hash,{ttl:86400});
                        const k=response.data,t=Date.parse(k?.killmail_time),sides=allianceSides(k||{},allianceId);
                        if(response.stale||k?.killmail_id!==ref.killmail_id||!Number.isSafeInteger(k?.victim?.ship_type_id)||!Number.isFinite(t)){failed++;continue;}
                        if(k.solar_system_id!==g.systemId||t<g.from||t>=g.to||t>now()+60000||(!sides.kill&&!sides.loss))continue;
                        if(!collecting(session))return;
                        const saved={...k,killmail_time:iso(t)};delete saved.zkb;
                        if(killValue(ref)!==null)saved.zkb={totalValue:killValue(ref)};
                        put.run(allianceId,k.killmail_id,k.solar_system_id,saved.killmail_time,JSON.stringify(saved));
                        await resolveNames([saved]);
                        if(saved.victim?.character_id===id||saved.attackers?.some(a=>a.character_id===id))await combat.ingest(id,[ref],'zkillboard',{notify:retainCombatChange});
                    }catch{failed++;}
                }
                if(unfinished||failed)break;
                progress.pages++;
                const times=page.refs.map(k=>Date.parse(k.killmail_time));
                const reachedStart=times.length>0&&times.every(Number.isFinite)&&Math.min(...times)<g.from;
                if(page.refs.length<200||reachedStart||progress.page>=100){
                    if(progress.page>=100&&page.refs.length>=200&&!reachedStart)progress.limited=true;
                    progress.index++;progress.page=1;
                }else progress.page++;
            }
            if(!collecting(session))return;
            const done=progress.index>=groups.length,at=now();
            const retryAt=done?Math.max(at+60000,progress.expires||at+HOUR):at+(failed?60000:3000);
            store.set(key,{...store.get(key,{}),status:done?(progress.limited?'partial':'ready'):'partial',updatedAt:iso(at),retryAt:iso(retryAt),ended:session.ended,pages:progress.pages,systems:groups.length,checkedGroups:progress.index,limitReached:progress.limited,progress:done?null:progress,detail:failed?'Some killmails are awaiting verification.':done?(progress.limited?'The public page limit was reached; totals are incomplete.':'Published alliance records collected. Delayed records can appear after the next cache refresh.'):'Collecting the remaining system records.'});
        }catch(error){
            if(collecting(session))store.set(key,{...store.get(key,{}),status:prior.updatedAt?'stale':'error',ended:session.ended,progress,error:error.message,retryAt:iso(Math.max(now()+60000,store.get('combat.public.cooldown',0)))});
        }finally{if(combatChanged)combat.notifyChanges(id);if(active(id))onChange(id);}
    }
    function sync(sessionId,id){
        if(!active(id))return Promise.resolve();
        const session=store.db.prepare('SELECT * FROM sessions WHERE id=? AND character_id=?').get(sessionId,id);
        if(!session||!collecting(session))return Promise.resolve();
        if(pending.has(sessionId))return pending.get(sessionId);
        const task=run(session,id).finally(()=>pending.delete(sessionId));pending.set(sessionId,task);return task;
    }
    function syncRecent(id){
        if(!active(id))return;
        const rows=store.db.prepare(SESSION_COMBAT_RECENT_SQL).all(id,id,iso(now()-DAY));
        return Promise.allSettled([...rows.map(s=>sync(s.id,id)),live.sync()]);
    }
    function sessionChanged(sessionId,id){return Promise.allSettled([sync(sessionId,id),live.sync({refreshTargets:true})]);}
    return {sync,syncRecent,sessionChanged,syncLive:live.sync,async close(){closed=true;await live.close();await Promise.allSettled([...pending.values()]);}};
}
