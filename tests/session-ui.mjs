// Real-browser smoke test for the compiled local application. Uses Chrome's
// DevTools protocol and Node 24 only; no application dependencies are added.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {openStore} from '../server/store.mjs';
import {startKairo} from '../server/index.mjs';
import {allScopes} from '../server/modules/catalog.mjs';

const chrome=process.env.KAIRO_CHROME_PATH||['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
if(!chrome)throw new Error('Chrome is required for the browser smoke test. Set KAIRO_CHROME_PATH.');
// Keep evidence outside the disposable runtime/profile directory: finally removes
// test state, while KAIRO_BROWSER_OUTPUT (or the sibling default) retains artifacts.
const dir=await mkdtemp(join(tmpdir(),'kairo-session-ui-')),output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-screenshots';
await mkdir(output,{recursive:true});
const iso=ms=>new Date(ms).toISOString(),epoch=Date.now()-5*3600000,at=m=>iso(epoch+m*60000);
const store=openStore(join(dir,'data'));
store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42,'Example pilot',JSON.stringify(allScopes),'synthetic-test-token');
store.set('names',{1:'UALX-3',2:'Quiet transit',3:'C-J6MT',77:'Example alliance',609:'Maulus',588:'Reaper',587:'Rifter',1000182:'Tribal Liberation Force',638:'Raven',1000035:'Caldari Navy — extended corporation name for layout coverage'});
const lp={balances:[{corporation_id:1000182,loyalty_points:42000},{corporation_id:1000035,loyalty_points:1200}],sampledAt:at(-1)};
const start={capturedAt:at(0),system:{id:1,name:'UALX-3'},shipTypeId:609,ship:{id:100},alliance:{id:77,name:'Example alliance'},loyalty:lp,wallet:{value:5100000000,sampledAt:at(-1)},skillpoints:12500000,coverage:{location:'ready',ship:'ready',profile:'ready',loyalty:'ready',wallet:'ready'}};
const finish={...start,capturedAt:at(120),system:{id:3,name:'C-J6MT'},wallet:{value:5158500000,sampledAt:at(119)},skillpoints:12510000,loyalty:lp,loyaltyReconciliation:{status:'delayed',sample:{balances:[{corporation_id:1000182,loyalty_points:60200},{corporation_id:1000035,loyalty_points:1000}],sampledAt:at(130)}}};
store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context,notes) VALUES(?,?,?,?,?,?,?,?)').run('preview',42,'Saturday roam · Tenerifis',at(0),at(120),JSON.stringify(start),JSON.stringify(finish),'Keep the next hull ready.');
store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)').run('legacy',42,'Earlier session',at(-300),at(-200),JSON.stringify({capturedAt:at(-300),wallet:{value:5000000,sampledAt:at(-301)}}),JSON.stringify({capturedAt:at(-200),wallet:{value:4826390.39,sampledAt:at(-201)}}));
store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)').run('archived',42,'Archived session',at(-2000),at(-1900),JSON.stringify({...start,capturedAt:at(-2000)}),JSON.stringify({...finish,capturedAt:at(-1900)}));
// Exercise incomplete captured state: route, hull, personal combat and
// wallet data alongside missing alliance/LP baselines, with long saved names.
for(let i=0;i<30;i++)store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)').run(42,7000+i%6,i%6===0?'A long saved system name for layout coverage':'Transit '+(i%6+1),at(-300+i*3),'legacy');
for(const [system,name] of [[1,'UALX-3'],[2,'Quiet transit'],[3,'C-J6MT']])store.db.prepare('INSERT INTO universe_systems(system_id,name,region_id,region_name,security) VALUES(?,?,?,?,?)').run(system,name,1000,'Example region',-.3);
// Both recordings carry their explicit Session owner.
for(const [system,name,m] of [[2,'Quiet transit',15],[1,'UALX-3',25],[3,'C-J6MT',60]])store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)').run(42,system,name,at(m),'preview');
// A neighbouring session's record must not enter this report just because its timestamp overlaps.
store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)').run(42,9999,'Other session only',at(30),'legacy');
const emit=(type,m,payload,summary=type)=>store.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)').run(42,type,type.startsWith('killmail')?'combat':'journey',summary,JSON.stringify(payload),at(m));
emit('ship.changed',-299,{ship_type_id:638,ship_id:400},'Changed ship to Raven');
emit('wallet.entry',-210,{amount:-173609.61},'Paid market fees');
for(let i=0;i<18;i++){
 const k={killmail_id:100+i,killmail_time:at(-270+i),solar_system_id:7000,victim:{character_id:99,ship_type_id:587},attackers:[{character_id:42}],zkb:{totalValue:i===0?10430000000:0},result:'kill'};
 store.db.prepare('INSERT INTO combat_records VALUES(?,?,?,?,?,?)').run(42,k.killmail_id,k.result,k.killmail_time,JSON.stringify(k),'fixture');emit('killmail.kill',-270+i,{killmail_id:k.killmail_id},'Participated in Rifter kill');
}
emit('ship.changed',40,{ship_type_id:588,ship_id:200},'Changed ship to Reaper');emit('ship.changed',55,{ship_type_id:609,ship_id:300},'Changed ship to Maulus');
emit('wallet.entry',50,{amount:60000000},'Bounty payment received');emit('wallet.entry',65,{amount:-1500000},'Paid repair bill');
emit('skill.completed',35,{},'Long Range Targeting IV completed');emit('goal.completed',115,{},'Fleet preparation complete');
for(const [id,m,system] of [[1,5,1],[2,30,1],[3,75,3]]){
 const k={killmail_id:id,killmail_time:at(m),solar_system_id:system,victim:{character_id:id===3?42:99,ship_type_id:587,alliance_id:id===3?77:88},attackers:id===3?[{character_id:99,alliance_id:88},{character_id:43,alliance_id:77,damage_done:0}]:[{character_id:42,alliance_id:77}],zkb:{totalValue:id===3?175960000:id*12500000},result:id===3?'loss':'kill'};
 store.db.prepare('INSERT INTO alliance_combat_records VALUES(?,?,?,?,?)').run(77,id,system,k.killmail_time,JSON.stringify(k));store.db.prepare('INSERT INTO combat_records VALUES(?,?,?,?,?,?)').run(42,id,k.result,k.killmail_time,JSON.stringify(k),'fixture');emit('killmail.'+k.result,m,{killmail_id:id},id===3?'Lost Rifter':'Participated in Rifter kill');
}
for(let i=0;i<126;i++)emit('session.note',70+i*.1,{},'Recorded activity '+(i+1));
store.set('session:combat:preview',{status:'ready',updatedAt:at(180),retryAt:at(240),detail:'Published alliance records collected.'});
store.saveSnapshot(42,'combat_public',{status:'ready',updatedAt:at(180)});
store.close();

let app,proc,ws;const pending=new Map(),errors=[];let sequence=0;
function call(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timed out: '+method));},20000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value;}
async function waitFor(expression){for(let i=0;i<200;i++){if(await evaluate(expression))return;await delay(50);}throw new Error('Condition not met: '+expression);}
// Wait for stable, unobstructed layout before dispatching real pointer input.
// DOM click() would bypass overlays/animation and could conceal unreachable UI.
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
async function card(title){
 const button=`Array.from(document.querySelectorAll('.session-detail-card')).find(s=>s.querySelector('.session-detail-heading strong')?.textContent===${JSON.stringify(title)})`;
 const open=await evaluate(`(${button}).getAttribute('aria-expanded')==='true'`);
 await clickElement(button);await waitFor(`(${button}).getAttribute('aria-expanded')===${JSON.stringify(String(!open))}`);
 if(!open)await waitFor("!!document.querySelector('.session-expanded-panel')");
}
const layoutChecks=[];
async function summaryLayout(){
 const summary=await evaluate(`(()=>{
  const root=document.querySelector('.session-summary'),r=root.getBoundingClientRect(),grid=document.querySelector('.session-detail-grid').getBoundingClientRect();
  return {fullWidth:Math.abs(r.width-grid.width)<=1,beforeCards:r.bottom<=grid.top,stats:Array.from(root.querySelectorAll('.session-summary-stat')).map(stat=>{
   const bounds=stat.getBoundingClientRect(),label=stat.querySelector('.session-mini-metric>small').getBoundingClientRect();
   return {top:bounds.top,bottom:bounds.bottom,labelTop:label.top,overflow:stat.scrollWidth>stat.clientWidth+1};
  })};
 })()`);
 assert.ok(summary.fullWidth&&summary.beforeCards,'Summary spans the report above the activity cards');
 assert.equal(summary.stats.length,6);
 for(const stat of summary.stats){assert.ok(!stat.overflow,'Summary values fit');for(const sibling of summary.stats.filter(s=>Math.abs(s.top-stat.top)<=1)){assert.ok(Math.abs(sibling.bottom-stat.bottom)<=1&&Math.abs(sibling.labelTop-stat.labelTop)<=1,'Summary labels and tile edges align');}}
}
async function summaryValues(expected){
 const values=await evaluate("Object.fromEntries(Array.from(document.querySelectorAll('.session-summary-stat')).map(s=>[s.dataset.summary,s.querySelector('.session-mini-metric>strong').textContent.replace(/\\s/g,'')]))");
 assert.deepEqual(values,expected,'Summary reflects this session’s own recorded values');
}
async function metricLabels(){
 assert.ok(await evaluate("Array.from(document.querySelectorAll('.session-metric-pair')).every(pair=>{const labels=Array.from(pair.querySelectorAll('.session-mini-metric>small')).map(e=>e.getBoundingClientRect().top);return labels.every(top=>Math.abs(top-labels[0])<=1)})"),'Paired metric labels align when unavailable values or units wrap');
}
async function alignment(label){
 await evaluate('document.fonts.ready');
 await summaryLayout();
 await metricLabels();
 const rows=await evaluate(`Array.from(document.querySelectorAll('.session-detail-row')).map(row=>Array.from(row.querySelectorAll(':scope > .session-detail-card')).map(card=>{
  const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width}};
  return {card:rect(card),heading:rect(card.querySelector('.session-detail-heading')),preview:rect(card.querySelector('.session-detail-preview')),footer:rect(card.querySelector('.session-card-bottom')),overflow:card.scrollWidth>card.clientWidth+1};
 }))`);
 assert.equal(rows.length,5);
 for(const row of rows){
  assert.ok(row.every(c=>!c.overflow),label+': card content must fit');
  if(row.length===2)for(const section of ['card','heading','preview','footer'])for(const edge of ['top','bottom','width'])assert.ok(Math.abs(row[0][section][edge]-row[1][section][edge])<=1,label+': '+section+' '+edge+' alignment '+JSON.stringify(row));
 }
 layoutChecks.push(label);
}
async function detailWidth(){
 assert.ok(await evaluate(`(()=>{const p=document.querySelector('.session-expanded-panel'),row=p.parentElement,r=p.getBoundingClientRect(),bounds=row.getBoundingClientRect();return Math.abs(r.width-bounds.width)<=1&&Array.from(row.querySelectorAll(':scope > .session-detail-card')).every(c=>c.getBoundingClientRect().bottom<=r.top);})()`),'Expanded panel spans the row below both cards');
}
async function narrowLayout(){
 await summaryLayout();
 await metricLabels();
 const bounds=await evaluate("(()=>{const r=document.querySelector('.session-v2').getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth};})()");
 assert.ok(bounds.left>=0&&bounds.right<=bounds.width,'Resized report stays inside the viewport: '+JSON.stringify(bounds));
 assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth && document.querySelector('.session-v2').scrollWidth<=document.querySelector('.session-v2').clientWidth+1 && Array.from(document.querySelectorAll('.session-detail-card')).every(c=>c.scrollWidth<=c.clientWidth+1)"),'Narrow report and cards must not overflow horizontally');
}
async function screenshot(name){await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'));}
async function fill(selector,text){await evaluate('document.querySelector('+JSON.stringify(selector)+').focus()');await call('Input.dispatchKeyEvent',{type:'keyDown',modifiers:2,key:'a',code:'KeyA',windowsVirtualKeyCode:65});await call('Input.dispatchKeyEvent',{type:'keyUp',modifiers:2,key:'a',code:'KeyA',windowsVirtualKeyCode:65});await call('Input.insertText',{text});}
async function pressKey(key,code,windowsVirtualKeyCode,text=''){
 // Enter needs its carriage-return text for Chrome to dispatch keypress and
 // perform native summary activation, as a physical key press does.
 await call('Input.dispatchKeyEvent',{type:text?'keyDown':'rawKeyDown',modifiers:0,key,code,windowsVirtualKeyCode,text,unmodifiedText:text});
 await call('Input.dispatchKeyEvent',{type:'keyUp',modifiers:0,key,code,windowsVirtualKeyCode});
}
try{
 app=await startKairo({port:18580,streamPort:18581,dataDir:join(dir,'data'),noSync:true});
 proc=spawn(chrome,['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:['ignore','ignore','pipe']});
 const browserURL=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(new Error('Chrome did not start: '+log.slice(-1000))),20000);proc.stderr.on('data',b=>{log+=b;const m=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});proc.on('error',reject);proc.on('exit',code=>{clearTimeout(timer);reject(new Error('Chrome exited: '+code+' '+log.slice(-1000)));});});
 const endpoint=new URL(browserURL);const target=await(await fetch('http://'+endpoint.host+'/json/new?about:blank',{method:'PUT'})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(new Error(JSON.stringify(m.error)));else p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 await call('Page.enable');await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1050,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:app.origin+'/#sessions'});
 // The independent Sessions workspace loads its archive after bootstrap.
 await waitFor("document.querySelectorAll('.session-card').length===3 && !!document.querySelector('.connection-status.online')");
 await clickElement("Array.from(document.querySelectorAll('[role=tab]')).find(e=>e.textContent==='Sessions')");
 await waitFor("document.querySelectorAll('.session-card').length===3");await click('.session-card');await waitFor("document.querySelectorAll('.session-detail-card').length===9");
 assert.equal(await evaluate("document.querySelector('.session-collection-status').textContent"),'Session ended · delayed zKill checks');
 await summaryValues({duration:'2h0m',travel:'3',personal:'2/1',alliance:'2/1',wallet:'+58.5mISK',loyalty:'+18,000LP'});
 assert.ok(await evaluate("document.querySelector('.session-summary-stat[data-summary=loyalty]').textContent.includes('Delayed estimate')"));
 assert.ok(await evaluate("document.querySelector('.session-summary-activity').textContent.includes('Most active systemUALX-32 recorded killmails')"),'Highlight deduplicates personal and alliance records');
 for(const key of ['personal','alliance'])assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.session-detail-card[data-card=${key}] .session-mini-metric>strong')).map(v=>v.textContent)`),['2','1'],'The '+key+' card retains both kills and the loss; personal participation is never subtracted from alliance totals');
 await alignment('populated desktop');await screenshot('sessions-desktop');
 await card('Route & visits');assert.equal(await evaluate("document.querySelectorAll('.session-route-list > li').length"),4);assert.equal(await evaluate("document.querySelectorAll('.session-buffer-badge').length"),3);assert.ok(await evaluate("document.querySelector('.session-route-list').textContent.includes('Quiet transit')"));assert.equal(await evaluate("document.querySelector('.session-route-list').textContent.includes('Other session only')"),false,'Session travel is isolated by owner as well as time');
 await detailWidth();await alignment('expanded route');await screenshot('sessions-route');await click('.session-expanded-heading button');await waitFor("!document.querySelector('.session-expanded-panel')");assert.equal(await evaluate("document.activeElement?.getAttribute('data-card')"),'route');
 await card('Alliance combat');await detailWidth();assert.equal(await evaluate("document.querySelectorAll('.session-kill-list > a').length"),3);
 assert.ok(await evaluate("document.querySelector('.session-expanded-panel').textContent.includes('The live feed has stopped for this session')"));
 assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.session-kill-list .session-result')).map(e=>e.textContent)"),['LOSS','KILL','KILL'],'Alliance victim with a friendly attacker is shown only as a loss');
 assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.session-detail-card[data-card=alliance] .session-value-line b')).map(e=>e.textContent)"),['37.5m ISK','175.96m ISK'],'Destroyed ISK excludes alliance ships lost');
 await screenshot('sessions-alliance');await card('Alliance combat');
 await card('Loyalty points');assert.equal(await evaluate("document.querySelectorAll('.session-lp-table tbody tr').length"),2);assert.ok(await evaluate("document.querySelector('.session-lp-table').textContent.includes('+18,200')"));
 await evaluate("document.querySelector('.session-lp-table').scrollIntoView({block:'center'})");await screenshot('sessions-loyalty');await card('Loyalty points');
 await card('Activity timeline');assert.equal(await evaluate("document.querySelectorAll('.report-events article').length"),100);
 await clickElement("Array.from(document.querySelectorAll('.session-v2 button')).find(b=>b.textContent.includes('Load more session events'))");await waitFor("document.querySelectorAll('.report-events article').length===135");
 await card('Activity timeline');
 await fill('.session-v2 .report-title input','Session UI verified');await fill('.session-v2 textarea','Saved in the browser smoke test.');
 await clickElement("Array.from(document.querySelectorAll('.session-v2 button')).find(b=>b.textContent.includes('Save session details'))");
 await waitFor("document.querySelector('[data-sonner-toast]')?.textContent.includes('Session details saved')");
 const db=openStore(join(dir,'data'));try{const saved=db.db.prepare('SELECT label,notes FROM sessions WHERE id=?').get('preview');assert.equal(saved.label,'Session UI verified');assert.equal(saved.notes,'Saved in the browser smoke test.');}finally{db.close();}
 for(const width of [1024,820]){await call('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:false});await alignment('populated '+width);}
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await evaluate("document.querySelector('.session-v2').scrollTop=0");await screenshot('sessions-mobile');
 await narrowLayout();
 await card('Loyalty points');await evaluate("document.querySelector('.session-lp-table').scrollIntoView({block:'center'})");await screenshot('sessions-mobile-loyalty');
 await narrowLayout();assert.ok(await evaluate("Array.from(document.querySelectorAll('.session-lp-table td')).every(c=>c.scrollWidth<=c.clientWidth+1)"),'LP values fit without horizontal scrolling');
 // Native button keyboard controls, panel focus and dialog Escape handling.
 await evaluate("document.querySelector('.session-detail-card').focus()");await pressKey('Enter','Enter',13,'\r');await waitFor("document.querySelector('.session-detail-card').getAttribute('aria-expanded')==='true'");
 await waitFor("document.activeElement?.classList.contains('session-expanded-panel')");
 await click('.session-expanded-heading button');await waitFor("!document.querySelector('.session-expanded-panel')");assert.equal(await evaluate("document.activeElement?.getAttribute('data-card')"),'route');
 await pressKey(' ','Space',32,' ');await waitFor("document.querySelector('.session-detail-card').getAttribute('aria-expanded')==='true'");
 await pressKey('Escape','Escape',27);await waitFor("!document.querySelector('.session-v2')");
 await clickElement("Array.from(document.querySelectorAll('.session-card')).find(s=>s.textContent.includes('Earlier session'))");await waitFor("document.querySelectorAll('.session-detail-card').length===9");assert.ok(await evaluate("document.querySelector('.session-v2').textContent.includes('Alliance was not recorded')"));
 await summaryValues({duration:'1h40m',travel:'6',personal:'18/0',alliance:'—',wallet:'-173.61kISK',loyalty:'Notrecorded'});
 assert.ok(await evaluate("document.querySelector('.session-summary-stat[data-summary=alliance]').textContent.includes('Alliance was not recorded')"));
 for(const width of [1600,1024,820]){await call('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:false});await alignment('legacy '+width);}
 await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1050,deviceScaleFactor:1,mobile:false});await evaluate("document.querySelector('.session-detail-card[data-card=personal]').scrollIntoView({block:'start'})");await screenshot('sessions-legacy');
 assert.ok(await evaluate("document.querySelector('.session-detail-card[data-card=personal]').textContent.includes('10.43bn')"));
 await card('Loyalty points');assert.ok(await evaluate("document.querySelector('.session-expanded-panel').textContent.includes('Missing historical samples cannot be reconstructed')"));await card('Loyalty points');
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await narrowLayout();await evaluate("document.querySelector('.session-detail-card[data-card=loyalty]').scrollIntoView({block:'start'})");await screenshot('sessions-mobile-legacy');
 await pressKey('Escape','Escape',27);await waitFor("!document.querySelector('.session-v2')");
 await clickElement("Array.from(document.querySelectorAll('.session-card')).find(s=>s.textContent.includes('Archived session'))");await waitFor("!!document.querySelector('.session-collection-status')");
 assert.equal(await evaluate("document.querySelector('.session-collection-status').textContent"),'Session archived · zKill checks finished');
 await card('Alliance combat');assert.ok(await evaluate("document.querySelector('.session-expanded-panel').textContent.includes('without restarting collection')"));
 assert.equal(await evaluate("document.querySelector('.session-expanded-panel').textContent.includes('next history check:')"),false);
 await card('Alliance combat');await click('.session-summary-heading button');await waitFor("!document.querySelector('.session-summary-heading button').disabled");
 assert.equal(await evaluate("document.querySelector('.session-collection-status').textContent"),'Session archived · zKill checks finished');
 await pressKey('Escape','Escape',27);await waitFor("!document.querySelector('.session-v2')");
 const liveDb=openStore(join(dir,'data'));try{liveDb.db.prepare('UPDATE sessions SET ended=NULL WHERE id=?').run('preview');liveDb.set('session:live-feed',{status:'ready',checkedAt:iso(Date.now()),nextCheckAt:iso(Date.now()+120000)});}finally{liveDb.close();}
 await clickElement("Array.from(document.querySelectorAll('.session-card')).find(s=>s.textContent.includes('Session UI verified'))");await waitFor("!!document.querySelector('.session-collection-status')");
 assert.equal(await evaluate("document.querySelector('.session-collection-status').textContent"),'Live session · zKill checks every 2 minutes');
 await card('Alliance combat');assert.ok(await evaluate("document.querySelector('.session-expanded-panel').textContent.includes('latest published records checked')"));
 await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1050,deviceScaleFactor:1,mobile:false});await evaluate("document.querySelector('.session-v2').scrollTop=0");await screenshot('sessions-live');
 await writeFile(join(output,'layout-checks.json'),JSON.stringify({layoutChecks,cardCount:9,summaryMetrics:6,mobileWidth:390},null,2));
 assert.deepEqual(errors,[],'No uncaught browser errors');
 console.log(JSON.stringify({ok:true,cards:9,visits:4,bufferedVisits:3,timelineEvents:135,mobileWidth:390,layoutChecks,screenshots:output}));
}catch(error){
 console.error('Session browser check failed:',error.stack||error.message);
 const state=ws?.readyState===1?await evaluate("({url:location.href,tabs:Array.from(document.querySelectorAll('[role=tab]')).map(t=>({text:t.textContent,selected:t.getAttribute('aria-selected')})),cards:document.querySelectorAll('.session-card').length,details:document.querySelectorAll('.session-detail-card').length,body:document.body.innerText.slice(-12000)})").catch(()=>null):null;
 await writeFile(join(output,'failure.json'),JSON.stringify({error:error.stack||error.message,errors,state},null,2));
 if(ws?.readyState===1)await screenshot('sessions-failure').catch(()=>{});throw error;
}finally{
 ws?.close();
 if(proc&&proc.exitCode===null&&proc.signalCode===null){const exited=new Promise(resolve=>proc.once('exit',resolve));proc.kill('SIGTERM');await Promise.race([exited,delay(3000)]);if(proc.exitCode===null&&proc.signalCode===null){proc.kill('SIGKILL');await Promise.race([exited,delay(1000)]);}}
 await app?.close();
 await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(error=>console.warn('Temporary browser cleanup:',error.message));
}
