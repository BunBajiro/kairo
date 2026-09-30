import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {compareReports} from './compare.mjs';
const root=resolve(process.argv[2]),checks=[],rows=[],comparisons=[];
const read=async(name,file)=>JSON.parse(await readFile(join(root,name,file+'.json'),'utf8'));
let responseHash,writeHash;
const metric=(r,profile,name)=>r.profiles.find(p=>p.profile===profile).operations.find(o=>o.name===name).latencyMs.p50;
for(const repeat of [1,2]){
    const builds={};
    for(const name of ['baseline','predb','candidate']){
        const backend=await read(name+'-'+repeat,'backend'),db=await read(name+'-'+repeat,'database');
        assert.ok(backend.complete&&db.complete);responseHash??=db.agedImports.outputHash;writeHash??=db.historyWrite.outputHash;
        assert.equal(db.agedImports.outputHash,responseHash,'Aged-history output equality');assert.equal(db.historyWrite.outputHash,writeHash,'History-write output equality');
        builds[name]={backend,db};
        rows.push({repeat,build:name,commit:db.application,stressIdleCpu:backend.profiles.find(p=>p.profile==='stress').idle.cpuPercentOneCore,typicalSessionMs:metric(backend,'typical','session'),stressSessionMs:metric(backend,'stress','session'),stressImportsAfterWriteMs:metric(backend,'stress','imports_after_write'),agedImportsMs:db.agedImports.ms.p50,historyJsonBytes:db.after.historyJsonBytes,migrationOpenMs:db.firstOpenMs,eventInsert5000Ms:db.eventInsert.ms.p50,eventIndexBytes:db.eventIndexBytes,historyWrite1000Ms:db.historyWrite.ms.p50,historyWriteMaxBlockMs:db.historyWrite.synchronousBlockMs.max});
    }
    const a=builds.baseline,b=builds.predb,c=builds.candidate;
    for(const base of ['baseline','predb'])comparisons.push({repeat,baseline:base,metrics:compareReports(builds[base].backend,c.backend)});
    for(const [name,before,after,limit] of [
        ['0.7.2 → RC: stress idle CPU',a.backend.profiles.find(p=>p.profile==='stress').idle.cpuPercentOneCore,c.backend.profiles.find(p=>p.profile==='stress').idle.cpuPercentOneCore,.5],
        ['0.7.2 → RC: imports after unrelated write',metric(a.backend,'stress','imports_after_write'),metric(c.backend,'stress','imports_after_write'),.1],
        ['0.7.2 → RC: stress session latency',metric(a.backend,'stress','session'),metric(c.backend,'stress','session'),.8],
        ['pre-DB → RC: aged-history cold analysis',b.db.agedImports.ms.p50,c.db.agedImports.ms.p50,.65],
        ['pre-DB → RC: working history JSON size',b.db.after.historyJsonBytes,c.db.after.historyJsonBytes,.12],
    ])checks.push({repeat,name,before,after,ratio:after/before,requiredRatioBelow:limit,passed:after/before<limit});
}
await writeFile(join(root,'comparison.json'),JSON.stringify({rows,checks,comparisons,agedOutputsEqual:true,historyWriteOutputsEqual:true},null,2)+'\n');
const md='| Repeat | Build | Stress idle CPU % | Typical session ms | Stress session ms | Imports after write ms | Aged cold analysis ms | History JSON MiB | 5,000 event inserts ms | 1,000 history writes ms |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|\n'+rows.map(r=>`| ${r.repeat} | ${r.build} | ${r.stressIdleCpu.toFixed(2)} | ${r.typicalSessionMs.toFixed(2)} | ${r.stressSessionMs.toFixed(2)} | ${r.stressImportsAfterWriteMs.toFixed(2)} | ${r.agedImportsMs.toFixed(2)} | ${(r.historyJsonBytes/1048576).toFixed(2)} | ${r.eventInsert5000Ms.toFixed(2)} | ${r.historyWrite1000Ms.toFixed(2)} |`).join('\n')+'\n\n'+checks.map(c=>`- ${c.passed?'PASS':'FAIL'}: repeat ${c.repeat}, ${c.name}: ${((1-c.ratio)*100).toFixed(1)}% reduction.`).join('\n')+'\n\nSynthetic workloads, repeated in ABC/CBA order. CPU is a percentage of one logical core. Full response equivalence is checked separately; timings include serialization. All raw observations, including advisory metrics, are retained.\n';
await writeFile(join(root,'comparison.md'),md);console.log(md);
assert.ok(checks.every(c=>c.passed),'A targeted performance improvement did not reproduce');
