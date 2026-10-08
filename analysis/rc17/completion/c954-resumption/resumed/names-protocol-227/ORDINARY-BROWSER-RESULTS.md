# Names protocol: ordinary compiled browser comparison

Four fresh browser/process workers completed in baseline/candidate/candidate/baseline order against the independently reviewed revision6 workers and freshly verified exact227 + hidden-filter builds. Both arms retain identical sparse20k/550,001-byte names and two10k-row Assets fixtures. All source/build/harness, fixture/provider/controlled-clock and compiled UI checks passed; cleanup and unexpected-external lists are empty. No ordinary run was replaced or discarded. Chromium138.0.7204.0 and its coordinator-provided binary pin are recorded in the launch environment.

This is an ordinary rendering comparison with no CDP Network packet mirroring, body capture, Array/formatter wrappers or profiling. Matched scalar receipt counters plus two animation frames prove completion of every measured Wallet publication; they do not inspect/copy name bodies. Initial completion also requires the actual state-ready compiled page, open connection and candidate names bootstrap. Renderer metrics exclude browser/GPU/worker CPU. Each arm has two fresh process observations; these are not population percentiles.

## Paired observations

The table reports the arithmetic mean of each arm's two per-process phase observations. `BROWSER-SUMMARY.json` retains all four raw values, both nearest AB/BA differences, all task/script/layout/style/heap/window values and repeated-material flags.

| Phase | Baseline task ms | Candidate task ms | Baseline script ms | Candidate script ms |
| --- | ---: | ---: | ---: | ---: |
| Initial overview and bootstrap |356.106|394.459|163.126|179.355|
| First Assets open |109.782|94.282|45.638|39.026|
| Sort directions |64.127|63.421|15.660|15.636|
| Twenty actual Wallet updates |310.375|150.957|257.909|107.457|
| Search and page controls |99.887|82.085|33.092|25.140|
| Relevant changed name |41.630|31.811|35.949|16.685|
| Unrelated changed name |23.712|10.415|21.110|7.095|

The twenty-update task reduction is159.417ms/51.36%, with both pairs improving by50.85% and51.84%. Script decreases150.451ms/58.34%, with pairs56.54% and60.01%. A real relevant-name publication improves task time in both pairs by26.76%/20.88%; the event's following Wallet snapshot is included in the completion barrier. Search/sort/pilot and expanded-detail controls remained correct. The different-pilot name-delivery check is a semantic gate outside timing, not a mismatched performance row.

## Retained adverse results

Initial overview/bootstrap task increases38.354ms/+10.77% in the mean: nearest pairs are+3.896ms/+1.05% and+72.811ms/+21.42%. Its script increases16.230ms/+9.95%, with+14.640ms/+8.88% and+17.819ms/+11.04%. These increases are retained. Neither task nor script exceeds10% in both pairs, but that does not establish a cause or make startup cost disappear. The candidate deliberately adds a550,068-byte JSON directory event beside HTTP startup state; no profile was used to attribute the observed time among that additional work and other startup work.

Assets first-open has a lower mean, but its second pair is+1.479ms/+1.57%; this is also retained. No task phase crosses both >1ms and >10% in both nearest pairs. That rule describes this bounded comparison; it is not proof of universal regression absence. No optional rerun was used to replace the adverse observations.

## Scoped recommendation and remaining closure

The combined semantic, backend transport/timing and compiled ordinary evidence supports adopting the narrow revisioned full-map-on-change protocol for integrated validation. It materially reduces repeated active-client work, preserves global/pilot/freshness/reset/legacy contracts and tests actual publication paths. This recommendation does not label all names cost solved or authorize user review.

Retain startup bootstrap as an explicit tradeoff and pin initial overview/first Assets open in the final combined browser matrix. Also pin the backend20k/zero-client/eight-name-change adverse row (36.862→41.945ms, pairs+8.40%/+19.18%) and the two earlier hidden-filter adverse rows. The current isolated comparison intentionally omits the accepted Assets boundary; the integrated source must include it and any other accepted changes, pass full tests/typecheck/fresh build, and complete the matched combined checks. The existing authoritative state/reset and revision fences remain mandatory. API documentation should describe the new private global names event only after source adoption.

PR #10 remains withdrawn. Clean RC17 stays blocked until root records closure of this and every remaining finding, including unresolved whitepaper items elsewhere.
