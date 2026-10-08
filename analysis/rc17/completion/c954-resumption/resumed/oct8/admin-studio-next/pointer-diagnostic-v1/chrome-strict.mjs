// Diagnostic-local copy of historical chrome.mjs; awaits actual process exit.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

export async function connect(url){
  const ws=new WebSocket(url),pending=new Map(),listeners=new Set();let sequence=0;
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(new Error('Chrome connection closed'));pending.clear();});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(new Error(JSON.stringify(m.error)));else p?.resolve(m.result);}else for(const listener of listeners)listener(m);});
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Chrome timed out: '+method));},30000);
    pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));
  });
  async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
  async function waitFor(expression){for(let i=0;i<300;i++){if(await evaluate(expression))return;await delay(50);}throw new Error('Browser condition failed: '+expression);}
  async function click(expression){
    await waitFor('!!('+expression+')');
    const point=await evaluate(`(async()=>{const e=(${expression});e.scrollIntoView({block:'center',behavior:'instant'});let previous,stable=0;for(let i=0;i<180;i++){await new Promise(requestAnimationFrame);const r=e.getBoundingClientRect(),p={x:r.x+r.width/2,y:r.y+r.height/2};const ready=e.isConnected&&!e.disabled&&r.width>0&&r.height>0&&e.contains(document.elementFromPoint(p.x,p.y));stable=ready&&previous&&Math.abs(p.x-previous.x)<.25&&Math.abs(p.y-previous.y)<.25?stable+1:0;if(stable>=3)return p;previous=p;}throw new Error('Click target did not settle');})()`);
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  }
  return {call,evaluate,waitFor,click,on:fn=>listeners.add(fn),close:()=>ws.close()};
}
export async function chromeProcess(){
  const binary=process.env.KAIRO_CHROME_PATH||['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
  if(!binary||!existsSync(binary))throw new Error('Chrome executable required; set KAIRO_CHROME_PATH. Browser benchmarks are not silently skipped.');
  const dir=await mkdtemp(join(tmpdir(),'kairo-perf-chrome-'));
  const args=['--headless','--disable-dev-shm-usage','--no-first-run','--disable-background-networking','--disable-component-update','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'];
  if(process.platform==='linux'&&process.getuid?.()===0)args.unshift('--no-sandbox');
  const proc=spawn(binary,args,{stdio:['ignore','ignore','pipe']});let browser;
  const exitPromise=new Promise(resolve=>proc.once('exit',(code,signal)=>resolve({code,signal})));
  let closed=null;
  async function close(){
    if(closed)return closed;
    closed=(async()=>{
      await browser?.call('Browser.close').catch(()=>{});browser?.close();
      if(proc.exitCode===null&&proc.signalCode===null){
        proc.kill();await Promise.race([exitPromise,delay(2000)]);
        if(proc.exitCode===null&&proc.signalCode===null){proc.kill('SIGKILL');await Promise.race([exitPromise,delay(5000)]);}
      }
      if(proc.exitCode===null&&proc.signalCode===null)throw Error('Chromium process exit was not observed');
      await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
      return {processExitVerified:true,code:proc.exitCode,signal:proc.signalCode,temporaryDirectoryRemoved:true};
    })();
    return closed;
  }
  try{
    const url=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(new Error('Chrome startup timeout: '+log.slice(-2000))),30000);proc.stderr.on('data',b=>{log=(log+b).slice(-10000);const m=log.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});proc.on('error',e=>{clearTimeout(timer);reject(e);});proc.on('exit',code=>{clearTimeout(timer);reject(new Error('Chrome exited: '+code+' '+log));});});
    browser=await connect(url);const endpoint=new URL(url);
    return {browser,version:await browser.call('Browser.getVersion'),async page(){
      const {targetId}=await browser.call('Target.createTarget',{url:'about:blank'});
      const targets=await(await fetch('http://'+endpoint.host+'/json/list')).json();
      const target=targets.find(t=>t.id===targetId);if(!target)throw new Error('Chrome target not found');
      return {...await connect(target.webSocketDebuggerUrl),targetId};
    },async closePage(p){p.close();await browser.call('Target.closeTarget',{targetId:p.targetId});},close};
  }catch(e){await close();throw e;}
}
