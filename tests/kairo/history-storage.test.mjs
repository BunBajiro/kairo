import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../../server/store.mjs';
import {DAY,historyWindow,saveHistory,createHistoryArchive} from '../../server/market-history.mjs';
import {saveHistories} from '../../server/market-history-store.mjs';

const NOW=Date.parse('2026-09-18T12:00:00Z'),REGION=10000043;
const iso=n=>new Date(n).toISOString(),date=n=>iso(n).slice(0,10);
const history=(days=365)=>Array.from({length:days},(_,i)=>({date:date(NOW-(i+1)*DAY),average:100+i,volume:10+i,highest:200+i,lowest:50,order_count:3}));
async function fixture(t){
    const dir=await mkdtemp(join(tmpdir(),'kairo-history-storage-')),store=openStore(dir);
    t.after(async()=>{try{store.close();}catch{}await rm(dir,{recursive:true,force:true});});
    return {dir,store};
}
const stored=(store,id=1)=>store.db.prepare('SELECT h.*,m.source FROM market_history h LEFT JOIN market_history_meta m USING(region_id,type_id) WHERE h.region_id=? AND h.type_id=?').get(REGION,id);
function legacy(store){
    saveHistory(store,REGION,1,history(),iso(NOW),iso(NOW+DAY),'EVE Ref',NOW);
    store.db.prepare('UPDATE market_history SET body=?').run(JSON.stringify(history()));
    store.db.exec("DELETE FROM migrations WHERE id='database-v073'; DROP INDEX idx_events_character_type_at");
}

test('history writes bound the working set while preserving calendar results, row order and source fields',async t=>{
    const {store}=await fixture(t),rows=history();
    rows.splice(2,1); // A missing day must not increase the assumed daily volume.
    rows.push({...rows[0],average:400,volume:80,sourceNote:'last duplicate wins'});
    rows.push({...rows[0],date:date(NOW),volume:999999},{...rows[0],date:date(NOW+DAY)});
    saveHistory(store,REGION,1,rows,iso(NOW),iso(NOW+DAY),'ESI',NOW);
    const row=stored(store),bounded=rows.filter(r=>r.date>=date(NOW-30*DAY)&&r.date<date(NOW));
    assert.deepEqual(JSON.parse(row.body),bounded);
    assert.equal(row.source,'ESI');
    assert.equal(row.updated,iso(NOW));
    assert.equal(row.expires,iso(NOW+DAY));
    for(const days of [1,3,7,30])assert.deepEqual(historyWindow(JSON.parse(row.body),days,NOW),historyWindow(rows,days,NOW));
    assert.equal(row.daily_volume,historyWindow(rows,30,NOW).daily_volume);
    assert.equal(row.reported_days,29);
    saveHistory(store,10000002,1,history(1),iso(NOW),iso(NOW+DAY),'EVE Ref',NOW);
    assert.deepEqual(stored(store),row);
});

test('failed history/source batches roll back together and compose with an outer transaction',async t=>{
    const {store}=await fixture(t),db=store.db;
    saveHistory(store,REGION,1,history(1),iso(NOW),iso(NOW+DAY),'ESI',NOW);
    const before=stored(store);
    db.exec("CREATE TEMP TRIGGER reject_source BEFORE INSERT ON market_history_meta WHEN NEW.type_id=2 BEGIN SELECT RAISE(ABORT,'source failure'); END");
    db.exec('BEGIN');store.set('outer-work','retained');
    assert.throws(()=>saveHistories(store,REGION,[[1,history(30)],[2,history(30)]],iso(NOW),iso(NOW+DAY),'EVE Ref',NOW),/source failure/);
    assert.deepEqual(stored(store),before);assert.equal(stored(store,2),undefined);
    assert.equal(store.get('outer-work'), 'retained');db.exec('COMMIT');
    db.exec('DROP TRIGGER reject_source; BEGIN');
    saveHistories(store,REGION,[[1,history(30)],[2,history(30)]],iso(NOW),iso(NOW+DAY),'EVE Ref',NOW);
    assert.equal(stored(store,2).source,'EVE Ref');db.exec('ROLLBACK');
    assert.deepEqual(stored(store),before);assert.equal(stored(store,2),undefined);
});

test('upgrading compacts the saved window once without resetting player data or the daily archive',async t=>{
    const {dir,store}=await fixture(t);legacy(store);
    store.set('stream-layout',{name:'Keep me'});
    store.db.prepare('INSERT INTO notes VALUES(?,?,?,?)').run('keep',42,'Keep my notes',iso(NOW));
    store.db.prepare('INSERT INTO market_history_days VALUES(?,?,?,?,?,?,?,?,?)').run(REGION,1,date(NOW-365*DAY),100,200,50,10,3,iso(NOW));
    const before=stored(store),oldNote=store.db.prepare('SELECT * FROM notes').get();store.close();
    let reopened=openStore(dir);
    try{
        const after=stored(reopened),{body,...metadata}=after,{body:oldBody,...oldMetadata}=before;
        assert.deepEqual(metadata,oldMetadata);
        assert.deepEqual(JSON.parse(body),history(30));
        assert.deepEqual(reopened.get('stream-layout'),{name:'Keep me'});
        assert.deepEqual(reopened.db.prepare('SELECT * FROM notes').get(),oldNote);
        assert.equal(reopened.db.prepare('SELECT COUNT(*) n FROM market_history_days').get().n,1);
        assert.ok(reopened.db.prepare("SELECT name FROM sqlite_schema WHERE name='idx_events_character_type_at'").get());
        const applied=reopened.db.prepare("SELECT * FROM migrations WHERE id='database-v073'").get();
        reopened.close();reopened=openStore(dir);
        assert.deepEqual(stored(reopened),after);
        assert.deepEqual(reopened.db.prepare("SELECT * FROM migrations WHERE id='database-v073'").get(),applied);
    }finally{reopened.close();}
});

test('a failed cache upgrade leaves the old data and migration state intact and can be retried',async t=>{
    const {dir,store}=await fixture(t);legacy(store);const before=stored(store);
    store.db.exec("CREATE TRIGGER reject_compaction BEFORE UPDATE ON market_history BEGIN SELECT RAISE(ABORT,'compaction failure'); END");store.close();
    assert.throws(()=>openStore(dir),/compaction failure/);
    const db=new DatabaseSync(join(dir,'kairo.sqlite'));
    try{
        assert.deepEqual(stored({db}),before);
        assert.equal(db.prepare("SELECT * FROM migrations WHERE id='database-v073'").get(),undefined);
        assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name='idx_events_character_type_at'").get(),undefined);
        db.exec('DROP TRIGGER reject_compaction');
    }finally{db.close();}
    const reopened=openStore(dir);
    try{assert.equal(JSON.parse(stored(reopened).body).length,30);}finally{reopened.close();}
});

test('archive projection resumes between bounded batches and retains older daily rows',async t=>{
    const {store}=await fixture(t),db=store.db,day=date(NOW-DAY),oldDay=date(NOW-100*DAY);
    store.set('market:everef:manifest',{totals:{[day]:101},expires:NOW+DAY});
    db.prepare('INSERT INTO market_history_archives VALUES(?,?,?,?)').run(day,101,101,iso(NOW));
    const put=db.prepare('INSERT INTO market_history_days VALUES(?,?,?,?,?,?,?,?,?)');
    for(let id=1;id<=101;id++){
        for(const d of [day,oldDay])put.run(REGION,id,d,100,200,50,10,3,iso(NOW));
    }
    const archive=createHistoryArchive(store,{now:()=>NOW,fetcher:async()=>{throw new Error('Cached archives must not fetch');}});
    await assert.rejects(archive.update({check(){if(db.prepare('SELECT COUNT(*) n FROM market_history').get().n===100)throw new Error('Interrupted between batches');}}),/Interrupted between batches/);
    assert.equal(store.get('market:everef:projection',null),null);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM market_history_meta').get().n,100);
    await archive.update();
    assert.equal(db.prepare('SELECT COUNT(*) n FROM market_history').get().n,101);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM market_history_meta').get().n,101);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM market_history_days').get().n,202);
    for(const row of db.prepare('SELECT * FROM market_history').all()){
        assert.deepEqual(JSON.parse(row.body),[{date:day,average:100,highest:200,lowest:50,volume:10,order_count:3}]);
        assert.equal(row.daily_volume,10/30);
    }
    assert.ok(store.get('market:everef:projection',''));
});
