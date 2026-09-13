import {allianceSides, COMBAT_BUFFER_MS, killValue, sessionRoute} from './session-details.mjs';

const HOUR=3600000, DAY=24*HOUR;
const iso=at=>new Date(at).toISOString();

// The current zKill API supports entity + system + calendar month + page.
// Its retired startTime/endTime filters are deliberately not used. Precise
// session/visit windows are applied locally to verified, retained killmails.
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

export function createSessionCombat(store,auth,esi,combat,{resolveNames=async()=>{},onChange=()=>{},now=Date.now}={}) {
    const pending=new Map();let closed=false;
    const active=id=>!closed&&store.get('module:combat',true)&&auth.characters().some(c=>c.id===id&&!c.needsReauth);
    const get=store.db.prepare('SELECT body FROM alliance_combat_records WHERE alliance_id=? AND killmail_id=?');
    const put=store.db.prepare(`INSERT INTO alliance_combat_records VALUES(?,?,?,?,?) ON CONFLICT(alliance_id,killmail_id) DO UPDATE SET body=excluded.body`);

    async function run(session,id){
        const start=JSON.parse(session.start_context),allianceId=start.alliance?.id;
        if(!allianceId)return;
        const key='session:combat:'+session.id,prior=store.get(key,{});
        if(Date.parse(prior.retryAt||'')>now())return;
        const route=sessionRoute(store,session,start,session.ended||iso(now())),groups=sessionCombatQueries(route);
        if(!groups.length)return;
        const signature=JSON.stringify(groups.map(g=>[g.systemId,g.year,g.month]));
        const progress=prior.progress?.signature===signature?{...prior.progress}:{signature,index:0,page:1,pages:0,expires:null,limited:false};
        store.set(key,{...prior,status:'collecting',error:undefined,retryAt:undefined,progress});
        onChange(id);
        let requests=0,verifications=0,failed=0;
        try{
            while(progress.index<groups.length && requests<6 && active(id)){
                const g=groups[progress.index];
                const path=`allianceID/${allianceId}/solarSystemID/${g.systemId}/year/${g.year}/month/${g.month}/`+(progress.page===1?'':`page/${progress.page}/`);
                const page=await combat.publicPage(id,path); requests++;
                progress.expires=Math.min(progress.expires||Infinity,Date.parse(page.expiresAt));
                let unfinished=false;
                for(const ref of page.refs){
                    if(!active(id))return;
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
                        if(saved.victim?.character_id===id||saved.attackers?.some(a=>a.character_id===id))await combat.ingest(id,[ref],'zkillboard');
                        continue;
                    }
                    if(verifications>=100){unfinished=true;break;}
                    verifications++;
                    try{
                        const response=await esi.request('/killmails/'+ref.killmail_id+'/'+ref.killmail_hash,{ttl:86400});
                        const k=response.data,t=Date.parse(k?.killmail_time),sides=allianceSides(k||{},allianceId);
                        if(response.stale||k?.killmail_id!==ref.killmail_id||!Number.isSafeInteger(k?.victim?.ship_type_id)||!Number.isFinite(t)){failed++;continue;}
                        if(k.solar_system_id!==g.systemId||t<g.from||t>=g.to||t>now()+60000||(!sides.kill&&!sides.loss))continue;
                        if(!active(id))return;
                        const saved={...k,killmail_time:iso(t)};delete saved.zkb;
                        if(killValue(ref)!==null)saved.zkb={totalValue:killValue(ref)};
                        put.run(allianceId,k.killmail_id,k.solar_system_id,saved.killmail_time,JSON.stringify(saved));
                        await resolveNames([saved]);
                        if(saved.victim?.character_id===id||saved.attackers?.some(a=>a.character_id===id))await combat.ingest(id,[ref],'zkillboard');
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
            if(!active(id))return;
            const done=progress.index>=groups.length,at=now();
            const retryAt=done?Math.max(at+60000,progress.expires||at+HOUR):at+(failed?60000:3000);
            store.set(key,{status:done?(progress.limited?'partial':'ready'):'partial',updatedAt:iso(at),retryAt:iso(retryAt),pages:progress.pages,systems:groups.length,checkedGroups:progress.index,limitReached:progress.limited,progress:done?null:progress,detail:failed?'Some killmails are awaiting verification.':done?(progress.limited?'The public page limit was reached; totals are incomplete.':'Published alliance records collected. Delayed records can appear after the next cache refresh.'):'Collecting the remaining system records.'});
        }catch(error){
            if(active(id))store.set(key,{...prior,status:prior.updatedAt?'stale':'error',progress,error:error.message,retryAt:iso(Math.max(now()+60000,store.get('combat.public.cooldown',0)))});
        }finally{if(active(id))onChange(id);}
    }
    function sync(sessionId,id){
        if(!active(id))return Promise.resolve();
        const session=store.db.prepare('SELECT * FROM sessions WHERE id=? AND character_id=?').get(sessionId,id);
        if(!session)return Promise.resolve();
        if(pending.has(sessionId))return pending.get(sessionId);
        const task=run(session,id).finally(()=>pending.delete(sessionId));pending.set(sessionId,task);return task;
    }
    function syncRecent(id){
        if(!active(id))return;
        const rows=store.db.prepare('SELECT id FROM sessions WHERE character_id=? AND (ended IS NULL OR ended>?) ORDER BY started DESC LIMIT 8').all(id,iso(now()-DAY));
        for(const s of rows)sync(s.id,id).catch(()=>{});
    }
    return {sync,syncRecent,async close(){closed=true;await Promise.allSettled([...pending.values()]);}};
}
