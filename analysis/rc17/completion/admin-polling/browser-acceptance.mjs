// Compiled UI diagnostic acceptance, not elapsed-time performance evidence.
// KAIRO_CHROME_PATH=/path/to/chrome node browser-acceptance.mjs APP_ROOT OUTPUT.json
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {chromeProcess} from '../../../rc16/historical/tests/performance/chrome.mjs';
import {captureSource, verifySource} from '../../harness/source-manifest.mjs';

const repo = resolve(process.argv[2]), output = resolve(process.argv[3]);
const source = await captureSource(repo), dir = await mkdtemp(join(tmpdir(), 'kairo-admin-acceptance-'));
assert.ok(source.builtFiles.length, 'Build the current source before browser acceptance');
const {openStore} = await import(pathToFileURL(join(repo, 'server/store.mjs')));
const {startKairo} = await import(pathToFileURL(join(repo, 'server/index.mjs')));
const result = {schemaVersion:1, startedAt:new Date().toISOString(), source:{commit:source.sourceCommit, fingerprint:source.fingerprint, dirty:source.dirty},
 harnessSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'), complete:false, checks:[], requests:[], errors:[], external:[],
 limitations:['Compiled components and real local HTTP/SSE endpoints with two synthetic pilots; no credentials or external providers.', 'Only administrative 2s/30s setTimeout deadlines are driven by a diagnostic virtual clock. Native intervals, Date, server cadence and other timeouts remain unchanged.', 'Visibility is a controlled document.hidden getter plus visibilitychange event; this verifies mounted UI behavior, not OS background throttling.', 'Injected market job rows and synthetic OBS/snapshot SSE payloads test UI presentation and recovery; this does not test provider scans or OBS WebSocket integration.', 'Request counts and publication correctness only; no CPU, latency or general browser performance claim.']};
let app, chrome, page, stalled, stallNext = false, failNext = false;
const dataDir = join(dir, 'data'), initial = openStore(dataDir), now = Date.now();
for (const id of [42,43]) {
 initial.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(id, 'Administrative Pilot '+id, '[]', 'synthetic-unusable-token');
 initial.db.prepare('INSERT INTO goals(id,character_id,title,target,progress,kind,done,created) VALUES(?,?,?,?,?,?,?,?)').run('goal-'+id,id,'Objective '+id,10,0,'counter',0,new Date(now).toISOString());
 initial.db.prepare('INSERT INTO notes VALUES(?,?,?,?)').run('note-'+id,id,'Private note '+id,new Date(now).toISOString());
}
initial.close();
const script = `(() => {
 const realSet=window.setTimeout.bind(window),realClear=window.clearTimeout.bind(window),originalFetch=window.fetch.bind(window);
 let time=0,next=0,hidden=false;const timers=new Map(),requests=[],active=new Map(),maximum={};
 Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
 window.setTimeout=function(callback,ms,...args){if(this!==window)throw new TypeError('Illegal invocation: native Window timer receiver required');if(ms!==2000&&ms!==30000)return realSet(callback,ms,...args);const id=--next;timers.set(id,{at:time+ms,callback:()=>callback(...args)});return id;};
 window.clearTimeout=function(id){if(this!==window)throw new TypeError('Illegal invocation: native Window timer receiver required');if(timers.has(id))timers.delete(id);else realClear(id);};
 window.fetch=async(input,init)=>{const url=new URL(typeof input==='string'?input:input.url,location.href),key=url.pathname;const row={url:key+url.search,method:init?.method||'GET'};requests.push(row);active.set(key,(active.get(key)||0)+1);maximum[key]=Math.max(maximum[key]||0,active.get(key));try{const response=await originalFetch(input,init);row.status=response.status;return response;}finally{active.set(key,active.get(key)-1);}};
 const idle=async()=>{for(let i=0;i<200;i++){if(![...active.values()].some(Boolean)){await new Promise(r=>realSet(r,40));if(![...active.values()].some(Boolean))return;}await new Promise(r=>realSet(r,20));}throw Error('HTTP reads did not settle');};
 window.__admin={requests,maximum,idle,async advance(ms){const until=time+ms;for(;;){const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>until)break;time=entry[1].at;timers.delete(entry[0]);entry[1].callback();await idle();}time=until;await idle();},visibility(value){hidden=value;document.dispatchEvent(new Event('visibilitychange'));},focus(){window.dispatchEvent(new Event('focus'));}};
 localStorage.setItem('kairo-character','42');
})()`;
const event = (type, data) => {const frame='event: '+type+'\ndata: '+JSON.stringify(data)+'\n\n';for(const client of app.core.uiClients) client.write(frame);};
async function idle() {await page.evaluate('window.__admin.idle()');}
async function counts() {return page.evaluate('window.__admin.requests');}
const count = (requests, path, method='GET') => requests.filter(r=>r.url.split('?')[0]===path && r.method===method).length;
async function route(id, selector) {await page.click(`document.querySelector('[data-route="${id}"]')`);await page.waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);await idle();}
async function setInput(selector, value) {await page.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(40);}
function check(name, detail={}) {result.checks.push({name, passed:true, ...detail});}
function job(status) {app.store.db.prepare('INSERT INTO market_jobs(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run('admin-job',JSON.stringify({id:'admin-job',status,hubId:60003760,mode:'quick',books:[],detail:'Fixture '+status,historyDone:0,historyTotal:0,pages:0}));}
try {
 const deny=async url=>{result.external.push(String(url));throw Error('No external providers in administrative acceptance');};
 app=await startKairo({port:Number(process.env.KAIRO_ADMIN_PORT||18694),streamPort:Number(process.env.KAIRO_ADMIN_STREAM_PORT||18695),dataDir,noSync:true,fetcher:deny,universe:{operations:{noSync:true,fetcher:deny},feeds:{noSync:true,fetcher:deny}}});
 const at=new Date(now).toISOString(),expires=new Date(now+86400000).toISOString();
 app.store.db.prepare('UPDATE market_hubs SET last_scan=? WHERE id=60003760').run(JSON.stringify({jobId:'retained-book',at,observed:at,characterName:'Public ESI',mode:'quick'}));
 app.store.db.prepare('INSERT INTO market_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(60003760,34,4,5,5,100,100,1,1,at,expires,'retained-book');
 chrome=await chromeProcess();page=await chrome.page();result.browser=chrome.version;
 page.on(message=>{if(message.method==='Runtime.exceptionThrown')result.errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
  if(message.method==='Fetch.requestPaused'){const {requestId}=message.params;if(stallNext){stallNext=false;stalled=requestId;}else if(failNext){failNext=false;void page.call('Fetch.failRequest',{requestId,errorReason:'Failed'});}else void page.call('Fetch.continueRequest',{requestId});}});
 await page.call('Page.enable');await page.call('Runtime.enable');await page.call('Network.enable');await page.call('Network.setBlockedURLs',{urls:['https://*','http://images.evetech.net/*','http://web.ccpgamescdn.com/*']});
 await page.call('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});await page.call('Page.addScriptToEvaluateOnNewDocument',{source:script});await page.call('Fetch.enable',{patterns:[{urlPattern:'*/api/markets',requestStage:'Request'}]});
 await page.call('Page.navigate',{url:app.origin+'/#markets'});await page.waitFor("!!document.querySelector('.market-hubs')&&!!document.querySelector('.connection-status.online')");await idle();
 const retained=await page.evaluate("document.querySelector('.market-hubs').innerText");assert.ok(retained.includes('1 cached items'));
 let start=(await counts()).length;await page.evaluate('window.__admin.advance(120000)');let reads=(await counts()).slice(start);assert.equal(count(reads,'/api/markets'),4);check('Markets visible idle 120s', {reads:4, includesInitial:false});
 await page.evaluate('window.__admin.visibility(true)');start=(await counts()).length;await page.evaluate('window.__admin.advance(120000)');assert.equal(count((await counts()).slice(start),'/api/markets'),0);check('Markets hidden no background reads');
 await page.evaluate('window.__admin.visibility(false)');await idle();assert.equal(count((await counts()).slice(start),'/api/markets'),1);check('Markets visibility recovery');
 job('running');await page.evaluate('window.__admin.focus()');await idle();await page.waitFor("document.querySelector('.market-job')?.textContent.includes('Fixture running')");
 start=(await counts()).length;await page.evaluate('window.__admin.advance(10000)');assert.equal(count((await counts()).slice(start),'/api/markets'),5);check('Markets running 10s', {reads:5});
 for(const terminal of ['complete','cancelled','failed']) {job('running');await page.evaluate('window.__admin.focus()');await idle();job(terminal);await page.evaluate('window.__admin.advance(2000)');await page.waitFor(`document.querySelector('.market-job')?.textContent.includes('Fixture ${terminal}')`);start=(await counts()).length;await page.evaluate('window.__admin.advance(10000)');assert.equal(count((await counts()).slice(start),'/api/markets'),0);assert.equal(await page.evaluate("document.querySelector('.market-hubs').innerText"),retained);check('Markets '+terminal+' preserves old book and returns to idle');}
 start=(await counts()).length;stallNext=true;await page.evaluate('window.__admin.focus()');for(let i=0;i<100&&!stalled;i++)await delay(20);assert.ok(stalled,'Slow market request intercepted');
 await page.evaluate('for(let i=0;i<20;i++)window.__admin.focus()');assert.equal(count((await counts()).slice(start),'/api/markets'),1);await page.call('Fetch.continueRequest',{requestId:stalled});stalled=null;await idle();
 assert.equal(count((await counts()).slice(start),'/api/markets'),2);assert.equal(await page.evaluate("window.__admin.maximum['/api/markets']"),1);check('Markets slow transport and burst retain one follow-up without overlap');
 failNext=true;await page.evaluate('window.__admin.focus()');await idle();await page.waitFor("!!document.querySelector('.markets-module > .inline-error')");assert.equal(await page.evaluate("document.querySelector('.market-hubs').innerText"),retained);
 await page.click("document.querySelector('.markets-module > .inline-error button')");await idle();await page.waitFor("!document.querySelector('.markets-module > .inline-error')");check('Markets failed recovery keeps old book and Retry recovers');
 await route('opsec','.obs-controls');start=(await counts()).length;await page.evaluate('window.__admin.advance(120000)');reads=(await counts()).slice(start);assert.equal(count(reads,'/api/obs'),0);assert.equal(count(reads,'/api/obs/status'),4);check('OBS idle status-only fallback',{fullReads:0,statusReads:4});
 await setInput('.obs-controls input[type="number"]','4666');await setInput('.obs-controls input[type="password"]','synthetic-draft-only');
 event('obs',{...app.core.obs.status(),connected:true,error:'Synthetic stream status'});await page.waitFor("document.querySelector('.obs-controls')?.textContent.includes('Synthetic stream status')");assert.equal(await page.evaluate("document.querySelector('.obs-controls input[type=number]').value"),'4666');check('OBS stream immediate and draft retained');
 start=(await counts()).length;for(const client of [...app.core.uiClients])client.end();
 for(let i=0;i<150&&count((await counts()).slice(start),'/api/obs')===0;i++)await delay(50);
 await idle();assert.ok(count((await counts()).slice(start),'/api/obs')>=1,'SSE reconnect must recover OBS config/status');
 assert.equal(await page.evaluate("document.querySelector('.obs-controls input[type=number]').value"),'4666');assert.equal(await page.evaluate("document.querySelector('.obs-controls input[type=password]').value"),'synthetic-draft-only');check('OBS real EventSource reconnect preserves dirty fields');
 await page.evaluate('window.__admin.focus()');await idle();assert.equal(await page.evaluate("document.querySelector('.obs-controls input[type=number]').value"),'4666');check('OBS focus recovery preserves dirty fields');
 await route('goals','.goals-grid');await page.waitFor("document.querySelector('.goals-grid').textContent.includes('Objective 42')&&document.querySelector('.goals-grid').textContent.includes('Private note 42')");await idle();
 start=(await counts()).length;
 for(let i=0;i<8;i++){const snapshot={status:'ready',data:100+i,updatedAt:new Date(now+i+1).toISOString(),expiresAt:expires};app.store.saveSnapshot(42,'wallet',snapshot);event('snapshot',{characterId:42,key:'wallet',snapshot:app.core.snapshots(42).wallet,names:{}});await idle();}
 reads=(await counts()).slice(start);assert.equal(count(reads,'/api/goals'),8);assert.equal(count(reads,'/api/notes'),0);assert.equal(count(reads,'/api/goals/sources'),0);check('Goals eight snapshots isolate progress',{progress:8,notes:0,sources:0});
 start=(await counts()).length;event('changed',{characterId:43,resources:['notes','goals','goalSources']});await delay(100);await idle();assert.equal((await counts()).slice(start).filter(r=>/^\/api\/(goals|notes)/.test(r.url)).length,0);check('Goals ignores other-pilot invalidation');
 start=(await counts()).length;await setInput('[aria-label="New private note"]','New scoped note');await page.click("Array.from(document.querySelectorAll('.goals-grid button')).find(b=>b.textContent==='Save note')");await page.waitFor("document.querySelector('.notes-list').textContent.includes('New scoped note')");await idle();reads=(await counts()).slice(start);assert.equal(count(reads,'/api/notes','POST'),1);assert.ok(count(reads,'/api/notes')>=1);assert.equal(count(reads,'/api/goals'),0);assert.equal(count(reads,'/api/goals/sources'),0);check('Note create refreshes notes only');
 start=(await counts()).length;await page.click("Array.from(document.querySelectorAll('.notes-list article')).find(e=>e.textContent.includes('New scoped note')).querySelector('[aria-label=\"Delete note\"]')");await page.waitFor("!document.querySelector('.notes-list').textContent.includes('New scoped note')");await idle();reads=(await counts()).slice(start);assert.equal(count(reads,'/api/goals'),0);assert.equal(count(reads,'/api/goals/sources'),0);check('Note delete refreshes notes only');
 await page.click("document.querySelector('[aria-label=\"Active character\"]')");await page.click("Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent==='Administrative Pilot 43')");await page.waitFor("document.querySelector('.goals-grid')?.textContent.includes('Objective 43')&&document.querySelector('.notes-list')?.textContent.includes('Private note 43')");assert.equal(await page.evaluate("document.querySelector('.goals-grid').textContent.includes('Objective 42')||document.querySelector('.notes-list').textContent.includes('Private note 42')"),false);check('Goals pilot switch publishes only selected pilot');
 await idle();assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);await verifySource(source);result.complete=true;
} catch(error) {result.failure=error.stack;result.failureState=await page?.evaluate('({url:location.href,body:document.body.innerText.slice(-10000)})').catch(()=>null);process.exitCode=1;}
finally {result.requests=await counts().catch(()=>[]);result.endedAt=new Date().toISOString();await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');await chrome?.close();await app?.close();await rm(dir,{recursive:true,force:true});console.log(JSON.stringify({complete:result.complete,checks:result.checks.length,output,failure:result.failure}));}
