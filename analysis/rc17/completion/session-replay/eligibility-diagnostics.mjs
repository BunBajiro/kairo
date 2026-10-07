// Deterministic planner/shape diagnostics; deliberately no host timings.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const original=`SELECT id FROM sessions WHERE character_id=? AND (ended IS NULL OR ended>?) ORDER BY ended IS NULL DESC,started DESC`;
const candidate=`SELECT id FROM (
 SELECT id,started,1 AS is_open,rowid AS sequence FROM sessions WHERE character_id=? AND ended IS NULL
 UNION ALL
 SELECT id,started,0 AS is_open,rowid AS sequence FROM sessions WHERE character_id=? AND ended>?
) ORDER BY is_open DESC,started DESC,sequence`;
const index='CREATE INDEX idx_sessions_character_ended ON sessions(character_id,ended)';
const epoch=Date.parse('2026-10-07T10:00:00Z'),day=86400000,iso=n=>new Date(n).toISOString();
const result={kind:'deterministic-planner-and-cardinality-diagnostic',node:process.version,harnessSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),original,candidate,index,measurements:[],limits:['No elapsed/CPU measurements. Query plans establish access paths, not measured rows examined.','Two-minute cadence is simulated at exact three-second deadlines, inclusive endpoints (41 ticks). Real timer jitter and provider latency are excluded.']};
for(const archived of [100,1000,10000])for(const pilots of [1,4]){
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY,character_id INTEGER NOT NULL,label TEXT NOT NULL,started TEXT NOT NULL,ended TEXT,start_context TEXT NOT NULL DEFAULT '{}',end_context TEXT NOT NULL DEFAULT '{}');CREATE INDEX idx_sessions_character_started ON sessions(character_id,started DESC);`);
 const put=db.prepare('INSERT INTO sessions(id,character_id,label,started,ended) VALUES(?,?,?,?,?)');
 db.exec('BEGIN');for(let pilot=1;pilot<=pilots;pilot++){
  for(let n=0;n<archived;n++)put.run(`${pilot}-old-${n}`,pilot,'archive',iso(epoch-(n+3)*day),iso(epoch-(n+3)*day+3600000));
  for(const [id,start,end] of [['active',epoch-10*day,null],['recent1',epoch-400000,epoch-300000],['recent2',epoch-400000,epoch-200000],['boundary',epoch-2*day,epoch-day],['near-boundary',epoch-2*day,epoch-day+60000]])put.run(`${pilot}-${id}`,pilot,id,iso(start),end===null?null:iso(end));
 }db.exec('COMMIT; ANALYZE');
 const beforePages=db.prepare('PRAGMA page_count').get().page_count,pageSize=db.prepare('PRAGMA page_size').get().page_size;
 const beforePlan=db.prepare('EXPLAIN QUERY PLAN '+original).all(1,iso(epoch-day));
 const before=[];for(let tick=0;tick<=120000;tick+=3000)for(let pilot=1;pilot<=pilots;pilot++)before.push(db.prepare(original).all(pilot,iso(epoch+tick-day)).map(s=>s.id));
 db.exec(index+'; ANALYZE');const afterPlan=db.prepare('EXPLAIN QUERY PLAN '+candidate).all(1,1,iso(epoch-day));
 const after=[];for(let tick=0;tick<=120000;tick+=3000)for(let pilot=1;pilot<=pilots;pilot++)after.push(db.prepare(candidate).all(pilot,pilot,iso(epoch+tick-day)).map(s=>s.id));
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('eligibility/order changed');
 result.measurements.push({archivedPerPilot:archived,pilots,totalRows:db.prepare('SELECT count(*) n FROM sessions').get().n,ticksPerPilot:41,queryCalls:before.length,returnedIds:before.reduce((n,s)=>n+s.length,0),firstEligible:before[0],lastEligible:before.at(-1),equal:true,beforePlan,afterPlan,beforeAllocatedBytes:beforePages*pageSize,afterAllocatedBytes:db.prepare('PRAGMA page_count').get().page_count*pageSize,resultSha256:createHash('sha256').update(JSON.stringify(before)).digest('hex')});db.close();
}
const output=process.argv[2];if(output)writeFileSync(resolve(output),JSON.stringify(result,null,2)+'\n');else console.log(JSON.stringify(result,null,2));
