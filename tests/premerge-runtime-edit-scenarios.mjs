import assert from 'node:assert/strict';
import {defaultStream} from '../server/stream.mjs';

async function saveGate({page,app,deferred},path) {
 let held=null,fail=false;
 const handler=async route=>{
  if(route.request().method()!=='PUT')return route.fallback();
  if(fail){fail=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic saved settings failure'})});}
  if(!held)return route.continue();
  const gate=held;held=null;
  try{const response=await route.fetch();assert.equal(response.status(),200);gate.body=await response.json();gate.seen.resolve();await gate.release.promise;await route.fulfill({response});}
  finally{gate.done.resolve();}
 };
 await page.route(app.origin+'/api/'+path,handler);
 const all=[];
 return {hold(){const gate={seen:deferred(),release:deferred(),done:deferred()};all.push(gate);held=gate;return gate;},fail(){fail=true;},async close(){for(const gate of all)gate.release.resolve();await page.unroute(app.origin+'/api/'+path,handler);}};
}
async function entered(page,gate){await Promise.race([gate.seen.promise,page.waitForTimeout(10000).then(()=>{throw new Error('Save did not reach the real persistence response gate.');})]);}
function put(response,path){return new URL(response.url()).pathname==='/api/'+path&&response.request().method()==='PUT';}
async function release(page,gate,path,frame){const done=page.waitForEvent('requestfinished',{predicate:request=>new URL(request.url()).pathname==='/api/'+path&&request.method()==='PUT'});gate.release.resolve();await gate.done.promise;await done;await frame();}
async function ready(page,app,route){await page.goto(app.origin+'/#'+route,{waitUntil:'domcontentloaded',timeout:15000});await page.locator('.connection-status.online').waitFor({state:'attached'});await page.locator('.page-transition').waitFor();}

async function studioNarrowReachability({page,check,frame}){
 if(page.viewportSize()?.width!==390)return;
 const dimensions=await page.evaluate(()=>{
  const describe=element=>{const r=element.getBoundingClientRect(),style=getComputedStyle(element);return {tag:element.tagName,className:String(element.className),rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,scrollLeft:element.scrollLeft,scrollTop:element.scrollTop,overflowX:style.overflowX,overflowY:style.overflowY,gridTemplateColumns:style.gridTemplateColumns};};
  const grid=document.querySelector('.studio-grid'),ancestors=[];for(let element=grid;element;element=element.parentElement)ancestors.push(describe(element));
  return {viewport:{width:innerWidth,height:innerHeight},document:describe(document.scrollingElement),grid:describe(grid),children:[...grid.children].map(describe),inspector:describe(document.querySelector('.inspector-fields')),ancestors};
 });
 const targets=[...['Text block','Countdown','Kairo goal','OPSEC cover'].map(name=>({name,locator:page.locator('.template-grid').getByRole('button',{name,exact:true})})),{name:'Live output',locator:page.locator('.canvas-bar').getByRole('tab',{name:'Live output',exact:true})}];
 for(const {name,locator} of targets){
  const scroll=await locator.evaluate(element=>{const ancestors=[];for(let node=element;node;node=node.parentElement)ancestors.push({left:node.scrollLeft,top:node.scrollTop});return {x:scrollX,y:scrollY,ancestors};});
  try{
   await locator.evaluate(element=>element.scrollIntoView({block:'center',inline:'center',behavior:'instant'}));await frame();
   const result=await locator.evaluate(element=>{
    const r=element.getBoundingClientRect(),style=getComputedStyle(element),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return {rendered:r.width>0&&r.height>0&&style.display!=='none'&&style.visibility==='visible',withinViewport:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,pointerHits:!!hit&&(hit===element||element.contains(hit)),rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},viewport:{width:innerWidth,height:innerHeight},scroll:{x:scrollX,y:scrollY},hit:hit?{tag:hit.tagName,className:String(hit.className)}:null};
   });
   check('Narrow Studio '+name+' control remains fully reachable by scrolling',{rendered:result.rendered,withinViewport:result.withinViewport,pointerHits:result.pointerHits},{rendered:true,withinViewport:true,pointerHits:true},{dimensions,result});
  }finally{
   await locator.evaluate((element,saved)=>{let index=0;for(let node=element;node;node=node.parentElement){const point=saved.ancestors[index++];if(point){node.scrollLeft=point.left;node.scrollTop=point.top;}}window.scrollTo(saved.x,saved.y);},scroll);await frame();
  }
 }
}

export async function studioSaveDraft(args){
 const {page,app,check,frame}=args,c=defaultStream();
 c.elements=[{id:'review-text',kind:'text',name:'Review text',text:'Original stream text',label:'',x:80,y:80,width:400,height:100,fontSize:24,opacity:.7,color:'#97ebce',visible:true,binding:'none'}];
 app.core.stream.save(c);const transport=await saveGate(args,'stream');
 try{
  await ready(page,app,'studio');await page.getByRole('button',{name:'Review text',exact:true}).click();
  const editor=page.locator('.inspector textarea'),save=page.locator('.studio-toolbar').getByRole('button',{name:'Save changes',exact:true});
  check('Cold Studio loads the actual saved element text',await editor.inputValue(),'Original stream text');
  await editor.fill('Submitted stream text');const gate=transport.hold();await save.click();await entered(page,gate);
  assert.equal(app.core.stream.config().elements[0].text,'Submitted stream text');
  await editor.fill('Newer unsaved stream text');await page.getByRole('button',{name:'Hide Review text',exact:true}).click();
  await release(page,gate,'stream',frame);
  check('An older Studio save preserves newer text edits',await editor.inputValue(),'Newer unsaved stream text');
  check('An older Studio save preserves newer layer visibility edits',await page.getByRole('button',{name:'Show Review text',exact:true}).count(),1);
  check('Newer Studio edits remain marked unsaved',await page.locator('.studio-toolbar .meta').textContent(),'Unsaved changes');
  check('Newer Studio edits remain saveable',await save.isEnabled(),true);
  check('Only the submitted stream draft has reached persistent state',{text:app.core.stream.config().elements[0].text,visible:app.core.stream.config().elements[0].visible},{text:'Submitted stream text',visible:true});
  // Repair the deliberate baseline loss before independent recovery controls.
  await editor.fill('Final stream text');if(await page.getByRole('button',{name:'Hide Review text',exact:true}).count())await page.getByRole('button',{name:'Hide Review text',exact:true}).click();
  let response=page.waitForResponse(value=>put(value,'stream'));await save.click();assert.equal((await response).status(),200);await frame();
  check('Saving after the race persists the current full draft',{text:app.core.stream.config().elements[0].text,visible:app.core.stream.config().elements[0].visible},{text:'Final stream text',visible:false});
  check('A current Studio save marks the form clean',await save.isDisabled(),true);
  await editor.fill('Retain this failed Studio save');transport.fail();response=page.waitForResponse(value=>put(value,'stream'));await save.click();assert.equal((await response).status(),503);await frame();
  check('A failed Studio save retains the current draft',await editor.inputValue(),'Retain this failed Studio save');
  check('A failed Studio save stays retryable',await save.isEnabled(),true);
  response=page.waitForResponse(value=>put(value,'stream'));await save.click();assert.equal((await response).status(),200);await frame();
  check('Studio retry persists the retained draft',app.core.stream.config().elements[0].text,'Retain this failed Studio save');
  await studioNarrowReachability(args);
 }finally{await transport.close();}
}

export async function opsecSaveDraft(args){
 const {page,app,check,frame}=args;
 app.store.set('opsec',{manual:false,allowHighsec:false,characterId:0,blueAlliances:[],hostileAlliances:[]});app.core.refreshOPSEC();
 const transport=await saveGate(args,'opsec');
 try{
  await ready(page,app,'opsec');const highsec=page.getByRole('switch',{name:'Release covers in High-Sec',exact:true}),save=page.getByRole('button',{name:'Save protection rules',exact:true});
  check('Cold OPSEC loads the saved cover policy',await highsec.getAttribute('aria-checked'),'false');
  await highsec.click();const gate=transport.hold();await save.click();await entered(page,gate);
  assert.equal(app.store.get('opsec').allowHighsec,true);
  await highsec.click();await release(page,gate,'opsec',frame);
  check('An older OPSEC save preserves a newer cover-policy edit',await highsec.getAttribute('aria-checked'),'false');
  check('Only the submitted OPSEC policy is persisted',app.store.get('opsec').allowHighsec,true);
  if(await highsec.getAttribute('aria-checked')==='true')await highsec.click();
  let response=page.waitForResponse(value=>put(value,'opsec'));await save.click();assert.equal((await response).status(),200);await frame();
  check('Saving after the OPSEC race persists the current policy',app.store.get('opsec').allowHighsec,false);
  const manual=page.getByRole('switch',{name:'Force protection on',exact:true}),manualGate=transport.hold();await manual.click();await entered(page,manualGate);await highsec.click();await release(page,manualGate,'opsec',frame);
  check('A delayed immediate manual override still persists and displays',{saved:app.store.get('opsec').manual,displayed:await manual.getAttribute('aria-checked')},{saved:true,displayed:'true'});
  check('A manual override response preserves another newer policy edit',await highsec.getAttribute('aria-checked'),'true');
  if(await highsec.getAttribute('aria-checked')==='false')await highsec.click();
  response=page.waitForResponse(value=>put(value,'opsec'));await save.click();assert.equal((await response).status(),200);await frame();
  await highsec.click();transport.fail();response=page.waitForResponse(value=>put(value,'opsec'));await save.click();assert.equal((await response).status(),503);await frame();
  check('A failed OPSEC save retains its current draft',await highsec.getAttribute('aria-checked'),'false');
  check('A failed OPSEC save leaves persistence unchanged',app.store.get('opsec').allowHighsec,true);
  response=page.waitForResponse(value=>put(value,'opsec'));await save.click();assert.equal((await response).status(),200);await frame();
  check('OPSEC retry persists the retained policy',app.store.get('opsec').allowHighsec,false);
 }finally{await transport.close();}
}
