// Extra instrumentation is confined to this diagnostic run, not baseline timings.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fixtureProcess} from './process.mjs';
import {environment} from './metrics.mjs';
const out=resolve(process.env.KAIRO_PERF_OUTPUT||'performance-results/diagnostic');await mkdir(out,{recursive:true});
const worker=await fixtureProcess('stress',false);
try{
  const report={environment:environment(),workload:worker.spec,opsec:await worker.rpc('probe'),scheduler:await worker.rpc('probe',{scheduler:true})};
  await writeFile(join(out,'snapshot-reads.json'),JSON.stringify(report,null,2));
  for(const name of ['opsec','session','imports_after_write'])await worker.rpc('bench',{name,iterations:3,warmups:3,profilePath:join(out,name+'.cpuprofile')});
  console.log('Wrote snapshot-read counts and separate CPU profiles to '+out);
}finally{await worker.close();}
