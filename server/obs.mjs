import {createHash,randomUUID} from 'node:crypto';
import { protectionStates, upgradeProtectionRules } from '../public/stream/protection.js';
export { protectionStates } from '../public/stream/protection.js';
export const defaultOBS=()=>({enabled:false,automation:false,port:4455,collection:'',rules:Object.fromEntries(protectionStates.map(s=>[s,[]]))});
const text=(v,n=200)=>String(v||'').trim().slice(0,n);
export function sanitizeOBS(input){
 const port=Number(input.port??4455);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Enter the local OBS WebSocket port.');
 const upgraded=upgradeProtectionRules(input.rules);
 const rules=Object.fromEntries(protectionStates.map(state=>[state,upgraded[state].slice(0,80).map(a=>{
  if(!['source','audio','filter','scene'].includes(a.kind))throw new Error('Unsupported OBS action.');const r={id:text(a.id,80)||randomUUID(),kind:a.kind,sceneName:text(a.sceneName),sourceName:text(a.sourceName),filterName:text(a.filterName),group:a.group===true,enabled:a.enabled===true};
  if(a.kind==='source'){if(!Number.isInteger(a.sceneItemId)||a.sceneItemId<0||!r.sceneName||!r.sourceName)throw new Error('Select a source from OBS.');r.sceneItemId=a.sceneItemId;}
  if(a.kind==='scene'&&!r.sceneName||['audio','filter'].includes(a.kind)&&!r.sourceName||a.kind==='filter'&&!r.filterName)throw new Error('Select an OBS action target.');return r;
 })]));
 for(const actions of Object.values(rules)){const keys=actions.map(a=>a.kind==='scene'?'scene':a.kind==='source'?JSON.stringify([a.kind,a.sceneName,a.sceneItemId]):JSON.stringify([a.kind,a.sourceName,a.kind==='filter'?a.filterName:'']));if(new Set(keys).size!==keys.length)throw new Error('A state can set each OBS target once. Remove duplicate actions.');}
 const r={enabled:input.enabled===true,automation:input.automation===true,port,collection:text(input.collection),rules};if(r.automation&&!r.collection)throw new Error('Read OBS targets and choose the scene collection before enabling automatic actions.');return r;
}
export function obsAuthentication(password,{salt,challenge}){const hash=s=>createHash('sha256').update(s).digest('base64');return hash(hash(password+salt)+challenge);}
export function createOBS(store,vault,{WebSocketClass=globalThis.WebSocket,requestTimeout=6000,reconnectDelay=5000,closeTimeout=6000,onChange=()=>{}}={}){
 if(!Number.isFinite(closeTimeout)||closeTimeout<1||closeTimeout>15000)throw new Error('Choose an OBS close timeout between 1 and 15000 milliseconds.');
 const saved=store.get('obs',null);if(saved&&!store.get('obs.space-categories-v3',false)){
  const rules=upgradeProtectionRules(saved.rules);
  if(!saved.rules?.highsec&&!store.get('opsec',{}).allowHighsec&&Array.isArray(saved.rules?.safe)){
   store.set('obs.legacy-safe-rules',saved.rules.safe);rules.highsec=structuredClone(saved.rules.unknown||[]);
  }
  store.set('obs',{...saved,rules});store.set('obs.space-categories-v3',true);
 }
 let socket,closing,ready=false,closed=false,blocked=false,changing=false,connecting,connectTimer,retryTimer,revision=0,running=false,desired='unknown',applied=null,error='',version='';const pending=new Map(),sockets=new Set(),log=[];
 const config=()=>store.get('obs',defaultOBS()),status=()=>({connected:ready,connecting:!!connecting,state:desired,appliedState:applied,error,version,changing,log:[...log]}),notify=()=>onChange(status());
 function record(state,ok,message){log.unshift({at:new Date().toISOString(),state,ok,message});log.length=Math.min(log.length,30);notify();}
 function request(requestType,requestData={}){if(!ready||changing)return Promise.reject(new Error(changing?'OBS is changing scene collections.':'OBS is disconnected.'));return new Promise((resolve,reject)=>{const requestId=randomUUID(),timer=setTimeout(()=>{pending.delete(requestId);reject(new Error(requestType+' timed out.'));},requestTimeout);pending.set(requestId,{resolve,reject,timer});try{socket.send(JSON.stringify({op:6,d:{requestType,requestId,requestData}}));}catch{clearTimeout(timer);pending.delete(requestId);reject(new Error('OBS connection closed.'));}});}
 function cancel(){clearTimeout(connectTimer);clearTimeout(retryTimer);ready=false;revision++;applied=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('OBS connection closed.'));}pending.clear();const old=socket;socket=null;old?.close();}
 function scheduleReconnect(){clearTimeout(retryTimer);if(!closed&&!blocked&&config().enabled){retryTimer=setTimeout(()=>connect().catch(()=>{}),reconnectDelay);retryTimer.unref?.();}}
 async function connect(){
  if(closed||!config().enabled||blocked||ready)return;if(connecting)return connecting;cancel();error='';notify();
  connecting=new Promise((resolve,reject)=>{let settled=false,identified=false;const finish=err=>{if(settled)return;settled=true;clearTimeout(connectTimer);err?reject(err):resolve();};const ws=new WebSocketClass('ws://127.0.0.1:'+config().port);socket=ws;
   const socketClosed=new Promise(done=>ws.addEventListener('close',done,{once:true}));sockets.add(socketClosed);socketClosed.then(()=>sockets.delete(socketClosed));
   connectTimer=setTimeout(()=>{error='OBS connection timed out. Check Tools → WebSocket Server Settings.';finish(new Error(error));ws.close();},requestTimeout);
   ws.addEventListener('message',event=>{if(socket!==ws||closed)return;try{const m=JSON.parse(event.data),d=m.d||{};
    if(m.op===0&&!identified){identified=true;if(d.rpcVersion<1)throw new Error('OBS WebSocket 5 is required.');let authentication;if(d.authentication){const encrypted=store.get('obs.password',null);authentication=obsAuthentication(encrypted?vault.decrypt(encrypted).password:'',d.authentication);}version=String(d.obsWebSocketVersion||'5');ws.send(JSON.stringify({op:1,d:{rpcVersion:1,eventSubscriptions:3,...(authentication?{authentication}:{})}}));}
    else if(m.op===2&&identified){ready=true;error='';applied=null;finish();notify();void apply();}
    else if(m.op===7){const p=pending.get(d.requestId);if(!p)return;clearTimeout(p.timer);pending.delete(d.requestId);d.requestStatus?.result?p.resolve(d.responseData||{}):p.reject(new Error(d.requestType+' failed (OBS '+d.requestStatus?.code+'). Check the selected target.'));}
    else if(m.op===5){if(d.eventType==='CurrentSceneCollectionChanging'){changing=true;revision++;applied=null;notify();}if(d.eventType==='CurrentSceneCollectionChanged'){changing=false;revision++;void apply();}if(d.eventType==='ExitStarted')ws.close();}
   }catch(e){error=e.message;finish(e);ws.close();}});
   ws.addEventListener('error',()=>{if(socket===ws){error='Cannot reach OBS. Check its WebSocket server and port.';finish(new Error(error));ws.close();}});
   ws.addEventListener('close',event=>{finish(new Error('OBS connection closed.'));if(socket!==ws)return;ready=false;socket=null;changing=false;revision++;applied=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('OBS disconnected.'));}pending.clear();if([4009,4010,4011].includes(event.code)){blocked=true;error=event.code===4009?'OBS rejected the password. Update it and reconnect.':'OBS ended this session. Reconnect manually when ready.';}else if(!error)error='OBS disconnected. Waiting to reconnect.';notify();scheduleReconnect();});
  });try{await connecting;}finally{connecting=null;notify();}
 }
 async function inventory(){if(!ready)await connect();const [sceneList,inputList,collections]=await Promise.all([request('GetSceneList'),request('GetInputList'),request('GetSceneCollectionList')]),scenes=[],groups=new Set();
  async function addScene(sceneName,group=false){const r=await request(group?'GetGroupSceneItemList':'GetSceneItemList',{sceneName});const items=(r.sceneItems||[]).map(i=>({sceneItemId:i.sceneItemId,sourceName:i.sourceName,isGroup:i.isGroup===true,enabled:i.sceneItemEnabled===true}));scenes.push({sceneName,group,items});for(const i of items)if(i.isGroup&&!groups.has(i.sourceName)){groups.add(i.sourceName);await addScene(i.sourceName,true);}}
  for(const s of sceneList.scenes||[])await addScene(s.sceneName);return {collection:collections.currentSceneCollectionName,scenes,inputs:(inputList.inputs||[]).map(i=>({name:i.inputName,kind:i.inputKind})),currentScene:sceneList.currentProgramSceneName};
 }
 const priority=a=>['source','audio'].includes(a.kind)&&!a.enabled?0:a.kind==='filter'?1:a.kind==='scene'?3:2;
 async function apply(){
  if(running||!ready||changing||!config().automation||closed)return;running=true;const currentRevision=revision,target=desired,c=config(),current=()=>ready&&!closed&&!changing&&config().automation&&revision===currentRevision;
  try{const collection=await request('GetSceneCollectionList');if(collection.currentSceneCollectionName!==c.collection)throw new Error('OBS scene collection changed. Read targets and save rules for this collection before applying.');
   const actions=[...(c.rules[target]||[])].sort((a,b)=>priority(a)-priority(b));let protectionError;
   for(const a of actions){if(!current())break;if(protectionError&&priority(a)>0)throw protectionError;
    try{if(a.kind==='source'){const list=await request(a.group?'GetGroupSceneItemList':'GetSceneItemList',{sceneName:a.sceneName});if(!list.sceneItems?.some(i=>i.sceneItemId===a.sceneItemId&&i.sourceName===a.sourceName))throw new Error('Source no longer matches: '+a.sourceName+'. Refresh OBS targets and update this rule.');if(!current())break;await request('SetSceneItemEnabled',{sceneName:a.sceneName,sceneItemId:a.sceneItemId,sceneItemEnabled:a.enabled});}
    else if(a.kind==='audio')await request('SetInputMute',{inputName:a.sourceName,inputMuted:!a.enabled});else if(a.kind==='filter')await request('SetSourceFilterEnabled',{sourceName:a.sourceName,filterName:a.filterName,filterEnabled:a.enabled});else await request('SetCurrentProgramScene',{sceneName:a.sceneName});}
    catch(e){if(priority(a)===0)protectionError=e;else throw e;}
   }
   if(protectionError)throw protectionError;if(current()){applied=target;error='';record(target,true,actions.length?actions.length+' OBS actions applied.':'No actions configured for this state.');}
  }catch(e){if(current()){error=e.message;record(target,false,error);}}finally{running=false;if(ready&&revision!==currentRevision&&!changing&&!closed)void apply();}
 }
 function close(){
  if(closing)return closing;
  closed=true;clearInterval(timer);
  // Assign ownership before cleanup callbacks can throw or re-enter close().
  closing=Promise.resolve().then(async()=>{
   const errors=[];let deadline;
   try{cancel();}catch(error){errors.push(error);}
   try{notify();}catch(error){errors.push(error);}
   // A close request is not a completed WebSocket close. A peer that never
   // acknowledges is a visible cleanup failure, bounded below supervisor limits.
   try{
    await Promise.race([
     (async()=>{await Promise.all(sockets);await connecting?.catch(()=>{});})(),
     new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Object.assign(new Error('OBS clients did not finish closing within '+closeTimeout+' ms.'),{code:'OBS_CLOSE_TIMEOUT'})),closeTimeout);}),
    ]);
   }catch(error){errors.push(error);}finally{clearTimeout(deadline);}
   if(errors.length===1)throw errors[0];
   if(errors.length)throw new AggregateError(errors,'OBS clients could not finish closing.');
  });return closing;
 }
 // Read persisted configuration before owning an interval: a failed read must
 // not leave a timer behind when this synchronous constructor throws.
 const initiallyEnabled=config().enabled;
 const timer=setInterval(()=>{if(ready&&!applied&&!running&&!changing&&config().automation)void apply();},10000);timer.unref();if(initiallyEnabled)queueMicrotask(()=>connect().catch(()=>{}));
 return {config:()=>({...config(),passwordSaved:!!store.get('obs.password',null),legacySafeRules:store.get('obs.legacy-safe-rules',null)}),status,inventory,filters:async sourceName=>(await request('GetSourceFilterList',{sourceName:text(sourceName)})).filters?.map(f=>({name:f.filterName,enabled:f.filterEnabled})),
  async save(input){const next=sanitizeOBS(input),prior=config();if(input.password!==undefined){if(typeof input.password!=='string'||input.password.length>1000)throw new Error('Invalid OBS password.');store.set('obs.password',input.password?vault.encrypt({password:input.password}):null);}store.set('obs',next);revision++;applied=null;blocked=false;if(!next.enabled){cancel();error='';notify();return status();}if(prior.port!==next.port||input.password!==undefined)cancel();await connect();await apply();return status();},
  async reconnect(){blocked=false;cancel();if(connecting)await connecting.catch(()=>{});await connect();await apply();return status();},
  setState(state){if(state==='safe')state='highsec';if(!protectionStates.includes(state))state='unknown';if(desired===state)return;desired=state;revision++;applied=null;notify();void apply();},async reapply(){revision++;applied=null;await apply();return status();},close};
}
