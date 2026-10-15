import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setImmediate as turn} from 'node:timers/promises';
import {openStore} from '../../server/store.mjs';
import {createESI,COMPATIBILITY_DATE} from '../../server/esi.mjs';

const epoch=Date.UTC(2026,8,30),json=(data={},status=200,headers={})=>Response.json(data,{status,headers});
async function storage(t){
 const dir=await mkdtemp(join(tmpdir(),'kairo-esi-policy-')),store=openStore(dir);
 t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});return store;
}
const auth={access:async(id,force)=>(force?'renewed-':'token-')+id};

test('reads and commands share headers and persist changed route policy only once',async t=>{
 const store=await storage(t),seen=[];let writes=0;const save=store.set.bind(store);
 t.mock.method(store,'set',(key,value)=>{if(key==='esi:limits')writes++;return save(key,value);});
 const esi=createESI(store,auth,{fetcher:async(_url,{headers})=>{seen.push({...headers});return json({},200,{'X-Ratelimit-Group':'ui'});}});
 await esi.request('/characters/42/example',{characterId:42});
 await esi.mutate('/ui/example',{characterId:42});await esi.mutate('/ui/example',{characterId:42});
 assert.equal(writes,2,'new read and command routes persist once each; unchanged command policy has no write');
 for(const headers of seen){assert.equal(headers['X-Compatibility-Date'],COMPATIBILITY_DATE);assert.equal(headers.Authorization,'Bearer token-42');assert.equal(headers['User-Agent'],seen[0]['User-Agent']);}
 assert.deepEqual(store.get('esi:limits').groups,{'GET:/characters/{id}/example':'ui','POST:/ui/example':'ui'});
 await esi.close();
});

test('read and command rate policies agree on Retry-After, global floors, and pilot isolation',async t=>{
 t.mock.method(Date,'now',()=>epoch);
 for(const method of ['read','command'])for(const status of [420,429])for(const retry of ['90',new Date(epoch+90000).toUTCString()])await t.test(method+' '+status+' '+retry,async t=>{
  const store=await storage(t);let calls=0;
  const esi=createESI(store,auth,{fetcher:async()=>{calls++;return calls===1?json({},status,{'Retry-After':retry,'X-Ratelimit-Group':'ui'}):json();}});
  const call=id=>method==='read'?esi.request('/characters/'+id+'/example',{characterId:id}):esi.mutate('/ui/example',{characterId:id});
  await assert.rejects(call(42),e=>e.status===status&&Date.parse(e.retryAt)===epoch+90000&&!e.uncertain);
  assert.deepEqual(store.get('esi:limits').blocks,[['42:ui',epoch+90000]]);
  await assert.rejects(call(42),e=>e.status===429||e.status===420);
  if(status===420){assert.equal(esi.health().errorUntil,epoch+90000);await assert.rejects(call(43),e=>e.status===429);assert.equal(calls,1);}
  else{await call(43);assert.equal(calls,2);}
  await esi.close();
 });
});

test('a rate bucket learned from one path blocks the same group across read and command after restart',async t=>{
 t.mock.method(Date,'now',()=>epoch);const store=await storage(t);let mode='ready',calls=0;
 const fetcher=async()=>{calls++;return json({},mode==='limit'?429:200,{'X-Ratelimit-Group':'shared','Retry-After':'60'});};
 let esi=createESI(store,auth,{fetcher});
 await esi.request('/characters/42/example',{characterId:42});await esi.mutate('/ui/example',{characterId:42});
 mode='limit';await assert.rejects(esi.mutate('/ui/example',{characterId:42}));await esi.close();
 store.db.prepare('UPDATE cache SET expires=0').run();esi=createESI(store,auth,{fetcher});
 const stale=await esi.request('/characters/42/example',{characterId:42});assert.equal(stale.stale,true);assert.equal(stale.errorStatus,429);
 assert.equal(calls,3);await esi.close();
});

test('low error budget blocks every pilot for reads and commands without retrying a send',async t=>{
 t.mock.method(Date,'now',()=>epoch);
 for(const method of ['read','command'])await t.test(method,async t=>{
  const store=await storage(t);let calls=0;const esi=createESI(store,auth,{fetcher:async()=>{calls++;return json({},200,{'X-ESI-Error-Limit-Remain':'9','X-ESI-Error-Limit-Reset':'120'});}});
  await (method==='read'?esi.request('/first',{characterId:42}):esi.mutate('/first',{characterId:42}));
  assert.equal(esi.health().errorUntil,epoch+120000);
  await assert.rejects(esi.request('/other',{characterId:43}),e=>e.status===429);
  await assert.rejects(esi.mutate('/other',{characterId:43}),e=>e.status===429&&!e.uncertain);
  assert.equal(calls,1);await esi.close();
 });
});

test('both read and command paths refresh once on explicit 401 and stop after the second rejection',async t=>{
 for(const method of ['read','command'])await t.test(method,async t=>{
  const store=await storage(t),tokens=[];let calls=0;
  const esi=createESI(store,auth,{fetcher:async(_url,{headers})=>{calls++;tokens.push(headers.Authorization);return json({},401);}});
  await assert.rejects(method==='read'?esi.request('/private',{characterId:42}):esi.mutate('/command',{characterId:42}),e=>e.status===401&&!e.uncertain);
  assert.equal(calls,2);assert.deepEqual(tokens,['Bearer token-42','Bearer renewed-42']);await esi.close();
 });
});

test('close drains a failed accepted command without replaying an uncertain success-body failure',async t=>{
 const store=await storage(t);let calls=0,release;const gate=new Promise(resolve=>{release=resolve;});
 const esi=createESI(store,auth,{fetcher:async()=>{calls++;await gate;return {ok:true,status:200,headers:new Headers(),text:async()=>{throw new Error('body disconnected');}};}});
 const sent=esi.mutate('/command',{characterId:42});const rejected=assert.rejects(sent,e=>e.uncertain===true&&e.message==='body disconnected');
 const closing=esi.close();release();await rejected;await closing;assert.equal(calls,1);assert.equal(esi.health().active,0);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM cache').get().n,0);
});

test('close drains accepted paged and name reads through their cache writes and rejects new admission',async t=>{
 const store=await storage(t),seen=[];let release;
 const gate=new Promise(resolve=>{release=resolve;});
 const esi=createESI(store,auth,{fetcher:async(url,options)=>{
  seen.push(url);await gate;
  if(url.endsWith('/universe/names'))return json(JSON.parse(options.body).map(id=>({id,name:'Name '+id})));
  return json([Number(new URL(url).searchParams.get('page'))],200,{'X-Pages':'2'});
 }});
 const pages=esi.paged('/items'),names=esi.names([1,2]);let finished=false;
 const closing=esi.close();closing.then(()=>{finished=true;});assert.strictEqual(esi.close(),closing);
 for(const promise of [esi.request('/new'),esi.mutate('/new',{characterId:42}),esi.paged('/new'),esi.names([3])])await assert.rejects(promise,/shutting down/);
 assert.throws(()=>esi.cachedNames([1]),/shutting down/);assert.throws(()=>esi.clearAccessFailures(42),/shutting down/);
 await turn();assert.equal(finished,false);release();
 assert.deepEqual((await pages).data,[1,2]);assert.deepEqual(await names,{1:'Name 1',2:'Name 2'});await closing;
 assert.equal(seen.length,3);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM cache').get().n,5);
 assert.equal(esi.health().active,0);assert.equal(esi.health().queued,0);
});

test('one shared four-slot queue prioritizes accepted commands and close drains queued work',async t=>{
 const store=await storage(t),started=[],releases=new Map();
 const esi=createESI(store,auth,{fetcher:(url,{method})=>{
  const path=new URL(url).pathname;started.push(path);
  return new Promise(resolve=>releases.set(path,()=>resolve(method==='POST'?new Response(null,{status:204}):json())));
 }});
 const initial=[1,2,3,4].map(n=>esi.request('/read-'+n));await turn();assert.equal(started.length,4);
 const ordinary=esi.request('/queued-read'),command=esi.mutate('/command',{characterId:42});await turn();
 assert.equal(esi.health().active,4);assert.equal(esi.health().queued,2);
 const closing=esi.close();releases.get('/read-1')();await turn();assert.equal(started[4],'/command');
 releases.get('/command')();await turn();assert.equal(started[5],'/queued-read');
 for(const path of ['/read-2','/read-3','/read-4','/queued-read'])releases.get(path)();
 await Promise.all([...initial,ordinary,command,closing]);assert.equal(esi.health().active,0);assert.equal(esi.health().queued,0);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM cache').get().n,5,'only completed reads enter the cache');
});
