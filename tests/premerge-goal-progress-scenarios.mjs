import assert from 'node:assert/strict';

export async function goalProgressOrder({page,context,app,check,frame,deferred}){
 const id='progress-order-'+Date.now(),title='Ordered manual goal '+id,path='/api/goals/'+id;
 const gate={seen:deferred(),release:deferred(),done:deferred()},complete={done:deferred()};let hold=true,fail=false,writes=[];
 app.store.db.prepare('INSERT INTO goals(id,character_id,title,target,progress,kind,done,created) VALUES(?,42,?,10,0,?,0,?)').run(id,title,'manual',new Date().toISOString());
 const stored=()=>{const row=app.store.db.prepare('SELECT progress,done FROM goals WHERE id=?').get(id);return row?{...row}:null;};
 await context.addInitScript(path=>{const native=window.fetch;window.__goalProgressWrites=[];window.fetch=function(input,options){if(String(input).startsWith(path.replace('/api',''))||String(input).startsWith(path)){if(options?.method==='PUT')window.__goalProgressWrites.push(JSON.parse(options.body).progress);}return native.apply(this,arguments);};},path);
 const handler=async route=>{
  if(route.request().method()!=='PUT')return route.fallback();const body=route.request().postDataJSON();writes.push(body.progress);
  if(fail){fail=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic goal progress failure'})});}
  if(hold&&body.progress===2){hold=false;gate.seen.resolve();try{await gate.release.promise;const response=await route.fetch();assert.equal(response.status(),200);await route.fulfill({response});}finally{gate.done.resolve();}return;}
  if(body.progress===10){try{const response=await route.fetch();assert.equal(response.status(),200);await route.fulfill({response});}finally{complete.done.resolve();}return;}
  return route.continue();
 };
 await page.route(app.origin+path+'*',handler);
 const wait=promise=>Promise.race([promise,page.waitForTimeout(10000).then(()=>{throw new Error('Goal progress did not complete its ownership gate.');})]);
 try{
  await page.goto(app.origin+'/#goals',{waitUntil:'domcontentloaded',timeout:15000});
  const card=page.locator('.goal-card').filter({has:page.getByRole('heading',{name:title,exact:true})}),input=card.getByRole('spinbutton',{name:'Progress for '+title,exact:true});
  await input.waitFor();await input.fill('2');
  await card.getByRole('button',{name:'Complete',exact:false}).click();await wait(gate.seen.promise);await frame();
  const admitted=await page.evaluate(()=>window.__goalProgressWrites.slice());assert.equal(admitted[0],2,'Clicking Complete first accepts the edited field blur.');
  if(admitted.includes(10)){await wait(complete.done.promise);assert.deepEqual(stored(),{progress:10,done:1},'Complete has persisted while the earlier blur remains delayed.');}
  gate.release.resolve();await gate.done.promise;await wait(complete.done.promise);await frame();
  const actual=stored();check('Complete remains the final intent after an earlier edited-field blur arrives late',actual,{progress:10,done:1});
  await page.waitForFunction(({title,done})=>{const row=Array.from(document.querySelectorAll('.goal-card')).find(e=>e.querySelector('h3')?.textContent===title);return row?.classList.contains('done')===!!done;},{title,done:actual.done});
  check('Rendered manual objective agrees with the latest Complete action',await card.locator('.goal-progress-row .tag').innerText(),'Completed');
  check('Blur and Complete perform exactly one write for each accepted intent',writes,[2,10]);
  // Recover the deliberately exercised baseline reversal before healthy controls.
  if(!stored().done){const response=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='PUT');await card.getByRole('button',{name:'Complete',exact:false}).click();assert.equal((await response).status(),200);await card.getByRole('button',{name:'Reopen',exact:true}).waitFor();}
  let response=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='PUT');await card.getByRole('button',{name:'Reopen',exact:true}).click();assert.equal((await response).status(),200);await input.waitFor();check('An explicit later Reopen still clears completion',stored(),{progress:0,done:0});
  await input.fill('4');fail=true;response=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='PUT');await card.getByRole('heading',{name:title,exact:true}).click();assert.equal((await response).status(),503);await frame();check('A failed progress write preserves the saved objective',stored(),{progress:0,done:0});
  await input.fill('5');response=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='PUT');await card.getByRole('heading',{name:title,exact:true}).click();assert.equal((await response).status(),200);await frame();check('A later edited progress value recovers after failure',stored(),{progress:5,done:0});
 }finally{gate.release.resolve();await page.unroute(app.origin+path+'*',handler);app.store.db.prepare('DELETE FROM goals WHERE id=?').run(id);}
}
