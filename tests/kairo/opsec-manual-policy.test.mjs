import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startKairo} from '../../server/index.mjs';

test('manual-only OPSEC commands preserve the current accepted policy at HTTP receipt', {timeout:15000}, async t=>{
 const dir=await mkdtemp(join(tmpdir(),'kairo-opsec-policy-'));
 const deny=async()=>assert.fail('Protection policy commands must not request external data');
 const app=await startKairo({port:19854,streamPort:19855,dataDir:dir,noSync:true,fetcher:deny,datasets:{fetcher:deny},universe:{operations:{noSync:true,fetcher:deny},feeds:{noSync:true,fetcher:deny}}});
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 for(const id of [42,43])app.store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(id,'Synthetic '+id,JSON.stringify(['esi-location.read_location.v1']),'unusable-test-token');
 const cookie=(await fetch(app.origin)).headers.get('set-cookie').split(';')[0];
 const boot=await fetch(app.origin+'/api/bootstrap',{headers:{Cookie:cookie}}).then(r=>r.json());
 const headers={Cookie:cookie,Origin:app.origin,'Content-Type':'application/json','X-Kairo-CSRF':boot.csrf};
 const send=body=>fetch(app.origin+'/api/opsec',{method:'PUT',headers,body:JSON.stringify(body)});
 const original={manual:false,allowHighsec:false,blueAlliances:[91],hostileAlliances:[92],characterId:42};
 function reset(policy=original){
  const now=Date.now(),sample=data=>({status:'ready',data,updatedAt:new Date(now).toISOString(),expiresAt:new Date(now+600000).toISOString()});
  for(const id of [42,43])app.store.saveSnapshot(id,'location',sample({solar_system_id:30000142,system:{security_status:1,region_id:10000002}}));
  app.store.saveSnapshot(0,'fw',sample([]));app.store.saveSnapshot(0,'sovereignty',sample([]));
  app.store.set('opsec',policy);app.core.refreshOPSEC();
 }
 await t.test('force on/off retains saved pilot, lists and covered High-Sec policy',async()=>{
  reset();assert.equal((await send({manual:true})).status,200);
  assert.deepEqual(app.store.get('opsec'),{...original,manual:true});
  assert.deepEqual(app.core.stream.state().opsec,{state:'manual',hidden:true});
  assert.equal((await send({manual:false})).status,200);
  assert.deepEqual(app.store.get('opsec'),original);
  assert.deepEqual(app.core.stream.state().opsec,{state:'highsec',hidden:true});
 });
 await t.test('a pending manual body merges the latest policy, not a pre-body copy',async()=>{
  reset();const received=Promise.withResolvers(),response=Promise.withResolvers();
  app.dashboard.prependOnceListener('request',incoming=>incoming.once('data',received.resolve));
  const req=request(app.origin+'/api/opsec',{method:'PUT',headers},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>response.resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())}));res.on('error',response.reject);});
  req.on('error',response.reject);req.write('{"manual":');
  try{
   await received.promise;
   const newer={manual:false,allowHighsec:true,blueAlliances:[101],hostileAlliances:[202],characterId:43};
   assert.equal((await send(newer)).status,200);assert.deepEqual(app.store.get('opsec'),newer);
   req.end('true}');assert.equal((await response.promise).status,200);
   assert.deepEqual(app.store.get('opsec'),{...newer,manual:true});
  }finally{req.destroy();}
 });
 await t.test('nonboolean manual commands reject without changing policy or output',async()=>{
  reset();const before=app.core.stream.state().opsec;
  for(const manual of ['true',1,null,[]]){
   assert.equal((await send({manual})).status,400,'manual is a boolean command');
   assert.deepEqual(app.store.get('opsec'),original);assert.deepEqual(app.core.stream.state().opsec,before);
  }
 });
 await t.test('failed persistence does not publish manual protection and an explicit retry succeeds',async()=>{
  reset();const before=app.core.stream.state().opsec;
  app.store.db.exec("CREATE TEMP TRIGGER reject_opsec_save BEFORE UPDATE ON settings WHEN NEW.key='opsec' BEGIN SELECT RAISE(ABORT,'Synthetic OPSEC write failure'); END");
  try{assert.equal((await send({manual:true})).status,400);assert.deepEqual(app.store.get('opsec'),original);assert.deepEqual(app.core.stream.state().opsec,before);}
  finally{app.store.db.exec('DROP TRIGGER reject_opsec_save');}
  assert.equal((await send({manual:true})).status,200);assert.deepEqual(app.store.get('opsec'),{...original,manual:true});
 });
 await t.test('full-policy replacement and validation retain their existing meaning',async()=>{
  reset();const replacement={manual:false,allowHighsec:true,blueAlliances:[101],hostileAlliances:[],characterId:43};
  assert.equal((await send(replacement)).status,200);assert.deepEqual(app.store.get('opsec'),replacement);assert.deepEqual(app.core.stream.state().opsec,{state:'highsec',hidden:false});
  assert.equal((await send({...replacement,hostileAlliances:[101]})).status,400);assert.deepEqual(app.store.get('opsec'),replacement);
  assert.equal((await send({allowHighsec:false})).status,200);assert.deepEqual(app.store.get('opsec'),{manual:false,allowHighsec:false,blueAlliances:[],hostileAlliances:[],characterId:0});
 });
});
