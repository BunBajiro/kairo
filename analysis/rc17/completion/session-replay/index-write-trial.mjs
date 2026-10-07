// Run only under the coordinator's exclusive benchmark lock. Each invocation
// measures one arm; use baseline/candidate/candidate/baseline with fresh files.
import {mkdtemp,rm,readFile,writeFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const repo=resolve(process.env.KAIRO_BENCH_REPO||'.'),variant=process.env.KAIRO_SESSION_INDEX||'baseline',archived=Number(process.env.KAIRO_SESSION_ARCHIVED||10000),pilots=Number(process.env.KAIRO_SESSION_PILOTS||4),output=process.env.KAIRO_SESSION_OUTPUT||'session-index-write-trial.json';
if(!['baseline','candidate'].includes(variant))throw Error('Unknown variant');
const {openStore}=await import(pathToFileURL(join(repo,'server/store.mjs'))),dir=await mkdtemp(join(tmpdir(),'kairo-session-index-')),store=openStore(dir),epoch=Date.parse('2026-10-07T10:00:00Z'),iso=t=>new Date(t).toISOString();
try{
 store.db.exec('DROP INDEX IF EXISTS idx_sessions_character_ended');
 const put=store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended) VALUES(?,?,?,?,?)');store.db.exec('BEGIN');for(let p=1;p<=pilots;p++)for(let i=0;i<archived;i++)put.run(`${p}-archive-${i}`,p,'Archive',iso(epoch-(i+3)*86400000),iso(epoch-(i+3)*86400000+3600000));store.db.exec('COMMIT; PRAGMA wal_checkpoint(TRUNCATE)');
 const beforeBytes=(await stat(join(dir,'kairo.sqlite'))).size,started=performance.now();if(variant==='candidate')store.db.exec('BEGIN IMMEDIATE;CREATE INDEX idx_sessions_character_ended ON sessions(character_id,ended);COMMIT;');const upgradeMs=performance.now()-started;
 const insertStart=performance.now();store.db.exec('BEGIN');for(let p=1;p<=pilots;p++)for(let i=0;i<500;i++)put.run(`${p}-new-${i}`,p,'New',iso(epoch+i*1000),null);store.db.exec('COMMIT');const insertMs=performance.now()-insertStart;
 const finish=store.db.prepare('UPDATE sessions SET ended=? WHERE id=?'),endStart=performance.now();store.db.exec('BEGIN');for(let p=1;p<=pilots;p++)for(let i=0;i<500;i++)finish.run(iso(epoch+i*1000+1000),`${p}-new-${i}`);store.db.exec('COMMIT');const endUpdateMs=performance.now()-endStart;
 store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');const rows=store.db.prepare('SELECT * FROM sessions ORDER BY id').all();const hash=v=>createHash('sha256').update(v).digest('hex');
 await writeFile(output,JSON.stringify({kind:'session-index-write-trial',variant,archivedPerPilot:archived,pilots,inserted:500*pilots,ended:500*pilots,sourceCommit:process.env.KAIRO_BENCH_SOURCE_COMMIT||null,sourceSha256:hash(await readFile(join(repo,'server/store.mjs'))),harnessSha256:hash(await readFile(new URL(import.meta.url))),node:process.version,upgradeMs,insertMs,endUpdateMs,beforeBytes,afterBytes:(await stat(join(dir,'kairo.sqlite'))).size,rowCount:rows.length,rowsSha256:hash(JSON.stringify(rows))},null,2)+'\n');
}finally{store.close();await rm(dir,{recursive:true,force:true});}
