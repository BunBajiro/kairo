# Independent read-only review

8 October 2026. Reviewer: `/root/restore_source_9afa`; proposal owner: `/root/frontend_next_decision`. Reviewed the four-file `current-proposal.patch` against exact 9afa without running tests/builds.

No blocking defect was found within the actual flat string names contract. The review checked both Core snapshot publishers (`server/core.mjs:68,271`), the positive-ID/nonempty-string name filter (`:76–83`), Dashboard's initial empty map, SSE JSON parsing and pilot routing, and unchanged state replacement/generation fences. The functional updater uses the latest queued previous map; it introduces no retained cache or stale captured snapshot.

The own-key check distinguishes a missing key from an own undefined key. Spread preserves own `__proto__`/`constructor` additions without changing object prototypes. Omitted names survive partial events. The baseline already retained unchanged names identity, so the expected benefit is fewer copies, enumerations and recursive comparisons; it is not additional suppression of Context rerenders.

Qualification retained from review: startup `store.get('names', {})` is not revalidated. The equivalence argument covers valid persisted/transport flat name maps, not arbitrary nested JSON or accessor/proxy objects. The planned compiled delayed-state/newer-SSE and authoritative-removal checks were identified as the relevant integration gate; they subsequently passed for both baseline and trial in `browser-attempt1` (20/20 each).

Changed-map adverse kernel rows remain disclosed. This review does not close broad Context propagation, names wire size, first-use performance, or clean RC17 acceptance.
