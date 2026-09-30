import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fixtureProcess} from './process.mjs';
import {chromeProcess} from './chrome.mjs';
import {environment,numberOption,assetManifest,writeReport} from './metrics.mjs';

const out=resolve(process.env.KAIRO_PERF_OUTPUT||'performance-results');await mkdir(out,{recursive:true});
const seconds=numberOption('KAIRO_PERF_BROWSER_SECONDS',35,5,600),profile=process.env.KAIRO_PERF_BROWSER_PROFILE||'stress';
const report={schemaVersion:1,suite:'browser',environment:environment(),settings:{seconds,profile,headless:true,viewport:{width:1600,height:1050},externalImages:'synthetic 1px replacement'},assets:await assetManifest(),scenarios:[],complete:false};
const scenarios=[
  {name:'overview',hash:'overview',ready:"document.querySelector('.stats-grid strong')?.textContent.includes('5')"},
  {name:'assets',hash:'assets',ready:"document.querySelectorAll('tbody tr').length>0"},
  {name:'markets',hash:'markets',ready:"document.body.innerText.includes('Amarr')"},
  {name:'archived_session',hash:'journey',setup:async p=>{
    await p.waitFor("document.querySelectorAll('.route-stop').length===7 && Array.from(document.querySelectorAll('[role=tab]')).some(e=>e.textContent==='Sessions')");
    await p.click("Array.from(document.querySelectorAll('[role=tab]')).find(e=>e.textContent==='Sessions')");
    await p.waitFor("document.querySelector('.session-card')?.textContent.includes('Benchmark populated session')");
    await p.click("document.querySelector('.session-card')");
  },ready:"document.querySelectorAll('.session-detail-card').length===9"},
  {name:'stream_empty',widgets:0,ready:"document.readyState==='complete'"},
  {name:'stream_widgets',widgets:10,ready:"document.querySelectorAll('.element').length===10"},
];
let worker,chrome;
try{
  worker=await fixtureProcess(profile,false);report.workload=worker.spec;chrome=await chromeProcess();report.browser=chrome.version;
  for(const scenario of scenarios){
    const p=await chrome.page(),errors=[],requests=[],responses=[],unexpected=[],intercepts=new Set();let bytes=0;
    try{
      await p.call('Page.enable');await p.call('Runtime.enable');await p.call('Network.enable');await p.call('Performance.enable');
      await p.call('Emulation.setDeviceMetricsOverride',{...report.settings.viewport,deviceScaleFactor:1,mobile:false});
      // Intercept ALL HTTP requests before navigation; only these loopback origins pass.
      p.on(m=>{
        if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
        if(m.method==='Network.requestWillBeSent')requests.push({at:performance.now(),url:m.params.request.url});
        if(m.method==='Network.dataReceived')bytes+=m.params.dataLength;
        if(m.method==='Network.responseReceived')responses.push({url:m.params.response.url,status:m.params.response.status});
        if(m.method==='Fetch.requestPaused'){
          const task=(async()=>{const r=m.params,u=new URL(r.request.url);
            if([worker.origin,worker.streamOrigin].includes(u.origin))return p.call('Fetch.continueRequest',{requestId:r.requestId});
            if(r.resourceType==='Image'&&['images.evetech.net','web.ccpgamescdn.com'].includes(u.hostname))return p.call('Fetch.fulfillRequest',{requestId:r.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/png'}],body:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='});
            unexpected.push(r.request.url);await p.call('Fetch.failRequest',{requestId:r.requestId,errorReason:'BlockedByClient'});
          })().catch(e=>errors.push(e.message));intercepts.add(task);task.finally(()=>intercepts.delete(task));
        }
      });
      await p.call('Fetch.enable',{patterns:[{urlPattern:'http*'}]});
      await p.call('Page.addScriptToEvaluateOnNewDocument',{source:`window.__kairoPerf={longTasks:[],mutations:0};new PerformanceObserver(list=>{for(const e of list.getEntries())window.__kairoPerf.longTasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});new MutationObserver(list=>window.__kairoPerf.mutations+=list.length).observe(document,{subtree:true,childList:true,characterData:true,attributes:true});`});
      if(scenario.widgets!==undefined)await worker.rpc('stream',{widgets:scenario.widgets});
      const start=performance.now();await p.call('Page.navigate',{url:scenario.widgets!==undefined?worker.streamOrigin+'/stream':worker.origin+'/#'+scenario.hash});
      if(scenario.widgets===undefined)await p.waitFor("document.querySelector('.connection-status')?.textContent==='Core connected'");
      await scenario.setup?.(p);await p.waitFor(scenario.ready);const loadMs=performance.now()-start;
      await delay(2000); // startup/loading measured above; settle before idle sample
      const metric=async()=>Object.fromEntries((await p.call('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
      const before=await metric(),observation=await p.evaluate('({...window.__kairoPerf,at:performance.now(),visibility:document.visibilityState})'),requestStart=requests.length,byteStart=bytes;
      await worker.rpc('meter_start');await delay(seconds*1000);const server=await worker.rpc('meter_stop');
      const after=await metric(),end=await p.evaluate('({...window.__kairoPerf,at:performance.now(),visibility:document.visibilityState,domNodes:document.querySelectorAll("*").length})');
      const elapsedSeconds=(end.at-observation.at)/1000;
      const localRequests=requests.slice(requestStart).filter(r=>[worker.origin,worker.streamOrigin].includes(new URL(r.url).origin));
      const perPath={};for(const r of localRequests){const key=new URL(r.url).pathname;perPath[key]=(perPath[key]||0)+1;}
      const result={name:scenario.name,loadMs,elapsedSeconds,visibility:end.visibility,rendererBusyPercent:(after.TaskDuration-before.TaskDuration)/elapsedSeconds*100,scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000,layouts:after.LayoutCount-before.LayoutCount,styleRecalculations:after.RecalcStyleCount-before.RecalcStyleCount,heapBeforeBytes:before.JSHeapUsedSize,heapAfterBytes:after.JSHeapUsedSize,domNodes:end.domNodes,mutations:end.mutations-observation.mutations,longTasks:end.longTasks.filter(t=>t.start>=observation.at),requests:localRequests.length,requestsPerMinute:localRequests.length*60/elapsedSeconds,requestsByPath:perPath,receivedBodyBytes:bytes-byteStart,server};
      report.scenarios.push(result);
      // Correctness gates, not uncalibrated CPU thresholds.
      assert.equal(server.networkAttempts,0);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.equal(end.visibility,'visible');
      assert.ok(!responses.some(r=>r.status>=400&&new URL(r.url).pathname!=='/favicon.ico'),'Local requests must succeed');
      const screenshot=await p.call('Page.captureScreenshot',{format:'png'});await writeFile(join(out,scenario.name+'.png'),Buffer.from(screenshot.data,'base64'));
      console.log(`${scenario.name}: renderer ${result.rendererBusyPercent.toFixed(2)}%; server ${server.cpuPercentOneCore.toFixed(2)}%; ${result.requests} requests / ${elapsedSeconds.toFixed(1)} s`);
    }catch(error){const state=await p.evaluate("({tabs:Array.from(document.querySelectorAll('[role=tab]')).map(e=>({text:e.textContent,selected:e.getAttribute('aria-selected')})),body:document.body.innerText.slice(-5000)})").catch(()=>null);report.failure={scenario:scenario.name,error:error.stack,errors,unexpected,state};console.error(JSON.stringify(report.failure));const shot=await p.call('Page.captureScreenshot',{format:'png'}).catch(()=>null);if(shot)await writeFile(join(out,'failure.png'),Buffer.from(shot.data,'base64'));throw error;}
    finally{await Promise.allSettled(intercepts);await chrome.closePage(p);}
  }
  report.complete=true;
}finally{
  await chrome?.close();await worker?.close();
  let md='# Kairo browser performance\n\nCompiled local application, synthetic data, headless Chrome. Renderer busy time is main-thread task time, not total Chrome CPU or GPU/power usage.\n\n';
  md+='| Scenario | Load ms | Renderer busy % | Server CPU % of one core | Requests/min | DOM nodes |\n|---|---:|---:|---:|---:|---:|\n';
  for(const s of report.scenarios)md+=`| ${s.name} | ${s.loadMs.toFixed(0)} | ${s.rendererBusyPercent.toFixed(2)} | ${s.server.cpuPercentOneCore.toFixed(2)} | ${s.requestsPerMinute.toFixed(1)} | ${s.domNodes} |\n`;
  md+='\nEach idle window follows a two-second settling interval. All page timers remain active; no synthetic animation-frame polling runs during idle. External images are replaced locally. Background-tab behaviour and actual OBS/GPU costs are not covered.\n';
  await writeReport('browser',report,md,out);
}
