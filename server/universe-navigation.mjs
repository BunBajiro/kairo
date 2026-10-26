/**
 * Pilot/map-scoped itinerary persistence and explicit EVE waypoint export.
 * Planning uses server-owned Universe evidence; it never acts on a browser's
 * supplied graph. See docs/UNIVERSE-ROUTING-VALIDATION.md for route semantics.
 */
import {randomUUID} from 'node:crypto';
import {getUniverseStatic} from './universe-static.mjs';
import {JUMP_SHIP_PRESETS,jumpRangeForShip,jumpReachability,alternateJumpMidpoints,createJumpPlanner,estimateJumpFuel,wormholeShipRestriction} from './universe-routing.mjs';
import {parseAnsiblexImport} from './universe-ansiblex.mjs';

export const WAYPOINT_SCOPE='esi-ui.write_waypoint.v1';
export const BRIDGE_SEARCH_SCOPE='esi-search.search_structures.v1';
const STRUCTURE_SCOPE='esi-universe.read_structures.v1';
const iso=n=>new Date(n).toISOString();
const clone=v=>structuredClone(v);
const failure=message=>({status:'invalid',systemIds:[],edges:[],hops:0,cost:null,warnings:[],excluded:[],segments:[],explanation:message});
const PREFERENCES=['mode','useAnsiblex','useWormholes','maxAnsiblexZone','ansiblexZones','avoidSystemIds','avoidHostile','ansiblexRules','shipClass','highSecOnly','avoidLowsec','avoidNullsec','useThera','useTurnur','useZarzakh','shipSize','shipMassKg','allowUnknownWormholeSize'];
const BOOLS=new Set(['useAnsiblex','useWormholes','avoidHostile','highSecOnly','avoidLowsec','avoidNullsec','useThera','useTurnur','useZarzakh','allowUnknownWormholeSize']);

/**
 * Create navigation over shared Store/Auth/ESI. Injected preparePlan provides one
 * request-owned graph and acceptance check; fallback planRoute/planJump callbacks
 * support isolated integrations. now() is epoch ms. Planning/observation are local;
 * only sendWaypoints mutates EVE. Await close() to drain admitted waypoint/search
 * flights; the owner prevents remaining queued commands from starting on shutdown.
 */
export function createUniverseNavigation(store,auth,esi,{atlas=getUniverseStatic(),now=Date.now,planRoute,planJump,preparePlan=null,getOperations=null,getFeeds=()=>null,getRouteSystems=()=>atlas.systems,getMap=null,isConnectionCurrent=null,publish=()=>{},onChange=()=>{}}={}) {
    const systems=atlas.systems,lookup=atlas.bySystemName&&atlas.bySystemId||new Map(systems.map(s=>[s.system_id,s])),names=atlas.bySystemName||new Map(systems.map(s=>[s.name.toLowerCase(),s])),queues=new Map(),searches=new Map();
    let closed=false;
    const assertOpen=()=>{if(closed)throw new Error('Universe navigation is stopping.');};
    const key=(id,mapId=null)=>'universe:navigation:'+id+(mapId?':'+mapId:'');
    function mapScope(id,mapId) {if(mapId!=null&&(typeof mapId!=='string'||typeof getMap==='function'&&!getMap(id,mapId)))throw new Error('Choose a private chain map for this pilot.');return mapId||null;}
    const parseKey=value=>{const parts=value.split(':');return {id:Number(parts[2]),mapId:parts.slice(3).join(':')||null};};
    function pilot(value,required=false){const id=Number(value||0);if(!Number.isSafeInteger(id)||id<0||required&&!id||id&&!auth.characters().some(c=>c.id===id))throw new Error('Choose a connected pilot.');return id;}
    function resolve(value){const s=lookup.get(Number(value))||names.get(String(value||'').trim().toLowerCase());if(!s)throw new Error('Choose a system from the universe catalogue.');return s.system_id;}
    function empty(mapId=null){return {itinerary:{map_id:mapId,revision:0,originId:null,kind:'gate',stops:[],preferences:{mode:'shortest',ansiblexRules:'live'},rangeLy:7,followLocation:false,progress:{completedStopIds:[],lastSystemId:null},updatedAt:null},plan:null,exportStatus:null};}
    const read=(id,mapId=null)=>store.get(key(id,mapId),empty(mapId));
    function save(id,value,quiet=false){mapScope(id,value.itinerary.map_id);store.set(key(id,value.itinerary.map_id),value);onChange(id);if(!quiet)publish({type:'navigation.changed',module:'universe',characterId:id,summary:'Navigation updated',payload:{revision:value.itinerary.revision}});return state(id,value.itinerary.map_id);}
    function capability(id,scopes){const c=auth.characters().find(c=>c.id===id),missing=scopes.filter(s=>!c?.scopes?.includes(s));return {available:!!c&&!c.needsReauth&&!missing.length,scopes,missingScopes:missing,reason:!c?'Connect a pilot.':c.needsReauth?'Reconnect this pilot.':missing.length?'Additional EVE scopes are required.':null};}
    function state(characterId,mapId=null){const id=pilot(characterId),value=read(id,mapScope(id,mapId));return {...clone(value),characterId:id,jumpPresets:JUMP_SHIP_PRESETS,
        capabilities:{waypoints:capability(id,[WAYPOINT_SCOPE]),bridgeSearch:capability(id,[BRIDGE_SEARCH_SCOPE,STRUCTURE_SCOPE])}};}
    // Route results are caches, never a second home for a vanished connection.
    function forgetConnections(characterId, connectionIds) {
        const removed = new Set(connectionIds.map(String));
        if (!removed.size) return;
        const contains = value => value && typeof value === 'object' && (removed.has(String(value.id)) || removed.has(String(value.link_id)) || Object.values(value).some(contains));
        const scopes = store.db.prepare("SELECT key FROM settings WHERE key LIKE 'universe:navigation:%'").all().map(row => parseKey(row.key)).filter(scope=>characterId==null||scope.id===characterId);
        for (const {id,mapId} of scopes) {
            const value = read(id,mapId);
            if (!contains(value.plan)) continue;
            value.plan = null; value.exportStatus = null;
            value.itinerary.revision++; value.itinerary.updatedAt = iso(now());
            store.set(key(id,mapId), value); onChange(id);
        }
    }
    function forgetMissingConnections(isCurrent) {
        for (const row of store.db.prepare("SELECT key FROM settings WHERE key LIKE 'universe:navigation:%'").all()) {
            const {id,mapId} = parseKey(row.key), missing = new Set();
            const inspect = value => {
                if (!value || typeof value !== 'object') return;
                if (value.kind === 'wormhole' && value.id != null && !isCurrent(id, value.id)) missing.add(String(value.id));
                for (const child of Object.values(value)) inspect(child);
            };
            inspect(read(id,mapId).plan); forgetConnections(id, [...missing]);
        }
    }
    function checkRevision(value,input){if(input?.revision!==undefined&&input.revision!==value.itinerary.revision)throw Object.assign(new Error('The itinerary changed. Refresh before editing or sending it.'),{status:409});}
    function validatePlanConnections(id,mapId,result) {
        if (!isConnectionCurrent) return;
        const inspect = value => {
            if (!value || typeof value !== 'object') return;
            if (value.kind === 'wormhole' && value.id != null && !isConnectionCurrent(id,value.id,mapId)) throw Object.assign(new Error('Connections changed during calculation. Calculate the route again.'),{status:409});
            for (const child of Object.values(value)) inspect(child);
        };
        inspect(result);
    }
    function preferences(input={}){
        if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid route preferences.');
        const out={};for(const k of PREFERENCES)if(input[k]!==undefined){if(BOOLS.has(k)&&typeof input[k]!=='boolean')throw new Error(k+' must be true or false.');out[k]=clone(input[k]);}
        if(out.mode!==undefined&&!['shortest','safer','prefer_low'].includes(out.mode))throw new Error('Choose shortest, safer or prefer-lowsec routing.');
        if(out.ansiblexRules!==undefined&&!['live','announced','current'].includes(out.ansiblexRules))throw new Error('Unknown Ansiblex rule model.');
        if(out.avoidSystemIds!==undefined){if(!Array.isArray(out.avoidSystemIds)||out.avoidSystemIds.length>500)throw new Error('Avoid systems must be a list of at most 500 systems.');out.avoidSystemIds=[...new Set(out.avoidSystemIds.map(resolve))];}
        if(out.maxAnsiblexZone!==undefined&&(!Number.isInteger(out.maxAnsiblexZone)||out.maxAnsiblexZone<1||out.maxAnsiblexZone>5))throw new Error('Choose a maximum Ansiblex zone from 1 to 5.');
        if(out.ansiblexZones!==undefined&&(!Array.isArray(out.ansiblexZones)||out.ansiblexZones.some(n=>!Number.isInteger(n)||n<1||n>5)))throw new Error('Invalid Ansiblex zones.');
        if(out.shipSize!=null&&!['small','medium','large','capital','supercapital'].includes(out.shipSize))throw new Error('Unknown ship size.');
        if(out.shipMassKg!==undefined&&out.shipMassKg!==null&&(typeof out.shipMassKg!=='number'||!Number.isFinite(out.shipMassKg)||out.shipMassKg<=0||out.shipMassKg>1e12))throw new Error('Enter an actual ship mass above zero and no greater than one trillion kilograms.');
        if(out.shipClass!==undefined&&(typeof out.shipClass!=='string'||out.shipClass.length>40))throw new Error('Invalid ship class.');
        return out;
    }
    /** Merge an accepted draft into durable pilot/map state and clear its plan.
     * Optional revision is optimistic concurrency (409 on mismatch). Stop UUIDs
     * distinguish repeated visits to one system; preserve progress only for UUIDs
     * whose system is unchanged. At most 50 ordered stops; ranges are EVE LY. */
    function saveItinerary(characterId,input={}){
        assertOpen();const id=pilot(characterId),mapId=mapScope(id,input.map_id),value=read(id,mapId);checkRevision(value,input);const old=value.itinerary;
        if(input.stops!==undefined&&(!Array.isArray(input.stops)||input.stops.length>50))throw new Error('Choose no more than 50 ordered stops.');
        const used=new Set(),stops=(input.stops??old.stops).map(row=>{
            const systemId=resolve(typeof row==='object'?row.systemId??row.system_id:row),provided=typeof row==='object'?row.id:null;
            const stopId=provided||randomUUID();if(typeof stopId!=='string'||!/^[\w-]{1,80}$/.test(stopId)||used.has(stopId))throw new Error('Stop IDs must be unique.');used.add(stopId);
            return {id:stopId,systemId,label:String(row.label||lookup.get(systemId).name).slice(0,120)};
        });
        const kind=input.kind??old.kind;if(!['gate','jump'].includes(kind))throw new Error('Choose gate or jump-drive navigation.');
        if(input.followLocation!==undefined&&typeof input.followLocation!=='boolean')throw new Error('Follow current location must be true or false.');
        let range=Number(input.rangeLy??old.rangeLy),rangePreset=input.rangeLy===undefined?old.rangePreset??null:null;
        if(input.rangePreset){rangePreset=jumpRangeForShip(input.rangePreset);range=rangePreset.rangeLy;}
        if(!Number.isFinite(range)||range<=0||range>20)throw new Error('Choose a physical range from 0 to 20 LY.');
        const completed=old.progress.completedStopIds.filter(stopId=>stops.some(s=>s.id===stopId&&old.stops.some(p=>p.id===stopId&&p.systemId===s.systemId)));
        value.itinerary={...old,map_id:mapId,revision:old.revision+1,originId:input.originId===null?null:input.originId===undefined?old.originId:resolve(input.originId),kind,stops,
            preferences:{...old.preferences,...preferences(input.preferences||{})},rangeLy:range,rangePreset,
            followLocation:input.followLocation===undefined?old.followLocation:input.followLocation===true,
            progress:input.resetProgress?{completedStopIds:[],lastSystemId:null}:{...old.progress,completedStopIds:completed},updatedAt:iso(now())};
        value.plan=null;return save(id,value);
    }
    function removeStop(characterId,stopId,mapId=null){const id=pilot(characterId),value=read(id,mapScope(id,mapId));if(!value.itinerary.stops.some(s=>s.id===stopId))throw new Error('Stop not found.');return saveItinerary(id,{map_id:mapId,stops:value.itinerary.stops.filter(s=>s.id!==stopId)});}
    function reorderStops(characterId,input){const id=pilot(characterId),mapId=mapScope(id,input?.map_id),value=read(id,mapId),ids=Array.isArray(input)?input:input?.stopIds;checkRevision(value,input);
        if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.length!==value.itinerary.stops.length||ids.some(s=>!value.itinerary.stops.some(row=>row.id===s)))throw new Error('Reorder must contain every stop ID exactly once.');
        return saveItinerary(id,{map_id:mapId,stops:ids.map(s=>value.itinerary.stops.find(row=>row.id===s))});}
    function clearItinerary(characterId,mapId=null){const id=pilot(characterId),value=read(id,mapScope(id,mapId)),next=empty(mapId);next.itinerary.revision=value.itinerary.revision+1;next.itinerary.updatedAt=iso(now());return save(id,next);}
    function publicConnections(prefs){
        if(!prefs.useThera&&!prefs.useTurnur)return {links:[],omitted:[]};
        const feeds=getFeeds()||{},links=[],omitted=[];
        for(const row of feeds.connections||[]){
            if(!['thera','turnur'].includes(row.source)||!prefs[row.source==='thera'?'useThera':'useTurnur'])continue;
            const reason=feeds.sources?.[row.source]?.status!=='ready'||row.stale?'Public source is stale or unavailable':!row.completed||!row.reported?'Connection is not fully reported':Date.parse(row.expires_at)<=now()||!Number.isFinite(Date.parse(row.expires_at))?'Public connection has expired':!lookup.has(row.from_system_id)||!lookup.has(row.to_system_id)?'Unknown public endpoint':wormholeShipRestriction(row,prefs,{requireKnownLimit:true});
            if(reason){omitted.push({id:row.id,kind:'wormhole',source:row.source,reason});continue;}
            links.push({...row,kind:'wormhole',enabled:true,accessible:false,confirmed:false,route_eligible:true,access_basis:'public_report',directional:false});
        }
        return {links,omitted};
    }
    /** Calculate remaining stops with one prepared graph/grid, then save only if
     * itinerary and route evidence still match. Incomplete legs return invalid or
     * no_route with segment diagnostics; they are not a successful partial route.
     * Revisions/evidence changing during awaits reject with 409. followLocation
     * requires a fresh selected source, never durable progress as current position. */
    async function plan(characterId,input={}){
        assertOpen();const id=pilot(characterId),mapId=mapScope(id,input.map_id),value=read(id,mapId);checkRevision(value,input);const itinerary=value.itinerary,revision=itinerary.revision;
        const pending=itinerary.stops.filter(s=>!itinerary.progress.completedStopIds.includes(s.id));
        const completed=itinerary.stops.filter(s=>itinerary.progress.completedStopIds.includes(s.id));
        let from=completed.at(-1)?.systemId??itinerary.originId;
        if(itinerary.followLocation){
            if(typeof getOperations==='function') {
                // Production uses the canonical selected location source, never persisted progress as current position.
                const location=getOperations(id)?.location,expires=Date.parse(location?.expires_at);
                from=location?.status==='ready'&&location.stale!==true&&Number.isFinite(expires)&&expires>now()&&lookup.has(Number(location.system_id))?Number(location.system_id):null;
            }else {
                // Isolated/manual integrations without an operations provider may use only a recent explicit observation.
                const observed=Date.parse(itinerary.progress.lastObservedAt),age=now()-observed;
                from=Number.isFinite(observed)&&age>=0&&age<300000&&lookup.has(itinerary.progress.lastSystemId)?itinerary.progress.lastSystemId:null;
            }
            if(!from){value.plan={...failure('Fresh pilot location is unavailable. Wait for the selected location source, or turn off follow location and choose a manual origin.'),revision,generatedAt:iso(now())};save(id,value);return clone(value.plan);}
        }
        if(!from||!pending.length){value.plan=failure(!from?'Choose an origin.':'Add an uncompleted destination.');save(id,value);return clone(value.plan);}
        const publicData=publicConnections(itinerary.preferences),prefs={...itinerary.preferences};
        const planningInput={map_id:mapId,kind:itinerary.kind,rangeLy:itinerary.rangeLy,preferences:prefs,extraConnections:publicData.links};
        const prepared=typeof preparePlan==='function'?await preparePlan(id,planningInput):null;
        const callback=prepared?.plan?(_id,leg)=>prepared.plan(leg):itinerary.kind==='jump'?planJump:planRoute;
        if(typeof callback!=='function')throw new Error('Route planner is unavailable.');
        let alternatePlanner;
        const alternatives=endpoints=>prepared?.alternateMidpoints?prepared.alternateMidpoints(endpoints):(alternatePlanner||=createJumpPlanner({systems:prepared?.systems||getRouteSystems(id),rangeLy:itinerary.rangeLy,preferences:prefs})).alternateMidpoints(endpoints);
        const segments=[],systemIds=[from],edges=[],warnings=new Set(),excluded=[...publicData.omitted];let originId=from,cost=0;
        for(const [index,stop] of pending.entries()){
            assertOpen();
            const result=await callback(id,{...planningInput,originId,destinationId:stop.systemId});
            assertOpen();
            const segment={index,stopId:stop.id,fromSystemId:originId,toSystemId:stop.systemId,...result};segments.push(segment);
            for(const warning of result.warnings||[])warnings.add(warning);excluded.push(...result.excluded||[]);
            if(result.status!=='ok'){
                const failed={...failure('No complete itinerary: '+(lookup.get(originId)?.name||originId)+' → '+stop.label+'. '+(result.explanation||'')),status:result.status,segments,failedSegment:index,warnings:[...warnings],excluded,revision,generatedAt:iso(now())};
                if(read(id,mapId).itinerary.revision!==revision)throw Object.assign(new Error('Itinerary changed during calculation.'),{status:409});prepared?.validate?.(failed);validatePlanConnections(id,mapId,failed);value.plan=failed;save(id,value);return clone(failed);
            }
            systemIds.push(...result.systemIds.slice(1));edges.push(...result.edges);cost+=result.cost||0;originId=stop.systemId;
        }
        const result={status:'ok',systemIds,edges,hops:edges.length,cost,segments,warnings:[...warnings],excluded,revision,generatedAt:iso(now()),
            totalDistanceLy:itinerary.kind==='jump'?edges.reduce((sum,e)=>sum+(e.distance_ly||0),0):null,explanation:'Ordered itinerary through '+pending.length+' remaining stops.',
            alternateMidpoints:itinerary.kind==='jump'?segments.flatMap(segment=>segment.systemIds.slice(1,-1).map((mid,i)=>({segmentIndex:segment.index,stopId:segment.stopId,routeIndex:i+1,midpointSystemId:mid,fromSystemId:segment.systemIds[i],toSystemId:segment.systemIds[i+2],candidates:alternatives({originId:segment.systemIds[i],destinationId:segment.systemIds[i+2]}).filter(s=>s.systemId!==mid)}))):[]};
        if(input.fuel&&itinerary.kind==='jump')result.fuel=estimateJumpFuel(edges,input.fuel);
        if(read(id,mapId).itinerary.revision!==revision)throw Object.assign(new Error('Itinerary changed during calculation.'),{status:409});
        prepared?.validate?.(result);
        validatePlanConnections(id,mapId,result);
        value.plan=result;save(id,value);return clone(result);
    }
    function observeLocation(characterId,location,mapId=null){
        if(closed)return state(characterId,mapId);
        const id=pilot(characterId),value=read(id,mapId),itinerary=value.itinerary;
        if(location==null||typeof location==='object'&&(location.status&&location.status!=='ready'||location.stale===true))return state(id,mapId);
        const systemId=Number(typeof location==='object'?location.system_id??location.solar_system_id:location);
        if(!lookup.has(systemId)||systemId===itinerary.progress.lastSystemId)return state(id,mapId);
        const next=itinerary.stops.find(s=>!itinerary.progress.completedStopIds.includes(s.id));
        const reached=next?.systemId===systemId;itinerary.progress={...itinerary.progress,lastSystemId:systemId,lastObservedAt:iso(now()),completedStopIds:reached?[...itinerary.progress.completedStopIds,next.id]:itinerary.progress.completedStopIds};
        itinerary.revision++;if(reached||itinerary.followLocation)value.plan=null;itinerary.updatedAt=iso(now());
        return save(id,value,true);
    }
    /** Advance only the next stop occurrence on subscribed maps. Wormhole
     * positions stay map-scoped and never update the K-Space itinerary. This emits
     * invalidation through onChange without producing navigation activity events. */
    function observeAllLocations(characterId,location) {
        const id=pilot(characterId),scopes=store.db.prepare("SELECT key FROM settings WHERE key LIKE 'universe:navigation:%'").all().map(row=>parseKey(row.key)).filter(scope=>scope.id===id);
        for(const scope of scopes) {
            if(!scope.mapId) continue;
            const map=getMap?.(id,scope.mapId);
            if(map?.pilots?.some(row=>row.character_id===id&&row.tracking!==false)) observeLocation(id,location,scope.mapId);
        }
        const systemId=Number(typeof location==='object'?location?.system_id??location?.solar_system_id:location);
        if(lookup.get(systemId)?.space==='wormhole') return state(id);
        return observeLocation(id,location);
    }
    function waypointTargets(result){
        const targets=[];const add=(destinationId,systemId,kind,source=null)=>{if(targets.at(-1)?.destinationId===destinationId)return;targets.push({destinationId,systemId,kind,source});};
        for(const edge of result.edges){
            if(edge.kind==='ansiblex')add(edge.structure_id||edge.from_system_id,edge.from_system_id,edge.structure_id?'structure':'system',edge.source||'private_connection');
            if(edge.kind==='wormhole'||edge.kind==='jump')add(edge.from_system_id,edge.from_system_id,'system',edge.kind);
            add(edge.to_system_id,edge.to_system_id,'system',edge.kind);
        }
        if(!targets.length&&result.systemIds.length)add(result.systemIds.at(-1),result.systemIds.at(-1),'system');
        return targets;
    }
    /** Queue an explicit append/replace batch per pilot, never coalescing sends.
     * Capture login ownership at admission; replan and recheck itinerary/scope
     * before commands. Only the first dispatch in replace mode clears
     * existing waypoints. A failed dispatch stops the batch and returns sent count,
     * partial/error status and uncertain where ESI cannot establish acceptance;
     * no automatic retry can safely assume that a mutation did not happen. */
    function sendWaypoints(characterId,input={}){
        assertOpen();const id=pilot(characterId,true),mapId=mapScope(id,input.map_id);if(typeof input.replace!=='boolean')throw new Error('Explicitly choose append or replace for EVE waypoints.');
        const connection=auth.connectionRevision?.(id)??0;
        const assertConnection=()=>{if((auth.connectionRevision?.(id)??0)!==connection)throw Object.assign(new Error('Pilot connection changed; remaining EVE commands were stopped.'),{status:409});};
        const task=(queues.get(id)||Promise.resolve()).catch(()=>{}).then(async()=>{
            assertOpen();assertConnection();
            const capabilityState=capability(id,[WAYPOINT_SCOPE]);if(!capabilityState.available)throw new Error(capabilityState.reason);
            checkRevision(read(id,mapId),input);const result=await plan(id,{map_id:mapId});if(result.status!=='ok')throw new Error('Calculate a complete itinerary before sending waypoints.');
            const revision=result.revision,targets=waypointTargets(result);if(targets.length>500)throw new Error('This route exceeds the 500-waypoint export limit. Split the itinerary.');
            const output={status:'sending',sent:0,total:targets.length,targets,replace:input.replace,revision,startedAt:iso(now()),warnings:result.edges.some(e=>['wormhole','jump'].includes(e.kind))?['EVE waypoints do not execute wormhole or jump-drive travel. Follow those legs manually.']:[]};
            for(const [index,target] of targets.entries()){
                try {
                    assertOpen();assertConnection();
                    if(read(id,mapId).itinerary.revision!==revision)throw new Error('Itinerary changed; remaining EVE commands were stopped.');
                    const c=capability(id,[WAYPOINT_SCOPE]);if(!c.available)throw new Error(c.reason);
                    if(typeof esi.mutate!=='function')throw new Error('ESI command transport is unavailable.');
                    await esi.mutate('/ui/autopilot/waypoint?'+new URLSearchParams({destination_id:String(target.destinationId),clear_other_waypoints:String(input.replace&&index===0),add_to_beginning:'false'}),{characterId:id,method:'POST'});
                    output.sent++;
                } catch(error){output.status=output.sent?'partial':'error';output.failedIndex=index;output.error=error.message;output.uncertain=error.uncertain===true;output.retryAt=error.retryAt||null;break;}
            }
            if(output.sent===output.total)output.status='sent';output.completedAt=iso(now());const value=read(id,mapId);value.exportStatus=output;save(id,value);return clone(output);
        });
        queues.set(id,task);task.finally(()=>{if(queues.get(id)===task)queues.delete(id);}).catch(()=>{});return task;
    }
    function reachability(characterId,input={}){
        const id=pilot(characterId),routeSystems=getRouteSystems(id),prefs=preferences(input.preferences||{});
        if(!Array.isArray(input.origins)||input.origins.length>8)throw new Error('Choose between one and eight jump origins.');
        const origins=input.origins.map(o=>({systemId:resolve(o.systemId),rangeLy:o.rangePreset?jumpRangeForShip(o.rangePreset).rangeLy:Number(o.rangeLy)}));
        const result=jumpReachability({systems:routeSystems,origins,preferences:prefs});
        if(result.status==='ok'&&input.destinationId&&origins.length)result.alternateMidpoints=alternateJumpMidpoints({systems:routeSystems,originId:origins[0].systemId,destinationId:resolve(input.destinationId),rangeLy:origins[0].rangeLy,preferences:prefs});
        return result;
    }
    /** Resolve at most 100 visible Ansiblex candidates, serially through ESI.
     * Same query/login requests share work; stale visibility or connection changes
     * cannot confirm access. Return an import preview with per-structure issues;
     * candidates remain inaccessible until the user confirms the connection. */
    async function discoverBridges(characterId,{query=' » '}={}){
        assertOpen();const id=pilot(characterId,true),c=capability(id,[BRIDGE_SEARCH_SCOPE,STRUCTURE_SCOPE]);if(!c.available)throw new Error(c.reason);
        if(typeof query!=='string'||query.length<3||query.length>100)throw new Error('Bridge search must contain between 3 and 100 characters.');
        const connection=auth.connectionRevision?.(id)??0;
        const assertSearch=()=>{
            assertOpen();
            if((auth.connectionRevision?.(id)??0)!==connection)throw Object.assign(new Error('Pilot connection changed during bridge discovery.'),{status:409});
            const current=capability(id,[BRIDGE_SEARCH_SCOPE,STRUCTURE_SCOPE]);if(!current.available)throw new Error(current.reason);
        };
        const searchKey=JSON.stringify([id,connection,query]);if(searches.has(searchKey))return searches.get(searchKey);
        const task=(async()=>{
            const result=await esi.request('/characters/'+id+'/search?'+new URLSearchParams({categories:'structure',search:query,strict:'false'}),{characterId:id,ttl:300});
            assertSearch();
            if(result.stale)throw new Error('Current bridge search is unavailable; cached matches cannot confirm visibility.');
            const ids=[...new Set(result.data?.structure||[])],rows=[],issues=[];
            for(const structure of ids.slice(0,100)){
                assertSearch();
                try {const sample=await esi.request('/universe/structures/'+structure,{characterId:id,ttl:3600});
                    assertSearch();
                    if(sample.stale)throw new Error('Structure visibility is stale.');const s=sample.data;
                    if(s?.type_id!==35841)continue;
                    const match=String(s.name||'').match(/^(.+?)\s+»\s+(.+?)(?:\s+-\s+.*)?$/);if(!match)throw new Error('Ansiblex name does not identify both systems.');
                    const from=resolve(match[1]),to=resolve(match[2]);if(from!==s.solar_system_id)throw new Error('Structure name origin differs from its reported solar system.');
                    rows.push({from_system_id:from,to_system_id:to,structure_id:structure,directional:true,label:s.name,accessible:false});
                }catch(error){assertSearch();issues.push({structureId:structure,message:error.message});}
            }
            assertSearch();
            const parsed=parseAnsiblexImport({links:rows},systems);return {...parsed,issues:[...parsed.issues,...issues],valid:!parsed.issues.length&&!issues.length,
                source:'esi-search',reportedAt:iso(now()),truncated:ids.length>100,totalMatches:ids.length,limitation:'Visible structures are candidates only. Confirm bridge pairing and access before enabling routing.'};
        })().finally(()=>searches.delete(searchKey));searches.set(searchKey,task);return task;
    }
    return {state,saveItinerary,removeStop,reorderStops,clearItinerary,plan,observeLocation:observeAllLocations,sendWaypoints,reachability,discoverBridges,forgetConnections,forgetMissingConnections,
        async close(){closed=true;await Promise.allSettled([...queues.values(),...searches.values()]);}};
}
