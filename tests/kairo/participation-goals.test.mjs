import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from '../../server/store.mjs';
import {createCombat,participation} from '../../server/combat.mjs';
import {createGoals,listGoals,goalSourceOptions,lookupGoalType} from '../../server/goals.mjs';
import {createCore} from '../../server/core.mjs';
import {createBus} from '../../server/bus.mjs';
import {createStream,defaultStream} from '../../server/stream.mjs';
import {bindingProjection} from '../../server/projections.mjs';
import {sessionReport} from '../../server/history.mjs';
import {journeyData,setJourneyConnection} from '../../server/places.mjs';
import {allScopes,catalog} from '../../server/modules/catalog.mjs';
import {startKairo} from '../../server/index.mjs';

const hash='a'.repeat(40),iso=n=>new Date(n).toISOString();
const sample=data=>({status:'ready',data,headers:{},updatedAt:iso(Date.now()),expiresAt:iso(Date.now()+600000)});
const auth={characters:()=>[{id:42,name:'Pilot',scopes:allScopes},{id:43,name:'Alt',scopes:allScopes}]};
async function storage(t){const dir=await mkdtemp(join(tmpdir(),'kairo-v4-')),store=openStore(dir);t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});return {dir,store};}
const publish=(store,bus)=>e=>{const r=store.db.prepare('INSERT OR IGNORE INTO events(character_id,type,module,summary,payload,at,dedupe) VALUES(?,?,?,?,?,?,?)').run(e.characterId,e.type,e.module||'core',e.summary||e.type,JSON.stringify(e.payload||{}),e.at||iso(Date.now()),e.dedupe||null);if(r.changes)bus?.emit(e);};
const mail=(id,overrides={})=>({killmail_id:id,killmail_time:iso(Date.now()-60000),solar_system_id:30000142,victim:{character_id:99,ship_type_id:587,damage_taken:1000},attackers:[{character_id:42,damage_done:0,final_blow:false},{character_id:43,damage_done:1000,final_blow:true}],...overrides});
const ref=k=>({killmail_id:k.killmail_id,killmail_hash:hash});
const goal=(store,id)=>store.db.prepare('SELECT * FROM goals WHERE id=?').get(id);
const type={id:34,name:'Resource',categoryId:4};
function backdate(store,id,at=Date.now()-3600000){store.db.prepare('UPDATE goals SET created=? WHERE id=?').run(iso(at),id);}

test('participation includes assisted and zero-damage EWAR kills, not fleet affiliation alone',()=>{
 const k=mail(1);assert.equal(participation(k,42),'kill');assert.equal(participation(k,43),'kill');assert.equal(participation(k,99),'loss');assert.equal(participation(k,44),null);
 assert.equal(participation(mail(2,{attackers:[{character_id:44,corporation_id:42,final_blow:true}]}),42),null);
 assert.equal(participation(mail(3,{victim:{character_id:42},attackers:[{character_id:42}]}),42),'loss');
});
test('combat ingestion drains an unseen backlog beyond 50, deduplicates sources and retains history',async t=>{
 const {store}=await storage(t),records=Array.from({length:130},(_,i)=>mail(i+1)),calls=[];
 const combat=createCombat(store,auth,{request:async path=>{calls.push(path);return sample(records[Number(path.split('/')[2])-1]);}},{publish:publish(store)});t.after(()=>combat.close());
 let r=await combat.ingest(42,records.map(ref));assert.equal(r.pending,30);assert.equal(combat.recent(42).length,100);
 r=await combat.ingest(42,records.map(ref),'zkillboard');assert.equal(r.pending,0);assert.equal(combat.recent(42).length,130);assert.equal(calls.length,130);
 await combat.ingest(42,records.map(ref));assert.equal(calls.length,130);assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='killmail.kill'").get().n,130);
 await combat.ingest(42,[]);assert.equal(combat.recent(42).length,130);assert.equal(combat.recent(43).length,0);
});
test('public participation reads are cached, send no EVE credentials and preserve records on rate limits',async t=>{
 const {store}=await storage(t),k=mail(10);let clock=Date.now(),calls=0,limited=false;
 const combat=createCombat(store,auth,{request:async()=>sample(k)},{publish:publish(store),now:()=>clock,spacingMs:0,fetcher:async(url,options)=>{
  calls++;assert.equal(url,'https://zkillboard.com/api/characterID/42/');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);assert.equal(options.body,undefined);assert.equal(options.headers['Accept-Encoding'],'gzip');
  return limited?new Response('{}',{status:429,headers:{'Retry-After':'7200'}}):new Response(JSON.stringify([{...k,zkb:{hash}}]),{headers:{'Cache-Control':'max-age=3600'}});
 }});t.after(()=>combat.close());
 await Promise.all([combat.syncPublic(42),combat.syncPublic(42)]);assert.equal(calls,1);assert.equal(combat.recent(42)[0].result,'kill');assert.equal(combat.coverage(42).status,'ready');
 clock+=10000;await combat.syncPublic(42);assert.equal(calls,1);
 clock+=3600000;limited=true;await combat.syncPublic(42);assert.equal(calls,2);assert.equal(combat.coverage(42).status,'stale');assert.equal(combat.recent(42).length,1);
 clock+=61000;await combat.syncPublic(42);assert.equal(calls,2);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM combat_records').get().n,1);
});
test('late assisted kills repair archived reports without historic toasts or duplicate counts',async t=>{
 const {store}=await storage(t),bus=createBus(),stream=createStream(store,bus),at=Date.now();t.after(()=>stream.close());
 const config=defaultStream();Object.assign(config.rules.find(r=>r.event==='killmail.kill'),{enabled:true,cooldown:0});stream.save(config);
 store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended) VALUES(?,?,?,?,?)').run('fleet',42,'Group roam',iso(at-7200000),iso(at-3600000));
 const k=mail(1,{killmail_time:iso(at-5400000)}),other=mail(2,{attackers:[{character_id:43,final_blow:true}]}),boundary=mail(3,{killmail_time:iso(at-3600000)});
 const map={1:k,2:other,3:boundary},combat=createCombat(store,auth,{request:async path=>sample(map[Number(path.split('/')[2])])},{publish:publish(store,bus)});t.after(()=>combat.close());
 await combat.ingest(42,[ref(k),ref(other),ref(boundary)],'zkillboard');await combat.ingest(42,[ref(k)]);
 const r=sessionReport(store,'fleet',42);assert.equal(r.stats.kills,1);assert.equal(r.stats.losses,0);assert.equal(r.events[0].payload.participation,true);assert.equal(stream.state().toasts.length,0);assert.equal(combat.recent(42).length,2);
 store.saveSnapshot(42,'killmails',sample([]));assert.equal(sessionReport(store,'fleet',42).stats.kills,1);
});
test('hiding a filament connection is reversible, character-scoped and never bridges neighbouring visits',async t=>{
 const {dir,store}=await storage(t),put=store.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)'),at=iso(Date.now());
 const a=Number(put.run(42,1,'A',at).lastInsertRowid);put.run(43,99,'Other pilot',at);const b=Number(put.run(42,2,'B',at).lastInsertRowid),c=Number(put.run(42,3,'C',at).lastInsertRowid);
 setJourneyConnection(store,42,b,true);let data=journeyData(store,42);assert.equal(data.visits.length,3);assert.deepEqual(data.connections.map(c=>[c.from_system_id,c.to_system_id,c.hidden]),[[2,3,false],[1,2,true]]);
 assert.throws(()=>setJourneyConnection(store,43,b,true));assert.throws(()=>setJourneyConnection(store,42,a,true));assert.throws(()=>setJourneyConnection(store,42,c,'true'));
 const reopened=openStore(dir);try{assert.equal(journeyData(reopened,42).connections.find(c=>c.id===b).hidden,true);setJourneyConnection(reopened,42,b,false);assert.equal(journeyData(reopened,42).connections.some(c=>c.hidden),false);assert.equal(reopened.db.prepare("SELECT COUNT(*) n FROM migrations WHERE id='core-v4'").get().n,1);}finally{reopened.close();}
});
test('wallet goals follow fresh data, pause on stale snapshots and complete once without regressing',async t=>{
 const {store}=await storage(t),service=createGoals(store,auth,publish(store));store.saveSnapshot(42,'wallet',sample(500));
 const {id}=service.create(42,{title:'Hull fund',source:'wallet.balance',target:1000});assert.equal(goal(store,id).progress,500);
 store.saveSnapshot(42,'wallet',{...sample(1500),status:'stale'});service.refresh(42);assert.equal(goal(store,id).done,0);assert.equal(goal(store,id).progress,500);assert.equal(listGoals(store,auth,42)[0].tracking.status,'stale');
 store.saveSnapshot(42,'wallet',sample(1500));service.refresh(42);assert.equal(goal(store,id).done,1);store.saveSnapshot(42,'wallet',sample(20));service.refresh(42);assert.equal(goal(store,id).progress,1000);
 assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='goal.completed'").get().n,1);assert.equal(bindingProjection(store,auth,{binding:'goal.progress',sourceId:id,characterId:42}).value,100);
});
test('skills include fresh completed queue entries and type lookup validates real skill categories',async t=>{
 const {store}=await storage(t),service=createGoals(store,auth,publish(store));store.saveSnapshot(42,'skills',sample({skills:[{skill_id:99,trained_skill_level:4}]}));
 store.saveSnapshot(42,'queue',{...sample([{skill_id:99,finished_level:5,finish_date:iso(Date.now()-1000)}]),expiresAt:iso(Date.now()-1)});
 const skill={id:99,name:'Fleet skill',categoryId:16},{id}=service.create(42,{title:'Fleet role',source:'skill.level',typeId:99,target:5},skill);assert.equal(goal(store,id).progress,4);
 store.saveSnapshot(42,'queue',sample([{skill_id:99,finished_level:5,finish_date:iso(Date.now()-1000)}]));service.refresh(42);assert.equal(goal(store,id).done,1);
 assert.throws(()=>service.create(42,{title:'Bad skill',source:'skill.level',target:5,typeId:34},type));assert.throws(()=>service.create(42,{title:'Bad level',source:'skill.level',target:6,typeId:99},skill));
 const calls=[],esi={request:async(path,options)=>{calls.push([path,options]);return sample(path==='/universe/ids'?{inventory_types:[{id:99,name:'Fleet skill'}]}:path.startsWith('/universe/types/')?{name:'Fleet skill',group_id:255}:{category_id:16});}};
 assert.deepEqual(await lookupGoalType(store,esi,{name:'Fleet skill'}),skill);assert.equal(calls[0][1].characterId,undefined);assert.equal(store.get('names')[99],'Fleet skill');
});
test('asset goals sum owned quantities and reject stale, truncated, disabled and unauthorized sources',async t=>{
 const {store}=await storage(t),service=createGoals(store,auth,publish(store));store.saveSnapshot(42,'assets',sample([{type_id:34,quantity:2},{type_id:34,quantity:3},{type_id:99,quantity:500}]));store.saveSnapshot(43,'assets',sample([{type_id:34,quantity:200}]));
 const {id}=service.create(42,{title:'Stockpile',source:'assets.quantity',typeId:34,target:10},type);assert.equal(goal(store,id).progress,5);
 store.saveSnapshot(42,'assets',{...sample([{type_id:34,quantity:100}]),truncated:true});service.refresh(42);assert.equal(goal(store,id).done,0);
 store.saveSnapshot(42,'assets',sample([{type_id:34,quantity:100}]));store.set('module:hangar',false);service.refresh(42);assert.equal(goal(store,id).progress,5);assert.equal(listGoals(store,auth,42)[0].tracking.status,'disabled');
 store.set('module:hangar',true);createGoals(store,{characters:()=>[{id:42,scopes:[]}]},publish(store)).refresh(42);assert.equal(goal(store,id).done,0);
 assert.equal(listGoals(store,{characters:()=>[]},42)[0].tracking.status,'disconnected');service.refresh(42);assert.equal(goal(store,id).done,1);
});
test('mining baselines survive restarts and rolling ledgers without double-counting daily totals',async t=>{
 const {dir,store}=await storage(t),service=createGoals(store,auth,publish(store)),date=iso(Date.now()).slice(0,10),row=q=>({date,solar_system_id:3001,type_id:34,quantity:q});
 store.saveSnapshot(42,'mining',sample([row(50)]));const {id}=service.create(42,{title:'Ore',source:'mining.quantity',typeId:34,target:200},type);assert.equal(goal(store,id).progress,0);
 store.saveSnapshot(42,'mining',sample([row(80)]));service.refresh(42);service.refresh(42);assert.equal(goal(store,id).progress,30);
 store.saveSnapshot(42,'mining',sample([]));service.refresh(42);assert.equal(goal(store,id).progress,30);
 const other=openStore(dir);try{const resumed=createGoals(other,auth,publish(other));other.saveSnapshot(42,'mining',sample([row(100)]));resumed.refresh(42);assert.equal(goal(other,id).progress,50);other.db.prepare('DELETE FROM goals WHERE id=?').run(id);assert.equal(other.db.prepare('SELECT COUNT(*) n FROM goal_progress_entries').get().n,0);assert.equal(other.db.prepare('SELECT COUNT(*) n FROM goal_tracking').get().n,0);}finally{other.close();}
});
test('income and manufacturing goals retain credited records as source windows roll forward',async t=>{
 const {store}=await storage(t),service=createGoals(store,auth,publish(store));store.saveSnapshot(42,'journal',sample([]));store.saveSnapshot(42,'jobs',sample([]));
 const income=service.create(42,{title:'Income',source:'wallet.income',target:1000}).id,industry=service.create(42,{title:'Build',source:'industry.runs',typeId:34,target:20},type).id;backdate(store,income);backdate(store,industry);
 store.saveSnapshot(42,'journal',sample([{id:1,date:iso(Date.now()-1000),amount:100},{id:2,date:iso(Date.now()-1000),amount:-50},{id:3,date:iso(Date.now()-7200000),amount:900}]));
 const job={job_id:1,activity_id:1,product_type_id:34,runs:5,status:'ready',end_date:iso(Date.now()-1000)};store.saveSnapshot(42,'jobs',sample([job,{...job,job_id:2,activity_id:8},{...job,job_id:3,status:'cancelled'},{...job,job_id:4,end_date:iso(Date.now()-7200000)}]));service.refresh(42);
 assert.equal(goal(store,income).progress,100);assert.equal(goal(store,industry).progress,5);
 store.saveSnapshot(42,'jobs',sample([{...job,status:'delivered'}]));service.refresh(42);assert.equal(goal(store,industry).progress,5);
 store.saveSnapshot(42,'jobs',sample([]));store.saveSnapshot(42,'journal',sample([]));service.refresh(42);assert.equal(goal(store,income).progress,100);assert.equal(goal(store,industry).progress,5);
});
test('combat goals count only verified participation since creation and preserve manual legacy goals',async t=>{
 const {store}=await storage(t),service=createGoals(store,auth,publish(store));const {id}=service.create(42,{title:'Fleet contributions',source:'combat.kills',target:2});backdate(store,id);
 const rows=[mail(1),mail(2),mail(3,{killmail_time:iso(Date.now()-7200000)}),mail(4,{victim:{character_id:42,ship_type_id:587}})];const combat=createCombat(store,auth,{request:async path=>sample(rows[Number(path.split('/')[2])-1])},{publish:publish(store)});t.after(()=>combat.close());
 await combat.ingest(42,rows.map(ref));service.refresh(42);assert.equal(goal(store,id).done,1);assert.equal(goal(store,id).progress,2);
 store.db.prepare('INSERT INTO goals VALUES(?,?,?,?,?,?,?,?)').run('legacy',42,'Old manually tracked ISK',100,25,'isk',0,iso(Date.now()));service.refresh(42);assert.equal(goal(store,'legacy').progress,25);assert.equal(listGoals(store,auth,42).find(g=>g.id==='legacy').source,'manual');
});
test('normal core collection pages ESI killmails and updates automatic goals and linked stream widgets',async t=>{
 const {dir,store}=await storage(t),calls=[],k=mail(1);for(const m of catalog)store.set('module:'+m.id,['wallet','combat'].includes(m.id));
 store.saveSnapshot(42,'wallet',sample(100));const service=createGoals(store,auth,publish(store)),g=service.create(42,{title:'Fund',source:'wallet.balance',target:500});
 const request=async path=>sample(path==='/characters/42/wallet'?600:path.startsWith('/killmails/')?k:[]);
 const core=await createCore(store,auth,{request,paged:async path=>{calls.push(path);return sample(path.endsWith('/killmails/recent')?[ref(k)]:[]);},names:async()=>({587:'Rifter'}),health:()=>({})},dir,{noSync:true});
 try{const c=defaultStream();c.elements=[{id:'goal',kind:'progress',visible:true,binding:'goal.progress',sourceId:g.id,characterId:42}];core.stream.save(c);await core.sync(42);assert.ok(calls.includes('/characters/42/killmails/recent'));assert.equal(goal(store,g.id).done,1);assert.equal(core.stream.state().elements[0].value,100);assert.equal(core.snapshots(42).killmails.data[0].result,'kill');}finally{await core.close();}
});
test('HTTP goal and connection edits enforce CSRF and character identity and stay off OBS routes',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'kairo-v4-http-')),app=await startKairo({port:18430,streamPort:18431,dataDir:dir,noSync:true,fetcher:async()=>new Response('{}')});t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 for(const id of [42,43])app.store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(id,'Pilot '+id,JSON.stringify(allScopes),'{}');
 app.store.saveSnapshot(42,'wallet',sample(200));const cookie=(await fetch(app.origin)).headers.get('set-cookie').split(';')[0],boot=await fetch(app.origin+'/api/bootstrap',{headers:{Cookie:cookie}}).then(r=>r.json()),headers={Cookie:cookie,Origin:app.origin,'Content-Type':'application/json','X-Kairo-CSRF':boot.csrf};
 const req=(path,method='GET',body)=>fetch(app.origin+'/api'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const created=await req('/goals?character=42','POST',{title:'Savings',source:'wallet.balance',target:500});assert.equal(created.status,201);const {id}=await created.json();
 const goals=await req('/goals?character=42').then(r=>r.json());assert.equal(goals[0].source,'wallet.balance');assert.equal(goals[0].progress,200);
 assert.equal((await req('/goals/'+id+'?character=42','PUT',{progress:500})).status,400);assert.equal((await req('/goals/'+id+'?character=43','DELETE')).status,400);
 assert.equal((await fetch(app.origin+'/api/goals?character=42',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'})).status,403);
 const put=app.store.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)');put.run(42,1,'A','2026-01-01');const to=Number(put.run(42,2,'B','2026-01-02').lastInsertRowid);
 assert.equal((await req('/journey/connections/'+to+'?character=43','PUT',{hidden:true})).status,400);assert.equal((await req('/journey/connections/'+to+'?character=42','PUT',{hidden:true})).status,200);
 for(const path of ['/api/goals/sources','/api/goals/type','/api/journey/connections/'+to])assert.equal((await fetch(app.streamOrigin+path)).status,404);
 const sources=await req('/goals/sources?character=42').then(r=>r.json());assert.equal(sources.sources.length,8);
});
