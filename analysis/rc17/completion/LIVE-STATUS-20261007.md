# Live RC17 completion status — 7 October 2026

**Superseded source selection:** the user instructed this process to disregard build #55 / `508f2d4` from the parallel process and use build #54 / `c954c0d`. See the [authoritative c954 resumption and finding trace](c954-resumption/README.md). The rest of this file is retained as a historical checkpoint; its 508 adoption claims do not describe the selected source.

Internal work only. PR #10 remains withdrawn and draft; no clean package, merge or release is authorized before every finding and final acceptance are closed.

## Durable banks

- Internal source branch `refactor/rc17-v0.8.0`: `508f2d450c7cc17cc464cf316b80748367adc9e2`, tree `e1526bdaec07c7791a6209bc577dee7cfe884599`. Adds independently reviewed Atlas lazy-layout and bounded enrichment changes plus native Window timer receiver correction. Isolated evidence supports adoption; combined local/build/browser and final comparison acceptance are pending. Existing local `dist` is still the earlier c954 build until rebuilt.
- Analysis branch `perf/rc16-checkpoint-v0.8.0`: recovered 310-file bank `05749b297434a2eb012a75a8631aea84ee9694bf`, followed by 228-file work/evidence bank `84534435a7af74af0d15214c77c90e74aacf1c2d`. Both trees verified against frozen local Git trees. Later files may remain unbanked until the next milestone.
- Earlier source `c954c0d808847f249df0659ed15fdce2e89f84c4`: 941 runtime tests, types and fresh build passed. Do not attribute those results to 508. GitHub internal test-build run `37619287962` targets 508 and is still in progress at this note.
- User explicitly authorized source, test logs, performance evidence and diagnostic screenshots to private `BunBajiro/kairo`. The previous auto-review upload block is resolved. All publishing is through the GitHub connector; local git remotes lack shell credentials.

## Current measured decisions and open owners

| Area | Current disposition / remaining work |
|---|---|
| F4 page delivery | Reject lazy/Suspense trial. 28 compiled checks pass, entry JS shrinks but first navigation costs 254–324 ms and Overview has no demonstrated benefit. Keep source unchanged. `route-loading/RESULTS-20261007.md`. |
| M7 Atlas layouts | Adopt at 508 after 32 kernel children, 48 exact canvas snapshots, scale/radar checks and compiled replay acceptance. First switch pays deferred work; cumulative/whole-browser results and retained-memory tradeoffs stay explicit. `atlas/lazy-trial-20261007/`. |
| Atlas immutable index / first formatted binding | Shared index already in c954 has measured construction/retained benefit. Existing lazy reused formatter retained with measured first-use cost. `atlas/RESULTS-20261007.md`. |
| Enrichment | Adopt bounded-four work admission at 508. 12 ABBA runs / 144 fixtures preserve ordered results, calls, warm-cache, priority/drain behavior; latency gains for larger cold batches. `backend-decisions/ENRICHMENT-RESULTS-20261007.md`. |
| F5 native administrative timers | Concrete Window receiver defect found in actual native timed browser. Minimal wrapper fix adopted at 508. Earlier virtual 18-check acceptance did not catch it and is insufficient. Receiver regression/native rerun pending. `admin-polling/native-timer-fix.patch`. |
| F3/F6/F7/F8/F9 | Compiled populated-model 17 checks and Studio/source 10 checks pass on c954. Measured derivation/formatter/editor work and broad Context attribution remain in progress; failed native ABBA retained. `frontend-models/WORK-CHECKPOINT-20261007.md`. |
| U1 / U3 | Real loaded conversion and 3-per-source archive tests complete. Keep worker and existing inventory; all outputs match, actual reconnect/cleanup passes. Preserve third conversion's adverse burst (197 ms interval HTTP p95); no blanket latency claim. `updater/RESULTS-20261007.md`. |
| U2b rollback | Further locked failed-generation rollback fix under review; durable exact UUID rejection, visible metadata failure and retry semantics. Root requested conservative unreadable-state behavior and retaining rejection across unrelated errors; revised patch satisfies source review, revised tests pending. `updater/rollback-recovery.patch`. |
| Maps G13/G14/M4/M5/M6/M9 | Frozen c954/fa6/RC16 diagnostics queued. M9 repeated whole-map stringify mechanism identified; isolated fast path independently reviewed, measurements/tests pending. `maps-final/`. |
| Atlas M8 | First draw attribution complete; deeper zoom/labels supplement pending before spatial-index decision. `atlas/draw-diagnostic-20261007/`. |
| Session/replay S3/R1 | Frozen c954 vs isolated baseline; index read/write/space, ordinary two-minute cadence and compiled replay comparisons queued/running. Lazy-layout replay acceptance passed. `session-replay/`. |
| Backend retained Goal SUM | Source-pinned absolute-cost trials pending; no speculative aggregate introduced. `backend-decisions/`. |
| Binding evaluation/names | Actual-Core counters/timings pending; hidden-only trial is isolated, no names protocol change assumed. `bindings-names/`. |
| G8 stress state tail | Fresh two-process sanity complete; 12-process fixed-input RC16/fa6/allocation active/noSync crossover queued. `diagnostics/state-causal-20261007`. |
| G9 historical idle CPU | Six-process RC16/original05d/fa6 balanced startup/settled comparison running with complete per-process results retained; full completion required. `diagnostics/idle-causal-20261007`. |
| Final acceptance | Still open. Freeze source/build/harness after all measured decisions; affected correctness/types/build/browser plus unchanged local and independent CI original comparison lanes, all adverse rows, independent evidence review. Only then clean package/extracted verification and user review. |

## Recovery and scheduling

Workspace root `/workspace/scratch/a2f3334402fc`. Runtime `kairo-rc17-completion`; analysis `kairo-analysis-restored`. Trials have their own frozen roots/manifests; do not rebuild them in place. Heavy builds/timing use `/tmp/kairo-performance.lock`. Historical unchanged harnesses use their original lock internally; new wrappers coordinate without nesting the same lock. G9 intentionally holds its lock for all six processes; do not edit its hashed scripts during the run. Never infer completion from the existence of a progress file.

Root G8/G9 inputs are `diagnostics/inputs-20261007/{sanity,g8,g9}.json`; runner/summary scripts are alongside them. Summarize only after immutable `completion.json` exists. Root owns top-level ledgers, integrated source and GitHub bank commits. Isolated owners supply reviewed patches. Source 508 has no final-review authorization.
