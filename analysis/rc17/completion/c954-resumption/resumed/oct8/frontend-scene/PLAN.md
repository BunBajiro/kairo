# M6 stable scene: exact-source diagnosis and next bounded lane

8 October 2026. Read-only inspection began at `c9d04ef62cb8a18292b309a2452fcab851185a7d`; the final source receipt is pinned to newly integrated `a7b1bf97b0073695926c443e52d523638e59e48d` with the same six scene files. No trial source edit, test, build or browser job has run in this lane. M6 remains open. This work is separate from the accepted Assets boundary, F6 archive/Table, backend map reads, names publication and final RC17 acceptance.

## What the existing evidence establishes

The six relevant current scene/model/clock files are byte-identical to the preserved exact-c954 `maps-final/c954-source.json` manifest; `source-receipt.json` records each digest. This permits using the earlier scene source diagnosis. It does not relabel old compiled timings as a current-source comparison. The local restored git object does not expose those files at the old c954 path; the preserved manifest, rather than a successful local `git show c954:path`, establishes this equivalence.

The complete instrumented `maps-final/scene-profile-20261007.json` has 4/5 root commits for unchanged refresh at 100/600 nodes and zero observed scene leaf-attribute or child-list mutations. The 600-node scene has 18,626 descendant elements. Source-URL sampled weights for unchanged refresh were page/framework 19.2/39.0 ms at 100 nodes and 56.8/103.1 ms at 600 nodes. These are sampled attribution, not ordinary timing, individual leaf render counts or proof that all React samples belong to the map.

Pan at 600 nodes also has cumulative trace event durations of 137.465 ms UpdateLayoutTree, 170.148 ms Paint and 580.706 ms Layerize. Those categories need not be disjoint. Leaf memoization cannot be assumed to remove camera/compositor cost. No viewport-culling change follows from the refresh evidence.

## Concrete invalidation chain in the current source

| Owner | Current path | Consequence / freshness constraint |
|---|---|---|
| Read/publication | `jspace-workspace.tsx:83–100` | A scoped read fetches summaries then the chosen full map; publication replaces `selectedMap` with newly decoded detail. Keep epoch, pilot and selected-map fences. |
| Public display scene | `jspace-workspace.tsx:70–72`, `jspace-workspace-model.mjs:16–37` | `publicChainScene` copies nodes, filters connections and returns a new scene even without selected public feeds. Its previous scene is only used to preserve public-card positions, not as an equality cache. |
| Clock | `jspace-workspace.tsx:112–121`, `jspace-clock.mjs:2–18` | Changed connection/ping/feed identities call `clock.refresh`, which publishes the actual current time. This can cause another render/scene derivation. Time also determines expiry, observations, pilot freshness and rally markers; skipping it by map revision is unsound. Actual commit counts and sequence still need the proposed diagnostic. |
| Projection | `jspace-map.tsx:79–126`, `map-display-model.mjs:29–66` | Nodes are copied with optimistic draft positions and then copied again with display scale/detail. `allLinks`, display membership, indices, records and geometry depend on snapshot/time/selection inputs. Fresh arrays or objects defeat naive default `memo(node)` comparisons. |
| JSX | `jspace-map.tsx:321–375` | Edge, label, full node, placement and minimap JSX is regenerated in the one component. Node rendering derives presence, record groups, labels and callbacks and traverses icon descendants. Zero DOM changes does not imply zero work here. |
| Gestures | `jspace-map.tsx:189–275` | Node/edge/caption ref maps are used for imperative drag paint/restore, pointer capture and asynchronous save settlement. A memo boundary must retain mounted DOM identities and read current handlers/state. |

The workspace also passes fresh inline callbacks and optional empty arrays. A whole-map `React.memo` wrapper with default equality is unlikely to isolate this work; a comparator that ignores callbacks would risk stale closures. An equality key based only on revision would miss same-revision operational/pilot/clock/public-feed changes.

## Next diagnostic: attribution before choosing the leaf extraction

Run one bounded exact-current compiled lane after a runtime grant, using the frozen 100/600-node canonical graph and the same 1600×1050/default-scale/full-detail camera fixture. Freeze the parent-selected current source and verify its fresh compiled build. Preserve the original old profile unchanged.

1. Use separate precise-coverage and CPU-profile passes on the same action sequence; neither pass supplies ordinary acceptance timing. Capture exact compiled script bodies, hashes and function ranges. Map the component, node-loop, edge-loop, minimap-loop and relevant model functions by their compiled source ranges and retained excerpts. Do not infer a leaf count from root commits. If anonymous function ranges cannot be unambiguously mapped, use a separate diagnostic-only source clone with named counters, hash its patch, and do not call that build ordinary source.
2. Record a commit-time props-identity trace for the exact JSpaceMap owner using the local React diagnostic hook: map/nodes/connections/pings/records, pilots, operations, atlas/overlays, now, selected IDs, busy and callback identities. Record counts/digests, not retained historical object graphs. Distinguish loading-only commits, decoded detail publication and clock publication. This tests the invalidation-chain hypothesis rather than treating it as measured fact.
3. Measure unchanged refresh, one-node metadata change, selection transition and one native drag/release with a real saved layout. Keep camera zoom/pan as controls. Verify the actual map response and complete graph before and after each action. Use repeated same-result refreshes within the diagnostic so a single incidental commit is visible.
4. Attribute exclusive sampled work to scene derivation, the node/edge loops and React descendants, with idle/program/GC separate. Coverage establishes invocation counts; the CPU profile supplies sampled cost. Their totals are not interchangeable.

The decision after this diagnostic should be one focused source trial. If node reconciliation is material, start with a memoized node-card leaf, leaving camera/gesture ownership, edge geometry, minimap and workspace protocol intact. If derivation dominates and the leaf share is small, reject that leaf trial and address the measured owner instead. Do not refactor all scene layers at once merely to create a new architecture.

## Proposed node-card contract if attribution supports it

Use explicit rendered inputs, not a complete map or only a node ID/revision. Preserve atlas reference data plus the complete scalar visual/accessible state: position/scale/detail, system class/name/static/effect, owner, status/alias/role/public flags, selection/group/trace/route/location/connect-source state, signature/unlinked identifiers, record metric counts/alerts, comments, pilot count/staleness/tooltip, rally label, editability/busy/connection-pending state and active hint description. Any dynamic list needs complete contents in its comparison; equal lengths are insufficient.

Keep model derivation and imperative ref maps at their current owner for the first trial. Node event dispatch must use the current committed handler set and node lookup, with stable callable identity across an unchanged view; it must not capture a previous pilot/map, pending-save state or node object. Stable ref registration must attach/detach exactly the actual DOM node and clean up on unmount. No module-global cache, revision-only cache, JSON stringify comparison or unbounded historical model retention. Audit every consumed input against the extracted JSX before choosing a primitive-prop model versus a bounded complete comparator. Avoid suppressing updates through an unreviewed custom comparator.

This is a candidate design, not an implemented or accepted change. Callback/ref design deserves independent review before a compiled gate.

## Matched acceptance gate for that one trial

Both sources need type checks, fresh production builds and source/build/harness start/end guards. Run separate compiled correctness, then one ordinary ABBA sequence with fresh processes for both 100 and 600 nodes. Ordinary rows: first open, same-result refresh, changed single-node metadata, changed operational/pilot data without saved-map revision change, selection and keyboard transition, native drag/save, camera pan and zoom. Report task/script/style/layout, long tasks and graph/DOM identity, preserve every adverse row and nearest AB/BA pair. Use the established repeated >10% and >1 ms task-regression rule to trigger a causal follow-up; do not discard first-use costs.

Required correctness controls cover the boundary's actual risk: current labels/ARIA/tooltips after metadata and owner updates; record/pilot changes at the same map revision; expiry of edge/ping/observation and pilot freshness; known/wormhole/public cards and read-only transitions; protected/offscreen selections and collapsed/focus-detail groups; keyboard navigation/Alt-arrow movement; pointer capture/cancel/blur; parallel edges and their drag geometry; two gestures during a delayed save; map/pilot switching before a delayed response; connection preview/ports and pending state; detached-document owner window; stable camera/world transform and minimap camera paint. Reuse the relevant workflows in `tests/jspace-ui-workflows.mjs` rather than inventing weaker equivalents. Existing model, camera-surface, clock and scoped-save tests remain regression guards.

Accept or reject only the measured node-card decision. Additional culling requires its own renderer tradeoff decision; camera work and no-DOM-mutation evidence cannot automatically close it. Final combined/package/CI and other whitepaper findings remain outside this diagnostic.

## Prepared harness (not executed)

`scene-diagnostic.mjs` and `run-diagnostic.mjs` are authored for the independent clean source root `kairo-frontend-scene-a7-oct8`, exact a7b1bf. The runner captures source, checks syntax/types, makes one fresh production build, then launches separate coverage/identity and CPU workers. Each runs three unchanged refreshes and metadata, same-revision pilot/record, real clock deadline, post-deadline refresh, selection, native drag/save and zoom/pan control rows at both graph sizes. No application source is instrumented or edited. The diagnostic commit hook serializes complete relevant inputs only in coverage mode; that overhead disqualifies its durations from performance acceptance. The CPU worker uses only the root-commit counter. Estimated runtime slot is 4–6 minutes. No jobs have run as of this authored checkpoint.
