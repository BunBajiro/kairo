import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createCacheRetention,pruneMarketJobs} from '../../server/cache-retention.mjs';
import {createESI} from '../../server/esi.mjs';
import {createCombat} from '../../server/combat.mjs';
const DAY=86400000,HOUR=3600000,AT=Date.parse('2026-10-03T00:00:00Z'),iso=n=>new Date(n).toISOString();
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'kairo-retention-')),store=openStore(dir);t.after(async()=>{try{store.close();}catch{}await rm(dir,{recursive:true,force:true});});const put=(key,{body='{}',etag='retained-validator',updated=AT-365*DAY,expires=AT-364*DAY}={})=>store.db.prepare('INSERT INTO cache VALUES(?,?,?,?,?,?)').run(key,body,etag,expires,updated,'{"last-modified":"old-observation"}');return{dir,store,put};}
test('aged transport cleanup has upgrade grace, bounded batches, restart cursor and durable-data exclusions',async t=>{
 const f=await fixture(t),put=f.put;let store=f.store,clock=AT;for(let n=0;n<450;n++)put('0:GET:/routes/'+n+':');put('unowned:representation');
 store.db.prepare('INSERT INTO notes VALUES(?,?,?,?)').run('note',42,'Durable',iso(AT-365*DAY));store.db.prepare('INSERT INTO market_history_days VALUES(?,?,?,?,?,?,?,?,?)').run(1,1,'2020-01-01',1,1,1,1,1,'old');
 let retention=createCacheRetention(store,{now:()=>clock});clock+=89*DAY;assert.equal(retention.maintain().deleted,0);clock+=DAY;assert.deepEqual(retention.maintain(),{scanned:200,deleted:200});store.close();store=openStore(f.dir);try {retention=createCacheRetention(store,{now:()=>clock});assert.equal(retention.maintain().deleted,0);clock+=HOUR;assert.equal(retention.maintain().deleted,200);clock+=HOUR;assert.equal(retention.maintain().deleted,50);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM cache').get().n,1);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM notes').get().n,1);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM market_history_days').get().n,1);
 } finally {store.close();}
});
test('recent use, complete validators and last-good data survive expiry and active retry deadlines',async t=>{
 const {store,put}=await fixture(t);let clock=AT;put('0:GET:/old-used:');put('0:GET:/cooling:');put('esi-retry:0:GET:/cooling:',{body:'{"failures":8,"status":429}',expires:AT+200*DAY});put('0:GET:/fresh:',{expires:AT+200*DAY});put('0:GET:/unused:');
 const retention=createCacheRetention(store,{now:()=>clock});clock+=91*DAY;retention.touch('0:GET:/old-used:');const before=store.db.prepare('SELECT * FROM cache WHERE key=?').get('0:GET:/old-used:');assert.equal(retention.maintain().deleted,1);assert.deepEqual(store.db.prepare('SELECT * FROM cache WHERE key=?').get('0:GET:/old-used:'),before);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM cache').get().n,4);store.db.prepare('DELETE FROM cache WHERE key=?').run('0:GET:/old-used:');assert.equal(store.db.prepare('SELECT COUNT(*) n FROM cache_usage').get().n,0);
});
test('ESI keeps stale body and validators offline with retry state across recreation',async t=>{
 const {store,put}=await fixture(t),now=Date.now(),key='0:GET:/universe/systems/42:';put(key,{body:'{"name":"Last good"}',updated:now-200*DAY,expires:now-199*DAY});store.set('retention:transport:v080',{introduced:now-200*DAY,next:0,updated:-1,key:''});let calls=0;
 const auth={access:async()=>''},offline=async(_url,{headers})=>{calls++;assert.equal(headers['If-None-Match'],'retained-validator');throw new Error('Offline');};let esi=createESI(store,auth,{fetcher:offline});const r=await esi.request('/universe/systems/42');assert.equal(r.stale,true);assert.equal(r.data.name,'Last good');assert.equal(r.updatedAt,iso(now-200*DAY));await esi.close();esi=createESI(store,auth,{fetcher:offline});assert.equal((await esi.request('/universe/systems/42')).retryAt,r.retryAt);assert.equal(calls,1);await esi.close();assert.equal(store.db.prepare('SELECT etag FROM cache WHERE key=?').get(key).etag,'retained-validator');
});
test('completed job retention keeps visible history, active work and resume settings',async t=>{
 const {store}=await fixture(t),put=store.db.prepare('INSERT INTO market_jobs VALUES(?,?)');for(let i=0;i<240;i++)put.run('job-'+i,JSON.stringify({status:'complete',endedAt:iso(AT-40*DAY)}));put.run('active','{"status":"running"}');put.run('unknown','{"status":"future-status"}');store.set('market:upgrade',{queue:[{hubId:1}],paused:true});assert.equal(pruneMarketJobs(store.db,AT),200);assert.equal(pruneMarketJobs(store.db,AT),32);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM market_jobs').get().n,10);assert.ok(store.db.prepare('SELECT 1 FROM market_jobs WHERE id=?').get('active'));assert.deepEqual(store.get('market:upgrade'),{queue:[{hubId:1}],paused:true});for(let i=0;i<120;i++)put.run('fresh-'+i,JSON.stringify({status:'failed',endedAt:iso(AT)}));pruneMarketJobs(store.db,AT);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM market_jobs').get().n,102);
 const plan=store.db.prepare("EXPLAIN QUERY PLAN SELECT * FROM market_jobs WHERE json_extract(body,'$.status')='running'").all();assert.match(plan.map(r=>r.detail).join(' '),/idx_market_jobs_running/);
});
test('failed maintenance rolls back deletion and cursor together',async t=>{
 const {store,put}=await fixture(t);let clock=AT;put('0:GET:/old:');const retention=createCacheRetention(store,{now:()=>clock});clock+=91*DAY;const before=store.get('retention:transport:v080');store.db.exec("CREATE TEMP TRIGGER fail_retention BEFORE UPDATE ON settings WHEN NEW.key='retention:transport:v080' BEGIN SELECT RAISE(ABORT,'write failure'); END");assert.throws(()=>retention.maintain(),/write failure/);assert.deepEqual(store.get('retention:transport:v080'),before);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM cache').get().n,1);store.db.exec('DROP TRIGGER fail_retention');assert.equal(retention.maintain().deleted,1);
});


test('terminal cleanup seeks its partial index past a large unrelated nonterminal backlog',async t=>{
 const {store}=await fixture(t),db=store.db,put=db.prepare('INSERT INTO market_jobs VALUES(?,?)');db.exec('BEGIN');for(let i=0;i<240;i++)put.run('done-'+i,JSON.stringify({status:'complete',endedAt:iso(AT-40*DAY)}));for(let i=0;i<10000;i++)put.run('unknown-'+i,'{"status":"future-status"}');db.exec('COMMIT');
 for(const sql of ['SELECT rowid FROM market_jobs WHERE terminal=1 ORDER BY rowid DESC LIMIT 100','SELECT rowid FROM market_jobs WHERE terminal=1 AND rowid<100 ORDER BY rowid LIMIT 200']){const plan=db.prepare('EXPLAIN QUERY PLAN '+sql).all().map(r=>r.detail).join(' ');assert.match(plan,/idx_market_jobs_terminal/);assert.doesNotMatch(plan,/TEMP B-TREE/);}
 assert.equal(pruneMarketJobs(db,AT),200);assert.equal(pruneMarketJobs(db,AT),32);assert.equal(db.prepare('SELECT COUNT(*) n FROM market_jobs WHERE terminal=1').get().n,8);assert.equal(db.prepare('SELECT COUNT(*) n FROM market_jobs WHERE terminal=0').get().n,10000);
});


test('ESI and Combat share one maintenance cursor while public cooldown and used last-good pages survive',async t=>{
 const {store,put}=await fixture(t);let clock=AT;
 store.set('retention:transport:v080',{introduced:AT-200*DAY,next:0,updated:-1,key:''});
 put('zkill:query:solarSystemID/1/year/2020/month/1/page/1/');put('zkill:character:42:page:1');put('zkill:query:old-unused/');
 const owner=createCacheRetention(store,{now:()=>clock});assert.strictEqual(owner,createCacheRetention(store));
 store.set('combat.public.cooldown',AT+DAY);assert.equal(owner.maintain().deleted,0);
 clock+=2*DAY;let attempts=0;
 const combat=createCombat(store,{characters:()=>[{id:42}]},{},{now:()=>clock,spacingMs:0,fetcher:async()=>{attempts++;throw new Error('Offline');}});
 await assert.rejects(combat.publicPage(42,'solarSystemID/1/year/2020/month/1/page/1/'),/Offline/);
 assert.equal(attempts,1);assert.ok(store.db.prepare('SELECT 1 FROM cache WHERE key=?').get('zkill:query:solarSystemID/1/year/2020/month/1/page/1/'));
 assert.equal(store.db.prepare('SELECT 1 FROM cache WHERE key=?').get('zkill:query:old-unused/'),undefined);
 assert.equal(store.get('combat.public.cooldown'),AT+DAY);assert.equal(owner.maintain().deleted,0,'the second consumer cannot advance a separate cursor in the same hour');
 const before=store.get('retention:transport:v080'),esi=createESI(store,{access:async()=>''},{fetcher:async()=>new Response('{}',{headers:{'cache-control':'max-age=300'}})});
 await esi.request('/universe/systems/42');assert.deepEqual(store.get('retention:transport:v080'),before);
 await esi.close();await combat.close();
});
