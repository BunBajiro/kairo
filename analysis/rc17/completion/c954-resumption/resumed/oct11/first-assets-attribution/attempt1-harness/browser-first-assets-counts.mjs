// Bounded diagnostic ONLY: identical original two actions, shape counts and scalar receipts.
// Coordinator supplies fresh verified build manifests and owns the exclusive process-group envelope.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {chromeProcess} from '../../oct8/final-merged-frontend/chrome-strict.mjs';
import {loadSourceManifest,verifySource} from '../../../../../harness/source-manifest.mjs';
import {createProtocolFixture} from '../../names-protocol-227/browser-fixture.mjs';
const [repoArg,outArg,manifestArg]=process.argv.slice(2);
assert.ok(repoArg&&outArg&&manifestArg,'app-root output.json source-manifest.json are required');
assert.equal(process.argv.length,5,'No timing/fixture/action overrides are permitted');
const repo=resolve(repoArg),output=resolve(outArg);
assert.equal(process.env.KAIRO_MODELS_LOCKED,'1','Coordinator must grant the exclusive runtime slot');
assert.equal(process.env.KAIRO_FIRST_ASSETS_DIAGNOSTIC_GRANTED,'1','Reviewed diagnostic needs coordinator runtime grant');
assert.deepEqual(process.execArgv,[]);assert.equal(process.env.NODE_OPTIONS||'','');assert.equal(process.env.NODE_V8_COVERAGE||'','');
const source=await loadSourceManifest(manifestArg,repo);assert.ok(source.builtFiles.length);assert.equal(source.dirty,false,'Application source must be clean');
assert.ok(['c9d04ef62cb8a18292b309a2452fcab851185a7d','70cd12f9a4d014e7e2cf931b9681c4bdc7f18789'].includes(source.sourceCommit),'Only the reviewed original c9d and integrated70 arms');
const hash=value=>createHash('sha256').update(value).digest('hex');
const inputs=[new URL(import.meta.url),new URL('../../names-protocol-227/browser-fixture.mjs',import.meta.url),new URL('../../oct8/final-merged-frontend/chrome-strict.mjs',import.meta.url),new URL('../../../../../harness/source-manifest.mjs',import.meta.url),new URL('../names-bootstrap-prepared/browser-bootstrap.mjs',import.meta.url),new URL('../../oct8/final-merged-frontend/assets-semantics.mjs',import.meta.url)];
const bindings=await Promise.all(inputs.map(async path=>{const bytes=await readFile(path);return {path:path.pathname,bytes:bytes.length,sha256:hash(bytes)};}));
const result={schema:1,startedAt:new Date().toISOString(),workerPid:process.pid,mode:'diagnostic-shape-counts-and-scalar-receipts',source:{commit:source.sourceCommit,fingerprint:source.fingerprint,dirty:source.dirty},bindings,node:process.version,checks:[],phases:[],errors:[],complete:false,limits:[
 'One fresh browser per arm; original two-pilot 20,000-name fixture with 10,000 Assets rows per pilot. Original fixture bytes and exact two action bodies are bound.',
 'Diagnostic counters wrap Array.map/Object.values/Intl constructors by fixture row shape; operation counts are not React commits, component mounts, allocations or causal proof.',
 'Fetch observation attaches a side-effect-only promise observer and returns the original promise. SSE observers read no data bodies. No body parsing, copying, withholding, replacement, replay, clock advance or extra publication is introduced.',
 'Diagnostic instrumentation adds overhead and can perturb scheduling. No diagnostic timing metrics are emitted; results do not replace or amend ordinary ABBA measurements.',
 'Fetch resolved means headers are available, not JSON parsed, state published or React committed. Source-changed receipts describe application events only; a receipt does not prove repeated derivation.',
 'First Assets preserves the route/tab barrier and 120ms wait. The 30-row assertion remains outside that action. Phase transitions require additional diagnostic CDP snapshots outside the original actions.',
 'No DevTools Network SSE body mirroring, CPU profile, timeline capture, forced GC or source mutation. Equal counts would leave CPU/GC/layout attribution unresolved.',
 'Strict helper confirms main Chromium exit and removes its profile; coordinator must also verify owned descendant drain, temporary path absence, closed raw/log hashes and final inventory.'
]};
let f,browser,page;
const instrumentation=`(()=>{const s=window.__modelCounts={map:{},searchRows:0,numberFormat:0,dateFormat:0};const map=Array.prototype.map,values=Object.values;function kind(r){if(!r||typeof r!=='object')return null;if('average_price'in r)return 'prices';if('ref_type'in r&&!('name'in r))return 'journal';if('job_id'in r&&!('name'in r))return 'jobs';if('skill_id'in r&&!('name'in r))return 'skills';if('transaction_id'in r&&!('name'in r))return 'transactions';if('order_id'in r&&!('name'in r))return 'orders';if('item_id'in r&&!('name'in r)&&'location_flag'in r)return 'assets';if('solar_system_id'in r&&'type_id'in r&&!('name'in r))return 'mining';return null;}Array.prototype.map=function(...args){const k=kind(this[0]);if(k){const x=s.map[k]||={calls:0,rows:0};x.calls++;x.rows+=this.length;}return map.apply(this,args);};Object.values=function(r){if(r&&('item_id'in r||'ref_type'in r||'job_id'in r))s.searchRows++;return values(r);};for(const [name,key]of [['NumberFormat','numberFormat'],['DateTimeFormat','dateFormat']])Intl[name]=new Proxy(Intl[name],{construct(target,args,newTarget){s[key]++;return Reflect.construct(target,args,newTarget);}});})()`;
const receiverProbe=`(()=>{const probe=window.__protocolReceiver={wallet:{},names:0};window.addEventListener('kairo:source-changed',event=>{const d=event.detail;if(d?.resource==='snapshot'&&d.key==='wallet')probe.wallet[d.characterId]=(probe.wallet[d.characterId]||0)+1;});const Native=window.EventSource;window.EventSource=class extends Native{constructor(...args){super(...args);this.addEventListener('names',()=>probe.names++);}};})()`;
const frameDrain=()=>page.evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))');
async function route(name){await page.click(`document.querySelector('[data-route="${name}"]')`);await page.waitFor(`location.hash===${JSON.stringify('#'+name)}&&!!document.querySelector('[role="tab"]')`);await delay(120);}
// Preserve the ordinary receiver probe and its completion predicate, then add passive observers.
const scalarProbe=`(()=>{
 const s=window.__firstAssetsReceipts={phase:'initial-overview-bootstrap',rows:[],dropped:0,fetchStarted:0,fetchResolved:0,fetchRejected:0,sse:{},sourceChanged:0};
 const record=row=>{if(s.rows.length<512)s.rows.push({phase:s.phase,atMs:performance.now(),...row});else s.dropped++;};
 const nativeFetch=window.fetch;
 window.fetch=function(...args){
  const promise=nativeFetch.apply(this,args);
  let path=null,character=null;
  try{const input=args[0],u=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);if(u.origin===location.origin&&u.pathname.startsWith('/api/')){path=u.pathname;character=u.searchParams.get('character');}}catch{}
  if(path){s.fetchStarted++;record({kind:'fetch-start',path,character});void promise.then(response=>{s.fetchResolved++;record({kind:'fetch-resolved',path,character,status:response.status});},()=>{s.fetchRejected++;record({kind:'fetch-rejected',path,character});}).catch(()=>{});}
  return promise;
 };
 const Native=window.EventSource;
 window.EventSource=class extends Native{constructor(...args){super(...args);for(const eventName of ['open','error','state','names','snapshot','changed','opsec','dataset-revision'])this.addEventListener(eventName,()=>{s.sse[eventName]=(s.sse[eventName]||0)+1;record({kind:'sse-receipt',eventName});});}};
 window.addEventListener('kairo:source-changed',event=>{const d=event.detail||{};s.sourceChanged++;record({kind:'source-changed',resource:typeof d.resource==='string'?d.resource:null,key:typeof d.key==='string'?d.key:null,characterId:typeof d.characterId==='number'?d.characterId:null});});
})()`;
const zero={map:{},searchRows:0,numberFormat:0,dateFormat:0};
const capture=nextPhase=>page.evaluate(`(()=>{const counts=structuredClone(window.__modelCounts),receipts=structuredClone(window.__firstAssetsReceipts);window.__firstAssetsReceipts.phase=${JSON.stringify(nextPhase)};return {counts,receipts};})()`);
function difference(before,after){const map={};for(const key of new Set([...Object.keys(before.map),...Object.keys(after.map)]))map[key]={calls:(after.map[key]?.calls||0)-(before.map[key]?.calls||0),rows:(after.map[key]?.rows||0)-(before.map[key]?.rows||0)};return {map,searchRows:after.searchRows-before.searchRows,numberFormat:after.numberFormat-before.numberFormat,dateFormat:after.dateFormat-before.dateFormat};}
async function phase(label,action){
 const before=label==='initial-overview-bootstrap'?{counts:zero,receipts:{rows:[]}}:await capture(label);
 await action();
 const after=await capture('between-phases');
 result.phases.push({label,before,after,delta:difference(before.counts,after.counts),receipts:after.receipts.rows.slice(before.receipts.rows.length)});
 assert.equal(after.receipts.dropped,0,'Bounded passive receipt buffer overflow');
}
const check=(label,value)=>{result.checks.push({label,passed:!!value});assert.ok(value,label);};
try{
 f=await createProtocolFixture(repo);result.fixture=f.fixture;assert.equal(f.fixture.namesJsonBytes,550001);assert.equal(f.fixture.rowsPerLargeDataset,10000);result.protocol=typeof f.app.core.connectUI==='function';
 browser=await chromeProcess();page=await browser.page();result.browser=browser.version;
 page.on(event=>{
  if(event.method==='Fetch.requestPaused'){void page.call('Fetch.failRequest',{requestId:event.params.requestId,errorReason:'BlockedByClient'}).catch(()=>{});return;}
  if(event.method==='Runtime.exceptionThrown')result.errors.push(event.params.exceptionDetails.exception?.description||event.params.exceptionDetails.text);
 });
 for(const method of ['Page.enable','Runtime.enable'])await page.call(method);
 await page.call('Fetch.enable',{patterns:['https://*','http://images.evetech.net/*','http://web.ccpgamescdn.com/*'].map(urlPattern=>({urlPattern,requestStage:'Request'}))});await page.call('Emulation.setDeviceMetricsOverride',{width:1600,height:1050,deviceScaleFactor:1,mobile:false});
 await page.call('Page.addScriptToEvaluateOnNewDocument',{source:instrumentation+'\n'+receiverProbe+'\n'+scalarProbe});
 await phase('initial-overview-bootstrap',async()=>{await page.call('Page.navigate',{url:f.app.origin+'/#overview'});await page.waitFor('!!document.querySelector(".connection-status.online")&&!!document.querySelector(".page-transition")&&!document.querySelector(".loading-layout")');if(result.protocol)await page.waitFor('__protocolReceiver.names>=1');await frameDrain();await delay(250);});
 await phase('assets-first-open',()=>route('assets'));await page.waitFor('document.querySelectorAll("tbody tr").length===30');

 check('first Assets page contains 30 rows',await page.evaluate('document.querySelectorAll("tbody tr").length===30'));
 result.afterRowAssertion=await capture('after-assertion');
 assert.deepEqual(f.unexpected,[]);assert.deepEqual(result.errors,[]);assert.deepEqual(f.provider,[]);assert.deepEqual(f.clockLedger,[]);
 result.workloadComplete=true;
}catch(error){result.failure=error.stack;if(page)result.failureState=await page.evaluate('({url:location.href,body:document.body.innerText.slice(-10000)})').catch(()=>null);process.exitCode=1;}
finally{
 if(f){result.provider=f.provider;result.clockLedger=f.clockLedger;result.unexpected=f.unexpected;}
 result.cleanupFailures=[];result.cleanup={};
 for(const [owner,close]of [['browser',()=>browser?.close()],['fixture',()=>f?.close()]]){
  try{const receipt=await close();if(owner==='browser'&&browser)assert.equal(receipt?.processExitVerified,true);result.cleanup[owner]={complete:true,...receipt};}
  catch(error){result.cleanupFailures.push({owner,error:error.stack||String(error)});}
 }
 try{await verifySource(source);for(const binding of bindings){const bytes=await readFile(binding.path);assert.equal(bytes.length,binding.bytes);assert.equal(hash(bytes),binding.sha256);}result.sourceVerified=true;}
 catch(error){result.finalGuardFailure=error.stack;process.exitCode=1;}
 result.cleanupVerified=result.cleanupFailures.length===0;result.complete=result.workloadComplete===true&&result.sourceVerified===true&&result.cleanupVerified&&!result.failure&&!result.finalGuardFailure;
 if(!result.complete)process.exitCode=1;
 result.endedAt=new Date().toISOString();await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
}
