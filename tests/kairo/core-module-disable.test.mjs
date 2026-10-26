import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {EventEmitter} from 'node:events';
import {createCore} from '../../server/core.mjs';
import {openStore} from '../../server/store.mjs';
import {catalog} from '../../server/modules/catalog.mjs';

async function fixture(t, {laterIndustry = false} = {}) {
 const dir=await mkdtemp(join(tmpdir(),'kairo-module-disable-')),store=openStore(dir),calls=[];
 const fresh=data=>({status:'ready',data,headers:{},updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),refreshAt:new Date(Date.now()+600000).toISOString()});
 for(const module of catalog)store.set('module:'+module.id,module.id==='wallet'||laterIndustry&&module.id==='industry');
 store.saveSnapshot(42,'wallet',fresh(1000));store.saveSnapshot(42,'transactions',fresh([]));
 const prior={...fresh([]),refreshAt:new Date(Date.now()-1000).toISOString()};store.saveSnapshot(42,'journal',prior);
 const entered=Promise.withResolvers(),gate=Promise.withResolvers();let block=true,failure=false;
 const request=async path=>{
  calls.push(path);
  if(path==='/characters/42/wallet')return fresh(1000);
  if(path==='/characters/42/wallet/transactions')return fresh([]);
  if(laterIndustry&&path==='/characters/42/industry/jobs?include_completed=true')return fresh([]);
  assert.equal(path,'/characters/42/wallet/journal');
  if(block){entered.resolve();await gate.promise;}
  if(failure)throw new Error('Provider unavailable after disabling the module');
  return fresh([{id:1,date:new Date().toISOString(),amount:100,balance:1100,ref_type:'player_donation'}]);
 };
 const core=await createCore(store,{characters:()=>[{id:42,scopes:['esi-wallet.read_character_wallet.v1',...(laterIndustry?['esi-industry.read_character_jobs.v1']:[])]}]},{request,paged:request,health:()=>({}),names:async()=>assert.fail('No name transport is needed')},resolve('server/modules'),{noSync:true});core.quiesce();
 const client=new EventEmitter();client.frames=[];client.write=chunk=>{client.frames.push(chunk);return true;};client.end=()=>{client.writableEnded=true;client.emit('finish');};
 client.destroy=()=>{client.destroyed=true;client.emit('close');};core.connectUI(client);
 const packets=()=>Buffer.concat(client.frames).toString().split('\n\n').filter(frame=>frame.startsWith('event:')).map(frame=>({type:frame.split('\n')[0].slice(7),data:JSON.parse(frame.slice(frame.indexOf('\ndata: ')+7))}));
 const dataEvents=[];core.bus.on('data.journal',event=>dataEvents.push(event));
 t.after(async()=>{gate.resolve();await core.close();store.close();await rm(dir,{recursive:true,force:true});});
 return {store,core,prior,calls,entered,gate,packets,client,dataEvents,fail(value){failure=value;},release(){block=false;gate.resolve();}};
}

for(const fail of [false,true])test(`a ${fail?'failed':'successful'} journal response cannot republish a disabled module and re-enabling recovers`,async t=>{
 const f=await fixture(t),pending=f.core.sync(42);await f.entered.promise;
 f.core.toggle('wallet',false);f.client.frames=[];f.fail(fail);f.release();await pending;await f.core.bus.drain();
 const disabled={snapshot:f.store.snapshot(42,'journal'),events:f.dataEvents.length,semantic:f.store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='wallet.entry'").get().n,
  live:f.packets().filter(packet=>packet.type==='snapshot'&&packet.data.key==='journal').map(packet=>packet.data.snapshot.status),readStatus:f.core.snapshots(42).journal.status,requests:f.calls.length};
 f.fail(false);f.core.toggle('wallet',true);await f.core.requestSync(42);await f.core.bus.drain();
 assert.equal(f.store.snapshot(42,'journal').status,'ready');assert.equal(f.store.snapshot(42,'journal').data[0].amount,100);
 assert.equal(f.calls.length,4,'One original source request and three existing explicit-refresh sources');
 assert.equal(f.calls.filter(path=>path.endsWith('/journal')).length,2,'One journal request and one explicit recovery');
 assert.equal(f.core.snapshots(42).journal.status,'ready');
 assert.deepEqual(disabled,{snapshot:f.prior,events:0,semantic:0,live:[],readStatus:'disabled',requests:1},'A module still disabled at completion retains its prior sample and emits no fresh/stale UI or journal event');
 assert.equal(f.dataEvents.length,1);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='wallet.entry'").get().n,1,'The recovered observation is published once');
});

test('re-enabling before a current successful read completes can reuse that response without another source request',async t=>{
 const f=await fixture(t),pending=f.core.sync(42);await f.entered.promise;
 f.core.toggle('wallet',false);f.core.toggle('wallet',true);f.release();await pending;await f.core.bus.drain();
 assert.equal(f.store.snapshot(42,'journal').status,'ready');assert.equal(f.core.snapshots(42).journal.data[0].amount,100);
 assert.equal(f.dataEvents.length,1);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='wallet.entry'").get().n,1);assert.equal(f.calls.length,1);
 await f.core.sync(42);assert.equal(f.calls.length,1,'Reusing the response retains its existing polling deadline');
});

test('pausing one module does not cancel later batches owned by an unrelated enabled module',async t=>{
 const f=await fixture(t,{laterIndustry:true}),pending=f.core.sync(42);await f.entered.promise;
 f.core.toggle('wallet',false);f.release();await pending;await f.core.bus.drain();
 assert.deepEqual(f.calls,['/characters/42/wallet/journal','/characters/42/industry/jobs?include_completed=true']);
 assert.equal(f.store.snapshot(42,'jobs').status,'ready');assert.deepEqual(f.store.snapshot(42,'jobs').data,[]);
 assert.equal(f.core.snapshots(42).jobs.status,'ready');assert.equal(f.core.snapshots(42).journal.status,'disabled');
});

test('a failed durable module toggle does not pause an accepted collection',async t=>{
 const f=await fixture(t),pending=f.core.sync(42);await f.entered.promise;
 f.store.db.exec("CREATE TRIGGER reject_wallet_toggle BEFORE UPDATE ON settings WHEN NEW.key='module:wallet' BEGIN SELECT RAISE(ABORT,'Synthetic settings failure'); END;");
 assert.throws(()=>f.core.toggle('wallet',false),/Synthetic settings failure/);
 f.release();await pending;await f.core.bus.drain();
 assert.equal(f.store.get('module:wallet'),true);assert.equal(f.core.snapshots(42).journal.status,'ready');
 assert.equal(f.dataEvents.length,1);assert.equal(f.calls.length,1);
});

test('public character-zero collections obey module pause and recover on the normal next collection',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'kairo-public-module-disable-')),store=openStore(dir),entered=Promise.withResolvers(),gate=Promise.withResolvers(),calls=[],events=[];
 const fresh=data=>({status:'ready',data,headers:{},updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),refreshAt:new Date(Date.now()+600000).toISOString()});
 for(const module of catalog)store.set('module:'+module.id,module.id==='universe');
 for(const dataset of catalog.find(module=>module.id==='universe').datasets)store.saveSnapshot(0,dataset.key,fresh([]));
 const prior={...fresh([]),refreshAt:new Date(Date.now()-1000).toISOString()};store.saveSnapshot(0,'prices',prior);let block=true;
 const request=async path=>{calls.push(path);assert.equal(path,'/markets/prices');if(block){entered.resolve();await gate.promise;}return fresh([{type_id:34,average_price:10}]);};
 const core=await createCore(store,{characters:()=>[]},{request,paged:request,health:()=>({}),names:async()=>assert.fail('Prices never request names')},dir,{noSync:true});core.quiesce();core.bus.on('data.prices',event=>events.push(event));
 t.after(async()=>{gate.resolve();await core.close();store.close();await rm(dir,{recursive:true,force:true});});
 const pending=core.sync(0);await entered.promise;core.toggle('universe',false);block=false;gate.resolve();await pending;
 assert.deepEqual(store.snapshot(0,'prices'),prior);assert.equal(events.length,0);assert.equal(core.snapshots(0).prices.status,'disabled');
 core.toggle('universe',true);await core.sync(0);
 assert.deepEqual(store.snapshot(0,'prices').data,[{type_id:34,average_price:10}]);assert.equal(events.length,1);assert.deepEqual(calls,['/markets/prices','/markets/prices']);
});
