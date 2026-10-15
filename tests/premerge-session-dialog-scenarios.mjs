import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Closing a report cancels its UI ownership, not an already accepted save.
// Exercise that distinction through the real dialog, API and persisted row.
export async function sessionDialogOwnership({page,app,check,frame,deferred}){
 const ids=['session-cancel-a-'+randomUUID(),'session-cancel-b-'+randomUUID()],labels=['Cancellation source Session','Cancellation next Session'];
 const started=new Date(Date.now()-3*3600000).toISOString(),ended=new Date(Date.now()-3*3600000+10000).toISOString();
 const put=app.store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context,notes) VALUES(?,?,?,?,?,?,?,?)');
 for(let i=0;i<ids.length;i++)put.run(ids[i],42,labels[i],started,ended,JSON.stringify({capturedAt:started,system:{id:30004807,name:'UALX-3'}}),'{}','Recorded notes '+i);
 const gates=[],requests=[];let held=null;
 const pattern=app.origin+'/api/sessions/**';
 const handler=async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;requests.push({path,method:request.method()});
  const gate=held&&held.path===path&&held.method===request.method()?held:null;
  if(!gate)return route.continue();held=null;gate.entered=true;
  try{const response=await route.fetch();assert.equal(response.status(),200);gate.seen.resolve();await gate.release.promise;await route.fulfill({response});}
  catch(error){gate.error=error;gate.seen.resolve();await route.abort().catch(()=>{});}
  finally{gate.done.resolve();}
 };
 const hold=(path,method)=>{const gate={path,method,seen:deferred(),release:deferred(),done:deferred()};held=gate;gates.push(gate);return gate;};
 const seen=async gate=>{await Promise.race([gate.seen.promise,page.waitForTimeout(10000).then(()=>{throw new Error('Session cancellation response did not reach its gate.');})]);if(gate.error)throw gate.error;};
 const release=async gate=>{const finished=page.waitForEvent('requestfinished',{predicate:request=>new URL(request.url()).pathname===gate.path&&request.method()===gate.method});gate.release.resolve();await gate.done.promise;await finished;await frame();if(gate.error)throw gate.error;};
 const open=async label=>{await page.locator('.session-card').filter({hasText:label}).first().click();const dialog=page.locator('.session-report-dialog');await dialog.locator('.session-summary').waitFor();return dialog;};
 const read=id=>app.store.db.prepare('SELECT label,notes FROM sessions WHERE id=?').get(id);
 await page.route(pattern,handler);
 try{
  await page.goto(app.origin+'/#sessions',{waitUntil:'domcontentloaded',timeout:15000});await page.locator('.connection-status.online').waitFor({state:'attached'});
  let dialog=await open(labels[0]);await dialog.getByLabel('Session name',{exact:true}).fill('Accepted source name');await dialog.getByLabel('Debrief & notes',{exact:true}).fill('Accepted source debrief');
  const save=hold('/api/sessions/'+ids[0],'PUT');await dialog.getByRole('button',{name:'Save session details',exact:true}).click();await seen(save);
  check('Closing a pending Session save retains its already accepted persistence',read(ids[0]),{label:'Accepted source name',notes:'Accepted source debrief'});
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'detached'});
  dialog=await open(labels[1]);await dialog.getByLabel('Session name',{exact:true}).fill('Newer next-session draft');await dialog.getByLabel('Debrief & notes',{exact:true}).fill('Newer private debrief draft');
  await release(save);
  check('A closed Session save cannot replace the newly opened name draft',await dialog.getByLabel('Session name',{exact:true}).inputValue(),'Newer next-session draft');
  check('A closed Session save cannot replace the newly opened debrief',await dialog.getByLabel('Debrief & notes',{exact:true}).inputValue(),'Newer private debrief draft');
  check('A previous save acknowledgement does not persist the newer unsaved Session',read(ids[1]),{label:labels[1],notes:'Recorded notes 1'});
  check('The current Session save remains available',await dialog.getByRole('button',{name:'Save session details',exact:true}).isEnabled(),true);
  let response=page.waitForResponse(value=>new URL(value.url()).pathname==='/api/sessions/'+ids[1]&&value.request().method()==='PUT');
  await dialog.getByRole('button',{name:'Save session details',exact:true}).click();assert.equal((await response).status(),200);await frame();
  check('Saving the current Session persists only its current name and notes',read(ids[1]),{label:'Newer next-session draft',notes:'Newer private debrief draft'});
  check('Two explicit Session Saves make exactly two writes',requests.filter(row=>row.method==='PUT').map(row=>row.path),ids.map(id=>'/api/sessions/'+id));
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'detached'});
  dialog=await open('Accepted source name');const replay=hold('/api/sessions/'+ids[0]+'/replay','GET');
  await dialog.getByRole('button',{name:'Show on Map',exact:true}).click();await seen(replay);
  await page.getByRole('button',{name:'Close session replay',exact:true}).click();await frame();await release(replay);
  check('Closing a loading replay prevents its delayed result reopening the controls',await page.getByRole('region',{name:'Session replay',exact:true}).count(),0);
  check('Closing a loading replay retains its source Session',read(ids[0]),{label:'Accepted source name',notes:'Accepted source debrief'});
  await page.goto(app.origin+'/#sessions',{waitUntil:'domcontentloaded',timeout:15000});await page.locator('.connection-status.online').waitFor({state:'attached'});
  dialog=await open('Accepted source name');response=page.waitForResponse(value=>new URL(value.url()).pathname==='/api/sessions/'+ids[0]+'/replay');await dialog.getByRole('button',{name:'Show on Map',exact:true}).click();assert.equal((await response).status(),200);
  const controls=page.getByRole('region',{name:'Session replay',exact:true});await controls.locator('input[aria-label="Session replay time"]').waitFor();
  check('Reopening replay after cancellation loads the actual saved Session',await controls.locator('h3').allTextContents(),['Accepted source name']);
  check('Two explicit replay opens make exactly two reads',requests.filter(row=>row.path.endsWith('/replay')).length,2);
 }finally{
  for(const gate of gates)gate.release.resolve();
  let timer;try{await Promise.race([Promise.all(gates.filter(gate=>gate.entered).map(gate=>gate.done.promise)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Session cancellation cleanup timed out.')),10000);})]);}
  finally{clearTimeout(timer);await page.unroute(pattern,handler);for(const id of ids)app.store.db.prepare('DELETE FROM sessions WHERE id=?').run(id);}
 }
}
