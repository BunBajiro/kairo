// Dataset enrichment is accepted Core work. Bound admission locally while ESI
// owns the shared global slots and priority queue. Drain every accepted worker
// before returning or rejecting; Core keeps ESI/Store alive for this promise.
export async function mapEnrichment(items, enrich) {
    const results = new Array(items.length), failures = [];
    let next = 0;
    async function worker() {
        while (!failures.length) {
            const index = next++;
            if (index >= items.length) return;
            try { results[index] = await enrich(items[index], index); }
            catch (error) { failures.push(error); }
        }
    }
    await Promise.all(Array.from({length: Math.min(4, items.length)}, worker));
    if (failures.length) throw failures[0];
    return results;
}

export function enrichPlanets(planets, esi, characterId) {
    return mapEnrichment(planets, async planet => {
        try {
            const detail = await esi.request('/characters/' + characterId + '/planets/' + planet.planet_id, {characterId, ttl: 600});
            return {...planet, details: detail.data};
        } catch {
            return planet;
        }
    });
}
