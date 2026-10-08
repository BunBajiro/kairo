// Current-source R1 external acceptance worker; original historical harness is unchanged.
// Derived from the frozen replay worker, with post-timing UI oracle and verified cleanup.
// KAIRO_REPLAY_CASE=repeat-small | repeat-cap | distinct-cap (default).
// Do not claim acceptance until exact-source builds run in matched ABBA order.
// Acquire the shared timing lock externally for EVERY runtime invocation (including smoke):
// flock /tmp/kairo-rc16-benchmark.lock env KAIRO_CHROME_PATH=/tmp/kairo-chromium KAIRO_BENCH_SOURCE_COMMIT=57c8dcc7fbd8fc2b62129498d1819050c78381a1 node analysis/rc16/followup/harness/frontend-retention-replay.mjs
// KAIRO_FOLLOWUP_SMOKE=1 reduces coverage; smoke output is not performance evidence.
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir,cpus,totalmem} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
const repo=resolve(process.env.KAIRO_BENCH_REPO||'.');
const {openStore}=await import(pathToFileURL(join(repo,'server/store.mjs')));
const {startKairo}=await import(pathToFileURL(join(repo,'server/index.mjs')));
const overviewOnly=false;
const replayCase=process.env.KAIRO_REPLAY_CASE||'distinct-cap';
if(!['repeat-small','repeat-cap','distinct-cap'].includes(replayCase))throw Error('Unknown replay case');
const {getUniverseStatic}=await import(pathToFileURL(join(repo,'server/universe-static.mjs')));
const output=resolve(process.env.KAIRO_FOLLOWUP_FRONTEND_OUTPUT||'analysis/rc17/completion/session-replay/compiled-trial.json');
const smoke=process.env.KAIRO_FOLLOWUP_SMOKE==='1';
const retentionMode=process.env.KAIRO_REPLAY_RETENTION_MODE||'full', profiling=process.env.KAIRO_REPLAY_PROFILE==='1', schematicPreference=process.env.KAIRO_REPLAY_SCHEMATIC==='1';
if(!['none','focused','full'].includes(retentionMode))throw Error('Invalid retention mode');
const dir=await mkdtemp(join(tmpdir(),'kairo-rc16-frontend-'));const dataDir=join(dir,'data');
let app,proc,ws,seq=0;const pending=new Map(),errors=[],network=[],external=[],browserExternal=[],browserExternalById=new Map(),networkById=new Map();
const replayPayloads=new Map();
const sourceHashes={};for(const p of ['package.json','server/index.mjs','server/store.mjs','components/kairo/dashboard.tsx','components/kairo/session-replay.tsx','components/kairo/universe.tsx','server/universe-static.mjs'])sourceHashes[p]=createHash('sha256').update(await (await import('node:fs/promises')).readFile(join(repo,p))).digest('hex');
for(const p of ['components/kairo/session-replay-timeline.mjs']){try{sourceHashes[p]=createHash('sha256').update(await (await import('node:fs/promises')).readFile(join(repo,p))).digest('hex');}catch(error){if(error.code!=='ENOENT')throw error;sourceHashes[p]=null;}}
const result={schema:3,complete:false,cleanupVerified:false,profiles:[],renderedParity:[],purpose:'matched compiled replay geography/event-cap and retained ownership trial',replayCase,retention:[],ownership:[],harnessSha256:createHash('sha256').update(await (await import('node:fs/promises')).readFile(new URL(import.meta.url))).digest('hex'),sourceCommit:process.env.KAIRO_BENCH_SOURCE_COMMIT||null,sourceHashes,version:JSON.parse(await (await import('node:fs/promises')).readFile(join(repo,'package.json'),'utf8')).version,repo,overviewOnly,retentionMode,profiling,schematicPreference,startedAt:new Date().toISOString(),environment:{node:process.version,cpu:cpus()[0]?.model,logicalCpus:cpus().length,totalMemory:totalmem(),viewport:{width:1600,height:1050,dpr:1},chromeFlags:['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],limitations:['Synthetic connected pilot; no ESI traffic or real player credentials.','Headless Linux software rendering; no desktop GPU/FPS claim.','CDP TaskDuration covers renderer main-thread tasks, not total browser/worker/GPU CPU.','Two synthetic pilots each own 25/100-node maps. Replay uses1000 visits at60-second spacing. repeat-small uses200 events; repeat-cap/distinct-cap use10000. Distinct geography uses1000 different known systems and does not claim confirmed gate travel.','Browser HTTPS and known image CDN HTTP requests blocked using CDP; application CSP restricts connections to same-origin.', profiling?'Instrumentation: canvas clearRect counter, long-task observer, CDP metrics/network and separate sampled playback CPU profiles; these durations are diagnostic only.':'Instrumentation: canvas clearRect counter and long-task observer, CDP metrics and network events; no CPU profile. Forced GC, DOM counters and global listener inspection run outside timed samples.', 'Idle samples have no RAF probe. Interaction samples have an RAF interval observer; identical for all sizes.','Retention snapshots use three explicit GC passes after two seconds on Overview; this is retained-heap diagnosis, not natural-GC memory or desktop residency. No leak inference from RSS.'],smoke},fixture:{},samples:[],requests:network,errors};
function call(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},30000);pending.set(id,{resolve:x=>{clearTimeout(timer);resolve(x);},reject:x=>{clearTimeout(timer);reject(x);}});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function waitFor(expression){for(let i=0;i<300;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Condition failed: '+expression);}
async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing element');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await call('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
const metrics=async()=>Object.fromEntries((await call('Performance.getMetrics')).metrics.map(v=>[v.name,v.value]));
function percentile(a,p){if(!a.length)return null;const s=[...a].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor((s.length-1)*p))];}
async function sample(name,action,{frames=false,metadata={}}={}){
 await evaluate(`window.__sample={active:true,draws:0,longTasks:[],frames:[],last:null,framesOn:${frames}};if(window.__sample.framesOn){const s=window.__sample;requestAnimationFrame(function tick(t){if(window.__sample!==s||!s.framesOn)return;if(s.last!==null)s.frames.push(t-s.last);s.last=t;requestAnimationFrame(tick);});}`);
 if(profiling&&name.includes('playback')){await call('Profiler.enable');await call('Profiler.setSamplingInterval',{interval:1000});await call('Profiler.start');}
 const first=await metrics(),start=performance.now(),netIndex=network.length;
 await action();
 if(profiling&&name.includes('playback')){const {profile}=await call('Profiler.stop');
  assert.ok(Array.isArray(profile.nodes)&&profile.nodes.length&&Array.isArray(profile.samples)&&profile.samples.length&&Array.isArray(profile.timeDeltas)&&profile.timeDeltas.length===profile.samples.length&&profile.endTime>profile.startTime,'Complete sampled CPU profile');
  const ids=new Set(profile.nodes.map(node=>node.id));assert.ok(profile.samples.every(id=>ids.has(id)),'Profile samples reference captured nodes');
  const path=output+'.'+name+'.cpuprofile',bytes=JSON.stringify(profile);await writeFile(path,bytes,{flag:'wx'});result.profiles.push({name,path,bytes:Buffer.byteLength(bytes),sha256:createHash('sha256').update(bytes).digest('hex'),nodes:profile.nodes.length,samples:profile.samples.length,startTime:profile.startTime,endTime:profile.endTime});await call('Profiler.disable');}
 const last=await metrics(),windowMs=performance.now()-start,observed=await evaluate('window.__sample.framesOn=false;window.__sample.active=false;window.__sample');
 if(frames&&observed.frames.some(value=>value<=0))throw Error('Invalid duplicate or nonmonotonic RAF observer timestamp in '+name);
 const surface=await evaluate(`({domElementCount:document.querySelectorAll('*').length,mapNodes:document.querySelectorAll('.jspace-node').length,camera:document.querySelector('[data-testid=\"jspace-map\"]')?.dataset.cameraZoom||null})`);
 const record={name,...metadata,...surface,windowMs,taskMs:(last.TaskDuration-first.TaskDuration)*1000,scriptMs:(last.ScriptDuration-first.ScriptDuration)*1000,layoutMs:(last.LayoutDuration-first.LayoutDuration)*1000,recalcMs:(last.RecalcStyleDuration-first.RecalcStyleDuration)*1000,layouts:last.LayoutCount-first.LayoutCount,recalcs:last.RecalcStyleCount-first.RecalcStyleCount,heapUsed:last.JSHeapUsedSize,heapTotal:last.JSHeapTotalSize,domNodes:last.Nodes,canvasDraws:observed.draws,longTasks:observed.longTasks,raf:frames?{count:observed.frames.length,p50:percentile(observed.frames,.5),p95:percentile(observed.frames,.95),max:Math.max(0,...observed.frames),over33ms:observed.frames.filter(n=>n>33.4).length}:null,requests:network.slice(netIndex)};
 result.samples.push(record);await writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify({name,taskMs:record.taskMs,windowMs,draws:record.canvasDraws,longTasks:record.longTasks.length,raf:record.raf}));return record;
}
// Each scenario is fixed relative to one base time; sessions do not overlap.
function seed(){
 const atlas=getUniverseStatic(),known=atlas.systems.filter(s=>s.space==='known'),byId=new Map(known.map(s=>[s.system_id,s])),adj=new Map();
 for(const g of atlas.gates){for(const [a,b] of [[g.from_system_id,g.to_system_id],[g.to_system_id,g.from_system_id]])if(byId.has(a)&&byId.has(b)){if(!adj.has(a))adj.set(a,[]);adj.get(a).push(b);}}
 for(const [id,edges] of adj)adj.set(id,[...new Set(edges)].sort((a,b)=>a-b));
 const jita=known.find(s=>s.name==='Jita').system_id,queue=[jita],seen=new Set(queue);
 for(let i=0;i<queue.length&&queue.length<100;i++)for(const n of adj.get(queue[i])||[])if(!seen.has(n)){seen.add(n);queue.push(n);if(queue.length===100)break;}
 const walk=[jita];for(let i=1;i<1000;i++){const edges=adj.get(walk[i-1]).filter(n=>n!==walk[i-2]),options=edges.length?edges:adj.get(walk[i-1]);walk.push(options[(i*17+Math.floor(i/7))%options.length]);}
 if(replayCase==='distinct-cap')walk.splice(0,walk.length,...known.slice(0,1000).map(s=>s.system_id));
 const db=openStore(dataDir),now=Date.now(),at=new Date(now).toISOString(),ready=data=>({status:'ready',data,updatedAt:at,expiresAt:new Date(now+86400000).toISOString()});
 db.db.exec('CREATE TABLE IF NOT EXISTS universe_records(character_id INTEGER NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(character_id,kind,id))');
 result.fixture={characters:[],maps:[],replays:[],spacingMs:60000,staticSystems:atlas.systems.length,knownSystems:known.length,gates:atlas.gates.length};
 for(const id of [42,43]){
  const name='Synthetic Followup Pilot '+id;db.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(id,name,'[]','synthetic-unusable-token');
  db.saveSnapshot(id,'profile',ready({name,character_id:id,alliance_id:88,corporation_id:99}));db.saveSnapshot(id,'location',ready({solar_system_id:queue[id-42]}));result.fixture.characters.push({id,name});
  for(const n of [25,100]){const ids=new Set(queue.slice(0,n)),nodes=[...ids].map((system_id,i)=>({system_id,x:i%Math.ceil(Math.sqrt(n))*340,y:Math.floor(i/Math.ceil(Math.sqrt(n)))*240,alias:'',label:'',description:'',status:'unknown',role:'',locked:false,tags:[]}));
   const connections=atlas.gates.filter(g=>ids.has(g.from_system_id)&&ids.has(g.to_system_id)).map((g,i)=>({id:`followup-${id}-${n}-edge-${i}`,kind:'gate',from_system_id:g.from_system_id,to_system_id:g.to_system_id}));
   const map={id:`followup-${id}-${n}`,name:`Pilot ${id} ${n}-system fixture`,description:'Synthetic follow-up ownership fixture',revision:1,scope:null,scope_version:2,created_at:at,updated_at:at,track_passages:false,nodes,connections,passages:[],observations:[],comments:[],pings:[],activity:[],pilots:[]};
   db.db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?)').run(id,'jspace_map',map.id,JSON.stringify(map),at);result.fixture.maps.push({id:map.id,characterId:id,nodes:n,connections:connections.length});
  }
 }
 db.set('names',{88:'Synthetic pilot alliance',99:'Synthetic corporation'});
 for(const [index,n] of [1000].entries()){
  const start=now-10*86400000+index*2*86400000,end=start+n*60000,id='followup-replay-'+n,started=new Date(start).toISOString(),ended=new Date(end).toISOString();
  db.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)').run(id,42,n+'-visit synthetic recorded journey',started,ended,JSON.stringify({capturedAt:started,system:{id:walk[0],name:byId.get(walk[0]).name}}),JSON.stringify({capturedAt:ended,system:{id:walk[n-1],name:byId.get(walk[n-1]).name}}));
  for(let i=0;i<n;i++){
   db.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(42,walk[i],byId.get(walk[i]).name,new Date(start+i*60000).toISOString());

  }
  const eventCount=replayCase==='repeat-small'?200:10000;
  for(let i=0;i<eventCount;i++){const offset=(i+.5)/eventCount*n*60000,visitIndex=Math.floor(offset/60000);db.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)').run(42,'ship.changed','ship','Synthetic recorded activity '+i,JSON.stringify({solar_system_id:walk[visitIndex],ship_type_id:587}),new Date(start+offset).toISOString());}
  result.fixture.replays.push({id,characterId:42,visits:n,events:eventCount,travel:n-1,durationMs:n*60000,uniqueSystems:new Set(walk.slice(0,n)).size,firstSystem:byId.get(walk[0]).name,lastSystem:byId.get(walk[n-1]).name,started,ended,routeSha256:createHash('sha256').update(JSON.stringify(walk.slice(0,n))).digest('hex')});
 }
 db.close();
}
async function clickExpression(expression){const p=await evaluate(`(()=>{const e=${expression};if(!e)throw Error('Missing expression element');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);for(const type of ['mouseMoved','mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...p,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});}
async function go(name){await click('[data-route="'+name+'"]');await waitFor(`location.hash===${JSON.stringify('#'+name)}`);if(name.startsWith('universe'))await waitFor("!!document.querySelector('.universe-module') && !document.querySelector('.universe-loading')");await delay(350);}
async function choosePilot(id){await click('[aria-label="Active character"]');await clickExpression(`[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.trim()===${JSON.stringify('Synthetic Followup Pilot ')}+${id})`);await waitFor(`localStorage.getItem('kairo-character')==='${id}' && document.querySelector('[aria-label="Active character"]')?.textContent.includes('${id}')`);await delay(350);}
async function openMap(id,n){await waitFor(`!!document.querySelector('[aria-label="Open map Pilot ${id} ${n}-system fixture"]') || !![...document.querySelectorAll('[aria-label="Active J-Space map"] option')].find(e=>e.value==='followup-${id}-${n}')`);if(!await evaluate("!!document.querySelector('[aria-label=\"Active J-Space map\"]')"))await click(`[aria-label="Open map Pilot ${id} ${n}-system fixture"]`);else await evaluate(`(()=>{const e=document.querySelector('[aria-label="Active J-Space map"]');e.value='followup-${id}-${n}';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await waitFor(`document.querySelector('[aria-label="Active J-Space map"]')?.value==='followup-${id}-${n}' && document.querySelectorAll('.jspace-node').length===${n}`);await delay(350);}
async function prepareReplay(n){await go('overview');await evaluate(`sessionStorage.setItem('kairo-universe-replay',JSON.stringify({sessionId:'followup-replay-${n}',characterId:42}))`);await go('universe-kspace');await waitFor(`!!document.querySelector('[aria-label="Play session replay"]:not([disabled])') && Number(document.querySelector('[aria-label="Session replay time"]')?.max)===${n*60000}`);}
async function replayState(){return evaluate(`({playing:!!document.querySelector('[aria-label="Pause session replay"]'),elapsed:Number(document.querySelector('[aria-label="Session replay time"]')?.value),duration:Number(document.querySelector('[aria-label="Session replay time"]')?.max),location:document.querySelector('.session-replay-location strong')?.textContent,title:document.querySelector('.session-replay-title h3')?.textContent})`);}
async function seekKey(key){await evaluate(`document.querySelector('[aria-label="Session replay time"]').focus()`);await call('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:{Home:36,End:35,ArrowLeft:37}[key]});await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:{Home:36,End:35,ArrowLeft:37}[key]});await delay(150);}
async function validateReplay(n){const item=[...network].reverse().find(r=>r.url.includes('/sessions/followup-replay-'+n+'/replay?character=42'));if(!item)throw Error('Missing replay request');await waitFor("!!document.querySelector('.session-replay-title h3')");const response=await call('Network.getResponseBody',{requestId:item.requestId}),data=JSON.parse(response.body),fixture=result.fixture.replays.find(v=>v.visits===n);const actual={visits:data.visits.length,events:data.events.length,travel:data.travel.length,durationMs:data.durationMs,uniqueSystems:new Set(data.visits.map(v=>v.systemId)).size,owner:data.session.character_id,live:data.session.live,gaps:data.coverage.gaps.length,missingCoordinates:data.coverage.missingCoordinateSystemIds.length,inferredVisits:data.coverage.inferredVisitCount,truncated:data.coverage.truncated};for(const k of ['visits','events','travel','durationMs','uniqueSystems'])if(actual[k]!==fixture[k])throw Error('Fixture mismatch '+k+' '+JSON.stringify(actual));if(actual.owner!==42||actual.live||actual.gaps||actual.missingCoordinates||actual.inferredVisits||actual.truncated)throw Error('Fixture coverage failure '+JSON.stringify(actual));actual.routeSha256=createHash('sha256').update(JSON.stringify(data.visits.map(v=>v.systemId))).digest('hex');if(actual.routeSha256!==fixture.routeSha256)throw Error('Returned replay route sequence differs from seeded route');fixture.validated=actual;fixture.responseBytes=Buffer.byteLength(response.body);replayPayloads.set(n,{data,body:response.body});}
// Independent direct scans of the actual returned payload; never import the candidate index.
// All rendered checks and control clicks run after all three ordinary sample windows.
function directReplayOracle(data,elapsed){
 const start=Date.parse(data.startedAt),end=Date.parse(data.endedAt),at=start+elapsed;
 const visits=data.visits.map(v=>({...v,start:Date.parse(v.entered),end:v.exited?Date.parse(v.exited):end})).sort((a,b)=>a.start-b.start);
 const events=data.events.filter(e=>!['system.entered','location.changed'].includes(e.type)&&!e.type.startsWith('opsec.')&&e.module!=='opsec').map(e=>({...e,time:Date.parse(e.at)})).sort((a,b)=>a.time-b.time);
 const currentVisit=[...visits].reverse().find(v=>v.start<=at&&(at<v.end||at===v.end&&at===end))||null;
 const recent=events.filter(e=>e.time<=at).slice(-5).reverse();
 const previousVisit=[...visits].reverse().find(v=>v.start<at-1000),nextVisit=visits.find(v=>v.start>at);
 const previousEvent=[...events].reverse().find(e=>e.time<at),nextEvent=events.find(e=>e.time>at);
 const stride=Math.max(1,Math.ceil(events.length/120));
 return {elapsed,duration:data.durationMs,at,currentVisit:currentVisit?{id:currentVisit.id,systemId:currentVisit.systemId,name:currentVisit.name}:null,
  location:currentVisit?.name||'Location not recorded',ticks:events.filter((_,i)=>i%stride===0).length,
  recent:recent.map(e=>({summary:e.summary||e.type,at:e.at,location:(e.system_name||'Location unavailable')+(e.location_basis==='observed_visit'?' · pilot context':e.location_basis?.includes('inferred')?' · inferred context':'')})),
  controls:{'Previous recorded event':{disabled:!previousEvent,target:previousEvent?previousEvent.time-start:null},'Next recorded event':{disabled:!nextEvent,target:nextEvent?nextEvent.time-start:null},'Previous recorded system':{disabled:false,target:previousVisit?previousVisit.start-start:0},'Next recorded system':{disabled:false,target:nextVisit?nextVisit.start-start:data.durationMs}}};
}
async function seekExact(elapsed){
 await evaluate(`(()=>{const e=document.querySelector('[aria-label="Session replay time"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${elapsed});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await waitFor(`Number(document.querySelector('[aria-label="Session replay time"]')?.value)===${elapsed}&&!document.querySelector('[aria-label="Pause session replay"]')`);await delay(100);
}
async function renderedOracleCheck(n,label,elapsed){
 assert.equal(result.samples.length,3,'Rendered controls run only after the original three sample windows');
 assert.equal(await evaluate('window.__sample.active||window.__sample.framesOn'),false,'No active ordinary measurement');
 const expected=directReplayOracle(replayPayloads.get(n).data,elapsed),labels=Object.keys(expected.controls);
 const actual=await evaluate(`({elapsed:Number(document.querySelector('[aria-label="Session replay time"]')?.value),duration:Number(document.querySelector('[aria-label="Session replay time"]')?.max),playing:!!document.querySelector('[aria-label="Pause session replay"]'),location:document.querySelector('.session-replay-location strong')?.textContent,time:document.querySelector('.session-replay-status > time')?.getAttribute('datetime'),valueText:document.querySelector('[aria-label="Session replay time"]')?.getAttribute('aria-valuetext'),ticks:document.querySelectorAll('.session-replay-ticks i').length,recent:[...document.querySelectorAll('.session-replay-event-list .session-replay-event')].map(e=>({summary:e.querySelector('.session-replay-event-content strong')?.textContent,at:e.querySelector('time')?.getAttribute('datetime'),location:e.querySelector('.session-replay-event-location')?.textContent})),controls:Object.fromEntries(${JSON.stringify(labels)}.map(label=>[label,{present:!!document.querySelector('[aria-label="'+label+'"]'),disabled:document.querySelector('[aria-label="'+label+'"]')?.disabled}]))})`);
 const record={label,visits:n,expected,actual,passed:false};result.renderedParity.push(record);
 assert.equal(actual.elapsed,expected.elapsed,label+' exact seek');assert.equal(actual.duration,expected.duration);assert.equal(actual.playing,false);
 assert.equal(actual.location,expected.location,label+' current visit label');assert.equal(Date.parse(actual.time),expected.at,label+' displayed UTC instant');assert.ok(actual.valueText.endsWith(expected.currentVisit?', '+expected.location:', location unavailable'));
 assert.equal(actual.ticks,expected.ticks,label+' timeline tick cardinality');assert.deepEqual(actual.recent,expected.recent,label+' newest five event summaries/timestamps/location/order');
 for(const key of labels){assert.equal(actual.controls[key].present,true,key+' exists');assert.equal(actual.controls[key].disabled,expected.controls[key].disabled,key+' availability');}
 record.passed=true;return expected;
}
async function renderedReplayParity(n){
 const payload=replayPayloads.get(n);assert.ok(payload,'The direct oracle requires the actual replay response');
 const path=output+'.replay-'+n+'.json';await writeFile(path,payload.body,{flag:'wx'});result.fixture.replays.find(v=>v.visits===n).responseArtifact={path,bytes:Buffer.byteLength(payload.body),sha256:createHash('sha256').update(payload.body).digest('hex')};
 for(const [label,elapsed]of[['home',0],['fixed-midpoint',payload.data.durationMs/2],['exact-end',payload.data.durationMs]]){
  await seekExact(elapsed);const origin=await renderedOracleCheck(n,label,elapsed);
  for(const [control,expected]of Object.entries(origin.controls)){
   await seekExact(elapsed);
   if(!expected.disabled){await click('[aria-label="'+control+'"]');await waitFor(`Number(document.querySelector('[aria-label="Session replay time"]')?.value)===${expected.target}&&!document.querySelector('[aria-label="Pause session replay"]')`);await delay(100);}
   const row=await renderedOracleCheck(n,label+' / '+control,expected.disabled?elapsed:expected.target);result.renderedParity.at(-1).control={label:control,from:elapsed,clicked:!expected.disabled,target:row.elapsed};
  }
 }
}
async function globalListeners(){const counts={};for(const target of ['window','document']){const object=await call('Runtime.evaluate',{expression:target,objectGroup:'retention-listeners'});const {listeners}=await call('DOMDebugger.getEventListeners',{objectId:object.result.objectId});counts[target]={};for(const l of listeners){const k=l.type+':'+l.useCapture;counts[target][k]=(counts[target][k]||0)+1;for(const obj of [l.handler,l.originalHandler])if(obj?.objectId)await call('Runtime.releaseObject',{objectId:obj.objectId}).catch(()=>{});}}await call('Runtime.releaseObjectGroup',{objectGroup:'retention-listeners'});return counts;}
async function checkpoint(label,completedCycles){await go('overview');await delay(2000);const listeners=await globalListeners();const overview=await evaluate(`({pilot:localStorage.getItem('kairo-character'),elements:document.querySelectorAll('*').length,canvases:document.querySelectorAll('.universe-module canvas').length,mapNodes:document.querySelectorAll('.jspace-node').length,replayControls:document.querySelectorAll('.session-replay').length})`);if(overview.pilot!=='42'||overview.canvases||overview.mapNodes||overview.replayControls)throw Error('Quiescent surface ownership failure');const gc=[];for(let pass=0;pass<3;pass++){await call('HeapProfiler.collectGarbage');await delay(100);gc.push({heap:await call('Runtime.getHeapUsage'),dom:await call('Memory.getDOMCounters')});}const targets=(await call('Target.getTargets')).targetInfos.map(t=>({type:t.type,url:t.url.startsWith('http')?new URL(t.url).pathname:t.url}));const item={label,completedCycles,at:new Date().toISOString(),quiescenceMs:2000,forcedGcPasses:3,overview,listeners,gc,targets};result.retention.push(item);await writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify({checkpoint:label,completedCycles,lastGc:gc.at(-1),listeners}));}
async function ownershipCheck(label){const start=network.length;await evaluate("for(const characterId of [42,43])window.dispatchEvent(new CustomEvent('kairo:universe-changed',{detail:{characterId}}))");await delay(800);const requests=network.slice(start);const stale=requests.filter(r=>r.method==='GET'&&r.url.startsWith('/api/universe'));result.ownership.push({label,requests,staleUniverseRequests:stale.length});if(stale.length)throw Error('Unmounted universe still fetched: '+JSON.stringify(stale));}
async function navigationCycle(index){
 await go('universe-kspace');await clickExpression("[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Layers & views'))");
 for(const text of ['Local radar','Physical']){await clickExpression(`[...document.querySelectorAll('[aria-label="Map projection"] button')].find(e=>e.textContent===${JSON.stringify(text)})`);await delay(250);}
 await click('[aria-label="Close layers"]');await go('universe-jspace');await openMap(42,100);await openMap(42,25);
 await choosePilot(43);await waitFor("!document.querySelector('.jspace-workspace-loading')");await openMap(43,100);await openMap(43,25);
 await go('overview');await choosePilot(42);await prepareReplay(1000);await click('[aria-label="Play session replay"]');await delay(350);await click('[aria-label="Pause session replay"]');
 const switchStart=network.length;await choosePilot(43);await waitFor("!document.querySelector('[aria-label=\"Session replay time\"]') && (!document.querySelector('.session-replay') || document.querySelector('.session-replay-error')?.textContent.includes('different pilot'))");
 const wrongOwner=network.slice(switchStart).filter(r=>r.url.includes('/sessions/followup-replay-1000/replay?character=43'));
 if(wrongOwner.length)throw Error('Prior pilot replay requested for replacement pilot');
 result.pilotFencing??=[];result.pilotFencing.push({index,pilot:43,previousReplayVisible:false,wrongOwnerRequests:0,disposition:await evaluate("document.querySelector('.session-replay-error')?'ownership-error':'replay-unmounted'")});
 if(await evaluate("!!document.querySelector('[aria-label=\"Close session replay\"]')"))await click('[aria-label="Close session replay"]');await go('overview');await choosePilot(42);await ownershipCheck('after-cycle-'+index);
}

try{
 await mkdir(resolve(output,'..'),{recursive:true});seed();const deny=async url=>{external.push(String(url));throw Error('External networking disabled by analysis fixture');};
 app=await startKairo({port:18690,streamPort:18691,dataDir,noSync:true,fetcher:deny,universe:{operations:{noSync:true,fetcher:deny},feeds:{noSync:true,fetcher:deny}}});
 proc=spawn(process.env.KAIRO_CHROME_PATH||'/tmp/kairo-chromium',[...result.environment.chromeFlags,'--no-first-run','--remote-debugging-port=0','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:['ignore','ignore','pipe']});
 const socket=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Chrome launch '+log)),20000);proc.stderr.on('data',b=>{log+=b;const m=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});proc.on('error',reject);});
 const target=await(await fetch('http://'+new URL(socket).host+'/json/new?about:blank',{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(JSON.stringify(m.error))):p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Network.requestWillBeSent'&&m.params.request.url.includes('/api/')){const item={requestId:m.params.requestId,at:m.params.timestamp,url:new URL(m.params.request.url).pathname+new URL(m.params.request.url).search,method:m.params.request.method};network.push(item);networkById.set(m.params.requestId,item);}else if(m.method==='Network.requestWillBeSent'&&!m.params.request.url.startsWith(app.origin)&&/^https?:/.test(m.params.request.url)){const item={url:m.params.request.url,method:m.params.request.method};browserExternal.push(item);browserExternalById.set(m.params.requestId,item);}else if(m.method==='Network.responseReceived'){const blocked=browserExternalById.get(m.params.requestId);if(blocked)blocked.status=m.params.response.status;const item=networkById.get(m.params.requestId);if(item){item.status=m.params.response.status;item.responseHeadersMs=(m.params.timestamp-item.at)*1000;}}else if(m.method==='Network.loadingFinished'){const item=networkById.get(m.params.requestId);if(item){item.totalMs=(m.params.timestamp-item.at)*1000;item.encodedBytes=m.params.encodedDataLength;}}});
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Network.setBlockedURLs',{urls:['https://*','http://images.evetech.net/*','http://web.ccpgamescdn.com/*']});await call('Performance.enable');result.environment.browser=await call('Browser.getVersion');await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1050,deviceScaleFactor:1,mobile:false});
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.__sample={active:false,draws:0,longTasks:[],frames:[],framesOn:false};new PerformanceObserver(list=>{if(window.__sample.active)window.__sample.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})));}).observe({entryTypes:['longtask']});const clear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...a){if(window.__sample.active&&this.canvas.closest('.universe-module'))window.__sample.draws++;return clear.apply(this,a);};`});
 await call('Page.navigate',{url:app.origin+'/#overview'});await waitFor("!!document.querySelector('.connection-status.online')");await delay(1800);result.startup={rendererMetrics:await metrics(),navigation:await evaluate("performance.getEntriesByType('navigation').map(e=>e.toJSON())"),resources:await evaluate("performance.getEntriesByType('resource').filter(e=>e.name.includes('/assets/')).map(e=>({url:new URL(e.name).pathname,duration:e.duration,transferSize:e.transferSize,decodedBodySize:e.decodedBodySize}))")};result.environment.webgl=await evaluate(`(()=>{const c=document.createElement('canvas'),g=c.getContext('webgl');if(!g)return null;const e=g.getExtension('WEBGL_debug_renderer_info');return{vendor:e&&g.getParameter(e.UNMASKED_VENDOR_WEBGL),renderer:e&&g.getParameter(e.UNMASKED_RENDERER_WEBGL)};})()`);
 result.builtAssetHashes={};for(const resource of result.startup.resources)result.builtAssetHashes[resource.url]=createHash('sha256').update(await (await import('node:fs/promises')).readFile(join(repo,'dist/client',resource.url))).digest('hex');
 // Warm Atlas data/scene once before comparing replay preparations. No explicit GC yet.
 await go('universe-kspace');await waitFor("!!document.querySelector('.universe-module canvas')");await delay(800);
 if(schematicPreference){
  await clickExpression("[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Layers & views'))");
  await clickExpression("[...document.querySelectorAll('[aria-label=\"Map projection\"] button')].find(e=>e.textContent==='Schematic')");
  await waitFor("[...document.querySelectorAll('[aria-label=\"Map projection\"] button')].find(e=>e.textContent==='Schematic')?.getAttribute('aria-pressed')==='true'");
  await click('[aria-label="Close layers"]');
 }
 await go('overview');
 if(retentionMode==='focused')await checkpoint('warmed-atlas-before-replay',0);
 // Ordinary (retentionMode=none/full) replay timings precede explicit GC. Focused
 // retention runs are separate diagnostics and never pooled with ordinary timings.
 for(const n of [1000]){
  await sample('replay-prepare',()=>prepareReplay(n),{metadata:{visits:n,warmAtlas:true,includes:'Overview to Atlas navigation, replay API/parse, readiness and two fixed 350ms settles; 100ms readiness polling'}});await validateReplay(n);
  await evaluate(`(()=>{const e=document.querySelector('[aria-label="Replay speed"]');e.value='60';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sample('replay-playback-start-60x',async()=>{await click('[aria-label="Play session replay"]');await delay(smoke?800:6000);if(await evaluate("!!document.querySelector('[aria-label=\"Pause session replay\"]')"))await click('[aria-label="Pause session replay"]');},{frames:true,metadata:{visits:n,speed:60}});
  result.samples.at(-1).replayState=await replayState();if(result.samples.at(-1).replayState.playing||result.samples.at(-1).replayState.elapsed<=0)throw Error('Playback failed to advance and pause');
  await seekKey('Home');const beginning=await replayState();if(beginning.elapsed!==0||beginning.playing||beginning.location!==result.fixture.replays.find(v=>v.visits===n).firstSystem)throw Error('Backward Home seek failure '+JSON.stringify(beginning));result.fixture.replays.find(v=>v.visits===n).backwardStart=beginning;
  if(n>=100&&!smoke){await click('[aria-label="Session replay time"]');await delay(400);const before=await replayState();if(before.elapsed<before.duration*.4||before.elapsed>before.duration*.6)throw Error('Midpoint scrub outside middle 40-60%');await sample('replay-playback-middle-60x',async()=>{await click('[aria-label="Play session replay"]');await delay(6000);await click('[aria-label="Pause session replay"]');},{frames:true,metadata:{visits:n,speed:60,startElapsed:before.elapsed}});result.samples.at(-1).replayState=await replayState();if(result.samples.at(-1).replayState.playing||result.samples.at(-1).replayState.elapsed<=before.elapsed)throw Error('Midpoint playback failed to advance and pause');}
  await renderedReplayParity(n);
  await seekKey('End');let end=await replayState();const fixture=result.fixture.replays.find(v=>v.visits===n);if(end.elapsed!==end.duration||end.playing||end.location!==fixture.lastSystem)throw Error('Replay End failure '+JSON.stringify(end));
  await seekKey('ArrowLeft');await click('[aria-label="Play session replay"]');await waitFor("!!document.querySelector('[aria-label=\"Play session replay\"]')");end=await replayState();if(end.elapsed!==end.duration||end.playing)throw Error('Replay natural completion failure');fixture.endTransition=end;
  if(retentionMode==='focused'){const gc=[];for(let pass=0;pass<3;pass++){await call('HeapProfiler.collectGarbage');await delay(100);gc.push({heap:await call('Runtime.getHeapUsage'),dom:await call('Memory.getDOMCounters')});}result.mountedReplayRetention={state:await replayState(),gc,scope:'Renderer snapshot and full Atlas scene at exact end, diagnostic forced GC only; compared with warmed Overview before/after'};}
  await click('[aria-label="Close session replay"]');await go('overview');await ownershipCheck('after-replay-'+n);
 }
 // These are diagnostics only. Explicit GC never falls inside the timed samples above.
 if(retentionMode!=='none'){
 await checkpoint('before-navigation-warmup',0);for(let i=0;i<(smoke||retentionMode==='focused'?1:2);i++)await navigationCycle('warmup-'+i);await checkpoint('warmed-baseline',0);
 const batches=smoke||retentionMode==='focused'?1:3,perBatch=smoke?1:retentionMode==='focused'?2:4;for(let batch=1;batch<=batches;batch++){for(let i=0;i<perBatch;i++)await navigationCycle((batch-1)*perBatch+i+1);await checkpoint('after-batch-'+batch,batch*perBatch);}
 result.retentionMethod={warmupCycles:smoke||retentionMode==='focused'?1:2,measuredCycles:batches*perBatch,batches,cyclesPerBatch:perBatch,scope:'browser main renderer only; no RSS or backend retained-memory claim',gcTiming:retentionMode==='focused'?'Separate retained-heap diagnostic: forced GC on warmed Overview, exact-end mounted replay, and Overview ownership checkpoints. Its timing samples are not ordinary performance evidence.':'All explicit GC after replay timed samples, at quiescent Overview checkpoints only',expectedStable:'Global window/document listener signatures; no map/replay DOM on Overview; no universe requests after scoped event while unmounted. Browser internal cache growth may remain.'};
 }
 result.eventSourceRequests=network.filter(r=>r.url.startsWith('/api/events'));if(result.eventSourceRequests.length!==1)throw Error('Unexpected EventSource ownership count '+result.eventSourceRequests.length);

 result.externalFetches=external;result.blockedBrowserExternalAttempts=browserExternal;result.controls={successfulBrowserExternalResponses:browserExternal.filter(r=>r.status>=200&&r.status<400).length,rendererExceptions:errors.length,deniedBackendFetchAttempts:external.length};if(result.controls.successfulBrowserExternalResponses||errors.length||external.length)throw Error('Benchmark control failed: '+JSON.stringify(result.controls));assert.equal(result.profiles.length,profiling?2:0,'Two complete playback profiles only in a profile worker');result.measurementsFinishedAt=new Date().toISOString();
}catch(error){result.failure=String(error.stack||error);if(ws?.readyState===1)result.failureState=await evaluate("({url:location.href,body:document.body.innerText.slice(-10000)})").catch(()=>null);await writeFile(output,JSON.stringify(result,null,2));console.error(error);process.exitCode=1;}
finally{
 result.cleanup={startedAt:new Date().toISOString(),browserStarted:!!proc,appStarted:!!app,browserExited:!proc,appClosed:!app,scratchRemoved:false,failures:[]};
 try{ws?.close();}catch(error){result.cleanup.failures.push('WebSocket: '+String(error.stack||error));}
 try{
  if(proc&&proc.exitCode===null&&proc.signalCode===null){const exited=new Promise(resolve=>proc.once('exit',resolve));proc.kill('SIGTERM');await Promise.race([exited,delay(1500)]);if(proc.exitCode===null&&proc.signalCode===null){result.cleanup.forcedKill=true;proc.kill('SIGKILL');await Promise.race([exited,delay(500)]);}}
  result.cleanup.browserExited=!proc||proc.exitCode!==null||proc.signalCode!==null;result.cleanup.exitCode=proc?.exitCode??null;result.cleanup.signalCode=proc?.signalCode??null;
  assert.equal(result.cleanup.browserExited,true,'Chromium must actually exit before completion');
 }catch(error){result.cleanup.failures.push('Chromium: '+String(error.stack||error));}
 try{await app?.close();result.cleanup.appClosed=true;}catch(error){result.cleanup.failures.push('Application: '+String(error.stack||error));}
 try{await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});result.cleanup.scratchRemoved=true;}catch(error){result.cleanup.failures.push('Scratch: '+String(error.stack||error));}
 result.cleanup.endedAt=new Date().toISOString();result.cleanupVerified=result.cleanup.browserExited&&result.cleanup.appClosed&&result.cleanup.scratchRemoved&&!result.cleanup.failures.length;
 if(!result.cleanupVerified){result.cleanupFailure=result.cleanup.failures.join('\n')||'Incomplete cleanup';result.failure??=result.cleanupFailure;process.exitCode=1;}
 result.complete=!result.failure&&result.cleanupVerified;result.endedAt=new Date().toISOString();await writeFile(output,JSON.stringify(result,null,2));
}
