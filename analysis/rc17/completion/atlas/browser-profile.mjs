// Full bundled Atlas browser diagnostic. Raw CPU profiles and instrumented
// Canvas call counts use separate page passes; neither is an A/B speed claim.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromeProcess} from '../../../rc16/historical/tests/performance/chrome.mjs';
import {captureSource,verifySource} from '../../harness/source-manifest.mjs';
import {digest,distribution} from '../startup/fixture.mjs';
const repo=resolve(process.env.KAIRO_BENCH_REPO||'/workspace/scratch/a2f3334402fc/kairo-rc17-completion');
const output=resolve(process.env.KAIRO_BROWSER_OUTPUT||'analysis/rc17/completion/atlas/browser-result'),port=Number(process.env.KAIRO_BROWSER_PORT||18930);
const {startKairo}=await import(pathToFileURL(join(repo,'server/index.mjs')));
await mkdir(output,{recursive:true});const source=await captureSource(repo);assert.ok(source.builtFiles.length,'Fresh compiled build required');await writeFile(join(output,'source-manifest.json'),JSON.stringify(source,null,2));
assert.ok(process.env.KAIRO_BUILD_RECEIPT,'Set KAIRO_BUILD_RECEIPT to the coordinator receipt for this exact frozen source/build');
const receiptBytes=await readFile(process.env.KAIRO_BUILD_RECEIPT),buildReceipt=JSON.parse(receiptBytes);assert.equal(buildReceipt.sourceFingerprint,source.fingerprint);assert.equal(buildReceipt.exitCode,0);assert.ok(buildReceipt.buildCommand&&buildReceipt.completedAt&&/^[a-f0-9]{64}$/.test(buildReceipt.logSha256));
if(buildReceipt.buildLog)assert.equal(digest(await readFile(buildReceipt.buildLog)),buildReceipt.logSha256);await writeFile(join(output,'build-receipt.json'),receiptBytes);
const harnessHashes={};for(const path of ['./browser-profile.mjs','../../../rc16/historical/tests/performance/chrome.mjs','../startup/fixture.mjs','../../harness/source-manifest.mjs'])harnessHashes[path]=digest(await readFile(new URL(path,import.meta.url)));
const dir=await mkdtemp(join(tmpdir(),'kairo-atlas-profile-')),errors=[],external=[],phases=[],checks=[];
const result={schemaVersion:1,startedAt:new Date().toISOString(),sourceFingerprint:source.fingerprint,sourceCommit:source.sourceCommit,complete:false,productionAcceptance:false,diagnostic:true,buildReceiptSha256:digest(receiptBytes),harnessHashes,errors,external,phases,checks};
let app,chrome,page,failure;
const deny=async url=>{external.push(String(url));throw Error('External traffic forbidden');};
const canvas='document.querySelector(".universe-canvas-shell canvas[role=img]")';
const shell='document.querySelector(".universe-canvas-shell")';
async function metrics(){const {metrics}=await page.call('Performance.getMetrics');return Object.fromEntries(metrics.map(value=>[value.name,value.value]));}
function cpuSummary(profile){const weights=new Map();for(let i=0;i<(profile.samples||[]).length;i++)weights.set(profile.samples[i],(weights.get(profile.samples[i])||0)+(profile.timeDeltas?.[i]||0));return profile.nodes.map(node=>({function:node.callFrame.functionName,url:node.callFrame.url,line:node.callFrame.lineNumber,column:node.callFrame.columnNumber,selfMs:(weights.get(node.id)||0)/1000,hitCount:node.hitCount||0})).sort((a,b)=>b.selfMs-a.selfMs).slice(0,40);}
async function settle(){await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await delay(350);}
async function profile(name,action){const before=await metrics();await page.call('Profiler.start');const started=Date.now();await action();await settle();const {profile}=await page.call('Profiler.stop');const after=await metrics();const raw=JSON.stringify(profile);await writeFile(join(output,name+'.cpuprofile'),raw);phases.push({name,mode:'unmodified-sampling',elapsedMs:Date.now()-started,metricsDelta:Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','JSHeapUsedSize'].map(key=>[key,(after[key]||0)-(before[key]||0)])),profile:name+'.cpuprofile',sha256:digest(raw),top:cpuSummary(profile)});}
async function switchTo(projection){await page.click('document.querySelector('+JSON.stringify('[aria-label="'+(projection==='physical'?'Flattened 3D':'Schematic 2D')+'"]')+')');await page.waitFor(shell+'.dataset.mapProjection==='+JSON.stringify(projection));}
async function panZoom(){
 const r=await page.evaluate(`(()=>{const r=${canvas}.getBoundingClientRect();return{x:r.left+r.width*.5,y:r.top+r.height*.5};})()`);
 for(let round=0;round<3;round++){
  await page.call('Input.dispatchMouseEvent',{type:'mousePressed',...r,button:'left',buttons:1,clickCount:1});
  for(let i=1;i<=24;i++){await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.x+Math.sin(i/24*Math.PI)*110,y:r.y+Math.cos(i/24*Math.PI)*65,button:'left',buttons:1});await delay(8);}
  await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',...r,button:'left',clickCount:1});
  await page.call('Input.dispatchMouseEvent',{type:'mouseWheel',...r,deltaX:0,deltaY:round%2?-220:220});await delay(360);
 }
}
async function preparePage(instrumented,projection='physical'){
 page=await chrome.page();page.on(message=>{if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);});
 for(const name of ['Page','Runtime','Network','Performance','Profiler'])await page.call(name+'.enable');await page.call('Profiler.setSamplingInterval',{interval:500});
 await page.call('Network.setBlockedURLs',{urls:['https://*']});await page.call('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
 await page.call('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('kairo-atlas-projection',${JSON.stringify(projection)});`+(instrumented?`(()=>{
  window.__atlas={frames:[],calls:{},draws:0};let frame=null;const native=requestAnimationFrame;
  window.requestAnimationFrame=function(callback){return native.call(window,function(at){const prior=frame,started=performance.now();frame={calls:{},draws:0};try{return callback(at);}finally{if(frame.draws)window.__atlas.frames.push({at,durationMs:performance.now()-started,draws:frame.draws,calls:frame.calls});frame=prior;}});};
  for(const name of ['clearRect','fillRect','strokeRect','beginPath','moveTo','lineTo','arc','fill','stroke','fillText','strokeText','measureText','drawImage']){const method=CanvasRenderingContext2D.prototype[name];CanvasRenderingContext2D.prototype[name]=function(...args){if(this.canvas.closest('.universe-canvas-shell')){window.__atlas.calls[name]=(window.__atlas.calls[name]||0)+1;if(frame)frame.calls[name]=(frame.calls[name]||0)+1;if(name==='clearRect'){window.__atlas.draws++;if(frame)frame.draws++;}}return method.apply(this,args);};}
 })();`:'')});
}
async function mount(){await page.call('Page.navigate',{url:app.origin+'/#universe-kspace'});await page.waitFor('!!'+canvas);await page.waitFor(canvas+".getAttribute('aria-label').includes('systems')");}
try{
 app=await startKairo({port,streamPort:port+1,dataDir:join(dir,'data'),noSync:true,fetcher:deny,universe:{operations:{noSync:true,fetcher:deny},feeds:{noSync:true,fetcher:deny}}});
 app.store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42,'Atlas diagnostic pilot','[]','{}');
 const atlas=app.core.universe.static(),known=atlas.systems.filter(s=>s.space==='known');result.fixture={systems:atlas.systems.length,knownSystems:known.length,gates:atlas.gates.length,atlasSha256:digest(await readFile(join(repo,'server/data/universe.json.gz')))};
 const sample=data=>({status:'ready',data,updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString()});
 app.store.saveSnapshot(0,'kills',sample(known.map((s,i)=>({system_id:s.system_id,ship_kills:i%17,pod_kills:i%7,npc_kills:i%137}))));
 app.store.saveSnapshot(0,'jumps',sample(known.map((s,i)=>({system_id:s.system_id,ship_jumps:i%51}))));
 chrome=await chromeProcess();result.chrome=chrome.version;
 // Fresh pages in physical/schematic/schematic/physical order include both cold
 // first-layout mount and first switch. The app binary/data stay identical.
 for(const [index,first]of ['physical','schematic','schematic','physical'].entries()){
  await preparePage(false,first);await profile(`mount-${index+1}-${first}`,mount);
  assert.ok((await page.evaluate(canvas+".getAttribute('aria-label')")).includes(known.length.toLocaleString('en-US')),'All known systems are present');
  const next=first==='physical'?'schematic':'physical';await profile(`first-switch-${index+1}-${next}`,()=>switchTo(next));await profile(`warm-switch-${index+1}-${first}`,()=>switchTo(first));
  if(index===0){await profile('physical-pan-zoom',panZoom);await switchTo('schematic');await profile('schematic-pan-zoom',panZoom);await page.click('Array.from(document.querySelectorAll(".universe-background-strip button")).find(e=>e.textContent.trim()==="Activity")');await profile('schematic-activity-pan-zoom',panZoom);}
  await chrome.closePage(page);page=null;
 }
 checks.push('Complete bundled Atlas mounted in both projection orders; cold/warm switches preserve all known systems');
 await preparePage(true,'physical');await mount();await settle();
 for(const projection of ['physical','schematic']){
  if(projection==='schematic')await switchTo(projection);await settle();await page.evaluate('window.__atlas={frames:[],calls:{},draws:0}');await panZoom();await settle();
  const data=await page.evaluate('window.__atlas');assert.ok(data.frames.length>0&&data.draws>0);phases.push({name:projection+'-canvas-counters',mode:'instrumented-counts',...data,frameCallbackDuration:distribution(data.frames.map(f=>f.durationMs))});
 }
 checks.push('Separate diagnostic pass records actual Canvas draw frames and API counts during complete-scene pan/zoom');
 const shot=await page.call('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'atlas-schematic.png'),Buffer.from(shot.data,'base64'));
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await verifySource(source);for(const [path,hash]of Object.entries(harnessHashes))assert.equal(digest(await readFile(new URL(path,import.meta.url))),hash);result.sourceVerified=true;result.compiledSourceVerified=true;result.complete=true;
}catch(error){failure=error;result.failure=error.stack;try{result.pageText=await page?.evaluate('document.body.innerText');}catch{}}
finally{try{await chrome?.close();await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});result.cleanupVerified=true;}catch(error){failure??=error;result.cleanupFailure=error.stack;result.complete=false;}result.endedAt=new Date().toISOString();await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({complete:result.complete,checks,output,failure:result.failure},null,2));}
if(failure)throw failure;
