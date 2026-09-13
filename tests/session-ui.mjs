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
const dir=await mkdtemp(join(tmpdir(),'kairo-session-ui-')),output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-screenshots';
await mkdir(output,{recursive:true});
const iso=ms=>new Date(ms).toISOString(),epoch=Date.now()-5*3600000,at=m=>iso(epoch+m*60000);
const store=openStore(join(dir,'data'));
store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42,'Example pilot',JSON.stringify(allScopes),'synthetic-test-token');
store.set('names',{1:'UALX-3',2:'Quiet transit',3:'C-J6MT',77:'Example alliance',609:'Maulus',588:'Reaper',587:'Rifter',1000182:'Tribal Liberation Force',1000035:'Caldari Navy'});
const lp={balances:[{corporation_id:1000182,loyalty_points:42000},{corporation_id:1000035,loyalty_points:1200}],sampledAt:at(-1)};
const start={capturedAt:at(0),system:{id:1,name:'UALX-3'},shipTypeId:609,ship:{id:100},alliance:{id:77,name:'Example alliance'},loyalty:lp,wallet:{value:5100000000,sampledAt:at(-1)},skillpoints:12500000,coverage:{location:'ready',ship:'ready',profile:'ready',loyalty:'ready',wallet:'ready'}};
const finish={...start,capturedAt:at(120),system:{id:3,name:'C-J6MT'},wallet:{value:5158500000,sampledAt:at(119)},skillpoints:12510000,loyalty:lp,loyaltyReconciliation:{status:'delayed',sample:{balances:[{corporation_id:1000182,loyalty_points:60200},{corporation_id:1000035,loyalty_points:1000}],sampledAt:at(130)}}};
store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context,notes) VALUES(?,?,?,?,?,?,?,?)').run('preview',42,'Saturday roam · Tenerifis',at(0),at(120),JSON.stringify(start),JSON.stringify(finish),'Keep the next hull ready.');
store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended) VALUES(?,?,?,?,?)').run('legacy',42,'Earlier session',at(-300),at(-200));
for(const [system,name,m] of [[2,'Quiet transit',15],[1,'UALX-3',25],[3,'C-J6MT',60]])store.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(42,system,name,at(m));
const emit=(type,m,payload,summary=type)=>store.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)').run(42,type,type.startsWith('killmail')?'combat':'journey',summary,JSON.stringify(payload),at(m));
emit('ship.changed',40,{ship_type_id:588,ship_id:200},'Changed ship to Reaper');emit('ship.changed',55,{ship_type_id:609,ship_id:300},'Changed ship to Maulus');
emit('wallet.entry',50,{amount:60000000},'Bounty payment received');emit('wallet.entry',65,{amount:-1500000},'Paid repair bill');
emit('skill.completed',35,{},'Long Range Targeting IV completed');emit('goal.completed',115,{},'Fleet preparation complete');
for(const [id,m,system] of [[1,5,1],[2,30,1],[3,75,3]]){
 const k={killmail_id:id,killmail_time:at(m),solar_system_id:system,victim:{character_id:id===3?42:99,ship_type_id:587,alliance_id:id===3?77:88},attackers:[{character_id:id===3?99:42,alliance_id:id===3?88:77}],zkb:{totalValue:id*12500000},result:id===3?'loss':'kill'};
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
async function clickElement(expression){
 await waitFor('!!('+expression+')');
 const point=await evaluate(`(()=>{const e=(${expression});e.scrollIntoView({block:'center',inline:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
}
async function click(selector){await clickElement('document.querySelector('+JSON.stringify(selector)+')');}
async function card(title){await clickElement(`Array.from(document.querySelectorAll('.session-detail-card > summary')).find(s=>s.querySelector('strong')?.textContent===${JSON.stringify(title)})`);}
async function screenshot(name){await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'));}
async function fill(selector,text){await evaluate('document.querySelector('+JSON.stringify(selector)+').focus()');await call('Input.dispatchKeyEvent',{type:'keyDown',modifiers:2,key:'a',code:'KeyA',windowsVirtualKeyCode:65});await call('Input.dispatchKeyEvent',{type:'keyUp',modifiers:2,key:'a',code:'KeyA',windowsVirtualKeyCode:65});await call('Input.insertText',{text});}
try{
 app=await startKairo({port:18580,streamPort:18581,dataDir:join(dir,'data'),noSync:true});
 proc=spawn(chrome,['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:['ignore','ignore','pipe']});
 const browserURL=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(new Error('Chrome did not start: '+log.slice(-1000))),20000);proc.stderr.on('data',b=>{log+=b;const m=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});proc.on('error',reject);proc.on('exit',code=>{clearTimeout(timer);reject(new Error('Chrome exited: '+code+' '+log.slice(-1000)));});});
 const endpoint=new URL(browserURL);const target=await(await fetch('http://'+endpoint.host+'/json/new?about:blank',{method:'PUT'})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(new Error(JSON.stringify(m.error)));else p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 await call('Page.enable');await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1050,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:app.origin+'/#journey'});await waitFor("!!document.querySelector('[role=tab][data-state]')");
 await clickElement("Array.from(document.querySelectorAll('[role=tab]')).find(e=>e.textContent==='Sessions')");
 await waitFor("document.querySelectorAll('.session-card').length===2");await click('.session-card');await waitFor("document.querySelectorAll('.session-detail-card').length===9");
 await screenshot('sessions-desktop');
 await card('Route & visits');assert.equal(await evaluate("document.querySelectorAll('.session-route-list > li').length"),4);assert.equal(await evaluate("document.querySelectorAll('.session-buffer-badge').length"),3);assert.ok(await evaluate("document.querySelector('.session-route-list').textContent.includes('Quiet transit')"));
 await screenshot('sessions-route');await card('Route & visits');
 await card('Loyalty points');assert.equal(await evaluate("document.querySelectorAll('.session-lp-table tbody tr').length"),2);assert.ok(await evaluate("document.querySelector('.session-lp-table').textContent.includes('+18,200')"));
 await evaluate("document.querySelector('.session-lp-table').scrollIntoView({block:'center'})");await screenshot('sessions-loyalty');await card('Loyalty points');
 await card('Activity timeline');assert.equal(await evaluate("document.querySelectorAll('.report-events article').length"),100);
 await clickElement("Array.from(document.querySelectorAll('.session-v2 button')).find(b=>b.textContent.includes('Load more session events'))");await waitFor("document.querySelectorAll('.report-events article').length===135");
 await card('Activity timeline');
 await fill('.session-v2 .report-title input','Session UI verified');await fill('.session-v2 textarea','Saved in the browser smoke test.');
 await clickElement("Array.from(document.querySelectorAll('.session-v2 button')).find(b=>b.textContent.includes('Save session details'))");
 await waitFor("document.querySelector('[data-sonner-toast]')?.textContent.includes('Session details saved')");
 const db=openStore(join(dir,'data'));try{const saved=db.db.prepare('SELECT label,notes FROM sessions WHERE id=?').get('preview');assert.equal(saved.label,'Session UI verified');assert.equal(saved.notes,'Saved in the browser smoke test.');}finally{db.close();}
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await evaluate("document.querySelector('.session-v2').scrollTop=0");await screenshot('sessions-mobile');
 assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth && document.querySelector('.session-v2').scrollWidth<=document.querySelector('.session-v2').clientWidth+1"),'Mobile dialog must not overflow horizontally');
 await card('Loyalty points');await evaluate("document.querySelector('.session-lp-table').scrollIntoView({block:'center'})");await screenshot('sessions-mobile-loyalty');
 // Real keyboard interaction: summary toggles and dialog closes with Escape.
 await evaluate("document.querySelector('.session-detail-card > summary').focus()");await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});assert.equal(await evaluate("document.querySelector('.session-detail-card').open"),true);
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await waitFor("!document.querySelector('.session-v2')");
 await clickElement("Array.from(document.querySelectorAll('.session-card')).find(s=>s.textContent.includes('Earlier session'))");await waitFor("document.querySelectorAll('.session-detail-card').length===9");assert.ok(await evaluate("document.querySelector('.session-v2').textContent.includes('Alliance was not recorded')"));
 assert.deepEqual(errors,[],'No uncaught browser errors');
 console.log(JSON.stringify({ok:true,cards:9,visits:4,bufferedVisits:3,timelineEvents:135,mobileWidth:390,screenshots:output}));
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
