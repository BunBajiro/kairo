import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {openStore} from '../../server/store.mjs';
import {bindingProjection,bindingProjections} from '../../server/projections.mjs';
import {createBus} from '../../server/bus.mjs';
import {createStream,defaultStream} from '../../server/stream.mjs';

test('one binding update shares sources without sharing pilot scope or retaining freshness',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'kairo-projection-')),store=openStore(dir);
 t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});
 const at=Date.now();t.mock.method(Date,'now',()=>at);
 const snapshot=data=>({status:'ready',data,updatedAt:new Date(at-1000).toISOString(),expiresAt:new Date(at+1000).toISOString()});
 store.saveSnapshot(42,'wallet',snapshot(100));store.saveSnapshot(43,'wallet',snapshot(200));
 store.saveSnapshot(42,'ship',snapshot({ship_type_id:1}));store.set('names',{1:'Rifter'});
 store.db.prepare('INSERT INTO sessions(id,character_id,label,started) VALUES(?,?,?,?)').run('flight',42,'A flight',new Date(at-10000).toISOString());
 store.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)').run(42,'killmail.kill','combat','Kill','{}',new Date(at).toISOString());
 const elements=[
  {id:'elapsed',binding:'session.elapsed',characterId:42},
  {id:'report',binding:'session.report',characterId:42},
  {id:'report-numbers',binding:'session.report',characterId:42,bindingDisplay:'numbers'},
  ...Array.from({length:10},(_,i)=>({id:'wallet-'+i,binding:'wallet.balance',characterId:42})),
  {id:'other',binding:'wallet.balance',characterId:43},
  {id:'missing',binding:'wallet.balance',characterId:44},
  {id:'ship',binding:'pilot.ship',characterId:42},
 ];
 const pilots=[{id:42},{id:43}],auth={characters:()=>pilots};
 const expected=Object.fromEntries(elements.map(e=>[e.id,bindingProjection(store,auth,e)]));
 const reads={snapshots:[],settings:[],sessions:0,counts:0,roster:0};
 const observed={...store,get(key,fallback){reads.settings.push(key);return store.get(key,fallback);},snapshot(id,key){reads.snapshots.push([id,key]);return store.snapshot(id,key);},db:{prepare(sql){if(sql.startsWith('SELECT * FROM sessions'))reads.sessions++;if(sql.startsWith('SELECT type,COUNT'))reads.counts++;return store.db.prepare(sql);}}};
 assert.deepEqual(bindingProjections(observed,{characters(){reads.roster++;return pilots;}},elements),expected);
 assert.deepEqual(reads.snapshots,[[42,'wallet'],[43,'wallet'],[42,'ship']]);
 assert.equal(reads.sessions,1);assert.equal(reads.counts,1);assert.equal(reads.roster,1);
 assert.equal(reads.settings.filter(key=>key==='names').length,1);
 store.saveSnapshot(42,'wallet',{...snapshot(999),expiresAt:new Date(at).toISOString()});
 store.set('names',{1:'Changed name'});
 const next=bindingProjections(store,auth,elements);
 assert.equal(next['wallet-0'].bindingStatus,'unavailable');assert.equal(next.other.text,'200 ISK');assert.equal(next.ship.text,'Changed name');
 store.set('module:pilot',false);assert.equal(bindingProjections(store,auth,elements).ship.bindingStatus,'unavailable');
});

test('goal widgets share a read per source and pilot while retaining independent display variants',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'kairo-goal-projection-')),store=openStore(dir);
 t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});
 const insert=store.db.prepare('INSERT INTO goals(id,character_id,title,target,progress,kind,done,created) VALUES(?,?,?,?,?,?,?,?)');
 insert.run('fund',42,'Fleet fund',1000,250,'manual',0,'2026-09-20T00:00:00.000Z');
 insert.run('hulls',42,'Ready hulls',8,8,'manual',1,'2026-09-20T00:00:00.000Z');
 insert.run('alt',43,'Alt fund',200,40,'manual',0,'2026-09-20T00:00:00.000Z');
 const elements=[
  ...['fund','hulls'].flatMap(sourceId=>[undefined,'title','numbers'].map(bindingDisplay=>({id:sourceId+'-'+(bindingDisplay||'full'),binding:'goal.progress',sourceId,characterId:42,bindingDisplay}))),
  {id:'fund-repeat',binding:'goal.progress',sourceId:'fund',characterId:42},
  {id:'other-pilot',binding:'goal.progress',sourceId:'fund',characterId:43},
  {id:'other-pilot-numbers',binding:'goal.progress',sourceId:'fund',characterId:43,bindingDisplay:'numbers'},
  {id:'alt',binding:'goal.progress',sourceId:'alt',characterId:43},
 ];
 const reads=[],auth={characters:()=>[{id:42},{id:43}]};
 const observed={...store,db:{prepare(sql){const statement=store.db.prepare(sql);return sql==='SELECT * FROM goals WHERE id=? AND character_id=?'?{get(...args){reads.push(args);return statement.get(...args);}}:statement;}}};
 const unavailable={text:'Source unavailable',detail:'',value:0,endsAt:0,startedAt:0,bindingStatus:'unavailable'};
 const first=bindingProjections(observed,auth,elements);
 assert.deepEqual(first,{
  'fund-full':{text:'Fleet fund',detail:'250 / 1,000',value:25,bindingStatus:'ready'},
  'fund-title':{text:'Fleet fund',detail:'',value:25,bindingStatus:'ready'},
  'fund-numbers':{text:'250 / 1,000',detail:'',value:25,bindingStatus:'ready'},
  'hulls-full':{text:'Ready hulls',detail:'8 / 8 · COMPLETE',value:100,bindingStatus:'ready'},
  'hulls-title':{text:'Ready hulls',detail:'',value:100,bindingStatus:'ready'},
  'hulls-numbers':{text:'8 / 8',detail:'',value:100,bindingStatus:'ready'},
  'fund-repeat':{text:'Fleet fund',detail:'250 / 1,000',value:25,bindingStatus:'ready'},
  'other-pilot':unavailable,'other-pilot-numbers':unavailable,
  alt:{text:'Alt fund',detail:'40 / 200',value:20,bindingStatus:'ready'},
 });
 assert.deepEqual(reads,[['fund',42],['hulls',42],['fund',43],['alt',43]],'Missing foreign sources are cached only within their own pilot scope');
 store.db.prepare('UPDATE goals SET title=?,progress=? WHERE id=?').run('Updated fund',500,'fund');reads.length=0;
 const next=bindingProjections(observed,auth,elements);
 assert.deepEqual(next['fund-full'],{text:'Updated fund',detail:'500 / 1,000',value:50,bindingStatus:'ready'});
 assert.deepEqual(next['fund-numbers'],{text:'500 / 1,000',detail:'',value:50,bindingStatus:'ready'});
 assert.deepEqual(next['other-pilot'],unavailable);
 assert.deepEqual(reads,[['fund',42],['hulls',42],['fund',43],['alt',43]],'The next update reads each source again');
});

test('training and industry share sorted source choices per update and re-evaluate time, expiry and new samples',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'kairo-timed-projection-')),store=openStore(dir);
 t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});
 const base=Date.parse('2026-09-20T12:00:00.000Z'),iso=offset=>new Date(base+offset).toISOString();let offset=0;
 t.mock.method(Date,'now',()=>base+offset);
 const sample=(data,expires=6000)=>({status:'ready',data,updatedAt:iso(0),expiresAt:iso(expires)});
 const queue=[
  {skill_id:11,queue_position:9,finished_level:4,start_date:iso(0),finish_date:iso(6000)},
  {skill_id:12,queue_position:3,finished_level:5,start_date:iso(-1000),finish_date:iso(3000)},
  {skill_id:13,queue_position:1,finished_level:2,start_date:iso(-1000),finish_date:iso(0)},
 ];
 const jobs=[
  {product_type_id:16,status:'active',runs:2,start_date:iso(0),end_date:iso(9000)},
  {product_type_id:18,status:'delivered',runs:99,start_date:iso(-5000),end_date:iso(-1000)},
  {product_type_id:17,status:'active',runs:10,start_date:iso(-4000),end_date:iso(4000)},
  {product_type_id:19,status:'ready',runs:3,start_date:iso(0),end_date:iso(7000)},
 ];
 store.saveSnapshot(42,'queue',sample(queue));store.saveSnapshot(42,'jobs',sample(jobs));
 store.saveSnapshot(43,'queue',sample([{skill_id:99,queue_position:0,finished_level:1,start_date:iso(-1000),finish_date:iso(1000)}]));
 store.saveSnapshot(43,'jobs',sample([]));
 store.set('names',{11:'Cruiser',12:'Fleet skill',17:'Muninn'});
 const elements=[
  ...['training.remaining','industry.next'].flatMap(binding=>[undefined,'title','numbers'].map(bindingDisplay=>({id:binding+'-'+(bindingDisplay||'full'),binding,characterId:42,bindingDisplay}))),
  {id:'alt-training',binding:'training.remaining',characterId:43},
  {id:'alt-industry',binding:'industry.next',characterId:43},
 ];
 const reads=[],auth={characters:()=>[{id:42},{id:43}]};let nameReads=0;
 const observed={...store,snapshot(id,key){reads.push([id,key]);return store.snapshot(id,key);},get(key,fallback){if(key==='names')nameReads++;return store.get(key,fallback);}};
 const unavailable={text:'Source unavailable',detail:'',value:0,endsAt:0,startedAt:0,bindingStatus:'unavailable'};
 const project=()=>{reads.length=0;nameReads=0;return bindingProjections(observed,auth,elements);};
 const first=project();
 for(const display of ['full','title','numbers']){
  assert.deepEqual(first['training.remaining-'+display],{text:'Fleet skill 5',detail:'',endsAt:base+3000,value:25,bindingStatus:'ready'});
  assert.deepEqual(first['industry.next-'+display],{text:'Muninn',detail:'10 runs',endsAt:base+4000,value:50,bindingStatus:'ready'});
 }
 assert.deepEqual(first['alt-training'],{text:'Skill 1',detail:'',endsAt:base+1000,value:50,bindingStatus:'ready'});
 assert.deepEqual(first['alt-industry'],{...unavailable,text:'No active jobs',bindingStatus:'idle'});
 assert.deepEqual(reads,[[42,'queue'],[42,'jobs'],[43,'queue'],[43,'jobs']]);assert.equal(nameReads,1);
 assert.deepEqual(store.snapshot(42,'queue').data,queue,'Preparing a sorted choice does not reorder saved samples');
 assert.deepEqual(store.snapshot(42,'jobs').data,jobs);
 offset=3000;const later=project();
 assert.deepEqual(later['training.remaining-full'],{text:'Cruiser 4',detail:'',endsAt:base+6000,value:50,bindingStatus:'ready'},'A skill finishing exactly now is excluded');
 assert.deepEqual(later['industry.next-full'],{text:'Muninn',detail:'10 runs',endsAt:base+4000,value:87.5,bindingStatus:'ready'});
 assert.deepEqual(later['alt-training'],{...unavailable,text:'Queue idle',bindingStatus:'idle'});
 assert.deepEqual(reads,[[42,'queue'],[42,'jobs'],[43,'queue'],[43,'jobs']]);
 offset=6000;const expired=project();
 for(const value of Object.values(expired))assert.deepEqual(value,unavailable,'The exact snapshot expiry is unavailable, even for previously idle sources');
 assert.equal(nameReads,0);
 store.saveSnapshot(42,'queue',sample([{skill_id:12,queue_position:0,finished_level:3,start_date:iso(6000),finish_date:iso(10000)}],20000));
 store.saveSnapshot(42,'jobs',sample([],20000));store.set('names',{12:'Updated skill'});
 const updated=project();
 assert.deepEqual(updated['training.remaining-full'],{text:'Updated skill 3',detail:'',endsAt:base+10000,value:0,bindingStatus:'ready'});
 assert.deepEqual(updated['industry.next-full'],{...unavailable,text:'No active jobs',bindingStatus:'idle'});
 assert.deepEqual(updated['alt-training'],unavailable);assert.deepEqual(updated['alt-industry'],unavailable);
 assert.deepEqual(reads,[[42,'queue'],[42,'jobs'],[43,'queue'],[43,'jobs']]);assert.equal(nameReads,1);
});

test('unchanged bindings preserve version, while protection/config and reconnect publish current state',()=>{
 const settings=new Map(),store={get:(key,fallback)=>settings.get(key)??fallback,set:(key,value)=>settings.set(key,value)};
 const bus=createBus(),stream=createStream(store,bus),writes=[];
 const response=new EventEmitter();response.write=value=>{writes.push(value);return true;};response.end=()=>response.emit('finish');
 stream.connect(response);const initial=stream.state().version;
 stream.setBindings({a:{text:'A',bindingStatus:'ready'}});assert.equal(stream.state().version,initial+1);
 stream.setBindings({a:{text:'A',bindingStatus:'ready'}});assert.equal(writes.length,2);assert.equal(stream.state().version,initial+1);
 stream.setOPSEC({state:'hostile',hidden:true});assert.equal(writes.length,3);
 stream.save({...defaultStream(),position:'bottom-left'});assert.equal(writes.length,4);
 const second=new EventEmitter(),reconnected=[];second.write=value=>reconnected.push(value);second.end=()=>second.emit('finish');stream.connect(second);
 assert.equal(JSON.parse(reconnected[0].toString().split('data: ')[1]).position,'bottom-left');
 stream.close();stream.close();
 const count=writes.length;
 stream.setBindings({a:{text:'later'}});stream.changed();bus.emit({type:'location.changed',payload:{system_name:'After close'}});
 assert.equal(stream.emit('test.toast',true),false);assert.equal(writes.length,count);
 const late=new EventEmitter();let ended=false;late.end=()=>{ended=true;};late.write=()=>assert.fail('closed stream wrote to a new client');stream.connect(late);assert.equal(ended,true);
});
