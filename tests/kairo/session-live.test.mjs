import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from '../../server/store.mjs';
import {createSessionLiveFeed} from '../../server/session-live.mjs';
import {createSessionCombat} from '../../server/session-combat.mjs';
import {sessionCollection,SESSION_LIVE_INTERVAL,SESSION_RECHECK_WINDOW} from '../../server/session-policy.mjs';
import {sessionReport} from '../../server/history.mjs';
import {createCombat} from '../../server/combat.mjs';

const epoch=Date.now()-3600000,iso=n=>new Date(n).toISOString(),hash='a'.repeat(40),key='session:live-feed';
const auth={characters:()=>[{id:42},{id:43}]};
const mail=(id,overrides={})=>({killmail_id:id,killmail_time:iso(epoch-60000),solar_system_id:1,victim:{character_id:99,ship_type_id:587,alliance_id:88},attackers:[{character_id:42,alliance_id:77}],...overrides});
const packet=(sequence,id=sequence,overrides={})=>({killmail_id:id,hash,esi:mail(id,overrides),zkb:{hash,totalValue:id*1000},sequence_id:sequence});
const response=body=>Response.json(body);
const missing=()=>new Response('',{status:404});
function memory(){const m=new Map();return {get:(k,d)=>m.has(k)?m.get(k):d,set:(k,v)=>m.set(k,v)};}
async function storage(t){const dir=await mkdtemp(join(tmpdir(),'kairo-live-')),store=openStore(dir);t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});return {store,dir};}
function session(store,id,{pilot=42,started=epoch-3600000,ended=null,alliance=77}={}){
 store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)').run(id,pilot,id,iso(started),ended===null?null:iso(ended),JSON.stringify({system:{id:1,name:'Alpha'},alliance:alliance?{id:alliance,name:'Alliance'}:null}),'{}');
 return store.db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
}
const publish=store=>e=>store.db.prepare('INSERT OR IGNORE INTO events(character_id,type,module,summary,payload,at,dedupe) VALUES(?,?,?,?,?,?,?)').run(e.characterId,e.type,e.module,e.summary,JSON.stringify(e.payload),e.at,e.dedupe);

test('collection stays live regardless of age and becomes static exactly 24 hours after ending',()=>{
 assert.equal(sessionCollection({started:iso(epoch-3*SESSION_RECHECK_WINDOW),ended:null},epoch).phase,'live');
 const ended={ended:iso(epoch)};
 assert.equal(sessionCollection(ended,epoch).phase,'settling');
 assert.equal(sessionCollection(ended,epoch+SESSION_RECHECK_WINDOW-1).phase,'settling');
 assert.deepEqual(sessionCollection(ended,epoch+SESSION_RECHECK_WINDOW),{phase:'static',until:iso(epoch+SESSION_RECHECK_WINDOW),intervalSeconds:120});
});

test('one live feed shares a durable cursor, checks every two minutes, and observes the 404 minimum wait',async t=>{
 const store=memory(),calls=[],accepted=[];let clock=epoch,available=101;
 const options={getTargets:()=>[42,43],isTargetActive:()=>true,now:()=>clock,spacingMs:0,accept:async k=>accepted.push(k.killmail_id),fetcher:async url=>{
  calls.push(url);if(url.endsWith('sequence.json'))return response({sequence:100});
  const n=Number(url.split('/').at(-1).split('.')[0]);return n<available?response(packet(n)):missing();
 }};
 const feed=createSessionLiveFeed(store,options);t.after(()=>feed.close());
 await Promise.all([feed.sync(),feed.sync(),feed.sync()]);
 assert.equal(calls.length,3);assert.deepEqual(accepted,[100]);assert.equal(store.get(key).nextSequence,101);
 clock+=5999;await feed.sync({force:true});assert.equal(calls.length,3);
 clock=epoch+SESSION_LIVE_INTERVAL-1;await feed.sync();assert.equal(calls.length,3);
 clock++;available=102;await feed.sync();assert.deepEqual(accepted,[100,101]);assert.equal(calls.length,5);
 await feed.close();
 const restarted=createSessionLiveFeed(store,options);t.after(()=>restarted.close());
 clock+=SESSION_LIVE_INTERVAL;available=103;await restarted.sync();
 assert.deepEqual(accepted,[100,101,102]);assert.equal(calls.filter(url=>url.endsWith('sequence.json')).length,1);
});

test('ending the last live session during a request discards the packet and stops further feed requests',async t=>{
 const store=memory();let live=true,release,started,calls=0,accepted=0;
 const began=new Promise(resolve=>{started=resolve;});store.set(key,{nextSequence:100,lastAdvanceAt:iso(epoch)});
 const feed=createSessionLiveFeed(store,{getTargets:()=>live?[42]:[],isTargetActive:()=>live,now:()=>epoch,spacingMs:0,accept:async()=>{accepted++;},fetcher:async()=>{calls++;started();return new Promise(resolve=>{release=resolve;});}});t.after(()=>feed.close());
 const running=feed.sync();await began;live=false;release(response(packet(100)));await running;
 await feed.sync({force:true});assert.equal(calls,1);assert.equal(accepted,0);assert.equal(store.get(key).nextSequence,100);
});

test('failed verification and HTTP cooldowns retain the cursor, including across forced checks',async t=>{
 const store=memory();let clock=epoch,calls=0,mode='verify';store.set(key,{nextSequence:100,lastAdvanceAt:iso(epoch)});
 const feed=createSessionLiveFeed(store,{getTargets:()=>[42],isTargetActive:()=>true,now:()=>clock,spacingMs:0,maxItems:1,
  accept:async()=>{if(mode==='verify')throw new Error('ESI pending');},fetcher:async()=>{calls++;return mode==='limit'?new Response('',{status:429,headers:{'Retry-After':'1800'}}):response(packet(100));}});t.after(()=>feed.close());
 await feed.sync();assert.equal(store.get(key).nextSequence,100);assert.match(store.get(key).error,/ESI pending/);
 clock+=SESSION_LIVE_INTERVAL;mode='limit';await feed.sync();assert.equal(store.get(key).nextSequence,100);assert.equal(Date.parse(store.get(key).notBefore),clock+1800000);
 clock+=1799999;await feed.sync({force:true});assert.equal(calls,2);
 clock++;mode='ok';await feed.sync();assert.equal(store.get(key).nextSequence,101);assert.equal(store.get(key).error,null);
});

test('a session ending during request spacing cannot start another feed request',async t=>{
 const store=memory();let live=true,calls=0;
 const feed=createSessionLiveFeed(store,{getTargets:()=>[42],isTargetActive:()=>live,now:()=>epoch,spacingMs:10,accept:async()=>{},fetcher:async()=>{calls++;setTimeout(()=>{live=false;},0);return response({sequence:100});}});t.after(()=>feed.close());
 await feed.sync();assert.equal(calls,1);assert.equal(store.get(key).nextSequence,100);
});

test('an expired live cursor restarts from the current pointer instead of looping on expired packets',async t=>{
 const store=memory(),paths=[];store.set(key,{nextSequence:1,lastAdvanceAt:iso(epoch-SESSION_RECHECK_WINDOW-1)});
 const feed=createSessionLiveFeed(store,{getTargets:()=>[42],isTargetActive:()=>true,now:()=>epoch,spacingMs:0,accept:async()=>{},fetcher:async url=>{paths.push(url.split('/').at(-1));return url.endsWith('sequence.json')?response({sequence:100}):missing();}});t.after(()=>feed.close());
 await feed.sync();assert.deepEqual(paths,['sequence.json','100.json']);assert.equal(store.get(key).nextSequence,100);
});

test('feed work is bounded and rejects malformed or oversized packets without advancing',async t=>{
 const store=memory();let clock=epoch,calls=0,mode='valid';store.set(key,{nextSequence:100,lastAdvanceAt:iso(epoch)});
 const feed=createSessionLiveFeed(store,{getTargets:()=>[42],isTargetActive:()=>true,now:()=>clock,spacingMs:0,maxItems:2,accept:async()=>{},fetcher:async url=>{
  calls++;const n=Number(url.split('/').at(-1).split('.')[0]);
  if(mode==='large')return new Response(' '.repeat(4*1024*1024+1));
  return response(mode==='invalid'?packet(n+1):packet(n));
 }});t.after(()=>feed.close());
 await feed.sync();assert.equal(calls,2);assert.equal(store.get(key).nextSequence,102);assert.equal(store.get(key).status,'catching_up');
 clock+=SESSION_LIVE_INTERVAL;mode='invalid';await feed.sync();assert.equal(store.get(key).nextSequence,102);assert.match(store.get(key).error,/invalid packet/);
 clock+=SESSION_LIVE_INTERVAL;mode='large';await feed.sync();assert.equal(store.get(key).nextSequence,102);assert.match(store.get(key).error,/size limit/);
});

test('closing a live collector aborts its in-flight request without recording an error or advancing',async()=>{
 const store=memory();let started;const began=new Promise(resolve=>{started=resolve;});store.set(key,{nextSequence:100,lastAdvanceAt:iso(epoch)});
 const feed=createSessionLiveFeed(store,{getTargets:()=>[42],isTargetActive:()=>true,now:()=>epoch,spacingMs:0,accept:async()=>{},fetcher:async(_url,{signal})=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});started();})});
 const running=feed.sync();await began;await feed.close();await running;
 assert.equal(store.get(key).nextSequence,100);assert.equal(store.get(key).error,undefined);
});

test('live packets verify only relevant records, preserve full personal/alliance totals and stop on end',async t=>{
 const {store}=await storage(t);session(store,'live');let clock=epoch,calls=0;const esiCalls=[];
 const packets=[packet(100,1),packet(101,2,{victim:{character_id:42,ship_type_id:587,alliance_id:77},attackers:[{character_id:43,alliance_id:77},{character_id:99,alliance_id:88}]}),packet(102,3,{solar_system_id:999,attackers:[{alliance_id:999}]}),packet(103,1)];
 const esi={request:async path=>{const id=Number(path.split('/')[2]);esiCalls.push(id);return {data:packets.find(p=>p.killmail_id===id).esi};}};
 const combat=createCombat(store,auth,esi,{publish:publish(store),now:()=>clock});
 const collector=createSessionCombat(store,auth,esi,combat,{now:()=>clock,feedOptions:{spacingMs:0},feedFetcher:async url=>{calls++;if(url.endsWith('sequence.json'))return response({sequence:100});const n=Number(url.split('/').at(-1).split('.')[0]);return packets[n-100]?response(packets[n-100]):missing();}});
 t.after(async()=>{await collector.close();await combat.close();});
 await collector.syncLive();
 const r=sessionReport(store,'live',42);assert.equal(r.stats.kills,1);assert.equal(r.stats.losses,1);assert.equal(r.allianceCombat.kills,1);assert.equal(r.allianceCombat.losses,1);assert.equal(r.allianceCombat.destroyed,1000);assert.equal(r.allianceCombat.lost,2000);
 assert.equal(r.allianceCombat.items.every(k=>k.kill!==k.loss),true);assert.equal(esiCalls.includes(3),false);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM alliance_combat_records').get().n,2);
 assert.equal(r.collection.phase,'live');assert.equal(r.liveFeed.status,'ready');
 store.db.prepare('UPDATE sessions SET ended=? WHERE id=?').run(iso(epoch),'live');clock+=SESSION_LIVE_INTERVAL;
 const count=calls;await collector.syncLive({force:true});assert.equal(calls,count);assert.equal(sessionReport(store,'live',42).liveFeed,null);
});

test('the feed continues for another live pilot but ignores ended sessions and paused combat',async t=>{
 const {store}=await storage(t);session(store,'ended',{ended:epoch});session(store,'other-live',{pilot:43,alliance:null});let clock=epoch,calls=0;const ingested=[];
 const body=mail(7,{attackers:[{character_id:43}]});
 const collector=createSessionCombat(store,auth,{request:async()=>({data:body})},{ingest:async id=>{ingested.push(id);return {};},publicPage:async()=>assert.fail('History must not run from syncLive')},{now:()=>clock,feedOptions:{spacingMs:0,maxItems:1},feedFetcher:async url=>{calls++;return response(url.endsWith('sequence.json')?{sequence:100}:{...packet(100,7),esi:body});}});t.after(()=>collector.close());
 await collector.syncLive();assert.deepEqual(ingested,[43]);assert.equal(store.get('session:combat:ended',null),null);
 clock+=SESSION_LIVE_INTERVAL;store.set('module:combat',false);await collector.syncLive();assert.equal(calls,2);
});

test('ending triggers pending history checks while retaining the source cache and the 24-hour cutoff',async t=>{
 const {store}=await storage(t);session(store,'flight');let clock=epoch,calls=0;
 const combat=createCombat(store,auth,{},{now:()=>clock,spacingMs:0,fetcher:async()=>{calls++;return response([]);}});
 const collector=createSessionCombat(store,auth,{},combat,{now:()=>clock,feedFetcher:async()=>assert.fail('Ended sessions must never start the incremental feed')});t.after(async()=>{await collector.close();await combat.close();});
 await collector.sync('flight',42);assert.equal(calls,1);assert.equal(store.get('session:combat:flight').ended,null);
 clock+=60000;store.db.prepare('UPDATE sessions SET ended=? WHERE id=?').run(iso(clock),'flight');
 await collector.sessionChanged('flight',42);assert.equal(store.get('session:combat:flight').ended,iso(clock));assert.equal(calls,1,'end check observes cached history');
 clock=epoch+3600000;await collector.syncRecent(42);assert.equal(calls,2);
 clock=epoch+60000+SESSION_RECHECK_WINDOW;await collector.syncRecent(42);await collector.sync('flight',42);assert.equal(calls,2,'manual opens cannot restart archived collection');
});

test('every recent ended session is eligible for delayed history checks, not just the newest eight',async t=>{
 const {store}=await storage(t);for(let i=0;i<10;i++)session(store,'flight-'+i,{ended:epoch-i*60000});session(store,'old',{ended:epoch-SESSION_RECHECK_WINDOW});let calls=0;
 const collector=createSessionCombat(store,auth,{}, {publicPage:async()=>{calls++;return {refs:[],expiresAt:iso(epoch+3600000)};}},{now:()=>epoch,feedFetcher:async()=>assert.fail('No live session')});t.after(()=>collector.close());
 await collector.syncRecent(42);assert.equal(calls,10);assert.equal(store.get('session:combat:old',null),null);
});

test('history reaching the archive deadline in flight does not verify or retain further records',async t=>{
 const {store}=await storage(t);session(store,'ending',{ended:epoch});let clock=epoch+SESSION_RECHECK_WINDOW-1;
 const collector=createSessionCombat(store,auth,{request:async()=>assert.fail('Verification after cutoff')},{publicPage:async()=>{clock++;return {refs:[{killmail_id:1,killmail_hash:hash}],expiresAt:iso(clock+3600000)};}},{now:()=>clock});t.after(()=>collector.close());
 await collector.sync('ending',42);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM alliance_combat_records').get().n,0);
});
