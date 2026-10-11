// Isolated VM control: executes the exact combined injected source, no app/browser fixture.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const current=await readFile(new URL('./browser-first-assets-counts.mjs',import.meta.url),'utf8');
const historical=await readFile(new URL('./attempt1-harness/browser-first-assets-counts.mjs',import.meta.url),'utf8');
function combined(text){
 const declarations=['instrumentation','receiverProbe','scalarProbe'].map(name=>{
  const matches=[...text.matchAll(new RegExp('const '+name+'=`([\\s\\S]*?)`;','g'))];assert.equal(matches.length,1,name);
  return matches[0][0];
 });
 const calls=[...text.matchAll(/Page\.addScriptToEvaluateOnNewDocument',\{source:(instrumentation[^\n]+)\}\);/g)];assert.equal(calls.length,1,'Exactly one actual injection expression');
 return vm.runInNewContext(declarations.join('\n')+'\n('+calls[0][1]+')',{}, {timeout:1000});
}
function context(){
 const ctx=vm.createContext({URL});
 vm.runInContext(`globalThis.window=globalThis;globalThis.performance={now:()=>123};globalThis.location={href:'http://127.0.0.1:18740/#overview',origin:'http://127.0.0.1:18740'};
  globalThis.__listeners={};globalThis.addEventListener=(name,fn)=>(__listeners[name]||=[]).push(fn);
  globalThis.EventSource=class{constructor(url){this.url=url;this.listeners={};}addEventListener(name,fn){(this.listeners[name]||=[]).push(fn);}emit(name,event={}){for(const fn of this.listeners[name]||[])fn(event);}};
  globalThis.__nativeFetchPromise=Promise.resolve({status:200});globalThis.fetch=()=>__nativeFetchPromise;`,ctx,{timeout:1000});
 return ctx;
}
const old=context();assert.throws(()=>vm.runInContext(combined(historical),old,{timeout:1000}),/not a function/);
assert.equal(vm.runInContext('!!window.__modelCounts&&!window.__protocolReceiver&&!window.__firstAssetsReceipts',old),true,'Original newline-only join reproduces partial initialization');
const ctx=context();vm.runInContext(combined(current),ctx,{timeout:1000});
assert.equal(vm.runInContext('!!window.__modelCounts&&!!window.__protocolReceiver&&!!window.__firstAssetsReceipts',ctx),true,'All three probes initialize together');
assert.equal(vm.runInContext(`window.fetch('/api/state?character=42')===window.__nativeFetchPromise`,ctx),true,'Original fetch promise identity is preserved');
await vm.runInContext('window.__nativeFetchPromise.then(()=>Promise.resolve())',ctx);
assert.equal(vm.runInContext(`__firstAssetsReceipts.fetchStarted===1&&__firstAssetsReceipts.fetchResolved===1&&__firstAssetsReceipts.rows[0].path==='/api/state'&&__firstAssetsReceipts.rows[1].status===200`,ctx),true,'Passive scalar fetch receipt is live');
vm.runInContext(`const events=new EventSource('/api/events');events.emit('names');for(const listener of __listeners['kairo:source-changed'])listener({detail:{resource:'snapshot',key:'wallet',characterId:42}});`,ctx);
assert.equal(vm.runInContext(`__protocolReceiver.names===1&&__protocolReceiver.wallet[42]===1&&__firstAssetsReceipts.sse.names===1&&__firstAssetsReceipts.sourceChanged===1`,ctx),true,'Protocol and scalar listeners coexist');
vm.runInContext(`[{item_id:1,type_id:2,location_flag:'Hangar'}].map(row=>row);new Intl.NumberFormat('en-GB');`,ctx);
assert.equal(vm.runInContext('__modelCounts.map.assets.calls===1&&__modelCounts.map.assets.rows===1&&__modelCounts.numberFormat===1',ctx),true,'Shape counter remains live beside receipt probes');
console.log(JSON.stringify({control:'combined-injected-script-initialization',passed:true,oldNewlineJoinFailureReproduced:true,allThreeGlobalsInitialize:true,originalFetchPromisePreserved:true,passiveFetchAndSSEReceiptsObserved:true,shapeCounterObserved:true,applicationOrBrowserExecuted:false}));
