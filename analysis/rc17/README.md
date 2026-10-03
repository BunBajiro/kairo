# Internal instrumented RC17 checkpoint

This directory belongs to the internal analysis branch. The candidate application
is built in a separate checkout based on canonical RC16. The current deliverable
is an **internal optimised RC17 bundle with these harnesses**, reports, evidence
and reproduction workflow. [REPORT.md](REPORT.md) is the comparison whitepaper.
Review these findings before preparing a clean build for user review. The
eventual user-facing release is **8.0**; RC17 identifies this internal candidate.

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
| Historical corrected backend ABBA in the same job | Unchanged 0.7.3/RC16/RC16/0.7.3 corrected harness, followed by RC16/candidate/candidate/RC16. There are exactly three source versions. The same RC16 commit is measured alongside 0.7.3 and again alongside RC17 to show changes in runner conditions. All share the job's runtime/host; the two balanced comparisons keep their own samples. |
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

The workflow is `Internal instrumented RC17 comparison` on the internal analysis
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
are `all`, `maps`, `routes`, `backend`, `legacy-backend`, `memory`, `mixed`, `restart`, `browser`
(correctness) and `browser-performance` (paired camera measurements). Workflow/harness or
report edits alone do not trigger this run. The workflow checks out that exact
candidate beside canonical RC16. The `all` and `legacy-backend` suites also
check out/build 0.7.3 at its pinned SHA. The unchanged historical adapter accepts
the clean RC16 checkout: its protected Git-blob manifests live alongside the
harness, while application roots are explicit arguments. The generic additional
source/build manifest checks all three checkouts, including the historical
runner's two investigation exemptions. No frozen historical harness is edited.

The workflow uploads raw evidence and a separate **internal instrumented RC17
bundle** assembled after source verification. The bundle contains the exact
runtime source and compiled client, external harnesses, all retained analysis,
both reproduction workflows, source/build manifests, workflow step outcomes and
a SHA-256 inventory. `python3 verify-bundle.py` validates its contents. Node and
dependencies are not redistributed; the runtime retains its dependency lockfile.
The source archive has no Git database, so strict benchmark reproduction uses
clean Git checkouts at the recorded commits and the included workflow.

The bundle records the whitepaper revision/hash at packaging. That checkout's
report can predate fresh CI results; the [canonical whitepaper](https://github.com/BunBajiro/kairo/blob/perf/rc16-checkpoint-v0.8.0/analysis/rc17/REPORT.md)
is updated separately after artifact retrieval and evidence review. A focused or
failed run can still yield an explicitly incomplete bundle; only a successful
`all` run marks all required comparison lanes passed. None is a release approval.
Keep harnesses in this internal handoff. Removing them belongs to the later
clean preparation and user-review phase before 8.0.

The historical v0.7.3-versus-RC16 corrected rerun stays in
`rc16-followup.yml`. Its manual `corrected-backend` suite, or a change to
`analysis/rc16/followup/run-corrected.json`, runs only that missing comparison.
It now builds both frontends before authenticated HTTP checks. The new three-version
job reuses that unchanged corrected adapter for a fresh same-job anchor. The two prior
failed follow-up runs remain intact and are not reclassified as successes.

## Focused browser correction and combined acceptance

The full three-version run `37078241973` passed its measurement lanes but failed
while deleting Chrome's profile after all 17 compiled Mapper feature assertions.
The original run stays failed. A focused `browser` request can name
`acceptedFullRun: 37078241973` (manual input `accepted_full_run`) after its full
raw artifact, retrieval metadata and immutable 78-file inventory are committed.

`accept-focused.py` requires the exact same candidate and RC16 source **and
compiled asset** manifests in both CI runs, every retained artifact byte, success
of all original measurement steps, and a successful new browser process with all
17 unchanged feature assertions plus verified Chrome exit/profile cleanup. The
only permitted measured-harness change is `maps-correctness.mjs`; its old/new
hashes are recorded. A distinct `combined-acceptance.json` then covers the valid
measurements and corrected browser gate together. Neither run is relabelled as
a successful full run, and the focused bundle's per-run
`allComparisonLanesPassed` remains false. Release approval remains separate.

The first rebuilt focused attempt (`37080679048`) passed its browser assertions
but failed that strict join because a generated deployment identifier changed
the compiled HTML/RSC entrypoints. The accepted recovery instead uses
`rc17-original-browser.yml` and `prepare-original-runtime.py` to restore and
verify the original archived runtime without rebuilding. Run `37082520646`
passes all 17 assertions, cleanup and `accept-original-browser.py`'s combined
gate. The original measurement run and failed rebuilt attempt retain their
original conclusions. See `reviews/browser-original-replay.md`.

## Idle CPU follow-up

`cpu-investigation/` is a separate diagnostic adapter; it does not edit the
accepted backend or browser harnesses. Its README defines profiling, counting
and settled observation modes and their provenance checks. Never compare the
instrumented modes' CPU readings as performance results. The original
`05d0d4b` settled ABBA observation is retained separately from its original
startup-inclusive CI benchmark.

The later internal candidate `fa6e852b76089b51cd552fa202de85ad6948b0ec` removes
unnecessary protected-pilot identity reads, cached per-dataset OPSEC projections
and discarded scheduled feed views. All scheduling/freshness thresholds stay
unchanged. Its scoped `backend` request runs the original typical/stress ABBA
adapter, including the one-second warm-up and 35-second windows, alongside
fresh full regression/type checks and compilation. The separate counts lane
checks work removal. Other feature timing evidence remains pinned to its
actually measured source; a focused follow-up does not relabel it as a new
whole-matrix run or imply release acceptance.
