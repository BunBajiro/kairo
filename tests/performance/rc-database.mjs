// External RC verification. Only disposable synthetic databases are modified.
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir,cpus,platform,arch} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {seedFixture,PILOT,DESTINATION} from './fixture.mjs';
import {openStore as openLegacy} from '../../server/store.mjs';

const [appPath,output]=process.argv.slice(2),root=resolve(appPath),out=resolve(output);
const NOW=Date.parse('2026-09-18T12:00:00Z'),DAY=86400000,iso=n=>new Date(n).toISOString();
Date.now=()=>NOW;
const app=path=>import(pathToFileURL(join(root,'server',path)).href);
const [{openStore},{createMarkets},{saveHistory}]=await Promise.all(['store.mjs','markets.mjs','market-history.mjs'].map(app));
const batch=await app('market-history-store.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return null;throw e;});
const stats=samples=>({samples,p50:[...samples].sort((a,b)=>a-b)[Math.floor(samples.length/2)],max:Math.max(...samples)});
async function measure(fn,n=3){await fn();const times=[];let value;for(let i=0;i<n;i++){const t=performance.now();value=await fn();times.push(performance.now()-t);}return {ms:stats(times),value};}
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const report={schemaVersion:1,suite:'rc-database',application:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),environment:{node:process.version,sqlite:process.versions.sqlite,cpu:cpus()[0].model,logicalCpus:cpus().length,platform:platform(),arch:arch(),runner:process.env.GITHUB_ACTIONS?'github-actions':'workspace'},fixedTime:iso(NOW),notes:['Identical legacy stress fixture is seeded before opening each measured application.','Aged history includes 365 completed days for 5,000 types. The production startup migration runs without benchmark assistance.','Read and write timings include JSON serialization where a response is measured. No network requests or durability changes.','Event inserts are 5,000-row committed synthetic batches; their cost is not a measurement of ordinary per-event latency.']};
const dir=await mkdtemp(join(tmpdir(),'kairo-rc-database-'));let store,markets;
try{
    await seedFixture(dir,'stress',NOW);
    const legacy=openLegacy(dir),db=legacy.db;
    const recent=JSON.parse(db.prepare('SELECT body FROM market_history LIMIT 1').get().body);
    const old=Array.from({length:335},(_,i)=>({...recent[0],date:iso(NOW-(31+i)*DAY).slice(0,10)})).reverse();
    db.prepare('UPDATE market_history SET body=?').run(JSON.stringify([...old,...recent]));
    const footprint=database=>({historyJsonBytes:database.prepare('SELECT SUM(length(body)) n FROM market_history').get().n,historyTypes:database.prepare('SELECT COUNT(*) n FROM market_history').get().n,events:database.prepare('SELECT COUNT(*) n FROM events').get().n,characters:database.prepare('SELECT COUNT(*) n FROM characters').get().n,archiveRows:database.prepare('SELECT COUNT(*) n FROM market_history_days').get().n});
    report.before=footprint(db);legacy.close();
    const started=performance.now();store=openStore(dir);report.firstOpenMs=performance.now()-started;
    report.after=footprint(store.db);
    for(const key of ['historyTypes','events','characters','archiveRows'])assert.equal(report.after[key],report.before[key]);
    const auth={characters:()=>store.db.prepare('SELECT id,name,scopes,reauth FROM characters ORDER BY name').all().map(c=>({...c,scopes:JSON.parse(c.scopes),needsReauth:!!c.reauth}))};
    markets=createMarkets(store,auth,{request:async()=>{throw new Error('External network forbidden');}},{autoUpgrade:false,now:()=>NOW});
    let invalidate=0;
    const aged=await measure(async()=>{store.set('market:imports:rc-invalidation',++invalidate);return JSON.stringify(await markets.imports.analyse(DESTINATION));});
    report.agedImports={ms:aged.ms,responseBytes:Buffer.byteLength(aged.value),outputHash:hash(aged.value)};
    const query="SELECT payload,at FROM events WHERE character_id=? AND type='ship.changed' AND at>=? AND at<? AND (at>? OR id>?) ORDER BY at,id";
    report.shipEventPlan=store.db.prepare('EXPLAIN QUERY PLAN '+query).all(PILOT,iso(NOW-2*DAY),iso(NOW),iso(NOW-2*DAY),0);
    const index=store.db.prepare("SELECT name FROM sqlite_schema WHERE name='idx_events_character_type_at'").get();
    report.eventIndexBytes=0;
    if(index){
        const free=()=>store.db.prepare('PRAGMA freelist_count').get().freelist_count;
        const before=free();store.db.exec('SAVEPOINT measure_index; DROP INDEX idx_events_character_type_at');
        report.eventIndexBytes=(free()-before)*store.db.prepare('PRAGMA page_size').get().page_size;
        store.db.exec('ROLLBACK TO measure_index; RELEASE measure_index');
    }
    const insert=store.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)');
    const insertTimes=[];
    for(let trial=0;trial<6;trial++){
        const t=performance.now();store.db.exec('BEGIN IMMEDIATE');
        for(let i=0;i<5000;i++)insert.run(PILOT,i%5?'session.note':'wallet.entry','rc-write-probe','Synthetic write',i%5?'{}':'{"amount":1}',iso(NOW-1000+i));
        store.db.exec('COMMIT');const elapsed=performance.now()-t;
        if(trial)insertTimes.push(elapsed);
        store.db.exec("DELETE FROM events WHERE module='rc-write-probe'");
    }
    report.eventInsert={rowsPerTransaction:5000,ms:stats(insertTimes)};
    const ids=store.db.prepare('SELECT type_id FROM market_history ORDER BY type_id LIMIT 1000').all().map(r=>r.type_id);
    const writeTimes=[],blocks=[];
    for(let trial=0;trial<4;trial++){
        const t=performance.now();
        for(let offset=0;offset<ids.length;offset+=100){
            const group=ids.slice(offset,offset+100),start=performance.now();
            if(batch)batch.saveHistories(store,10000043,group.map(id=>[id,recent]),iso(NOW),iso(NOW+DAY),'EVE Ref',NOW);
            else for(const id of group)saveHistory(store,10000043,id,recent,iso(NOW),iso(NOW+DAY),'EVE Ref',NOW);
            if(trial)blocks.push(performance.now()-start);await delay(0);
        }
        if(trial)writeTimes.push(performance.now()-t);
    }
    const saved=store.db.prepare('SELECT h.*,m.source FROM market_history h JOIN market_history_meta m USING(region_id,type_id) WHERE h.type_id IN (SELECT value FROM json_each(?)) ORDER BY h.region_id,h.type_id').all(JSON.stringify(ids));
    report.historyWrite={types:1000,days:30,ms:stats(writeTimes),synchronousBlockMs:stats(blocks),outputHash:hash(saved)};
    assert.equal(store.db.prepare('PRAGMA quick_check').get().quick_check,'ok');
    report.complete=true;await mkdir(out,{recursive:true});await writeFile(join(out,'database.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({commit:report.application,agedImportMs:aged.ms.p50,historyJsonBytes:report.after.historyJsonBytes,eventInsertMs:report.eventInsert.ms.p50,historyWriteMs:report.historyWrite.ms.p50}));
}finally{await markets?.close();store?.close();await rm(dir,{recursive:true,force:true});}
