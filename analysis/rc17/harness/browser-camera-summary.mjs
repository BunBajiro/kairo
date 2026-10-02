// Summarize matched ABBA entries without pooling hosts or calling two repeats CI.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const root=resolve(process.argv[2]||''),provenance=JSON.parse(await readFile(join(root,'provenance.json'),'utf8'));
assert.ok(provenance.complete&&provenance.endVerified,'Complete verified ABBA run required');
const runs=await Promise.all(provenance.order.map(async name=>({name,...JSON.parse(await readFile(join(root,name+'.json'),'utf8'))})));
assert.ok(runs.every(run=>run.complete&&run.sourceVerified));assert.equal(new Set(runs.map(run=>run.fixture.digest)).size,1);
const average=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
const rows=[];
for(const nodes of [100,600])for(const scenario of ['idle','zoom','pan']){
 const pair=Object.fromEntries(['baseline','candidate'].map(target=>[target,runs.filter(run=>run.name.startsWith(target)).map(run=>{const sample=run.samples.find(s=>s.nodes===nodes&&s.name===scenario);assert.ok(sample);return sample;})]));
 for(const metric of ['taskMs','scriptMs','recalcMs','layoutMs','windowMs']){const values=Object.fromEntries(Object.entries(pair).map(([target,samples])=>[target,samples.map(sample=>sample[metric])]));const baselineMean=average(values.baseline),candidateMean=average(values.candidate);rows.push({nodes,scenario,metric,...values,baselineMean,candidateMean,deltaPercent:baselineMean?(candidateMean/baselineMean-1)*100:null});}
 for(const metric of ['p95','max','over33ms'])if(scenario!=='idle'){const values=Object.fromEntries(Object.entries(pair).map(([target,samples])=>[target,samples.map(sample=>sample.raf[metric])]));rows.push({nodes,scenario,metric:'raf.'+metric,...values});}
}
const diagnostics=runs.map(run=>({run:run.name,styleMutations:run.diagnostics.styleMutations,active600:run.diagnostics.active600,retainedBefore:run.diagnostics.retainedBefore,retainedAfter:run.diagnostics.retainedAfter,afterUnmountRequests:run.diagnostics.afterUnmountRequests}));
const summary={schemaVersion:1,source:provenance.source,fixtureDigest:provenance.fixtureDigest,rows,diagnostics,limits:['Two fresh browser repetitions per implementation on one host; ranges are observed values, not confidence intervals.','Camera windows perform identical user actions after map loading. Extra UI controls remain part of candidate UI.','Mutation counts and forced-GC snapshots are separate diagnostics, never camera timings.','Headless software-rendered frame observations do not predict a desktop GPU frame rate.']};
await writeFile(join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n');
const round=value=>value==null?'—':value.toFixed(2),lines=['# Maps camera comparison','',`Baseline: ${provenance.source.baseline.commit}. Candidate: ${provenance.source.candidate.commit}.`,'','Two independent browser repetitions per application in ABBA order. Second pair reverses the 100/600-node size order. Same canonical graph digest across all entries.','', '| Nodes | Camera action | Renderer task ms (RC16 → candidate) | Script ms (RC16 → candidate) | Style ms (RC16 → candidate) |','|---:|---|---:|---:|---:|'];
for(const nodes of [100,600])for(const scenario of ['idle','zoom','pan']){const values=['taskMs','scriptMs','recalcMs'].map(metric=>{const r=rows.find(row=>row.nodes===nodes&&row.scenario===scenario&&row.metric===metric);return round(r.baselineMean)+' → '+round(r.candidateMean);});lines.push(`| ${nodes} | ${scenario} | ${values.join(' | ')} |`);}
lines.push('','Means shown; exact paired samples, frame intervals, wall windows and diagnostic snapshots are in `summary.json`. Idle windows are one second. Zoom executes three 1.25× button zooms; pan uses 24 middle-pointer steps. No map-load timing is included.','','The style-mutation observer and forced-GC checks run after every timing window. They do not measure React commits. Two mount/unmount cycles provide a bounded retained-ownership check, not a general leak test.','',''+summary.limits.join(' '),'');
await writeFile(join(root,'summary.md'),lines.join('\n'));console.log(JSON.stringify({output:join(root,'summary.json'),complete:true,rows:rows.length}));
