import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureSource,verifySource} from '../../../../../harness/source-manifest.mjs';
const here=dirname(fileURLToPath(import.meta.url)), base='9afa9a7197fa6b5a802e9efdaa322dedf2439150';
export async function freezeSources(output) {
 const proposal=JSON.parse(await readFile(join(here,'proposal-files.json'),'utf8'));
 const sources={baseline:await captureSource('/workspace/scratch/a2f3334402fc/kairo-m9-summary-baseline-9afa',{expectedCommit:base,requireClean:true}),candidate:await captureSource('/workspace/scratch/a2f3334402fc/kairo-m9-summary-9afa-isolated',{expectedCommit:base})};
 const original=new Map(sources.baseline.files.map(row=>[row.path,row]));const declared=new Map(proposal.files.map(row=>[row.path,row]));
 assert.equal(sources.baseline.files.length,482);assert.equal(sources.candidate.files.length,482);
 for(const file of sources.candidate.files){const old=original.get(file.path),delta=declared.get(file.path);if(delta){assert.equal(old.sha256,delta.baselineSha256);assert.equal(file.sha256,delta.proposalSha256);}else assert.deepEqual(file,old);}
 for(const [role,source]of Object.entries(sources)){assert.equal(source.builtFiles.length,0);await verifySource(source);await writeFile(join(output,role+'-source.json'),JSON.stringify(source,null,2)+'\n',{flag:'wx'});}
 await writeFile(join(output,'source-boundary.json'),JSON.stringify({baseCommit:base,sourceFiles:482,declaredDelta:proposal.files.map(row=>row.path),baselineFingerprint:sources.baseline.fingerprint,trialFingerprint:sources.candidate.fingerprint,baselineBuildAssets:0,trialBuildAssets:0,browserPerformanceClaim:false},null,2)+'\n',{flag:'wx'});
 return sources;
}
