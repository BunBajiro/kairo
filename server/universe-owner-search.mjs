/** Private map owner selectors: resolve verified alliance/corporation identities
 * through shared ESI transport. A resolved name supplies identity only, never
 * sovereignty evidence or membership. The owning Universe service drains close(). */
export const OWNER_SEARCH_SCOPE = 'esi-search.search_structures.v1';
const validId = value => Number.isSafeInteger(value) && value > 0 && value < 2147483647;
const LIMIT = 20;
const unavailable = message => Object.assign(new Error(message), {status:503});

/** On-demand identity lookup through the shared ESI cache, coalescing and rate limiter. No polling. */
export function createUniverseOwnerSearch(store, auth, esi, {now = Date.now} = {}) {
    const flights = new Map(); let closed = false;
    const cacheRows = store.db.prepare("SELECT body FROM cache WHERE key LIKE 'esi-name:%' AND expires>? AND json_extract(body,'$.category')=? AND instr(lower(json_extract(body,'$.name')),lower(?))>0 LIMIT 21");
    function identity(row, kind) {
        if (row?.category !== kind || !validId(row.id) || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 160) return null;
        return {id:row.id, name:row.name.trim(), kind, logo_url:`https://images.evetech.net/${kind === 'alliance' ? 'alliances' : 'corporations'}/${row.id}/logo?size=64`};
    }
    function cached(kind, query) {
        return cacheRows.all(now(),kind,query).flatMap(row => { try {const found=identity(JSON.parse(row.body),kind);return found?[found]:[];} catch{return [];} });
    }
    /** Resolve input.kind plus a 3–100 character q for a connected pilot. With
     * search scope use partial lookup; otherwise exact names/IDs use public ESI.
     * Hydrate at most 20 IDs, dropping mismatched identities and rejecting stale
     * provider responses. Matching in-flight queries coalesce; verified local names
     * can survive provider failure. Returns results/mode/truncated/notice; validation
     * or provider failure without fallback rejects. Valid empty results resolve. */
    function search(characterId, input = {}) {
        if (closed) return Promise.reject(new Error('Owner search is stopping.'));
        const id=Number(characterId), pilot=auth.characters().find(row=>row.id===id), kind=input.kind;
        if (!validId(id) || !pilot) return Promise.reject(new Error('Choose a connected pilot.'));
        if (!['alliance','corporation'].includes(kind)) return Promise.reject(new Error('Choose an alliance or corporation.'));
        const query=typeof input.q==='string'?input.q.trim():'';
        if (query.length<3 || query.length>100 || /[\u0000-\u001f\u007f]/.test(query)) return Promise.reject(new Error('Enter 3–100 characters of an alliance or corporation name.'));
        const key=`${id}:${kind}:${query.toLowerCase()}`;
        if (flights.has(key)) return flights.get(key);
        const task=lookup(id,pilot,kind,query).finally(()=>flights.delete(key));
        flights.set(key,task);return task;
    }
    async function lookup(id,pilot,kind,query) {
        const searchAvailable=!pilot.needsReauth&&(pilot.scopes||[]).includes(OWNER_SEARCH_SCOPE), local=cached(kind,query);
        const fallbackNotice='Enter the full name, or reconnect this pilot to enable partial-name search.';
        let ids=[], mode=searchAvailable?'search':'exact', notice=searchAvailable?null:fallbackNotice, truncated=false;
        const exact=local.find(row=>row.name.toLowerCase()===query.toLowerCase());
        if (exact) return {kind,query,mode:'cached',search_available:searchAvailable,notice:null,results:[exact],truncated:false};
        try {
            if (/^\d+$/.test(query)) {ids=validId(Number(query))?[Number(query)]:[];mode='exact';}
            else if (searchAvailable) {
                const sample=await esi.request('/characters/'+id+'/search?'+new URLSearchParams({categories:kind,search:query,strict:'false'}),{characterId:id,ttl:3600});
                if (sample.stale) throw unavailable('Owner search is temporarily unavailable.');
                const found=sample.data?.[kind]??[];
                if (!Array.isArray(found)) throw unavailable('Owner search returned an unreadable result.');
                ids=found.filter(validId);
            } else {
                const sample=await esi.request('/universe/ids',{method:'POST',body:[query],ttl:43200});
                if (sample.stale) throw unavailable('Owner lookup is temporarily unavailable.');
                const found=sample.data?.[kind==='alliance'?'alliances':'corporations']??[];
                if (!Array.isArray(found)) throw unavailable('Owner lookup returned an unreadable result.');
                ids=found.filter(row=>validId(row?.id)&&typeof row.name==='string'&&row.name.toLowerCase()===query.toLowerCase()).map(row=>row.id);
            }
            ids=[...new Set(ids)];truncated=ids.length>LIMIT;ids=ids.slice(0,LIMIT);
            let resolved=[];
            if (ids.length) {
                const sample=await esi.request('/universe/names',{method:'POST',body:ids,ttl:86400});
                if (sample.stale || !Array.isArray(sample.data)) throw unavailable('Owner identities could not be verified.');
                const selected=new Set(ids);
                resolved=sample.data.filter(row=>selected.has(row?.id)).map(row=>identity(row,kind)).filter(Boolean);
            }
            if (mode === 'exact' && resolved.length) notice = null;
            const results=[...new Map([...local,...resolved].map(row=>[row.id,row])).values()];
            truncated ||= results.length>LIMIT;
            const score=row=>row.name.toLowerCase()===query.toLowerCase()?0:row.name.toLowerCase().startsWith(query.toLowerCase())?1:2;
            results.sort((a,b)=>score(a)-score(b)||a.name.localeCompare(b.name));
            return {kind,query,mode,search_available:searchAvailable,notice,results:results.slice(0,LIMIT),truncated};
        } catch(error) {
            if (!local.length) throw error;
            return {kind,query,mode:'cached',search_available:searchAvailable,notice:'Showing previously verified names while ESI is unavailable.',results:local.slice(0,LIMIT),truncated:local.length>LIMIT};
        }
    }
    async function close() {closed=true;await Promise.allSettled([...flights.values()]);}
    return {search,close};
}
