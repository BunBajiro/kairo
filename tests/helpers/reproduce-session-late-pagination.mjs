// PBR-5: known open bug reproduction, deliberately outside the passing test gate.
// Run: node tests/helpers/reproduce-session-late-pagination.mjs
// Uses the real report service and SessionReport.moreEvents merge behavior.
// No external traffic, credentials or persistent user data.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {sessionReport} from '../../server/history.mjs';

const dir=await mkdtemp(join(tmpdir(),'kairo-session-late-pagination-')),store=openStore(dir);
try {
    const start=Date.now()-3600000,at=ms=>new Date(start+ms).toISOString();
    store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)')
        .run('pages',42,'Pagination reproduction',at(0),at(600000),JSON.stringify({capturedAt:at(0)}),'{}');
    const insert=store.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)');
    for(let i=1;i<=200;i++)insert.run(42,'session.note','sessions','Note '+i,'{}',at(i*1000));
    let report=sessionReport(store,'pages',42);
    const loadedInitial=report.events.length;
    const lateId=Number(insert.run(42,'killmail.kill','combat','Delayed published killmail','{}',at(500)).lastInsertRowid);
    const offsets=[];
    while(report.more) {
        offsets.push(report.events.length);
        const next=sessionReport(store,'pages',42,report.events.length);
        const events=[...new Map([...report.events,...next.events].map(event=>[event.id,event])).values()];
        report={...next,events};
    }
    const result={loadedInitial,offsets,statsEvents:report.stats.events,loadedEvents:report.events.length,more:report.more,
        lateEventLoaded:report.events.some(event=>event.id===lateId),
        lateEventPresentAfterRefresh:sessionReport(store,'pages',42).events.some(event=>event.id===lateId)};
    console.log(JSON.stringify(result));
    assert.deepEqual(result,{loadedInitial:100,offsets:[100,199],statsEvents:201,loadedEvents:200,more:false,
        lateEventLoaded:false,lateEventPresentAfterRefresh:true},'Known PBR-5 behavior changed; replace this reproducer with a regression for the corrected paging contract.');
} finally {store.close();await rm(dir,{recursive:true,force:true});}
