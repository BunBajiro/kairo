# RC17 external comparison harnesses

This directory belongs to the internal analysis branch. The candidate application
is built in a separate checkout based on canonical RC16. None of these harnesses,
synthetic accounts or evidence files belong in the RC17 review package.

## Source and execution contract

Pin canonical RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` and an exact
candidate commit. Compile both before capturing source manifests. The manifest
records every tracked or nonignored untracked file, explicit local deletions,
working-tree status, and the compiled `dist/client` assets. Source verification
rechecks both hashes and file sets. CI requires a clean checkout at the exact
requested SHA. Local dirty development measurements are labelled as such and
cannot be presented as measurements of a committed release.

```sh
node analysis/rc17/harness/source-manifest.mjs capture "$RC16_ROOT" /tmp/rc16-source.json
node analysis/rc17/harness/source-manifest.mjs capture "$CANDIDATE_ROOT" /tmp/candidate-source.json
```

The shared runtime lock remains `/tmp/kairo-rc16-benchmark.lock`. Maps, routes, backend, memory, browser-camera
and mixed runners acquire it themselves; do not wrap them in a second `flock`.
Restart and browser runners need the explicit `flock` shown in the workflow.
Only the root coordinator grants local runtime ownership. Syntax checks do not
constitute a successful benchmark run.

## Minimal comparison and acceptance lanes

| Lane | Purpose and comparability |
|---|---|
| Maps diagnostics, then RC16/candidate/candidate/RC16 timings | Same populated maps, dense signatures, selected-map semantics, revisions and access flags. Timing runs remain uninstrumented. Candidate-only summaries are separately labelled; RC16 absence is explicit. Diagnostic SQL body counts must not be treated as latency measurements. |
| Isolated route ABBA | Same 1/10/50-stop itineraries, corrected stress fixture and fixed clock. Complete route-result semantic digests must match; logical preparation counts are collected in separate diagnostic children. |
| Corrected backend ABBA | Same typical/stress workload, real scheduler, valid cached storms object, idle residency/CPU, startup, authenticated state HTTP, Sessions and market. Both frontends must be built. Each application receives the same fixture and retains real Universe tick assertions. |
| Bounded memory/Sessions ABBA | Same fresh-process minimal four-pilot fixture, ordinary startup/RSS and separately forced-GC attribution; topology, first use, finite caches and ten recreate/use/close cycles. Same five long-session fixtures retain route/combat-group hashes. Candidate not-due diagnostics require zero visit rows, while RC16 retains the original repeated-route count. |
| Candidate mixed quiet/load/load/quiet | Same two pilots, 20,000 assets each, eight maps, ten widgets, four 50-stop plans and map bursts. Preserve 56/92 request counts, dashboard and OBS continuity, fresh/stale OPSEC ordering, recovery and zero external IO. Existing RC16 CI runs fail the continuity gate; they are retained as failed partial baselines, so this lane does not claim a balanced CI before/after latency comparison. |
| Positive managed restart | Real deferred semantic work and accepted HTTP complete before storage closes; cookie/CSRF/reconnect and persisted evidence remain valid. The previous known-gap reproduction stays separate. |
| Browser camera ABBA | Matched 100/600-node gate fixtures and viewport; identical zoom/pan actions. Renderer task/style/layout work is timed before separate mutation and collected-heap diagnostics. Focus detail stays off; headless software-rendered frame intervals are not desktop GPU FPS. |
| Compiled Mapper correctness | Optional focus detail defaults off; per-pilot preferences, scaled ports/dragging, real collapsed DOM, retained boundary systems and canonical map contents. This is correctness evidence, not a browser performance estimate. |

The backend `journey` operation deliberately remains a **cold compatibility
reader** over the same preserved legacy rows. It is not an active lifetime-log
feature or a measure of Universe's hot path. Session travel, combat attribution
and report assertions remain unchanged. Removing Journey UI and future lifetime
logging is an intentional product contract change, not an excuse to remove old
session evidence from the fixture.

`backend/` is a separate copy of the corrected RC16 workload. Its production
inputs, profile sizes and behavioural assertions remain unchanged; the runner
uses the generic source manifest instead of assuming RC16 source hashes.
`mixed-worker.mjs` uses that same corrected fixture helper; the frozen mixed
fixture already changed storms to the identical valid object before starting
Kairo. The candidate fixture also prepares discovery membership exactly as a real upgrade
would: synthetic visits are inserted after `openStore`, so the new one-time
migration would otherwise have seen an empty table. The untimed
`legacy-discovery-fixture.mjs` seeds and validates the exact distinct pilot/system
set before startup/work. Baseline still reads those memberships from visits.
Preparation is recorded separately from the shared workload fingerprint. This
prevents an artificially empty candidate discovery query. The Session-only
memory fixture receives the same preparation; minimal residency correctly has
no memberships because it contains no visits. No old RC16 harness file is edited
by these adapters.

Full application tests and types run before comparison lanes. Independent later
lanes still run after a measurement fails, but the job keeps its failure. Missing
or incomplete output is never a pass. Source and compiled asset verification runs
again at the end. Compare observations only on the same host/browser/runtime;
do not pool local timings with Actions or call modest heap growth a leak.

## Starting GitHub comparisons

The workflow is `Internal RC17 candidate comparison` on the internal analysis
branch. Manual dispatch accepts a full `candidate_sha` and a `suite`. A push can
also request a run by changing `analysis/rc17/candidate-source.json` to:

```json
{
  "candidateCommit": "FULL_40_CHARACTER_COMMIT_SHA",
  "suite": "all",
  "request": "unique-review-request-id"
}
```

The example is not a valid request until the SHA is replaced. Supported suites
are `all`, `maps`, `routes`, `backend`, `memory`, `mixed`, `restart`, `browser`
(correctness) and `browser-performance` (paired camera measurements). Workflow/harness or
report edits alone do not trigger this run. The workflow checks out that exact
candidate beside canonical RC16 and uploads **evidence only**. A successful
candidate test-build workflow remains the source of the human review download.

The historical v0.7.3-versus-RC16 corrected rerun stays in
`rc16-followup.yml`. Its manual `corrected-backend` suite, or a change to
`analysis/rc16/followup/run-corrected.json`, runs only that missing comparison.
It now builds both frontends before authenticated HTTP checks. The two prior
failed follow-up runs remain intact and are not reclassified as successes.
