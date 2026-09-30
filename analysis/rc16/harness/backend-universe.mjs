// Internal RC16 checkpoint only. Never import from production or ship this harness.
// Synthetic local pilot data + bundled public SDE; all external IO is rejected.
// diagnostics counts SQL/JSON work, timings measures uninstrumented workload latency.
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir, cpus } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../../server/store.mjs';
import { createUniverse } from '../../../server/universe.mjs';
import { getUniverseStatic } from '../../../server/universe-static.mjs';
import { planRoute, planJumpRoute } from '../../../server/universe-routing.mjs';

const mode = process.argv[2] || 'diagnostics';
if (!['diagnostics', 'timings'].includes(mode)) throw new Error('Use diagnostics or timings');
const filter = process.argv.slice(3).find(arg=>!arg.startsWith('--')) || '';
const reverse = process.argv.includes('--reverse');
const AT = Date.parse('2026-09-30T09:00:00.000Z'), id = 42;
const sample = data => ({status:'ready', data, updatedAt:new Date(AT).toISOString(), expiresAt:new Date(AT + 3600000).toISOString()});
const atlas = getUniverseStatic(), known = atlas.systems.filter(s => s.space === 'known'), wormholes = atlas.systems.filter(s => s.space === 'wormhole');
const targets = [30000142, 30002187, 30002659, 30002510, 30002053]; // Jita/Amarr/Dodixie/Rens/Hek
let active = null, networkAttempts = 0;
const blockNetwork = async () => { networkAttempts++; throw new Error('Unexpected network request in offline benchmark'); };
globalThis.fetch = blockNetwork;
if (mode === 'diagnostics') {
    const prepare = DatabaseSync.prototype.prepare;
    DatabaseSync.prototype.prepare = function(sql, ...args) {
        const statement = prepare.call(this, sql, ...args);
        return new Proxy(statement, { get(target, key) {
            const value = Reflect.get(target, key, target);
            if (typeof value !== 'function') return value;
            if (!['get','all','run'].includes(key)) return value.bind(target);
            return (...params) => {
                const output = value.apply(target, params);
                if (active) {
                    const label = sql + (sql.includes('FROM universe_records WHERE character_id=? AND kind=? ORDER') ? ' [kind=' + params[1] + ']' : '');
                    const metric = active[label] ||= {calls:0, rows:0, jsonBytes:0, changes:0};
                    metric.calls++;
                    if (key === 'run') metric.changes += Number(output.changes || 0);
                    else for (const row of key === 'all' ? output : output ? [output] : []) {
                        metric.rows++;
                        for (const field of ['body','value']) if (typeof row[field] === 'string') metric.jsonBytes += Buffer.byteLength(row[field]);
                    }
                }
                return output;
            };
        }});
    };
}

async function fixture({visits=0, maps=0, nodes=100, links=99}={}) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-rc16-backend-'));
    const store = openStore(dir);
    const auth = {characters:() => [{id, name:'Synthetic pilot', scopes:['esi-location.read_location.v1']}]};
    for (const key of ['sovereignty','kills','jumps','fw','incursions','industry_systems','sovereignty_structures','sovereignty_campaigns']) store.saveSnapshot(0,key,sample([]));
    store.saveSnapshot(0,'sovereignty',sample(known.filter(s => s.security <= 0).map((s,i) => ({system_id:s.system_id, alliance_id:99000000 + i%80}))));
    store.saveSnapshot(0,'kills',sample(known.map((s,i) => ({system_id:s.system_id,ship_kills:i%10,pod_kills:i%3,npc_kills:i%300}))));
    store.saveSnapshot(0,'jumps',sample(known.map((s,i) => ({system_id:s.system_id,ship_jumps:i%200}))));
    store.saveSnapshot(id,'profile',sample({corporation_id:98000000, alliance_id:99000000}));
    store.saveSnapshot(id,'location',sample({solar_system_id:targets[0]}));
    for (const key of ['contacts','corporation_contacts','alliance_contacts','calendar','mining']) store.saveSnapshot(id,key,{...sample([]),ownerId:key==='corporation_contacts'?98000000:99000000});
    const service = createUniverse(store,auth,{request:blockNetwork},{staticData:atlas, now:()=>AT, noSync:true, feeds:{fetcher:blockNetwork}});
    const putVisit = store.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)');
    const put = store.db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?)');
    const putOps = store.db.prepare('INSERT INTO universe_operations_records VALUES(?,?,?,?,?)');
    store.db.exec('BEGIN');
    try {
        for (let i=0; i<visits; i++) { const system=known[i%known.length]; putVisit.run(id,system.system_id,system.name,new Date(AT-i*120000).toISOString()); }
        for (let index=0; index<maps; index++) {
            const mapId='bench-map-'+index, stamp=new Date(AT).toISOString(), map={id:mapId,name:'Synthetic map '+index,description:'',scope:null,scope_version:2,revision:1,created_at:stamp,updated_at:stamp,
                nodes:wormholes.slice(0,nodes).map((s,i)=>({system_id:s.system_id,x:i*100,y:0,locked:false,alias:'',role:'',status:'unknown',tags:[]})),
                connections:[],passages:[],observations:[],comments:[],pings:[],activity:[],pilots:[]};
            for (let j=0;j<nodes;j++) {
                const signature={id:mapId+'-sig-'+j,map_id:mapId,system_id:wormholes[j].system_id,signature_id:'AAA-'+String(j).padStart(3,'0'),name:'Synthetic signature',type:'Wormhole',first_seen_at:stamp,last_seen_at:stamp};
                putOps.run(id,'signature:map:'+mapId,signature.id,JSON.stringify(signature),stamp);
            }
            for (let j=0;j<links;j++) {
                const from=j%nodes,to=(j+1)%nodes,linkId=mapId+'-link-'+j;
                const link={id:linkId,map_id:mapId,kind:'wormhole',from_system_id:wormholes[from].system_id,to_system_id:wormholes[to].system_id,
                    from_signature_record_id:mapId+'-sig-'+from,to_signature_record_id:mapId+'-sig-'+to,enabled:true,confirmed:true,accessible:true,life_status:'stable',life_band:'over_day',mass:'stable',
                    expires_at:new Date(AT+16*3600000).toISOString(),updated_at:stamp};
                put.run(id,'link',linkId,JSON.stringify(link),stamp);
                map.connections.push({id:mapId+'-edge-'+j,link_id:linkId,kind:'wormhole',from_system_id:link.from_system_id,to_system_id:link.to_system_id});
            }
            put.run(id,'jspace_map',mapId,JSON.stringify(map),stamp);
        }
        store.db.exec('COMMIT');
    } catch (error) {store.db.exec('ROLLBACK');throw error;}
    // Seed the lazily-created empty discovery map outside the measured request.
    service.jspace.state(id);
    return {store,service,async close(){await service.close();store.close();await rm(dir,{recursive:true,force:true});}};
}

const cases = [
    ...[0,10000,100000].map(visits=>({name:'universe-state-'+visits+'-visits',data:{visits},run:f=>f.service.state(id)})),
    ...[1,8,24].map(maps=>({name:'jspace-state-'+maps+'-maps',data:{maps},run:f=>f.service.jspace.state(id)})),
    {name:'jspace-map-1-of-24',data:{maps:24},run:f=>f.service.jspace.map(id,'bench-map-0')},
    {name:'universe-tick-24-maps',data:{maps:24},run:f=>f.service.tick()},
    {name:'gate-route-pure',data:{},run:()=>planRoute({systems:atlas.systems,gates:atlas.gates,originId:targets[0],destinationId:targets[1]})},
    ...[0,100000].map(visits=>({name:'gate-route-service-'+visits+'-visits',data:{visits},run:f=>f.service.route(id,{originId:targets[0],destinationId:targets[1]})})),
    ...[1,10,50].map(stops=>({name:'navigation-'+stops+'-stops',data:{visits:10000},setup:f=>f.service.navigation.saveItinerary(id,{originId:targets[0],stops:Array.from({length:stops},(_,i)=>({id:'stop-'+i,systemId:targets[(i+1)%targets.length]}))}),run:f=>f.service.navigation.plan(id)})),
    {name:'jump-route-pure',data:{},run:()=>planJumpRoute({systems:atlas.systems,originId:30000142,destinationId:30001161,rangeLy:7})},
];
const results = [], queryPlans = {};
const selected=cases.filter(s=>!filter || s.name.includes(filter));
if(reverse)selected.reverse();
for (const scenario of selected) {
    const f=await fixture(scenario.data);
    try {
        await scenario.setup?.(f);
        let output;
        if (mode==='diagnostics') {
            active={};
            output=await scenario.run(f);
            const sql=active;active=null;
            results.push({name:scenario.name,fixture:scenario.data,outputBytes:Buffer.byteLength(JSON.stringify(output)),status:output?.status || null,
                totals:Object.values(sql).reduce((a,b)=>({calls:a.calls+b.calls,rows:a.rows+b.rows,jsonBytes:a.jsonBytes+b.jsonBytes,changes:a.changes+b.changes}),{calls:0,rows:0,jsonBytes:0,changes:0}),sql});
        } else {
            for(let n=0;n<3;n++)await scenario.run(f);
            const measures=[];
            for(let n=0;n<9;n++) {
                const cpu=process.cpuUsage(),start=performance.now();output=await scenario.run(f);const wallMs=performance.now()-start,used=process.cpuUsage(cpu);
                const serialStart=performance.now(),bytes=Buffer.byteLength(JSON.stringify(output));
                measures.push({wallMs,cpuMs:(used.user+used.system)/1000,serializeMs:performance.now()-serialStart,outputBytes:bytes});
            }
            const sorted=measures.map(x=>x.wallMs).sort((a,b)=>a-b);
            results.push({name:scenario.name,fixture:scenario.data,status:output?.status||null,minMs:sorted[0],medianMs:sorted[4],p95Ms:sorted[8],samples:measures});
        }
        if(mode==='diagnostics' && scenario.name==='universe-state-100000-visits') {
            const plans = [
                ['overlayVisits','SELECT system_id,COUNT(*) visits,MIN(at) first_visit,MAX(at) last_visit FROM visits WHERE character_id=? GROUP BY system_id',[id]],
                ['journeyVisits',`SELECT v.system_id,COALESCE(u.name,v.name) name,COUNT(*) visits,MIN(v.at) first,MAX(v.at) last,u.constellation_id,u.constellation_name,u.region_id,u.region_name,u.security,u.x,u.y,u.z,n.status,n.tags,n.body AS annotation FROM visits v LEFT JOIN universe_systems u USING(system_id) LEFT JOIN place_notes n ON n.kind='system' AND n.entity_id=v.system_id WHERE character_id=? GROUP BY v.system_id ORDER BY last DESC`,[id]],
                ['nextWormholeExpiry',"SELECT json_extract(body,'$.expires_at') expires_at FROM universe_records WHERE kind='link' AND json_extract(body,'$.kind')='wormhole' AND julianday(json_extract(body,'$.expires_at')) IS NOT NULL ORDER BY julianday(json_extract(body,'$.expires_at')) LIMIT 1",[]],
                ['pilotLinks','SELECT body FROM universe_records WHERE character_id=? AND kind=? ORDER BY updated_at DESC,id',[id,'link']],
            ];
            for(const [name,sql,params] of plans)queryPlans[name]={sql,plan:f.store.db.prepare('EXPLAIN QUERY PLAN '+sql).all(...params)};
        }
        process.stderr.write(scenario.name+' done\n');
    } finally {active=null;await f.close();}
}
if(networkAttempts)throw new Error(networkAttempts+' unexpected external requests');
const destination=new URL('../raw/backend-'+mode+(filter?'-'+filter:'')+(reverse?'-reverse':'')+'.json',import.meta.url);
await mkdir(new URL('../raw/',import.meta.url),{recursive:true});
await writeFile(destination,JSON.stringify({mode,order:reverse?'reverse':'forward',recordedAt:new Date().toISOString(),node:process.version,cpu:cpus()[0]?.model,arch:process.arch,platform:process.platform,
    sourceCommit:'57c8dcc7fbd8fc2b62129498d1819050c78381a1',fixture:{clock:new Date(AT).toISOString(),systems:atlas.systems.length,known:known.length,wormhole:wormholes.length,gates:atlas.gates.length,nodesPerMap:100,linksPerMap:99,signaturesPerMap:100},
    methodology:mode==='diagnostics'?'Single workload invocation with SQL instrumentation; not latency evidence. Reads count emitted rows and body/value bytes, not SQLite pages or physical IO.':'Three warmups, nine uninstrumented measurements. Wall excludes JSON serialization (separately sampled). p95 is nearest-rank maximum with n=9; descriptive only. No GC forcing. Linux synthetic fixture, not user-machine telemetry.',
    networkAttempts,queryPlans,results},null,2)+'\n');
console.log(destination.pathname);
