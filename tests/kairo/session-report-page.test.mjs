import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {sessionReport} from '../../server/history.mjs';
import {loadSessionReportPage} from '../../components/kairo/session-report-page.mjs';
import {sessionEventWindow} from '../../server/session-event-window.mjs';

async function fixture(t) {
    const dir=await mkdtemp(join(tmpdir(),'kairo-report-page-')),store=openStore(dir);
    t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});
    const start=Date.now()-3600000,at=ms=>new Date(start+ms).toISOString();
    store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)')
        .run('pages',42,'Pages',at(0),at(600000),JSON.stringify({capturedAt:at(0)}),'{}');
    const insert=store.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)');
    for(let i=1;i<=200;i++)insert.run(42,'session.note','sessions','Note '+i,'{}',at(i*1000));
    return {store,at,read:(offset,paging)=>sessionReport(store,'pages',42,offset,paging),late:()=>Number(insert.run(42,'killmail.kill','combat','Delayed killmail','{}',at(500)).lastInsertRowid)};
}

test('unchanged report appends its next page with one read',async t=>{
    const f=await fixture(t),first=f.read(0),reads=[];
    const next=await loadSessionReportPage(first,(offset,paging)=>{reads.push({offset,...paging});return f.read(offset,paging);});
    assert.deepEqual(reads,[{offset:100,eventCursor:first.eventCursor,eventEnd:first.eventEnd}]);
    assert.equal(next.events.length,200);assert.equal(next.more,false);
    assert.equal(new Set(next.events.map(event=>event.id)).size,200);
});

test('late killmail cannot shift pages; the existing Refresh acquires a complete newer snapshot',async t=>{
    const f=await fixture(t),first=f.read(0),late=f.late(),reads=[];
    const appended=await loadSessionReportPage(first,(offset,paging)=>{reads.push(offset);return f.read(offset,paging);});
    assert.deepEqual(reads,[100]);assert.equal(appended.events.length,200);assert.equal(appended.stats.events,200);assert.equal(appended.more,false);
    assert.equal(appended.events.some(event=>event.id===late),false);
    assert.equal(new Set(appended.events.map(event=>event.id)).size,200);
    let report=f.read(0);assert.equal(report.events[0].id,late);
    while(report.more)report=await loadSessionReportPage(report,f.read);
    assert.equal(report.events.length,201);assert.equal(report.stats.events,201);assert.equal(report.more,false);
    assert.equal(new Set(report.events.map(event=>event.id)).size,201);
});

test('live snapshot bounds its event time and retains original summary/source projections on append',async t=>{
    const f=await fixture(t);f.store.db.prepare('UPDATE sessions SET ended=NULL WHERE id=?').run('pages');
    const first=f.read(0);f.late();
    const next=await loadSessionReportPage(first,(offset,paging)=>{
        assert.equal(paging.eventEnd,first.eventEnd);
        return {...f.read(offset,paging),durationSeconds:999999,personalCombat:{newerSource:true}};
    });
    assert.equal(next.eventEnd,first.eventEnd);assert.equal(next.durationSeconds,first.durationSeconds);
    assert.equal(next.personalCombat,first.personalCombat);assert.equal(next.stats,first.stats);
});

test('obsolete load-more scope cannot publish a late page',async t=>{
    const f=await fixture(t),first=f.read(0);let current=true,reads=0;
    assert.equal(await loadSessionReportPage(first,(offset,paging)=>{reads++;current=false;return f.read(offset,paging);},()=>current),null);
    assert.equal(reads,1);
});

test('failed page preserves the original report and supports the same snapshot retry',async t=>{
    const f=await fixture(t),first=f.read(0),ids=first.events.map(event=>event.id);f.late();
    await assert.rejects(loadSessionReportPage(first,()=>{throw new Error('Temporary failure');}),/Temporary failure/);
    assert.deepEqual(first.events.map(event=>event.id),ids);
    const retry=await loadSessionReportPage(first,f.read);assert.equal(retry.stats.events,200);assert.equal(retry.events.length,200);
});

test('report snapshots reject invalid cursors and times and still enforce pilot ownership',async t=>{
    const f=await fixture(t),first=f.read(0);
    for(const eventCursor of [-1,0.5,Infinity,NaN,Number.MAX_SAFE_INTEGER,first.eventCursor+1])assert.throws(()=>f.read(100,{eventCursor}),/valid session event snapshot/);
    for(const eventEnd of ['invalid',f.at(-1),f.at(600001)])assert.throws(()=>f.read(100,{eventEnd}),/valid session event snapshot/);
    assert.throws(()=>sessionReport(f.store,'pages',43,100,{eventCursor:first.eventCursor,eventEnd:first.eventEnd}),/not found for this character/);
    assert.equal(f.read(0).events.length,100,'Legacy callers without snapshot fields remain supported');
});

test('snapshot capture uses the row-id maximum and page reads retain the bounded event index',async t=>{
    const f=await fixture(t),first=f.read(0),session=f.store.db.prepare('SELECT * FROM sessions WHERE id=?').get('pages');
    const maximum=f.store.db.prepare('EXPLAIN QUERY PLAN SELECT COALESCE(MAX(id),0) id FROM events').all();
    assert.ok(maximum.some(row=>row.detail==='SEARCH events'),JSON.stringify(maximum));
    assert.ok(!maximum.some(row=>row.detail.startsWith('SCAN ')),JSON.stringify(maximum));
    const {where,params}=sessionEventWindow(session,JSON.parse(session.start_context),{},first.eventEnd,{eventCursor:first.eventCursor});
    const page=f.store.db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM events WHERE ${where} ORDER BY at,id LIMIT 101 OFFSET ?`).all(...params,100);
    assert.ok(page.some(row=>row.detail.includes('idx_events_character_at')&&row.detail.includes('at>')&&row.detail.includes('at<')),JSON.stringify(page));
});
