/** Nearest-service/exit search for a selected private map. Shared routing rules
 * decide eligible edges; the dated destination catalogue identifies candidates,
 * never current services, docking rights or live NPC orders. */
import {readFileSync} from 'node:fs';
import {buildTravelGraph,wormholeShipRestriction} from './universe-routing.mjs';

export const DESTINATION_CATEGORIES = Object.freeze([
    {id:'highsec',label:'High-sec exit'}, {id:'lowsec',label:'Low-sec exit'},
    {id:'trade_hubs',label:'Trade hubs'}, {id:'blue_loot',label:'Blue-loot buyers'},
    {id:'red_loot',label:'Red-loot buyers'}, {id:'security_status',label:'Security-status services'},
    {id:'thera',label:'Thera entrances'}, {id:'turnur',label:'Turnur entrances'},
].map(Object.freeze));
let catalogue;
/** Read the bundled reference once and return a detached copy. Disk/JSON failures
 * throw; this supplementary catalogue is not refreshed by an official SDE update. */
export function destinationCatalogue(){
    if(!catalogue)catalogue=JSON.parse(readFileSync(new URL('./data/universe-destinations.json',import.meta.url),'utf8'));
    return structuredClone(catalogue);
}
const systemId=row=>Number(row.system_id??row.id);
const securityOf=row=>row.security_known===false||row.security===null||row.security===undefined?null:Number(row.security);
const bandMatches=(row,band)=>{const sec=securityOf(row);return band==='any'||Number.isFinite(sec)&&row.space!=='wormhole'&&(band==='high'?sec>=.45:sec>0&&sec<.45);};
// A deliberately saved private observation keeps reported_source as attribution.
// Only raw provider records must go through the checked public-feed path.
const isPublic=row=>row.reported===true||['thera','turnur'].includes(row.source);

/** Public reports are reusable observations, never silently promoted to private confirmation. */
function publicReports(feeds,lookup,preferences,now){
    const usable=[],excluded=[];
    for(const row of feeds?.connections||[]){
        if(!['thera','turnur'].includes(row.source))continue;
        const meta=feeds.sources?.[row.source],expiry=Date.parse(row.expires_at),sourceExpiry=Date.parse(meta?.expiresAt);
        const from=lookup.get(Number(row.from_system_id)),to=lookup.get(Number(row.to_system_id));
        const hub=row.source==='thera'?'Thera':'Turnur';
        const reason=meta?.status!=='ready'||meta?.stale===true||row.stale===true||Number.isFinite(sourceExpiry)&&sourceExpiry<=now?'Public source is stale or unavailable':
            row.completed!==true||row.reported!==true?'Public connection is incomplete':
            !Number.isFinite(expiry)||expiry<=now?'Public connection is expired or has no valid expiry':
            !from||!to||from===to||from.name!==hub&&to.name!==hub?'Unknown or mismatched public hub endpoints':
            wormholeShipRestriction(row,preferences,{requireKnownLimit:true});
        if(reason){excluded.push({id:row.id,kind:'wormhole',source:row.source,reason});continue;}
        usable.push({...row,kind:'wormhole',enabled:true,accessible:false,confirmed:false,route_eligible:true,directional:false});
    }
    return {usable,excluded};
}

// A single bounded Dijkstra traversal serves every candidate. Reuses the production
// travel graph's direction, hull, mass, exclusions, sovereignty and weighted costs.
class Queue{
    items=[];
    less(a,b){return a.cost!==b.cost?a.cost<b.cost:a.hops!==b.hops?a.hops<b.hops:a.id<b.id;}
    push(value){let i=this.items.length;this.items.push(value);while(i){const p=(i-1)>>1;if(!this.less(value,this.items[p]))break;this.items[i]=this.items[p];i=p;}this.items[i]=value;}
    pop(){const first=this.items[0],last=this.items.pop();if(this.items.length){let i=0;while(i*2+1<this.items.length){let c=i*2+1;if(c+1<this.items.length&&this.less(this.items[c+1],this.items[c]))c++;if(!this.less(this.items[c],last))break;this.items[i]=this.items[c];i=c;}this.items[i]=last;}return first;}
}

/** Read-only search over server-owned pilot/map/feed context (now is epoch ms).
 * Validate category/security and a result limit of 1–10, then run one Dijkstra
 * traversal for all candidates. Return ok/no_route, exact route edges, reference
 * provenance and up to 100 exclusion reasons; invalid requests throw. The default
 * reference is loaded lazily from disk, but no network or database writes occur.
 */
export function findNearestDestinations({systems=[],gates=[],connections=[],feeds={},preferences={},originId,category='highsec',limit=5,security='any',now=Date.now(),reference=destinationCatalogue()}={}){
    if(!DESTINATION_CATEGORIES.some(row=>row.id===category))throw new Error('Choose a supported destination category.');
    if(!Number.isInteger(limit)||limit<1||limit>10)throw new Error('Choose between one and ten destination results.');
    if(!['any','high','low'].includes(security))throw new Error('Choose any, high or low destination security.');
    if(!preferences||typeof preferences!=='object'||Array.isArray(preferences))throw new Error('Invalid route preferences.');
    for(const name of ['useWormholes','useAnsiblex','useThera','useTurnur','useZarzakh','includeCritical','includeEol','avoidHostile','avoidLowsec','avoidNullsec','highSecOnly','allowUnknownWormholeSize'])if(preferences[name]!==undefined&&typeof preferences[name]!=='boolean')throw new Error(name+' must be true or false.');
    if(preferences.mode!==undefined&&!['shortest','safer','prefer_low'].includes(preferences.mode))throw new Error('Choose a supported route preference.');
    if(preferences.shipMassKg!=null&&(typeof preferences.shipMassKg!=='number'||!Number.isFinite(preferences.shipMassKg)||preferences.shipMassKg<=0||preferences.shipMassKg>1e12))throw new Error('Enter a valid fitted ship mass.');
    if(preferences.shipSize!=null&&!['small','medium','large','capital','supercapital'].includes(preferences.shipSize))throw new Error('Choose a supported vessel size.');
    if(preferences.avoidSystemIds!==undefined&&(!Array.isArray(preferences.avoidSystemIds)||preferences.avoidSystemIds.length>500))throw new Error('Avoid systems must be a list of at most 500 IDs.');
    if(!Number.isFinite(now))throw new Error('Invalid route observation time.');
    const rows=systems instanceof Map?[...systems.values()]:systems,lookup=new Map(rows.map(row=>[systemId(row),row])),origin=Number(originId);
    if(!lookup.has(origin))throw new Error('Choose an origin from the universe catalogue.');
    const reports=publicReports(feeds,lookup,preferences,now),publicLinks=reports.usable.filter(row=>preferences[row.source==='thera'?'useThera':'useTurnur']===true);
    const privateLinks=[],extraExcluded=[];
    for(const row of connections){
        if(isPublic(row))continue; // Public evidence must enter through the checked provider snapshot.
        const reason=row.confirmed!==true?'Connection is not confirmed':row.active===false||row.list_enabled===false?'Connection or its list is inactive':
            row.collapsed===true||row.life==='collapsed'||row.life_status==='collapsed'||row.status==='collapsed'?'Connection is recorded collapsed':
            preferences.includeCritical!==true&&row.mass==='critical'?'Critical mass is excluded':
            preferences.includeEol!==true&&[row.life,row.life_status,row.status].some(value=>value==='eol'||value==='critical')?'End-of-life connection is excluded':null;
        if(reason){extraExcluded.push({id:row.id,kind:row.kind,reason});continue;}
        privateLinks.push(row);
    }
    const graph=buildTravelGraph({systems:rows,gates,connections:[...privateLinks,...publicLinks],preferences,now});
    const candidates=new Map(),sourceCategory=reference.categories?.[category];
    if(sourceCategory){
        for(const entry of sourceCategory.systems||[]){const system=lookup.get(entry.systemId);if(system&&bandMatches(system,security))candidates.set(entry.systemId,entry);}
    }else if(category==='highsec'||category==='lowsec'){
        for(const [id,system] of lookup)if(bandMatches(system,category==='highsec'?'high':'low')&&bandMatches(system,security))candidates.set(id,{systemId:id,stations:[]});
    }else{
        const hub=category==='thera'?'Thera':'Turnur';
        for(const report of reports.usable.filter(row=>row.source===category)){
            const id=lookup.get(report.from_system_id)?.name===hub?report.to_system_id:report.from_system_id,system=lookup.get(id);
            if(system&&bandMatches(system,security))candidates.set(id,{systemId:id,stations:[],publicSource:category,reportExpiresAt:report.expires_at});
        }
    }
    const distances=new Map([[origin,0]]),hops=new Map([[origin,0]]),previous=new Map(),queue=new Queue(),found=[];
    queue.push({id:origin,cost:0,hops:0});let visited=0;
    while(queue.items.length&&found.length<limit){
        const current=queue.pop();if(current.cost!==distances.get(current.id)||current.hops!==hops.get(current.id))continue;
        visited++;
        if(candidates.has(current.id)){
            const edges=[];for(let node=current.id;node!==origin;){const edge=previous.get(node);edges.push(edge);node=edge.from_system_id;}edges.reverse();
            const system=lookup.get(current.id),candidate=candidates.get(current.id),expiries=edges.filter(edge=>edge.kind==='wormhole').map(edge=>Date.parse(edge.expires_at));
            if(candidate.reportExpiresAt)expiries.push(Date.parse(candidate.reportExpiresAt));
            const expiresAt=expiries.length?new Date(Math.min(...expiries)).toISOString():null;
            const route={status:'ok',systemIds:[origin,...edges.map(edge=>edge.to_system_id)],edges,hops:edges.length,cost:current.cost,expiresAt};
            found.push({...candidate,name:system.name,security:securityOf(system),hops:edges.length,cost:current.cost,route});
        }
        for(const edge of graph.adjacency.get(current.id)||[]){
            const cost=current.cost+edge.cost,depth=current.hops+1,id=edge.to_system_id;
            if(cost<(distances.get(id)??Infinity)||cost===distances.get(id)&&depth<(hops.get(id)??Infinity)){
                distances.set(id,cost);hops.set(id,depth);previous.set(id,edge);queue.push({id,cost,hops:depth});
            }
        }
    }
    const warnings=[...graph.warnings,'Routes are observations, not guarantees of access or safe passage. Recheck wormhole life and mass in EVE.'];
    if(sourceCategory)warnings.push('Service locations are a dated reference. Current NPC orders, service availability and docking access are not verified.');
    const explanation=found.length?(preferences.mode==='safer'?'Lowest weighted travel cost with current security, standing and activity preferences.':preferences.mode==='prefer_low'?'Lowest weighted travel cost with a preference for low-security travel.':'Fewest eligible travel legs to each destination.'):
        candidates.size?'No route reaches this category through the enabled connections and exclusions.':'No eligible destinations are currently available in this category and security filter.';
    return {status:found.length?'ok':'no_route',originId:origin,category,security,generatedAt:new Date(now).toISOString(),results:found,
        explanation,warnings,excluded:[...extraExcluded,...reports.excluded,...graph.excluded].slice(0,100),candidateCount:candidates.size,visitedSystems:visited,
        reference:sourceCategory?{source:reference.source,sourceRevision:reference.sourceRevision,sourceUrl:reference.sourceUrl,generatedAt:sourceCategory.generatedAt,referenceOnly:true}:null};
}
