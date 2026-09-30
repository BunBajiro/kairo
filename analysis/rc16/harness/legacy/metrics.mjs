import {cpus,platform,release,arch,totalmem} from 'node:os';
import {execFileSync} from 'node:child_process';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';

export function quantile(values,q) {
  if(!values.length || values.some(v=>!Number.isFinite(v))) throw new Error('Expected finite, nonempty samples.');
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.max(0,Math.ceil(sorted.length*q)-1)];
}
export function distribution(values) {
  return {samples:values,p50:quantile(values,.5),p95:quantile(values,.95),min:Math.min(...values),max:Math.max(...values)};
}
export function environment() {
  let commit=process.env.KAIRO_PERF_APP_REF||'unknown',dirty=null;
  try{if(!process.env.KAIRO_PERF_APP_REF)commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();dirty=!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();}catch{}
  return {commit,dirty,node:process.version,platform:platform(),release:release(),arch:arch(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,totalMemoryBytes:totalmem(),runner:process.env.RUNNER_OS?'github-actions':'local',runUrl:process.env.GITHUB_RUN_ID?`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`:null};
}
export function startMeter() {
  const delay=monitorEventLoopDelay({resolution:10});delay.enable();
  const wall=performance.now(),cpu=process.cpuUsage(),elu=performance.eventLoopUtilization(),memory=process.memoryUsage();
  let peakRssBytes=memory.rss;
  const sampler=setInterval(()=>{peakRssBytes=Math.max(peakRssBytes,process.memoryUsage().rss);},250);sampler.unref();
  return () => {
    const elapsedMs=performance.now()-wall,used=process.cpuUsage(cpu),end=process.memoryUsage();clearInterval(sampler);delay.disable();
    return {elapsedMs,cpuMs:(used.user+used.system)/1000,cpuPercentOneCore:(used.user+used.system)/elapsedMs/10,eventLoopUtilization:performance.eventLoopUtilization(elu).utilization,eventLoopDelayP95Ms:delay.count?delay.percentile(95)/1e6:null,eventLoopDelayMaxMs:delay.count?delay.max/1e6:null,rssBeforeBytes:memory.rss,rssAfterBytes:end.rss,peakRssBytes:Math.max(peakRssBytes,end.rss),heapBeforeBytes:memory.heapUsed,heapAfterBytes:end.heapUsed};
  };
}
export async function writeReport(kind,report,markdown,out=process.env.KAIRO_PERF_OUTPUT||'performance-results') {
  await mkdir(out,{recursive:true});
  await writeFile(join(out,kind+'.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(join(out,kind+'.md'),markdown+'\n');
  console.log(`${kind}: ${resolve(out,kind+'.json')}`);
}
export async function assetManifest() {
  // The static application must be compiled before browser/HTTP measurements.
  const {readdir}=await import('node:fs/promises'), files=[];
  async function walk(dir) {for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await walk(p);else {const bytes=await readFile(p);files.push({path:p,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
  await walk('dist/client');
  files.sort((a,b)=>a.path.localeCompare(b.path));
  return {fingerprint:createHash('sha256').update(JSON.stringify(files)).digest('hex'),totalBytes:files.reduce((n,f)=>n+f.bytes,0),files};
}
export function numberOption(name,fallback,min,max) {
  const value=process.env[name]===undefined?fallback:Number(process.env[name]);
  if(!Number.isFinite(value)||value<min||value>max)throw new Error(`${name} must be between ${min} and ${max}.`);
  return value;
}
