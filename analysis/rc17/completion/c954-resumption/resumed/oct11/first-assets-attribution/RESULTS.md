# Integrated first-use disposition — 11 October 2026

**Retain source70 unchanged. The focused Overview/first-Assets investigation is closed with the observed initial cost accepted as a trade-off.** Bun explicitly reaffirmed the earlier policy: preserve lower ongoing usage and avoid circular optimisation of one-time setup. Final matched release comparisons remain required; this does not close the whole W gate or declare a release ready.

The bounded diagnostic found no extra work in its observed operations or unintended repeated requests. No source fix, profiler follow-up or ordinary timing retry is justified by this check. The large earlier candidate spike remains unexplained and retained.

## Observations

One fresh browser per arm used the original two-pilot,20,000-name,10,000-Assets-row fixture and exactly the original Overview/first-Assets actions. The comparison is c9d04ef versus integrated70cd12f, **not RC16**. It emits no ordinary performance metrics.

| Observed operation | c9d baseline | Integrated70 |
| --- | ---: | ---: |
| Overview journal map |1 call /80 rows|1 call /80 rows|
| Overview NumberFormat / DateTimeFormat construction |2 /3|2 /3|
| First Assets price map |1 call /20,000 rows|1 call /20,000 rows|
| First Assets asset-row map |1 call /10,000 rows|1 call /10,000 rows|
| First Assets new formatters |0|0|
| Bootstrap HTTP starts/resolutions |5 /5|5 /5|
| EventSource opens/errors |1 /0|1 /0|
| Names bootstrap events |0|1 expected event|
| First Assets HTTP/SSE/source-change receipts |0|0|

Both arms fetched bootstrap, state, active tracking, timeline and goals once each, resolving200. Both rendered30 Assets rows. No external provider calls, fixture clock advances, renderer exceptions, dropped diagnostic receipts or late count changes after the row assertion occurred. Operation counters are shape-based calls/rows, not React commits or complete model/GC/layout attribution. Fetch resolution means headers available, not completed JSON parsing or a React commit.

Attempt2 exited0 at20:19:21UTC. Both actual Chromium processes exited0 with no signal; their profiles and fixture resources were removed. Outer process groups drained, removed worker roots stayed absent, both full source/build identities passed, and every captured closed log/raw/input tuple matched final inventory. Raw completion SHA256: `429739d3c86bb6665d7e6e455d089a27c6860a2a23f2afad1efcaf9cd69b0323`. See the separate independent result audit and [raw recovery manifest](RAW-MANIFEST.json).

## Accepted cost and evidence limits

The earlier [names helper decision](../../oct8/frontend-names/RESULTS.md) explicitly accepted first-open task71.788→89.215ms against lower recurring work. That helper already exists in c9d, so it does **not** explain the newer c9d→70 delta. The [protocol trial](../../names-protocol-227/ORDINARY-BROWSER-RESULTS.md) separately retains the extra550KB bootstrap and about5ms backend connection cost, alongside its matched recurring-work improvement. These stage-specific gains are not added together or presented as whole-application results.

The earlier integrated ordinary collection remains unchanged: first-Assets task pairs +136.672ms/+145.67% and +13.610ms/+20.43%; script pairs +78.079ms/+199.26% and +6.060ms/+17.74%. Overview and heap costs, sparse-sample limits and the large first-candidate spike remain in the final report. Equal diagnostic counts neither erase those observations nor prove a GC/JIT/bundle cause. The accepted decision is bounded retention under the user's trade-off policy, subject to the required final matched comparisons.

Attempt1 is preserved as a harness failure before any completed diagnostic phase: newline-only IIFE concatenation prevented the receiver probes from initializing. Baseline Overview loaded correctly; no candidate worker ran. A combined-script initialization control reproduces that error and verifies the explicit-semicolon correction. The empty worker parent was never removed because the failed command interrupted control flow; the old guard's wording about reappearance was inaccurate, not evidence of another filesystem mutation. Old raw files and all six original preparation files remain unchanged.

Next: the original three-version local matrix, the already-required configured first-binding supplement and real updater acceptance, independent Actions, then the complete report/extracted-package checks. The46 historical component decisions remain closed. PR10 remains withdrawn; no user-review candidate, merge or release is produced here.
