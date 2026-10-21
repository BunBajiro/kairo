import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Exercise accepted writes through the compiled dialog, actual HTTP owner and
// SQLite. Transport gates choose completion order without mocking persistence.
export async function sessionAcceptedNavigation({page,context,app,check,frame,deferred}){
 const id='focused-session-'+randomUUID(),path='/api/sessions/'+id,pattern=app.origin+path+'?*';
 const initial={label:'Focused Session review',notes:'Original debrief'},older={label:'Earlier accepted name',notes:'Earlier accepted debrief'},newer={label:'Latest accepted name',notes:'Latest accepted debrief'},retry={label:'Retained retry name',notes:'Retained retry debrief'};
 const started=new Date(Date.now()-3*86400000).toISOString(),ended=new Date(Date.parse(started)+10000).toISOString();
 app.store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context,notes) VALUES(?,?,?,?,?,?,?,?)').run(id,42,initial.label,started,ended,'{}','{}',initial.notes);
 const read=()=>({...app.store.db.prepare('SELECT label,notes FROM sessions WHERE id=? AND character_id=42').get(id)});
 const gate={seen:deferred(),release:deferred(),done:deferred(),entered:false},newerGate={done:deferred(),entered:false};let hold=true,failNext=false;const writes=[];
 const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Session accepted-write gate did not complete.')),10000);})]);}finally{clearTimeout(timer);}};
 await context.addInitScript(({path})=>{
  const native=window.fetch;window.__focusedSessionWrites=[];
  window.fetch=function(input,options){if(new URL(String(input),location.origin).pathname===path&&options?.method==='PUT')window.__focusedSessionWrites.push(JSON.parse(options.body));return native.apply(this,arguments);};
 },{path});
 const handler=async route=>{
  if(route.request().method()!=='PUT')return route.fallback();
  const body=route.request().postDataJSON();writes.push(body);
  if(failNext){failNext=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic Session save failure'})});}
  if(body.label===newer.label){newerGate.entered=true;try{const response=await route.fetch();assert.equal(response.status(),200);await route.fulfill({response});}finally{newerGate.done.resolve();}return;}
  if(!hold)return route.continue();hold=false;gate.entered=true;
  try{gate.seen.resolve();await gate.release.promise;const response=await route.fetch();assert.equal(response.status(),200);await route.fulfill({response});}finally{gate.done.resolve();}
 };
 const responseFor=label=>response=>new URL(response.url()).pathname===path&&response.request().method()==='PUT'&&response.request().postDataJSON().label===label;
 const open=async()=>{await page.locator('.session-card').first().click();const dialog=page.locator('.session-report-dialog');await dialog.locator('.session-summary').waitFor();return dialog;};
 const close=async dialog=>{await dialog.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'detached'});};
 const fill=async(dialog,values)=>{await dialog.getByLabel('Session name',{exact:true}).fill(values.label);await dialog.locator('.session-debrief textarea').fill(values.notes);};
 const draft=async dialog=>({label:await dialog.getByLabel('Session name',{exact:true}).inputValue(),notes:await dialog.locator('.session-debrief textarea').inputValue()});
 const save=dialog=>dialog.getByRole('button',{name:'Save session details',exact:true});
 const settle=async dialog=>{await save(dialog).waitFor();assert.equal(await save(dialog).isEnabled(),true);await frame();};
 const send=async(dialog,values,status=200)=>{await fill(dialog,values);const pending=page.waitForResponse(responseFor(values.label));await save(dialog).click();const response=await pending;assert.equal(response.status(),status);await response.finished();await settle(dialog);};
 await page.route(pattern,handler);
 try{
  await page.goto(app.origin+'/#sessions',{waitUntil:'domcontentloaded',timeout:15000});await page.locator('.connection-status.online').waitFor({state:'attached'});
  let dialog=await open();check('Cold Session report reads its persisted details',await draft(dialog),initial);
  await fill(dialog,older);await save(dialog).click();await bounded(gate.seen.promise);
  check('Held Session write has not persisted and its current editor is busy',{saved:read(),busy:await dialog.getByRole('button',{name:'Saving…',exact:true}).isDisabled()},{saved:initial,busy:true});
  await close(dialog);dialog=await open();await fill(dialog,newer);
  const newerResponse=page.waitForResponse(responseFor(newer.label));await save(dialog).click();await frame();
  // A baseline concurrent write must finish in SQLite before the older write is
  // released. A corrected shared queue will admit the newer request afterward.
  const admitted=await page.evaluate(()=>window.__focusedSessionWrites.slice());assert.deepEqual(admitted[0],older);
  if(admitted.length>1){await bounded(newerGate.done.promise);assert.deepEqual(read(),newer);}
  const olderResponse=page.waitForResponse(responseFor(older.label));gate.release.resolve();await bounded(gate.done.promise);
  assert.equal((await olderResponse).status(),200);assert.equal((await newerResponse).status(),200);await settle(dialog);
  check('Accepted Session writes retain order across dialog remounts',read(),newer);
  check('An obsolete Session acknowledgement preserves the active editor details',await draft(dialog),newer);
  const beforeFailure=read();failNext=true;await send(dialog,retry,503);
  check('Current Session save failure retains durable details and the retry draft',{saved:read(),draft:await draft(dialog),retryable:await save(dialog).isEnabled()},{saved:beforeFailure,draft:retry,retryable:true});
  await send(dialog,retry);check('Explicit Session retry persists its retained details',read(),retry);
  await close(dialog);dialog=await open();check('Reopening the Session after retry reads the latest persisted details',await draft(dialog),retry);
  check('Only four explicit Session saves reach HTTP',writes,[older,newer,retry,retry]);
 }finally{
  gate.release.resolve();await bounded(Promise.all([...(gate.entered?[gate.done.promise]:[]),...(newerGate.entered?[newerGate.done.promise]:[])]));
  await page.unroute(pattern,handler);app.store.db.prepare('DELETE FROM sessions WHERE id=?').run(id);
 }
}
