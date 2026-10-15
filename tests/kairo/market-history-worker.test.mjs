import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {setImmediate as turn} from 'node:timers/promises';
import {decodeArchive} from '../../server/market-history.mjs';

function controlledWorker(){
 const worker=new EventEmitter();let terminated=0,resolveExit;
 const exit=new Promise(resolve=>{resolveExit=resolve;});
 worker.terminate=()=>{terminated++;return exit;};
 return {worker,terminated:()=>terminated,exit(code=0){worker.emit('exit',code);resolveExit(code);}};
}

test('a decoded archive is delivered only after worker exit and ignores later aborts',async()=>{
 const h=controlledWorker(),controller=new AbortController(),value={rows:[{type_id:34}],records:1};let settled=false;
 const result=decodeArchive(Buffer.from('fixture'),'2026-09-30',{signal:controller.signal,createWorker:(url,options)=>{
  assert.ok(url.href.endsWith('/market-history-worker.mjs'));assert.equal(options.resourceLimits.maxOldGenerationSizeMb,128);return h.worker;
 }});result.then(()=>{settled=true;});
 h.worker.emit('message',value);controller.abort();await turn();assert.equal(settled,false);assert.equal(h.terminated(),1);
 h.exit(1);assert.strictEqual(await result,value);
});

test('decoder errors and cancellation reject only after exit, including an already aborted signal',async t=>{
 for(const reason of ['message','error','abort','already-aborted'])await t.test(reason,async()=>{
  const h=controlledWorker(),controller=new AbortController();let settled=false;
  if(reason==='already-aborted')controller.abort();
  const result=decodeArchive(Buffer.from('fixture'),'2026-09-30',{signal:controller.signal,createWorker:()=>h.worker});
  const observed=result.then(()=>assert.fail('Expected rejection'),error=>{settled=true;return error;});
  if(reason==='message')h.worker.emit('message',{error:'bad archive'});
  if(reason==='error')h.worker.emit('error',new Error('worker failed'));
  if(reason==='abort')controller.abort();
  controller.abort();await turn();assert.equal(settled,false);assert.equal(h.terminated(),1);
  h.exit(1);assert.match((await observed).message,reason==='message'?/bad archive/:reason==='error'?/worker failed/:/cancelled/);
 });
});

test('decoder timeout requests termination once and awaits exit',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const h=controlledWorker();let settled=false;
 const result=decodeArchive(Buffer.from('fixture'),'2026-09-30',{timeoutMs:100,createWorker:()=>h.worker});
 const observed=result.then(()=>assert.fail('Expected timeout'),error=>{settled=true;return error;});
 t.mock.timers.tick(100);await turn();assert.equal(h.terminated(),1);assert.equal(settled,false);
 h.worker.emit('message',{rows:[],records:1});t.mock.timers.tick(100);assert.equal(h.terminated(),1);
 h.exit(1);assert.match((await observed).message,/timed out/);
});

test('an unexpected exit rejects without requesting termination again',async()=>{
 const h=controlledWorker(),result=decodeArchive(Buffer.from('fixture'),'2026-09-30',{createWorker:()=>h.worker});
 h.exit(1);await assert.rejects(result,/stopped before completing/);assert.equal(h.terminated(),0);
});
