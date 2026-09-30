# v0.7.3 optimisation and refactoring verification

**Verified in the workspace and on GitHub; production build ready for human review.** The three prioritised changes reproduce substantial improvements over clean v0.7.2 while preserving the checked response data and interface behaviour. Both draft PRs remain unmerged: [implementation #5](https://github.com/BunBajiro/kairo/pull/5) and [isolated investigation #4](https://github.com/BunBajiro/kairo/pull/4).

## Implementation and provenance

| Finding | Implemented change | Preserved behaviour |
|---|---|---|
| Repeated decoding of unrelated snapshots during background work | Protection reads only its seven evidence keys; scheduler reads metadata before loading bodies; store reuses prepared statements | Three-second cadence, immediate evidence reactions, scope/owner checks, fail-closed deadlines and OBS ordering |
| Every database write invalidated import analysis | Centralised dependency revisions, character access and expiry checks; retained single-flight calculation | Prices, fees, rankings, watched orders, freshness, buyer/seller identity, plans and quotes |
| Session matching repeatedly scanned and parsed combat records | Reused joined system metadata and prepared lookups; indexed timestamps and merged intervals by system | Presence qualification before buffering, half-open intervals, quiet/repeated visits, deduplication, accounting and ordering |

Frontend state restructuring, market aggregate-query changes, archived-report caching and widget timers are deferred. The measured gains do not require changing their behaviour.

- Baseline application: clean v0.7.2, `b151125cd7b26611364923f00683b1c6f1c1bdd6`.
- Measured candidate: `d57cda3b44b34aa207407848eb14acab846b05cb`, tree `da34fbdff28b4a90202e8afff7efeb0322f768f2`. This commit deliberately retains the old version identifier during measurement.
- External harness: `138a91f6c5d31bc133ca0b6b93bf9f0ee7cadf83`. Original timing and fixture logic are unchanged; comparison and equivalence checks were added separately.
- Production v0.7.3: `ff8bbc530ce278a883f8b1831407095a14d3277d`, based directly on clean v0.7.2. Version strings, release documentation and package exclusions follow verification; the five optimised runtime modules are byte-identical to the measured candidate.
- [Successful GitHub comparison](https://github.com/BunBajiro/kairo/actions/runs/35333693369) and [successful v0.7.3 build](https://github.com/BunBajiro/kairo/actions/runs/35334789591).

## Measurement method

Each environment ran baseline/candidate/candidate/baseline sequentially on the same worker. Each backend repetition includes both fixture sizes, 35-second idle windows, three warmups and ten timed samples per operation, including JSON serialization. Node is 24.19.0 in both environments; the comparison GitHub worker is Ubuntu 24.04 on an AMD EPYC 7763, two logical CPUs. Hardware differs between environments; only within-environment comparisons support improvement claims.

The larger synthetic fixture contains four characters with 20,000 assets each, 50,000 activity events, 2,000 visits, 4,000 records in each combat table and 5,000 market types per hub. The smaller fixture contains one character with 2,000 assets, 10,000 events, 300 visits, 600 records in each combat table and 1,000 types per hub. See the [methodology](../PERFORMANCE.md) for complete definitions. These are controlled workloads, not surveyed player profiles. External request attempts were zero.

Raw reports retain environment details, samples, workload fingerprints, payload sizes and completeness. Dirty flags reflect only the untracked external harness in disposable measurement checkouts; tracked application files are clean. Workspace backend runs used identical compiled frontend assets. GitHub independently compiled both versions: client JavaScript, CSS and stream assets match byte-for-byte, as does total asset size; only generated HTML/RSC hashes differ. Frontend application source is unchanged in the measured candidate.

Ranges below span the two observations or p50 values; they are not confidence intervals. Ten samples do not establish stable rare-tail latency, and the event-loop maximum is the largest observed stall in a short window.

## Repeated backend results

| Larger synthetic fixture | Workspace v0.7.2 | Workspace candidate | GitHub v0.7.2 | GitHub candidate |
|---|---:|---:|---:|---:|
| Idle CPU, % of one logical core | 14.66–15.27 | 1.26–1.40 | 16.63–16.93 | 1.53–1.54 |
| Largest observed idle loop delay, ms | 466.35–471.33 | 35.06–41.22 | 509.61–518.52 | 41.55–45.19 |
| Session report, p50 ms | 181.40–189.19 | 109.80–112.04 | 236.96–251.43 | 140.43–141.04 |
| Imports after unrelated write, p50 ms | 469.21–483.32 | 0.68–0.70 | 558.81–574.38 | 1.35–1.37 |
| Protection evaluation, p50 ms | 9.78–10.43 | 0.08–0.10 | 11.49–11.61 | 0.14–0.15 |

Across all four paired runs, large-fixture idle CPU falls **90.7–91.4%**, session p50 falls **38.2–44.1%**, and imports after unrelated writes fall **99.8–99.9%**. All twelve targeted gates pass: at least 50% less large-fixture idle CPU, 90% less unrelated-write import latency and 20% less large-session p50 in every repetition. The smaller fixture also improves: idle CPU falls 64.3–73.8% and session p50 falls 25.9–37.6%.

The accepted trade-off is extra dependency/expiry validation on already-warm imports: roughly **0.04–0.19 ms** added in seven of the eight fixture/run pairs. Warm candidate p50 remains 0.56–1.00 ms across these measurements; one baseline observation was slower than its candidate. This check prevents stale reuse and is small compared with avoiding a 93–574 ms recalculation after unrelated writes. State, journey, market and HTTP measurements show no material consistent regression across both environments; raw comparisons include every operation, including slower individual observations.

Full backend response sizes are unchanged, including the large state (3,472,356 bytes) and session report (2,675,825 bytes). The gains do not come from dropping data. Idle RSS observations also fall, but these short runs do not establish long-term retention or leak behaviour.

An isolated diagnostic records seven full snapshot reads per protection evaluation, down from 37, without reading assets or journal data. One explicit scheduling wave reads 262 full snapshots (53,036 JSON-equivalent bytes), down from 1,472 (124.51 MiB). The probe does not count the new metadata SQL reads, and JSON-equivalent bytes are not physical disk traffic. Instrumentation is absent from timing runs and the production build.

## Browser and correctness checks

GitHub ran six compiled-browser scenarios for each version against the same larger fixture, with Chrome 152.0.7977.82, a visible 1600×1050 headless viewport, two seconds of settling and 35-second observations. ESI collection is disabled here to separate UI/server polling from the real scheduler measured in the backend suite.

| Scenario | Renderer main-thread busy %, v0.7.2 → candidate | Server CPU % of one core, v0.7.2 → candidate | Requests per window, both | DOM nodes, both |
|---|---:|---:|---:|---:|
| Overview | 0.78 → 0.82 | 1.53 → 0.81 | 6 | 467 |
| Assets | 0.33 → 0.33 | 1.17 → 0.49 | 1 | 505 |
| Markets | 0.56 → 0.52 | 1.22 → 0.63 | 10 | 636 |
| Archived session | 0.62 → 0.55 | 1.15 → 0.51 | 3 | 1,138 |
| Empty stream | 0.05 → 0.05 | 1.14 → 0.39 | 0 | 11 |
| Ten stream widgets | 0.28 → 0.33 | 1.13 → 0.45 | 0 | 71 |

Request paths/counts and DOM node counts match, and neither version records long tasks in these idle windows. Server CPU falls 47–66%. Renderer changes are small absolute values with mixed direction; this is not evidence of a frontend speed-up. Each scenario was observed once per version. For example, overview load changes from 951 to 1,124 ms while archived-session load changes from 1,271 to 1,086 ms; these single loads are not reliable startup-regression estimates. Widget mutation counts vary with timer alignment. Renderer busy time excludes other Chrome processes, GPU and compositor work.

All 144 existing baseline tests and all **150 candidate behaviour tests** pass, alongside seven harness tests, TypeScript checks and compilation. New regressions cover snapshot freshness and rollback, protection evidence ownership, unrelated versus relevant cache dependencies, revision reuse after rollback, external database connections, character access, expiry before 30 seconds and concurrent changes during single-flight calculation.

Full decoded response equality passes locally and on GitHub for nine projections at both fixture sizes: protection, snapshots, names, journey, session, market browse, market report, imports and imports after an unrelated write. Another 250 deterministic old/new combat-matching comparisons cover quiet/repeated visits, exact boundaries, overlaps, duplicate killmail IDs, future records and unknown values.

## Production build and review boundary

The final GitHub build compiled v0.7.3, passed session-card browser checks across desktop, intermediate and mobile widths, and passed **150/150 tests with zero skipped or failed** against the extracted ZIP without installed development dependencies. Its layout fixture contains nine cards, four visits and 135 timeline events. The downloaded artifact digest was verified, all 191 included tracked source files match the production commit, and all five optimised modules match the measured candidate byte-for-byte. A further workspace HTTP smoke check of the downloaded ZIP confirms version 0.7.3, compiled assets, the stream renderer and private-API isolation.

[Download the successful GitHub build](https://github.com/BunBajiro/kairo/actions/runs/35334789591/artifacts/10542506416). The same ZIP is delivered as `Kairo-v0.7.3.zip` (1,055,926 bytes; 209 files), SHA-256:

```text
78f33db124d3f34773dab51a04b52a9cd125d66fe813e941db88eb58cb666b36
```

The build includes compiled UI and the standalone runtime. It excludes profiling hooks, the performance harness and its synthetic workloads, traces, benchmark workflows, installed dependencies and local account/database data. Ordinary regression test files remain available, as agreed: startup does not import or run them; only explicit test commands/CI do. They add package size, not normal runtime CPU or memory work.

The implementation branch contains no investigation commits. `main` remains at clean v0.7.2 pending human in-app review. No release is published and no PR is merged. Extract into a new folder, stop the running instance and open `Kairo/START_KAIRO.bat`; Node.js 24 or newer is required, with no npm install or local compilation needed.

## Retained evidence and remaining limits

- [Workspace raw evidence](workspace/) and [GitHub raw evidence](github/) retain both backend repetitions per version, complete samples, comparisons, equivalence and provenance. GitHub also retains both browser JSON reports. These committed files survive Actions artifact expiry.
- [Production verification manifest](production-verification.json) records the build revision, artifact digest, measured-module hashes and packaged HTTP smoke check.
- The comparison Actions artifact contains browser screenshots and full generated reports during its 30-day retention period. The build run separately retains session-layout screenshots.

The work establishes repeatable improvements for the tested workloads. It does not measure Windows-specific timing, Firefox, background tabs, real OBS/Streamlabs, GPU/power, live internet collection, long-duration retention or physical fans. Those are appropriate follow-ups if this release does not account for remaining real-world cost. Broad state payloads and lower-priority UI/query work remain candidates for a later measured pass; preserve front-facing functionality and feel before accepting any further change.
