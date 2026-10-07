// Exact Atlas layout functions on the complete bundled topology. This isolates
// derivation/retention, not React mounting, canvas rendering or browser latency.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {digest,distribution} from '../startup/fixture.mjs';
const [rootArg,manifestPath,first='physical',mode='timing']=process.argv.slice(2),root=resolve(rootArg);
assert.ok(['physical','schematic'].includes(first)&&['timing','heap'].includes(mode));if(mode==='heap')assert.equal(typeof gc,'function');
const atlasBytes=await readFile(join(root,'server/data/universe.json.gz')),atlas=JSON.parse(gunzipSync(atlasBytes));
const {projectKnownSystems}=await import(pathToFileURL(join(root,'components/kairo/universe-map-math.mjs')));
const {schematicLayout}=await import(pathToFileURL(join(root,'lib/universe-schematic-layout.mjs')));
const {buildGateGraph,tacticalLayout}=await import(pathToFileURL(join(root,'components/kairo/universe-map-operations.mjs')));
const report={lane:'Atlas-layout-kernel',mode,first,complete:false,productionAcceptance:false,timings:{},heap:{},semantic:{},fixture:{systems:atlas.systems.length,gates:atlas.gates.length,atlasSha256:digest(atlasBytes)}};
async function heap(name){if(mode==='heap'){for(let i=0;i<3;i++){gc();await new Promise(setImmediate);}report.heap[name]=process.memoryUsage();}}
const work={physical:()=>projectKnownSystems(atlas.systems),schematic:()=>schematicLayout(atlas.systems.filter(system=>system.space==='known')).points};
const held={};await heap('beforeLayouts');
for(const kind of [first,first==='physical'?'schematic':'physical']){const at=performance.now();held[kind]=work[kind]();if(mode==='timing')report.timings[kind+'FirstMs']=performance.now()-at;await heap('after'+kind);}
report.timings.bothFirstMs=(report.timings.physicalFirstMs||0)+(report.timings.schematicFirstMs||0);
for(const kind of ['physical','schematic']){const samples=[];let value;for(let i=0;i<80;i++){const at=performance.now();value=work[kind]();if(mode==='timing')samples.push(performance.now()-at);await new Promise(setImmediate);}if(mode==='timing')report.timings[kind+'WarmMs']=distribution(samples);report.semantic[kind]=digest(value);assert.equal(digest(held[kind]),report.semantic[kind]);}
assert.deepEqual(held.physical.map(p=>p.system.system_id).sort((a,b)=>a-b),held.schematic.map(p=>p.system.system_id).sort((a,b)=>a-b));
const graphStart=performance.now(),graph=buildGateGraph(atlas.gates);if(mode==='timing')report.timings.gateGraphMs=performance.now()-graphStart;
const radarStart=performance.now(),radar=tacticalLayout(atlas.systems,graph,{mode:'radar',centerSystemId:30000142,hops:3});if(mode==='timing')report.timings.firstRadarMs=performance.now()-radarStart;
report.semantic.radar=digest({...radar,distances:[...radar.distances.entries()].sort(([a],[b])=>a-b)});report.fixture.knownSystems=held.physical.length;report.fixture.radarSystems=radar.points.length;await heap('afterRadar');
const {loadSourceManifest}=await import('../../harness/source-manifest.mjs');const source=await loadSourceManifest(manifestPath,root);report.source={commit:source.sourceCommit,fingerprint:source.fingerprint};report.complete=true;report.endVerified=true;console.log(JSON.stringify(report));
