// Internal candidate checkpoint only: no production imports, account/network data or timers in the application.
// The RC16 follow-up harness remains frozen; this adapter preserves its fixtures and semantic controls.
// Runs acquire an exclusive lock automatically; diagnostics never supply latency evidence.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { cpus, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { loadSourceManifest, verifySource } from '../../../../../harness/source-manifest.mjs';

const originalParse = JSON.parse, originalStringify = JSON.stringify;
const args = process.argv.slice(2), mode = args[0] || 'diagnostics';
assert.equal(mode, 'diagnostics', 'Instrumented derivative is never ordinary timing evidence');
assert(['diagnostics', 'timings'].includes(mode), 'Use diagnostics or timings [--reverse] [--filter=...]');
const reverse = args.includes('--reverse'), baseline = args.includes('--baseline');
const filter = args.find(arg => arg.startsWith('--filter='))?.slice('--filter='.length) || '';
const lockFile = '/tmp/kairo-rc16-benchmark.lock';
if (process.env.KAIRO_MAPS_CANDIDATE_LOCK_HELD !== '1') {
    const locked = spawnSync('flock', ['-n', lockFile, process.execPath, fileURLToPath(import.meta.url), ...args], {
        stdio: 'inherit', env: { ...process.env, KAIRO_MAPS_CANDIDATE_LOCK_HELD: '1' },
    });
    if (locked.error) throw locked.error;
    process.exit(locked.status ?? 1);
}

const rootInput = process.env.KAIRO_BENCH_SOURCE_ROOT || process.env.KAIRO_CANDIDATE_ROOT;
assert(rootInput, 'KAIRO_BENCH_SOURCE_ROOT or KAIRO_CANDIDATE_ROOT must identify the candidate checkout');
assert(process.env.KAIRO_SOURCE_MANIFEST, 'KAIRO_SOURCE_MANIFEST must identify a frozen source manifest');
const sourceRoot = resolve(rootInput), sourceManifest = await loadSourceManifest(process.env.KAIRO_SOURCE_MANIFEST, sourceRoot);
const manifestVerificationBefore = {fingerprint:sourceManifest.fingerprint,sourceCommit:sourceManifest.sourceCommit,dirty:sourceManifest.dirty};
const sourceModule = relative => import(pathToFileURL(join(sourceRoot, relative)).href);
const [{ openStore }, { createUniverse }, { getUniverseStatic }] = await Promise.all([
    sourceModule('server/store.mjs'), sourceModule('server/universe.mjs'), sourceModule('server/universe-static.mjs'),
]);
const referenceSource = '57c8dcc7fbd8fc2b62129498d1819050c78381a1';
if (baseline) assert.equal(sourceManifest.sourceCommit, referenceSource, '--baseline requires the canonical RC16 source commit');
const AT = Date.parse('2026-09-30T09:00:00Z'), stamp = new Date(AT).toISOString(), expiry = new Date(AT + 16 * 3600000).toISOString();
const PILOT = 42, REVISION = 7, ACTIVE_MAP = 'map-00';
const atlas = getUniverseStatic(), wormholes = atlas.systems.filter(s => s.space === 'wormhole');
const hash = value => createHash('sha256').update(value).digest('hex');
const trackedFiles = ['server/universe.mjs','server/universe-jspace.mjs','server/universe-operations.mjs','server/universe-jspace-tracking.mjs','server/store.mjs'];
async function fingerprints() {
    const files = {};
    for(const relative of trackedFiles)files[relative]=hash(await readFile(join(sourceRoot,relative)));
    return {files,harness:hash(await readFile(fileURLToPath(import.meta.url))),manifestHelper:hash(await readFile(new URL('../../../../../harness/source-manifest.mjs',import.meta.url)))};
}
const beforeFingerprints=await fingerprints();
const gitBefore=spawnSync('git',['-C',sourceRoot,'rev-parse','HEAD'],{encoding:'utf8'});
let active = null, networkAttempts = 0;
const blockNetwork = async () => { networkAttempts++; throw new Error('External IO is forbidden in the Maps follow-up'); };
globalThis.fetch = blockNetwork;

// Diagnostics only. SQL result bytes are logical materialisation, not disk/page reads.
if (mode === 'diagnostics') {
    JSON.parse = function(value, ...args) {
        const result = originalParse.call(this, value, ...args);
        if (active && typeof value === 'string') { active.json.parseCalls++; active.json.parseCharacters += value.length; }
        return result;
    };
    JSON.stringify = function(value, ...args) {
        const result = originalStringify.call(this, value, ...args);
        if (active && typeof result === 'string') { active.json.stringifyCalls++; active.json.stringifyCharacters += result.length; }
        return result;
    };
    const prepare = DatabaseSync.prototype.prepare;
    DatabaseSync.prototype.prepare = function(sql, ...args) {
        const statement = prepare.call(this, sql, ...args);
        return new Proxy(statement, { get(target, key) {
            const value = Reflect.get(target, key, target);
            if (typeof value !== 'function') return value;
            if (!['get', 'all', 'run'].includes(key)) return value.bind(target);
            return (...params) => {
                const result = value.apply(target, params);
                if (active) {
                    const label = sql + (sql.includes('FROM universe_records WHERE character_id=? AND kind=? ORDER') ? ` [kind=${params[1]}]` : '');
                    const metric = active.sql[label] ||= { calls: 0, rows: 0, jsonBytes: 0, changes: 0 };
                    metric.calls++;
                    if (key === 'run') metric.changes += Number(result.changes || 0);
                    else for (const row of key === 'all' ? result : result ? [result] : []) {
                        metric.rows++;
                        for (const field of ['body', 'value']) if (typeof row[field] === 'string') metric.jsonBytes += Buffer.byteLength(row[field]);
                        if (typeof row.body === 'string') {
                            const body = originalParse(row.body);
                            if (['wormhole', 'ansiblex'].includes(body.kind)) {
                                active.materialization.linkBodies++;
                                active.materialization.linksByMap[body.map_id || 'global'] = (active.materialization.linksByMap[body.map_id || 'global'] || 0) + 1;
                            }
                            if (body.signature_id && body.system_id) active.materialization.signatureBodies++;
                            if (Array.isArray(body.nodes) && Array.isArray(body.connections)) active.materialization.mapBodies++;
                        }
                    }
                }
                return result;
            };
        }});
    };
    const arrayFilter = Array.prototype.filter;
    Array.prototype.filter = function(callback, thisArg) {
        // This shape exists after JSpace connection projection. Filtering it for
        // every signature was the RC16 S*E loop. Candidate diagnostics assert that
        // it is absent while retaining the same endpoint/binding checks.
        if (active && this.length && this[0]?.link_id && Object.hasOwn(this[0], 'from_signature_id') && Object.hasOwn(this[0], 'to_signature_id')) {
            active.signatureEdgeScan.calls++;
            active.signatureEdgeScan.predicateVisits += this.length;
            active.signatureEdgeScan.firstStack ||= new Error('projection filter diagnostic').stack;
        }
        return arrayFilter.call(this, callback, thisArg);
    };
}

const spec = (mapId, nodes, links, signatures, bound = false) => ({ mapId, nodes, links, signatures, bound });
const mapId = n => 'map-' + String(n).padStart(2, '0');
const signaturesFor = s => Array.from({ length: s.signatures }, (_,i) => ({
    id: `${s.mapId}-sig-${String(i).padStart(4,'0')}`, map_id: s.mapId, system_id: wormholes[i % s.nodes].system_id,
    signature_id: 'AAA-' + String(i).padStart(3, '0'), kind: 'Cosmic Signature', group: 'Cosmic Signature', type: s.bound ? 'Wormhole' : 'Data Site',
    name: 'Synthetic signature ' + i, wh_type: null, destination_system_id: null, missing: false, first_seen_at: stamp, last_seen_at: stamp, updated_at: stamp,
    notes: '', bookmark_index: i + 1, bookmark_chain: '', bookmark_chain_letters: '', temporary_name: '', is_return_hole: false,
}));
function expectedEdge(s, index) {
    const from = index % s.nodes, to = (from + 1 + Math.floor(index / s.nodes)) % s.nodes;
    assert.notEqual(from, to, 'Synthetic endpoints must differ');
    return { id: `${s.mapId}-edge-${String(index).padStart(4,'0')}`, linkId: `${s.mapId}-link-${String(index).padStart(4,'0')}`,
        from: wormholes[from].system_id, to: wormholes[to].system_id,
        fromSignature: s.bound ? `${s.mapId}-sig-${String(from).padStart(4,'0')}` : null,
        toSignature: s.bound ? `${s.mapId}-sig-${String(to).padStart(4,'0')}` : null };
}
function validateSpec(s) {
    assert(s.nodes > 1 && s.nodes <= 600 && s.links <= 1000 && s.signatures <= 1000, 'Fixture must fit supported per-map limits');
    assert(!s.bound || s.signatures === s.nodes, 'Bound fixture has one signature per node');
}
async function fixture(specs) {
    assert(specs.length >= 1 && specs.length <= 24, 'Private maps must remain within supported limit');
    specs.forEach(validateSpec);
    const dir = await mkdtemp(join(tmpdir(), 'kairo-followup-maps-')), store = openStore(dir);
    const auth = { characters: () => [{ id: PILOT, name: 'Synthetic pilot', scopes: [] }] };
    const service = createUniverse(store, auth, { request: blockNetwork, names: blockNetwork }, {
        staticData: atlas, now: () => AT, noSync: true, feeds: { fetcher: blockNetwork },
    });
    const put = store.db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?)');
    const putOps = store.db.prepare('INSERT INTO universe_operations_records VALUES(?,?,?,?,?)');
    let canonicalBytes = 0, mapDocumentBytes = 0, signatureBytes = 0;
    store.db.exec('BEGIN');
    try {
        for (const s of specs) {
            const map = { id: s.mapId, name: 'Synthetic map ' + s.mapId, description: '', scope: null, scope_version: 2, revision: REVISION,
                created_at: stamp, updated_at: stamp, nodes: wormholes.slice(0,s.nodes).map((system,index) => ({ system_id: system.system_id,
                    x: (index % 50) * 340, y: Math.floor(index / 50) * 190, locked: false, alias: '', label: '', description: '',
                    role: '', status: 'unknown', tags: [], effective_owner: null, prune_grace_at: stamp })),
                connections: [], passages: [], observations: [], comments: [], pings: [], activity: [], pilots: [] };
            for (const signature of signaturesFor(s)) {
                const body = JSON.stringify(signature); signatureBytes += Buffer.byteLength(body);
                putOps.run(PILOT, 'signature:map:' + s.mapId, signature.id, body, stamp);
            }
            for (let index=0; index<s.links; index++) {
                const e = expectedEdge(s,index), link = { id: e.linkId, map_id: s.mapId, kind: 'wormhole', from_system_id: e.from, to_system_id: e.to,
                    from_signature_record_id: e.fromSignature, to_signature_record_id: e.toSignature,
                    enabled: true, confirmed: true, accessible: true, reverse_accessible: true, directional: false, life_status: 'stable',
                    life_band: 'under_day', life_observed_at: stamp, mass: 'stable', expires_at: expiry, updated_at: stamp };
                const body = JSON.stringify(link); canonicalBytes += Buffer.byteLength(body);
                put.run(PILOT, 'link', e.linkId, body, stamp);
                map.connections.push({ id: e.id, link_id: e.linkId, kind: 'wormhole', from_system_id: e.from, to_system_id: e.to });
            }
            const body = JSON.stringify(map), bytes = Buffer.byteLength(body); assert(bytes <= 4_000_000, 'Document must fit supported size');
            mapDocumentBytes += bytes; put.run(PILOT,'jspace_map',s.mapId,body,stamp);
        }
        store.db.exec('COMMIT');
    } catch(error) { store.db.exec('ROLLBACK'); await service.close(); store.close(); await rm(dir,{recursive:true,force:true}); throw error; }
    service.jspace.setActivePilot(PILOT); // creates the normal empty source map before measured reads
    const totals = specs.reduce((a,s) => ({ maps:a.maps+1, nodes:a.nodes+s.nodes, links:a.links+s.links, signatures:a.signatures+s.signatures }),
        { maps:0,nodes:0,links:0,signatures:0 });
    return { service, store, expected:specs, totals:{ ...totals, canonicalBytes, mapDocumentBytes, signatureBytes },
        async close() { await service.close(); store.close(); await rm(dir,{recursive:true,force:true}); } };
}

const fixedMap = spec(ACTIVE_MAP,100,99,100,true), cases = [];
for (const count of [1,8,24]) for (const action of ['selected','list','summaries']) cases.push({
    name:`independence-${action}-${count}-maps`,family:'independence',action,
    specs:Array.from({length:count},(_,i)=>({...fixedMap,mapId:mapId(i)})),
});
for (const count of [1,8,24]) for (const action of ['list','summaries']) cases.push({ name:`constant-links-${action}-${count}-maps`,family:'constant-links',action,
    specs:Array.from({length:count},(_,i)=>spec(mapId(i),60,720/count,0)),
});
for (const signatures of [0,100,1000]) for (const links of [100,1000]) cases.push({
    name:`dense-selected-${signatures}-signatures-${links}-links`,family:'dense',action:'selected',specs:[spec(ACTIVE_MAP,100,links,signatures)],
});

let selectedDigest = null;
function assertMap(map, s) {
    assert.equal(map.id,s.mapId); assert.equal(map.revision,REVISION); assert.equal(map.read_only,false);
    assert.equal(map.nodes.length,s.nodes); assert.equal(map.connections.length,s.links);
    assert.equal(map.signatures.length,s.signatures); assert.equal(map.operations.signatures.length,s.signatures);
    assert.equal(map.operations.map_id,s.mapId); assert.equal(map.operations.character_id,PILOT);
    assert.equal(map.operations.location.status,'missing_scope');
    assert.equal(new Set(map.nodes.map(n=>n.system_id)).size,s.nodes);
    for (const [index, node] of map.nodes.entries()) {
        assert.equal(node.system_id, wormholes[index].system_id);
        assert.equal(node.x, (index % 50) * 340); assert.equal(node.y, Math.floor(index / 50) * 190);
    }
    assert.equal(new Set(map.connections.map(e=>e.id)).size,s.links);
    assert.equal(new Set(map.connections.map(e=>e.link_id)).size,s.links);
    assert.equal(new Set(map.signatures.map(sig=>sig.id)).size,s.signatures);
    const bindings = new Map();
    for (const [index,e] of map.connections.entries()) {
        const expected = expectedEdge(s,index);
        assert.equal(e.id,expected.id); assert.equal(e.link_id,expected.linkId);
        assert.equal(e.from_system_id,expected.from); assert.equal(e.to_system_id,expected.to);
        assert.equal(e.active,true); assert.equal(e.expired,false); assert.equal(e.confirmed,true); assert.equal(e.accessible,true);
        assert.equal(e.expires_at,expiry); assert.equal(e.from_signature_id,expected.fromSignature); assert.equal(e.to_signature_id,expected.toSignature);
        for (const sig of [expected.fromSignature,expected.toSignature]) if(sig) {
            if(!bindings.has(sig))bindings.set(sig,[]);bindings.get(sig).push(e.id);
        }
    }
    for(const signature of map.signatures) {
        assert.equal(signature.stale,false); assert.equal(signature.age_ms,0);
        assert.deepEqual(signature.connection_ids,bindings.get(signature.id)||[]);
    }
}
function verifyOutput(output, scenario, f) {
    if (scenario.action === 'summaries') {
        assert.equal(output.character_id, PILOT); assert.equal(output.maps.length, f.expected.length);
        assert.equal(output.source_map.id, 'tracking-source-42');
        assert.equal(output.source_map.kind, 'tracking_source'); assert.equal(output.source_map.read_only, true);
        assert.equal(output.source_map.node_count, 0); assert.equal(output.source_map.connection_count, 0);
        assert.equal(new Set(output.maps.map(map => map.id)).size, f.expected.length);
        for (const s of f.expected) {
            const map = output.maps.find(map => map.id === s.mapId); assert(map);
            assert.equal(map.name, 'Synthetic map ' + s.mapId); assert.equal(map.revision, REVISION);
            assert.equal(map.read_only, false); assert.equal(map.node_count, s.nodes); assert.equal(map.connection_count, s.links);
            assert.equal(map.pilot_count, 0); assert.equal(map.scope, null);
            assert.equal(map.next_expiry_at, s.links ? expiry : null);
        }
        for (const map of [...output.maps, output.source_map]) for (const key of ['nodes','connections','operations','signatures','comments','pilots'])
            assert.equal(Object.hasOwn(map, key), false, 'Summary must omit operational and geometry payloads');
        return { maps: output.maps.length, nodes: output.maps.reduce((n,m) => n + m.node_count, 0),
            links: output.maps.reduce((n,m) => n + m.connection_count, 0), revision: REVISION, compactSummary: true };
    }
    const maps = scenario.action === 'list' ? output.maps : [output];
    assert.equal(maps.length,scenario.action==='list'?f.expected.length:1);
    if(scenario.action==='list') {
        assert.equal(output.character_id,PILOT);assert.equal(output.source_map.id,'tracking-source-42');
        assert.equal(output.source_map.node_count,0);assert.equal(output.source_map.connection_count,0);
        assert.equal(output.source_map.read_only,true);assert.equal(output.source_map.kind,'tracking_source');
    }
    const byId=new Map(maps.map(map=>[map.id,map]));
    assert.equal(byId.size,maps.length);
    for(const s of scenario.action==='list'?f.expected:[f.expected[0]]) { assert(byId.has(s.mapId));assertMap(byId.get(s.mapId),s); }
    // Full selected object, including access/expiry/operations, must be byte-identical
    // across unrelated-map volumes and both selected/list retrieval paths. Fixed clock.
    if(scenario.family==='independence') {
        const digest=hash(JSON.stringify(byId.get(ACTIVE_MAP)));
        selectedDigest ||= digest;assert.equal(digest,selectedDigest,'Unrelated maps must not change selected-map semantics');
    }
    return { maps:maps.length,nodes:maps.reduce((n,m)=>n+m.nodes.length,0),links:maps.reduce((n,m)=>n+m.connections.length,0),
        signatures:maps.reduce((n,m)=>n+m.signatures.length,0),revision:REVISION,selectedSemanticDigest:scenario.family==='independence'?selectedDigest:null };
}
const selectedCases=cases.filter(s=>!filter||s.name.includes(filter));assert(selectedCases.length,'No matching cases');
if(reverse)selectedCases.reverse();
const results=[];
for(const scenario of selectedCases) {
    if (baseline && scenario.action==='summaries') { results.push({name:scenario.name,family:scenario.family,action:scenario.action,skipped:true,reason:'Compact summaries API is absent in RC16'}); continue; }
    const f=await fixture(scenario.specs);
    const call=()=>scenario.action==='list'?f.service.jspace.state(PILOT):scenario.action==='summaries'?f.service.jspace.summaries(PILOT):f.service.jspace.map(PILOT,ACTIVE_MAP);
    try {
        let output, correctness;
        if(mode==='diagnostics') {
            active={sql:{},json:{parseCalls:0,parseCharacters:0,stringifyCalls:0,stringifyCharacters:0},signatureEdgeScan:{calls:0,predicateVisits:0,firstStack:null},materialization:{linkBodies:0,signatureBodies:0,mapBodies:0,linksByMap:{}}};
            try { output=call(); } finally { var diagnostics=active; active=null; }
            correctness=verifyOutput(output,scenario,f);
            const scoped=scenario.action==='selected'?[f.expected[0]]:f.expected;
            const baselineComparisons=scenario.action==='summaries'?0:scoped.reduce((n,s)=>n+s.signatures*s.links,0);
            assert.equal(diagnostics.signatureEdgeScan.predicateVisits,baseline?baselineComparisons:0,baseline?'RC16 diagnostic must count the exact signature-by-edge filter':'Candidate must not reintroduce the RC16 signature-by-edge filter');
            if (baselineComparisons && baseline) assert(diagnostics.signatureEdgeScan.firstStack.includes('server/universe-jspace.mjs'));
            if (!baseline) {
            const expectedLinks=scoped.reduce((n,s)=>n+s.links,0);
            assert.equal(diagnostics.materialization.linkBodies,expectedLinks,'Each applicable canonical link body crosses SQLite once');
            assert.equal(diagnostics.materialization.signatureBodies,scenario.action==='summaries'?0:scoped.reduce((n,s)=>n+s.signatures,0),'Each applicable signature body crosses SQLite once');
            for (const s of scoped) assert.equal(diagnostics.materialization.linksByMap[s.mapId] || 0,s.links);
            if (scenario.action==='selected') assert.deepEqual(Object.keys(diagnostics.materialization.linksByMap),[ACTIVE_MAP],'Unrelated canonical link bodies remain in SQLite');
            if (scenario.action==='summaries') assert.equal(Object.keys(diagnostics.sql).filter(sql=>sql.includes('universe_operations_records')).length,0,'Compact summaries must not fetch operational records');
            }
            diagnostics.baselineSignatureEdgeComparisons=baselineComparisons;
            const totals=Object.values(diagnostics.sql).reduce((a,b)=>({calls:a.calls+b.calls,rows:a.rows+b.rows,jsonBytes:a.jsonBytes+b.jsonBytes,changes:a.changes+b.changes}),{calls:0,rows:0,jsonBytes:0,changes:0});
            assert.equal(totals.changes,0,'Warm read must not mutate fixture');
            results.push({name:scenario.name,family:scenario.family,action:scenario.action,fixture:f.totals,correctness,
                outputSha256:hash(JSON.stringify(output)),outputBytes:Buffer.byteLength(JSON.stringify(output)),totals,...diagnostics});
        } else {
            for(let warm=0;warm<3;warm++){output=call();verifyOutput(output,scenario,f);}
            const samples=[];
            for(let n=0;n<7;n++) {
                const cpu=process.cpuUsage(),start=performance.now();output=call();const wallMs=performance.now()-start,used=process.cpuUsage(cpu);
                const serialStart=performance.now(),encoded=JSON.stringify(output),outputBytes=Buffer.byteLength(encoded),serializeMs=performance.now()-serialStart;
                // Output checks do not inflate recorded service or serialization time.
                correctness=verifyOutput(output,scenario,f);
                samples.push({wallMs,cpuMs:(used.user+used.system)/1000,serializeMs,outputBytes});
            }
            const sorted=samples.map(s=>s.wallMs).sort((a,b)=>a-b);
            results.push({name:scenario.name,family:scenario.family,action:scenario.action,fixture:f.totals,correctness,
                minMs:sorted[0],medianMs:sorted[3],maxMs:sorted[6],samples});
        }
        process.stderr.write(scenario.name+' verified\n');
    } finally {active=null;await f.close();}
}
assert.equal(networkAttempts,0,'No external requests may occur');
const afterFingerprints=await fingerprints();
assert.deepEqual(afterFingerprints,beforeFingerprints,'Harness and tracked source files must remain unchanged throughout this run');
const testedFiles=afterFingerprints.files;
const git=spawnSync('git',['-C',sourceRoot,'rev-parse','HEAD'],{encoding:'utf8'});
const finalManifest = await verifySource(sourceManifest);
const manifestVerificationAfter = {fingerprint:finalManifest.fingerprint,sourceCommit:finalManifest.sourceCommit,dirty:finalManifest.dirty};
const outputRoot=resolve(process.env.KAIRO_BENCH_OUTPUT || fileURLToPath(new URL('../raw/maps/',import.meta.url)));
await mkdir(outputRoot,{recursive:true});
const destination=join(outputRoot,`maps-${mode}${reverse?'-reverse':''}${filter?'-'+filter:''}.json`);
await writeFile(destination,JSON.stringify({mode,implementation:baseline?'rc16-baseline':'candidate',order:reverse?'reverse':'forward',recordedAt:new Date().toISOString(),referenceSource,sourceManifest,manifestVerificationBefore,manifestVerificationAfter,
    testedSourceRoot:sourceRoot,testedSourceGitHeadBefore:gitBefore.status===0?gitBefore.stdout.trim():null,testedSourceGitHead:git.status===0?git.stdout.trim():null,testedFiles,
    sourceAndHarnessStableDuringRun:true,harnessSha256:afterFingerprints.harness,manifestHelperSha256:afterFingerprints.manifestHelper,lockFile,node:process.version,cpu:cpus()[0]?.model,platform:process.platform,arch:process.arch,
    atlas:{systems:atlas.systems.length,gates:atlas.gates.length,wormholes:wormholes.length},clock:stamp,networkAttempts,
    methodology:mode==='diagnostics'?'One real service invocation per fixture; instrumented SQL and projected-edge filter counts, never latency evidence. Correctness cardinalities, geometry coordinates, binding sets, revisions, access/expiry flags and full selected-object digest asserted. Compact summaries assert metadata without operational payloads. Canonical and signature body materialization counts are asserted.':'Three warmups, seven uninstrumented measurements; serialization separate; checks outside measured durations. Independent reverse-order repeat recommended. maxMs is observed maximum, not an estimated percentile. No forced GC.',
    fixtureNotes:['No user accounts, external collectors, visits, optional feeds, undo, passages, intel, observations or tracked pilots.',
        'Independence holds selected-map records constant while adding 0/7/23 unrelated maps; full-list and compact-summary contrasts repeat identical fixtures.',
        'Constant-links family fixes 720 total canonical links, zero signatures and 60 nodes per map; map/node/document totals vary and are reported.',
        'Dense family uses 100 nodes, 0/100/1000 unbound Data Site signatures and 100/1000 connections. The former S×E filter count is retained as a diagnostic comparison; candidate asserts it is absent. Timing includes larger signature records and output.',
        'Service calls back the existing detail/full-state endpoints and new summaries endpoint. HTTP transport is not included; compiled browser correctness verifies consumer behavior separately.'],results},null,2)+'\n');
console.log(destination);
