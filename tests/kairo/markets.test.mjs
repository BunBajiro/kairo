import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from '../../server/store.mjs';
import {createMarkets,historySummary,JITA,MARKET_SCOPE,QUICK_NAMES} from '../../server/markets.mjs';
import {startKairo} from '../../server/index.mjs';
import {allScopes} from '../../server/modules/catalog.mjs';
import {sanitizeConfig,defaultStream} from '../../server/stream.mjs';
import {bindingProjection} from '../../server/projections.mjs';
const AMARR=60008494,now=Date.parse('2026-09-06T12:00:00Z'),iso=n=>new Date(n).toISOString();
const auth={characters:()=>[{id:42,name:'Bun Bajiro',scopes:allScopes},{id:43,name:'Market alt',scopes:allScopes}]};
const response=(data,extra={})=>({data,headers:{'x-pages':'1'},updatedAt:iso(now),expiresAt:iso(now+300000),...extra});
const hist=Array.from({length:30},(_,i)=>({date:iso(now-(i+1)*86400000).slice(0,10),average:100,lowest:90,highest:110,volume:100,order_count:5}));
const order=(id,type,location=AMARR,price=200,volume=10,buy=false)=>({order_id:id,type_id:type,location_id:location,price,volume_remain:volume,is_buy_order:buy,min_volume:1,range:'station',issued:iso(now-86400000),duration:90,system_id:30002187});
async function setup(t,handler){const dir=await mkdtemp(join(tmpdir(),'kairo-markets-')),store=openStore(dir),calls=[];store.set('market:quick',[1,2]);for(const [id,name] of [[1,'Paste'],[2,'Ammo'],[3,'Drone']])store.db.prepare('INSERT INTO market_types(type_id,name) VALUES(?,?)').run(id,name);
 const esi={request:async(path,options)=>{calls.push({path,options});const result=await handler?.(path,options);if(result!==undefined)return result;if(path.includes('/history?'))return response(hist,{expiresAt:iso(now+86400000)});if(path==='/universe/names')return response(options.body.map(id=>({id,name:'Item '+id,category:'inventory_type'})));throw new Error('Unexpected ESI route '+path);}};
 const m=createMarkets(store,auth,esi,{historySource:'esi',spacingMs:0,now:()=>now});t.after(async()=>{await m.close();store.close();await rm(dir,{recursive:true,force:true});});return {dir,store,m,calls,esi};}
function scan(m,input={}){m.start({hubId:AMARR,mode:'quick',characterId:43,compareJita:false,...input});return m.idle();}
function simpleOrders(path){if(path.includes('/orders?'))return response([order(1,1),order(2,2)]);}

test('quick scans paginate, isolate station orders, aggregate buy/sell and share alt scans with Jita comparisons',async t=>{
 const {m,calls}=await setup(t,path=>{if(!path.includes('/orders?'))return;const u=new URL(path,'https://test'),type=Number(u.searchParams.get('type_id')),page=Number(u.searchParams.get('page')),jita=path.includes('/10000002/');return response(page===1?[order(type*100,type,jita?JITA:AMARR,jita?100:200,10),order(type*100+1,type,60000001,1,9999,true)]:[order(type*100+2,type,jita?JITA:AMARR,jita?120:240,10),order(type*100+3,type,jita?JITA:AMARR,jita?80:150,5,true)],{headers:{'x-pages':'2'}});});
 await scan(m,{compareJita:true});const state=m.overview(),r=m.browse(AMARR).rows.find(r=>r.type_id===1);assert.equal(state.job.status,'complete');assert.equal(state.hubs.find(h=>h.id===AMARR).last_scan.characterName,'Market alt');assert.equal(r.buy,150);assert.equal(r.sell,200);assert.equal(r.sell_volume,20);assert.equal(r.buy_volume,5);assert.equal(r.sell_average,220);assert.equal(r.premium,100);assert.equal(r.average_premium,100);assert.equal(r.coverage_days,.2);assert.equal(r.history.daily_volume,100);assert.equal(m.report(AMARR,{signal:'premium'}).total,2);assert.equal(m.report(AMARR,{signal:'undersupply'}).total,2);assert.equal(m.detail(AMARR,1,{side:'buy'}).orders.length,1);assert.equal(m.detail(AMARR,1).orders[0].price,200);assert.ok(calls.filter(c=>c.path.includes('/orders?')).every(c=>c.options.characterId===0));
});
test('failed or stale page updates never overwrite a complete previous book',async t=>{
 let failing=false;const {m,store}=await setup(t,path=>{if(!path.includes('/orders?'))return;if(!failing)return response([order(1,1),order(2,2)]);const page=Number(new URL(path,'https://test').searchParams.get('page'));return page===1?response([order(99,1,AMARR,1,999)],{headers:{'x-pages':'2'}}):response([],{stale:true,error:'ESI unavailable',errorStatus:503});});
 await scan(m);const before=JSON.stringify(m.browse(AMARR)),stamp=m.overview().hubs.find(h=>h.id===AMARR).last_scan.at;failing=true;await scan(m);assert.equal(m.overview().job.status,'failed');assert.equal(JSON.stringify(m.browse(AMARR)),before);assert.equal(m.overview().hubs.find(h=>h.id===AMARR).last_scan.at,stamp);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM market_stage').get().n,0);
});
test('quick refresh clears sold-out items without deleting full-scan coverage',async t=>{
 let pass=0;const {m}=await setup(t,path=>{if(path.includes('/orders?'))return response(pass===0?[order(1,1),order(2,2),order(3,3)]:[order(4,1,AMARR,300,2)]);});await scan(m,{mode:'full'});pass++;await scan(m);const rows=m.browse(AMARR).rows;assert.equal(rows.length,3);assert.equal(rows.find(r=>r.type_id===2).sell,null);assert.equal(rows.find(r=>r.type_id===2).sell_volume,0);assert.equal(rows.find(r=>r.type_id===3).sell_volume,10);assert.equal(m.detail(AMARR,2).orders.length,0);assert.equal(m.detail(AMARR,1).orders[0].volume,2);
});
test('full books exceed the old 250-page helper limit and browse in bounded pages',async t=>{
 const {m,calls}=await setup(t,path=>{if(path.includes('/orders?')){const page=Number(new URL(path,'https://test').searchParams.get('page'));return response([order(page,1000+page)],{headers:{'x-pages':'251'}});}});await scan(m,{mode:'full'});assert.equal(m.overview().job.status,'complete');assert.equal(calls.filter(c=>c.path.includes('/orders?')).length,251);assert.equal(m.browse(AMARR).total,253);assert.equal(m.browse(AMARR).rows.length,60);assert.equal(m.browse(AMARR,{page:4}).rows.length,13);assert.equal(m.browse(AMARR,{page:9999}).page,4);assert.equal(m.browse(AMARR,{query:'Item 1251'}).total,1);
});
test('pagination changes, unreasonable counts and malformed orders leave no partial success',async t=>{
 let kind='drift';const {m}=await setup(t,path=>{if(!path.includes('/orders?'))return;const page=Number(new URL(path,'https://test').searchParams.get('page'));return kind==='large'?response([],{headers:{'x-pages':'2001'}}):kind==='invalid'?response([{...order(1,1),price:NaN}]):response([order(page,1)],{headers:{'x-pages':page===1?'2':'3'}});});for(kind of ['drift','large','invalid']){await scan(m);assert.equal(m.overview().job.status,'failed');assert.equal(m.browse(AMARR).total,0);assert.equal(m.overview().hubs.find(h=>h.id===AMARR).last_scan,null);}
});
test('one scan at a time, cancellation and restart retain durable completed books',async t=>{
 let pause=false,release,arrived;const barrier=new Promise(r=>arrived=r);const {m,store,dir,esi}=await setup(t,async path=>{if(path.includes('/orders?')){if(pause){arrived();await new Promise(r=>release=r);}return response([order(1,1),order(2,2)]);}});await scan(m);pause=true;const j=m.start({hubId:AMARR,mode:'quick',characterId:43,compareJita:false});await barrier;assert.equal(m.start({hubId:AMARR,mode:'quick',characterId:43,compareJita:false}).id,j.id);assert.throws(()=>m.start({hubId:JITA,mode:'full'}),/One market scan/);m.cancel();release();await m.idle();assert.equal(m.overview().job.status,'cancelled');assert.equal(m.browse(AMARR).total,2);
 store.db.prepare('INSERT INTO market_jobs VALUES(?,?)').run('interrupted',JSON.stringify({id:'interrupted',status:'running'}));const reopened=openStore(dir),next=createMarkets(reopened,auth,esi,{historySource:'esi',spacingMs:0,now:()=>now+86400000});try{assert.equal(next.overview().job.status,'interrupted');assert.equal(next.browse(AMARR).total,2);assert.equal(next.browse(AMARR).rows[0].stale,true);}finally{await next.close();reopened.close();}
});
test('scan coalescing never acknowledges a different item, character or Jita comparison',async t=>{
 let release,arrived;const gate=new Promise(resolve=>{release=resolve;}),seen=new Promise(resolve=>{arrived=resolve;});
 const {m}=await setup(t,async path=>{if(path.includes('/orders?')){arrived();await gate;return response([order(1,1)]);}});
 const input={hubId:AMARR,mode:'item',typeId:1,characterId:43,compareJita:false};
 const first=m.start(input);await seen;
 try{
  assert.equal(m.start({...input}).id,first.id,'An identical active request reuses its job');
  for(const change of [{typeId:2},{characterId:42},{compareJita:true}])assert.throws(()=>m.start({...input,...change}),/One market scan/,'A distinct request must not be reported as the already running job');
  m.cancel();assert.throws(()=>m.start(input),/One market scan/,'A stopping job cannot acknowledge a new scan request');
 }finally{release();await m.idle();}
});
test('history failure keeps the newly completed book and reports explicit missing coverage',async t=>{
 const {m}=await setup(t,path=>{if(path.includes('/orders?'))return response([order(1,1),order(2,2)]);if(path.includes('/history?'))throw new Error('History is temporarily unavailable');});await scan(m);assert.equal(m.overview().job.status,'failed');assert.equal(m.overview().job.books.length,1);assert.equal(m.browse(AMARR).total,2);assert.equal(m.report(AMARR,{signal:'undersupply'}).total,0);assert.equal(m.report(AMARR).historyCount,0);assert.equal(m.report(AMARR).comparable,0);
});
test('history statistics use completed UTC calendar days, volume weights and honest coverage',()=>{
 const s=historySummary([{date:'2026-09-05',volume:30,average:100},{date:'2026-09-04',volume:90,average:200},{date:'2026-09-06',volume:999,average:999},{date:'2026-07-01',volume:999,average:999}],now);assert.equal(s.daily_volume,4);assert.equal(s.average,175);assert.equal(s.reported_days,2);assert.equal(s.to,'2026-09-05');assert.equal(s.from,'2026-08-07');assert.equal(historySummary([],now).average,null);
});
test('structure scans require an authorized alt, read all pages even for quick mode and retain shared cache after disconnect',async t=>{
 const id=1040000000001;const {m,store,calls}=await setup(t,path=>{if(path.startsWith('/markets/structures/'))return response([order(1,1,id),order(2,3,id)]);});store.db.prepare('INSERT INTO market_hubs(id,name,station_name,kind,system_id,system_name,region_id,region_name) VALUES(?,?,?,?,?,?,?,?)').run(id,'Staging','Fortizar','structure',30002187,'Amarr',10000043,'Domain');assert.throws(()=>m.start({hubId:id,mode:'quick',characterId:0}),/connected character/);assert.throws(()=>m.start({hubId:id,mode:'quick',characterId:99}),/Reconnect/);await scan(m,{hubId:id});assert.equal(m.overview().job.status,'complete');assert.equal(calls.find(c=>c.path.startsWith('/markets/structures/')).options.characterId,43);assert.equal(m.browse(id).total,2);assert.equal(m.browse(id).rows.some(r=>r.type_id===3),false);const saved=auth.characters;auth.characters=()=>[];try{assert.equal(m.browse(id).rows.find(r=>r.type_id===1).sell,200);assert.throws(()=>m.start({hubId:id,mode:'full',characterId:43}),/Reconnect/);}finally{auth.characters=saved;}
});
test('hub resolution uses ESI identity, validates structure scope, and removing a hub keeps its cache',async t=>{
 const {m,calls}=await setup(t,path=>{if(path==='/universe/stations/60000001')return response({name:'Resolved Station',system_id:30000001,services:['market']});if(path==='/universe/systems/30000001')return response({name:'Resolved System',constellation_id:20000001,stations:[60000001]});if(path==='/universe/constellations/20000001')return response({region_id:10000001});if(path==='/universe/regions/10000001')return response({name:'Resolved Region'});return simpleOrders(path);});const added=await m.addHub({locationId:60000001,name:'My outpost',characterId:43});assert.equal(added.station_name,'Resolved Station');assert.equal(added.region_name,'Resolved Region');assert.ok(calls.slice(0,4).every(c=>!c.options.characterId));await scan(m);m.removeHub(AMARR);assert.equal(m.overview().hubs.some(h=>h.id===AMARR),false);assert.equal(m.browse(AMARR).total,2);m.restoreDefaults();assert.equal(m.overview().hubs.find(h=>h.id===AMARR).item_count,2);await assert.rejects(m.addHub({locationId:'https://evil.test'}),/valid station/);
});
test('dedicated goal templates retain explicit owner selection and project any selected local or alt goal',async t=>{
 const {store}=await setup(t,simpleOrders);store.db.prepare('INSERT INTO goals VALUES(?,?,?,?,?,?,?,?)').run('alt-goal',43,'Alt objective',100,35,'manual',0,iso(now));const c=defaultStream();c.elements=[{id:'goal-widget',kind:'goal',binding:'goal.progress',characterId:43,sourceId:'alt-goal',bindingDisplay:'both',visible:true}];const e=sanitizeConfig(c).elements[0];assert.equal(e.kind,'goal');assert.equal(bindingProjection(store,auth,e).value,35);assert.equal(bindingProjection(store,auth,{...e,characterId:42}).bindingStatus,'unavailable');
});
test('market HTTP endpoints require a dashboard session and CSRF and are absent from OBS',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'kairo-market-http-'));const app=await startKairo({port:18440,streamPort:18441,dataDir:dir,noSync:true,markets:{spacingMs:0},fetcher:async()=>new Response('[]',{headers:{'content-type':'application/json'}})});t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});let r=await fetch(app.origin+'/api/markets');assert.equal(r.status,401);r=await fetch(app.origin+'/');const cookie=r.headers.get('set-cookie').split(';')[0],boot=await(await fetch(app.origin+'/api/bootstrap',{headers:{cookie}})).json();assert.ok(boot.modules.find(m=>m.id==='markets').scopes.includes(MARKET_SCOPE));r=await fetch(app.origin+'/api/markets',{headers:{cookie}});assert.equal((await r.json()).hubs.length,4);r=await fetch(app.origin+'/api/markets/hubs/'+AMARR,{method:'DELETE',headers:{cookie}});assert.equal(r.status,403);r=await fetch(app.origin+'/api/markets/hubs/'+AMARR,{method:'DELETE',headers:{cookie,'X-Kairo-CSRF':boot.csrf,origin:app.origin}});assert.equal(r.status,200);r=await fetch(app.streamOrigin+'/api/markets');assert.equal(r.status,404);r=await fetch(app.streamOrigin+'/api/markets/browse?hub='+AMARR);assert.equal(r.status,404);r=await fetch(app.streamOrigin+'/api/markets/categories?hub='+AMARR);assert.equal(r.status,404);r=await fetch(app.origin+'/api/markets/categories?hub='+JITA,{headers:{cookie}});assert.equal(r.status,200);assert.ok((await r.json()).groups.some(g=>g.name==='Ships'));r=await fetch(app.origin+'/api/markets/categories?hub='+JITA);assert.equal(r.status,401);
});

test('continuing history reuses complete books and fresh histories without repeated network calls',async t=>{
 let failed=true;const {m,calls}=await setup(t,path=>{if(path.includes('/orders?'))return response([order(1,1),order(2,2)]);if(path.includes('/history?type_id=2')&&failed)throw new Error('Temporary history failure');});await scan(m,{mode:'full'});assert.equal(m.overview().job.phase,'history');assert.equal(m.overview().job.status,'failed');assert.equal(m.report(AMARR).historyCount,1);const orderCalls=calls.filter(c=>c.path.includes('/orders?')).length,historyOneCalls=calls.filter(c=>c.path.includes('/history?type_id=1')).length;failed=false;await scan(m,{mode:'history'});assert.equal(m.overview().job.status,'complete');assert.equal(m.report(AMARR).historyCount,2);assert.equal(calls.filter(c=>c.path.includes('/orders?')).length,orderCalls);assert.equal(calls.filter(c=>c.path.includes('/history?type_id=1')).length,historyOneCalls);
});

test('a pending quick-list addition preserves a removal completed during its item lookup',async t=>{
 let release,arrived;const gate=new Promise(r=>release=r),seen=new Promise(r=>arrived=r);
 const {m,store,calls}=await setup(t,async(path,options)=>{
  if(path==='/universe/ids'){arrived();await gate;return response({inventory_types:[{id:3,name:options.body[0]}]});}
  if(path==='/universe/types/3')return response({market_group_id:1});
 });
 const pending=m.quickChange({name:'Drone'});await seen;
 await m.quickChange({remove:1});release();await pending;
 assert.deepEqual(store.get('market:quick'),[2,3],'The added drone must not restore the removed paste');
 assert.equal(calls.length,2,'Only the new item identity and marketability are requested');
});

test('concurrent quick-list removals cannot silently restore a removed item or empty the basket',async t=>{
 const {m,store,calls}=await setup(t);store.set('market:quick',[1,2,3]);
 await Promise.all([m.quickChange({remove:1}),m.quickChange({remove:2})]);
 assert.deepEqual(store.get('market:quick'),[3]);assert.equal(calls.length,0);
 await assert.rejects(m.quickChange({remove:3}),/at least one/);assert.deepEqual(store.get('market:quick'),[3]);
});

test('a delayed quick-list addition cannot publish after another window starts a scan',async t=>{
 let releaseLookup,lookupArrived,releaseScan,scanArrived;
 const lookupGate=new Promise(r=>releaseLookup=r),lookupSeen=new Promise(r=>lookupArrived=r),scanGate=new Promise(r=>releaseScan=r),scanSeen=new Promise(r=>scanArrived=r);
 const {m,store}=await setup(t,async(path,options)=>{
  if(path==='/universe/ids'){lookupArrived();await lookupGate;return response({inventory_types:[{id:3,name:options.body[0]}]});}
  if(path==='/universe/types/3')return response({market_group_id:1});
  if(path.includes('/orders?')){scanArrived();await scanGate;return response([order(1,1),order(2,2)]);}
 });
 const pending=m.quickChange({name:'Drone'});await lookupSeen;m.start({hubId:AMARR,mode:'quick',compareJita:false});await scanSeen;
 try{releaseLookup();await assert.rejects(pending,/active scan/);assert.deepEqual(store.get('market:quick'),[1,2]);}
 finally{releaseScan();await m.idle();}
 assert.equal(m.overview().job.status,'complete');
});

test('late first-use basket resolution retains an edit already applied by another caller',async t=>{
 let releaseSecond,secondArrived,calls=0;const gate=new Promise(r=>releaseSecond=r),seen=new Promise(r=>secondArrived=r);
 const {m,store}=await setup(t,async(path,options)=>{
  if(path==='/universe/ids'){if(++calls===2){secondArrived();await gate;}return response({inventory_types:options.body.map((name,i)=>({id:i+1,name}))});}
 });
 store.db.prepare('DELETE FROM settings WHERE key=?').run('market:quick');
 const first=m.quickChange({remove:1}),second=m.quickChange({remove:2});await seen;await first;releaseSecond();await second;
 const result=store.get('market:quick');assert.equal(result.includes(1),false);assert.equal(result.includes(2),false);assert.equal(result.length,QUICK_NAMES.length-2);
});

test('concurrent additions respect the quick-list limit and a freed slot can be used without reloading',async t=>{
 let release;const gate=new Promise(r=>release=r);
 const {m,store,calls}=await setup(t,async(path,options)=>{
  if(path==='/universe/ids'){await gate;const name=options.body[0];return response({inventory_types:[{id:name==='First item'?1001:1002,name}]});}
  if(path.startsWith('/universe/types/'))return response({market_group_id:1});
 });
 store.set('market:quick',Array.from({length:79},(_,i)=>i+1));
 const first=m.quickChange({name:'First item'}),second=m.quickChange({name:'Second item'});release();
 const results=await Promise.allSettled([first,second]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/80 items/);
 assert.equal(store.get('market:quick').length,80);assert.equal(calls.length,4);
 await m.quickChange({remove:1});await m.quickChange({name:'Second item'});assert.equal(store.get('market:quick').length,80);assert.equal(store.get('market:quick').includes(1002),true);assert.equal(store.get('market:quick').includes(1),false);
});

test('concurrent hub additions cannot exceed the followed-hub limit after asynchronous resolution',async t=>{
 let release;const gate=new Promise(r=>release=r);
 const {m,store,calls}=await setup(t,async path=>{
  if(path.startsWith('/universe/stations/')){await gate;return response({name:'Resolved station',system_id:30000001,services:['market']});}
  if(path==='/universe/systems/30000001')return response({name:'System',constellation_id:20000001});
  if(path==='/universe/constellations/20000001')return response({region_id:10000001});
  if(path==='/universe/regions/10000001')return response({name:'Region'});
 });
 const put=store.db.prepare("INSERT INTO market_hubs(id,name,station_name,kind,system_id,system_name,region_id,region_name) VALUES(?,?,?,'station',30000001,'System',10000001,'Region')");
 for(let i=0;i<27;i++)put.run(61000000+i,'Hub '+i,'Station '+i);
 const a=m.addHub({locationId:62000001}),b=m.addHub({locationId:62000002});release();
 const results=await Promise.allSettled([a,b]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1,'Only one free slot can be consumed');
 assert.match(results.find(r=>r.status==='rejected').reason.message,/32 hubs/);assert.equal(m.overview().hubs.length,32);assert.equal(calls.length,8);
 const accepted=results.find(r=>r.status==='fulfilled').value.id,rejected=accepted===62000001?62000002:62000001;
 await m.addHub({locationId:accepted,name:'Renamed hub'});assert.equal(m.overview().hubs.length,32);assert.equal(m.overview().hubs.find(h=>h.id===accepted).name,'Renamed hub');
 const before=calls.length;await assert.rejects(m.addHub({locationId:rejected}),/32 hubs/);assert.equal(calls.length,before,'A full network rejects a new hub before ESI');
 m.removeHub(accepted);await m.addHub({locationId:rejected});assert.equal(m.overview().hubs.length,32);assert.equal(m.overview().hubs.some(h=>h.id===rejected),true);
});

test('history requested before the first custom-hub book cannot wedge future market scans',async t=>{
 const custom=62000001,{m,store}=await setup(t,path=>path.includes('/orders?')?response([order(1,1,custom),order(2,2,custom)]):undefined);
 store.db.prepare("INSERT INTO market_hubs(id,name,station_name,kind,system_id,system_name,region_id,region_name) VALUES(?,'Custom hub','Station','station',30000001,'System',10000001,'Region')").run(custom);
 const input={hubId:custom,mode:'history',compareJita:false};const failed=m.start(input);await m.idle();
 assert.equal(m.overview().job.status,'failed');assert.match(m.overview().job.detail,/Scan an order book/);
 const retried=m.start(input);await m.idle();assert.notEqual(retried.id,failed.id,'Retry gets a new job, not the already failed task');
 await scan(m,{hubId:custom,characterId:0});assert.equal(m.overview().job.status,'complete');assert.equal(m.browse(custom).rows.length,2);
 await scan(m,{hubId:custom,mode:'history',characterId:0});assert.equal(m.overview().job.status,'complete');
});

test('refreshing a shorter order book clamps an open seller or buyer page to its remaining orders',async t=>{
 let sellers=85,buyers=81;
 const {m,calls}=await setup(t,path=>path.includes('/orders?')?response([
  ...Array.from({length:sellers},(_,i)=>order(i+1,1,AMARR,200+i)),
  ...Array.from({length:buyers},(_,i)=>order(1000+i,1,AMARR,100+i,10,true))
 ]):undefined);
 await scan(m,{mode:'item',typeId:1});
 for(const side of ['sell','buy']){const initial=m.detail(AMARR,1,{side,page:2});assert.equal(initial.page,2);assert.equal(initial.orders.length,side==='sell'?5:1);}
 sellers=41;buyers=2;await scan(m,{mode:'item',typeId:1});const before=calls.length;
 const sell=m.detail(AMARR,1,{side:'sell',page:2}),buy=m.detail(AMARR,1,{side:'buy',page:2});
 assert.equal(sell.page,1,'An existing seller page must move to the final nonempty page');assert.equal(sell.orders.length,1);assert.equal(sell.orders[0].price,240);assert.equal(sell.total,41);
 assert.equal(buy.page,0);assert.equal(buy.orders.length,2);assert.deepEqual(buy.orders.map(o=>o.price),[101,100]);assert.equal(calls.length,before,'Paging remains an offline cached read');
 const first=m.detail(AMARR,1,{side:'sell',page:0});assert.equal(first.page,0);assert.equal(first.orders.length,40);assert.equal(first.orders[0].price,200);
 sellers=40;buyers=40;await scan(m,{mode:'item',typeId:1});for(const side of ['sell','buy']){const exact=m.detail(AMARR,1,{side,page:1});assert.equal(exact.page,0);assert.equal(exact.orders.length,40);assert.equal(exact.total,40);}
 sellers=0;buyers=0;await scan(m,{mode:'item',typeId:1});for(const side of ['sell','buy']){const empty=m.detail(AMARR,1,{side,page:2});assert.equal(empty.page,0);assert.equal(empty.total,0);assert.deepEqual(empty.orders,[]);}
});
