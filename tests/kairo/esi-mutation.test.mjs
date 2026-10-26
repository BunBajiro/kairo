import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from '../../server/store.mjs';
import {createESI} from '../../server/esi.mjs';
async function harness(t,fetcher){const dir=await mkdtemp(join(tmpdir(),'kairo-mutate-')),store=openStore(dir);t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});return {store,esi:createESI(store,{access:async(id,force)=>force?'new-token':'token'},{fetcher})};}
test('commands accept 204 and repeated identical calls are neither cached nor coalesced',async t=>{
 const calls=[];const {store,esi}=await harness(t,async(url,options)=>{calls.push({url,options});return new Response(null,{status:204,headers:{ETag:'ignored'}});});
 const results=await Promise.all([1,2,3].map(()=>esi.mutate('/ui/autopilot/waypoint?destination_id=30000142',{characterId:42})));
 assert.equal(calls.length,3);assert.ok(results.every(r=>r.status===204&&r.data===null&&!r.cached));
 assert.ok(calls.every(c=>!c.options.headers['If-None-Match']&&!c.options.headers['If-Modified-Since']));
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM cache').get().n,0);assert.equal(esi.health().coalesced,0);
});
test('command rate limits stop subsequent requests and never return previous success',async t=>{
 let calls=0;const {esi}=await harness(t,async()=>{calls++;return calls===1?new Response(null,{status:204}):new Response('{}',{status:429,headers:{'Retry-After':'60','X-Ratelimit-Group':'ui'}});});
 await esi.mutate('/ui/autopilot/waypoint',{characterId:42});
 await assert.rejects(esi.mutate('/ui/autopilot/waypoint',{characterId:42}),e=>e.status===429&&!!e.retryAt);
 await assert.rejects(esi.mutate('/ui/autopilot/waypoint',{characterId:42}),e=>e.status===429);assert.equal(calls,2);
});
test('explicit 401 refreshes once, transport failure is uncertain and is not replayed',async t=>{
 let calls=0;const {esi}=await harness(t,async(url,options)=>{calls++;if(calls===1)return new Response('{}',{status:401});assert.equal(options.headers.Authorization,'Bearer new-token');throw new Error('connection lost');});
 await assert.rejects(esi.mutate('/ui/autopilot/waypoint',{characterId:42}),e=>e.uncertain===true);assert.equal(calls,2);
});
test('mutation rejects read methods and invalid paths before transmitting',async t=>{
 let calls=0;const {esi}=await harness(t,async()=>{calls++;return new Response(null,{status:204});});
 for(const path of ['https://other.invalid/x','//other.invalid','/\\other.invalid'])await assert.rejects(esi.mutate(path,{characterId:42}));
 await assert.rejects(esi.mutate('/ui/autopilot/waypoint',{characterId:42,method:'GET'}));assert.equal(calls,0);
});
