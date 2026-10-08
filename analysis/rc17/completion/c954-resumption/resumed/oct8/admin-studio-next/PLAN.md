# F5 / F8 / F9 ordinary populated work — frozen plan

Prepared 8 October 2026. **No application runtime, tests or builds have run in this lane at preparation time.** Root must grant the common runtime slot before `run.mjs` is invoked. This is internal completion evidence; PR #10 stays withdrawn and final combined acceptance remains separate.

## Exact comparison

Both isolated roots start at canonical `a7b1bf97b0073695926c443e52d523638e59e48d` (the accepted Assets boundary, following hidden Stream binding gating, lazy Atlas ownership and names-owner work). The candidate is clean. The baseline applies only these exact sections of the saved `frontend-models/legacy-ui-ablation.patch`:

| Path | Mechanism deliberately restored in baseline |
|---|---|
| `components/kairo/markets.tsx` | Unconditional 4-second full administrative reads |
| `components/kairo/obs-controls.tsx` | Unconditional 3-second full config/status reads |
| `components/kairo/studio.tsx` | Whole-editor clock, full-config preview dependency and immediate pointer state work |
| `public/stream/render.js` | Repeated text assignments, full-element time scan and volatile recovery persistence |

All four current files have exactly the saved clean c954 hashes. Applying the four sections exactly reproduces the corresponding saved historical ablation file hashes. `PREPARATION.json` records every source path/hash in both roots and verifies that exactly these four paths differ. Source-only inventories are not compiled fingerprints. Fresh successful builds will produce separate build receipts and full source/asset manifests.

The old eight-file ablation is retained with its original fingerprint `615799709626ba337ca36b82c9b084875912a9598167e7b6cace4018c6bfe150`. This new comparison is the **legacy mechanism ablation on a7b**, not that old complete build. Its other reversals (Goals, model formatting, operation transforms and table processing) are deliberately omitted so completed work stays equal between arms. Unused accepted helper files remain in the baseline. The native receiver fix, backend cadence, current Core snapshot revisions, hidden-binding gating and other accepted changes remain common. Excluded build #55 / 508 is not imported.

`prepare.py` freezes source from the exact commit, never current staged/working bytes. Isolated roots are `kairo-admin-studio-baseline-a7b-oct8` and `kairo-admin-studio-candidate-a7b-oct8`; shared app source remains untouched. Dependencies reuse the existing verified `node_modules`; source lock digest and pinned Chromium executable digest are recorded.

## Historical evidence and concrete gaps

The original full `frontend-models/run-abba-v2.mjs` failed on native Window timer receivers at its first candidate Studio/admin worker. Its failed/partial outputs remain historical and are not pooled with these observations. The receiver correction at 933 has 16 focused tests, 18 compiled virtual-clock checks and one successful native six-second populated worker. F8/F9 also have 10 compiled correctness checks, including stale/pilot/Save/storage-denial/reconnect behavior. These are correctness evidence for their own source boundaries, not completed ordinary comparisons.

Only the remaining Studio/admin/source cost lane is revived. Models and formatters are not rerun. The versioned `populated-cost-next.mjs` preserves the original phase workloads and adds the missing observations and assertions below. Existing virtual-clock diagnostics are not repeated; current combined-source semantics remain part of the final gate.

## Fixture and run order fixed before measurement

- Real local server, HTTP/SSE, Chromium 138.0.7204.0 and freshly compiled app. Fresh server store and browser process for each arm. One synthetic pilot with no usable credentials; outbound provider traffic denied. No application instrumentation, profiler, forced GC or virtual clock.
- Studio/output: 32 visible elements (4 clocks, 4 wallet bindings, 24 static), original geometry and typography; 3 drags × 40 actual pointer moves; 10 wallet events spaced 400 ms in Studio and 10 spaced 100 ms in source. Emitted envelopes now come from `core.snapshots(42).wallet` to retain current revision metadata.
- Loaded Markets administrative overview: 12 followed hubs (4 defaults + 8 synthetic), 240 saved items per hub (2,880 total), 60 quick types, 8 saved job summaries, 12 book summaries per job. The selected running job is inserted locally after idle. No provider scan is started. This measures overview/config/card refresh work; it does not claim populated market browse-table or actual scan cost.
- Loaded OBS administrative configuration: 24 actions for each of the 10 protection states (240 saved actions), with 24 action editors rendered for the selected state. OBS stays disabled/disconnected; this is saved config rendering/recovery cost, not live OBS transport or action execution. The actual overview/config/status JSON byte counts and fixture cardinalities are saved in each result.
- Build and typecheck baseline then candidate. Freeze successful receipts and source/compiled hashes. Run four fresh ordinary workers in **baseline, candidate, candidate, baseline** order. Then run a fifth **candidate-only** native recovery worker. The fifth worker is a scheduling correctness observation and is never pooled into ABBA cost rows.

| Ordinary phase | Observation / equivalence requirement |
|---|---|
| Studio first use | New target, navigation through 32 elements and first bound value readiness; no prior Studio warm-up |
| Studio native idle 6 s | Clock/editor work with populated visible layout |
| Three drags | Final draft coordinates equal grid/clamp math after each drag; saved output remains x=40, y=155 |
| Ten Studio source updates | Final bound value is 2,009 ISK |
| Markets first route | Loaded overview arrival; includes the same fixed 650 ms settling window in each arm |
| Markets native idle 6 s | Retains all 12 cached hub cards and their saved counts |
| Markets running 6 s | Same injected job; candidate intentionally polls every 2 s versus legacy 4 s |
| Populated OBS route | 24 saved action editors; same 650 ms settling window; this route has already been mounted once for the running-job remount sequence and is **not cold first-use** |
| OBS native idle 6 s | Loaded configuration retained |
| Source first use | New target on source origin, all 32 elements and current binding ready |
| Source native idle 6 s | Actual uninstrumented renderer tick work |
| Ten source updates | All 32 output elements, saved 40px/155px position, final 3,009 ISK and static wording remain correct |

The separate native recovery worker watches 35 seconds of visible idle Markets and expects one `/api/markets` fallback. It then watches 35 seconds of OBS and expects one `/api/obs/status` read and zero full `/api/obs` reads, after settled mounts. No clock overrides are used. This fills the native deadline gap; visibility/focus/reconnect and dirty/save fences retain their prior diagnostic evidence and require final combined-source acceptance.

## Provenance, failures and interpretation

`run.mjs` checks prepared source bytes, exact commit/status and a fresh empty build output before any build; verifies source unchanged after build; writes successful type/build logs and build receipts; and verifies source and compiled assets before/after workers. The coordinator freezes and checks itself, this plan, worker, patch, historical harness, source-manifest helper, Chrome helper and pinned browser binary. Every worker writes output on failure and records cleanup success independently. A new attempt directory is required; failed attempts and adverse rows are retained. No automatic retry, output overwrite or best-run selection is performed.

Each phase records wall duration, ordinary CDP renderer task/script/layout/recalc counters, uncollected heap endpoints and observed API request/status/encoded-byte events. The new-target first-use wall measurement is navigation to functional readiness. CDP counter deltas span initial navigation; any reset is explicitly marked and those negative deltas cannot be called negative work. Route windows include settling delay, so elapsed differences are not pure click-to-paint latency. No total browser/OBS/GPU CPU or retained-heap claim is supported.

Report all four rows per phase and descriptive baseline/candidate summaries, including adverse first-use or running-job rows. Request reductions explain removed work but do not alone establish user-visible speedup. This bundled four-mechanism comparison cannot isolate a unique share of cost to each mechanism. Saved fixture bytes/cardinalities and geometry/static/bound outputs must match across arms, ignoring documented native times and running-job transitions.

No source change is proposed from this preparation. Final disposition must use the resulting observations, preserve the browser-source last-successfully-persisted offline recovery limit, and keep broader Goals/F5 and final combined acceptance boundaries explicit.

## Runtime command and budget

After root grants the slot, from the analysis root:

```bash
KAIRO_MODELS_LOCKED=1 KAIRO_CHROME_PATH=/tmp/kairo-chrome-runtime/chromium \
flock /tmp/kairo-performance.lock node \
analysis/rc17/completion/c954-resumption/resumed/oct8/admin-studio-next/run.mjs \
analysis/rc17/completion/c954-resumption/resumed/oct8/admin-studio-next/attempt-1
```

Expected occupancy: approximately 5–7 minutes for two fresh builds, about 3 minutes of ordinary ABBA windows, 70 seconds of native recovery and startup/cleanup. Source preparation and independent review do not consume the runtime slot. Any failure must be inspected before a separately recorded follow-up, with root informed before extending the slot.

Independent read-only review confirmed patch application and current helper/endpoint contracts, and identified the concrete additions now frozen in this plan. No prior partial cost values are promoted into acceptance.
