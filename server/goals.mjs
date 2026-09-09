import {randomUUID} from 'node:crypto';
import {catalog} from './modules/catalog.mjs';
import {snapshotFresh} from './polling.mjs';

export const goalSources=[
 {id:'manual',label:'Manual checklist / counter',unit:'steps',description:'Update progress yourself.'},
 {id:'wallet.balance',label:'Wallet balance',unit:'ISK',key:'wallet',description:'Reach a balance in your character wallet. Transfers and spending affect progress.'},
 {id:'wallet.income',label:'ISK received',unit:'ISK',key:'journal',description:'Accumulate positive wallet journal entries dated after creation, including transfers and refunds.'},
 {id:'skill.level',label:'Train a skill',unit:'level',key:'skills',type:true,description:'Reach a trained skill level, including completed entries in a fresh skill queue.'},
 {id:'assets.quantity',label:'Collect an item',unit:'items',key:'assets',type:true,description:'Own this quantity across your character’s assets, including items inside containers and ships.'},
 {id:'mining.quantity',label:'Mine a resource',unit:'units',key:'mining',type:true,description:'Count newly reported units after the starting sample. ESI groups mining by day; this is not an exact start-time measure.'},
 {id:'industry.runs',label:'Complete manufacturing runs',unit:'runs',key:'jobs',type:true,description:'Count manufacturing runs for this product that finish after creation and are reported ready or delivered.'},
 {id:'combat.kills',label:'Participate in kills',unit:'kills',key:'killmails',description:'Count verified killmail participation dated after creation, including assisted kills. Public records can arrive late.'}
];
const sourceFor=id=>goalSources.find(s=>s.id===id);
const trackingRow=(store,id)=>store.db.prepare('SELECT * FROM goal_tracking WHERE goal_id=?').get(id);
function snapshotState(store,auth,id,key){
 const character=auth.characters().find(c=>c.id===id),module=catalog.find(m=>m.datasets.some(d=>d.key===key)),dataset=module?.datasets.find(d=>d.key===key);
 if(!character||character.needsReauth)return {status:'disconnected',detail:'Reconnect this character to resume tracking.'};
 if(module&&!store.get('module:'+module.id,true))return {status:'disabled',detail:'Enable '+module.name+' to resume tracking.'};
 if(dataset?.scope&&!character.scopes?.includes(dataset.scope))return {status:'missing_scope',detail:'Update EVE access to grant '+dataset.scope+'.'};
 const s=store.snapshot(id,key);
 if(!s?.data&&s?.data!==0)return {status:s?.status||'waiting',detail:s?.error||'Waiting for the first ESI sample.'};
 if(!snapshotFresh(s)||s.truncated)return {status:'stale',detail:'Progress is retained while a fresh, complete ESI sample is collected.',updatedAt:s.updatedAt};
 if(key==='wallet'?typeof s.data!=='number'||!Number.isFinite(s.data):key==='skills'?!Array.isArray(s.data?.skills):!Array.isArray(s.data))return {status:'error',detail:'The ESI sample is incomplete. Progress is retained until a valid sample arrives.'};
 return {...s,status:'ready',detail:'Tracking automatically from ESI.'};
}
function killState(store,auth,id){
 const c=auth.characters().find(c=>c.id===id);
 if(!c||c.needsReauth)return {status:'disconnected',detail:'Reconnect this character to resume tracking.'};
 if(!store.get('module:combat',true))return {status:'disabled',detail:'Enable Combat record to resume tracking.'};
 const esi=snapshotState(store,auth,id,'killmails'),publicFeed=store.snapshot(id,'combat_public');
 if(publicFeed?.status==='ready'&&Date.parse(publicFeed.expiresAt||'')>Date.now())return {status:'ready',detail:'Verified participation; public killmails can be delayed.',updatedAt:publicFeed.updatedAt};
 return {status:'partial',detail:'Confirmed kills count; additional public participation records are awaiting collection.',updatedAt:esi.updatedAt||publicFeed?.updatedAt};
}
export function goalSourceOptions(store,auth,characterId){
 const names=store.get('names',{}),types=new Map();
 for(const [key,idField] of [['assets','type_id'],['mining','type_id'],['jobs','product_type_id'],['queue','skill_id']])for(const row of store.snapshot(characterId,key)?.data||[])if(row[idField])types.set(row[idField],{id:row[idField],name:names[row[idField]]||'Type '+row[idField],skill:idField==='skill_id'});
 for(const s of store.snapshot(characterId,'skills')?.data?.skills||[])types.set(s.skill_id,{id:s.skill_id,name:names[s.skill_id]||'Skill '+s.skill_id,skill:true});
 return {sources:goalSources.map(s=>({...s,...(s.key?{availability:s.id==='combat.kills'?killState(store,auth,characterId):(()=>{const r=snapshotState(store,auth,characterId,s.key);return {status:r.status,detail:r.detail,updatedAt:r.updatedAt};})()}:{} )})),types:[...types.values()].sort((a,b)=>a.name.localeCompare(b.name)).slice(0,400)};
}
export async function lookupGoalType(store,esi,input){
 const name=String(input.name||'').trim().slice(0,100);let id=Number(input.typeId||0);
 if(!id){
  if(!name)throw new Error('Enter an exact EVE item or skill name.');
  const r=await esi.request('/universe/ids',{method:'POST',body:[name],ttl:86400});
  id=r.data.inventory_types?.find(t=>t.name.toLowerCase()===name.toLowerCase())?.id;
 }
 if(!Number.isSafeInteger(id)||id<1||id>=2147483647)throw new Error('No item or skill matched. Use its exact in-game name.');
 const type=(await esi.request('/universe/types/'+id,{ttl:86400})).data;
 const group=(await esi.request('/universe/groups/'+type.group_id,{ttl:86400})).data;
 const names=store.get('names',{});names[id]=type.name;store.set('names',names);
 return {id,name:type.name,categoryId:group.category_id};
}
export function listGoals(store,auth,characterId){
 return store.db.prepare('SELECT * FROM goals WHERE character_id=? ORDER BY done,created DESC').all(characterId).map(g=>{
  const t=trackingRow(store,g.id);if(!t)return {...g,source:'manual',unit:'steps'};
  const source=sourceFor(t.source),s=g.done?{status:'completed',detail:'Milestone reached. Completion stays recorded.'}:t.source==='combat.kills'?killState(store,auth,characterId):snapshotState(store,auth,characterId,source.key);
  return {...g,source:t.source,typeId:t.type_id,typeName:store.get('names',{})[t.type_id]||null,unit:source.unit,tracking:{status:s.status==='ready'?t.status:s.status,detail:s.status==='ready'?t.detail:s.detail,updatedAt:t.updated_at,completedAt:t.completed_at}};
 });
}
export function createGoals(store,auth,publish){
 const entries=store.db.prepare('SELECT observed,credited FROM goal_progress_entries WHERE goal_id=? AND entry_key=?');
 const put=store.db.prepare(`INSERT INTO goal_progress_entries VALUES(?,?,?,?) ON CONFLICT(goal_id,entry_key) DO UPDATE SET observed=excluded.observed,credited=excluded.credited`);
 function accumulate(goal,rows,baseline=false){
  for(const [key,quantity] of rows){
   if(!Number.isFinite(quantity)||quantity<0)continue;
   const old=entries.get(goal.id,key),observed=Math.max(old?.observed||0,quantity),credited=(old?.credited||0)+(baseline?0:Math.max(0,quantity-(old?.observed||0)));
   put.run(goal.id,key,observed,credited);
  }
  return store.db.prepare('SELECT COALESCE(SUM(credited),0) value FROM goal_progress_entries WHERE goal_id=?').get(goal.id).value;
 }
 function refresh(characterId,changedKey){
  let changed=0;
  const goals=store.db.prepare('SELECT g.*,t.source,t.type_id,t.state FROM goals g JOIN goal_tracking t ON t.goal_id=g.id WHERE g.character_id=? AND g.done=0').all(characterId);
  for(const g of goals){
   if(changedKey&&sourceFor(g.source).key!==changedKey&&!(g.source==='skill.level'&&changedKey==='queue'))continue;
   const source=sourceFor(g.source),s=g.source==='combat.kills'?killState(store,auth,characterId):snapshotState(store,auth,characterId,source.key),state=JSON.parse(g.state);let detail=s.detail,progress=g.progress;
   if(s.status!=='ready'&&!(g.source==='combat.kills'&&s.status==='partial')){
    store.db.prepare('UPDATE goal_tracking SET status=?,detail=? WHERE goal_id=?').run(s.status,detail,g.id);continue;
   }
   if(g.source==='wallet.balance')progress=s.data;
   if(g.source==='wallet.income')progress=accumulate(g,(s.data||[]).filter(j=>Date.parse(j.date)>=Date.parse(g.created)&&Date.parse(j.date)<=Date.now()&&j.amount>0&&j.id).map(j=>['journal:'+j.id,j.amount]));
   if(g.source==='skill.level'){
    progress=s.data.skills?.find(k=>k.skill_id===g.type_id)?.trained_skill_level||0;
    const queue=snapshotState(store,auth,characterId,'queue');
    if(queue.status==='ready')for(const k of queue.data||[])if(k.skill_id===g.type_id&&k.finish_date&&Date.parse(k.finish_date)<=Date.now())progress=Math.max(progress,k.finished_level||0);
   }
   if(g.source==='assets.quantity')progress=(s.data||[]).filter(a=>a.type_id===g.type_id).reduce((n,a)=>n+Math.max(0,Number(a.quantity)||0),0);
   if(g.source==='mining.quantity'){
    const rows=(s.data||[]).filter(m=>m.type_id===g.type_id&&m.date>=g.created.slice(0,10)).map(m=>[m.date+':'+m.solar_system_id+':'+m.type_id,m.quantity]);
    progress=accumulate(g,rows,!state.initialized);
    if(!state.initialized){state.initialized=true;state.baselineAt=s.updatedAt||new Date().toISOString();}
    detail='Newly reported units after the starting sample ('+state.baselineAt+'). Mining is batched by EVE date.';
   }
   if(g.source==='industry.runs')progress=accumulate(g,(s.data||[]).filter(j=>j.activity_id===1&&j.product_type_id===g.type_id&&['ready','delivered'].includes(j.status)&&Date.parse(j.end_date)>=Date.parse(g.created)&&Date.parse(j.end_date)<=Date.now()).map(j=>['job:'+j.job_id,j.runs]));
   if(g.source==='combat.kills')progress=store.db.prepare("SELECT COUNT(*) n FROM combat_records WHERE character_id=? AND result='kill' AND at>=?").get(characterId,g.created).n;
   if(!Number.isFinite(progress)||progress<0)continue;
   progress=Math.min(g.target,progress);const done=progress>=g.target,at=new Date().toISOString();
   store.db.prepare('UPDATE goals SET progress=?,done=? WHERE id=?').run(progress,done?1:0,g.id);
   store.db.prepare('UPDATE goal_tracking SET state=?,status=?,detail=?,updated_at=?,completed_at=? WHERE goal_id=?').run(JSON.stringify(state),done?'completed':s.status,done?'Milestone reached. Completion stays recorded.':detail,s.updatedAt||at,done?at:null,g.id);
   if(progress!==g.progress||done)changed++;
   if(done)publish({type:'goal.completed',module:'goals',characterId,summary:'Completed goal: '+g.title,payload:{goal_id:g.id,goal_title:g.title,progress,target:g.target},dedupe:'goal:'+g.id+':completed'});
  }
  return changed;
 }
 function create(characterId,input,verifiedType){
  const source=sourceFor(input.source||'manual'),title=String(input.title||'').trim().slice(0,160),target=Number(input.target??1);
  if(!title)throw new Error('Give your goal a title.');
  if(!source||!Number.isFinite(target)||target<=0||target>1e15)throw new Error('Choose a tracking source and a positive target.');
  if(source.id!=='manual'&&!auth.characters().some(c=>c.id===characterId))throw new Error('Connect a character to create an automatically tracked goal.');
  if(source.type&&(!verifiedType||verifiedType.id!==Number(input.typeId)))throw new Error('Look up and select an EVE item or skill.');
  if(source.id==='skill.level'&&(verifiedType.categoryId!==16||!Number.isInteger(target)||target>5))throw new Error('Select a skill and a whole target level from 1 to 5.');
  if(['assets.quantity','mining.quantity','industry.runs','combat.kills'].includes(source.id)&&!Number.isSafeInteger(target))throw new Error('Use a whole-number target for this goal.');
  const id=randomUUID(),created=new Date().toISOString();
  store.db.exec('BEGIN IMMEDIATE');
  try{
   store.db.prepare('INSERT INTO goals(id,character_id,title,target,progress,kind,done,created) VALUES(?,?,?,?,0,?,0,?)').run(id,characterId,title,target,source.id==='manual'?'manual':'esi',created);
   if(source.id!=='manual')store.db.prepare('INSERT INTO goal_tracking(goal_id,source,type_id) VALUES(?,?,?)').run(id,source.id,source.type?verifiedType.id:null);
   store.db.exec('COMMIT');
  }catch(e){store.db.exec('ROLLBACK');throw e;}
  publish({type:'goal.created',module:'goals',characterId,summary:'Created goal: '+title,payload:{goal_id:id,goal_title:title,target,source:source.id}});
  refresh(characterId);return {id};
 }
 return {refresh,create};
}
