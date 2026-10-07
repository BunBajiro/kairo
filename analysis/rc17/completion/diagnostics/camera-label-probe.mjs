// Reconstructed camera-label causal probe. Derived from the frozen camera
// fixture/native gestures. Instrumented DOM intervention, NOT acceptance timings.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir,cpus,totalmem} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {loadSourceManifest,verifySource} from '../../harness/source-manifest.mjs';

if(process.env.KAIRO_CAMERA_LOCKED!=='1'){
 const code=await new Promise((done,bad)=>{const child=spawn('flock',['/tmp/kairo-performance.lock',process.execPath,fileURLToPath(import.meta.url),...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,KAIRO_CAMERA_LOCKED:'1'}});child.on('error',bad);child.on('exit',code=>done(code??1));});process.exit(code);
}
const [rootArg,outputArg,manifestArg]=process.argv.slice(2),repo=resolve(rootArg),output=resolve(outputArg),source=await loadSourceManifest(manifestArg,repo);
assert.equal(process.env.KAIRO_CAMERA_LOCKED,'1','Run through browser-camera-run.mjs to acquire the timing lock');
const {openStore}=await import(pathToFileURL(join(repo,'server/store.mjs'))),{startKairo}=await import(pathToFileURL(join(repo,'server/index.mjs'))),{getUniverseStatic}=await import(pathToFileURL(join(repo,'server/universe-static.mjs')));
const dir=await mkdtemp(join(tmpdir(),'kairo-camera-')),dataDir=join(dir,'data'),hash=value=>createHash('sha256').update(typeof value==='string'||ArrayBuffer.isView(value)?value:JSON.stringify(value)).digest('hex');
const result={schemaVersion:1,reconstructedHarness:true,diagnosticOnly:true,performanceAcceptance:false,startedAt:new Date().toISOString(),source:{commit:source.sourceCommit,fingerprint:source.fingerprint,dirty:source.dirty},harnessSha256:hash(await readFile(fileURLToPath(import.meta.url))),
 environment:{node:process.version,cpu:cpus()[0]?.model,logicalCpus:cpus().length,totalMemory:totalmem(),viewport:{width:1600,height:1050,dpr:1}},fixture:{},samples:[],diagnostics:{},requests:[],errors:[],external:[],complete:false,
 limitations:['A/B/B/A is an instrumented DOM setter intervention on one compiled application, not cross-version acceptance.','Tracing changes execution and frame count; elapsed trace durations must not be used as final acceptance speedups.','Full canonical 600-node graph, default scales/detail, viewport and native zoom gestures remain unchanged.','The probe requires the frozen old textContent-writing frontend; a new nodeValue frontend correctly fails the intervention-call guard.','Raw trace event names/fields are retained for independent invalidation analysis.']};
result.derivation={baseAdapterSha256:hash(await readFile(new URL('../../harness/browser-camera-worker.mjs',import.meta.url))),manifestHelperSha256:hash(await readFile(new URL('../../harness/source-manifest.mjs',import.meta.url)))};
let traceEvents=[],traceComplete=null;
let app,proc,ws,sequence=0;const pending=new Map();
function call(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},20000);pending.set(id,{resolve:x=>{clearTimeout(timer);resolve(x);},reject:x=>{clearTimeout(timer);reject(x);}});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function waitFor(expression){for(let i=0;i<300;i++){if(await evaluate(expression))return;await delay(50);}throw Error('Condition failed: '+expression);}
async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Unavailable click target');const r=e.getBoundingClientRect(),p={x:r.x+r.width/2,y:r.y+r.height/2};if(!e.contains(document.elementFromPoint(p.x,p.y)))throw Error('Covered click target');return p;})()`);for(const type of ['mouseMoved','mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...p,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});}
const camera=()=>evaluate("(()=>{const d=document.querySelector('[data-testid=\"jspace-map\"]').dataset,w=document.querySelector('.jspace-map-world');return {zoom:Number(d.cameraZoom),transform:w.style.transform};})()");
const semantic=map=>({nodes:map.nodes.map(n=>({id:n.system_id,x:n.x,y:n.y})),connections:map.connections.map(e=>({id:e.id,kind:e.kind,from:e.from_system_id,to:e.to_system_id}))});
const fixtures=new Map();
function seed(){
 const atlas=getUniverseStatic(),known=atlas.systems.filter(s=>s.space==='known'),byId=new Map(known.map(s=>[s.system_id,s])),adj=new Map();
 for(const g of atlas.gates)for(const [a,b] of [[g.from_system_id,g.to_system_id],[g.to_system_id,g.from_system_id]]){if(!adj.has(a))adj.set(a,[]);adj.get(a).push(b);}
 const queue=[known.find(s=>s.name==='Jita').system_id],seen=new Set(queue);
 for(let i=0;i<queue.length&&queue.length<600;i++)for(const id of adj.get(queue[i])||[])if(byId.has(id)&&!seen.has(id)){seen.add(id);queue.push(id);if(queue.length>=600)break;}
 assert.equal(queue.length,600);const db=openStore(dataDir),at=new Date().toISOString();
 db.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42,'Synthetic Camera Pilot','[]','synthetic-unusable-token');
 db.db.exec('CREATE TABLE IF NOT EXISTS universe_records(character_id INTEGER NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(character_id,kind,id))');
 for(const n of [100,600]){const ids=new Set(queue.slice(0,n)),nodes=[...ids].map((system_id,i)=>({system_id,x:i%Math.ceil(Math.sqrt(n))*340,y:Math.floor(i/Math.ceil(Math.sqrt(n)))*240,alias:'',label:'',description:'',status:'unknown',role:'',locked:false,tags:[]}));
  const connections=atlas.gates.filter(g=>ids.has(g.from_system_id)&&ids.has(g.to_system_id)).map((g,i)=>({id:`camera-${n}-edge-${i}`,kind:'gate',from_system_id:g.from_system_id,to_system_id:g.to_system_id})).slice(0,1000);
  const map={id:'camera-'+n,name:n+'-system camera fixture',description:'Synthetic camera comparison',revision:1,scope:null,scope_version:2,created_at:at,updated_at:at,track_passages:false,nodes,connections,passages:[],observations:[],comments:[],pings:[],activity:[],pilots:[]};
  db.db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?)').run(42,'jspace_map',map.id,JSON.stringify(map),at);fixtures.set(n,semantic(map));
 }
 db.close();result.fixture={maps:[...fixtures].map(([nodes,map])=>({nodes,connections:map.connections.length,digest:hash(map)})),digest:hash([...fixtures]),layout:'RC16 frozen frontend fixture: BFS from Jita, bundled gate order, deterministic 340×240 grid; map sizes 100/600 only'};
}
async function openMap(n){if(await evaluate("!!document.querySelector('[aria-label=\"Active J-Space map\"]')"))await evaluate(`(()=>{const e=document.querySelector('[aria-label="Active J-Space map"]');if(e.value==='camera-${n}')return;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'camera-${n}');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);else await click(`[aria-label="Open map ${n}-system camera fixture"]`);
 await waitFor(`document.querySelector('[aria-label="Active J-Space map"]')?.value==='camera-${n}' && document.querySelectorAll('.jspace-node').length===${n} && document.querySelector('.jspace-workspace-stage')?.getAttribute('aria-busy')==='false'`);await delay(400);
 assert.deepEqual(semantic(app.core.universe.jspace.map(42,'camera-'+n)),fixtures.get(n),'Returned canonical graph is preserved');
 assert.equal(await evaluate("Array.from(document.querySelectorAll('.jspace-node')).every(n=>!n.dataset.displayScale||n.dataset.displayScale==='1')"),true,'Default node scales are unchanged');
}
async function fit(){await click('[aria-label="Fit chain"]');await delay(400);}
async function zoom(){for(let i=0;i<3;i++){await click('[aria-label="Zoom in on chain"]');await delay(600);}}
try{
 seed();const deny=async url=>{result.external.push(String(url));throw Error('External fetch forbidden');};app=await startKairo({port:18692,streamPort:18693,dataDir,noSync:true,fetcher:deny,universe:{operations:{noSync:true,fetcher:deny},feeds:{noSync:true,fetcher:deny}}});
 proc=spawn(process.env.KAIRO_CHROME_PATH||'/tmp/kairo-chromium',['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:['ignore','ignore','pipe']});
 const endpoint=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Chrome launch timeout '+log.slice(-1000))),20000);proc.stderr.on('data',chunk=>{log+=chunk;const m=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});proc.on('error',reject);});
 const target=await(await fetch('http://'+new URL(endpoint).host+'/json/new?about:blank',{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(JSON.stringify(m.error))):p?.resolve(m.result);}else if(m.method==='Tracing.dataCollected')traceEvents.push(...m.params.value);else if(m.method==='Tracing.tracingComplete')traceComplete?.();else if(m.method==='Runtime.exceptionThrown')result.errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Network.requestWillBeSent'&&m.params.request.url.includes('/api/'))result.requests.push({url:new URL(m.params.request.url).pathname+new URL(m.params.request.url).search,method:m.params.request.method});});
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Network.setBlockedURLs',{urls:['https://*','http://images.evetech.net/*','http://web.ccpgamescdn.com/*']});await call('Performance.enable');result.environment.browser=await call('Browser.getVersion');
 await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1050,deviceScaleFactor:1,mobile:false});await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await call('Page.addScriptToEvaluateOnNewDocument',{source:"window.__sample={active:false,framesOn:false};new PerformanceObserver(list=>{if(window.__sample.active)window.__sample.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})));}).observe({entryTypes:['longtask']});"});
 await call('Page.navigate',{url:app.origin+'/#universe-jspace'});await waitFor("document.querySelectorAll('.jspace-map-library-card').length===2&&!!document.querySelector('.connection-status.online')");
 result.environment.webgl=await evaluate("(()=>{const c=document.createElement('canvas'),g=c.getContext('webgl');if(!g)return null;const e=g.getExtension('WEBGL_debug_renderer_info');return {vendor:e&&g.getParameter(e.UNMASKED_VENDOR_WEBGL),renderer:e&&g.getParameter(e.UNMASKED_RENDERER_WEBGL)};})()");
 await openMap(600);await fit();
 assert.equal(await evaluate("Array.from(document.querySelectorAll('.jspace-node')).every(n=>n.dataset.displayDetail!=='compact')"),true,'Focus detail must remain OFF/full scene');
 for(const [index,retain]of [false,true,true,false].entries()){
  await fit();
  await evaluate(`(()=>{const output=document.querySelector('[aria-label="Chain zoom"]'),descriptor=Object.getOwnPropertyDescriptor(Node.prototype,'textContent');delete output.textContent;window.__labelProbe={retain:${retain},writes:0,retained:0,replacements:0,initial:output.firstChild};Object.defineProperty(output,'textContent',{configurable:true,get(){return descriptor.get.call(this);},set(value){const probe=window.__labelProbe;probe.writes++;if(probe.retain&&this.firstChild?.nodeType===3&&this.firstChild===this.lastChild){probe.retained++;this.firstChild.nodeValue=value;}else{probe.replacements++;descriptor.set.call(this,value);}}});})()`);
  traceEvents=[];const ended=new Promise((done,bad)=>{const timer=setTimeout(()=>bad(Error('Trace completion timeout')),20000);traceComplete=()=>{clearTimeout(timer);done();};});
  await call('Tracing.start',{categories:'devtools.timeline,disabled-by-default-devtools.timeline.invalidationTracking,blink.user_timing,v8',transferMode:'ReportEvents'});
  const beforeCamera=await camera(),elementsBefore=await evaluate("document.querySelectorAll('[data-testid=\"jspace-map\"] *').length");await zoom();const afterCamera=await camera();
  assert.equal(await evaluate("document.querySelectorAll('[data-testid=\"jspace-map\"] *').length"),elementsBefore,'Intervention must retain complete DOM scene');
  await call('Tracing.end');await ended;traceComplete=null;
  assert.ok(Math.abs(afterCamera.zoom-beforeCamera.zoom*1.25**3)<.001,'Three native zoom commands must match');
  const observed=await evaluate(`(()=>{const output=document.querySelector('[aria-label="Chain zoom"]'),p=window.__labelProbe;return {retain:p.retain,writes:p.writes,retained:p.retained,replacements:p.replacements,sameText:output.firstChild===p.initial,label:output.textContent,zoom:Number(output.dataset.zoom)};})()`);
  assert.ok(observed.writes>0,'Frozen frontend did not call textContent; intervention is not valid on this build');assert.equal(observed.label,Math.round(afterCamera.zoom*100)+'%');if(retain){assert.equal(observed.replacements,0);assert.equal(observed.sameText,true);}else assert.ok(observed.replacements>0);
  assert.deepEqual(semantic(app.core.universe.jspace.map(42,'camera-600')),fixtures.get(600));
  const path=output+'.'+index+'-'+(retain?'retain':'replace')+'.trace.json',raw=JSON.stringify({traceEvents,metadata:{index,retain,source:result.source,fixture:result.fixture,diagnosticOnly:true}});
  await writeFile(path,raw+'\n',{flag:'wx'});
  const events={};for(const event of traceEvents)events[event.name]=(events[event.name]||0)+1;
  result.samples.push({index,retain,beforeCamera,afterCamera,observed,trace:{path,sha256:hash(raw+'\n'),eventCount:traceEvents.length,eventNames:events}});
 }
 assert.equal(hash(await readFile(fileURLToPath(import.meta.url))),result.harnessSha256,'Probe changed during run');
 assert.equal(hash(await readFile(new URL('../../harness/browser-camera-worker.mjs',import.meta.url))),result.derivation.baseAdapterSha256);assert.equal(hash(await readFile(new URL('../../harness/source-manifest.mjs',import.meta.url))),result.derivation.manifestHelperSha256);
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);assert.equal(result.requests.filter(r=>r.url==='/api/events').length,1,'Exactly one dashboard EventSource');await verifySource(source);result.sourceVerified=true;result.complete=true;
}catch(error){result.failure=error.stack;if(ws?.readyState===1)result.failureState=await evaluate("({body:document.body.innerText.slice(-10000),url:location.href})").catch(()=>null);throw error;}
finally{
 ws?.close();
 if(proc&&proc.exitCode===null&&proc.signalCode===null){const exited=new Promise(done=>proc.once('exit',done));proc.kill('SIGTERM');await Promise.race([exited,delay(1500)]);if(proc.exitCode===null&&proc.signalCode===null){proc.kill('SIGKILL');await Promise.race([exited,delay(500)]);}}
 try{await app?.close();assert.ok(!proc||proc.exitCode!==null||proc.signalCode!==null,'Chrome cleanup did not finish');result.cleanupComplete=true;}catch(error){result.cleanupFailure=error.stack;result.complete=false;}
 result.endedAt=new Date().toISOString();await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 console.log(JSON.stringify({complete:result.complete,diagnosticOnly:true,samples:result.samples.length,output}));
}
assert.equal(result.complete,true,'Probe or cleanup failed');
