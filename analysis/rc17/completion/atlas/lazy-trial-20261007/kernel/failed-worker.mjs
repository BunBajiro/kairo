import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {loadSourceManifest} from '../../harness/source-manifest.mjs';
import {digest} from '../startup/fixture.mjs';
const [manifestPath,kind,first,mode]=process.argv.slice(2),source=await loadSourceManifest(manifestPath),root=source.root;
assert.ok(['baseline','trial'].includes(kind)&&['physical','schematic'].includes(first)&&['timing','heap'].includes(mode));
const atlasBytes=await readFile(join(root,'server/data/universe.json.gz')),atlas=JSON.parse(gunzipSync(atlasBytes));
const {projectKnownSystems,pointBounds}=await import(pathToFileURL(join(root,'components/kairo/universe-map-math.mjs')));
const {schematicLayout}=await import(pathToFileURL(join(root,'lib/universe-schematic-layout.mjs')));
const trial=kind==='trial'?(await import(pathToFileURL(join(root,'components/kairo/universe-map-layouts.mjs')))).createAtlasLayouts:null;
function eager(systems){const physical=projectKnownSystems(systems),schematic=schematicLayout(systems.filter(system=>system.space==='known')).points,raw=pointBounds(physical.map(point=>({x:point.system.map_x,y:point.system.map_y})));return{firstSystemId:physical[0]?.system.system_id,worldUnitsPerLightYear:1000/Math.max(1,raw.maxX-raw.minX,raw.maxY-raw.minY),get:kind=>kind==='physical'?physical:schematic};}
const create=trial||eager,second=first==='physical'?'schematic':'physical';
const report={kind,first,mode,source:{commit:source.sourceCommit,fingerprint:source.fingerprint},timings:{},heap:{},semantic:{},fixture:{systems:atlas.systems.length,atlasSha256:digest(atlasBytes)},complete:false,productionAcceptance:false};
async function heap(name){if(mode==='heap'){for(let i=0;i<3;i++){gc();await new Promise(setImmediate);}report.heap[name]=process.memoryUsage().heapUsed;}}
await heap('before');let owner,points;
let start=performance.now();owner=create(atlas.systems);points=owner.get(first);report.timings.mountMs=performance.now()-start;await heap('afterMount');report.semantic[first]=digest(points);report.semantic.metadata=digest({firstSystemId:owner.firstSystemId,scale:owner.worldUnitsPerLightYear});
start=performance.now();points=owner.get(second);report.timings.firstSwitchMs=performance.now()-start;await heap('afterBoth');report.semantic[second]=digest(points);report.timings.cumulativeMs=report.timings.mountMs+report.timings.firstSwitchMs;
const cached=owner.get(first);start=performance.now();assert.equal(owner.get(first),cached);report.timings.warmSwitchMs=performance.now()-start;
// A replaced systems identity owns fresh values; no cache survives a changed SDE.
const replacement=atlas.systems.map((system,index)=>index===0?{...system,map_x:system.map_x+2,schematic_x:system.schematic_x+3}:system);
start=performance.now();owner=create(replacement);points=owner.get(first);report.timings.replacementMountMs=performance.now()-start;report.semantic.replacement=digest(points);
assert.deepEqual(points,first==='physical'?projectKnownSystems(replacement):schematicLayout(replacement.filter(s=>s.space==='known')).points);
// Correctness verification runs after measurements.
assert.equal(report.semantic.physical,digest(projectKnownSystems(atlas.systems)));assert.equal(report.semantic.schematic,digest(schematicLayout(atlas.systems.filter(s=>s.space==='known')).points));
await loadSourceManifest(manifestPath);report.complete=true;console.log(JSON.stringify(report));
