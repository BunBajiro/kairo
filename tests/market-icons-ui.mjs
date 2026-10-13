// Exercise real compiled Markets views with a real synthetic SQLite cache.
// Only image transport is replaced: no CCP/ESI network availability is required.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startKairo} from '../server/index.mjs';
import {seedMarketIcons} from './helpers/market-icon-fixture.mjs';

const chrome=process.env.KAIRO_CHROME_PATH||['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
if(!chrome)throw new Error('Chrome is required. Set KAIRO_CHROME_PATH.');
const dir=await mkdtemp(join(tmpdir(),'kairo-market-icons-ui-')),output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-results';
await mkdir(output,{recursive:true});
const now=Date.now();
const imageBody=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" fill="#203c49"/><path d="M4 16 16 4 28 16 16 28Z" fill="#97ebce"/></svg>').toString('base64');
const errors=[],checks=[],snapshots=[],imageRequests=[],unexpectedNetwork=[],serverRequests=[];
let app,proc,ws,sequence=0,closing=false,chromeLog='';
const pending=new Map(),interceptions=new Set();
const denyNetwork=async url=>{serverRequests.push(String(url));throw new Error('Unexpected external request in market icon test: '+url);};


function call(method,params={}){
 const id=++sequence;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timed out: '+method));},15000);
  pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
  ws.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(expression){
 const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
 return r.result.value;
}
async function waitFor(expression){
 for(let i=0;i<160;i++){if(errors.length)throw new Error(errors.join('\n'));if(await evaluate(expression))return;await delay(50);}
 throw new Error('Condition not met: '+expression);
}
async function clickElement(expression){
 await waitFor('!!('+expression+')');
 const point=await evaluate(`(async()=>{
  let previous,current,stable=0;
  for(let frame=0;frame<120;frame++){
   await new Promise(requestAnimationFrame);
   // A resource refresh may replace the target between the initial lookup
   // and this frame. Resolve it again instead of retaining a detached node.
   const e=(${expression});
   if(!e?.isConnected){previous=undefined;current=undefined;stable=0;continue;}
   if(e!==current){e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});previous=undefined;stable=0;current=e;}
   const r=e.getBoundingClientRect(),point={x:r.x+r.width/2,y:r.y+r.height/2},hit=document.elementFromPoint(point.x,point.y);
   const ready=e.isConnected&&!e.disabled&&r.width>0&&r.height>0&&e.contains(hit);
   stable=ready&&previous&&Math.abs(point.x-previous.x)<.25&&Math.abs(point.y-previous.y)<.25?stable+1:0;
   if(stable>=2)return point;previous=point;
  }
  throw new Error('Click target did not become stable and unobstructed');
 })()`);
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
}
const click=selector=>clickElement('document.querySelector('+JSON.stringify(selector)+')');
const tab=name=>clickElement(`Array.from(document.querySelectorAll('.markets-module > [data-slot=tabs] > [role=tablist] [role=tab]')).find(e=>e.textContent.trim()===${JSON.stringify(name)})`);
async function screenshot(name){const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'));}
async function iconSnapshot(selector,label){
 const rows=await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map(i=>{const r=i.getBoundingClientRect(),s=getComputedStyle(i);return {src:i.src,width:r.width,height:r.height,top:r.top,bottom:r.bottom,naturalWidth:i.naturalWidth,complete:i.complete,loading:i.loading,visibility:s.visibility,display:s.display,flexShrink:s.flexShrink,opacity:s.opacity}})`);
 snapshots.push({label,rows,imageRequestCount:imageRequests.length});console.log(JSON.stringify({label,rows,imageRequestCount:imageRequests.length}));return rows;
}
async function icons(selector,count,label,minimum=29){
 await waitFor(`document.querySelectorAll(${JSON.stringify(selector)}).length===${count}`);
 // Preserve the initial unloaded geometry before scrolling or waiting. This
 // distinguishes lazy-image admission/zero-width problems from HTTP failures.
 await iconSnapshot(selector,label+' before load/scroll');
 for(let i=0;i<count;i++){
  await evaluate(`document.querySelectorAll(${JSON.stringify(selector)})[${i}].scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})`);
  await waitFor(`(()=>{const i=document.querySelectorAll(${JSON.stringify(selector)})[${i}];return i.complete&&i.naturalWidth>0})()`);
 }
 const rows=await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map(i=>{const r=i.getBoundingClientRect(),s=getComputedStyle(i);return {src:i.src,width:r.width,height:r.height,naturalWidth:i.naturalWidth,visibility:s.visibility,display:s.display,opacity:s.opacity}})`);
 checks.push({label,rows});
 console.log(JSON.stringify({label,rows}));
 for(const row of rows){
  assert.ok(row.width>=minimum&&row.height>=minimum,label+': decoded icon retains its intended size: '+JSON.stringify(row));
  assert.equal(row.visibility,'visible',label+': decoded icon is visible');
  assert.notEqual(row.display,'none',label+': icon participates in layout');
  assert.notEqual(row.opacity,'0',label+': icon is not transparent');
 }
}
async function intercept({requestId,request}){
 const url=new URL(request.url);
 if(url.origin===app.origin||url.origin===app.streamOrigin)return call('Fetch.continueRequest',{requestId});
 if(url.origin==='https://images.evetech.net'){
  const failed=url.searchParams.get('kairo_icon_probe')==='error';
  imageRequests.push({url:request.url,status:failed?404:200});
  return call('Fetch.fulfillRequest',{requestId,responseCode:failed?404:200,responseHeaders:[{name:'Content-Type',value:failed?'text/plain':'image/svg+xml'},{name:'Cache-Control',value:'no-store'}],body:failed?Buffer.from('Missing test icon').toString('base64'):imageBody});
 }
 unexpectedNetwork.push(request.url);
 return call('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
}
function killBrowser(signal){try{process.kill(process.platform==='win32'?proc.pid:-proc.pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}}

try{
 await seedMarketIcons(join(dir,'data'),{now,denyNetwork});
 app=await startKairo({port:18630,streamPort:18631,dataDir:join(dir,'data'),noSync:true,fetcher:denyNetwork,markets:{now:()=>now,historySource:'esi',historyFetcher:denyNetwork},datasets:{fetcher:denyNetwork}});
 proc=spawn(chrome,['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--user-data-dir='+join(dir,'chrome'),'about:blank'],{detached:process.platform!=='win32',stdio:['ignore','ignore','pipe']});
 const browserURL=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Chrome did not start: '+chromeLog.slice(-2000))),15000);
  proc.stderr.on('data',b=>{chromeLog=(chromeLog+b).slice(-12000);const m=chromeLog.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});
  proc.once('error',e=>{clearTimeout(timer);reject(e);});proc.once('exit',(code,signal)=>{clearTimeout(timer);reject(new Error('Chrome exited: '+(signal||code)+' '+chromeLog.slice(-2000)));});
 });
 const endpoint=new URL(browserURL),target=await(await fetch('http://'+endpoint.host+'/json/new?about:blank',{method:'PUT',signal:AbortSignal.timeout(10000)})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('CDP connection timed out')),10000);ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});ws.addEventListener('error',e=>{clearTimeout(timer);reject(e);},{once:true});});
 ws.addEventListener('message',e=>{
  const m=JSON.parse(e.data);
  if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(new Error(JSON.stringify(m.error)));else p?.resolve(m.result);}
  else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  else if(m.method==='Fetch.requestPaused'){
   const p=intercept(m.params).catch(e=>{if(!closing)errors.push(e.message);}).finally(()=>interceptions.delete(p));interceptions.add(p);
  }
 });
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});
 await call('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
 await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:app.origin+'/#markets'});
 await waitFor("!!document.querySelector('.market-hubs') && !!document.querySelector('.connection-status.online')");
 await clickElement("Array.from(document.querySelectorAll('.market-hub')).find(e=>e.querySelector('strong').textContent==='Amarr')");
 await waitFor("document.querySelector('.market-hub.active strong')?.textContent==='Amarr'");
 // Reproduce the reported order: first open a category, without priming any
 // icons by visiting All items. Both fixture types belong to Ship Equipment.
 assert.equal(imageRequests.some(r=>r.url.includes('/types/')),false,'No type icons were loaded before the first category');
 await clickElement("Array.from(document.querySelectorAll('.market-category-select')).find(e=>e.querySelector('span')?.textContent==='Ship Equipment')");
 await icons('.market-catalogue .item-name img',2,'Category first: Ship Equipment before All items');
 // The actual bundled taxonomy places 1403 in Inertial Stabilizers. Expand
 // folders without selecting them, then exercise a leaf-category transition.
 await click('[aria-label="Expand Propulsion"]');
 await click('[aria-label="Expand Propulsion Upgrades"]');
 const leaf="Array.from(document.querySelectorAll('.market-category-select')).find(e=>e.querySelector('span')?.textContent==='Inertial Stabilizers')";
 await clickElement(leaf);
 await icons('.market-catalogue .item-name img',1,'Leaf category before All items');
 assert.match(await evaluate("document.querySelector('.market-catalogue .item-name img').src"),/\/types\/1403\/icon/);
 await click('.market-category-all');
 await icons('.market-catalogue .item-name img',2,'All items after category first');
 await clickElement(leaf);
 await icons('.market-catalogue .item-name img',1,'Leaf category after All items');
 await click('.market-category-all');
 for(const width of [1600,1024,390]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
  await icons('.market-catalogue .item-name img',2,'Browse '+width);
  await click('.market-catalogue .market-item-button');
  await icons('.market-item-heading .item-name img',1,'Item detail '+width);
 }
 await screenshot('market-icons-browse-narrow');
 await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});
 await tab('Hub report');
 for(const width of [1600,1024,390]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
  await icons('.market-report .item-name img',2,'Hub report '+width);
 }
 await screenshot('market-icons-report-narrow');
 await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});
 await tab('Import Analyser');
 for(const width of [1600,1024,390]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
  await icons('.import-card .item-name img',2,'Import cards '+width,37);
 }
 await screenshot('market-icons-import-narrow');
 await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});
 await click('.import-card-open');
 await clickElement("Array.from(document.querySelectorAll('.import-detail-dialog button')).find(e=>/Add (anchoring|profiteering) option to plan/.test(e.textContent))");
 await waitFor("!document.querySelector('.import-detail-dialog')");
 for(const width of [1600,390]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
  await icons('.import-plan .item-name img',1,'Import plan '+width);
 }
 // A real 404 invokes React's error handler. A subsequent successful network
 // load on that same image must clear the hidden state. This does not assert
 // that the keyed market detail component reuses an image across item changes.
 await evaluate("(()=>{const i=document.querySelector('.import-plan .item-name img');window.__marketIconProbe=i;i.src=i.src+'&kairo_icon_probe=error'})()");
 await waitFor("window.__marketIconProbe.complete && window.__marketIconProbe.naturalWidth===0");
 await evaluate("window.__marketIconProbe.src=window.__marketIconProbe.src.replace('kairo_icon_probe=error','kairo_icon_probe=recovered')");
 await icons('.import-plan .item-name img',1,'Successful image load recovers after failure');
 assert.equal(await evaluate("window.__marketIconProbe===document.querySelector('.import-plan .item-name img')"),true,'Recovery exercised the same real component image');
 assert.ok(imageRequests.some(r=>r.status===404)&&imageRequests.some(r=>r.url.includes('kairo_icon_probe=recovered')),'Failure and recovery were actual intercepted requests');
 assert.deepEqual(errors,[],'No uncaught browser exceptions');
 assert.deepEqual(unexpectedNetwork,[],'No unhandled browser external requests');
 assert.deepEqual(serverRequests,[],'Cached market views perform no external server requests');
 const result={ok:true,scope:'Compiled Markets with synthetic SQLite and intercepted image transport; no live CCP availability claim',checks,snapshots,imageRequests};
 await writeFile(join(output,'checks.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({ok:true,checks:checks.length,output}));
}catch(error){
 const state=ws?.readyState===1?await evaluate("({url:location.href,body:document.body.innerText.slice(-6000)})").catch(()=>null):null;
 if(ws?.readyState===1)await iconSnapshot('.markets-module .item-name img','Failure state').catch(()=>{});
 await writeFile(join(output,'failure.json'),JSON.stringify({error:error.stack||String(error),chromeLog,checks,snapshots,errors,imageRequests,unexpectedNetwork,serverRequests,state},null,2));
 if(ws?.readyState===1)await screenshot('market-icons-failure').catch(()=>{});
 throw error;
}finally{
 closing=true;
 if(ws?.readyState===1){await call('Fetch.disable').catch(()=>{});await Promise.allSettled([...interceptions]);}
 ws?.close();for(const p of pending.values())p.reject(new Error('Browser test closed'));pending.clear();
 if(proc&&proc.exitCode===null&&proc.signalCode===null){const exited=new Promise(resolve=>proc.once('exit',resolve));killBrowser('SIGTERM');await Promise.race([exited,delay(3000)]);if(proc.exitCode===null&&proc.signalCode===null){killBrowser('SIGKILL');await Promise.race([exited,delay(1000)]);}}
 if(proc?.pid&&process.platform!=='win32')killBrowser('SIGKILL');
 await app?.close();
 await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
