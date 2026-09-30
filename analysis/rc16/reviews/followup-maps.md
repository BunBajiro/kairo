# Targeted follow-up: independent Maps reads and dense signatures

The follow-up confirms a fixable read-boundary problem. Keeping the selected map exactly unchanged while adding unrelated maps increases the selected request's work. Collection reads multiply that unnecessary work by map count. This is repeated O(M×L) work, becoming roughly quadratic when total links L grows with map count M; it is not evidence of exponential growth.

The implementation should consolidate a shared map-projection read context and canonical connection lifecycle boundary. Query changes are part of that refactoring, not the complete design. The supported-limit dense signature loop is also real, but smaller than the collection-wide duplication in these fixtures.

## Reproduction and validity

New harness: `analysis/rc16/followup/harness/maps-scaling.mjs`. Application source and the original checkpoint harness remain unchanged. Reference RC16 is `57c8dcc7fbd8fc2b62129498d1819050c78381a1`; the investigation checkout was `2007c002a1eb9e3327df0c85ea9e3fabe3345fbb` at measurement time. Each result records selected source-file SHA-256 hashes, the harness hash, and a before/after assertion that neither changed during the run.

Harness SHA-256: `a38c8e0823722033e8d9a8e927588c238eec2eac01fd0d8c34da6126dcf35e17`.

All runtime runs acquired exclusive `flock /tmp/kairo-rc16-benchmark.lock` in the reserved slot. There were no failed runs, runtime fixes, or optional reruns. Evidence is in `raw/followup/maps-diagnostics.json`, `maps-timings.json`, and `maps-timings-reverse.json`, with corresponding complete `.log` files. All 15 scenarios completed; both timing orders contain seven samples per case (210 timing samples total), after three warmups each. Instrumentation is installed only for diagnostics. Serialization and output verification are outside service timing. Values below are the range of forward/reverse medians, not confidence intervals or tail percentiles.

Environment: Node 24.19.0, Linux x64, AMD EPYC 9V74; the same bundled 8,490-system atlas and fixed synthetic clock. Fixtures contain no user data, visits, remote feeds, logs, undo history, observations, passages, or tracked pilots. All external calls are rejected/counted; all runs recorded zero attempts. Database rows are directly seeded in canonical shapes, within the documented map/node/link/signature/document limits. This follow-up measures steady reads, not imports, edits, lifecycle transitions, or migrations.

Every returned map is checked for exact node/connection/signature counts, unique IDs, revision 7, active/confirmed/access/expiry flags, scope and location status, and complete ordered signature-to-connection bindings. Collection/source-map counts are checked too. The entire selected-map object has the same digest across unrelated-map volumes and selected/list endpoints, including operations and access/expiry fields. No fields are stripped before comparison; the clock is fixed. The digest is `b38a1d82a5af13ada4c466aa907a3ba81261dbb4d5f37953789899e55bcbbd7c`.

## 1. Unrelated maps make an identical selected-map request more expensive

The selected map is always 100 nodes, 99 bound wormhole connections and 100 signatures. Additional maps have the same record counts but distinct IDs and ownership scopes. The ordinary empty source map is present in all fixtures.

| Total private maps | Selected service median (ms) | Selected JSON body/value bytes read | Full-list service median (ms) | Full-list body/value bytes read |
|---|---:|---:|---:|---:|
| 1 | 2.92–4.52 | 325,875 | 3.42–3.94 | 375,323 |
| 8 | 5.73–6.63 | 661,287 | 51.02–60.46 | 5,675,156 |
| 24 | 12.92–13.52 | 1,427,943 | 341.55–371.99 | 35,422,148 |

Selected-map output is exactly **229,559 bytes** in all three cases, with the same complete object digest. Each selected read still executes 227 SQL statements, including 198 endpoint-signature lookups, and performs exactly 9,900 signature/edge predicate visits. Those are held constant.

The *entire increase* in emitted JSON body bytes is the unrelated canonical link bodies: the selected query loads 99, then 792, then 2,376 links, rather than only its own 99. The extra body bytes at 24 maps are 1,102,068, exactly the additional 2,277 link records. This establishes irrelevant data materialisation independently of elapsed-time noise. The selected request also performs an expired-link sweep and earliest-expiry query over a growing table; their scan work is part of the timings but is not represented by emitted-row byte counts. The latency difference therefore must not all be attributed to JSON parsing alone.

The full 24-map response is 5,509,856 bytes and emits 59,400 canonical link rows for only 2,376 actual links. Its 5,432 SQL statements include 4,752 signature point lookups and 25 expiry/schedule checks. Full-list JSON serialization adds median 30.80–35.90 ms, outside the table's service duration. The richer, normalized fixture fields in this follow-up differ from the original checkpoint fixture; its absolute results are not a same-workload regression comparison against that older harness.

Relevant paths: `server/universe.mjs:268–284` loads and then filters all pilot links; `server/universe-jspace.mjs:366–409` invokes this separately for every projected map; the list path also reconciles the source map. The selected `map` path crosses the same broad link boundary.

## 2. Holding total links constant still exposes repeated collection reads

This contrast fixes **720 canonical links / 329,760 canonical-link body bytes** and zero signatures across one, eight and 24 private maps. Each map has 60 nodes. Map documents, node totals and projected metadata therefore grow; this is explicitly a *constant-total-links* contrast, not an isolated timing experiment where every other input remains identical.

| Private maps | Total nodes | Canonical-link query calls | Link rows emitted | Link body bytes emitted | Service median (ms) |
|---|---:|---:|---:|---:|---:|
| 1 | 60 | 2 | 1,440 | 659,520 | 9.57–11.69 |
| 8 | 480 | 9 | 6,480 | 2,967,840 | 33.95–35.01 |
| 24 | 1,440 | 25 | 18,000 | 8,244,000 | 87.99–94.29 |

There are no endpoint signature lookups or signature/edge scans in this family. The query-level work is exactly `(M+1) × 720` returned links, including the source map. This rules out a growing *total link count* as the explanation for those extra reads. It does not assign all timing growth to that query: map/node metadata, expiry scans and operations projections also grow and are separately reported in the raw evidence.

## 3. Dense signatures have a separate S×E loop

Every dense fixture has one map with 100 nodes. Signatures are deliberately unbound Data Site observations, so the correct `connection_ids` output is empty for each; the projection still tests every connection for every signature. This removes endpoint signature SQL lookups from the comparison. All cases execute exactly 29 SQL statements.

The diagnostic hooks only projected-edge `Array.filter` calls, records the real `server/universe-jspace.mjs` call site, and asserts the exact expected number of predicate visits. It is absent from timing mode.

| Signatures S | Connections E | Counted predicate visits | Service median (ms) |
|---|---:|---:|---:|
| 0 | 100 | 0 | 1.48–1.57 |
| 0 | 1,000 | 0 | 9.25–10.08 |
| 100 | 100 | 10,000 | 2.03–2.33 |
| 100 | 1,000 | 100,000 | 11.67–13.88 |
| 1,000 | 100 | 100,000 | 6.19–6.66 |
| 1,000 | 1,000 | 1,000,000 | 23.36–26.87 |

The loop is `server/universe-jspace.mjs:394–398`. An ordered reverse index from resolved signature ID to connection IDs replaces repeated filtering with one traversal of connections plus signature lookups. Preserve the current connection order and include each edge once when either endpoint matches. This can be built alongside the connection projection after endpoint ownership/binding validation, rather than creating another source of truth.

The largest dense fixture also returns 2,013,934 bytes and reads larger signature records. Increased signature count changes SQL materialisation and output work; the timing difference is not a pure measure of the S×E loop. The loop warrants a small, explicit consolidation, but it is secondary to the measured 342–372 ms collection projection.

## Refactoring boundary for implementation

1. **One request-scoped map-read context.** The JSpace service coordinates list and selected reads from validated pilot/map IDs. Perform necessary lifecycle reconciliation first, then read the required map documents once, obtain grouped canonical links and observations once, and project from that immutable request context. The same boundary should serve `state`, selected `map`, and destination lookup; `jspaceDestinations` currently materialises every map before selecting one (`server/universe.mjs:588–597`). Do not retain this context across requests initially.
2. **Keep domain ownership explicit.** Universe retains canonical travel connection and expiry decisions; JSpace retains diagrams, archives and revisions; Operations retains scanner/intel/upgrade observations. Consolidate their duplicated read preparation and scoped record access instead of bypassing these ownership rules. In particular, reuse the map document and per-scope signature set already obtained for projection rather than revalidating/rereading them through several full-state calls.
3. **Give selected reads a genuine scope boundary.** A map-specific link query prevents irrelevant body transfer; a measured scope index may be needed for SQL work too. This alone does not guarantee independence because global expiry scans remain. Batch lifecycle work once per request first. Any later next-deadline shortcut must be invalidated by every canonical mutation path—including imports and direct record writes—and remain correct through rollback and startup. Those mutation paths should share one lifecycle-aware access boundary before relying on a cached deadline.
4. **Build signature-to-edge associations once.** Keep resolved endpoint bindings and their ordered reverse index together in the projection context. Avoid a second table or persisted cache for this inexpensive derived relationship.
5. **Then shrink the collection contract.** Lightweight map summaries plus selected-map detail can remove most inactive-map payload, while current-contract batching removes unnecessary repeated work first. The response still has an unavoidable cost proportional to the content it returns. Eliminating 25 repeated link reads does not imply a 25-fold total speedup.
6. **Reuse the same preparation principle for routing.** As established in the original review, Navigation should own one prepared route snapshot/eligible graph for an itinerary, while Universe owns source freshness, standings and connection eligibility. Reuse preparation across segments and midpoint alternatives, preserve final revision/connection validation, and exclude Journey aggregation from route-only inputs. This follow-up did not rerun routing and makes no additional route-speed claim.

## Behaviour gates and next measurements

Keep all existing map ownership, revision conflicts, unresolved signature binding, access/lifetime eligibility, collapse/expiry, undo/archive and session independence tests. Add focused checks that expired connections are reconciled before constructing the shared context; imports/duplicate maps refresh lifecycle scheduling; a second pilot's identically named records remain isolated; and list/selected projections retain identical chosen-map semantics. Frontend invalidation coalescing needs the separate edit/expiry/concurrent-request checks owned by that lane.

Retest the identical new fixtures after each increment. The first target is canonical-link materialisation once per required scope and selected output remaining semantically unchanged. Next, confirm selected-map cost no longer grows materially with unrelated maps and measure the full-list floor after serialization. Do not add a broad profiling campaign before applying these now-confirmed boundaries.

The RC16 diagnostic assertion expects the existing S×E scan specifically to prove its baseline count. An optimised projection will require a candidate-aware diagnostic expectation (and may use no such filter); do not weaken the independent output/cardinality/binding assertions. Uninstrumented timing mode already retains those behavioural checks without depending on the old algorithm.

Commands (each self-acquires the benchmark lock):

```bash
node analysis/rc16/followup/harness/maps-scaling.mjs diagnostics
node analysis/rc16/followup/harness/maps-scaling.mjs timings
node analysis/rc16/followup/harness/maps-scaling.mjs timings --reverse
```
