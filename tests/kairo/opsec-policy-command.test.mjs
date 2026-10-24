import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startKairo} from '../../server/index.mjs';

test('explicit OPSEC policy commands cannot change the current manual command', {timeout:15000}, async t=>{
 const dir=await mkdtemp(join(tmpdir(),'kairo-opsec-command-'));
 const deny=async()=>assert.fail('Protection commands must not request external data');
 const app=await startKairo({port:19856,streamPort:19857,dataDir:dir,noSync:true,fetcher:deny,datasets:{fetcher:deny},universe:{operations:{noSync:true,fetcher:deny},feeds:{noSync:true,fetcher:deny}}});
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 for(const id of [42,43])app.store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(id,'Synthetic '+id,JSON.stringify(['esi-location.read_location.v1']),'unusable-test-token');
 const cookie=(await fetch(app.origin)).headers.get('set-cookie').split(';')[0];
 const boot=await fetch(app.origin+'/api/bootstrap',{headers:{Cookie:cookie}}).then(r=>r.json());
 const headers={Cookie:cookie,Origin:app.origin,'Content-Type':'application/json','X-Kairo-CSRF':boot.csrf};
 const send=body=>fetch(app.origin+'/api/opsec',{method:'PUT',headers,body:JSON.stringify(body)});
 const original={manual:false,allowHighsec:false,blueAlliances:[91],hostileAlliances:[92],characterId:42};
 const policy={allowHighsec:true,blueAlliances:[101],hostileAlliances:[202],characterId:43};
 function reset(manual=false){
  const now=Date.now(),sample=data=>({status:'ready',data,updatedAt:new Date(now).toISOString(),expiresAt:new Date(now+600000).toISOString()});
  for(const id of [42,43])app.store.saveSnapshot(id,'location',sample({solar_system_id:30000142,system:{security_status:1,region_id:10000002}}));
  app.store.saveSnapshot(0,'fw',sample([]));app.store.saveSnapshot(0,'sovereignty',sample([]));
  app.store.set('opsec',{...original,manual});app.core.refreshOPSEC();
 }
 await t.test('the untouched new-profile policy accepts canonical defaults without a selected pilot',async()=>{
  assert.equal(Object.hasOwn(boot.settings.opsec,'characterId'),false);
  const defaults={allowHighsec:boot.settings.opsec.allowHighsec===true,blueAlliances:[],hostileAlliances:[],characterId:Number(boot.settings.opsec.characterId||0)};
  assert.equal((await send({policy:defaults})).status,200);
  assert.deepEqual(app.store.get('opsec'),{...defaults,manual:false});
 });
 for(const manual of [true,false])await t.test('policy replacement preserves current manual='+manual,async()=>{
  reset(manual);assert.equal((await send({policy})).status,200);
  assert.deepEqual(app.store.get('opsec'),{...policy,manual});
  assert.deepEqual(app.core.stream.state().opsec,{state:manual?'manual':'highsec',hidden:manual});
 });
 for(const manual of [true,false])await t.test('manual='+manual+' accepted while the policy body is pending wins at receipt',async()=>{
  reset(!manual);const received=Promise.withResolvers(),response=Promise.withResolvers();
  app.dashboard.prependOnceListener('request',incoming=>incoming.once('data',received.resolve));
  const req=request(app.origin+'/api/opsec',{method:'PUT',headers},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>response.resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())}));res.on('error',response.reject);});
  req.on('error',response.reject);req.write('{"policy":');
  try{
   await received.promise;assert.equal((await send({manual})).status,200);
   assert.deepEqual(app.store.get('opsec'),{...original,manual});
   req.end(JSON.stringify(policy)+'}');assert.equal((await response.promise).status,200);
   assert.deepEqual(app.store.get('opsec'),{...policy,manual});
   assert.deepEqual(app.core.stream.state().opsec,{state:manual?'manual':'highsec',hidden:manual});
  }finally{req.destroy();}
 });
 await t.test('malformed or mixed policy envelopes reject without changing policy or protection',async()=>{
  reset(true);const before=app.store.get('opsec'),output=app.core.stream.state().opsec;
  const {characterId,...missingPilot}=policy;
  const invalid=[null,[],false,{},missingPilot,{...policy,manual:false},{...policy,extra:true},{...policy,allowHighsec:null},{...policy,blueAlliances:'101'},{...policy,hostileAlliances:null},{...policy,characterId:'43'},{...policy,characterId:-1},{...policy,characterId:1.5}].map(policy=>({policy}));
  invalid.push({policy,manual:false});
  for(const body of invalid){assert.equal((await send(body)).status,400,JSON.stringify(body));assert.deepEqual(app.store.get('opsec'),before);assert.deepEqual(app.core.stream.state().opsec,output);}
 });
 await t.test('policy commands retain connected-pilot, list sanitization and overlap validation',async()=>{
  reset(true);const before=app.store.get('opsec');
  for(const value of [{...policy,characterId:999},{...policy,hostileAlliances:[101]}]){assert.equal((await send({policy:value})).status,400);assert.deepEqual(app.store.get('opsec'),before);}
  assert.equal((await send({policy:{...policy,blueAlliances:[101,'102',0,-1,null]}})).status,200);
  assert.deepEqual(app.store.get('opsec'),{...policy,blueAlliances:[101,102],manual:true});
 });
 await t.test('failed policy persistence retains protection and explicit retry preserves manual',async()=>{
  reset(true);const before=app.store.get('opsec'),output=app.core.stream.state().opsec;
  app.store.db.exec("CREATE TEMP TRIGGER reject_opsec_policy BEFORE UPDATE ON settings WHEN NEW.key='opsec' BEGIN SELECT RAISE(ABORT,'Synthetic OPSEC policy failure'); END");
  try{assert.equal((await send({policy})).status,400);assert.deepEqual(app.store.get('opsec'),before);assert.deepEqual(app.core.stream.state().opsec,output);}
  finally{app.store.db.exec('DROP TRIGGER reject_opsec_policy');}
  assert.equal((await send({policy})).status,200);assert.deepEqual(app.store.get('opsec'),{...policy,manual:true});
 });
});
