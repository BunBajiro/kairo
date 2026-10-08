// Enrichment is optional metadata over an already accepted dataset. Limit the
// local fan-out; ESI remains the owner of global capacity, priority and caching.
// Results follow input order even when independent requests finish out of order.
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
