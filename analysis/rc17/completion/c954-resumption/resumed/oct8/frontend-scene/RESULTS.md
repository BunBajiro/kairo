# M6 exact-a7 attribution and narrow refresh/clock decision

8 October 2026. **The next bounded change should remove the duplicate refresh-induced clock render before extracting memoized leaves.** M6 remains open until that change has a compiled correctness and ordinary matched decision. This diagnostic neither accepts a new source change nor certifies clean RC17.

The frozen clean source is `a7b1bf97b0073695926c443e52d523638e59e48d`, fingerprint `e1007fe8e518aab1eeb1015d710ac56e0759745b37202b6c660691e06ba089f7`. One fresh build and type check passed, followed by separate precise-coverage/props-identity and CPU-profile workers. Both completed22 action rows across100/600 nodes; their14/13 checks passed. No application exceptions or external server requests occurred. Source/build/harness verification passed. Browser helper close completed, but its SIGKILL fallback does not independently await exit; unlike the later R1 worker this receipt is not a stronger process-exit proof. Original raw files and diagnostic workers are preserved in `attempt1/`.

## Causal owner observed

On an ordinary unchanged-detail publication, JSpaceMap first receives freshly decoded map/array/record/pilot identities with no graph-content change. `operations.generated_at` changes, while operations excluding that timestamp remain equal. A following clock publication changes `now`, recreates public scene map/nodes/connections and handlers, again with no semantic graph change. Most unchanged windows show two scene invocations and two full node passes. Thus the refresh→effect→setNow chain in `jspace-workspace.tsx`/`jspace-clock.mjs` is observed, not merely inferred from root commit counts.

The600-node middle unchanged window also contains additional overlay/route-edge and clock commits. Preserve that overlap: root commits2/6/3, reported scene coverage2/6/2, node callback coverage1,200/3,000/1,200. Some reported V8 loop counts do not equal component calls times cardinality, so they are not a perfect leaf-render census.100-node node callback counts are200 in each unchanged window. All unchanged windows observe zero leaf/world/child DOM mutations. This establishes work without DOM change, not absence of React work or a measured benefit for a leaf comparator.

| Nodes | Unchanged window | Framework exclusive sampled ms | Node loop inclusive ms | Public-scene inclusive ms |
|---:|---:|---:|---:|---:|
|100|1|16.265|2.298|6.537|
|100|2|17.261|1.826|4.409|
|100|3|16.583|0.606|2.419|
|600|1|65.471|8.088|2.384|
|600|2|124.405|16.017|5.310|
|600|3|40.485|7.068|3.483|

Framework sampled work is an upper bound for scene reconciliation, not proof every sample belongs to a particular leaf. Inclusive categories overlap. The first100-node unchanged CPU window has21.202 ms sampled GC; it remains in the evidence. Precise coverage/props serialization and CPU profiles are separate intrusive diagnostics; no duration here is an ordinary baseline/candidate performance result. Exact compiled asset SHA/ranges/excerpts and disjoint exclusive categories are retained in `ATTRIBUTION.json`, reproducible by `summarize.mjs`.

Same-revision pilot/record publication, one-node metadata, a real3.5-second clock expiry, stale-pilot projection, backend waiting-pilot refresh, selection, native node drag/save, zoom and pan all pass. At the real deadline the revision remains2 while rally/observation disappear and pilot becomes stale. A map-revision-only bailout would miss this behavior and is rejected. Camera/gesture ownership and broad leaf extraction remain separate from the measured refresh owner.

## Authored narrow candidate, not yet executed

`../frontend-clock/PLAN.md` and `../frontend-clock/clock-refresh.patch` describe a four-file isolated candidate (three source files plus tests) based on the same a7 source. A new map, library-summary or feed identity observes Date.now in that render; the subsequent clock refresh owns deadlines without publishing an immediate duplicate tick. Legacy clock callers still publish. Deadlines are filtered after the time already consumed by the render but scheduled against actual effect time, so expiry across the render/effect gap receives an immediate tick. The independent30-second cadence, visibility resume, complete source records, request/pilot/map fences and gesture/input ownership are retained. Independent read-only review found no blocker before the compiled gate.

The six added clock controls cover redundant-tick removal, absolute expiry/cadence, render-to-effect crossing, replacement records, hidden/resume/close, invalid timestamp fallback and wall-clock rollback. These are authored only; they and the candidate have not run. Full source publication, same-revision labels/pilot records, expiry/age/rally/feed, map/pilot switching, drag/save, camera and input correctness must be observed in the compiled gate. A fresh ordinary ABBA must retain first-open and changed/unchanged rows before adoption. Broad memoization and culling are not implied or required by this first owner decision.
