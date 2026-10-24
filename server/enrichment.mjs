/**
 * Enrich an accepted dataset in input order with at most four visits in flight.
 * ESI still owns global capacity, priority and caching. The first rejection
 * stops new admission and is rethrown after in-flight siblings settle; callback
 * side effects are not rolled back. Core must await the returned promise.
 */
export async function mapEnrichment(values, visit) {
    const results = new Array(values.length);
    let next = 0, failed = false, failure;
    async function worker() {
        while (!failed && next < values.length) {
            const index = next++;
            try { results[index] = await visit(values[index], index); }
            catch (error) { if (!failed) { failed = true; failure = error; } }
        }
    }
    // Drain accepted siblings before returning a failure, so their writes cannot
    // outlive the owning dataset task or its Core close boundary.
    await Promise.all(Array.from({length: Math.min(4, values.length)}, worker));
    if (failed) throw failure;
    return results;
}
