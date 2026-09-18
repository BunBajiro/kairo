// Browser acceptance checks for the compiled Universe module. Synthetic local
// data only; Node 24 and Chrome's DevTools protocol, without browser dependencies.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {openStore} from '../server/store.mjs';
import {startKairo} from '../server/index.mjs';

const chrome=process.env.KAIRO_CHROME_PATH||['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
if(!chrome)throw new Error('Chrome is required for the browser smoke test. Set KAIRO_CHROME_PATH.');
const dir=await mkdtemp(join(tmpdir(),'kairo-universe-ui-')),output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-screenshots';
await mkdir(output,{recursive:true});
let app,proc,ws;const pending=new Map(),errors=[],checks=[],renderChecks=[],typeChecks=[];let sequence=0;
const externalCalls=[];
const appOptions={port:Number(process.env.KAIRO_UNIVERSE_TEST_PORT||18590),streamPort:Number(process.env.KAIRO_UNIVERSE_TEST_PORT||18590)+1,dataDir:join(dir,'data'),noSync:true,fetcher:async url=>{externalCalls.push(String(url));throw new Error('External ESI access is disabled in this synthetic browser test');}};
function call(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timed out: '+method));},20000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value;}
async function waitFor(expression){for(let i=0;i<300;i++){if(await evaluate(expression))return;await delay(50);}throw new Error('Condition not met: '+expression);}
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
const element=selector=>'document.querySelector('+JSON.stringify(selector)+')';
async function click(selector){await clickElement(element(selector));}
async function button(text,scope='.universe-module'){await clickElement(`Array.from(document.querySelectorAll(${JSON.stringify(scope+' button')})).find(e=>e.textContent.trim()===${JSON.stringify(text)})`);}
async function fill(selector,text){await click(selector);await call('Input.dispatchKeyEvent',{type:'keyDown',modifiers:2,key:'a',code:'KeyA',windowsVirtualKeyCode:65});await call('Input.dispatchKeyEvent',{type:'keyUp',modifiers:2,key:'a',code:'KeyA',windowsVirtualKeyCode:65});await call('Input.insertText',{text});}
async function choose(label,text){
 await click('[aria-label='+JSON.stringify(label)+']');
 await clickElement(`Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent.trim()===${JSON.stringify(text)})`);
}
async function preset(name){
 const open=await evaluate("!!document.querySelector('[aria-label=\"Map view\"]')");
 if(!open)await button('Layers & views');
 await choose('Map view',name);
 if(!open)await click('[aria-label="Close layers"]');
}
async function space(name){await clickElement(`Array.from(document.querySelectorAll('[aria-label="Universe space"] [role="tab"]')).find(e=>e.querySelector('strong')?.textContent===${JSON.stringify(name)})`);}
async function screenshot(name){await evaluate('document.fonts.ready');await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'));}
async function api(path,method='GET',body){
 return evaluate(`(async()=>{const boot=await(await fetch('/api/bootstrap')).json();const response=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(method)},headers:{'content-type':'application/json','x-kairo-csrf':boot.csrf},${body===undefined?'':'body:'+JSON.stringify(JSON.stringify(body))+','}});const data=await response.json();if(!response.ok)throw new Error(JSON.stringify(data));return data;})()`);
}
async function viewport(width,height=1050){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(150);}
async function key(key,code,windowsVirtualKeyCode,text=''){
 await call('Input.dispatchKeyEvent',{type:text?'keyDown':'rawKeyDown',key,code,windowsVirtualKeyCode,text,unmodifiedText:text});
 await call('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode});
}
async function search(name){await fill('[aria-label="Find a solar system"]',name);await key('Enter','Enter',13,'\r');await waitFor(`document.querySelector('.universe-system-title h3')?.textContent===${JSON.stringify(name)}`);}
async function canvasHash(){return evaluate(`(()=>{const bytes=document.querySelector('.universe-module canvas').toDataURL();let hash=2166136261;for(let i=0;i<bytes.length;i++)hash=Math.imul(hash^bytes.charCodeAt(i),16777619);return hash>>>0;})()`);}
async function disclosure(label){await clickElement(`Array.from(document.querySelectorAll('.universe-disclosure summary')).find(e=>e.textContent.startsWith(${JSON.stringify(label)}))`);}
async function checkLabel(label,scope='.universe-module'){await clickElement(`Array.from(document.querySelectorAll(${JSON.stringify(scope+' label')})).find(e=>e.textContent.trim()===${JSON.stringify(label)})?.querySelector('input[type=checkbox]')`);}
const connection=label=>`Array.from(document.querySelectorAll('.universe-connection-card')).find(e=>e.querySelector(':scope > p')?.textContent===${JSON.stringify(label)})`;
async function layout(label,selector='.universe-module'){
 const bounds=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,page:document.documentElement.scrollWidth,content:e.scrollWidth,client:e.clientWidth};})()`);
 assert.ok(bounds.left>=0&&bounds.right<=bounds.width+1&&bounds.page<=bounds.width+1&&bounds.content<=bounds.client+1,label+': Universe fits horizontally '+JSON.stringify(bounds));
 checks.push(label);
}
async function readability(label,selectors){
 const sizes=await evaluate(`(()=>{const selectors=${JSON.stringify(selectors)};return selectors.map(([selector,minimum])=>{const elements=Array.from(document.querySelectorAll(selector));return {selector,minimum,count:elements.length,sizes:elements.map(e=>parseFloat(getComputedStyle(e).fontSize))};});})()`);
 for(const item of sizes){assert.ok(item.count,label+': expected readable content '+item.selector);assert.ok(item.sizes.every(size=>size>=item.minimum),label+': text size '+JSON.stringify(item));}
 typeChecks.push({label,sizes});
}
async function minimumZoom(label){
 await click('[aria-label="Fit map"]');await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10});await delay(250);
 assert.equal(await evaluate("document.querySelector('[aria-label=\"Zoom out\"]').disabled"),true,label+': fit is the minimum zoom');
 const fitted=await canvasHash();
 const point=await evaluate("(()=>{const e=document.querySelector('.universe-module canvas');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width*.57,y:r.y+r.height*.41};})()");
 for(let i=0;i<5;i++)await call('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:200});
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10});await delay(250);
 assert.equal(await canvasHash(),fitted,label+': repeated wheel zoom cannot recede beyond padded space bounds');
 assert.equal(await evaluate("document.querySelector('[aria-label=\"Zoom out\"]').disabled"),true);
 checks.push(label+' bounded minimum zoom');
}
async function vectorRendering(){
 // Browser-only instrumentation verifies the visible territory redraw uses
 // geometry, not a magnified bitmap or per-system radial halo texture.
 await evaluate(`(()=>{window.__mapPaint={raster:0,radial:0,vectorFills:0,vectorStrokes:0};window.__paintOriginals={};for(const name of ['drawImage','createRadialGradient','fill','stroke']){const original=CanvasRenderingContext2D.prototype[name];window.__paintOriginals[name]=original;CanvasRenderingContext2D.prototype[name]=function(...args){if(this.canvas.closest('.universe-module')){if(name==='drawImage')window.__mapPaint.raster++;if(name==='createRadialGradient')window.__mapPaint.radial++;if(args[0] instanceof Path2D)window.__mapPaint[name==='fill'?'vectorFills':'vectorStrokes']++;}return original.apply(this,args);};}})()`);
 try{
  await click('[aria-label="Fit map"]');await waitFor('window.__mapPaint.vectorStrokes>0');
  await evaluate("document.querySelector('.universe-canvas-shell').scrollIntoView({block:'center'})");await screenshot('universe-vector-borders-fit');
  await click('[aria-label="Zoom in"]');await click('[aria-label="Zoom in"]');await delay(100);
  await evaluate("document.querySelector('.universe-canvas-shell').scrollIntoView({block:'center'})");await screenshot('universe-vector-borders-zoom');
  const paints=await evaluate('window.__mapPaint');
  assert.equal(paints.raster,0,'Territory is not enlarged from a raster influence texture');
  assert.equal(paints.radial,0,'Ordinary map systems do not generate radial glow fields');
  assert.ok(paints.vectorFills>0&&paints.vectorStrokes>0,'Territories redraw as filled and stroked vector paths: '+JSON.stringify(paints));
  renderChecks.push(paints);
 }finally{await evaluate("for(const [name,original] of Object.entries(window.__paintOriginals))CanvasRenderingContext2D.prototype[name]=original");}
 checks.push('Territory redraw uses vector borders without scaled bitmap influence or system glow');
}
async function idleMetrics(){
 await call('Performance.enable');await delay(300);
 // Instrument only this disposable browser after interacting. This is never
 // compiled into the app, and distinguishes event-driven draws from a loop.
 await evaluate(`(()=>{window.__universeDraws=0;window.__originalClear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.closest('.universe-module'))window.__universeDraws++;return window.__originalClear.apply(this,args);};})()`);
 const before=Object.fromEntries((await call('Performance.getMetrics')).metrics.map(m=>[m.name,m.value])),start=Date.now();
 await delay(3000);
 const after=Object.fromEntries((await call('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 const draws=await evaluate('window.__universeDraws');
 await evaluate('CanvasRenderingContext2D.prototype.clearRect=window.__originalClear');
 const result={windowMs:Date.now()-start,canvasDraws:draws,taskMs:1000*(after.TaskDuration-before.TaskDuration),layoutMs:1000*(after.LayoutDuration-before.LayoutDuration),layouts:after.LayoutCount-before.LayoutCount};
 assert.ok(draws<=3,'An idle map must not run a perpetual animation loop: '+JSON.stringify(result));
 return result;
}
async function startBrowser(){
 proc=spawn(chrome,['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:['ignore','ignore','pipe']});
 const browserURL=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(new Error('Chrome did not start: '+log.slice(-1000))),20000);proc.stderr.on('data',b=>{log+=b;const m=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});proc.on('error',reject);proc.on('exit',code=>{clearTimeout(timer);reject(new Error('Chrome exited: '+code+' '+log.slice(-1000)));});});
 const endpoint=new URL(browserURL),target=await(await fetch('http://'+endpoint.host+'/json/new?about:blank',{method:'PUT'})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(new Error(JSON.stringify(m.error)));else p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 await call('Page.enable');await call('Runtime.enable');await viewport(1600);
}

try{
 app=await startKairo(appOptions);
 await startBrowser();
 await call('Page.navigate',{url:app.origin+'/#universe'});
 // Acceptance scenarios follow the same public controls a pilot uses.
 await waitFor("!!document.querySelector('.universe-module canvas') && !!document.querySelector('.connection-status.online')");
 const atlas=await evaluate("(async()=>{const a=await(await fetch('/api/universe/static')).json(),origin=a.systems.find(s=>s.name==='UALX-3'),nearby=a.systems.find(s=>s.space==='known'&&s.security<.45&&s.system_id!==origin.system_id&&Math.hypot(s.x-origin.x,s.y-origin.y,s.z-origin.z)/9460730472580800<5);return {systems:a.systems.length,known:a.systems.filter(s=>s.space==='known').length,gates:a.gates.length,territory:a.systems.filter(s=>s.space==='known'&&s.security<.45).sort((a,b)=>a.map_x-b.map_x).map(s=>({system_id:s.system_id,map_x:s.map_x,map_y:s.map_y})),systemsByName:Object.fromEntries(a.systems.filter(s=>['Jita','Amarr','Perimeter','UALX-3','C-J6MT'].includes(s.name)).map(s=>[s.name,s.system_id])),wormhole:a.systems.find(s=>s.space==='wormhole'&&s.name.startsWith('J')&&s.wormhole_class<=6),nearby};})()");
 assert.ok(atlas.systems>8000&&atlas.known>5000&&atlas.gates>6000,'Full bundled universe is available without EVE authentication');
 assert.ok((await evaluate("document.querySelector('.universe-module canvas').getAttribute('aria-label')")).includes(atlas.known.toLocaleString('en-US')+' systems'));
 assert.equal((await api('/bootstrap')).characters.length,0);
 assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('[aria-label=\"Universe space\"] [role=tab] strong')).map(e=>e.textContent)"),['K-Space','J-Space']);
 await minimumZoom('Known space');
 await space('J-Space');await waitFor("document.querySelector('.universe-module')?.classList.contains('is-jspace')");
 assert.ok(await evaluate("document.querySelector('.universe-module canvas').getAttribute('aria-label').startsWith('Wormhole space')"));
 assert.equal(await evaluate("document.querySelector('[aria-label=\"Territory view\"]')"),null,'J-space has its own discovery controls');
 await screenshot('universe-jspace-empty');await space('K-Space');
 await readability('Public atlas', [['.universe-heading p',14],['.universe-tabs button',14],['.universe-space-switch strong',15],['[aria-label="Find a solar system"]',14]]);
 checks.push('Distinct K-space and J-space tabs with a dedicated wormhole discovery context');
 await layout('Public atlas desktop');await screenshot('universe-public-atlas');
 await search('Jita');
 assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.universe-metric-grid strong')).map(e=>e.textContent)"),['—','—','—','—'],'Unavailable public feeds must not look like zero activity');
 await disclosure('Celestials & NPC stations');await waitFor("document.querySelectorAll('.universe-celestial-group').length===4");
 await clickElement("Array.from(document.querySelectorAll('.universe-celestial-group summary')).find(e=>e.textContent.startsWith('Planets'))");
 assert.ok(await evaluate("Array.from(document.querySelectorAll('.universe-celestial-list strong')).some(e=>e.textContent.startsWith('Jita'))"),'Static celestial names render in the inspector');
 await clickElement("Array.from(document.querySelectorAll('.universe-celestial-group summary')).find(e=>e.textContent.startsWith('NPC stations'))");
 assert.ok(await evaluate("Array.from(document.querySelectorAll('.universe-celestial-list strong')).some(e=>e.textContent.includes('Caldari Navy Assembly Plant'))"),'Jita NPC station names render from bundled detail data');
 await disclosure('Celestials & NPC stations');
 await click('[aria-label="Zoom in"]');await delay(100);const zoomed=await canvasHash();
 const point=await evaluate("(()=>{const e=document.querySelector('.universe-module canvas');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+90,y:point.y+50,button:'left',buttons:1});
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+90,y:point.y+50,button:'left',clickCount:1});
 await delay(100);assert.notEqual(await canvasHash(),zoomed,'Pointer drag moves the rendered map');
 const panned=await canvasHash();await call('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:-100});await delay(100);assert.notEqual(await canvasHash(),panned,'Wheel zoom changes the rendered map');
 await click('[aria-label="Fit map"]');await preset('Activity');
 assert.ok((await evaluate("document.querySelector('.universe-module canvas').getAttribute('aria-label')")).includes('Ship kills'));
 await button('Layers & views');await choose('Territory background','Security status');await choose('System indicators','Gate traffic');
 await fill('[aria-label="Saved view name"]','Public travel view');await button('Save','.universe-layer-panel');
 await waitFor("document.querySelector('.universe-saved-views')?.textContent.includes('Public travel view')");
 assert.equal((await api('/universe?character=0')).views[0].config.indicator,'jumps');
 await preset('Geopolitics');await preset('Public travel view');
 assert.ok((await evaluate("document.querySelector('.universe-module canvas').getAttribute('aria-label')")).includes('Security status background. Gate jumps'));
 await click('[aria-label="Delete view Public travel view"]');await waitFor("!document.querySelector('.universe-saved-views')?.textContent.includes('Public travel view')");
 await click('[aria-label="Close layers"]');
 checks.push('Public search, pointer pan/wheel zoom, presets and saved view create/load/delete');

 // Reload with disconnected synthetic tokens and locally cached intelligence.
 // No ESI authentication or real player data is involved.
 await call('Page.navigate',{url:'about:blank'});await app.close();app=null;
 const db=openStore(join(dir,'data')),now=Date.now(),ready=data=>({status:'ready',data,updatedAt:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString()});
 try{
  for(const [id,name] of [[42,'Atlas Alpha'],[43,'Atlas Beta']]){
   db.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(id,name,'[]','synthetic-unusable-token');
   db.saveSnapshot(id,'profile',ready({name,character_id:id,alliance_id:88,corporation_id:99}));
   db.saveSnapshot(id,'location',ready({solar_system_id:atlas.systemsByName['UALX-3']}));
   db.saveSnapshot(id,'contacts',ready([{contact_id:77,contact_type:'alliance',standing:id===42?5:-10}]));
   db.saveSnapshot(id,'corporation_contacts',{status:'missing_scope',data:null});db.saveSnapshot(id,'alliance_contacts',{status:'missing_scope',data:null});
   db.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(id,atlas.systemsByName[id===42?'Jita':'Amarr'],id===42?'Jita':'Amarr',new Date(now).toISOString());
  }
  db.set('names',{77:'Synthetic sovereignty alliance',78:'Synthetic independent alliance',79:'Synthetic fallback one',80:'Synthetic fallback two',88:'Synthetic pilot alliance',99:'Synthetic corporation',999:'Synthetic opponent'});
  const owners=new Map(atlas.territory.map((system,index)=>[system.system_id,77+Math.min(3,Math.floor(index/atlas.territory.length*4))]));
  for(const [name,alliance] of [['UALX-3',77],['C-J6MT',78],['Jita',79],['Amarr',80]])owners.set(atlas.systemsByName[name],alliance);
  db.saveSnapshot(0,'sovereignty',ready([...owners].map(([system_id,alliance_id])=>({system_id,alliance_id}))));
  db.saveSnapshot(0,'kills',{status:'error',error:'Synthetic ESI feed unavailable',data:null,updatedAt:new Date(now).toISOString()});
  db.saveSnapshot(0,'jumps',ready([{system_id:atlas.systemsByName['UALX-3'],ship_jumps:123}]));
  let killmailId=7000;
  for(const members of [[77,78],[79,80]])for(const days of [15,7,1]){
   const at=new Date(now-days*86400000).toISOString(),raw={killmail_id:++killmailId,killmail_time:at,solar_system_id:atlas.systemsByName['UALX-3'],victim:{alliance_id:999,ship_type_id:587},attackers:members.map(alliance_id=>({alliance_id}))};
   db.db.prepare('INSERT INTO combat_records VALUES(?,?,?,?,?,?)').run(42,killmailId,'kill',at,JSON.stringify(raw),'esi');
  }
  const started=new Date(now-3600000).toISOString(),ended=new Date(now-1800000).toISOString();
  db.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)').run('universe-browser-replay',42,'Universe replay fixture',started,ended,JSON.stringify({capturedAt:started,system:{id:atlas.systemsByName.Jita,name:'Jita'}}),JSON.stringify({capturedAt:ended,system:{id:atlas.systemsByName.Jita,name:'Jita'}}));
  for(const [name,offset] of [['Jita',1],['Perimeter',10],['Jita',20]])db.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(42,atlas.systemsByName[name],name,new Date(now-3600000+offset*60000).toISOString());
  db.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)').run(42,'ship.changed','journey','Synthetic ship change',JSON.stringify({ship_type_id:587,solar_system_id:atlas.systemsByName.Perimeter}),new Date(now-3600000+12*60000).toISOString());
  for(const [type,module,summary,offset] of [['location.changed','journey','Entered system: Perimeter',10],['system.entered','journey','Entered system: Jita',11],['opsec.policy_changed','opsec','Synthetic OpSec policy change',12],['policy.changed','opsec','Synthetic OpSec module activity',13]])
   db.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)').run(42,type,module,summary,JSON.stringify({solar_system_id:atlas.systemsByName.Perimeter}),new Date(now-3600000+offset*60000).toISOString());
 }finally{db.close();}
 app=await startKairo(appOptions);await call('Page.navigate',{url:app.origin+'/#universe'});await waitFor("document.querySelector('[aria-label=\"Active character\"]')?.textContent.includes('Atlas Alpha') && !!document.querySelector('.universe-module canvas')");
 await search('UALX-3');await waitFor("document.querySelector('.universe-standing')?.textContent.includes('good standing')");
 const inferred=await api('/universe/politics','POST');
 assert.deepEqual(inferred.groups.filter(g=>g.source==='inferred').map(g=>g.alliance_ids).sort((a,b)=>a[0]-b[0]),[[77,78],[79,80]],'Repeated local cooperation supports separate inferred groups');
 await button('Refresh','.universe-heading');await waitFor("!!document.querySelector('.universe-membership.inferred')");
 await vectorRendering();
 assert.ok(await evaluate("document.querySelector('.universe-owner').textContent.includes('Synthetic sovereignty alliance')"));
 assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.universe-metric-grid strong')).map(e=>e.textContent)"),['—','—','—','123']);
 await preset('My standings');
 await button('Layers & views');await choose('Standing filter','Good & excellent');
 await waitFor("document.querySelector('.universe-module canvas').getAttribute('aria-label').includes('Pilot standings')");
 assert.ok((await evaluate("document.querySelector('.universe-module canvas').getAttribute('aria-label')")).includes(atlas.known.toLocaleString('en-US')+' systems'),'Standing filtering retains the entire ownership partition');
 await fill('[aria-label="Saved view name"]','Alpha private view');await button('Save','.universe-layer-panel');
 await waitFor("document.querySelector('.universe-saved-views')?.textContent.includes('Alpha private view')");
 await choose('Standing filter','All standings');await click('[aria-label="Close layers"]');
 await disclosure('Pins & reminders');await fill('[aria-label="Pin label"]','Alpha moon watch');await fill('[aria-label="Pin note"]','Synthetic private note');await button('Add map pin');
 await waitFor("document.querySelector('.universe-pin-item')?.textContent.includes('Alpha moon watch')");
 await choose('Active character','Atlas Beta');await waitFor("!document.querySelector('.universe-system-title')");
 await search('UALX-3');await waitFor("document.querySelector('.universe-standing')?.textContent.includes('terrible standing')");
 const beta=await api('/universe?character=43');assert.equal(beta.pins.length,0);assert.equal(beta.views.length,0);assert.equal(beta.journey.systems[0].name,'Amarr');
 await button('Layers & views');assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Delete view Alpha private view\"]')"),false);await click('[aria-label="Close layers"]');
 await choose('Active character','Atlas Alpha');await search('UALX-3');await waitFor("document.querySelector('.universe-standing')?.textContent.includes('good standing')");
 const alpha=await api('/universe?character=42');assert.equal(alpha.pins[0].label,'Alpha moon watch');assert.equal(alpha.views[0].name,'Alpha private view');assert.equal(alpha.journey.systems[0].name,'Jita');
 await screenshot('universe-pilot-standings');checks.push('Pilot standings, unavailable ESI, private view/pin and visit isolation');

 // Configure through Settings, then verify the resolved political map. Manual
 // membership and explicit independence override only those alliances; another
 // supported group continues using inference.
 await button('Blocs','.universe-inspector-tabs');await click('[aria-label="Configure Universe power blocs"]');
 await waitFor("!!document.querySelector('.power-bloc-settings') && !!document.querySelector('[aria-label=\"Create power bloc\"]')");
 await button('Create your first power bloc','.power-bloc-settings');await fill('[aria-label="Power bloc name"]','Test Expedition Bloc');
 await click('[aria-label="Use colour #91b2f6"]');
 for(const id of ['77','78']){await fill('[aria-label="Find alliance by name or ID"]',id);await button('Find & add','.power-bloc-settings');await waitFor(`document.querySelector('.power-bloc-members')?.textContent.includes(${JSON.stringify(id)})`);}
 await click('.power-bloc-independent');await fill('[aria-label="Find alliance by name or ID"]','78');await button('Find & add','.power-bloc-settings');
 await waitFor("!!document.querySelector('[role=alertdialog]')");await button('Move alliance','[role=alertdialog]');
 await waitFor("document.querySelector('.power-bloc-members')?.textContent.includes('Synthetic independent alliance')");
 await button('Save changes','.power-bloc-settings');await waitFor("document.querySelector('.power-bloc-savebar strong')?.textContent==='Universe settings are saved'");
 const savedPolitics=await api('/universe/politics/config');
 assert.equal(savedPolitics.inference_enabled,true);assert.equal(savedPolitics.blocs[0].name,'Test Expedition Bloc');assert.equal(savedPolitics.blocs[0].color,'#91b2f6');assert.deepEqual(savedPolitics.blocs[0].alliance_ids,[77]);assert.deepEqual(savedPolitics.independent_alliance_ids,[78]);
 await api('/universe/politics','POST');
 await layout('Power bloc settings desktop','.power-bloc-settings');await screenshot('universe-power-bloc-settings');
 await viewport(390,844);await layout('Power bloc settings 390','.power-bloc-settings');
 await readability('Power bloc settings 390',[['.power-bloc-intro p',14],['.power-bloc-fallback p',14],['.power-bloc-member strong',14]]);
 await screenshot('universe-power-bloc-settings-mobile');await viewport(1600);
 await clickElement("Array.from(document.querySelectorAll('[data-sidebar=menu-button]')).find(e=>e.textContent.trim()==='Universe')");
 await waitFor("!!document.querySelector('.universe-module canvas')");
 await search('UALX-3');await waitFor("document.querySelector('.universe-membership.configured')?.textContent.includes('Test Expedition Bloc')");
 assert.ok(await evaluate("document.querySelector('.universe-owner').textContent.includes('Synthetic sovereignty alliance')"),'Configured bloc does not replace actual sovereign ownership');
 assert.ok(await evaluate("document.querySelector('.universe-standing').textContent.includes('good standing')"),'Configured bloc does not replace the pilot standing');
 const configured=await api('/universe?character=42');
 assert.equal(configured.systems.find(s=>s.system_id===atlas.systemsByName['UALX-3']).power_bloc.source,'configured');
 assert.equal(configured.systems.find(s=>s.system_id===atlas.systemsByName['C-J6MT']).power_bloc.source,'independent');
 assert.deepEqual(configured.politics.groups.filter(g=>g.source==='inferred').map(g=>g.alliance_ids),[[79,80]],'Configuring one group preserves inferred fallback elsewhere');
 await screenshot('universe-configured-membership');
 await search('C-J6MT');await waitFor("document.querySelector('.universe-membership.independent')?.textContent.includes('Independent alliance')");
 await search('Jita');await waitFor("!!document.querySelector('.universe-membership.inferred')");
 await click('.universe-member-link');await waitFor("!!document.querySelector('.universe-bloc-focus.inferred')");
 assert.ok(await evaluate("document.querySelector('.universe-inference-note').textContent.includes('estimate')"),'Inferred group carries a visible uncertainty explanation');
 assert.ok(await evaluate("document.querySelector('.universe-bloc-members').textContent.includes('Synthetic fallback one') && document.querySelector('.universe-bloc-members').textContent.includes('Synthetic fallback two')"),'Inferred members resolve to readable alliance names');
 await screenshot('universe-inferred-membership');
 await click('[aria-label="Configure Universe power blocs"]');await waitFor("document.querySelector('[aria-label=\"Power bloc name\"]')?.value==='Test Expedition Bloc'");
 assert.ok(await evaluate("document.querySelector('.power-bloc-members').textContent.includes('Synthetic sovereignty alliance')"),'Saved settings re-open with exact memberships');
 await clickElement("Array.from(document.querySelectorAll('[data-sidebar=menu-button]')).find(e=>e.textContent.trim()==='Universe')");await waitFor("!!document.querySelector('.universe-module canvas')");
 checks.push('Power bloc create/name/colour, explicit membership move to independent, save/reopen, source labels and per-alliance fallback');

 await search('Jita');await button('Route','.universe-inspector-tabs');
 await fill('[list="universe-system-route-origin"]','Jita');await fill('[list="universe-system-route-destination"]','Amarr');await button('Calculate route');
 await waitFor("document.querySelector('.universe-route-result .eyebrow')?.textContent==='CALCULATED ROUTE'");
 const route=await evaluate("Array.from(document.querySelectorAll('.universe-route-result ol strong')).map(e=>e.textContent)");
 assert.equal(route[0],'Jita');assert.equal(route.at(-1),'Amarr');assert.ok(route.length>2,'Route uses multiple actual stargates');
 assert.ok(await evaluate("document.querySelector('.universe-canvas-shell').textContent.includes('Planned route')"),'Calculated route is passed to the map');
 await screenshot('universe-gate-route');
 await button('Jump range','.universe-inspector-tabs');
 assert.ok(atlas.nearby,'Static data supplies an actual nullsec target within range');
 await fill('[list="universe-system-jump-origin"]','UALX-3');await fill('[list="universe-system-jump-destination"]',atlas.nearby.name);await button('Calculate jump route');
 await waitFor("document.querySelector('.universe-route-result .eyebrow')?.textContent==='CALCULATED ROUTE'");
 assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.universe-route-result ol strong')).map(e=>e.textContent)"),['UALX-3',atlas.nearby.name]);
 assert.ok(await evaluate("document.querySelector('.universe-range-stat strong').textContent.endsWith(' LY')"));
 checks.push('Jita–Amarr local gate route and actual 3D jump-drive route');

 await clickElement("Array.from(document.querySelectorAll('.universe-tabs button')).find(e=>e.textContent.startsWith('Connections & pins'))");
 await button('Ansiblex','.universe-connection-form');
 await fill('[list="universe-system-connection-origin"]','UALX-3');await fill('[list="universe-system-connection-destination"]','C-J6MT');
 await fill('input[placeholder="Alliance bridge"]','Manual test bridge');await checkLabel('I have access to these bridges');await button('Save connection');
 await waitFor('!!('+connection('Manual test bridge')+')');
 assert.ok(await evaluate('('+connection('Manual test bridge')+').textContent.includes("ACTIVE")'));
 await clickElement('('+connection('Manual test bridge')+').querySelector("input[type=checkbox]")');
 await waitFor('('+connection('Manual test bridge')+').textContent.includes("DISABLED")');
 assert.equal((await api('/universe?character=42')).links.find(l=>l.label==='Manual test bridge').enabled,false);
 await clickElement('('+connection('Manual test bridge')+').querySelector("input[type=checkbox]")');await waitFor('('+connection('Manual test bridge')+').textContent.includes("ACTIVE")');
 await button('Import','.universe-connection-form');
 await fill('input[placeholder="Alliance bridges · September"]','Synthetic bridge network');
 await fill('[aria-label="Bridge import data"]','from_system,to_system,label\nJita,Perimeter,Imported bridge one\nAmarr,Jita,Imported bridge two');await button('Import bridge list');
 await waitFor("document.querySelector('.universe-import-list')?.textContent.includes('Synthetic bridge network')");
 assert.equal((await api('/universe?character=42')).link_lists.length,1);
 await click('.universe-import-list input[type=checkbox]');
 await waitFor('('+connection('Imported bridge one')+').textContent.includes("DISABLED")');
 assert.ok((await api('/universe?character=42')).links.filter(l=>l.source==='import').every(l=>l.active===false));
 await click('.universe-import-list input[type=checkbox]');await waitFor('('+connection('Imported bridge one')+').textContent.includes("ACTIVE")');
 await screenshot('universe-connections');await click('[aria-label="Delete imported list Synthetic bridge network"]');
 await waitFor("!document.querySelector('.universe-import-list')");assert.equal((await api('/universe?character=42')).links.filter(l=>l.source==='import').length,0);
 await click('[aria-label="Delete connection Manual test bridge"]');await waitFor('!('+connection('Manual test bridge')+')');
 checks.push('Manual Ansiblex add/toggle/delete and CSV bridge-list import/toggle/delete');

 // An observed, unconfirmed passage cannot enter routes until explicitly
 // confirmed. Expiry preserves the discovered destination and its private pin.
 const wormhole=await api('/universe/links?character=42','POST',{kind:'wormhole',label:'Unconfirmed passage',from_system_id:atlas.systemsByName['Jita'],to_system_id:atlas.wormhole.system_id,confirmed:false,accessible:true,duration_hours:16});
 await api('/universe/pins?character=42','POST',{system_id:atlas.wormhole.system_id,label:'Persistent J-space discovery',body:'Remains after the passage expires'});
 await button('Refresh','.universe-heading');await waitFor('!!('+connection('Unconfirmed passage')+')');
 assert.ok(await evaluate('('+connection('Unconfirmed passage')+').textContent.includes("UNCONFIRMED")'));
 await clickElement(`Array.from((${connection('Unconfirmed passage')}).querySelectorAll('button')).find(e=>e.textContent.trim()==='Confirm')`);
 await waitFor('('+connection('Unconfirmed passage')+').textContent.includes("ACTIVE")');
 await clickElement(`Array.from((${connection('Unconfirmed passage')}).querySelectorAll('button')).find(e=>e.textContent.trim()==='Edit')`);
  await choose('Lifetime for '+wormhole.id,'4 hours from now');
  await waitFor('('+connection('Unconfirmed passage')+').textContent.includes("4.0h remaining")');
 const revised=(await api('/universe?character=42')).links.find(l=>l.id===wormhole.id);assert.ok(Math.abs(Date.parse(revised.expires_at)-Date.now()-4*3600000)<15000);
 await choose('Lifetime for '+wormhole.id,'Expire now');await waitFor('('+connection('Unconfirmed passage')+').textContent.includes("EXPIRED")');
 const expired=await api('/universe?character=42');assert.equal(expired.links.find(l=>l.id===wormhole.id).active,false);assert.ok(expired.pins.some(p=>p.system_id===atlas.wormhole.system_id));
 await button('Atlas','.universe-tabs');await space('J-Space');
 assert.ok((await evaluate("document.querySelector('.universe-module canvas').getAttribute('aria-label')")).includes('Wormhole space interactive map showing 1 systems'));
 await minimumZoom('Discovered J-space');
 await screenshot('universe-expired-discovery');checks.push('Wormhole confirmation, lifetime editing, expiry and retained discoveries');

 await button('Journey','.universe-tabs');await waitFor("!!document.querySelector('.route-stop')");
 assert.equal(await evaluate("Array.from(document.querySelectorAll('.universe-module button')).some(e=>e.textContent.trim()==='Sessions')"),false,'Sessions has its own page, outside Universe');
 assert.equal(await evaluate("Array.from(document.querySelectorAll('[data-sidebar=menu-button]')).filter(e=>e.textContent.trim()==='Sessions').length"),1);
 await button('Atlas','.universe-tabs');await preset('Geopolitics');await search('UALX-3');await click('[aria-label="Fit map"]');
 for(const width of [1600,1024,820,390]){
  await viewport(width,width===390?844:1050);await layout('Atlas '+width);
  await readability('Atlas '+width,[['.universe-heading p',14],['.universe-tabs button',14],['.universe-system-title h3',22],['.universe-membership p',13],['[aria-label="Find a solar system"]',14]]);
  await evaluate("document.querySelector('.universe-module').scrollIntoView({block:'start'})");await screenshot('universe-atlas-'+width);
 }
 await button('Layers & views');await layout('Layers 390');await screenshot('universe-mobile-layers');await click('[aria-label="Close layers"]');
 await clickElement("Array.from(document.querySelectorAll('.universe-tabs button')).find(e=>e.textContent.startsWith('Connections & pins'))");await layout('Connections 390');await screenshot('universe-mobile-connections');
 await button('Atlas','.universe-tabs');await viewport(1600);await click('[aria-label="Fit map"]');await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10});

 await clickElement("Array.from(document.querySelectorAll('[data-sidebar=menu-button]')).find(e=>e.textContent.trim()==='Sessions')");
 await waitFor("!!document.querySelector('.session-card')");
 await clickElement("Array.from(document.querySelectorAll('.session-card')).find(e=>e.textContent.includes('Universe replay fixture'))");
 await button('Show on Map','.session-v2');
 await waitFor("document.querySelector('.session-replay h3')?.textContent==='Universe replay fixture'");
 await waitFor("!!document.querySelector('.universe-module canvas') && !!document.querySelector('[aria-label=\"Play session replay\"]')");
 assert.equal(await evaluate("document.querySelector('.session-replay-status strong').textContent"),'Jita');
 assert.equal(await evaluate("document.querySelector('[aria-label=\"Session replay time\"]').max"),'1800000');
 assert.ok(await evaluate("document.querySelector('.universe-canvas-shell').textContent.includes('RECORDED SESSION')"));
 assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Play session replay\"]')"),true,'Replay opens paused');
 const replayViewport=await evaluate("(()=>{const map=document.querySelector('.universe-module canvas').getBoundingClientRect(),play=document.querySelector('[aria-label=\"Play session replay\"]').getBoundingClientRect();return {width:innerWidth,height:innerHeight,centre:{x:map.x+map.width/2,y:map.y+map.height/2},play:{top:play.top,bottom:play.bottom,left:play.left,right:play.right}};})()");
 assert.ok(replayViewport.centre.x>0&&replayViewport.centre.x<replayViewport.width&&replayViewport.centre.y>0&&replayViewport.centre.y<replayViewport.height-50&&replayViewport.play.top>=0&&replayViewport.play.bottom<=replayViewport.height&&replayViewport.play.left>=0&&replayViewport.play.right<=replayViewport.width,'Desktop replay keeps the followed pilot/map centre and playback controls visible together: '+JSON.stringify(replayViewport));
 await layout('Session replay desktop');await screenshot('universe-session-replay');
 // Seek near the next observation using the actual timeline track, then play
 // across it. Record drawn label positions inside this disposable browser to
 // verify the camera uses intermediate positions rather than teleporting.
 const track=await evaluate("(()=>{const e=document.querySelector('[aria-label=\"Session replay time\"]');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width*.328,y:r.y+r.height/2};})()");
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...track,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...track,button:'left',clickCount:1});
 const seekTime=await evaluate("Number(document.querySelector('[aria-label=\"Session replay time\"]').value)");assert.ok(seekTime>500000&&seekTime<600000,'Timeline scrubs to the selected point');
 await evaluate("(()=>{window.__replayPositions=[];window.__replayEventDraws=0;window.__originalText=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){if(this.canvas.closest('.universe-module')){if(text==='Perimeter')window.__replayPositions.push({x,y,at:performance.now()});if(text==='Synthetic ship change')window.__replayEventDraws++;}return window.__originalText.call(this,text,x,y,...args);};})()");
 await click('[aria-label="Play session replay"]');await waitFor("document.querySelector('.session-replay-status strong')?.textContent==='Perimeter'");await delay(900);await click('[aria-label="Pause session replay"]');
 const camera=await evaluate("window.__replayPositions");
 assert.ok(new Set(camera.map(p=>p.x.toFixed(2)+':'+p.y.toFixed(2))).size>=3,'Following the next recorded system paints intermediate camera positions');
 assert.ok(await evaluate("document.querySelector('.session-replay button[aria-pressed]')?.getAttribute('aria-pressed')==='true'"));
 const pausedTime=await evaluate("document.querySelector('[aria-label=\"Session replay time\"]').value");await delay(250);assert.equal(await evaluate("document.querySelector('[aria-label=\"Session replay time\"]').value"),pausedTime,'Pause freezes the timeline');
 const replayCanvas=await evaluate("(()=>{const e=document.querySelector('.universe-module canvas');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...replayCanvas,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:replayCanvas.x+75,y:replayCanvas.y+40,button:'left',buttons:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:replayCanvas.x+75,y:replayCanvas.y+40,button:'left',clickCount:1});
 await waitFor("document.querySelector('.session-replay button[aria-pressed]')?.textContent.includes('Resume follow')");await button('Resume follow','.session-replay');
 // Keyboard seeking exercises the range input without application hooks.
 await click('[aria-label="Session replay time"]');await key('Home','Home',36);
 await key('ArrowRight','ArrowRight',39);
 assert.ok(Number(await evaluate("document.querySelector('[aria-label=\"Session replay time\"]').value"))<=1000);
 await click('[aria-label="Next recorded event"]');
 assert.equal(Number(await evaluate("document.querySelector('[aria-label=\"Session replay time\"]').value")),12*60000,'Next event skips routine movement and OpSec activity to the meaningful event');
 await waitFor("document.querySelector('.session-replay-events')?.textContent.includes('Synthetic ship change')");
 assert.ok(await evaluate("document.querySelector('.session-replay-event strong')?.textContent.includes('Synthetic ship change')"),'Meaningful events render as prominent visual cards');
 assert.ok(await evaluate("!!document.querySelector('.session-replay-event-icon svg')"),'Replay activity has a recognisable event icon');
 await readability('Session event cards',[['.session-replay-event strong',14],['.session-replay-event-meta',13]]);
 await waitFor('window.__replayEventDraws>0');
 await screenshot('universe-session-replay-event');
 await evaluate('CanvasRenderingContext2D.prototype.fillText=window.__originalText');
 await click('[aria-label="Session replay time"]');await key('End','End',35);
 assert.equal(await evaluate("Array.from(document.querySelectorAll('.session-replay-event')).some(e=>/Entered system|Synthetic OpSec/.test(e.textContent))"),false,'Travel and OpSec changes are omitted from all replay event cards');
 const replayData=await api('/sessions/universe-browser-replay/replay?character=42');
 assert.ok(replayData.visits.length>=3&&replayData.travel.length>=2,'Routine-event suppression preserves movement history');
 assert.ok(replayData.events.every(event=>!['location.changed','system.entered'].includes(event.type)&&!event.type.startsWith('opsec.')&&event.module!=='opsec'));
 await viewport(390,844);await layout('Session replay 390');await evaluate("document.querySelector('.session-replay').scrollIntoView({block:'start'})");await screenshot('universe-session-replay-mobile');
 await click('[aria-label="Close session replay"]');await waitFor("!document.querySelector('.session-replay')");
 assert.equal(await evaluate("document.querySelector('.universe-canvas-shell').textContent.includes('RECORDED SESSION')"),false,'Exiting replay restores the normal atlas');
 await viewport(1600);await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10});await delay(800);
 checks.push('Session Show on Map, timeline/play/pause, smooth follow, manual pan, event popup and clean exit');

 const metrics=await idleMetrics();
 assert.deepEqual(errors,[],'No uncaught browser errors');
 assert.deepEqual(externalCalls,[],'No external ESI or login requests from synthetic fixtures');
 await writeFile(join(output,'universe-checks.json'),JSON.stringify({checks,metrics,renderChecks,typeChecks,atlas:{systems:atlas.systems,known:atlas.known,gates:atlas.gates},routeHops:route.length-1},null,2));
 await rm(join(output,'failure.json'),{force:true});await rm(join(output,'universe-failure.png'),{force:true});
 console.log(JSON.stringify({ok:true,checks,metrics,screenshots:output}));
}catch(error){
 console.error('Universe browser check failed:',error.stack||error.message);
 const state=ws?.readyState===1?await evaluate("({url:location.href,tabs:Array.from(document.querySelectorAll('[role=tab]')).map(t=>({text:t.textContent,selected:t.getAttribute('aria-selected')})),body:document.body.innerText.slice(-16000)})").catch(()=>null):null;
 await writeFile(join(output,'failure.json'),JSON.stringify({error:error.stack||error.message,errors,state},null,2));
 if(ws?.readyState===1)await screenshot('universe-failure').catch(()=>{});throw error;
}finally{
 ws?.close();
 if(proc&&proc.exitCode===null&&proc.signalCode===null){const exited=new Promise(resolve=>proc.once('exit',resolve));proc.kill('SIGTERM');await Promise.race([exited,delay(3000)]);if(proc.exitCode===null&&proc.signalCode===null){proc.kill('SIGKILL');await Promise.race([exited,delay(1000)]);}}
 await app?.close();
 await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(error=>console.warn('Temporary browser cleanup:',error.message));
}
