// Exact-source, diagnostic-only M6 attribution. Coverage/identity and CPU are separate fresh workers.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir,cpus} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromeProcess} from '../../../../../../rc16/historical/tests/performance/chrome.mjs';
import {loadSourceManifest,verifySource} from '../../../../../harness/source-manifest.mjs';

const [rootArg,outputArg,manifestArg,mode]=process.argv.slice(2),repo=resolve(rootArg),output=resolve(outputArg);
assert.equal(process.env.KAIRO_MODELS_LOCKED,'1','Coordinator must grant the exclusive runtime slot');
assert.ok(['coverage','cpu'].includes(mode));
const source=await loadSourceManifest(manifestArg,repo);assert.ok(source.builtFiles.length);
const {openStore}=await import(pathToFileURL(join(repo,'server/store.mjs'))),{startKairo}=await import(pathToFileURL(join(repo,'server/index.mjs'))),{getUniverseStatic}=await import(pathToFileURL(join(repo,'server/universe-static.mjs')));
const hash=b=>createHash('sha256').update(b).digest('hex'),write=async(path,value)=>{const bytes=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';await writeFile(path,bytes,{flag:'wx'});return{path:path.slice(dirname(output).length+1),sha256:hash(bytes),bytes:Buffer.byteLength(bytes)};};
const dir=await mkdtemp(join(tmpdir(),'kairo-m6-scene-')),dataDir=join(dir,'data'),rawDir=output+'.raw';await mkdir(rawDir);
const result={schemaVersion:1,mode,diagnosticOnly:true,performanceAcceptance:false,startedAt:new Date().toISOString(),source:{commit:source.sourceCommit,fingerprint:source.fingerprint,dirty:source.dirty},harnessSha256:hash(await readFile(new URL(import.meta.url))),helperSha256:hash(await readFile(new URL('../../../../../../rc16/historical/tests/performance/chrome.mjs',import.meta.url))),environment:{node:process.version,cpu:cpus()[0]?.model,viewport:{width:1600,height:1050,dpr:1}},fixture:{},samples:[],scripts:[],requests:[],checks:[],errors:[],external:[],complete:false,limitations:[
 'Diagnostic only: coverage deoptimizes code and commit identity serialization is intrusive; no durations from that mode support performance acceptance.',
 'CPU profile is a separate fresh worker without props serialization or precise coverage; sampled attribution is not ordinary task timing.',
 'Root commit counts do not count node renders. Exact compiled function ranges and coverage counts are required for loop attribution.',
 'The unchanged input is the saved graph, not the entire server response: generated operational timestamps and frontend time can change without a map revision.',
 'The current Chrome helper uses its default flags; this is not a rerun or timing comparison against the older c954 disabled-GPU profile.',
 'Synthetic local data, real API publication and native pointer actions. External requests are blocked. No whole-process CPU or leak claim.'
]};
let app,browser,page,activeProfile=false,activeCoverage=false;const fixtures=new Map(),scripts=new Map(),inflight=new Map();
const semantic=map=>({nodes:map.nodes.map(n=>({id:n.system_id,x:n.x,y:n.y})),connections:map.connections.map(e=>({id:e.id,kind:e.kind,from:e.from_system_id,to:e.to_system_id}))});
function check(label,ok){result.checks.push({label,passed:!!ok});assert.ok(ok,label);}
function seed(){
 const atlas=getUniverseStatic(),known=atlas.systems.filter(s=>s.space==='known'),byId=new Map(known.map(s=>[s.system_id,s])),adj=new Map();
 for(const g of atlas.gates)for(const[a,b]of[[g.from_system_id,g.to_system_id],[g.to_system_id,g.from_system_id]]){if(!adj.has(a))adj.set(a,[]);adj.get(a).push(b);}
 const queue=[known.find(s=>s.name==='Jita').system_id],seen=new Set(queue);
 for(let i=0;i<queue.length&&queue.length<600;i++)for(const id of adj.get(queue[i])||[])if(byId.has(id)&&!seen.has(id)){seen.add(id);queue.push(id);if(queue.length>=600)break;}
 assert.equal(queue.length,600);const db=openStore(dataDir),at=new Date().toISOString();
 db.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42,'Synthetic Scene Pilot','["esi-location.read_location.v1"]','synthetic-unusable-token');
 db.db.exec('CREATE TABLE IF NOT EXISTS universe_records(character_id INTEGER NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(character_id,kind,id))');
 for(const n of [100,600]){
  const ids=new Set(queue.slice(0,n)),nodes=[...ids].map((system_id,i)=>({system_id,x:i%Math.ceil(Math.sqrt(n))*340,y:Math.floor(i/Math.ceil(Math.sqrt(n)))*240,alias:'',label:'',description:'',status:'unknown',role:'',locked:false,tags:[]}));
  const connections=atlas.gates.filter(g=>ids.has(g.from_system_id)&&ids.has(g.to_system_id)).map((g,i)=>({id:`camera-${n}-edge-${i}`,kind:'gate',from_system_id:g.from_system_id,to_system_id:g.to_system_id})).slice(0,1000);
  const map={id:'camera-'+n,name:n+'-system camera fixture',description:'Synthetic scene diagnosis',revision:1,scope:null,scope_version:2,created_at:at,updated_at:at,track_passages:false,nodes,connections,passages:[],observations:[],comments:[],pings:[],activity:[],pilots:[]};
  db.db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?)').run(42,'jspace_map',map.id,JSON.stringify(map),at);fixtures.set(n,{graph:semantic(map),systems:nodes.slice(0,2).map(n=>({id:n.system_id,name:byId.get(n.system_id).name}))});
 }
 db.close();result.fixture={maps:[...fixtures].map(([nodes,f])=>({nodes,connections:f.graph.connections.length,digest:hash(JSON.stringify(f.graph)),systems:f.systems})),digest:hash(JSON.stringify([...fixtures].map(([n,f])=>[n,f.graph]))),layout:'Frozen BFS from Jita, bundled gate order, 340x240 grid, default scales/full detail. Same graph geometry as historical camera fixture; labels/control records are added only after unchanged rows.'};
}
function saved(n){return JSON.parse(app.store.db.prepare("SELECT body FROM universe_records WHERE character_id=42 AND kind='jspace_map' AND id=?").get('camera-'+n).body);}
function update(n,mutate){const map=saved(n);mutate(map);app.store.db.prepare("UPDATE universe_records SET body=? WHERE character_id=42 AND kind='jspace_map' AND id=?").run(JSON.stringify(map),map.id);return map;}
const mapValue=n=>app.core.universe.jspace.map(42,'camera-'+n);
const click=selector=>page.click(`document.querySelector(${JSON.stringify(selector)})`);
async function waitRequests(start){for(let i=0;i<400;i++){if(result.requests.slice(start).some(r=>r.url.includes('/maps/camera-')&&r.done)&&!inflight.size)return;await delay(25);}throw Error('Map refresh did not finish');}
async function refresh(){const start=result.requests.length;await page.evaluate("window.dispatchEvent(new CustomEvent('kairo:universe-changed',{detail:{characterId:42}}))");await waitRequests(start);await delay(200);}
async function fit(){await click('[aria-label="Fit chain"]');await delay(400);}
async function openMap(n){
 if(await page.evaluate("!!document.querySelector('[aria-label=\"Active J-Space map\"]')"))await page.evaluate(`(()=>{const e=document.querySelector('[aria-label="Active J-Space map"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'camera-${n}');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 else await click(`[aria-label="Open map ${n}-system camera fixture"]`);
 await page.waitFor(`document.querySelector('[aria-label="Active J-Space map"]')?.value==='camera-${n}'&&document.querySelectorAll('.jspace-node').length===${n}&&document.querySelector('.jspace-workspace-stage')?.getAttribute('aria-busy')==='false'`);await delay(400);await fit();
 assert.deepEqual(semantic(mapValue(n)),fixtures.get(n).graph);check(n+' default full detail/scale',await page.evaluate("Array.from(document.querySelectorAll('.jspace-node')).every(n=>n.dataset.displayDetail!=='compact'&&(!n.dataset.displayScale||n.dataset.displayScale==='1'))"));
}
const identityHook=`(()=>{
 const state=window.__m6={commits:0,rows:[],previous:null,ids:new WeakMap(),nextId:0,identity:true};
 const reference=value=>{if(value===null||typeof value!=='object'&&typeof value!=='function')return value;if(!state.ids.has(value))state.ids.set(value,++state.nextId);return {reference:state.ids.get(value)};};
 const fields=p=>({map:p.map,nodes:p.map.nodes,connections:p.map.connections,pings:p.map.pings,observations:p.map.observations,comments:p.map.comments,signatures:p.map.signatures,pilots:p.pilots,operations:p.operations,atlas:p.atlas,overlays:p.overlays,now:p.now,selectedSystemId:p.selectedSystemId,selectedConnectionId:p.selectedConnectionId,busy:p.busy,onSelectSystem:p.onSelectSystem,onSelectConnection:p.onSelectConnection,onMoveNodes:p.onMoveNodes,onNodeAction:p.onNodeAction,onConnectionAction:p.onConnectionAction,routeSystemIds:p.routeSystemIds,routeEdges:p.routeEdges});
 function commit(root){state.commits++;if(!state.identity)return;const stack=[root.current];let props=null;while(stack.length){const f=stack.pop(),p=f.memoizedProps;if(typeof f.type==='function'&&p?.map?.nodes&&p?.atlas?.systems&&typeof p.onMoveNodes==='function'){if(props)throw Error('Ambiguous JSpaceMap owner');props=p;}for(let child=f.child;child;child=child.sibling)stack.push(child);}if(!props)return;
  const selected=fields(props),prior=state.previous,refs=Object.fromEntries(Object.entries(selected).map(([k,v])=>[k,reference(v)])),changed=prior?Object.keys(selected).filter(k=>!Object.is(selected[k],prior.selected[k])):Object.keys(selected);
  const content={nodes:JSON.stringify(props.map.nodes),connections:JSON.stringify(props.map.connections),pings:JSON.stringify(props.map.pings),observations:JSON.stringify(props.map.observations),comments:JSON.stringify(props.map.comments),signatures:JSON.stringify(props.map.signatures),pilots:JSON.stringify(props.pilots),operations:JSON.stringify(props.operations)};
  const changedContent=prior?Object.keys(content).filter(k=>content[k]!==prior.content[k]):Object.keys(content);
  const oldOperation=prior?.operationWithoutGenerated,operationWithoutGenerated=props.operations?JSON.stringify({...props.operations,generated_at:undefined}):null;
  state.rows.push({at:performance.now(),mapId:props.map.id,revision:props.map.revision,now:props.now,busy:props.busy,nodes:props.map.nodes.length,refs,changedIdentity:changed,changedContent,operationGeneratedAt:props.operations?.generated_at,operationWithoutGeneratedChanged:oldOperation!==operationWithoutGenerated});
  state.previous={selected,content,operationWithoutGenerated};
 }
 window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,inject(){return 1;},onCommitFiberRoot(_id,root){commit(root);},onCommitFiberUnmount(){},checkDCE(){}};
})();`;
const cpuHook="window.__m6={commits:0,rows:[]};window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,inject(){return 1;},onCommitFiberRoot(){window.__m6.commits++;},onCommitFiberUnmount(){},checkDCE(){}};";
async function captureScripts(){
 for(const [scriptId,meta]of scripts){if(!meta.url.startsWith(app.origin)||!meta.url.includes('.js'))continue;if(result.scripts.some(s=>s.scriptId===scriptId))continue;
  const{scriptSource}=await page.call('Debugger.getScriptSource',{scriptId});const file=await write(join(rawDir,'script-'+scriptId+'.js'),scriptSource);result.scripts.push({...meta,scriptId,...file});
 }
}
async function sample(n,label,action){
 await page.evaluate("window.__m6.commits=0;window.__m6.rows=[];window.__m6.mutations={worldStyle:0,leafAttributes:0,childList:0};window.__m6.observer=new MutationObserver(rows=>{for(const row of rows){const c=window.__m6.mutations;if(row.type==='childList')c.childList+=row.addedNodes.length+row.removedNodes.length;else if(row.target.classList?.contains('jspace-map-world')&&row.attributeName==='style')c.worldStyle++;else if(row.target.closest?.('.jspace-node,.jspace-map-edge,.jspace-edge-label'))c.leafAttributes++;}});window.__m6.observer.observe(document.querySelector('[data-testid=jspace-map]'),{subtree:true,attributes:true,childList:true});");
 const before=mapValue(n),requestsStart=result.requests.length;
 if(mode==='coverage'){await page.call('Profiler.startPreciseCoverage',{callCount:true,detailed:true,allowTriggeredUpdates:false});activeCoverage=true;}else{await page.call('Profiler.start');activeProfile=true;}
 let raw,actionFailure;
 try{await action();}catch(error){actionFailure=error;}finally{if(mode==='coverage'){raw=await page.call('Profiler.takePreciseCoverage');await page.call('Profiler.stopPreciseCoverage');activeCoverage=false;}else{raw=await page.call('Profiler.stop');activeProfile=false;}}
 const observed=await page.evaluate("window.__m6.observer.disconnect();({commits:window.__m6.commits,rows:window.__m6.rows,mutations:window.__m6.mutations,elements:document.querySelectorAll('[data-testid=jspace-map] *').length,nodes:document.querySelectorAll('.jspace-node').length})"),after=mapValue(n);
 const artifact=await write(join(rawDir,`${n}-${label}.${mode==='coverage'?'coverage.json':'cpuprofile'}`),mode==='cpu'?raw.profile:raw);
 result.samples.push({nodes:n,label,observed,artifact,...(actionFailure?{failure:actionFailure.stack}:{}),before:{revision:before.revision,graph:hash(JSON.stringify(semantic(before))),pilots:before.pilots,operationsGeneratedAt:before.operations?.generated_at},after:{revision:after.revision,graph:hash(JSON.stringify(semantic(after))),pilots:after.pilots,operationsGeneratedAt:after.operations?.generated_at},requests:result.requests.slice(requestsStart)});
 assert.equal(observed.nodes,n);await captureScripts();await writeFile(output+'.progress.json',JSON.stringify(result,null,2)+'\n');if(actionFailure)throw actionFailure;
}
async function pan(){
 const p=await page.evaluate("(()=>{const e=document.querySelector('.jspace-map-viewport'),r=e.getBoundingClientRect();for(let x=12;x<r.width-40;x+=24)for(let o=0;o<r.height/2-40;o+=12)for(const y of o?[r.height/2+o,r.height/2-o]:[r.height/2]){const p={x:r.x+x,y:r.y+y};if(document.elementFromPoint(p.x,p.y)===e)return p;}throw Error('No native pan origin');})()");
 await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await page.call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'middle',buttons:4,clickCount:1});
 for(let i=1;i<=24;i++){await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+i*8,y:p.y+Math.sin(i/4)*60,button:'middle',buttons:4});await delay(20);}
 await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+192,y:p.y+Math.sin(6)*60,button:'middle',buttons:0,clickCount:1});await delay(300);
}
try{
 seed();const deny=async url=>{result.external.push(String(url));throw Error('External fetch forbidden');};app=await startKairo({port:18742,streamPort:18743,dataDir,noSync:true,deferDatasetStart:true,fetcher:deny,universe:{operations:{noSync:true,fetcher:deny},feeds:{noSync:true,fetcher:deny}}});
 browser=await chromeProcess();page=await browser.page();result.environment.browser=browser.version;
 page.on(event=>{
  if(event.method==='Runtime.exceptionThrown')result.errors.push(event.params.exceptionDetails.exception?.description||event.params.exceptionDetails.text);
  if(event.method==='Debugger.scriptParsed')scripts.set(event.params.scriptId,{url:event.params.url,startLine:event.params.startLine,startColumn:event.params.startColumn,endLine:event.params.endLine,endColumn:event.params.endColumn});
  if(event.method==='Network.requestWillBeSent'&&event.params.request.url.includes('/api/')){const row={id:event.params.requestId,method:event.params.request.method,url:new URL(event.params.request.url).pathname+new URL(event.params.request.url).search,done:false};result.requests.push(row);if(row.url.startsWith('/api/universe/jspace'))inflight.set(row.id,row);}
  if(['Network.loadingFinished','Network.loadingFailed'].includes(event.method)){const row=inflight.get(event.params.requestId);if(row){row.done=true;row.failed=event.method==='Network.loadingFailed';inflight.delete(row.id);}}
 });
 for(const method of ['Page.enable','Runtime.enable','Network.enable','Debugger.enable','Profiler.enable'])await page.call(method);
 await page.call('Network.setBlockedURLs',{urls:['https://*','http://images.evetech.net/*','http://web.ccpgamescdn.com/*']});await page.call('Emulation.setDeviceMetricsOverride',{width:1600,height:1050,deviceScaleFactor:1,mobile:false});await page.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await page.call('Page.addScriptToEvaluateOnNewDocument',{source:mode==='coverage'?identityHook:cpuHook});await page.call('Profiler.setSamplingInterval',{interval:500});
 await page.call('Page.navigate',{url:app.origin+'/#universe-jspace'});await page.waitFor("document.querySelectorAll('.jspace-map-library-card').length===2&&!!document.querySelector('.connection-status.online')");await captureScripts();
 for(const n of [100,600]){
  await openMap(n);const [first,second]=fixtures.get(n).systems,node=id=>`.jspace-node[data-system-id="${id}"]`;
  for(let i=1;i<=3;i++)await sample(n,'unchanged-refresh-'+i,async()=>{await refresh();assert.deepEqual(semantic(mapValue(n)),fixtures.get(n).graph);});
  await sample(n,'one-node-metadata',async()=>{update(n,map=>{map.nodes[0].status='scanned';map.nodes[0].alias='M6 changed label';map.revision++;});await refresh();await page.waitFor(`document.querySelector(${JSON.stringify(node(first.id))})?.dataset.status==='scanned'&&document.querySelector(${JSON.stringify(node(first.id))})?.getAttribute('aria-label').includes('M6 changed label')`);});
  const revision=saved(n).revision;
  await sample(n,'same-revision-pilot-and-record',async()=>{
   const at=new Date().toISOString();update(n,map=>{map.pilots=[{character_id:42,tracking:true,last_location:{system_id:second.id,source:'esi',updated_at:at,expires_at:'2099-01-01T00:00:00.000Z'}}];map.observations=[{id:'m6-structure',system_id:second.id,kind:'structure',title:'M6 structure label',created_at:at,expires_at:'2099-01-01T00:00:00.000Z'}];});await refresh();
   await page.waitFor(`!!document.querySelector(${JSON.stringify(node(second.id)+' .jspace-node-pilots')})&&!!document.querySelector(${JSON.stringify(node(second.id)+' [data-kind="structures"]')})`);check(n+' pilot and structure labels update without revision',saved(n).revision===revision&&mapValue(n).pilots[0]?.status==='ready');
  });
  // A real wall-clock deadline, without faking Date or delaying the application timer.
  const expiresAt=new Date(Date.now()+3500).toISOString();update(n,map=>{map.pings=[{id:'m6-deadline',system_id:second.id,label:'M6 deadline',expires_at:expiresAt}];map.observations[0].expires_at=expiresAt;map.pilots[0].last_location.expires_at=expiresAt;});await refresh();await page.waitFor(`!!document.querySelector(${JSON.stringify(node(second.id)+' .jspace-node-rally')})`);
  await sample(n,'clock-boundary',async()=>{await page.waitFor(`!document.querySelector(${JSON.stringify(node(second.id)+' .jspace-node-rally')})&&!document.querySelector(${JSON.stringify(node(second.id)+' [data-kind="structures"]')})&&document.querySelector(${JSON.stringify(node(second.id)+' .jspace-node-pilots')})?.classList.contains('is-stale')`);check(n+' wall clock expires rally/observation and marks pilot stale without revision',saved(n).revision===revision);});
  await sample(n,'after-deadline-refresh',async()=>{await refresh();await page.waitFor(`!document.querySelector(${JSON.stringify(node(second.id)+' .jspace-node-pilots')})`);check(n+' backend refresh publishes waiting pilot',mapValue(n).pilots[0]?.status==='waiting');});
  await sample(n,'selection',async()=>{await click(`[aria-label="Select ${first.name}"]`);await page.waitFor(`document.querySelector(${JSON.stringify(node(first.id)+' .jspace-node-grab')})?.getAttribute('aria-pressed')==='true'`);});
  await click('[aria-label="Frame selected system"]');await delay(400);
  const position=saved(n).nodes.find(x=>x.system_id===first.id),beforePosition={x:position.x,y:position.y};
  await sample(n,'native-node-drag-save',async()=>{
   const p=await page.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(node(first.id)+' .jspace-node-grab')}),r=e.getBoundingClientRect();return{x:r.x+r.width*.35,y:r.y+r.height*.5};})()`);await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await page.call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
   for(let i=1;i<=4;i++){await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+i*15,y:p.y+i*7,button:'left',buttons:1});await delay(35);}await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+60,y:p.y+28,button:'left',buttons:0,clickCount:1});
   for(let i=0;i<300;i++){const value=saved(n).nodes.find(x=>x.system_id===first.id);if(value.x!==beforePosition.x||value.y!==beforePosition.y)break;await delay(25);}await page.waitFor("document.querySelector('.jspace-workspace-stage')?.getAttribute('aria-busy')==='false'&&!document.querySelector('.jspace-saving')");const value=saved(n).nodes.find(x=>x.system_id===first.id);check(n+' native drag saves changed position',value.x!==beforePosition.x||value.y!==beforePosition.y);await delay(150);
  });
  await fit();await sample(n,'zoom-control',async()=>{for(let i=0;i<3;i++){await click('[aria-label="Zoom in on chain"]');await delay(600);}});await fit();await sample(n,'pan-control',pan);
 }
 await captureScripts();check('no frontend exceptions',!result.errors.length);check('no external server traffic',!result.external.length);check('one EventSource',result.requests.filter(r=>r.url==='/api/events').length===1);
 if(mode==='coverage')check('refresh/change samples observed the exact JSpaceMap props owner',result.samples.filter(s=>!s.label.endsWith('-control')).every(s=>s.observed.rows.length>0));
 assert.equal(hash(await readFile(new URL(import.meta.url))),result.harnessSha256);assert.equal(hash(await readFile(new URL('../../../../../../rc16/historical/tests/performance/chrome.mjs',import.meta.url))),result.helperSha256);await verifySource(source);result.sourceVerified=true;result.complete=true;
}catch(error){result.failure=error.stack;if(page)result.failureState=await page.evaluate("({body:document.body.innerText.slice(-10000),url:location.href})").catch(()=>null);throw error;}
finally{
 if(activeCoverage)await page?.call('Profiler.stopPreciseCoverage').catch(()=>{});if(activeProfile)await page?.call('Profiler.stop').catch(()=>{});
 try{await browser?.close();await app?.close();result.cleanupComplete=true;}catch(error){result.cleanupFailure=error.stack;result.complete=false;}
 result.endedAt=new Date().toISOString();await write(output,result);await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
assert.equal(result.complete,true);
