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
const result={schemaVersion:3,productionAcceptance:false,contractAcceptance:false,knownFindings:[],diagnostic:'single-process-retention-opener-control',nativeFindCapabilityProbe:'find-probe.json',source:{commit:source.sourceCommit,fingerprint:source.fingerprint},harnessSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),fixture,fixtureSha256:createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),startedAt:new Date().toISOString(),prefixes:[],pageLoads:[],checks:[],errors:[],external:[],complete:false,limitations:['Real compiled React, HTTP archive/report and SSE invalidation with synthetic durable histories and no external ESI.','Scripted React click through actual handlers; elapsed endpoints wait for two animation frames and do not claim physical input or GPU/OBS latency.','Ordinary browser heap includes garbage. Forced-GC teardown is separately labelled and follows all ordinary timing.','Archive has no application search. This Chromium window.find returns false even for a minimal visible paragraph/button (saved find-probe.json); native Find is therefore not verified. Exact full DOM text, visibility and native keyboard activation remain hard gates. Escape focus return is separately recorded as known baseline finding F6-focus-return; an observed failure keeps contract acceptance false while cardinality diagnostics continue. A future windowing proposal still needs native Find coverage on a capable browser.','Three growing prefixes expose scaling; these are not independent samples of user history frequencies.','Fetch bookkeeping and long-task observation are identical across cardinalities; retained heap includes those diagnostic arrays. Renderer metrics cover the page and are not a React-only attribution.','Archive uses 30-row offsets ordered by started DESC,id DESC; report events use 100-row offsets ordered by at,id. Neither endpoint uses an opaque cursor. Timestamp ties span both page boundaries.']};
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
const instrumentation=`(()=>{window.__archiveReads=[];window.__reportReads=[];window.__archiveKeyEvents=[];for(const type of ['keydown','keypress','keyup','click'])document.addEventListener(type,event=>{if(event.target?.closest?.('.session-card'))window.__archiveKeyEvents.push({type:event.type,key:event.key,code:event.code,keyCode:event.keyCode,charCode:event.charCode,trusted:event.isTrusted,defaultPrevented:event.defaultPrevented});},true);window.__longtasks=[];window.__gate=null;window.__activeArchive=0;window.__maxActiveArchive=0;window.__hold=path=>{let release;const wait=new Promise(done=>release=done);window.__gate={path,release,wait,held:false};};window.__release=()=>{const gate=window.__gate;window.__gate=null;gate?.release();};const fetch=window.fetch;window.fetch=async function(input,init){const url=new URL(typeof input==='string'?input:input.url,location.href),start=performance.now();if(url.pathname==='/api/sessions'){window.__activeArchive++;window.__maxActiveArchive=Math.max(window.__maxActiveArchive,window.__activeArchive);}try{const response=await fetch.call(this,input,init);const gate=window.__gate;if(gate?.path===url.pathname+url.search){gate.held=true;await gate.wait;}if(url.pathname.startsWith('/api/sessions/'))window.__reportReads.push({url:url.pathname+url.search,start,end:performance.now(),status:response.status});if(url.pathname==='/api/sessions')window.__archiveReads.push({url:url.pathname+url.search,start,end:performance.now(),status:response.status});return response;}catch(error){window.__archiveReads.push({url:url.pathname+url.search,error:String(error)});throw error;}finally{if(url.pathname==='/api/sessions')window.__activeArchive--;}};new PerformanceObserver(list=>{for(const entry of list.getEntries())window.__longtasks.push({start:entry.startTime,duration:entry.duration});}).observe({type:'longtask',buffered:true});window.__frame=()=>new Promise(requestAnimationFrame);window.__wait=async predicate=>{const start=performance.now();while(!predicate()){if(performance.now()-start>15000)throw Error('Archive condition timed out before outer CDP deadline');await window.__frame();}await window.__frame();await window.__frame();};})()`;
const more=`[...document.querySelectorAll('button')].find(e=>e.textContent==='Load earlier sessions')`;
const count=n=>`document.querySelectorAll('.session-card').length===${n}`;
async function phaseEvaluate(phase,expression){result.phase=phase;return page.evaluate(expression);}
function check(name,passed){result.checks.push({name,passed:!!passed,gate:'hard'});assert.ok(passed,name);}
function focusObservation(name,observation){const passed=observation.sameOpener&&observation.expectedLabel;result.checks.push({name,passed,gate:'known-baseline-finding',finding:'F6-focus-return',observation});if(!passed)result.knownFindings.push({id:'F6-focus-return',name,status:'open',observation});}
async function metrics(){const {metrics}=await page.call('Performance.getMetrics');return Object.fromEntries(metrics.map(row=>[row.name,row.value]));}
function delta(before,after){return Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'].map(key=>[key,after[key]-before[key]]));}
async function snapshot(){return {metrics:await metrics(),dom:await page.call('Memory.getDOMCounters'),heap:await page.call('Runtime.getHeapUsage'),layout:await page.evaluate(`({cards:document.querySelectorAll('.session-card').length,elements:document.querySelectorAll('*').length,archiveElements:document.querySelector('.session-cards').querySelectorAll('*').length,height:document.querySelector('.session-cards').getBoundingClientRect().height})`)};}
async function loadTo(target){result.phase='load-prefix-'+target;while(await page.evaluate('document.querySelectorAll(".session-card").length')<target){const before=await metrics();const sample=await page.evaluate(`(async()=>{const button=${more},old=document.querySelectorAll('.session-card').length;await window.__wait(()=>button&&!button.disabled);const start=performance.now();button.click();await window.__wait(()=>document.querySelectorAll('.session-card').length>old&&!(${more})?.disabled);return {from:old,to:document.querySelectorAll('.session-card').length,start,end:performance.now(),ms:performance.now()-start};})()`);sample.work=delta(before,await metrics());result.pageLoads.push(sample);}}
async function refresh(prefix,index){
 result.phase='refresh-'+prefix+'/'+index;
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
 result.phase='initial-mount';await page.call('Page.navigate',{url:app.origin+'/#sessions'});
 await page.waitFor(`!!document.querySelector('.connection-status.online')&&${count(30)}`);
 await page.evaluate(`window.__wait(()=>!(${more})?.disabled)`);
 result.initial=await snapshot();result.initial.openFromNavigationMs=await page.evaluate('performance.now()');
 result.limitations.push('Single-process causal retention control only. No repeated ordinary timing or optimization comparison. One explicit diagnostic opener reference is retained then deleted in the same unmounted page.');
 await loadTo(1500);check('all1500 labels present in exact fixture order',await page.evaluate(`JSON.stringify([...document.querySelectorAll('.session-card strong')].map(e=>e.textContent))===${JSON.stringify(JSON.stringify(expectedLabels))}`));
 await page.evaluate(`window.__reportOpener=document.querySelectorAll('.session-card')[1499];window.__reportOpener.focus()`);
 await page.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await page.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await page.waitFor(`!!document.querySelector('.session-report-dialog .session-summary')`);
 await page.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await page.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await page.waitFor(`!document.querySelector('.session-report-dialog')`);
 await page.call('HeapProfiler.enable');
 const collect=async()=>{for(let i=0;i<3;i++)await page.call('HeapProfiler.collectGarbage');return {heap:await page.call('Runtime.getHeapUsage'),dom:await page.call('Memory.getDOMCounters'),page:await page.evaluate(`({archiveCards:document.querySelectorAll('.session-card').length,elements:document.querySelectorAll('*').length,openerPresent:!!window.__reportOpener,openerConnected:window.__reportOpener?.isConnected??null})`)};};
 result.phase='mounted-reference';result.retention={mounted:await collect()};
 await page.evaluate(`document.querySelector('[data-route="overview"]').click()`);await page.waitFor(`!!document.querySelector('.overview-grid')&&!document.querySelector('.session-card')`);
 result.phase='unmounted-reference-held';result.retention.unmountedHeld=await collect();
 check('diagnostic retains one disconnected opener reference',result.retention.unmountedHeld.page.openerPresent&&result.retention.unmountedHeld.page.openerConnected===false);
 await page.evaluate(`delete window.__reportOpener`);result.phase='unmounted-reference-cleared';result.retention.unmountedCleared=await collect();check('diagnostic element reference cleared',!result.retention.unmountedCleared.page.openerPresent);
 await page.evaluate(`document.querySelector('[data-route="sessions"]').click()`);await page.waitFor(count(30));result.retention.remounted30=await collect();
 await page.evaluate(`document.querySelector('[data-route="overview"]').click()`);await page.waitFor(`!!document.querySelector('.overview-grid')&&!document.querySelector('.session-card')`);result.retention.unmountedAgain=await collect();
 check('archive unmounted after remount control',result.retention.unmountedAgain.page.archiveCards===0);
 const afterData={sessions:app.store.db.prepare('SELECT id,character_id,started,ended,notes FROM sessions ORDER BY id').all(),visits:app.store.db.prepare('SELECT * FROM visits ORDER BY id').all(),events:app.store.db.prepare('SELECT * FROM events ORDER BY id').all()};
 check('durable history unchanged',createHash('sha256').update(JSON.stringify(afterData)).digest('hex')===result.durableDataSha256);
 check('all labels unchanged',JSON.stringify(app.store.db.prepare('SELECT label FROM sessions WHERE character_id=42 ORDER BY started DESC,id DESC').all().map(row=>row.label))===JSON.stringify(expectedLabels));
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);await verifySource(source);assert.equal(createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),result.harnessSha256);result.sourceVerified=true;result.phase='complete';result.complete=true;
}catch(error){result.failure=error.stack;throw error;}
finally{result.cleanup=[];for(const[stage,operation]of [['browser',()=>browser?.close()],['application',()=>app?.close()],['temporary fixture',()=>rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100})]]){try{await operation();result.cleanup.push({stage,passed:true});}catch(error){result.cleanup.push({stage,passed:false,failure:error.stack});result.complete=false;process.exitCode=1;}}result.cleanupVerified=result.cleanup.every(row=>row.passed);result.endedAt=new Date().toISOString();await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');}
