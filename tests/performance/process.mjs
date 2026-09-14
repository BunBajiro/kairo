import {fork} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
export async function fixtureProcess(profile,scheduler=false){
  const child=fork(new URL('./worker.mjs',import.meta.url),[],{stdio:['ignore','ignore','pipe','ipc'],env:{...process.env,KAIRO_DATA_DIR:'',KAIRO_PORT:'',KAIRO_STREAM_PORT:''}});
  const pending=new Map();let id=0,stderr='';
  child.stderr.on('data',b=>{stderr=(stderr+b).slice(-12000);});
  const rejectAll=error=>{for(const p of pending.values())p.reject(error);pending.clear();};
  child.on('error',rejectAll);child.on('exit',(code,signal)=>rejectAll(new Error(`Benchmark worker exited (${code||signal}): ${stderr}`)));
  child.on('message',m=>{const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(new Error(m.error));else p?.resolve(m.result);});
  function rpc(action,params={}){return new Promise((resolve,reject)=>{
    const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(new Error('Worker timeout: '+action));},180000);
    pending.set(key,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
    child.send({id:key,action,...params},error=>{if(error){pending.get(key)?.reject(error);pending.delete(key);}});
  });}
  async function close(){
    if(child.exitCode!==null||child.signalCode!==null)return;
    await Promise.race([rpc('close').catch(()=>{}),delay(5000)]);
    if(child.exitCode===null&&child.signalCode===null){child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),delay(1000)]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
  }
  try{return {...await rpc('init',{profile,scheduler}),rpc,close};}catch(e){await close();throw e;}
}
