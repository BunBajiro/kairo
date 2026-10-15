import assert from 'node:assert/strict';

async function navigate(page,id){
 if(!await page.locator('[data-route="'+id+'"]:visible').count())await page.getByRole('button',{name:'Show sidebar',exact:true}).click();
 await page.locator('[data-route="'+id+'"]:visible').first().click();
}

// Hold the request before it reaches Kairo, not merely its acknowledgement.
// Real persistence proves which accepted choice survives the crossing writes.
async function crossingSaves({page,context,app,check,frame,deferred},spec){
 const gate={seen:deferred(),release:deferred(),done:deferred()},newer={done:deferred()};let held=true,abortNext=false,olderEntered=false,newerEntered=false;
 const wait=promise=>Promise.race([promise,page.waitForTimeout(10000).then(()=>{throw new Error(spec.label+' request did not finish its gate.');})]);
 await context.addInitScript(({path,field})=>{const native=window.fetch;window.__coreSettingsWrites=[];window.fetch=function(input,options){if(String(input)===path&&options?.method==='PUT'){const body=JSON.parse(options.body);const value=field==='location'?body.intervals?.location:body[field];if(value!==undefined)window.__coreSettingsWrites.push(value);}return native.apply(this,arguments);};},{path:spec.path,field:spec.field});
 const handler=async route=>{
  if(route.request().method()!=='PUT')return route.fallback();
  const body=route.request().postDataJSON(),value=spec.field==='location'?body.intervals?.location:body[spec.field];
  if(value===undefined)return route.fallback();
  if(abortNext){abortNext=false;return route.abort('failed');}
  if(held&&value===spec.older){held=false;olderEntered=true;gate.seen.resolve();try{await gate.release.promise;const response=await route.fetch();assert.equal(response.status(),200);await route.fulfill({response});}finally{gate.done.resolve();}return;}
  if(value===spec.newer){newerEntered=true;try{const response=await route.fetch();assert.equal(response.status(),200);await route.fulfill({response});}finally{newer.done.resolve();}return;}
  return route.continue();
 };
 await page.route(app.origin+spec.path,handler);
 try{
  await page.goto(app.origin+'/#'+spec.route,{waitUntil:'domcontentloaded',timeout:15000});await spec.open();
  check(spec.label+' starts from persisted state',spec.stored(),spec.initial);
  await spec.choose(spec.older);await spec.save().click();await wait(gate.seen.promise);
  check(spec.label+' prevents another Save in the same mounted editor',await spec.save().isDisabled(),true);
  check(spec.label+' held request has not reached persistence',spec.stored(),spec.initial);
  await navigate(page,'overview');await page.getByRole('heading',{name:'Command centre',exact:true}).waitFor();
  await navigate(page,spec.route);await spec.open();await spec.choose(spec.newer);await spec.save().click();await frame();
  const admitted=await page.evaluate(()=>window.__coreSettingsWrites.slice());assert.equal(admitted[0],spec.older);
  // The baseline sends both immediately. A serialized correction queues the
  // newer intent; release the first before waiting for its queued successor.
  if(admitted.length>1){await wait(newer.done.promise);assert.equal(spec.stored(),spec.newer);}
  gate.release.resolve();await wait(gate.done.promise);await wait(newer.done.promise);await spec.settled();await frame();
  check(spec.label+' newer accepted Save survives navigation and an older delayed write',spec.stored(),spec.newer);
  check(spec.label+' editor displays the latest accepted choice',await spec.displayed(),spec.newer);
  check(spec.label+' two accepted Saves cause exactly two writes',await page.evaluate(()=>window.__coreSettingsWrites.slice()),[spec.older,spec.newer]);
  const persisted=spec.stored();await spec.choose(spec.recovery);abortNext=true;
  const failed=page.waitForEvent('requestfailed',{predicate:request=>new URL(request.url()).pathname===spec.path&&request.method()==='PUT'});await spec.save().click();await failed;await spec.settled();await frame();
  check(spec.label+' aborted transport leaves prior persistence intact',spec.stored(),persisted);
  check(spec.label+' aborted Save retains the retry draft',await spec.displayed(),spec.recovery);
  const retried=page.waitForResponse(response=>new URL(response.url()).pathname===spec.path&&response.request().method()==='PUT');await spec.save().click();assert.equal((await retried).status(),200);await spec.settled();await frame();
  check(spec.label+' explicit retry persists the current draft',spec.stored(),spec.recovery);
  check(spec.label+' retries stay bounded to explicit requests',await page.evaluate(()=>window.__coreSettingsWrites.slice()),[spec.older,spec.newer,spec.recovery,spec.recovery]);
 }finally{
  gate.release.resolve();
  // Unroute alone does not drain handlers already awaiting their transport.
  // Finish them before the caller restores this scenario's shared fixture.
  await wait(Promise.all([...(olderEntered?[gate.done.promise]:[]),...(newerEntered?[newer.done.promise]:[])]));
  await page.unroute(app.origin+spec.path,handler);
 }
}

export async function clientIdNavigationOwnership(args){
 const {page,app}=args,pilots=app.store.db.prepare('SELECT * FROM characters').all(),original=app.store.get('clientId','');
 app.store.db.prepare('DELETE FROM characters').run();app.store.set('clientId','navigation-client-original');
 const input=()=>page.locator('#client-id'),save=()=>page.getByRole('button',{name:'Save',exact:true});
 try{await crossingSaves(args,{label:'Client ID',path:'/api/settings',field:'clientId',route:'connections',initial:'navigation-client-original',older:'navigation-client-older',newer:'navigation-client-newer',recovery:'navigation-client-recovered',
  open:()=>input().waitFor(),choose:value=>input().fill(value),save,stored:()=>app.store.get('clientId'),displayed:()=>input().inputValue(),
  settled:()=>page.waitForFunction(()=>{const input=document.querySelector('#client-id');return input&&!input.parentElement.querySelector('button').disabled;})});}
 finally{app.store.set('clientId',original);for(const pilot of pilots){const keys=Object.keys(pilot);app.store.db.prepare('INSERT OR REPLACE INTO characters('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(key=>pilot[key]));}}
}

export async function pollingNavigationOwnership(args){
 const {page,app}=args,original=app.core.pollingSettings().intervals;app.core.savePolling({...original,location:5});
 const save=()=>page.locator('.polling-savebar').getByRole('button',{name:/^Save changes$|^Saving…$/});
 try{await crossingSaves(args,{label:'Polling preferences',path:'/api/settings/polling',field:'location',route:'modules',initial:5,older:15,newer:10,recovery:5,
  open:async()=>{await page.getByRole('tab',{name:'ESI polling',exact:true}).click();await page.locator('.polling-settings').waitFor();},
  choose:value=>page.getByRole('button',{name:'Location & system context: '+value+' sec'+(value===5?' (recommended)':''),exact:true}).click(),save,
  stored:()=>app.core.pollingSettings().intervals.location,
  displayed:async()=>{const pressed=page.locator('.polling-ticks button[aria-pressed=true]').filter({hasText:/^(5|10|15)s$/});return Number((await pressed.getAttribute('aria-label')).match(/: (\d+) sec/)[1]);},
  settled:()=>page.waitForFunction(()=>document.querySelector('.polling-savebar strong')?.textContent!=='Saving polling preferences…')});}
 finally{app.core.savePolling(original);}
}
