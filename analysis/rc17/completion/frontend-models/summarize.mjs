import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const root=resolve(process.argv[2]),median=xs=>{xs=[...xs].sort((a,b)=>a-b);return(xs[(xs.length-1)>>1]+xs[xs.length>>1])/2;};
const pack=xs=>({median:median(xs),min:Math.min(...xs),max:Math.max(...xs),values:xs});
const summary=JSON.parse(await readFile(join(root,'summary.json')));if(!summary.complete)throw Error('Incomplete ABBA cannot be summarized');
const rows=await Promise.all(summary.order.map(async row=>({...row,result:JSON.parse(await readFile(row.file))})));
const output={source:summary.fingerprint,method:'ABBA, two fresh processes/browsers per variant; descriptive medians/ranges, no significance claim',models:{},studioAdmin:{},formatters:{}};
for(const [kind,key]of [['models','models'],['studio-admin','studioAdmin']]) {
 const labels=rows.find(x=>x.kind===kind).result.samples.map(x=>x.label);
 for(const label of labels){output[key][label]={};for(const variant of ['baseline','candidate']){
  const samples=rows.filter(x=>x.kind===kind&&x.variant===variant).map(x=>x.result.samples.find(s=>s.label===label));
  output[key][label][variant]=Object.fromEntries(['taskMs','scriptMs','layoutMs','recalcMs','windowMs'].map(metric=>[metric,pack(samples.map(x=>x[metric]))]));
  if(kind==='studio-admin')output[key][label][variant].requestCounts=samples.map(s=>s.requests.reduce((counts,r)=>(counts[r.method+' '+r.path]=(counts[r.method+' '+r.path]||0)+1,counts),{}));
 }}
}
for(const variant of ['baseline','candidate']){const rs=rows.filter(x=>x.kind==='formatters'&&x.variant===variant).map(x=>x.result);output.formatters[variant]={importMs:pack(rs.map(x=>x.importMs)),firstThreeMs:pack(rs.map(x=>x.cold.ms)),warm30kMs:pack(rs.flatMap(x=>x.warm.map(s=>s.ms)))};}
await writeFile(join(root,'comparisons.json'),JSON.stringify(output,null,2)+'\n');
for(const key of ['models','studioAdmin'])for(const [label,row]of Object.entries(output[key]))console.log(label,row.baseline.taskMs.median.toFixed(2),'->',row.candidate.taskMs.median.toFixed(2));
console.log(JSON.stringify(output.formatters,null,2));
