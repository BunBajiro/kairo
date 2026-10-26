import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createCore} from '../../server/core.mjs';
import {catalog} from '../../server/modules/catalog.mjs';
import {changeSession, sessionReport} from '../../server/history.mjs';
import {sessionReplay} from '../../server/session-replay.mjs';
import {sessionEventWindow} from '../../server/session-event-window.mjs';

const epoch=Date.parse('2026-10-15T12:00:00Z'),at=ms=>new Date(epoch+ms).toISOString();
const entry=(id,ms,amount=100)=>({id,date:at(ms).replace('.000Z','Z'),amount,balance:5000,ref_type:'player_donation',description:'Donation'});
async function fixture(t,entries){
 t.mock.timers.enable({apis:['Date'],now:epoch});
 const directory=await mkdtemp(join(tmpdir(),'kairo-journal-time-')),store=openStore(directory),calls=[];
 for(const module of catalog)store.set('module:'+module.id,module.id==='wallet');
 const fresh=data=>({status:'ready',data,updatedAt:at(0),expiresAt:at(600000),refreshAt:at(600000),headers:{}});
 store.saveSnapshot(42,'wallet',fresh(5000));store.saveSnapshot(42,'transactions',fresh([]));
 store.saveSnapshot(42,'journal',{...fresh([]),refreshAt:at(-1)});
 const core=await createCore(store,{characters:()=>[{id:42,scopes:['esi-wallet.read_character_wallet.v1']}]},{
  health:()=>({}),names:async()=>{throw new Error('This journal fixture contains no resolvable entity fields');},
  async request(path){throw new Error('Unexpected unpaged request: '+path);},
  async paged(path){calls.push(path);assert.equal(path,'/characters/42/wallet/journal');return fresh(entries);}
 },resolve('server/modules'),{noSync:true});
 t.after(async()=>{await core.close();store.close();await rm(directory,{recursive:true,force:true});});
 return {store,core,calls,directory,sync:async()=>{await core.sync(42);await core.bus.drain();}};
}

test('a whole-second ESI journal event before the fractional Session start is excluded from report and replay',async t=>{
 const f=await fixture(t,[entry(101,0)]);
 t.mock.timers.tick(500);const id=changeSession(f.store,f.core.publish,42,{action:'start'}).id;
 t.mock.timers.tick(1000);await f.sync();
 t.mock.timers.tick(1000);changeSession(f.store,f.core.publish,42,{action:'end'});
 const report=sessionReport(f.store,id,42),replay=sessionReplay(f.store,id,42);
 assert.equal(report.stats.income,0,'The journal occurrence precedes this Session by 500 ms');
 assert.equal(report.events.filter(e=>e.type==='wallet.entry').length,0);
 assert.equal(replay.events.filter(e=>e.type==='wallet.entry').length,0);
 assert.deepEqual(f.calls,['/characters/42/wallet/journal']);
});

test('a whole-second ESI journal event before the fractional Session end contributes to report and replay',async t=>{
 const f=await fixture(t,[entry(102,1000,-75)]);
 const id=changeSession(f.store,f.core.publish,42,{action:'start'}).id;
 t.mock.timers.tick(1250);await f.sync();
 t.mock.timers.tick(250);changeSession(f.store,f.core.publish,42,{action:'end'});
 const report=sessionReport(f.store,id,42),replay=sessionReplay(f.store,id,42);
 assert.equal(report.stats.expenses,75,'The journal occurrence precedes Session end by 500 ms');
 assert.equal(report.events.filter(e=>e.type==='wallet.entry').length,1);
 assert.equal(replay.events.filter(e=>e.type==='wallet.entry').length,1);
 assert.deepEqual(f.calls,['/characters/42/wallet/journal']);
});

test('journal occurrence precision shares chronological order with locally captured events and duplicate reads stay silent',async t=>{
 const f=await fixture(t,[entry(103,1000),entry(104,1750,25)]);
 const id=changeSession(f.store,f.core.publish,42,{action:'start'}).id;
 t.mock.timers.tick(1250);f.core.publish({characterId:42,type:'goal.completed',payload:{goal_id:'ordering-control'}});
 t.mock.timers.tick(750);await f.sync();
 t.mock.timers.tick(1000);changeSession(f.store,f.core.publish,42,{action:'end'});
 const events=sessionReport(f.store,id,42).events.filter(e=>['wallet.entry','goal.completed'].includes(e.type));
 assert.deepEqual(events.map(e=>e.payload.journal_id||e.payload.goal_id),[103,'ordering-control',104]);
 assert.deepEqual(events.map(e=>e.at),[at(1000),at(1250),at(1750)]);
 assert.equal(sessionReport(f.store,id,42).stats.income,125);
 const before=f.store.db.prepare('SELECT COUNT(*) n FROM events').get().n;
 await f.sync();assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM events').get().n,before);
 assert.deepEqual(f.calls,['/characters/42/wallet/journal'],'A not-due refresh adds no transport or duplicate event');
});

test('UTC-offset journal occurrences match the equivalent UTC Session interval',async t=>{
 const f=await fixture(t,[{...entry(105,1000),date:'2026-10-15T13:00:01+01:00'}]);
 const id=changeSession(f.store,f.core.publish,42,{action:'start'}).id;
 t.mock.timers.tick(2000);await f.sync();t.mock.timers.tick(1000);changeSession(f.store,f.core.publish,42,{action:'end'});
 const report=sessionReport(f.store,id,42),event=report.events.find(e=>e.type==='wallet.entry');
 assert.equal(report.stats.income,100);assert.equal(event?.at,at(1000));
 assert.equal(sessionReplay(f.store,id,42).events.find(e=>e.type==='wallet.entry')?.at,at(1000));
 assert.deepEqual(f.calls,['/characters/42/wallet/journal']);
});

test('millisecond journal dates, malformed-date handling, dedupe and indexed Session reads retain their existing bounds',async t=>{
 const f=await fixture(t,[entry(106,1250),{...entry(107,1000),date:'unparseable-source-date'}]);
 const id=changeSession(f.store,f.core.publish,42,{action:'start'}).id;
 t.mock.timers.tick(2000);await f.sync();
 f.core.bus.emit({type:'data.journal',characterId:42,payload:{previous:[],current:[entry(106,1250)]}});await f.core.bus.drain();
 t.mock.timers.tick(1000);changeSession(f.store,f.core.publish,42,{action:'end'});
 const report=sessionReport(f.store,id,42),event=report.events.find(e=>e.type==='wallet.entry');
 assert.equal(report.stats.income,100);assert.equal(event.at,at(1250));
 assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM events WHERE type='wallet.entry'").get().n,2);
 assert.equal(f.store.db.prepare("SELECT at FROM events WHERE dedupe='wallet:42:107'").get().at,'unparseable-source-date','Invalid legacy behavior is outside the normalization correction');
 assert.equal(f.core.bus.health().failures,0);
 const session=f.store.db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
 const {where,params}=sessionEventWindow(session,JSON.parse(session.start_context),JSON.parse(session.end_context),report.eventEnd,{eventCursor:report.eventCursor});
 const plan=f.store.db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM events WHERE ${where} ORDER BY at,id LIMIT 101`).all(...params);
 assert.ok(plan.some(row=>row.detail.includes('idx_events_character_at')&&row.detail.includes('at>')&&row.detail.includes('at<')),JSON.stringify(plan));
 assert.deepEqual(f.calls,['/characters/42/wallet/journal']);
});

test('retained journal timestamps normalize once on reopen without changing IDs, cursor ownership or unrelated history',async t=>{
 const f=await fixture(t,[]),migration='wallet-event-time-v080';
 const id=changeSession(f.store,f.core.publish,42,{action:'start'}).id;
 const emit=(journalId,date)=>f.core.publish({characterId:42,type:'wallet.entry',at:date,payload:{journal_id:journalId,amount:10},dedupe:'wallet:42:'+journalId});
 emit(201,'2026-10-15T12:00:01Z');emit(202,'2026-10-15T13:00:01.500+01:00');emit(203,at(1750));emit(204,'unparseable-source-date');
 f.core.publish({characterId:42,type:'custom.event',at:'2026-10-15T12:00:01Z'});
 t.mock.timers.tick(2000);changeSession(f.store,f.core.publish,42,{action:'end'});
 const prior=f.store.db.prepare('SELECT * FROM events ORDER BY id').all();
 f.store.db.prepare('DELETE FROM migrations WHERE id=?').run(migration);
 f.store.db.exec('CREATE TABLE journal_time_update_audit(id INTEGER); CREATE TRIGGER audit_journal_time AFTER UPDATE OF at ON events BEGIN INSERT INTO journal_time_update_audit VALUES(new.id); END;');
 let reopened=openStore(f.directory);
 try{
  const next=reopened.db.prepare('SELECT * FROM events ORDER BY id').all();
  assert.deepEqual(next.map(row=>({...row,at:undefined})),prior.map(row=>({...row,at:undefined})),'Only the occurrence timestamp may change');
  const byJournal=journalId=>next.find(row=>row.dedupe==='wallet:42:'+journalId);
  assert.equal(byJournal(201).at,at(1000));assert.equal(byJournal(202).at,at(1500));assert.equal(byJournal(203).at,at(1750));
  assert.equal(byJournal(204).at,'unparseable-source-date');assert.equal(next.find(row=>row.type==='custom.event').at,'2026-10-15T12:00:01Z');
  assert.equal(reopened.db.prepare('SELECT COUNT(*) n FROM journal_time_update_audit').get().n,2,'Canonical, invalid and unrelated rows need no rewrite');
  const report=sessionReport(reopened,id,42);assert.equal(report.stats.income,30);
  assert.deepEqual(report.events.filter(e=>e.type==='wallet.entry').map(e=>e.payload.journal_id),[201,202,203]);
  assert.deepEqual(sessionReplay(reopened,id,42).events.filter(e=>e.type==='wallet.entry').map(e=>e.payload.journal_id),[201,202,203]);
  assert.equal(reopened.db.prepare('SELECT COUNT(*) n FROM migrations WHERE id=?').get(migration).n,1);
 }finally{reopened.close();}
 reopened=openStore(f.directory);
 try{assert.equal(reopened.db.prepare('SELECT COUNT(*) n FROM journal_time_update_audit').get().n,2,'Later startups never rewrite the history again');}
 finally{reopened.close();}
 assert.deepEqual(f.calls,[],'Migration and report/replay use retained rows without source refetch');
});
