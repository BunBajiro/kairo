// Imported compiled-UI scenarios with real persisted Session rows. Delayed report
// reads may lose UI ownership after navigation, while storage-denial fixtures test
// the in-memory replay handoff. The parent owns browser/runtime teardown.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

function seed(app,id){
 // An isolated ten-second historical window stays in the settling phase while
 // excluding ordinary actions emitted by other scenarios in this shared app.
 const now=Date.now()-3*3600000,at=offset=>new Date(now+offset).toISOString(),start=at(0),end=at(10000);
 app.store.db.prepare("DELETE FROM events WHERE dedupe LIKE 'shared-session-%'").run();
 app.store.db.prepare('INSERT OR REPLACE INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)')
  .run(id,42,'Shared Session review',start,end,JSON.stringify({capturedAt:start,system:{id:30004807,name:'UALX-3'}}),'{}');
 const add=number=>app.store.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at,dedupe) VALUES(?,?,?,?,?,?,?)')
  .run(42,'session.note','sessions','Recorded review event '+number,'{}',at(1000+number),'shared-session-'+number);
 add(1);return {add};
}
async function openReport(page,app,id){
 await page.goto(app.origin+'/#sessions',{waitUntil:'domcontentloaded',timeout:15000});
 await page.locator('.connection-status.online').waitFor({state:'attached'});
 // Use the archive's real pilot-owned response and its actual report button.
 await page.locator('.session-card').filter({hasText:'Shared Session review'}).first().click();
 const dialog=page.locator('.session-report-dialog');await dialog.locator('.session-summary').waitFor();
 return dialog;
}
function isReport(value,id){return new URL(value.url()).pathname==='/api/sessions/'+id&&value.method()==='GET';}

export async function sessionReportErrorOwnership({page,app,check,frame,deferred}){
 const id='shared-session-error-'+randomUUID(),fixture=seed(app,id),pattern=app.origin+'/api/sessions/'+id+'?*';
 let held=null,failCurrent=false;const gates=[];
 const handler=async route=>{
  let gate;
  try{
   if(failCurrent){failCurrent=false;return await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Current Session read unavailable'})});}
   if(!held)return await route.continue();
   gate=held;held=null;gate.entered=true;
   const response=await route.fetch();assert.equal(response.status(),200);gate.body=await response.json();gate.seen.resolve();await gate.release.promise;
   await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Obsolete Session poll unavailable'})});
  }catch(error){if(gate){gate.error=error;gate.seen.resolve();}check('Session response gate completes without a transport error',error.message,'completed');await route.abort().catch(()=>{});}
  finally{gate?.done.resolve();}
 };
 await page.route(pattern,handler);
 try{
  const dialog=await openReport(page,app,id),refresh=dialog.getByRole('button',{name:'Refresh',exact:true});
  const initial=await dialog.locator('[data-summary="duration"] p').textContent();
  check('Session report loads its actual first event count',initial,'1 recorded events');
  const gate={seen:deferred(),release:deferred(),done:deferred()};gates.push(gate);held=gate;
  // Wait for the application's ordinary 15-second poll; no mocked hook or timer.
  await Promise.race([gate.seen.promise,page.waitForTimeout(20000).then(()=>{throw new Error('Session auto-poll did not reach its response gate.');})]);
  if(gate.error)throw gate.error;assert.equal(gate.body.stats.events,1);fixture.add(2);
  let response=page.waitForResponse(value=>isReport(value.request(),id));await refresh.click();assert.equal((await response).status(),200);await frame();
  check('Manual Refresh publishes the newer real Session report',await dialog.locator('[data-summary="duration"] p').textContent(),'2 recorded events');
  const finished=page.waitForEvent('requestfinished',{predicate:request=>isReport(request,id)});gate.release.resolve();await gate.done.promise;await finished;await frame();
  check('An obsolete Session poll failure cannot replace a successful Refresh with an error',await dialog.locator('[role="alert"]').allTextContents(),[]);
  check('Obsolete failure preserves the newer recorded count',await dialog.locator('[data-summary="duration"] p').textContent(),'2 recorded events');
  failCurrent=true;response=page.waitForResponse(value=>isReport(value.request(),id));await refresh.click();assert.equal((await response).status(),503);await frame();
  check('A current Session read failure remains visible and retryable',await dialog.locator('[role="alert"]').allTextContents(),['Current Session read unavailable']);
  response=page.waitForResponse(value=>isReport(value.request(),id));await refresh.click();assert.equal((await response).status(),200);await frame();
  check('Retry clears the current Session error',await dialog.locator('[role="alert"]').allTextContents(),[]);
 }finally{
  for(const gate of gates)gate.release.resolve();
  // Drain accepted route handlers before unroute/context teardown can handle
  // their request a second time, including when an earlier assertion failed.
  let timer;
  try{await Promise.race([Promise.all(gates.filter(gate=>gate.entered).map(gate=>gate.done.promise)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Session response gate cleanup timed out.')),10000);})]);}
  finally{clearTimeout(timer);await page.unroute(pattern,handler);app.store.db.prepare('DELETE FROM sessions WHERE id=?').run(id);}
 }
}

export async function deniedStorageReplay({page,context,app,check,frame}){
 const id='shared-session-replay-'+randomUUID();seed(app,id);
 await context.addInitScript(()=>{Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw new DOMException('Synthetic session storage access denied','SecurityError');}});});
 const requests=[];page.on('request',request=>{const url=new URL(request.url());if(url.pathname==='/api/sessions/'+id+'/replay')requests.push(url.searchParams.get('character'));});
 try{
  const dialog=await openReport(page,app,id);check('Denied storage still permits the pilot-owned Session report',await dialog.locator('.session-summary').count(),1);
  const crashed=page.waitForEvent('pageerror').catch(()=>null);await dialog.getByRole('button',{name:'Show on Map',exact:true}).click();
  const replay=page.getByRole('region',{name:'Session replay',exact:true});await Promise.race([replay.locator('input[aria-label="Session replay time"]').waitFor().catch(()=>null),crashed]);await frame();
  check('Denied storage preserves the real Session replay handoff to the same pilot',requests,['42']);
  check('Denied storage opens the requested recorded Session on the map',await replay.locator('h3').allTextContents(),['Shared Session review']);
  check('Denied storage retains functional replay controls',await page.getByRole('button',{name:'Play session replay',exact:true}).count(),1);
 }finally{app.store.db.prepare('DELETE FROM sessions WHERE id=?').run(id);}
}
