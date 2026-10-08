// Diagnostic compiled wiring only. Explicit callback/fetch adapters model legacy/races;
// ordinary protocol worker never loads these adapters.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {chromeProcess} from '../../../../../rc16/historical/tests/performance/chrome.mjs';
import {loadSourceManifest,verifySource} from '../../../../harness/source-manifest.mjs';
import {createProtocolFixture} from './browser-fixture.mjs';
const [repoArg,outArg,manifestArg]=process.argv.slice(2),repo=resolve(repoArg),output=resolve(outArg);
assert.equal(process.env.KAIRO_MODELS_LOCKED,'1');
const source=await loadSourceManifest(manifestArg,repo);assert.ok(source.builtFiles.length);
const hash=value=>createHash('sha256').update(value).digest('hex');
const result={schema:1,mode:'compiled-race-diagnostics',source:{commit:source.sourceCommit,fingerprint:source.fingerprint},harnessSha256:hash(await readFile(new URL(import.meta.url))),fixtureHarnessSha256:hash(await readFile(new URL('./browser-fixture.mjs',import.meta.url))),checks:[],errors:[],wiring:[],complete:false,limits:['Diagnostic only: fetch delivery and EventSource callback gates deliberately control ordering in the compiled Dashboard.','Legacy mode strips namesRevision from full HTTP state and suppresses new names events, modeling the older server contract; manual legacy snapshot frames are labeled separately.','Actual wallet publications and physical process restart still use production Core/HTTP/SSE.','Document remount checks native connection ownership and current scope; they do not claim React StrictMode effect replay coverage.','No timing or performance conclusion may be drawn from this instrumented worker.']};
let f,browser,page;
const check=(label,value)=>{result.checks.push({label,passed:!!value});assert.ok(value,label);};
function instrumentation(mode){return `(${function(mode){
 const Native=window.EventSource,nativeFetch=window.fetch,nativeInterval=window.setInterval;
 const state=window.__namesGate={mode,instances:[],opens:0,nativeOpens:0,errors:0,closes:0,requests:0,held:null,nextHold:mode.startsWith('legacy'),block:false,initialError:mode==='legacy-error',recovery:null};
 state.hold=()=>{state.nextHold=true;};state.release=()=>{const held=state.held;state.held=null;held?.release();};
 window.fetch=async function(input,init){const url=new URL(typeof input==='string'?input:input.url,location.href),isState=url.pathname==='/api/state';if(isState)state.requests++;const response=await nativeFetch.call(this,input,init);if(!isState)return response;const raw=await response.text(),value=JSON.parse(raw);if(mode.startsWith('legacy'))delete value.namesRevision;
  if(state.nextHold){state.nextHold=false;let release;const wait=new Promise(done=>release=done);state.held={release,path:url.pathname+url.search,namesRevision:value.namesRevision};await wait;}
  return new Response(JSON.stringify(value),{status:response.status,headers:response.headers});
 };
 window.setInterval=function(fn,ms,...args){if(ms===30000)state.recovery=fn;return nativeInterval.call(this,fn,ms,...args);};
 class Controlled extends EventTarget{
  constructor(url,options){super();this.native=new Native(url,options);this.types=new Set();this.queue=[];this.closed=false;state.instances.push(this);
   this.native.onopen=()=>{state.nativeOpens++;if(state.initialError){state.initialError=false;state.block=true;this.pendingOpen=true;this.pendingOpenReason='actual-first-open-held-after-synthetic-error';this.emit('error');return;}if(state.block){this.pendingOpen=true;this.pendingOpenReason='actual-native-open-withheld';return;}this.emit('open');};
   this.native.onerror=()=>this.emit('error');
  }
  emit(type,data){if(this.closed)return;const event=data===undefined?new Event(type):new MessageEvent(type,{data});if(type==='open')state.opens++;if(type==='error')state.errors++;this['on'+type]?.(event);super.dispatchEvent(event);}
  addEventListener(type,callback,options){super.addEventListener(type,callback,options);if(type==='open'||type==='error'||this.types.has(type))return;this.types.add(type);this.native.addEventListener(type,event=>{if(mode.startsWith('legacy')&&type==='names')return;if(state.block){this.queue.push([type,event.data]);return;}this.emit(type,event.data);});}
  close(){if(this.closed)return;this.closed=true;state.closes++;this.native.close();}
  get readyState(){return this.native.readyState;}get url(){return this.native.url;}get withCredentials(){return this.native.withCredentials;}
 }
 window.EventSource=Controlled;
 state.outage=()=>{state.block=true;for(const instance of state.instances)if(!instance.closed)instance.emit('error');};
 state.resume=()=>{state.block=false;for(const instance of state.instances)if(!instance.closed){if(instance.pendingOpen){instance.pendingOpen=false;instance.emit('open');}const queued=instance.queue;instance.queue=[];for(const[type,data]of queued)instance.emit(type,data);}};
}.toString()})(${JSON.stringify(mode)});`;}
async function waitClients(count){for(let i=0;i<300;i++){if(f.app.core.uiClients.size===count)return;await delay(20);}assert.fail('UI clients did not reach '+count);}
async function newPage(mode='actual'){
 if(page){await browser.closePage(page);page=null;await waitClients(0);}
 page=await browser.page();page.on(event=>{if(event.method==='Runtime.exceptionThrown')result.errors.push(event.params.exceptionDetails.exception?.description||event.params.exceptionDetails.text);});
 for(const method of ['Page.enable','Runtime.enable','Network.enable'])await page.call(method);
 await page.call('Network.setBlockedURLs',{urls:['https://*','http://images.evetech.net/*','http://web.ccpgamescdn.com/*']});await page.call('Emulation.setDeviceMetricsOverride',{width:1600,height:1050,deviceScaleFactor:1,mobile:false});
 await page.call('Page.addScriptToEvaluateOnNewDocument',{source:instrumentation(mode)});await page.call('Page.navigate',{url:f.app.origin+'/#assets'});return page;
}
const shown=text=>page.waitFor(`document.querySelector('tbody')?.textContent.includes(${JSON.stringify(text)})`);
async function wiring(label){result.wiring.push({label,...await page.evaluate('({opens:__namesGate.opens,nativeOpens:__namesGate.nativeOpens,errors:__namesGate.errors,closes:__namesGate.closes,requests:__namesGate.requests,active:__namesGate.instances.filter(i=>!i.closed).length})')});}
try{
 f=await createProtocolFixture(repo);result.fixture=f.fixture;result.protocol=typeof f.app.core.connectUI==='function';browser=await chromeProcess();result.browser=browser.version;
 await newPage('legacy-initial');await page.waitFor('!!window.__namesGate?.held&&window.__namesGate.opens===1');
 await page.evaluate('__namesGate.release()');await shown('Asset 00000');check('compiled clean first open retains delayed initial legacy HTTP names without snapshots',true);await wiring('legacy-first-open');
 await newPage('legacy-error');await page.waitFor('!!window.__namesGate?.held&&window.__namesGate.errors>=1');
 await page.evaluate('__namesGate.resume();__namesGate.release()');await shown('Asset 00000');
 check('compiled initial error then open recovers legacy state (candidate requests a fenced follow-up)',!result.protocol||await page.evaluate('__namesGate.requests>=2'));await wiring('legacy-error-then-first-open');
 await newPage('actual');await shown('Asset 00000');await waitClients(1);
 // Actual name update during a held full HTTP response exercises both event and ancillary fences.
 await page.evaluate('__namesGate.hold();void __namesGate.recovery()');await page.waitFor('!!__namesGate.held');
 f.app.core.rememberNames({4200000:'Newest directory name'});await f.wallet(42,140001);await shown('Newest directory name');
 await page.evaluate('__namesGate.release()');await delay(180);check('compiled late HTTP cannot replace newer actual Core name publication',await page.evaluate('document.querySelector("tbody")?.textContent.includes("Newest directory name")'));
 // Multiple resolver results before a real publication are visible together.
 f.app.core.rememberNames({4200000:'Batch name zero'});f.app.core.rememberNames({4200001:'Batch name one'});f.app.core.rememberNames({4200002:'Batch name two'});await f.wallet(42,140002);await shown('Batch name zero');check('batched real name changes reach visible compiled labels',await page.evaluate('document.querySelector("tbody")?.textContent.includes("Batch name one")&&document.querySelector("tbody")?.textContent.includes("Batch name two")'));
 // Explicit legacy partial snapshot fixture: unchanged packet format from pre-protocol clients.
 const legacyBody=JSON.stringify({characterId:42,key:'wallet',snapshot:f.app.core.snapshots(42,false).wallet,names:{4200000:'Legacy partial name'}});
 for(const client of f.app.core.uiClients)client.write('event: snapshot\ndata: '+legacyBody+'\n\n');await shown('Legacy partial name');check('compiled legacy partial merge retains omitted names',await page.evaluate('document.querySelector("tbody")?.textContent.includes("Batch name one")'));
 await page.evaluate('void __namesGate.recovery()');await shown('Batch name zero');check('same authoritative revision recovers after legacy partial fallback',true);
 // A selected-pilot scope replacement must discard the old pilot's held response.
 await page.evaluate('__namesGate.hold();void __namesGate.recovery()');await page.waitFor('!!__namesGate.held');
 await page.click(`document.querySelector('[aria-label="Active character"]')`);await page.click(`[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.includes('Second Model Pilot'))`);await shown('Second Asset');await page.evaluate('__namesGate.release()');await delay(180);check('old pilot read cannot replace current pilot rows',!(await page.evaluate('document.querySelector("tbody")?.textContent.includes("Batch name zero")')));
 // Real disconnect then a fresh document: zero consumers retain directory changes.
 await browser.closePage(page);page=null;await waitClients(0);f.app.core.rememberNames({4300000:'Offline reconnect name'});
 await newPage('actual');await shown('Offline reconnect name');await waitClients(1);check('document remount has one active native connection and fresh names',await page.evaluate('__namesGate.instances.filter(i=>!i.closed).length===1'));await wiring('document-remount');
 // Hold old HTTP; physically restart the app with an empty map. Pause open/name
 // callback delivery so fresh HTTP recovery is tested while SSE appears down.
 await page.evaluate('__namesGate.hold();void __namesGate.recovery()');await page.waitFor('!!__namesGate.held');await page.evaluate('__namesGate.outage()');
 const oldRevision=f.app.core.namesSnapshot?.().namesRevision;await f.restart({});const newRevision=f.app.core.namesSnapshot?.().namesRevision;if(result.protocol)assert.notEqual(oldRevision.split(':')[0],newRevision.split(':')[0]);
 await page.evaluate('void __namesGate.recovery();__namesGate.release()');await shown('4300000');check('fresh HTTP process reset removes names during SSE outage',!(await page.evaluate('document.querySelector("tbody")?.textContent.includes("Offline reconnect name")')));
 await waitClients(1);await page.waitFor(`__namesGate.instances.some(instance=>!instance.closed&&instance.pendingOpen${result.protocol?`&&instance.queue.some(([type,data])=>type==='names'&&JSON.parse(data).namesRevision===${JSON.stringify(newRevision)})`:''})`);
 await page.evaluate('__namesGate.resume()');await page.waitFor('!!document.querySelector(".connection-status.online")');await delay(180);check('actual native reconnect and new-process bootstrap cannot restore the prior process directory',!(await page.evaluate('document.querySelector("tbody")?.textContent.includes("Offline reconnect name")')));await wiring('physical-restart-http-outage');
 assert.deepEqual(result.errors,[]);assert.deepEqual(f.unexpected,[]);await verifySource(source);assert.equal(hash(await readFile(new URL(import.meta.url))),result.harnessSha256);assert.equal(hash(await readFile(new URL('./browser-fixture.mjs',import.meta.url))),result.fixtureHarnessSha256);result.sourceVerified=true;result.complete=true;
}catch(error){result.failure=error.stack;if(page)result.failureState=await page.evaluate('({url:location.href,body:document.body.innerText.slice(-10000),wiring:{opens:__namesGate?.opens,errors:__namesGate?.errors,requests:__namesGate?.requests}})').catch(()=>null);throw error;}
finally{if(f){result.provider=f.provider;result.clockLedger=f.clockLedger;result.restartLedger=f.restartLedger;result.unexpected=f.unexpected;}result.cleanupFailures=[];for(const [owner,close]of [['browser',()=>browser?.close()],['fixture',()=>f?.close()]]){try{await close();}catch(error){result.cleanupFailures.push({owner,error:error.stack||String(error)});}}if(result.cleanupFailures.length){result.complete=false;process.exitCode=1;}result.endedAt=new Date().toISOString();await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');}
