// Fresh compiled Dashboard + actual Core publications. Diagnostic capture is never timed.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {chromeProcess} from '../../../../../rc16/historical/tests/performance/chrome.mjs';
import {loadSourceManifest,verifySource} from '../../../../harness/source-manifest.mjs';
import {createProtocolFixture} from './browser-fixture.mjs';
const [repoArg,outArg,manifestArg]=process.argv.slice(2),repo=resolve(repoArg),output=resolve(outArg),timing=process.argv.includes('--timing');
assert.equal(process.env.KAIRO_MODELS_LOCKED,'1');
const source=await loadSourceManifest(manifestArg,repo);assert.ok(source.builtFiles.length);
const hash=value=>createHash('sha256').update(value).digest('hex');
const result={schema:1,mode:timing?'ordinary-browser':'diagnostic-browser',source:{commit:source.sourceCommit,fingerprint:source.fingerprint},harnessSha256:hash(await readFile(new URL(import.meta.url))),fixtureHarnessSha256:hash(await readFile(new URL('./browser-fixture.mjs',import.meta.url))),checks:[],samples:[],wire:[],requests:[],errors:[],complete:false,limits:['Actual local HTTP/EventSource and production Core wallet publications; synthetic allowlisted ESI provider and auth token adapter.','Sparse two-pilot 20,000-name fixture; browser clock and 40 ms gaps are real, server domain clock alone advances polling deadlines.','Diagnostic packet capture is excluded from ordinary renderer metrics. Ordinary completion uses scalar source-changed/name-event counters without parsing/copying bodies, then two animation frames; initial completion also requires the compiled state-ready page.','Renderer task/script/style/layout counters exclude browser/GPU/worker CPU.','This isolated source predates the accepted Assets boundary; combined current-source acceptance remains separate.','Initial full-map bootstrap is included and reported separately. Legacy callback simulation is a distinct diagnostic worker.']};
let f,browser,page;
const receiverProbe=`(()=>{const probe=window.__protocolReceiver={wallet:{},names:0};window.addEventListener('kairo:source-changed',event=>{const d=event.detail;if(d?.resource==='snapshot'&&d.key==='wallet')probe.wallet[d.characterId]=(probe.wallet[d.characterId]||0)+1;});const Native=window.EventSource;window.EventSource=class extends Native{constructor(...args){super(...args);this.addEventListener('names',()=>probe.names++);}};})()`;
const frameDrain=()=>page.evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))');
async function publishWallet(pilot,value){const before=await page.evaluate(`__protocolReceiver.wallet[${pilot}]||0`);await f.wallet(pilot,value);await page.waitFor(`(__protocolReceiver.wallet[${pilot}]||0)===${before+1}`);await frameDrain();}
const check=(label,value)=>{result.checks.push({label,passed:!!value});assert.ok(value,label);};
const metrics=async()=>Object.fromEntries((await page.call('Performance.getMetrics')).metrics.map(row=>[row.name,row.value]));
async function phase(label,action){const first=timing?await metrics():null,start=performance.now(),wireStart=result.wire.length;await action();if(timing){const last=await metrics();result.samples.push({label,windowMs:performance.now()-start,taskMs:(last.TaskDuration-first.TaskDuration)*1000,scriptMs:(last.ScriptDuration-first.ScriptDuration)*1000,layoutMs:(last.LayoutDuration-first.LayoutDuration)*1000,recalcMs:(last.RecalcStyleDuration-first.RecalcStyleDuration)*1000,heapBefore:first.JSHeapUsedSize,heapAfter:last.JSHeapUsedSize});}else result.samples.push({label,wire:result.wire.slice(wireStart)});}
async function route(name){await page.click(`document.querySelector('[data-route="${name}"]')`);await page.waitFor(`location.hash===${JSON.stringify('#'+name)}&&!!document.querySelector('[role="tab"]')`);await delay(120);}
async function search(value){await page.evaluate(`(()=>{const e=document.querySelector('[aria-label="Filter records"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(120);}
async function switchPilot(label){await page.click(`document.querySelector('[aria-label="Active character"]')`);await page.click(`[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.includes(${JSON.stringify(label)}))`);}
try{
 f=await createProtocolFixture(repo);result.fixture=f.fixture;assert.equal(f.fixture.namesJsonBytes,550001);result.protocol=typeof f.app.core.connectUI==='function';
 browser=await chromeProcess();page=await browser.page();result.browser=browser.version;
 page.on(event=>{
  if(event.method==='Fetch.requestPaused'){void page.call('Fetch.failRequest',{requestId:event.params.requestId,errorReason:'BlockedByClient'}).catch(()=>{});return;}
  if(event.method==='Runtime.exceptionThrown')result.errors.push(event.params.exceptionDetails.exception?.description||event.params.exceptionDetails.text);
  if(!timing&&event.method==='Network.requestWillBeSent'&&event.params.request.url.includes('/api/'))result.requests.push({method:event.params.request.method,url:event.params.request.url});
  if(!timing&&event.method==='Network.eventSourceMessageReceived'){
   const {eventName,data}=event.params;let value;try{value=JSON.parse(data);}catch{return;}
   result.wire.push({type:eventName,bytes:Buffer.byteLength(data),characterId:value.characterId,key:value.key,namesCount:value.names?Object.keys(value.names).length:0,namesRevision:value.namesRevision,value:value.key==='wallet'?value.snapshot?.data:undefined});
  }
 });
 for(const method of ['Page.enable','Runtime.enable','Performance.enable',...(!timing?['Network.enable']:[])])await page.call(method);
 // Ordinary mode does not enable Network event-source mirroring: large SSE bodies
 // must not be serialized a second time into DevTools during the measured pass.
 await page.call('Fetch.enable',{patterns:['https://*','http://images.evetech.net/*','http://web.ccpgamescdn.com/*'].map(urlPattern=>({urlPattern,requestStage:'Request'}))});await page.call('Emulation.setDeviceMetricsOverride',{width:1600,height:1050,deviceScaleFactor:1,mobile:false});
 await page.call('Page.addScriptToEvaluateOnNewDocument',{source:receiverProbe});
 await phase('initial-overview-bootstrap',async()=>{await page.call('Page.navigate',{url:f.app.origin+'/#overview'});await page.waitFor('!!document.querySelector(".connection-status.online")&&!!document.querySelector(".page-transition")&&!document.querySelector(".loading-layout")');if(result.protocol)await page.waitFor('__protocolReceiver.names>=1');await frameDrain();await delay(250);});
 await phase('assets-first-open',()=>route('assets'));await page.waitFor('document.querySelectorAll("tbody tr").length===30');
 await phase('assets-sort-directions',async()=>{const button=`[...document.querySelectorAll('.sort-label')].find(e=>e.textContent.startsWith('Quantity'))`;await page.click(button);check('numeric ascending',await page.evaluate(`document.querySelector('tbody tr').children[1].textContent==='1'`));await page.click(button);check('numeric descending',await page.evaluate(`document.querySelector('tbody tr').children[1].textContent==='10,000'`));await page.click(button);});
 await phase('assets-actual-core-20-wallet-events',async()=>{const before=await page.evaluate('__protocolReceiver.wallet[42]||0');for(let i=0;i<20;i++){await f.wallet(42,110000+i);await delay(40);}await page.waitFor(`(__protocolReceiver.wallet[42]||0)===${before+20}`);await frameDrain();await delay(100);result.receiverCompletion={before,after:await page.evaluate('__protocolReceiver.wallet[42]||0'),framesDrained:2};});
 if(!timing){const events=result.samples.at(-1).wire,snapshots=events.filter(e=>e.type==='snapshot');check('actual publication produces exactly 20 Wallet snapshots',snapshots.length===20&&snapshots.every((e,i)=>e.key==='wallet'&&e.characterId===42&&e.value===110000+i));check('unchanged directory does not repeat in candidate protocol',result.protocol?events.every(e=>e.type!=='names')&&snapshots.every(e=>e.namesCount===0&&e.namesRevision):snapshots.every(e=>e.namesCount===20000));}
 await phase('assets-search-and-page',async()=>{await search('00001');check('matching visible record',await page.evaluate('document.querySelectorAll("tbody tr").length===1'));await publishWallet(42,120001);await delay(120);check('filter survives real Wallet publication',await page.evaluate(`document.querySelector('[aria-label="Filter records"]').value==='00001'&&document.querySelectorAll('tbody tr').length===1`));await search('');await page.click(`document.querySelector('[aria-label="Next page"]')`);await page.click(`document.querySelector('[aria-label="Next page"]')`);check('page history preserved',await page.evaluate('document.querySelector(".pagination")?.textContent.includes("Page 3 of")'));});
 await search('00001');
 await phase('assets-relevant-name',async()=>{f.app.core.rememberNames({4200001:'Renamed Asset 00001'});await publishWallet(42,120002);await page.waitFor('document.querySelector("tbody")?.textContent.includes("Renamed Asset 00001")');});
 if(!timing&&result.protocol){const wire=result.samples.at(-1).wire;check('changed full map precedes actual snapshot',wire.filter(e=>e.type==='names').length===1&&wire.findIndex(e=>e.type==='names')<wire.findIndex(e=>e.type==='snapshot'));}
 await phase('assets-unrelated-name',async()=>{f.app.core.rememberNames({999999999:'Unrelated name'});await publishWallet(42,120003);await delay(250);});
 await search('');await page.click(`[...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent==='Saved fittings')`);await page.click('document.querySelector("details summary")');await publishWallet(42,120004);await delay(150);check('expanded fitting survives actual Wallet update',await page.evaluate('document.querySelector("details")?.open'));
 await page.click(`[...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent==='All assets')`);await switchPilot('Second Model Pilot');await page.waitFor('document.querySelector("tbody")?.textContent.includes("Second Asset")');
 // Global-vs-selected-pilot publication is a semantic check outside timing.
 f.app.core.rememberNames({4300000:'Global other-pilot change'});await publishWallet(42,120005);
 if(result.protocol)await page.waitFor('document.querySelector("tbody")?.textContent.includes("Global other-pilot change")');
 await publishWallet(43,130001);await page.waitFor('document.querySelector("tbody")?.textContent.includes("Global other-pilot change")');
 check('selected-pilot rows remain selected',!(await page.evaluate('document.querySelector("tbody")?.textContent.includes("Renamed Asset")')));
 assert.deepEqual(f.unexpected,[]);assert.deepEqual(result.errors,[]);result.provider=f.provider;result.clockLedger=f.clockLedger;
 await verifySource(source);assert.equal(hash(await readFile(new URL(import.meta.url))),result.harnessSha256);assert.equal(hash(await readFile(new URL('./browser-fixture.mjs',import.meta.url))),result.fixtureHarnessSha256);result.sourceVerified=true;result.complete=true;
}catch(error){result.failure=error.stack;if(page)result.failureState=await page.evaluate('({url:location.href,body:document.body.innerText.slice(-10000)})').catch(()=>null);throw error;}
finally{if(f){result.provider=f.provider;result.clockLedger=f.clockLedger;result.unexpected=f.unexpected;}result.cleanupFailures=[];for(const [owner,close]of [['browser',()=>browser?.close()],['fixture',()=>f?.close()]]){try{await close();}catch(error){result.cleanupFailures.push({owner,error:error.stack||String(error)});}}if(result.cleanupFailures.length){result.complete=false;process.exitCode=1;}result.endedAt=new Date().toISOString();await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');}
