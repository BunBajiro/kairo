import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {compareReports} from './compare.mjs';
const root=resolve(process.argv[2]||'performance-results');
const read=async name=>JSON.parse(await readFile(join(root,name,'backend.json'),'utf8'));
const rows=[],checks=[];
for(const run of [1,2]){
 const before=await read('baseline-'+run),after=await read('candidate-'+run);rows.push({run,metrics:compareReports(before,after)});
 const a=before.profiles.find(p=>p.profile==='stress'),b=after.profiles.find(p=>p.profile==='stress');
 const metric=(profile,name)=>profile.operations.find(o=>o.name===name).latencyMs.p50;
 for(const [name,baseline,candidate,limit] of [
  ['stress idle CPU',a.idle.cpuPercentOneCore,b.idle.cpuPercentOneCore,.5],
  ['stress imports after unrelated write',metric(a,'imports_after_write'),metric(b,'imports_after_write'),.1],
  ['stress session latency',metric(a,'session'),metric(b,'session'),.8],
 ])checks.push({run,name,baseline,candidate,ratio:candidate/baseline,requiredRatioBelow:limit,passed:candidate/baseline<limit});
}
await writeFile(join(root,'comparison.json'),JSON.stringify({checks,rows},null,2)+'\n');
const md='| Run | Target | Baseline | Candidate | Reduction | Gate |\n|---|---|---:|---:|---:|---|\n'+checks.map(c=>`| ${c.run} | ${c.name} | ${c.baseline.toFixed(2)} | ${c.candidate.toFixed(2)} | ${((1-c.ratio)*100).toFixed(1)}% | ${c.passed?'pass':'FAIL'} |`).join('\n')+'\n\nConservative gates for the three measured hotspots. Other metrics remain advisory and require review; this is not a claim about GPU power or physical fans.\n';
await writeFile(join(root,'comparison.md'),md);console.log(md);
assert.ok(checks.every(c=>c.passed),'One or more targeted improvements were not reproduced');
