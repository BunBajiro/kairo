import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createESI} from '../../server/esi.mjs';

const deferred=()=>Promise.withResolvers();
const command=esi=>esi.mutate('/ui/autopilot/waypoint?destination_id=30000142',{characterId:42});
async function fixture(t,fetcher,access){
 const dir=await mkdtemp(join(tmpdir(),'kairo-command-owner-')),store=openStore(dir);let revision=0;
 const auth={connectionRevision:()=>revision,access:access||(async()=>`connection-${revision}`)};
 const esi=createESI(store,auth,{fetcher});
 t.after(async()=>{await esi.close();store.close();await rm(dir,{recursive:true,force:true});});
 return {esi,store,reconnect:()=>revision++};
}

test('a command waiting for a network slot cannot migrate to a replacement connection',async t=>{
 const occupied=deferred(),release=deferred(),sent=[];let reads=0;
 const f=await fixture(t,async(url,options)=>{
  if(options.method==='GET'){if(++reads===4)occupied.resolve();await release.promise;return Response.json({ok:true});}
  sent.push(options.headers.Authorization);return new Response(null,{status:204});
 });
 t.after(()=>release.resolve());
 const blockers=[1,2,3,4].map(i=>f.esi.request('/public/slot/'+i));await occupied.promise;
 const old=command(f.esi).catch(e=>e);assert.equal(f.esi.health().queued,1);
 f.reconnect();release.resolve();await Promise.all(blockers);
 const result=await old;
 assert.ok(result instanceof Error,'An obsolete accepted command must stop before sending with the new grant');
 assert.notEqual(result.uncertain,true,'Nothing was transmitted for this command');
 assert.deepEqual(sent,[]);
 assert.equal((await command(f.esi)).status,204);assert.deepEqual(sent,['Bearer connection-1']);
});

test('a command waiting for its token cannot send after connection ownership changes',async t=>{
 const tokenRequested=deferred(),release=deferred(),sent=[];let first=true;
 const f=await fixture(t,async(url,options)=>{sent.push(options.headers.Authorization);return new Response(null,{status:204});},async()=>{
  if(first){first=false;tokenRequested.resolve();return release.promise;}
  return 'new-grant';
 });
 t.after(()=>release.resolve('obsolete-grant'));
 const old=command(f.esi).catch(e=>e);await tokenRequested.promise;f.reconnect();release.resolve('obsolete-grant');
 const result=await old;
 assert.ok(result instanceof Error,'Token completion cannot authorize a command admitted by a replaced connection');
 assert.notEqual(result.uncertain,true);assert.deepEqual(sent,[]);
 assert.equal((await command(f.esi)).status,204);assert.deepEqual(sent,['Bearer new-grant']);
});

test('an obsolete command rejected with401 cannot retry using a replacement login',async t=>{
 const sentFirst=deferred(),response=deferred(),sent=[],access=[];
 const f=await fixture(t,async(url,options)=>{
  sent.push(options.headers.Authorization);
  if(sent.length===1){sentFirst.resolve();return response.promise;}
  return new Response(null,{status:204});
 },async(id,force)=>{access.push(!!force);return force?'rotated-grant':'current-grant';});
 t.after(()=>response.resolve(Response.json({}, {status:401})));
 const old=command(f.esi).catch(e=>e);await sentFirst.promise;f.reconnect();response.resolve(Response.json({}, {status:401}));
 const result=await old;
 assert.ok(result instanceof Error,'A new login is not permission to replay the old rejected command');
 assert.notEqual(result.uncertain,true,'The only dispatched attempt was explicitly rejected');
 assert.equal(sent.length,1);assert.deepEqual(access,[false]);
 assert.equal((await command(f.esi)).status,204);assert.equal(sent.length,2);
});

test('ordinary token rotation retains the command connection and its single401 retry',async t=>{
 const sent=[],access=[];
 const f=await fixture(t,async(url,options)=>{sent.push(options.headers.Authorization);return sent.length===1?Response.json({}, {status:401}):new Response(null,{status:204});},async(id,force)=>{access.push(!!force);return force?'rotated-grant':'first-grant';});
 assert.equal((await command(f.esi)).status,204);
 assert.deepEqual(sent,['Bearer first-grant','Bearer rotated-grant']);assert.deepEqual(access,[false,true]);
 assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM cache').get().n,0,'Explicit commands remain uncached');
});

test('connection replacement during401 token refresh stops before a retry without claiming uncertainty',async t=>{
 const refreshStarted=deferred(),release=deferred(),sent=[];
 const f=await fixture(t,async(url,options)=>{sent.push(options.headers.Authorization);return sent.length===1?Response.json({}, {status:401}):new Response(null,{status:204});},async(id,force)=>{
  if(force){refreshStarted.resolve();return release.promise;}
  return 'first-grant';
 });
 t.after(()=>release.resolve('obsolete-refresh'));
 const old=command(f.esi).catch(e=>e);await refreshStarted.promise;f.reconnect();release.resolve('obsolete-refresh');
 const result=await old;
 assert.ok(result instanceof Error,'A pending refresh cannot move an old command to a replacement login');
 assert.notEqual(result.uncertain,true,'The only transmitted attempt returned401; the retry was never dispatched');
 assert.deepEqual(sent,['Bearer first-grant']);
});
