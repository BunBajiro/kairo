import assert from 'node:assert/strict';
import {allScopes} from '../server/modules/catalog.mjs';
import {DEFAULT_IMPORT_SETTINGS} from '../server/import-math.mjs';
import {saveHistory,DAY} from '../server/market-history.mjs';

// Real compiled manifest controls and real SQLite quotes/plans. Delay only the
// response delivery so edits and closed/replaced dialogs retain their owner.
export async function importPlanOwnership({page,app,check,frame,deferred}){
 const hubId=60008494,jita=60003760,now=Date.now(),iso=n=>new Date(n).toISOString(),db=app.store.db;
 const prefix='Plan ownership ',quotePath='/api/markets/imports/plan-quote',savePath='/api/markets/imports/plans';
 const pilot=db.prepare('SELECT scopes FROM characters WHERE id=42').get(),gates=[];
 const requests={quote:0,save:0};let held=null,failSave=false;
 db.prepare('UPDATE characters SET scopes=? WHERE id=42').run(JSON.stringify(allScopes));
 const sample=data=>({status:'ready',updatedAt:iso(now),expiresAt:iso(now+DAY),data});
 app.store.saveSnapshot(42,'skills',sample({skills:[16622,3446,16597].map(skill_id=>({skill_id,active_skill_level:5,trained_skill_level:5}))}));
 app.store.saveSnapshot(42,'standings',sample([]));app.store.saveSnapshot(42,'orders',sample([]));
 app.store.set('market:owner:'+hubId,{corporationId:1000084,corporationName:'Amarr Navy',factionId:500003,expires:now+DAY});
 app.store.set('market:imports:'+hubId,{...DEFAULT_IMPORT_SETTINGS,characterId:42,minProfit:0});
 db.prepare("DELETE FROM market_import_plans WHERE hub_id=? AND json_extract(body,'$.name') LIKE ?").run(hubId,prefix+'%');
 for(const [id,name] of [[1403,'Plan test repairer'],[519,'Plan test scrambler']]){
  db.prepare('INSERT INTO market_types(type_id,name) VALUES(?,?) ON CONFLICT(type_id) DO UPDATE SET name=excluded.name').run(id,name);
  for(const [hub,price,quantity] of [[jita,1000000,100],[hubId,3000000,5]]){
   db.prepare('INSERT OR REPLACE INTO market_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(hub,id,500000,price,price,quantity,0,1,0,iso(now),iso(now+DAY),'plan-ownership');
   db.prepare('INSERT OR REPLACE INTO market_orders VALUES(?,?,?,?,?,?,?,?,?,?)').run(hub,id,id,0,price,quantity,1,'station',iso(now-DAY),90);
  }
  saveHistory(app.store,10000043,id,Array.from({length:30},(_,i)=>({date:iso(now-(i+1)*DAY).slice(0,10),average:1800000,lowest:1400000,highest:2200000,volume:500,order_count:20})),iso(now),iso(now+DAY),'ESI',now);
 }
 const service=app.core.markets.imports,analysis=await service.analyse(hubId),items=analysis.groups.flatMap(group=>group.items);
 assert.equal(items.length,2);const recipe=item=>({typeId:item.typeId,...item.best.profiteering});
 const other=await service.savePlan(hubId,{name:prefix+'other saved plan',lines:[recipe(items[0])]});
 const handler=async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()!=='POST')return route.fallback();
  requests[path===quotePath?'quote':'save']++;
  if(path===savePath&&failSave){failSave=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic import plan save failure'})});}
  if(!held||held.path!==path)return route.continue();
  const gate=held;held=null;gate.started=true;
  try{const response=await route.fetch();assert.equal(response.status(),200);gate.body=await response.json();gate.seen.resolve();await gate.release.promise;await route.fulfill({response});}
  finally{gate.done.resolve();}
 };
 const dialog=()=>page.locator('.import-plan-dialog'),manifest=()=>page.locator('.import-plan'),review=()=>manifest().getByRole('button',{name:'Review & save plan',exact:true});
 const close=async()=>{await dialog().getByRole('button',{name:'Close',exact:true}).click();await dialog().waitFor({state:'detached'});};
 const hold=path=>{const gate={path,seen:deferred(),release:deferred(),done:deferred()};held=gate;gates.push(gate);return gate;};
 const seen=gate=>Promise.race([gate.seen.promise,page.waitForTimeout(10000).then(()=>{throw new Error('Import plan response did not reach its gate.');})]);
 const release=async gate=>{const finished=page.waitForEvent('requestfinished',{predicate:request=>new URL(request.url()).pathname===gate.path&&request.method()==='POST'});gate.release.resolve();await gate.done.promise;await finished;await frame();};
 const save=()=>dialog().getByRole('button',{name:'Save import plan',exact:true});
 const persisted=id=>JSON.parse(db.prepare('SELECT body FROM market_import_plans WHERE id=?').get(id).body);
 await page.route(app.origin+quotePath,handler);await page.route(app.origin+savePath,handler);
 try{
  await page.goto(app.origin+'/#markets',{waitUntil:'domcontentloaded',timeout:15000});
  await page.locator('.connection-status.online').waitFor({state:'attached'});
  await page.locator('.market-hub').filter({has:page.locator('strong',{hasText:'Amarr'})}).click();
  await page.locator('.markets-module > [data-slot=tabs] > [role=tablist]').getByRole('tab',{name:'Import Analyser',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.import-card-open').length===2);
  for(let index=0;index<2;index++){
   await page.locator('.import-card-open').nth(index).click();const detail=page.locator('.import-detail-dialog');
   await detail.getByLabel('Import quantity',{exact:true}).waitFor();
   await detail.getByRole('button',{name:/Add (anchoring|profiteering) option to plan/}).click();await detail.waitFor({state:'detached'});
  }
  check('Import manifest starts with two real qualifying items',await manifest().locator('tbody tr').count(),2);
  const removed=await manifest().locator('tbody tr').first().locator('td').first().innerText(),gate=hold(quotePath);
  await review().click();await seen(gate);assert.equal(gate.body.lines.length,2);
  await manifest().getByRole('button',{name:/^Remove .* from import plan$/}).first().click();
  check('Removing an item updates the current manifest during review',await manifest().locator('tbody tr').count(),1);
  await release(gate);
  check('A quote for an edited manifest cannot open a stale review',await dialog().count(),0,{removed});
  check('A delayed manifest quote cannot restore the removed draft item',await manifest().locator('tbody tr').count(),1);
  if(await dialog().count())await close();
  await review().click();await save().waitFor();
  check('A current review contains exactly the retained manifest item',await dialog().locator('tbody tr').count(),1);
  await dialog().getByLabel('Plan name',{exact:true}).fill(prefix+'current saved plan');
  const savedResponse=page.waitForResponse(response=>new URL(response.url()).pathname===savePath&&response.request().method()==='POST');
  await save().click();const current=await(await savedResponse).json();await dialog().getByRole('heading',{name:prefix+'current saved plan',exact:true}).waitFor();
  check('Saving the current review persists exactly its retained item',persisted(current.id).lines.length,1);
  await close();
  await review().click();await save().waitFor();await dialog().getByLabel('Plan name',{exact:true}).fill(prefix+'delayed saved plan');
  const delayed=hold(savePath);await save().click();await seen(delayed);
  check('Delayed save reaches real persistence with its submitted name',persisted(current.id).name,prefix+'delayed saved plan');
  await close();check('A pending save dialog can be closed',await dialog().count(),0);
  await page.locator('.import-saved-plans button').filter({hasText:other.name}).click();
  await dialog().getByRole('heading',{name:other.name,exact:true}).waitFor();await release(delayed);
  check('An old save response preserves the newly selected saved plan',await dialog().getByLabel('Plan name',{exact:true}).inputValue(),other.name);
  check('An old save response leaves the other persisted plan intact',persisted(other.id).name,other.name);
  await close();
  await review().click();await save().waitFor();await dialog().getByLabel('Plan name',{exact:true}).fill(prefix+'retry saved plan');
  failSave=true;let response=page.waitForResponse(r=>new URL(r.url()).pathname===savePath&&r.request().method()==='POST');await save().click();assert.equal((await response).status(),503);await dialog().getByText('Synthetic import plan save failure',{exact:true}).waitFor();
  check('A failed current save retains the editable plan name',await dialog().getByLabel('Plan name',{exact:true}).inputValue(),prefix+'retry saved plan');
  check('A failed current save leaves its previous persisted version intact',persisted(current.id).name,prefix+'delayed saved plan');
  response=page.waitForResponse(r=>new URL(r.url()).pathname===savePath&&r.request().method()==='POST');await save().click();const retried=await(await response).json();await dialog().getByRole('heading',{name:prefix+'retry saved plan',exact:true}).waitFor();
  check('Retrying a failed plan save persists its current name',persisted(retried.id).name,prefix+'retry saved plan');
  await close();
  await manifest().getByRole('button',{name:'Clear draft',exact:true}).click();
  await page.locator('.import-card-open').first().click();const renameDetail=page.locator('.import-detail-dialog');
  await renameDetail.getByLabel('Import quantity',{exact:true}).waitFor();await renameDetail.getByRole('button',{name:/Add (anchoring|profiteering) option to plan/}).click();await renameDetail.waitFor({state:'detached'});
  await review().click();await save().waitFor();await dialog().getByLabel('Plan name',{exact:true}).fill(prefix+'submitted plan name');
  const renamed=hold(savePath);await save().click();await seen(renamed);
  const createdId=renamed.body.id;assert.notEqual(createdId,current.id);
  await dialog().getByLabel('Plan name',{exact:true}).fill(prefix+'newer plan name');
  await release(renamed);
  await page.waitForFunction(()=>{const save=[...document.querySelectorAll('.import-plan-dialog button')].find(button=>button.textContent.trim()==='Save import plan');return !save||!save.disabled;});
  check('A pending plan save preserves a newer editable plan name',await dialog().getByLabel('Plan name',{exact:true}).inputValue(),prefix+'newer plan name');
  check('A newer plan name remains saveable after an older acknowledgement',await save().count(),1);
  check('Only the submitted plan name reaches persistence before retry',{id:renamed.body.id,name:persisted(createdId).name},{id:createdId,name:prefix+'submitted plan name'});
  // Repair the deliberate old-implementation loss only to reach independent
  // retry controls. This explicit extra review is counted separately.
  let recoveryQuotes=0;if(!await save().count()){await close();await review().click();await save().waitFor();await dialog().getByLabel('Plan name',{exact:true}).fill(prefix+'newer plan name');recoveryQuotes++;}
  response=page.waitForResponse(r=>new URL(r.url()).pathname===savePath&&r.request().method()==='POST');await save().click();const renamedRetry=await(await response).json();await dialog().getByRole('heading',{name:prefix+'newer plan name',exact:true}).waitFor();
  check('Saving the retained name updates the original plan identity',{id:renamedRetry.id,name:persisted(createdId).name},{id:createdId,name:prefix+'newer plan name'});
  check('Saving the retained name cannot create a duplicate plan',db.prepare("SELECT COUNT(*) n FROM market_import_plans WHERE hub_id=? AND json_extract(body,'$.name') LIKE ?").get(hubId,prefix+'%').n,3);
  check('Import plan ownership keeps explicit request counts bounded',requests,{quote:5+recoveryQuotes,save:6});
  await close();
  const row=manifest().locator('tbody tr').first(),table=manifest().locator('[data-slot=table-container]');
  await row.scrollIntoViewIfNeeded();await table.evaluate(element=>{element.scrollLeft=0;});await frame();
  const textGeometry=await row.evaluate(element=>{
   const container=element.closest('[data-slot=table-container]'),clip=container.getBoundingClientRect();
   const visible=rect=>({left:Math.max(rect.left,clip.left,0),top:Math.max(rect.top,clip.top,0),right:Math.min(rect.right,clip.right,innerWidth),bottom:Math.min(rect.bottom,clip.bottom,innerHeight)});
   const fragments=parent=>{const rectangles=[],walker=document.createTreeWalker(parent,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){if(!node.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(node);for(const rect of range.getClientRects()){const part=visible(rect);if(part.right>part.left&&part.bottom>part.top)rectangles.push(part);}}return rectangles;};
   const cells=element.querySelectorAll('td'),name=fragments(cells[0].querySelector('.item-name')),quantity=fragments(cells[1]),overlaps=[];
   for(const a of name)for(const b of quantity){const width=Math.min(a.right,b.right)-Math.max(a.left,b.left),height=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);if(width>.5&&height>.5)overlaps.push({width,height,name:a,quantity:b});}
   const box=target=>{const r=target.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
   return {name,quantity,overlaps,item:box(cells[0].querySelector('.item-name')),firstCell:box(cells[0]),quantityCell:box(cells[1]),scrollWidth:container.scrollWidth,clientWidth:container.clientWidth,scrollLeft:container.scrollLeft};
  });
  check('Visible manifest item and quantity text are both measured',{name:textGeometry.name.length>0,quantity:textGeometry.quantity.length>0},{name:true,quantity:true});
  check('Visible manifest item-name fragments do not overlap quantity text',textGeometry.overlaps.length,0,{geometry:textGeometry});
  const remove=row.getByRole('button',{name:/^Remove .* from import plan$/});await remove.scrollIntoViewIfNeeded();await frame();
  const reachable=await remove.evaluate(element=>{const r=element.getBoundingClientRect(),clip=element.closest('[data-slot=table-container]').getBoundingClientRect(),x=(r.left+r.right)/2,y=(r.top+r.bottom)/2,hit=document.elementFromPoint(x,y);return {visible:r.width>0&&r.height>0,insideViewport:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,insideTable:r.left>=clip.left&&r.right<=clip.right,pointerHits:hit===element||element.contains(hit)};});
  check('Manifest horizontal scrolling keeps its remove control reachable',reachable,{visible:true,insideViewport:true,insideTable:true,pointerHits:true});
  check('Manifest geometry and scrolling add no quote or save requests',{...requests},{quote:5+recoveryQuotes,save:6});
  await table.evaluate(element=>{element.scrollLeft=0;});await frame();
 }finally{
  for(const gate of gates)gate.release.resolve();await Promise.all(gates.filter(gate=>gate.started).map(gate=>gate.done.promise));
  await page.unroute(app.origin+quotePath,handler);await page.unroute(app.origin+savePath,handler);
  db.prepare('UPDATE characters SET scopes=? WHERE id=42').run(pilot.scopes);
  db.prepare("DELETE FROM market_import_plans WHERE hub_id=? AND json_extract(body,'$.name') LIKE ?").run(hubId,prefix+'%');
 }
}
