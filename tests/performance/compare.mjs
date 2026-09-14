import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function metrics(report){
  const rows=new Map(),put=(key,value)=>{if(!Number.isFinite(value)||value<0)throw new Error('Invalid metric: '+key);if(rows.has(key))throw new Error('Duplicate metric: '+key);rows.set(key,value);};
  if(report.suite==='backend'){
    for(const p of report.profiles){
      if(!p.operations?.length||!p.idle||!p.http)throw new Error('Missing backend scenario');
      put(p.profile+'/idle/cpuPercentOneCore',p.idle.cpuPercentOneCore);
      put(p.profile+'/idle/rssBytes',p.idle.rssAfterBytes);
      put(p.profile+'/http/p50Ms',p.http.latencyMs.p50);
      for(const o of p.operations){
        if(!o.latencyMs?.samples?.length||o.latencyMs.samples.some(v=>!Number.isFinite(v)||v<0))throw new Error('Missing/invalid raw latency samples');
        put(p.profile+'/'+o.name+'/p50Ms',o.latencyMs.p50);put(p.profile+'/'+o.name+'/p95Ms',o.latencyMs.p95);put(p.profile+'/'+o.name+'/cpuP50Ms',o.cpuMs.p50);put(p.profile+'/'+o.name+'/responseBytes',o.responseBytes);
      }
    }
  }else if(report.suite==='browser'){
    for(const s of report.scenarios){put(s.name+'/rendererBusyPercent',s.rendererBusyPercent);put(s.name+'/serverCpuPercent',s.server.cpuPercentOneCore);put(s.name+'/requestsPerMinute',s.requestsPerMinute);put(s.name+'/domNodes',s.domNodes);}
  }else throw new Error('Unknown report suite');
  if(!rows.size)throw new Error('Empty report');return rows;
}
export function compareReports(before,after){
  if(before.schemaVersion!==1||after.schemaVersion!==1||!before.complete||!after.complete)throw new Error('Only complete schema-v1 reports can be compared');
  if(before.suite!==after.suite)throw new Error('Different suites');
  if(JSON.stringify(before.settings)!==JSON.stringify(after.settings))throw new Error('Different measurement settings');
  for(const key of ['cpu','logicalCpus','platform','arch','node','runner'])if(!before.environment?.[key]||before.environment[key]!==after.environment?.[key])throw new Error('Different or missing environment: '+key);
  const fingerprints=r=>r.suite==='backend'?r.profiles.map(p=>[p.profile,p.workload.fingerprint]):r.workload?.fingerprint;
  if(!fingerprints(before)||JSON.stringify(fingerprints(before))!==JSON.stringify(fingerprints(after)))throw new Error('Different or missing synthetic workloads');
  if(before.suite==='browser'&&(!before.browser?.product||before.browser.product!==after.browser?.product))throw new Error('Different browser versions');
  const a=metrics(before),b=metrics(after);
  if(a.size!==b.size||[...a.keys()].some(k=>!b.has(k)))throw new Error('Missing or extra scenarios');
  return [...a].map(([metric,baseline])=>({metric,baseline,current:b.get(metric),delta:b.get(metric)-baseline,percent:baseline===0?null:(b.get(metric)/baseline-1)*100}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [baseline,current]=process.argv.slice(2);if(!baseline||!current)throw new Error('Usage: node tests/performance/compare.mjs BASELINE.json CURRENT.json');
    const rows=compareReports(JSON.parse(await readFile(baseline)),JSON.parse(await readFile(current)));
    console.log('| Metric | Baseline | Current | Change |\n|---|---:|---:|---:|');
    for(const r of rows)console.log(`| ${r.metric} | ${r.baseline.toFixed(2)} | ${r.current.toFixed(2)} | ${r.percent===null?'new from zero':r.percent.toFixed(1)+'%'} |`);
    console.log('\nAdvisory comparison only. Repeat on comparable hardware before deciding that a timing change is a regression.');
  }catch(e){console.error(e.message);process.exitCode=1;}
}
