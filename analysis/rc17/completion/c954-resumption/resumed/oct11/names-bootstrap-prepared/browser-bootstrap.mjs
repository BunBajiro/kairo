// Fresh compiled Dashboard + actual Core publications. Diagnostic capture is never timed.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {chromeProcess} from '../../kairo-analysis-restored/analysis/rc17/completion/c954-resumption/resumed/oct8/final-merged-frontend/chrome-strict.mjs';
import {loadSourceManifest,verifySource} from '../../kairo-analysis-restored/analysis/rc17/harness/source-manifest.mjs';
import {createProtocolFixture} from '../../kairo-analysis-restored/analysis/rc17/completion/c954-resumption/resumed/names-protocol-227/browser-fixture.mjs';
const [repoArg,outArg,manifestArg]=process.argv.slice(2),repo=resolve(repoArg),output=resolve(outArg),timing=process.argv.includes('--timing');
assert.equal(process.env.KAIRO_MODELS_LOCKED,'1');assert.equal(timing,true,'Only ordinary two-phase mode is permitted');
assert.deepEqual(process.execArgv,[],'Ordinary worker requires plain Node execution');assert.equal(process.env.NODE_OPTIONS||'','');assert.equal(process.env.NODE_V8_COVERAGE||'','');
const source=await loadSourceManifest(manifestArg,repo);assert.ok(source.builtFiles.length);
const hash=value=>createHash('sha256').update(value).digest('hex');
const result={schema:1,mode:timing?'ordinary-browser':'diagnostic-browser',source:{commit:source.sourceCommit,fingerprint:source.fingerprint},harnessSha256:hash(await readFile(new URL(import.meta.url))),fixtureHarnessSha256:hash(await readFile(new URL('../../kairo-analysis-restored/analysis/rc17/completion/c954-resumption/resumed/names-protocol-227/browser-fixture.mjs',import.meta.url))),checks:[],samples:[],wire:[],requests:[],errors:[],complete:false,limits:['Actual local HTTP/EventSource and production Core wallet publications; synthetic allowlisted ESI provider and auth token adapter.','Sparse two-pilot 20,000-name fixture; browser clock and 40 ms gaps are real, server domain clock alone advances polling deadlines.','Diagnostic packet capture is excluded from ordinary renderer metrics. Ordinary completion uses scalar source-changed/name-event counters without parsing/copying bodies, then two animation frames; initial completion also requires the compiled state-ready page.','Renderer task/script/style/layout counters exclude browser/GPU/worker CPU.','Original names component baseline c9d04ef versus integrated70cd12f; not an RC16 comparison or isolated causal effect. Only the initial Overview and first Assets phases run.','Initial full-map bootstrap is included and reported separately. Legacy callback simulation is a distinct diagnostic worker.']};
let f,browser,page;
result.node=process.version;
result.runtimeInstrumentation={execArgv:process.execArgv,nodeOptionsAbsent:!process.env.NODE_OPTIONS,nodeV8CoverageAbsent:!process.env.NODE_V8_COVERAGE};
result.limits=['Actual local HTTP/EventSource and compiled Dashboard; original sparse two-pilot 20,000-name fixture with 10,000 Assets rows per pilot. No Wallet publication or fixture clock advance is requested in these two phases.','Ordinary mode excludes CDP Network packet mirroring, body capture, profiling and forced GC. Initial completion requires the compiled state-ready page, open connection and protocol-arm names receipt, then two animation frames and the original settle wait.','First Assets timing retains the original route/tab barrier and120ms wait; the30-row assertion remains after the measured phase.','Renderer task/script/style/layout counters exclude browser/GPU/worker CPU.','Original names component baseline c9d04ef versus integrated70cd12f, including accepted Assets. This is not an RC16 comparison or an isolated names causal effect.','Initial full-map bootstrap is included and reported separately. Two fresh observations per arm are bounded samples, not population percentiles.'];
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

 check('first Assets page contains 30 rows',await page.evaluate('document.querySelectorAll("tbody tr").length===30'));
 assert.deepEqual(f.unexpected,[]);assert.deepEqual(result.errors,[]);result.provider=f.provider;result.clockLedger=f.clockLedger;
 result.workloadComplete=true;
}catch(error){result.failure=error.stack;if(page)result.failureState=await page.evaluate('({url:location.href,body:document.body.innerText.slice(-10000)})').catch(()=>null);process.exitCode=1;}
finally{
 if(f){result.provider=f.provider;result.clockLedger=f.clockLedger;result.unexpected=f.unexpected;}
 result.cleanupFailures=[];result.cleanup={};
 for(const [owner,close]of [['browser',()=>browser?.close()],['fixture',()=>f?.close()]]){
  try{const receipt=await close();if(owner==='browser'&&browser)assert.equal(receipt?.processExitVerified,true);result.cleanup[owner]={complete:true,...receipt};}
  catch(error){result.cleanupFailures.push({owner,error:error.stack||String(error)});}
 }
 try{await verifySource(source);assert.equal(hash(await readFile(new URL(import.meta.url))),result.harnessSha256);assert.equal(hash(await readFile(new URL('../../kairo-analysis-restored/analysis/rc17/completion/c954-resumption/resumed/names-protocol-227/browser-fixture.mjs',import.meta.url))),result.fixtureHarnessSha256);result.sourceVerified=true;}
 catch(error){result.finalGuardFailure=error.stack;process.exitCode=1;}
 result.cleanupVerified=result.cleanupFailures.length===0;result.complete=result.workloadComplete===true&&result.sourceVerified===true&&result.cleanupVerified&&!result.failure&&!result.finalGuardFailure;
 if(!result.complete)process.exitCode=1;
 result.endedAt=new Date().toISOString();await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
}
