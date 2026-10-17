/**
 * Explicit display projections from private records into Stream widgets/toasts.
 * Only approved scalar values cross this boundary; never spread a snapshot,
 * event payload or private record into output. See ../docs/STREAMING.md.
 */
import {protectionLabel} from '../public/stream/protection.js';
import {snapshotFresh} from './polling.mjs';
let numberFormat;
const format=n=>(numberFormat??=new Intl.NumberFormat('en-GB',{maximumFractionDigits:2})).format(Number(n)||0);
const percent=(start,end,now=Date.now())=>{const a=Date.parse(start),b=Date.parse(end);return Number.isFinite(a)&&b>a?Math.min(100,Math.max(0,(now-a)/(b-a)*100)):0;};
export const bindingKinds=['none','goal.progress','session.elapsed','session.report','goals.completed','training.remaining','wallet.balance','pilot.ship','industry.next'];
export const toastContexts={
 'test.toast':{fields:['message'],title:'Signal received',message:'{{message}}',sample:{message:'Your broadcast surface is connected.'}},
 'skill.completed':{fields:['skill','level'],title:'Training complete',message:'{{skill}} trained to level {{level}}.',sample:{skill:'Heavy Assault Cruisers',level:'V'}},
 'industry.ready':{fields:['product','runs','job'],title:'Industry ready',message:'{{product}} · {{runs}} runs ready for delivery.',sample:{product:'Muninn',runs:'10',job:'12345'}},
 'goal.completed':{fields:['goal','progress','target'],title:'Objective complete',message:'{{goal}} · {{progress}} / {{target}}',sample:{goal:'New fleet hull',progress:'10',target:'10'}},
 'session.started':{fields:['session'],title:'Session started',message:'{{session}} is underway.',sample:{session:'Friday fleet'}},
 'session.ended':{fields:['session','minutes'],title:'Session complete',message:'{{session}} · {{minutes}} minutes in space.',sample:{session:'Friday fleet',minutes:'90'}},
 'killmail.kill':{fields:['hull','system','attackers','damage','record'],title:'Kill recorded',message:'{{hull}} destroyed · {{attackers}} pilots involved.',sample:{hull:'Caracal',system:'Example system',attackers:'8',damage:'12400',record:'12345'}},
 'killmail.loss':{fields:['hull','system','attackers','damage','record'],title:'Loss recorded',message:'Lost a {{hull}} · {{attackers}} attackers.',sample:{hull:'Caracal',system:'Example system',attackers:'8',damage:'12400',record:'12345'}},
 'location.changed':{fields:['system','region','ship'],title:'System entered',message:'{{system}} · {{region}}',sample:{system:'Example system',region:'Example region',ship:'Stiletto'}},
 'opsec.changed':{fields:['state','previous','reason'],title:'Broadcast protection · {{state}}',message:'{{previous}} → {{state}} · {{reason}}',sample:{state:'MANUAL',previous:'UNKNOWN',reason:'Manual protection is engaged.'}}
};
/** Build scalar template fields for recognized event families. */
export function eventContext(store,e){
 const p=e.payload||{},names=store.get('names',{}),name=(id,f)=>names[id]||f;
 if(e.type==='test.toast')return {message:'Your broadcast surface is connected.'};
 if(e.type==='skill.completed')return {skill:p.skill_name||name(p.skill_id,'Skill'),level:p.level};
 if(e.type==='industry.ready')return {product:p.product_name||name(p.product_type_id,'Industry product'),runs:p.runs??'—',job:p.job_id};
 if(e.type==='goal.completed'){const g=store.db.prepare('SELECT * FROM goals WHERE id=?').get(p.goal_id||'');return {goal:p.goal_title||g?.title||'Objective',progress:format(p.progress??g?.progress),target:format(p.target??g?.target)};}
 if(e.type.startsWith('session.')){const s=store.db.prepare('SELECT * FROM sessions WHERE id=?').get(p.session_id||'');return {session:p.session_name||s?.label||'Flight session',minutes:p.duration_minutes??(s?Math.floor(((s.ended?Date.parse(s.ended):Date.now())-Date.parse(s.started))/60000):'—')};}
 if(e.type.startsWith('killmail.'))return {hull:p.hull_name||name(p.ship_type_id,'Ship'),system:p.system_name||name(p.system_id,'Unknown system'),attackers:p.attackers??'—',damage:p.damage_taken??'—',record:p.killmail_id};
 if(e.type==='location.changed')return {system:p.system_name||name(p.system_id,'Unknown system'),region:p.region_name||'Unknown region',ship:p.ship_name||name(p.ship_type_id,'Unknown hull')};
 if(e.type==='opsec.changed')return {state:protectionLabel(p.state).toUpperCase(),previous:protectionLabel(p.previous).toUpperCase(),reason:p.reason||'Protection context updated.'};return {};
}
/**
 * Interpolate allowlisted scalar fields into bounded plain text. system/region
 * are redacted under protection unless the saved rule explicitly allows location;
 * test=true uses schema samples. The renderer owns safe text-node insertion.
 */
export function renderToast(store,event,rule,opsec,test=false){
 const schema=toastContexts[event.type],context=test?schema?.sample||{}:eventContext(store,event);
 const interpolate=(template,max)=>String(template||'').replace(/\{\{\s*([\w]+)\s*\}\}/g,(_,key)=>{if(!schema?.fields.includes(key))return '—';if(['system','region'].includes(key)&&opsec.hidden&&!rule.allowLocation)return 'Protected location';const v=context[key];return ['string','number'].includes(typeof v)?String(v).slice(0,160):'—';}).slice(0,max);
 return {title:interpolate(rule.title,140),message:interpolate(rule.message,360)};
}
// One update owns these reads. Nothing survives to the next freshness check.
function projectionInputs(store, auth) {
 const cache=new Map(), at=Date.now();
 const once=(key,read)=>{if(!cache.has(key))cache.set(key,read());return cache.get(key);};
 return {
  at,
  characters:()=>once('characters',()=>auth.characters()),
  setting:(key,fallback)=>once('setting:'+key,()=>store.get(key,fallback)),
  snapshot:(id,key)=>once('snapshot:'+id+':'+key,()=>{const s=store.snapshot(id,key);return snapshotFresh(s,at)?s.data:null;}),
  goal:(id,key)=>once(JSON.stringify(['goal',id,key]),()=>store.db.prepare('SELECT * FROM goals WHERE id=? AND character_id=?').get(key,id)),
  completed:id=>once('completed:'+id,()=>store.db.prepare('SELECT COUNT(*) n FROM goals WHERE character_id=? AND done=1').get(id).n),
  session:id=>once('session:'+id,()=>store.db.prepare('SELECT * FROM sessions WHERE character_id=? AND ended IS NULL ORDER BY started DESC LIMIT 1').get(id)),
  counts:(id,started)=>once('session-counts:'+id+':'+started,()=>Object.fromEntries(store.db.prepare('SELECT type,COUNT(*) n FROM events WHERE character_id=? AND at>=? GROUP BY type').all(id,started).map(r=>[r.type,r.n]))),
  firstTraining:id=>once('training:'+id,()=>{const q=once('snapshot:'+id+':queue',()=>{const s=store.snapshot(id,'queue');return snapshotFresh(s,at)?s.data:null;});return !q?null:{first:q.filter(row=>row.finish_date&&Date.parse(row.finish_date)>at).sort((a,b)=>a.queue_position-b.queue_position)[0]};}),
  nextIndustry:id=>once('industry:'+id,()=>{const jobs=once('snapshot:'+id+':jobs',()=>{const s=store.snapshot(id,'jobs');return snapshotFresh(s,at)?s.data:null;});return !jobs?null:{job:jobs.filter(row=>['active','ready'].includes(row.status)).sort((a,b)=>Date.parse(a.end_date)-Date.parse(b.end_date))[0]};}),
 };
}

/** Share reads/results within one update only; return display values keyed by element ID. */
export function bindingProjections(store,auth,elements) {
 const input=projectionInputs(store,auth), results=new Map();
 return Object.fromEntries(elements.map(element=>{
  const key=JSON.stringify([element.binding,element.characterId,element.sourceId,element.bindingDisplay]);
  if(!results.has(key))results.set(key,bindingProjection(store,auth,element,input));
  return [element.id,results.get(key)];
 }));
}
/**
 * Project one selected record/pilot into display fields. Missing/disconnected or
 * stale sources yield unavailable, while valid empty work yields idle. Progress
 * value is 0–100; endsAt/startedAt are epoch ms. characterId=0 explicitly selects
 * local records; an omitted ID follows the protected or first connected pilot.
 */
export function bindingProjection(store,auth,e,input=projectionInputs(store,auth)){
 const fallback={text:'Source unavailable',detail:'',value:0,endsAt:0,startedAt:0,bindingStatus:'unavailable'};if(!e.binding||e.binding==='none')return {};
 const id=e.characterId??(input.setting('opsec',{}).characterId||input.characters()[0]?.id||0);if(id&&!input.characters().some(c=>c.id===id&&!c.needsReauth))return fallback;
 const module={'training.remaining':'training','wallet.balance':'wallet','pilot.ship':'pilot','industry.next':'industry'}[e.binding];if(module&&!input.setting('module:'+module,true))return fallback;
 const snap=key=>input.snapshot(id,key),ready=p=>({...p,bindingStatus:'ready'});
 if(e.binding==='goal.progress'){const g=input.goal(id,e.sourceId||'');if(!g)return fallback;const numbers=format(g.progress)+' / '+format(g.target);return ready({text:e.bindingDisplay==='numbers'?numbers:g.title,detail:e.bindingDisplay==='title'||e.bindingDisplay==='numbers'?'':numbers+(g.done?' · COMPLETE':''),value:Math.min(100,g.progress/g.target*100)});}
 if(e.binding==='goals.completed'){const count=input.completed(id);return ready({text:count+' completed',detail:''});}
 if(e.binding.startsWith('session.')){const s=input.session(id);if(!s)return {...fallback,text:'No active session',bindingStatus:'idle'};if(e.binding==='session.elapsed')return ready({text:'',startedAt:Date.parse(s.started),detail:e.bindingDisplay==='numbers'?'':s.label});const n=input.counts(id,s.started);return ready({text:(n['killmail.kill']||0)+' KILLS / '+(n['killmail.loss']||0)+' LOSSES',detail:e.bindingDisplay==='numbers'?'':s.label});}
 if(e.binding==='training.remaining'){const source=input.firstTraining(id);if(!source)return fallback;const {first}=source;return first?ready({text:(input.setting('names',{})[first.skill_id]||'Skill')+' '+first.finished_level,detail:'',endsAt:Date.parse(first.finish_date),value:percent(first.start_date,first.finish_date,input.at)}):{...fallback,text:'Queue idle',bindingStatus:'idle'};}
 if(e.binding==='wallet.balance'){const balance=snap('wallet');return typeof balance==='number'?ready({text:format(balance)+' ISK',detail:''}):fallback;}
 if(e.binding==='pilot.ship'){const ship=snap('ship');return ship?ready({text:input.setting('names',{})[ship.ship_type_id]||'Hull '+ship.ship_type_id,detail:''}):fallback;}
 if(e.binding==='industry.next'){const source=input.nextIndustry(id);if(!source)return fallback;const {job}=source;return job?ready({text:input.setting('names',{})[job.product_type_id]||'Industry job',detail:job.runs+' runs',endsAt:Date.parse(job.end_date),value:percent(job.start_date,job.end_date,input.at)}):{...fallback,text:'No active jobs',bindingStatus:'idle'};}
 return fallback;
}
