# RC17 remaining frontend findings: source trace

Audit: 7 October 2026. This supplements the main completion ledger. The seven sections of `analysis/rc16/reviews/followup-whole-app-frontend.md` were not fully represented by the RC17 whitepaper's short unresolved-items table. The current source still contains the paths below. They cannot be counted as completed merely because Maps received a scoped refresh controller or backend widgets share projection inputs.

Source root at inspection: `kairo-rc17-completion`, reconstructed from published `fa6e852b76089b51cd552fa202de85ad6948b0ec`, with separately identified completion patches in progress. None of the frontend files below except the separately tracked Maps camera helper has been changed during recovery. The master audit records the final source snapshot. Line numbers are inspection aids; the named functions/effects are the authoritative anchors.

These are mostly code-confirmed repeated work or missing lifecycle contracts. Their current elapsed-time impact is **not measured**. Historical minimal-browser counts establish the original redundancy, not a new performance result for the reconstructed tree.

## F1 — Dashboard refresh cascade: partially fixed

**Trace:** `components/kairo/dashboard.tsx:60` (`refresh`), `:64` (bootstrap effect), `:104` (selected-pilot effect), `:148` (`changed` listener), `:149` (fallback poll); `operations.tsx:22` (`Overview` effect); `activity-timeline.tsx` session-dependent loading; `intelligence.tsx:31` (`SessionsPage` effect); `studio.tsx:22` (preview effect). Original finding: whole-app frontend review §1.

One initial `/state` owner is already implemented: bootstrap chooses the pilot and the selected-pilot effect loads state. The remaining problem is explicit: every accepted state refresh replaces `sessions` with a newly decoded array, dependent effects treat its identity as invalidation, and the generic `changed` listener ignores event pilot/resource scope. A single unrelated update can consequently trigger state, activity, Goals, archive or preview reads. The old duplicate-initial-request trace must not be described as a still-present duplicate startup call.

**Change needed:** retain stable identities/revisions for unchanged resources; route typed changes to affected pilot/resource keys; coalesce state reads with one retained follow-up. Keep the recovery poll and a complete Goals invalidation contract (wallet, assets, skills, manufacturing, mining, combat and manual edits), rather than replacing all invalidation with only a Session revision.

**Closure:** compiled-browser request counts for initial load, unchanged 30-second fallback, other-pilot update, global update and rapid current-pilot changes; assert one initial state read, no unrelated downstream refresh, and eventual latest state. Separately check each automatic/manual Goal source still updates Overview. Compare counts and, if making a speed claim, matched realistic populated-browser windows.

## F2 — Scoped reads/publication: partially fixed, one remaining correctness gap

**Trace:** `dashboard.tsx:226` (`ExtensionPage`); `components/kairo/scoped-refresh.mjs` (`createScopedRefresh`, currently a Maps owner); `model.ts:91` (`api`); `intelligence.tsx:23` (`SessionsPage.load`); `markets.tsx:25` (`load`); `session-report.tsx` request/pagination guards; `datasets.tsx` epoch and flight guards. Original review §2.

ExtensionPage now rejects a disposed effect and only displays a result matching module and pilot. Its reported A→B publication hazard is addressed in source. Maps also has a bounded refresh owner. This is not a common read-resource contract across the app. In particular, Session archive loading checks only the pilot; an older request for the **same** pilot can still publish after a newer one. Several pages separately implement sequence/alive/epoch fencing, and guarding acceptance does not prevent overlapping transport.

**Change needed:** first fence same-pilot archive responses and preserve loaded pages with explicit request generation. Reuse a small mounted-resource owner where its contracts match: scope key, generation, one in-flight read/one pending refresh, disposal and recovery. Keep mutations separate, and do not key shared market books by the selected scan pilot or create an unbounded global cache.

**Closure:** controlled slow-A/fast-B and same-pilot reversed responses; unmount, reconnect and dataset revision changes; failure/retry; simultaneous identical reads; no cross-pilot result publication. Preserve SessionReport page cursors, expanded history and unsaved drafts. Actual compiled UI tests must exercise publication, beyond unit tests of the helper.

## F3 — Subscription and derived-row ownership: open

**Trace:** `context.tsx:4` (`KairoContext`); `dashboard.tsx:224` (provider object); `operations.tsx:20` (`Overview`), `:46`–`:49` (Character/Wallet/Assets/Industry pages). Original review §3.

The single context still exposes all pilot snapshots, names, sessions, navigation and a freshly written unused `time`. Unrelated context changes rerender consumers. Parent render paths still construct complete price maps, asset totals and rows for tabs that need not be visible. Backend asset topology improvements do not eliminate these frontend transformations.

**Change needed:** separate stable shell/actions from pilot resources; give expensive row/chart models dependencies on the source and name revisions they actually consume; mount expensive inactive tab bodies at their own boundaries. Avoid deep-stringifying all snapshots to discover equality. Remove unused context time only after confirming no consumers; keep the isolated EveClock independent.

**Closure:** instrumentation outside ordinary timings must show unrelated snapshots do not rebuild active large assets/journal/industry models, while relevant data/name changes do. Test pilot/tab switches, retained filters, disabled/missing/stale resources and correct totals. Use a matched populated UI lane before claiming CPU/frame savings.

## F4 — Eager page delivery/bundle coupling: unmeasured decision still open

**Trace:** eager imports in `dashboard.tsx:14`–`:20`, page selection in that component. Original review §3 separately identifies bundle delivery, not just rerenders. Historical overall JS size grew from 831,476 to 1,370,976 bytes (gzip 238,885→388,505); those are old whole-build figures, not an attribution to any one library.

**Change/decision needed:** compare the current production bundle and cold Overview execution with a route-boundary lazy-loading variant. Adopt boundaries that measurably defer meaningful payload/work without breaking navigation; otherwise retain an explicit measured no-change decision. Do not promise savings from replacing a library without bundle evidence.

**Closure:** identical lockfile/build configuration, entry/chunk inventories and compressed bytes, cold Overview and first route navigation observations; loading/error/retry states, back/forward, detached/preview surfaces and user drafts remain correct. First-use cost belongs in the decision, not outside the timing window.

## F5 — Administrative polling and mixed resource refresh: open

**Trace:** `markets.tsx:25`–`:26` (`load`, four-second interval); `obs-controls.tsx:15` (initial full read plus three-second polling); `dashboard.tsx:133`–`:150` (SSE subscriptions); `goals.tsx:20`–`:23` (`revision`/`load`). Original review §4.

Markets still polls when idle/hidden and can overlap slow reads. OBS settings repeatedly fetch configuration plus status while Core already emits OBS status events; the dashboard does not consume that event for this UI. Goals reloads notes and source choices together with progress on each relevant snapshot revision. Existing SessionReport and dataset-settings visibility/flight policies are counterexamples to preserve, not missing work.

**Change needed:** retain resource-specific bounded scheduling, faster job-progress updates and initial/reconnect recovery; deliver OBS status via the existing stream without overwriting edited configuration; separate Goal note/source metadata invalidation from progress. These UI changes must not slow server ESI, recording, OPSEC or separately loaded OBS sources.

**Closure:** request/overlap counts for idle, running, hidden, focus and reconnect; timely scan completion/cancel/error; old books remain visible; missed status recovers; dirty OBS configuration survives; notes/manual goals refresh on their actual mutations; no stale-pilot acceptance. Measure loaded and idle behavior separately.

## F6 — Table derivation and loaded archive growth: open; presentation changes conditional

**Trace:** `ui.tsx:42` (`DataTable`, full filter/search/sort before slicing 30 rows); `intelligence.tsx:23` (`load`, nested `some` merge) and archive rendering/load-more. Original review §5.

Thirty visible table rows bound DOM, not full-array search/ordering work on every render. Archive pages accumulate, and merging each refresh uses nested membership scans. Initial endpoint pagination already exists; calling the initial archive unbounded would be wrong.

**Change needed:** normalize searchable text and ordered rows by stable input revision; use an ID Set/Map for archive merging. Measure realistic loaded-history cardinalities before choosing windowed presentation or server-side query changes. Retain the existing five-row timeline, report list bounds and chart bounds.

**Closure:** identical search/null/number/string sort semantics, stable IDs, page clamping after updates, accessible details, no duplicate/lost archive entries and stable cursor tie-breaks during refresh/load-more. Compare growing assets/journal/archive workloads; a helper count reduction alone is not a user-visible latency claim.

## F7 — Reusable UI formatters: conditional P3 decision open

**Trace:** `model.ts:87`–`:88` (`isk`, `stamp`), other per-row locale formatting in `operations.tsx`/`markets.tsx`. Original review §5. This is distinct from the already implemented lazy **server** number formatter.

**Change/decision needed:** measure formatter setup/call counts alongside row-model work; use fixed reusable number/date formatters where semantics and initialization costs justify it. This small simplification is not a headline optimization and should not introduce a new eager startup burden.

**Closure:** exact compact/decimal/negative/invalid-value and UTC EVE date outputs, cold and warm cost in the same representative table fixture; retain a reasoned measured disposition if the change is immaterial.

## F8 — Studio editing, binding preview and clocks: open

**Trace:** `studio.tsx:22` (debounced POST preview), `:23` (one-second state clock), pointer `move`/`patch`/`change` and canvas elements. Original review §6.

Geometry-only changes still replace the complete config and restart binding preview; a one-second clock rerenders the full editor. The 50-element addition limit bounds the common editing workload but does not make repeated work disappear. This is code evidence, not a measured Studio regression.

**Change needed:** separate geometry draft from binding-relevant projection inputs/source revisions and time-text subscribers; coalesce pointer work at frame cadence while committing its final position. Preserve the separation between unsaved preview and persisted live output.

**Closure:** preview POST counts for drag-only versus source/binding changes; latest preview wins; correct pilot, countdown and Session clocks; grid/clamp/keyboard/final pointer position; unsaved stays unsaved; save/test/live iframe behavior unchanged. Profile a realistic populated layout before assigning a speedup.

## F9 — Browser-source redundant clock/layout writes: open

**Trace:** `public/stream/render.js:30`–`:42` (`render`/node updates), `:68` (state listener/localStorage), `:71` (250 ms time-text loop). Original review §7.

The renderer already reuses widget nodes, bounds toasts and restores fail-closed UNKNOWN on disconnect. It still assigns second-resolution text four times per second and rewrites persisted layout on every state event. Backend duplicate-state suppression reduces events but does not close these renderer paths.

**Change needed:** assign text only when its displayed value changes; restrict ordinary clock work to relevant visible widgets; persist changes needed for safe recovery separately from volatile projection values. Never debounce or suppress protection transitions or retain obsolete cover geometry.

**Closure:** instrument DOM/storage writes separately from timing; unchanged clocks/layout produce no writes, genuine second/layout changes do. Replay disconnect/reconnect and immediate protection updates in a real browser source, preserving cover geometry, toast bounds, ordering, sound disposal and active/idle behavior. Protocol-only SSE clients cannot validate rendered safety or total OBS CPU.

## Disposition rule

F1 and F2 are partial, not wholly untouched. F3/F5/F6/F8/F9 retain concrete source work; F4/F7 and heavier F6 presentation changes require a measured adopt/reject decision. A small helper implemented only for Maps is not evidence these other consumers migrated. No finding here is closed by the earlier fa6 backend-only CI run, and no new frontend performance result is claimed in this trace.
