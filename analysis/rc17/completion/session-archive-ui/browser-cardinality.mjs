// Compiled cardinality diagnostic; caller owns /tmp/kairo-performance.lock.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromeProcess} from '../../../rc16/historical/tests/performance/chrome.mjs';
import {loadSourceManifest,verifySource} from '../../harness/source-manifest.mjs';
const [repoArg,outputArg,manifestArg]=process.argv.slice(2),repo=resolve(repoArg),output=resolve(outputArg);
assert.equal(process.env.KAIRO_ARCHIVE_LOCKED,'1');
const source=await loadSourceManifest(manifestArg,repo);
assert.ok(source.builtFiles.length);
const {openStore}=await import(pathToFileURL(join(repo,'server/store.mjs'))),{startKairo}=await import(pathToFileURL(join(repo,'server/index.mjs')));
const fixture={pilots:[42,43],prefixes:[30,300,1500],pageSize:30,sessions:1500,visitsPerSession:3,anchor:'2026-09-01T12:00:00.000Z'},id=i=>'archive-'+String(i).padStart(5,'0'),label=i=>'Archive operation '+String(i).padStart(5,'0')+' · Fleet debrief';
const expectedLabels=Array.from({length:fixture.sessions},(_,i)=>label(i));
const result={schemaVersion:1,source:{commit:source.sourceCommit,fingerprint:source.fingerprint},harnessSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),fixture,fixtureSha256:createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),startedAt:new Date().toISOString(),prefixes:[],pageLoads:[],checks:[],errors:[],external:[],complete:false,limitations:['Real compiled React, HTTP archive/report and SSE invalidation with synthetic durable histories and no external ESI.','Scripted React click through actual handlers; elapsed endpoints wait for two animation frames and do not claim physical input or GPU/OBS latency.','Ordinary browser heap includes garbage. Forced-GC teardown is separately labelled and follows all ordinary timing.','Archive has no application search; native browser window.find checks reachability of loaded text only.','Three growing prefixes expose scaling; these are not independent samples of user history frequencies.']};
const dir=await mkdtemp(join(tmpdir(),'kairo-archive-ui-')),dataDir=join(dir,'data');
let app,browser,page;
const ready=data=>({status:'ready',data,updatedAt:fixture.anchor,expiresAt:'2099-01-01T00:00:00.000Z'}),store=openStore(dataDir);
for(const pilot of fixture.pilots){
 store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(pilot,'Archive Pilot '+pilot,'[]','synthetic-unusable-token');
 for(const [key,data] of Object.entries({profile:{character_id:pilot,name:'Archive Pilot '+pilot},wallet:500000,skills:{total_sp:1000,skills:[]},journal:[],queue:[],assets:[],mining:[],jobs:[],killmails:[]}))store.saveSnapshot(pilot,key,ready(data));
}
const addSession=store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,notes) VALUES(?,?,?,?,?,?)'),addVisit=store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)');
for(let i=0;i<fixture.sessions;i++){
 const start=Date.parse(fixture.anchor)-i*86400000;
 addSession.run(id(i),42,label(i),new Date(start).toISOString(),new Date(start+1800000).toISOString(),'Preserved debrief '+i);
 for(let v=0;v<3;v++)addVisit.run(42,[30000142,30000144,30000142][v],['Jita','Perimeter','Jita'][v],new Date(start+v*600000).toISOString(),id(i));
}
addSession.run('other-pilot',43,'Other pilot private session',fixture.anchor,new Date(Date.parse(fixture.anchor)+1800000).toISOString(),'Private');store.close();
const instrumentation=`(()=>{window.__archiveReads=[];window.__longtasks=[];const fetch=window.fetch;window.fetch=async function(input,init){const url=new URL(typeof input==='string'?input:input.url,location.href),start=performance.now();try{const response=await fetch.call(this,input,init);if(url.pathname==='/api/sessions')window.__archiveReads.push({url:url.pathname+url.search,start,end:performance.now(),status:response.status});return response;}catch(error){window.__archiveReads.push({url:url.pathname+url.search,error:String(error)});throw error;}};new PerformanceObserver(list=>{for(const entry of list.getEntries())window.__longtasks.push({start:entry.startTime,duration:entry.duration});}).observe({type:'longtask',buffered:true});window.__frame=()=>new Promise(requestAnimationFrame);window.__wait=async predicate=>{const start=performance.now();while(!predicate()){if(performance.now()-start>30000)throw Error('Archive condition timed out');await window.__frame();}await window.__frame();await window.__frame();};})()`;
const more=`[...document.querySelectorAll('button')].find(e=>e.textContent==='Load earlier sessions')`;
const count=n=>`document.querySelectorAll('.session-card').length===${n}`;
function check(name,passed){result.checks.push({name,passed:!!passed});assert.ok(passed,name);}
async function metrics(){const {metrics}=await page.call('Performance.getMetrics');return Object.fromEntries(metrics.map(row=>[row.name,row.value]));}
function delta(before,after){return Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'].map(key=>[key,after[key]-before[key]]));}
async function snapshot(){return {metrics:await metrics(),dom:await page.call('Memory.getDOMCounters'),layout:await page.evaluate(`({cards:document.querySelectorAll('.session-card').length,elements:document.querySelectorAll('*').length,archiveElements:document.querySelector('.session-cards').querySelectorAll('*').length,height:document.querySelector('.session-cards').getBoundingClientRect().height})`)};}
async function loadTo(target){while(await page.evaluate('document.querySelectorAll(".session-card").length')<target){const sample=await page.evaluate(`(async()=>{const button=${more},old=document.querySelectorAll('.session-card').length;await window.__wait(()=>button&&!button.disabled);const start=performance.now();button.click();await window.__wait(()=>document.querySelectorAll('.session-card').length>old&&!(${more})?.disabled);return {from:old,to:document.querySelectorAll('.session-card').length,ms:performance.now()-start};})()`);result.pageLoads.push(sample);}}
async function refresh(prefix,index){
 const renamed='Refreshed '+prefix+' '+index,oldest=id(prefix-1),before=await metrics();
 app.store.db.prepare('UPDATE sessions SET label=? WHERE id=?').run(renamed,oldest);
 expectedLabels[prefix-1]=renamed;
 await page.evaluate('window.__refreshStart=performance.now();window.__refreshReadStart=window.__archiveReads.length');
 app.core.changed({characterId:42,resources:['sessions']});
 const sample=await page.evaluate(`(async()=>{await window.__wait(()=>document.querySelectorAll('.session-card').length===${prefix}&&document.querySelectorAll('.session-card')[${prefix-1}]?.textContent.includes(${JSON.stringify(renamed)})&&!(${more})?.disabled);return {ms:performance.now()-window.__refreshStart,reads:window.__archiveReads.slice(window.__refreshReadStart)};})()`);
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
 result.initial=await snapshot();
 for(const prefix of fixture.prefixes){
  await loadTo(prefix);const row={prefix,before:await snapshot(),refresh:[],scroll:[],find:[],selection:[]};result.prefixes.push(row);
  check('exact ordered loaded prefix '+prefix,await page.evaluate(`JSON.stringify([...document.querySelectorAll('.session-card strong')].map(e=>e.textContent))===${JSON.stringify(JSON.stringify(expectedLabels.slice(0,prefix)))}`));
  for(let repetition=0;repetition<3;repetition++)row.refresh.push(await refresh(prefix,repetition));
  for(let repetition=0;repetition<3;repetition++){
   const before=await metrics();row.scroll.push(await page.evaluate(`(async()=>{const cards=document.querySelectorAll('.session-card'),times=[];let prior=performance.now();for(let step=0;step<60;step++){cards[Math.round((cards.length-1)*step/59)].scrollIntoView({block:'center',behavior:'instant'});await window.__frame();const now=performance.now();times.push(now-prior);prior=now;}return {frameIntervals:times};})()`));row.scroll.at(-1).work=delta(before,await metrics());
   row.find.push(await page.evaluate(`(async()=>{window.getSelection().removeAllRanges();window.scrollTo(0,0);const start=performance.now(),found=window.find(${JSON.stringify('Refreshed '+prefix+' 2')},false,false,true);await window.__frame();await window.__frame();return {found,selected:window.getSelection().toString(),ms:performance.now()-start};})()`));
  }
  check('browser find reaches oldest loaded label '+prefix,row.find.every(sample=>sample.found&&sample.selected==='Refreshed '+prefix+' 2'));
  check('archive has no application search control '+prefix,await page.evaluate(`![...document.querySelector('.session-cards').parentElement.querySelectorAll('input')].some(input=>/search/i.test(input.placeholder+' '+input.getAttribute('aria-label')))`));
  for(let repetition=0;repetition<2;repetition++){
   row.selection.push(await page.evaluate(`(async()=>{window.getSelection().removeAllRanges();const cards=document.querySelectorAll('.session-card'),start=performance.now();cards[cards.length-1].click();await window.__wait(()=>!!document.querySelector('.session-report-dialog .session-summary'));return {ms:performance.now()-start,label:document.querySelector('.report-title input').value};})()`));
   check('oldest report selected '+prefix+'/'+repetition,row.selection.at(-1).label==='Refreshed '+prefix+' 2');
   await page.evaluate(`(async()=>{document.querySelector('.session-detail-card[data-card="route"]').click();await window.__wait(()=>document.querySelectorAll('.session-route-list>li').length===3);})()`);
   check('complete three-visit timed loop in oldest report '+prefix+'/'+repetition,await page.evaluate(`document.querySelectorAll('.session-route-list>li').length===3&&document.querySelector('.session-route-list').textContent.includes('Perimeter')`));
   // An archive invalidation must not collapse report detail state or select a different report.
   const marker='Refresh while report expanded '+prefix+'/'+repetition;
   expectedLabels[0]=marker;app.store.db.prepare('UPDATE sessions SET label=? WHERE id=?').run(marker,id(0));
   app.core.changed({characterId:42,resources:['sessions']});
   await page.evaluate(`window.__wait(()=>document.querySelector('.session-card strong')?.textContent===${JSON.stringify(marker)}&&!(${more})?.disabled)`);
   check('archive refresh preserves expanded report '+prefix+'/'+repetition,await page.evaluate(`!!document.querySelector('.session-expanded-panel[data-card="route"]')&&document.querySelectorAll('.session-route-list>li').length===3&&document.querySelector('.report-title input').value===${JSON.stringify('Refreshed '+prefix+' 2')}`));
   await page.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await page.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
   await page.waitFor(`!document.querySelector('.session-report-dialog')`);
   await page.evaluate(`window.__wait(()=>!(${more})?.disabled)`);
  }
  row.after=await snapshot();check('report close retains entire ordered loaded prefix '+prefix,row.after.layout.cards===prefix&&await page.evaluate(`JSON.stringify([...document.querySelectorAll('.session-card strong')].map(e=>e.textContent))===${JSON.stringify(JSON.stringify(expectedLabels.slice(0,prefix)))}`));
 }
 check('exhausted archive has no load-more',await page.evaluate(`!(${more})`));
 result.longtasks=await page.evaluate('window.__longtasks');
 // Every ordinary sample above precedes explicit collection.
 await page.call('HeapProfiler.enable');await page.call('HeapProfiler.collectGarbage');result.retention={mounted:await snapshot()};
 await page.evaluate(`document.querySelector('[data-route="overview"]').click()`);await page.waitFor(`!!document.querySelector('.overview-grid')&&!document.querySelector('.session-card')`);await page.call('HeapProfiler.collectGarbage');
 result.retention.unmounted={metrics:await metrics(),dom:await page.call('Memory.getDOMCounters')};
 await page.evaluate(`document.querySelector('[data-route="sessions"]').click()`);await page.waitFor(count(30));await page.call('HeapProfiler.collectGarbage');result.retention.remounted=await snapshot();
 check('remount returns to initial page and preserves history on server',result.retention.remounted.layout.cards===30&&app.store.db.prepare('SELECT count(*) n FROM sessions WHERE character_id=42').get().n===1500);
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);await verifySource(source);assert.equal(createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),result.harnessSha256);result.sourceVerified=true;result.complete=true;
}catch(error){result.failure=error.stack;if(page)result.failureState=await page.evaluate('({url:location.href,body:document.body.innerText.slice(-5000),reads:window.__archiveReads?.slice(-10)})').catch(()=>null);throw error;}
finally{result.endedAt=new Date().toISOString();await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');await browser?.close();await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
