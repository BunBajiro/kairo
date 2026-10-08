// Compiled cardinality diagnostic; caller owns /tmp/kairo-performance.lock.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromeProcess} from '../../../../../rc16/historical/tests/performance/chrome.mjs';
import {loadSourceManifest,verifySource} from '../../../../harness/source-manifest.mjs';
const [repoArg,outputArg,manifestArg]=process.argv.slice(2),repo=resolve(repoArg),output=resolve(outputArg);
assert.equal(process.env.KAIRO_ARCHIVE_LOCKED,'1');
const source=await loadSourceManifest(manifestArg,repo);
assert.ok(source.builtFiles.length);
const {openStore}=await import(pathToFileURL(join(repo,'server/store.mjs'))),{startKairo}=await import(pathToFileURL(join(repo,'server/index.mjs')));
const fixture={pilots:[42,43],prefixes:[30,300,1500],pageSize:30,sessions:1500,visitsPerSession:3,anchor:'2026-09-01T12:00:00.000Z',sessionsPerTimestamp:7,eventsPerSelectedReport:270,eventTimestampTieWidth:150},id=i=>'archive-'+String(fixture.sessions-i).padStart(5,'0'),label=i=>'Archive operation '+String(i).padStart(5,'0')+' · Fleet debrief';
const expectedLabels=Array.from({length:fixture.sessions},(_,i)=>label(i));
const result={schemaVersion:1,source:{commit:source.sourceCommit,fingerprint:source.fingerprint},harnessSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),fixture,fixtureSha256:createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),startedAt:new Date().toISOString(),prefixes:[],pageLoads:[],checks:[],errors:[],external:[],complete:false,limitations:['Real compiled React, HTTP archive/report and SSE invalidation with synthetic durable histories and no external ESI.','Scripted React click through actual handlers; elapsed endpoints wait for two animation frames and do not claim physical input or GPU/OBS latency.','Ordinary browser heap includes garbage. Forced-GC teardown is separately labelled and follows all ordinary timing.','Archive has no application search; native browser window.find checks reachability of loaded text only.','Three growing prefixes expose scaling; these are not independent samples of user history frequencies.','Fetch bookkeeping and long-task observation are identical across cardinalities; retained heap includes those diagnostic arrays. Renderer metrics cover the page and are not a React-only attribution.','Archive uses 30-row offsets ordered by started DESC,id DESC; report events use 100-row offsets ordered by at,id. Neither endpoint uses an opaque cursor. Timestamp ties span both page boundaries.']};
const dir=await mkdtemp(join(tmpdir(),'kairo-archive-ui-')),dataDir=join(dir,'data');
let app,browser,page;
const ready=data=>({status:'ready',data,updatedAt:fixture.anchor,expiresAt:'2099-01-01T00:00:00.000Z'}),store=openStore(dataDir);
for(const pilot of fixture.pilots){
 store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(pilot,'Archive Pilot '+pilot,'[]','synthetic-unusable-token');
 for(const [key,data] of Object.entries({profile:{character_id:pilot,name:'Archive Pilot '+pilot},wallet:500000,skills:{total_sp:1000,skills:[]},journal:[],queue:[],assets:[],mining:[],jobs:[],killmails:[]}))store.saveSnapshot(pilot,key,ready(data));
}
const addSession=store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,notes) VALUES(?,?,?,?,?,?)'),addVisit=store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)');
store.db.exec('BEGIN');
for(let i=0;i<fixture.sessions;i++){
 const start=Date.parse(fixture.anchor)-Math.floor(i/fixture.sessionsPerTimestamp)*86400000;
 addSession.run(id(i),42,label(i),new Date(start).toISOString(),new Date(start+1800000).toISOString(),'Preserved debrief '+i);
 for(let v=0;v<3;v++)addVisit.run(42,[30000142,30000144,30000142][v],['Jita','Perimeter','Jita'][v],new Date(start+v*600000).toISOString(),id(i));
}
const addEvent=store.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at,dedupe) VALUES(?,?,?,?,?,?,?)');
for(const prefix of fixture.prefixes)for(let e=0;e<fixture.eventsPerSelectedReport;e++){
 const index=prefix-1,start=Date.parse(fixture.anchor)-Math.floor(index/fixture.sessionsPerTimestamp)*86400000;
 addEvent.run(42,'location.changed','pilot','Archive event '+String(e).padStart(4,'0'),JSON.stringify({session_id:id(index),solar_system_id:30000142}),new Date(start+60000+Math.floor(e/fixture.eventTimestampTieWidth)*60000).toISOString(),'archive-event-'+prefix+'-'+e);
}
const preservedData=()=>({sessions:store.db.prepare('SELECT id,character_id,started,ended,notes FROM sessions ORDER BY id').all(),visits:store.db.prepare('SELECT * FROM visits ORDER BY id').all(),events:store.db.prepare('SELECT * FROM events ORDER BY id').all()});
addSession.run('other-pilot',43,'Other pilot private session',fixture.anchor,new Date(Date.parse(fixture.anchor)+1800000).toISOString(),'Private');store.db.exec('COMMIT');const beforeData=preservedData();result.durableDataSha256=createHash('sha256').update(JSON.stringify(beforeData)).digest('hex');store.close();
const instrumentation=`(()=>{window.__archiveReads=[];window.__reportReads=[];window.__longtasks=[];window.__gate=null;window.__activeArchive=0;window.__maxActiveArchive=0;window.__hold=path=>{let release;const wait=new Promise(done=>release=done);window.__gate={path,release,wait,held:false};};window.__release=()=>{const gate=window.__gate;window.__gate=null;gate?.release();};const fetch=window.fetch;window.fetch=async function(input,init){const url=new URL(typeof input==='string'?input:input.url,location.href),start=performance.now();if(url.pathname==='/api/sessions'){window.__activeArchive++;window.__maxActiveArchive=Math.max(window.__maxActiveArchive,window.__activeArchive);}try{const response=await fetch.call(this,input,init);const gate=window.__gate;if(gate?.path===url.pathname+url.search){gate.held=true;await gate.wait;}if(url.pathname.startsWith('/api/sessions/'))window.__reportReads.push({url:url.pathname+url.search,start,end:performance.now(),status:response.status});if(url.pathname==='/api/sessions')window.__archiveReads.push({url:url.pathname+url.search,start,end:performance.now(),status:response.status});return response;}catch(error){window.__archiveReads.push({url:url.pathname+url.search,error:String(error)});throw error;}finally{if(url.pathname==='/api/sessions')window.__activeArchive--;}};new PerformanceObserver(list=>{for(const entry of list.getEntries())window.__longtasks.push({start:entry.startTime,duration:entry.duration});}).observe({type:'longtask',buffered:true});window.__frame=()=>new Promise(requestAnimationFrame);window.__wait=async predicate=>{const start=performance.now();while(!predicate()){if(performance.now()-start>30000)throw Error('Archive condition timed out');await window.__frame();}await window.__frame();await window.__frame();};})()`;
const more=`[...document.querySelectorAll('button')].find(e=>e.textContent==='Load earlier sessions')`;
const count=n=>`document.querySelectorAll('.session-card').length===${n}`;
function check(name,passed){result.checks.push({name,passed:!!passed});assert.ok(passed,name);}
async function metrics(){const {metrics}=await page.call('Performance.getMetrics');return Object.fromEntries(metrics.map(row=>[row.name,row.value]));}
function delta(before,after){return Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'].map(key=>[key,after[key]-before[key]]));}
async function snapshot(){return {metrics:await metrics(),dom:await page.call('Memory.getDOMCounters'),heap:await page.call('Runtime.getHeapUsage'),layout:await page.evaluate(`({cards:document.querySelectorAll('.session-card').length,elements:document.querySelectorAll('*').length,archiveElements:document.querySelector('.session-cards').querySelectorAll('*').length,height:document.querySelector('.session-cards').getBoundingClientRect().height})`)};}
async function loadTo(target){while(await page.evaluate('document.querySelectorAll(".session-card").length')<target){const before=await metrics();const sample=await page.evaluate(`(async()=>{const button=${more},old=document.querySelectorAll('.session-card').length;await window.__wait(()=>button&&!button.disabled);const start=performance.now();button.click();await window.__wait(()=>document.querySelectorAll('.session-card').length>old&&!(${more})?.disabled);return {from:old,to:document.querySelectorAll('.session-card').length,start,end:performance.now(),ms:performance.now()-start};})()`);sample.work=delta(before,await metrics());result.pageLoads.push(sample);}}
async function refresh(prefix,index){
 const renamed='Refreshed '+prefix+' '+index,oldest=id(prefix-1),before=await metrics();
 app.store.db.prepare('UPDATE sessions SET label=? WHERE id=?').run(renamed,oldest);
 expectedLabels[prefix-1]=renamed;
 await page.evaluate('window.__refreshStart=performance.now();window.__refreshReadStart=window.__archiveReads.length');
 app.core.changed({characterId:42,resources:['sessions']});
 const sample=await page.evaluate(`(async()=>{await window.__wait(()=>document.querySelectorAll('.session-card').length===${prefix}&&document.querySelectorAll('.session-card')[${prefix-1}]?.textContent.includes(${JSON.stringify(renamed)})&&!(${more})?.disabled);return {start:window.__refreshStart,end:performance.now(),ms:performance.now()-window.__refreshStart,reads:window.__archiveReads.slice(window.__refreshReadStart)};})()`);
 sample.work=delta(before,await metrics());check('refresh '+prefix+'/'+index+' reads complete loaded prefix',sample.reads.length===prefix/30&&sample.reads.every((read,i)=>new URL(read.url,'http://fixture').searchParams.get('offset')===String(i*30)));return sample;
}
try{
 const deny=async url=>{result.external.push(String(url));throw Error('External traffic disabled by archive fixture');};
 app=await startKairo({port:18754,streamPort:18755,dataDir,noSync:true,deferDatasetStart:true,fetcher:deny,universe:{operations:{noSync:true,fetcher:deny},feeds:{noSync:true,fetcher:deny}}});
 browser=await chromeProcess();page=await browser.page();result.browser=browser.version;
 page.on(event=>{if(event.method==='Runtime.exceptionThrown')result.errors.push(event.params.exceptionDetails.exception?.description||event.params.exceptionDetails.text);});
 for(const method of ['Page.enable','Runtime.enable','Network.enable','Performance.enable'])await page.call(method);
 await page.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await page.call('Network.setBlockedURLs',{urls:['https://*','http://images.evetech.net/*','http://web.ccpgamescdn.com/*']});
 await page.call('Page.addScriptToEvaluateOnNewDocument',{source:instrumentation});
 await page.call('Page.navigate',{url:app.origin+'/#sessions'});
 await page.waitFor(`!!document.querySelector('.connection-status.online')&&${count(30)}`);
 await page.evaluate(`window.__wait(()=>!(${more})?.disabled)`);
 result.initial=await snapshot();result.initial.openFromNavigationMs=await page.evaluate('performance.now()');
 for(const prefix of fixture.prefixes){
  await loadTo(prefix);const row={prefix,before:await snapshot(),refresh:[],scroll:[],find:[],selection:[]};result.prefixes.push(row);
  check('exact ordered loaded prefix '+prefix,await page.evaluate(`JSON.stringify([...document.querySelectorAll('.session-card strong')].map(e=>e.textContent))===${JSON.stringify(JSON.stringify(expectedLabels.slice(0,prefix)))}`));
  for(let repetition=0;repetition<3;repetition++)row.refresh.push(await refresh(prefix,repetition));
  for(let repetition=0;repetition<3;repetition++){
   const before=await metrics();row.scroll.push(await page.evaluate(`(async()=>{const cards=document.querySelectorAll('.session-card'),times=[];let prior=performance.now();const start=prior;for(let step=0;step<60;step++){cards[Math.round((cards.length-1)*step/59)].scrollIntoView({block:'center',behavior:'instant'});await window.__frame();const now=performance.now();times.push(now-prior);prior=now;}return {start,end:performance.now(),frameIntervals:times};})()`));row.scroll.at(-1).work=delta(before,await metrics());
   row.find.push(await page.evaluate(`(async()=>{window.getSelection().removeAllRanges();window.scrollTo(0,0);const start=performance.now(),found=window.find(${JSON.stringify('Refreshed '+prefix+' 2')},false,false,true);await window.__frame();await window.__frame();return {start,end:performance.now(),found,selected:window.getSelection().toString(),ms:performance.now()-start};})()`));
  }
  check('browser find reaches oldest loaded label '+prefix,row.find.every(sample=>sample.found&&sample.selected==='Refreshed '+prefix+' 2'));
  check('archive has no application search control '+prefix,await page.evaluate(`![...document.querySelector('.session-cards').parentElement.querySelectorAll('input')].some(input=>/search/i.test(input.placeholder+' '+input.getAttribute('aria-label')))`));
  for(let repetition=0;repetition<2;repetition++){
   const beforeSelection=await metrics();await page.evaluate('window.__reportReadStart=window.__reportReads.length');row.selection.push(await page.evaluate(`(async()=>{window.getSelection().removeAllRanges();const cards=document.querySelectorAll('.session-card'),start=performance.now();cards[cards.length-1].focus();cards[cards.length-1].click();await window.__wait(()=>!!document.querySelector('.session-report-dialog .session-summary'));return {start,end:performance.now(),ms:performance.now()-start,label:document.querySelector('.report-title input').value};})()`));
   row.selection.at(-1).work=delta(beforeSelection,await metrics());
   check('oldest report selected '+prefix+'/'+repetition,row.selection.at(-1).label==='Refreshed '+prefix+' 2');
   await page.evaluate(`(async()=>{document.querySelector('.session-detail-card[data-card="route"]').click();await window.__wait(()=>document.querySelectorAll('.session-route-list>li').length===3);})()`);
   check('complete three-visit timed loop in oldest report '+prefix+'/'+repetition,await page.evaluate(`document.querySelectorAll('.session-route-list>li').length===3&&document.querySelector('.session-route-list').textContent.includes('Perimeter')`));
   // An archive invalidation must not collapse report detail state or select a different report.
   const marker='Refresh while report expanded '+prefix+'/'+repetition;
   expectedLabels[0]=marker;app.store.db.prepare('UPDATE sessions SET label=? WHERE id=?').run(marker,id(0));
   app.core.changed({characterId:42,resources:['sessions']});
   await page.evaluate(`window.__wait(()=>document.querySelector('.session-card strong')?.textContent===${JSON.stringify(marker)}&&!(${more})?.disabled)`);
   check('archive refresh preserves expanded report '+prefix+'/'+repetition,await page.evaluate(`!!document.querySelector('.session-expanded-panel[data-card="route"]')&&document.querySelectorAll('.session-route-list>li').length===3&&document.querySelector('.report-title input').value===${JSON.stringify('Refreshed '+prefix+' 2')}`));
   // The report owns a separate paginated event history. Timestamp ties span the100-row page boundary.
   await page.evaluate(`(async()=>{document.querySelector('.session-detail-card[data-card="timeline"]').click();await window.__wait(()=>document.querySelectorAll('.report-events>article').length===100);while(document.querySelectorAll('.report-events>article').length<${fixture.eventsPerSelectedReport}){const button=[...document.querySelectorAll('button')].find(e=>e.textContent==='Load more session events');await window.__wait(()=>button&&!button.disabled);button.click();const old=document.querySelectorAll('.report-events>article').length;await window.__wait(()=>document.querySelectorAll('.report-events>article').length>old);}})()`);
   check('report event pagination preserves timestamp ties '+prefix+'/'+repetition,await page.evaluate(`JSON.stringify([...document.querySelectorAll('.report-events>article strong')].map(e=>e.textContent))===${JSON.stringify(JSON.stringify(Array.from({length:fixture.eventsPerSelectedReport},(_,e)=>'Archive event '+String(e).padStart(4,'0'))))}`));
   row.selection.at(-1).reads=await page.evaluate('window.__reportReads.slice(window.__reportReadStart)');
   check('report loads exact successive event offsets '+prefix+'/'+repetition,JSON.stringify(row.selection.at(-1).reads.map(read=>Number(new URL(read.url,'http://fixture').searchParams.get('offset')||0)))===JSON.stringify([0,100,200]));
   const reportMarker='Published with expanded event history '+prefix+'/'+repetition;expectedLabels[0]=reportMarker;app.store.db.prepare('UPDATE sessions SET label=? WHERE id=?').run(reportMarker,id(0));app.core.changed({characterId:42,resources:['sessions']});
   await page.evaluate(`window.__wait(()=>document.querySelector('.session-card strong')?.textContent===${JSON.stringify(reportMarker)}&&!(${more})?.disabled)`);
   check('archive publication preserves fully loaded report history '+prefix+'/'+repetition,await page.evaluate(`document.querySelectorAll('.report-events>article').length===${fixture.eventsPerSelectedReport}&&!!document.querySelector('.session-expanded-panel[data-card="timeline"]')`));
   await page.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await page.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
   await page.waitFor(`!document.querySelector('.session-report-dialog')`);
   await page.evaluate(`window.__wait(()=>!(${more})?.disabled)`);
  }
  row.after=await snapshot();check('report close retains entire ordered loaded prefix '+prefix,row.after.layout.cards===prefix&&await page.evaluate(`JSON.stringify([...document.querySelectorAll('.session-card strong')].map(e=>e.textContent))===${JSON.stringify(JSON.stringify(expectedLabels.slice(0,prefix)))}`));
 }
 check('exhausted archive has no load-more',await page.evaluate(`!(${more})`));
 // Hold one completed HTTP response to exercise real same-pilot publication order outside timed rows.
 await page.evaluate(`window.__hold('/api/sessions?character=42&offset=0')`);app.core.changed({characterId:42,resources:['sessions']});await page.waitFor('window.__gate?.held');
 const newest='Latest publication wins after superseded response';expectedLabels[0]=newest;app.store.db.prepare('UPDATE sessions SET label=? WHERE id=?').run(newest,id(0));app.core.changed({characterId:42,resources:['sessions']});await new Promise(resolve=>setTimeout(resolve,100));await page.evaluate('window.__release()');
 await page.waitFor(`document.querySelector('.session-card strong')?.textContent===${JSON.stringify(newest)}&&window.__activeArchive===0`);
 check('same-pilot stale response cannot replace newest full prefix',await page.evaluate(`document.querySelectorAll('.session-card').length===${fixture.sessions}&&window.__maxActiveArchive===1`));
 check('all labels remain in exact timestamp/id order after publication',await page.evaluate(`JSON.stringify([...document.querySelectorAll('.session-card strong')].map(e=>e.textContent))===${JSON.stringify(JSON.stringify(expectedLabels))}`));
 const afterData={sessions:app.store.db.prepare('SELECT id,character_id,started,ended,notes FROM sessions ORDER BY id').all(),visits:app.store.db.prepare('SELECT * FROM visits ORDER BY id').all(),events:app.store.db.prepare('SELECT * FROM events ORDER BY id').all()};
 check('durable session/visit/event evidence unchanged apart from deliberate labels',createHash('sha256').update(JSON.stringify(afterData)).digest('hex')===result.durableDataSha256);

 result.longtasks=await page.evaluate('window.__longtasks');
 result.reportReads=await page.evaluate('window.__reportReads');
 // Every ordinary sample above precedes explicit collection.
 await page.call('HeapProfiler.enable');for(let i=0;i<3;i++)await page.call('HeapProfiler.collectGarbage');result.retention={mounted:await snapshot()};
 await page.evaluate(`document.querySelector('[data-route="overview"]').click()`);await page.waitFor(`!!document.querySelector('.overview-grid')&&!document.querySelector('.session-card')`);for(let i=0;i<3;i++)await page.call('HeapProfiler.collectGarbage');
 result.retention.unmounted={metrics:await metrics(),heap:await page.call('Runtime.getHeapUsage'),dom:await page.call('Memory.getDOMCounters')};
 await page.evaluate(`document.querySelector('[data-route="sessions"]').click()`);await page.waitFor(count(30));for(let i=0;i<3;i++)await page.call('HeapProfiler.collectGarbage');result.retention.remounted=await snapshot();
 check('remount returns to initial page and preserves history on server',result.retention.remounted.layout.cards===30&&app.store.db.prepare('SELECT count(*) n FROM sessions WHERE character_id=42').get().n===1500);
 await page.evaluate(`document.querySelector('[data-route="overview"]').click()`);await page.waitFor(`!!document.querySelector('.overview-grid')&&!document.querySelector('.session-card')`);for(let i=0;i<3;i++)await page.call('HeapProfiler.collectGarbage');result.retention.unmountedAgain={metrics:await metrics(),heap:await page.call('Runtime.getHeapUsage'),dom:await page.call('Memory.getDOMCounters')};
 await page.evaluate(`document.querySelector('[data-route="sessions"]').click()`);await page.waitFor(count(30));
 check('source archive cards remain native keyboard-accessible buttons',await page.evaluate(`document.querySelectorAll('button.session-card').length===30`));
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);await verifySource(source);assert.equal(createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),result.harnessSha256);result.sourceVerified=true;result.complete=true;
}catch(error){result.failure=error.stack;if(page)result.failureState=await page.evaluate('({url:location.href,body:document.body.innerText.slice(-5000),reads:window.__archiveReads?.slice(-10)})').catch(()=>null);throw error;}
finally{try{await browser?.close();await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});result.cleanupVerified=true;}catch(error){result.cleanupFailure=error.stack;result.complete=false;process.exitCode=1;}result.endedAt=new Date().toISOString();await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');}
