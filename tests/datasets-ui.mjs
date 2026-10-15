// Focused real-browser acceptance for local SDE updates. Only CCP transport and
// archive building are injected; the application routes and SSE stream are real.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startKairo} from '../server/index.mjs';
import {DATASET_TEST_BUILD,DATASET_TEST_RELEASE,DATASET_TEST_NOW,deferred,writeDatasetFixture} from './helpers/dataset-fixture.mjs';

const chrome=process.env.KAIRO_CHROME_PATH||['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
if(!chrome)throw new Error('Chrome is required. Set KAIRO_CHROME_PATH.');
const dir=await mkdtemp(join(tmpdir(),'kairo-datasets-ui-')),output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-screenshots';
await mkdir(output,{recursive:true});
let app,proc,ws;const pending=new Map(),errors=[];let sequence=0;
function call(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timed out: '+method));},20000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value;}
async function waitFor(expression){for(let i=0;i<200;i++){if(await evaluate(expression))return;await delay(50);}throw new Error('Condition not met: '+expression);}
async function clickElement(expression){
 await waitFor('!!('+expression+')');
 const point=await evaluate(`(async()=>{
  const e=(${expression});e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
  let previous,stable=0;
  for(let frame=0;frame<180;frame++){
   await new Promise(requestAnimationFrame);
   const r=e.getBoundingClientRect(),point={x:r.x+r.width/2,y:r.y+r.height/2},hit=document.elementFromPoint(point.x,point.y);
   const ready=e.isConnected&&!e.disabled&&r.width>0&&r.height>0&&e.contains(hit);
   stable=ready&&previous&&Math.abs(point.x-previous.x)<.25&&Math.abs(point.y-previous.y)<.25?stable+1:0;
   if(stable>=3)return point;previous=point;
  }
  throw new Error('Click target did not become stable and unobstructed');
 })()`);
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
}
async function click(selector){await clickElement('document.querySelector('+JSON.stringify(selector)+')');}
async function screenshot(name){await evaluate('document.fonts.ready');const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'));}
async function fill(selector,text){await evaluate('document.querySelector('+JSON.stringify(selector)+').focus()');await call('Input.insertText',{text});}
const checks=[],requests=[],buildGate=deferred();let clock=DATASET_TEST_NOW,offline=false,prepared;
const options={port:18610,streamPort:18611,dataDir:join(dir,'data'),noSync:true,
 datasets:{now:()=>clock,fetcher:async url=>{
  if(offline)throw new Error('CCP is unavailable in this test');
  if(String(url).endsWith('/latest.jsonl'))return new Response(JSON.stringify({_key:'sde',buildNumber:DATASET_TEST_BUILD,releaseDate:DATASET_TEST_RELEASE})+'\n',{headers:{'Cache-Control':'max-age=300',ETag:'"browser-fixture"'}});
  return new Response('synthetic archive');
 },build:async(input,callbacks=input)=>{callbacks.onProgress?.({message:'Validating universe and market data',percent:45});await buildGate.promise;return writeDatasetFixture(input);}},
 onDatasetsReady:ready=>{prepared=ready;}
};
const button=text=>`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
function send(name,data){for(const client of app.core.uiClients)client.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);}
function observeRequests(){app.dashboard.on('request',req=>{if(req.url.startsWith('/api/datasets'))requests.push({url:req.url,method:req.method});});}
try{
 app=await startKairo(options);observeRequests();
 proc=spawn(chrome,['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:['ignore','ignore','pipe']});
 const browserURL=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(new Error('Chrome did not start: '+log.slice(-1000))),20000);proc.stderr.on('data',b=>{log+=b;const m=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});proc.on('error',reject);proc.on('exit',code=>{clearTimeout(timer);reject(new Error('Chrome exited: '+code+' '+log.slice(-1000)));});});
 const endpoint=new URL(browserURL),target=await(await fetch('http://'+endpoint.host+'/json/new?about:blank',{method:'PUT'})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(new Error(JSON.stringify(m.error)));else p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 await call('Page.enable');await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1500,height:1100,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:app.origin+'/#modules'});
 await waitFor("!!document.querySelector('.connection-status.online')");
 await clickElement("Array.from(document.querySelectorAll('[role=tab]')).find(e=>e.textContent==='Datasets')");
 await waitFor("document.querySelectorAll('.dataset-card').length===6");
 assert.equal(await evaluate("document.querySelectorAll('.dataset-card .tag.positive').length"),3);
 assert.ok(await evaluate("document.querySelector('.datasets-settings').textContent.includes('Wanderer') && document.querySelector('.datasets-settings').textContent.includes('SMT')"));
 checks.push('installed official and supplemental versions');
 assert.ok(await evaluate("Array.from(document.querySelectorAll('.dataset-card')).every(e=>e.textContent.includes('Released')&&e.textContent.includes('Last installed'))"));
 checks.push('release and installation dates');
 await screenshot('datasets-desktop');
 const count=requests.filter(row=>row.method==='GET').length;await delay(1500);
 assert.equal(requests.filter(row=>row.method==='GET').length,count,'Idle panel has no polling interval');checks.push('SSE status without panel polling');
 await clickElement(button('Check for updates'));
 await waitFor(`document.querySelector('.dataset-status')?.textContent.includes('Build ${DATASET_TEST_BUILD} is available')`);
 assert.ok(await evaluate(`!!(${button('Install update')})`));checks.push('manual check offers explicit installation');
 const before=await evaluate("Array.from(document.querySelectorAll('.dataset-card .dataset-version strong')).map(e=>e.textContent)");
 offline=true;clock+=61*60000;
 await clickElement(button('Check for updates'));
 await waitFor("document.querySelector('.datasets-settings')?.getAttribute('data-dataset-phase')==='error'");
 assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.dataset-card .dataset-version strong')).map(e=>e.textContent)"),before);
 assert.ok(await evaluate("document.querySelector('.dataset-status').textContent.includes('The installed datasets remain available')"));checks.push('offline check preserves installed data');
 await screenshot('datasets-offline');
 offline=false;clock+=61*60000;await clickElement(button('Check for updates'));
 await waitFor("document.querySelector('.datasets-settings')?.getAttribute('data-dataset-phase')==='idle'");
 await clickElement(button('Install update'));
 await waitFor("document.querySelector('.datasets-settings')?.getAttribute('data-dataset-phase')==='building'");
 assert.equal(await evaluate("document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')"),'45');
 assert.ok(await evaluate("Array.from(document.querySelectorAll('.dataset-actions button')).every(e=>e.disabled)"));checks.push('worker progress and action deduplication');
 await screenshot('datasets-building');
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
 assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth && Array.from(document.querySelectorAll('.dataset-card')).every(e=>e.scrollWidth<=e.clientWidth+1)"),'Dataset cards fit a mobile viewport');checks.push('390px mobile readability');
 await screenshot('datasets-mobile');
 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 assert.ok(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches && Array.from(document.querySelectorAll('.datasets-settings .animate-spin')).every(e=>getComputedStyle(e).animationName==='none')"));checks.push('reduced motion');
 await call('Emulation.setDeviceMetricsOverride',{width:1500,height:1100,deviceScaleFactor:1,mobile:false});
 // Keep an unsaved real form mounted across the planned disconnect.
 await evaluate("location.hash='connections'");await waitFor("!!document.querySelector('#client-id')");
 await fill('#client-id','unsaved-application-draft');
 await evaluate("window.__datasetDraftNode=document.querySelector('#client-id');window.__datasetPageMarker=crypto.randomUUID()");
 const marker=await evaluate('window.__datasetPageMarker');
 buildGate.resolve();
 await waitFor("document.querySelector('.dataset-connection-banner')?.getAttribute('data-phase')==='restarting'");
 assert.ok(await evaluate("document.querySelector('.connection-status').classList.contains('updating') && !document.querySelector('.server-error')"));checks.push('planned restart has update presentation');
 await screenshot('datasets-reconnecting');
 const oldRevision=(await fetch(app.origin+'/api/bootstrap',{headers:{Cookie:(await call('Network.getCookies')).cookies.filter(c=>c.name==='kairo_session').map(c=>c.name+'='+c.value).join('; ')}}).then(r=>r.json())).datasetRevision;
 send('dataset-revision',{revision:oldRevision});await delay(100);
 assert.equal(await evaluate("document.querySelector('.dataset-connection-banner')?.getAttribute('data-phase')"),'restarting');checks.push('old revision cannot announce update success');
 for(let i=0;i<100&&!prepared;i++)await delay(20);assert.ok(prepared);
 const sessions=app.exportSessions();await app.close();app=null;
 await waitFor("document.querySelector('.connection-status')?.textContent==='Updating datasets'");
 app=await startKairo({...options,initialSessions:sessions});observeRequests();
 await waitFor("document.querySelector('#client-id')?.value==='unsaved-application-draft' && document.querySelector('.dataset-connection-banner')?.getAttribute('data-phase')==='restarting'");
 // Wait for a new actual server-side stream, not only a retained browser label.
 for(let i=0;i<120&&!app.core.uiClients.size;i++)await delay(50);assert.ok(app.core.uiClients.size);
 assert.equal(await evaluate('window.__datasetPageMarker'),marker);
 assert.ok(await evaluate("window.__datasetDraftNode===document.querySelector('#client-id')"));checks.push('actual SSE reconnect preserves mounted form and draft');
 app.cancelDatasetRestart('The updated core could not start. Kairo restored the previous dataset.');
 await waitFor("document.querySelector('.dataset-connection-banner')?.getAttribute('data-phase')==='warning'");
 assert.ok(await evaluate("document.querySelector('.dataset-connection-banner').textContent.includes('Continuing with the previous dataset')"));checks.push('rollback has a readable recovery notice');
 await screenshot('datasets-recovered');
 await click('[aria-label="Dismiss dataset notice"]');await waitFor("!document.querySelector('.dataset-connection-banner')");checks.push('recovery notice is dismissible');
 // An unrelated disconnect must not pretend to be an update.
 for(const client of [...app.core.uiClients]){app.core.uiClients.delete(client);client.end();}
 await waitFor("document.querySelector('.connection-status')?.textContent==='Reconnecting to core'");
 assert.equal(await evaluate("!!document.querySelector('.dataset-connection-banner')"),false);checks.push('ordinary disconnect remains distinct');
 await waitFor("!!document.querySelector('.connection-status.online')");
 assert.equal(await evaluate("document.querySelector('#client-id').value"),'unsaved-application-draft');checks.push('ordinary reconnect preserves drafts too');
 assert.deepEqual(errors,[],'No uncaught browser exceptions');
 await writeFile(join(output,'checks.json'),JSON.stringify({ok:true,checks,requests},null,2));
 console.log(JSON.stringify({ok:true,checks:checks.length,details:checks,screenshots:output}));
}catch(error){
 console.error('Dataset browser acceptance failed:',error.stack||error);
 const state=ws?.readyState===1?await evaluate("({url:location.href,body:document.body.innerText.slice(-14000)})").catch(()=>null):null;
 await writeFile(join(output,'failure.json'),JSON.stringify({error:error.stack||String(error),checks,errors,state},null,2));
 if(ws?.readyState===1)await screenshot('datasets-failure').catch(()=>{});throw error;
}finally{
 buildGate.resolve();ws?.close();
 if(proc&&proc.exitCode===null&&proc.signalCode===null){const exited=new Promise(resolve=>proc.once('exit',resolve));proc.kill('SIGTERM');await Promise.race([exited,delay(3000)]);if(proc.exitCode===null&&proc.signalCode===null){proc.kill('SIGKILL');await Promise.race([exited,delay(1000)]);}}
 await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
