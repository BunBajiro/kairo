import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from '../../server/store.mjs';
import {captureContext,changeSession,sessionReport} from '../../server/history.mjs';
import {allianceSummary,loyaltyReport,loyaltySample,reconcileSessionLoyalty,sessionRoute,sessionShips} from '../../server/session-details.mjs';
import {createSessionCombat,sessionCombatQueries} from '../../server/session-combat.mjs';
import {createCombat} from '../../server/combat.mjs';
import {allScopes} from '../../server/modules/catalog.mjs';

const epoch=Date.parse('2026-09-12T18:00:00Z'),iso=n=>new Date(n).toISOString(),at=m=>iso(epoch+m*60000),hash='a'.repeat(40);
const auth={characters:()=>[{id:42,name:'Pilot',scopes:allScopes}]};
const sample=(data,time=Date.now())=>({data,status:'ready',updatedAt:iso(time),expiresAt:iso(time+3600000)});
async function storage(t){const dir=await mkdtemp(join(tmpdir(),'kairo-sessions-')),store=openStore(dir);t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});return {dir,store};}
const publish=store=>e=>store.db.prepare('INSERT OR IGNORE INTO events(character_id,type,module,summary,payload,at,dedupe) VALUES(?,?,?,?,?,?,?)').run(e.characterId,e.type,e.module||'journey',e.summary||e.type,JSON.stringify(e.payload||{}),e.at||iso(Date.now()),e.dedupe||null);
function session(store,id='flight',{started=at(0),ended=at(60),start={capturedAt:at(0),system:{id:1,name:'Alpha'},alliance:{id:77,name:'Alliance'}},finish={}}={}){store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)').run(id,42,id,started,ended,JSON.stringify(start),JSON.stringify(finish));return store.db.prepare('SELECT * FROM sessions WHERE id=?').get(id);}
const mail=(id,m,system=1,overrides={})=>({killmail_id:id,killmail_time:at(m),solar_system_id:system,victim:{character_id:99,ship_type_id:587,alliance_id:88},attackers:[{character_id:43,alliance_id:77,damage_done:0,final_blow:false}],zkb:{hash,totalValue:id*100},...overrides});
const visit=(id,system,from,to)=>({id,systemId:system,name:'System '+system,entered:at(from),exited:at(to)});

test('route retains every visit, including quiet transits and repeated systems, clipped to the session',async t=>{
 const {store}=await storage(t),s=session(store),put=store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)');
 put.run(42,9,'Before',at(-5),s.id);put.run(42,2,'Beta',at(10),s.id);put.run(43,8,'Other pilot',at(12),s.id);put.run(42,1,'Alpha',at(20),s.id);put.run(42,1,'Alpha again',at(25),s.id);put.run(42,3,'Gamma',at(40),s.id);put.run(42,4,'After',at(60),s.id);
 const r=sessionReport(store,s.id,42);
 assert.deepEqual(r.route.map(v=>v.systemId),[1,2,1,1,3]);assert.equal(r.stats.systems,3);
 assert.deepEqual(r.route.map(v=>v.seconds),[600,600,300,900,1200]);assert.equal(r.route.every(v=>!v.combatActive),true);
 assert.equal(r.route[0].clipped,true);assert.equal(r.route.at(-1).exited,at(60));assert.throws(()=>sessionReport(store,s.id,43));
});

test('only in-visit alliance combat qualifies a buffer; same-system windows merge without recursive expansion',()=>{
 const route=[visit(1,1,0,10),visit(2,2,10,15),visit(3,1,15,25),visit(4,3,25,40)];
 const records=[mail(1,8),mail(2,20),mail(3,-10),mail(4,-10.01),mail(5,34.9),mail(6,35),mail(7,12),mail(8,9,2),mail(9,41,3),mail(10,10,4),mail(11,5,1,{attackers:[{alliance_id:88}]}),mail(1,8)];
 const a=allianceSummary(route,records,77,epoch+120*60000);
 assert.equal(a.visits.length,4);assert.deepEqual(a.visits.map(v=>v.combatActive),[true,false,true,false]);
 assert.equal(a.windows.length,1);assert.equal(a.windows[0].from,at(-10));assert.equal(a.windows[0].to,at(35));assert.deepEqual(a.windows[0].visitIds,[1,3]);
 assert.deepEqual(a.items.map(k=>k.killmailId).sort((a,b)=>a-b),[1,2,3,5,7]);assert.equal(a.kills,5);assert.equal(a.destroyed,1800);
});

test('entry is inclusive, departure is exclusive, and alliance losses never add destroyed or unpriced-kill value',()=>{
 assert.equal(allianceSummary([visit(1,1,0,10)],[mail(1,10)],77).windows.length,0);
 const a=allianceSummary([visit(1,1,0,10)],[mail(1,0),mail(2,4,1,{victim:{ship_type_id:587,alliance_id:77},zkb:{totalValue:null}}),mail(3,5,1,{victim:{ship_type_id:587,alliance_id:77},attackers:[{alliance_id:88}],zkb:{totalValue:0}})],77);
 assert.equal(a.kills,1);assert.equal(a.losses,2);assert.equal(a.destroyed,100);assert.equal(a.lost,0);assert.equal(a.missingDestroyed,0);assert.equal(a.missingLost,1);
 assert.equal(allianceSummary([visit(1,1,0,10)],[mail(1,0)],88).kills,0);
});

test('friendly attackers on alliance victims produce losses only, with each value counted on one side',()=>{
 const route=[visit(1,1,0,10),visit(2,2,10,15),visit(3,1,15,20)];
 const ownLoss=(id,m,value,attackers)=>mail(id,m,1,{victim:{character_id:90+id,ship_type_id:587,alliance_id:77},attackers,zkb:{totalValue:value}});
 const loss1=ownLoss(1,5,175960000,[{alliance_id:88,final_blow:true},{alliance_id:77,damage_done:0}]);
 const loss2=ownLoss(2,6,15720000,[{alliance_id:77,final_blow:true}]);
 const loss3=ownLoss(3,17,177170000,[{alliance_id:77,damage_done:10},{alliance_id:88,final_blow:true}]);
 const kill=mail(4,18,1,{attackers:[{character_id:42,alliance_id:77},{character_id:43,alliance_id:77}],zkb:{totalValue:123000000}});
 const unrelated=mail(5,7,1,{attackers:[{alliance_id:88}],zkb:{totalValue:9000000000}});
 const r=allianceSummary(route,[loss1,loss2,loss3,kill,unrelated,loss1],77,epoch+60*60000);
 assert.equal(r.kills,1);assert.equal(r.losses,3);assert.equal(r.destroyed,123000000);assert.equal(r.lost,368850000);
 assert.equal(r.items.length,4);assert.ok(r.items.every(k=>k.kill!==k.loss));
 assert.deepEqual(r.items.filter(k=>k.kill).map(k=>k.killmailId),[4]);
 assert.equal(r.kills+r.losses,r.items.length);assert.equal(r.missingDestroyed,0);assert.equal(r.missingLost,0);
 assert.deepEqual(r.visits.map(v=>v.combatActive),[true,false,true]);assert.equal(r.windows.length,1);
});

test('saved v0.7.1 killmails recalculate exclusively on reopen and retain personal participation in alliance totals',async t=>{
 const {store,dir}=await storage(t),s=session(store),emit=publish(store);
 const records=[
  {...mail(1,5,1,{attackers:[{character_id:42,alliance_id:77}],zkb:{totalValue:50000000}}),result:'kill'},
  {...mail(2,10,1,{victim:{character_id:42,ship_type_id:587,alliance_id:77},attackers:[{character_id:43,alliance_id:77,damage_done:0},{character_id:99,alliance_id:88}],zkb:{totalValue:200000000}}),result:'loss'}
 ];
 for(const k of records){
  store.db.prepare('INSERT INTO alliance_combat_records VALUES(?,?,?,?,?)').run(77,k.killmail_id,1,k.killmail_time,JSON.stringify(k));
  store.db.prepare('INSERT INTO combat_records VALUES(?,?,?,?,?,?)').run(42,k.killmail_id,k.result,k.killmail_time,JSON.stringify(k),'fixture');
  emit({characterId:42,type:'killmail.'+k.result,at:k.killmail_time,payload:{killmail_id:k.killmail_id}});
 }
 const before=store.db.prepare('SELECT body FROM alliance_combat_records ORDER BY killmail_id').all();
 const reopened=openStore(dir);
 try{
  const r=sessionReport(reopened,s.id,42);
  assert.equal(r.stats.kills,1);assert.equal(r.stats.losses,1);
  assert.equal(r.personalCombat.destroyed,50000000);assert.equal(r.personalCombat.lost,200000000);
  assert.equal(r.allianceCombat.kills,1);assert.equal(r.allianceCombat.losses,1);
  assert.equal(r.allianceCombat.destroyed,50000000);assert.equal(r.allianceCombat.lost,200000000);
  assert.ok(r.allianceCombat.items.every(k=>k.kill!==k.loss));
  assert.deepEqual(reopened.db.prepare('SELECT body FROM alliance_combat_records ORDER BY killmail_id').all(),before,'Recalculation needs no rewrite or recollection of retained killmails');
 }finally{reopened.close();}
});

test('ships preserve changes between two ships of the same hull and exclude other pilots and end boundary',async t=>{
 const {store}=await storage(t),s=session(store),emit=publish(store),start={shipTypeId:609,ship:{id:100}};
 emit({characterId:42,type:'ship.changed',at:at(10),payload:{ship_type_id:609,ship_id:200}});emit({characterId:43,type:'ship.changed',at:at(15),payload:{ship_type_id:999}});emit({characterId:42,type:'ship.changed',at:at(20),payload:{ship_type_id:588,ship_id:300}});emit({characterId:42,type:'ship.changed',at:at(60),payload:{ship_type_id:999}});
 const r=sessionShips(store,s,start,s.ended,{609:'Maulus',588:'Reaper'});
 assert.equal(r.hulls.length,2);assert.equal(r.hulls[0].seconds,1200);assert.equal(r.hulls[0].stints,2);assert.equal(r.changes[1].shipId,200);assert.equal(r.hulls[1].seconds,2400);
});

test('LP uses per-corporation net balance changes, including spent/removed balances and valid empty snapshots',()=>{
 const a=loyaltySample(sample([{corporation_id:1,loyalty_points:100},{corporation_id:2,loyalty_points:60}]));
 const b=loyaltySample(sample([{corporation_id:1,loyalty_points:150},{corporation_id:3,loyalty_points:20}]));
 const r=loyaltyReport({loyalty:a},{loyalty:b},true,{1:'Caldari Navy'});
 assert.equal(r.delta,10);assert.equal(r.rows.find(x=>x.corporationId===2).delta,-60);assert.equal(r.status,'pending');
 assert.equal(loyaltyReport({},{loyalty:b},true).delta,null);assert.deepEqual(loyaltySample(sample([])).balances,[]);
 assert.equal(loyaltySample({...sample([]),status:'stale'}),null);assert.equal(loyaltySample(sample([{corporation_id:1,loyalty_points:NaN}])),null);
});

test('LP reconciliation retains original samples, persists the first later sample, and never keeps drifting',async t=>{
 const {store,dir}=await storage(t),time=Date.now(),a=loyaltySample(sample([{corporation_id:1,loyalty_points:100}],time-120000));
 session(store,'lp',{started:iso(time-60000),ended:iso(time-30000),start:{loyalty:a},finish:{loyalty:a}});
 store.saveSnapshot(42,'loyalty',sample([{corporation_id:1,loyalty_points:150}],time-45000));reconcileSessionLoyalty(store,42);assert.equal(sessionReport(store,'lp',42).loyalty.status,'pending');
 store.saveSnapshot(42,'loyalty',sample([{corporation_id:1,loyalty_points:200}],time));reconcileSessionLoyalty(store,42);
 let r=sessionReport(store,'lp',42);assert.equal(r.loyalty.status,'delayed');assert.equal(r.loyalty.delta,100);assert.equal(r.finish.loyalty.balances[0].loyalty_points,100);
 store.saveSnapshot(42,'loyalty',sample([{corporation_id:1,loyalty_points:500}],time+1000));reconcileSessionLoyalty(store,42);
 const reopened=openStore(dir);try{r=sessionReport(reopened,'lp',42);assert.equal(r.loyalty.delta,100);}finally{reopened.close();}
});

test('adjacent sessions flag overlapping LP sample ranges rather than crediting the same change twice',async t=>{
 const {store}=await storage(t),time=Date.now(),a=loyaltySample(sample([{corporation_id:1,loyalty_points:100}],time-300000));
 session(store,'first',{started:iso(time-240000),ended:iso(time-180000),start:{loyalty:a},finish:{loyalty:a}});
 store.saveSnapshot(42,'loyalty',sample([{corporation_id:1,loyalty_points:100}],time-300000));
 const {id}=changeSession(store,publish(store),42,{action:'start'});assert.equal(sessionReport(store,id,42).loyalty.status,'overlap');
 store.saveSnapshot(42,'loyalty',sample([{corporation_id:1,loyalty_points:200}],time+60000));reconcileSessionLoyalty(store,42);
 assert.equal(sessionReport(store,'first',42).loyalty.status,'overlap');assert.equal(sessionReport(store,'first',42).loyalty.delta,0);
});

test('capture honours paused modules; missing starts retain event accounting without inventing route, alliance or LP data',async t=>{
 const {store}=await storage(t);store.saveSnapshot(42,'profile',sample({alliance_id:77}));store.saveSnapshot(42,'loyalty',sample([{corporation_id:1,loyalty_points:100}]));
 assert.equal(captureContext(store,42).alliance.id,77);assert.equal(captureContext(store,42).loyalty.balances[0].loyalty_points,100);
 store.set('module:combat',false);assert.equal(captureContext(store,42).loyalty,null);store.set('module:combat',true);
 session(store,'legacy',{start:{},finish:{}});store.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(42,1,'Alpha',at(-5));publish(store)({characterId:42,type:'killmail.kill',at:at(20)});
 const r=sessionReport(store,'legacy',42);assert.equal(r.route.length,0);assert.equal(r.loyalty.status,'unavailable');assert.equal(r.allianceCombat.coverage.status,'unavailable');assert.equal(r.stats.kills,1);assert.equal(r.personalCombat.missingDestroyed,1);
});

test('alliance collection uses supported system/month queries, preserves quiet visits and survives cache/restart',async t=>{
 const {store,dir}=await storage(t),s=session(store),k=mail(10,5),calls=[],esiCalls=[];let clock=epoch+120*60000;
 const esi={request:async path=>{esiCalls.push(path);return sample(k);}};
 const combat=createCombat(store,auth,esi,{publish:publish(store),now:()=>clock,spacingMs:0,fetcher:async(url,options)=>{calls.push(url);assert.equal(options.headers.Authorization,undefined);return new Response(JSON.stringify([k]),{headers:{'Cache-Control':'max-age=3600'}});}});
 const collector=createSessionCombat(store,auth,esi,combat,{now:()=>clock});t.after(async()=>{await collector.close();await combat.close();});
 await Promise.all([collector.sync(s.id,42),collector.sync(s.id,42)]);
 assert.equal(calls.length,1);assert.match(calls[0],/allianceID\/77\/solarSystemID\/1\/year\/2026\/month\/9\/$/);assert.equal(calls[0].includes('startTime'),false);
 let r=sessionReport(store,s.id,42);assert.equal(r.allianceCombat.kills,1);assert.equal(r.allianceCombat.destroyed,1000);assert.equal(r.stats.kills,0);assert.equal(r.route.length,1);assert.equal(esiCalls.length,1);
 await collector.sync(s.id,42);assert.equal(calls.length,1);await collector.sync(s.id,43);assert.equal(calls.length,1);
 const reopened=openStore(dir);try{assert.equal(sessionReport(reopened,s.id,42).allianceCombat.kills,1);assert.equal(reopened.db.prepare("SELECT COUNT(*) n FROM migrations WHERE id='sessions-v071'").get().n,1);}finally{reopened.close();}
});

test('public valuations enrich existing personal ESI records without duplicate events or losing values on later ingestion',async t=>{
 const {store}=await storage(t),k=mail(1,5,1,{attackers:[{character_id:42,alliance_id:77,damage_done:0}]});delete k.zkb;
 const combat=createCombat(store,auth,{request:async()=>sample(k)},{publish:publish(store)});t.after(()=>combat.close());
 await combat.ingest(42,[{killmail_id:1,killmail_hash:hash}]);assert.equal(combat.recent(42)[0].zkb,undefined);
 await combat.ingest(42,[{killmail_id:1,killmail_hash:hash,zkb:{totalValue:12345}}],'zkillboard');
 await combat.ingest(42,[{killmail_id:1,killmail_hash:hash}]);assert.equal(combat.recent(42)[0].zkb.totalValue,12345);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM events').get().n,1);
});

test('month query planning crosses UTC year boundaries and deduplicates repeated visits',()=>{
 const r=[{systemId:1,entered:'2026-12-31T23:58:00Z',exited:'2027-01-01T00:01:00Z'},{systemId:1,entered:'2027-01-01T00:02:00Z',exited:'2027-01-01T00:04:00Z'}];
 assert.deepEqual(sessionCombatQueries(r).map(g=>[g.year,g.month]),[[2026,12],[2027,1]]);
});

test('alliance page collection resumes a verification budget, handles late records and preserves totals on rate limits',async t=>{
 const {store}=await storage(t),s=session(store),records=Array.from({length:201},(_,i)=>mail(i+1,30-i*.01));let clock=epoch+120*60000,limited=false,calls=0;
 const combat=createCombat(store,auth,{request:async p=>sample(records[Number(p.split('/')[2])-1])},{publish:publish(store),now:()=>clock,spacingMs:0,fetcher:async url=>{calls++;if(limited)return new Response('{}',{status:429,headers:{'Retry-After':'7200'}});return new Response(JSON.stringify(url.includes('/page/2/')?records.slice(200):records.slice(0,200)),{headers:{'Cache-Control':'max-age=3600'}});}});
 const collector=createSessionCombat(store,auth,{request:async p=>sample(records[Number(p.split('/')[2])-1])},combat,{now:()=>clock});t.after(async()=>{await collector.close();await combat.close();});
 await collector.sync(s.id,42);assert.equal(sessionReport(store,s.id,42).allianceCombat.kills,100);assert.equal(store.get('session:combat:'+s.id).status,'partial');
 clock+=4000;await collector.sync(s.id,42);clock+=4000;await collector.sync(s.id,42);assert.equal(sessionReport(store,s.id,42).allianceCombat.kills,201);assert.equal(store.get('session:combat:'+s.id).status,'ready');assert.equal(calls,2);
 clock+=3600000;limited=true;await collector.sync(s.id,42);assert.equal(sessionReport(store,s.id,42).allianceCombat.kills,201);assert.equal(store.get('session:combat:'+s.id).status,'stale');const count=calls;clock+=61000;await collector.sync(s.id,42);assert.equal(calls,count);
});
