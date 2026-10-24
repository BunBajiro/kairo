import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from '../../server/store.mjs';
import {SESSION_COMBAT_RECENT_SQL} from '../../server/session-combat.mjs';
// Freeze the pre-migration access path: SQL never specified an equal-start tie,
// and adding another index can change that old query's accidental tie order.
const original='SELECT id FROM sessions INDEXED BY idx_sessions_character_started WHERE character_id=? AND (ended IS NULL OR ended>?) ORDER BY ended IS NULL DESC,started DESC';
const epoch=Date.parse('2026-10-07T10:00:00Z'),day=86400000,iso=n=>new Date(n).toISOString();
test('recent combat ranges preserve all eligible IDs/order, exact cutoff and end writes with bounded plans',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'kairo-recent-'));let store=openStore(dir);
 try{
  const put=store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended) VALUES(?,?,?,?,?)');
  store.db.exec('BEGIN');for(const pilot of [42,43]){
   for(let i=0;i<10000;i++)put.run(`${pilot}-old-${i}`,pilot,'old',iso(epoch-(i+3)*day),iso(epoch-(i+3)*day+1000));
   put.run(`${pilot}-active`,pilot,'active',iso(epoch-100*day),null);
   for(let i=0;i<12;i++)put.run(`${pilot}-recent-${i}`,pilot,'recent',iso(epoch-day),iso(epoch-i*1000));
   put.run(`${pilot}-boundary`,pilot,'boundary',iso(epoch-2*day),iso(epoch-day));
  }store.db.exec('COMMIT; ANALYZE');
  for(const pilot of [42,43])for(const time of [epoch,epoch+1,epoch+day-10000,epoch+day])assert.deepEqual(store.db.prepare(SESSION_COMBAT_RECENT_SQL).all(pilot,pilot,iso(time-day)),store.db.prepare(original).all(pilot,iso(time-day)));
  assert.equal(store.db.prepare(SESSION_COMBAT_RECENT_SQL).all(42,42,iso(epoch-day)).length,13,'every recent Session remains eligible');
  const plan=store.db.prepare('EXPLAIN QUERY PLAN '+SESSION_COMBAT_RECENT_SQL).all(42,42,iso(epoch-day)).map(p=>p.detail).join('\n');
  assert.match(plan,/idx_sessions_character_ended \(character_id=\? AND ended=\?\)/);assert.match(plan,/idx_sessions_character_ended \(character_id=\? AND ended>\?\)/);
  store.db.prepare('UPDATE sessions SET ended=? WHERE id=?').run(iso(epoch), '42-active');
  assert.deepEqual(store.db.prepare(SESSION_COMBAT_RECENT_SQL).all(42,42,iso(epoch-day)),store.db.prepare(original).all(42,iso(epoch-day)));
  store.close();store=null;store=openStore(dir);
  assert.equal(store.db.prepare("SELECT count(*) n FROM migrations WHERE id='session-combat-eligibility-v080'").get().n,1);
  assert.equal(store.db.prepare('SELECT count(*) n FROM sessions').get().n,20028,'migration/reopen preserve durable history');
 }finally{store?.close();await rm(dir,{recursive:true,force:true});}
});
