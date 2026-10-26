import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setImmediate as turn} from 'node:timers/promises';
import {openStore} from '../../server/store.mjs';
import {createESI} from '../../server/esi.mjs';
const json=data=>Response.json(data,{headers:{'Cache-Control':'max-age=600'}});
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'kairo-esi-ownership-')),store=openStore(dir);
 let revision=0;const gate=Promise.withResolvers(),started=Promise.withResolvers(),calls=[];
 const auth={connectionRevision:()=>revision,access:async()=>`grant-${revision}`};
 const esi=createESI(store,auth,{fetcher:async(url,options)=>{
  calls.push({url,token:options.headers.Authorization});
  if(options.headers.Authorization==='Bearer grant-0'){started.resolve();return gate.promise;}
  return json({wallet:200,connection:revision});
 }});
 t.after(async()=>{gate.resolve(json({wallet:100,connection:0}));await esi.close();store.close();await rm(dir,{recursive:true,force:true});});
 const reconnect=()=>{revision++;store.db.prepare('DELETE FROM cache WHERE key LIKE ?').run('42:%');};
 const read=()=>esi.request('/characters/42/wallet',{characterId:42});
 return {store,esi,gate,started,calls,reconnect,read};
}

test('new connection reads do not join a private request from the previous connection',async t=>{
 const f=await fixture(t),old=f.read().catch(error=>error);await f.started.promise;
 f.reconnect();const current=f.read();await turn();
 f.gate.resolve(json({wallet:100,connection:0}));
 assert.deepEqual((await current).data,{wallet:200,connection:1});
 assert.ok(await old instanceof Error);
 assert.equal(f.calls.length,2);
 assert.equal((await f.read()).data.wallet,200);
 assert.equal(f.calls.length,2,'Only current-connection data is cached');
});

test('late private success cannot recreate a cache purged by disconnect/reconnect',async t=>{
 const f=await fixture(t),old=f.read().catch(error=>error);await f.started.promise;f.reconnect();
 f.gate.resolve(json({wallet:100,connection:0}));
 assert.ok(await old instanceof Error,'Obsolete private response must reject');
 assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM cache').get().n,0);
 assert.deepEqual((await f.read()).data,{wallet:200,connection:1});
 assert.equal(f.calls.length,2);
});

test('obsolete private failure cannot back off or replace current connection results',async t=>{
 const f=await fixture(t),old=f.read().catch(error=>error);await f.started.promise;f.reconnect();
 const current=f.read().catch(error=>error);await turn();
 f.gate.resolve(Response.json({error:'previous grant'},{status:403}));await old;const result=await current;
 assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM cache WHERE key LIKE 'esi-retry:%'").get().n,0);
 assert.deepEqual((await f.read()).data,result.data);
 assert.equal(f.calls.length,2);
});

test('same-connection coalescing and warm caches remain unchanged',async t=>{
 const f=await fixture(t),first=f.read(),duplicate=f.read();await f.started.promise;
 f.gate.resolve(json({wallet:100,connection:0}));
 assert.deepEqual((await first).data,(await duplicate).data);
 assert.deepEqual((await f.read()).data,{wallet:100,connection:0});
 assert.equal(f.calls.length,1);assert.equal(f.esi.health().coalesced,1);assert.equal(f.esi.health().cacheHits,1);
});

test('a private request queued for pacing cannot migrate to a replacement connection',async t=>{
 const f=await fixture(t),waiting=Promise.withResolvers(),release=Promise.withResolvers();
 const paced=f.esi.paced({spacingMs:250,now:()=>10000,wait:async()=>{waiting.resolve();await release.promise;}});
 await paced('/status'); // Establish a real preceding transport admission.
 const queued=paced('/characters/42/wallet',{characterId:42}).catch(error=>error);
 await waiting.promise;f.reconnect();
 const current=await f.read();release.resolve();
 assert.ok(await queued instanceof Error,'Queued work retains the connection which admitted it');
 assert.deepEqual(current.data,{wallet:200,connection:1});
 assert.equal(f.calls.length,2,'Only the initial public call and current-connection read reach transport');
 assert.equal(f.calls.some(call=>call.token==='Bearer grant-0'),false);
 assert.deepEqual((await paced('/characters/42/wallet',{characterId:42})).data,current.data);
 assert.equal(f.calls.length,2,'The replacement connection still uses its warm cache without pacing or transport');
});

test('a paged read never combines pages from successive character connections',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'kairo-esi-pages-ownership-')),store=openStore(dir);
 const gate=Promise.withResolvers(),started=Promise.withResolvers(),calls=[];let revision=0;
 const reply=(connection,page)=>Response.json([{connection,page}],{headers:{'Cache-Control':'max-age=600','X-Pages':'2'}});
 const esi=createESI(store,{connectionRevision:()=>revision,access:async()=>`grant-${revision}`},{fetcher:async(url,options)=>{
  const page=Number(new URL(url).searchParams.get('page')),connection=Number(options.headers.Authorization.split('-').at(-1));
  calls.push({connection,page});
  if(connection===0&&page===1){started.resolve();return gate.promise;}
  return reply(connection,page);
 }});
 t.after(async()=>{gate.resolve(reply(0,1));await esi.close();store.close();await rm(dir,{recursive:true,force:true});});
 // Both consumers share page one. Its first consumer replaces the connection
 // before the paged consumer can admit page two, without any timer sleeps.
 const first=esi.request('/characters/42/orders?page=1',{characterId:42});await started.promise;
 const replacement=first.then(()=>{revision++;store.db.prepare('DELETE FROM cache WHERE key LIKE ?').run('42:%');});
 const old=esi.paged('/characters/42/orders',{characterId:42}).catch(error=>error);
 gate.resolve(reply(0,1));await replacement;
 assert.ok(await old instanceof Error,'An admitted page chain cannot read its next page using a new grant');
 assert.deepEqual(calls,[{connection:0,page:1}]);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM cache').get().n,0);
 const current=await esi.paged('/characters/42/orders',{characterId:42});
 assert.deepEqual(current.data,[{connection:1,page:1},{connection:1,page:2}]);
 assert.equal(calls.length,3,'A healthy replacement chain fetches exactly its two pages');
 assert.deepEqual((await esi.paged('/characters/42/orders',{characterId:42})).data,current.data);
 assert.equal(calls.length,3,'A warm healthy chain performs no extra provider requests');
});
