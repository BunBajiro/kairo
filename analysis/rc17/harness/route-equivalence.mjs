// External correctness check. This harness is never included in the RC17 app.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const baselineRoot=resolve(process.env.KAIRO_BASELINE_ROOT||'.');
const candidateRoot=resolve(process.env.KAIRO_CANDIDATE_ROOT||'.');
if(baselineRoot===candidateRoot)throw new Error('Provide distinct KAIRO_BASELINE_ROOT and KAIRO_CANDIDATE_ROOT.');
const modulePaths=[baselineRoot,candidateRoot].map(root=>resolve(root,'server/universe-routing.mjs'));
const fingerprints=()=>Promise.all(modulePaths.map(async path=>({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})));
const before=await fingerprints();
const [baseline,candidate]=await Promise.all(modulePaths.map(path=>import(pathToFileURL(path).href)));
const seed=20260930;let state=seed;
const random=()=>((state=(Math.imul(1664525,state)+1013904223)>>>0)/4294967296);
const at=Date.parse('2026-09-25T12:00:00Z');
const counts={gateLegs:0,jumpLegs:0,alternateMidpoints:0};
for(let scenario=0;scenario<40;scenario++){
 const systems=Array.from({length:12},(_,i)=>({system_id:i+1,name:'Fixture '+(i+1),x:(i%4+random()*.1)*baseline.LY_METRES,y:Math.floor(i/4)*baseline.LY_METRES,z:(random()-.5)*baseline.LY_METRES,
  security:[-.2,.1,.8][i%3],standing:[-5,0,5,null][i%4],ship_kills:i%4,pod_kills:i%2,space:i===11?'wormhole':'known',region_id:i===10?10000070:10000001,sovereignty_alliance_id:99}));
 const gates=Array.from({length:11},(_,i)=>({from_system_id:i+1,to_system_id:i+2}));
 const connections=[{id:'bridge',kind:'ansiblex',from_system_id:1,to_system_id:8,enabled:true,accessible:true,confirmed:true,directional:scenario%2===0,owner_alliance_id:99,capital_system_id:1,structure_id:1000000000001},
  {id:'hole',kind:'wormhole',from_system_id:3,to_system_id:12,enabled:true,accessible:true,confirmed:true,max_ship_size:scenario%3?'large':'medium',expires_at:new Date(at+(scenario%5?-1:1)*3600000).toISOString()}];
 for(const mode of ['shortest','safer','prefer_low']){
  const preferences={mode,useAnsiblex:true,ansiblexRules:scenario%2?'current':'live',pilotAllianceId:99,useWormholes:true,shipSize:'large',avoidHostile:scenario%4===0,avoidSystemIds:scenario%3===0?[7]:[],avoidLowsec:scenario%6===0};
  const input={systems,gates,connections,preferences,now:at};
  const route=candidate.createRoutePlanner(input);
  const rangeLy=[0,1.1,2,3.5,20,21][scenario%6],jump=candidate.createJumpPlanner({systems,rangeLy,preferences});
  for(const ends of [{originId:1,destinationId:9},{originId:9,destinationId:1},{originId:3,destinationId:12},{originId:4,destinationId:4},{originId:0,destinationId:1}]){
   assert.deepEqual(route(ends),baseline.planRoute({...input,...ends}),`Gate ${scenario}/${mode}/${JSON.stringify(ends)}`);counts.gateLegs++;
   assert.deepEqual(jump(ends),baseline.planJumpRoute({systems,rangeLy,preferences,...ends}),`Jump ${scenario}/${mode}/${JSON.stringify(ends)}`);counts.jumpLegs++;
   assert.deepEqual(jump.alternateMidpoints(ends),baseline.alternateJumpMidpoints({systems,rangeLy,preferences,...ends}),`Alternatives ${scenario}/${mode}/${JSON.stringify(ends)}`);counts.alternateMidpoints++;
  }
 }
}
const after=await fingerprints();assert.deepEqual(after,before,'Source changed during equivalence check.');
console.log(JSON.stringify({schema:1,kind:'correctness-only; no timing claims',seed,counts,sourceBefore:before,sourceAfter:after,status:'passed'},null,2));
