# Idle refinement: independent GitHub backend comparison

**Verified 3 October 2026.** The focused backend comparison in
[run 37083252892](https://github.com/BunBajiro/kairo/actions/runs/37083252892)
records lower CPU than matched RC16 in both repetitions of both workload sizes.
The new candidate removes unnecessary repeated protection refreshes and unused
feed-state projections while retaining the original scheduling and freshness
contracts. The run also identifies a repeated adverse stress state-projection
tail signal. That remains an open performance issue; it is not cancelled out
by the idle gains.

## Sources and controls

- RC16: `57c8dcc7fbd8fc2b62129498d1819050c78381a1`.
- Refined internal candidate: `fa6e852b76089b51cd552fa202de85ad6948b0ec`.
- Analysis/workflow commit: `2ea1a999fb2e366b2381b84615b8affa09aca3a8`.
- Candidate source/build fingerprint:
  `39b0f3e5bb815d4455dada3db3f891b90393159c2674d1ac572aebb199cc34a6`.

The runner is Linux/Azure, AMD EPYC 9V74 with two visible logical CPUs and Node
24.19.0. Both checkouts are clean and built before measurement. The workflow
passes type checks and all **781** runtime tests. Its only timing lane is the
original backend RC16/candidate/candidate/RC16 comparison. Every backend adapter
hash matches full run `37078241973`; the workload was not rewritten to favor the
refinement.

This is the original **startup-inclusive idle observation**: one second of
warm-up followed by a 35-second window, with the real scheduler, corrected warm
public-feed fixtures and deferred automatic SDE startup. It is distinct from
the separately instrumented diagnostic windows and settled three-window ABBA.
Startup queue work can fall inside this meter. No measurement is pooled across
these methods, with local results, or with the older GitHub host. This run does
not directly compare `05d0d4b` with `fa6e852` or remeasure 0.7.3.

Independent verification checked all eight profiles, 64 direct operations,
640 timed operation samples and 80 HTTP samples. Each operation retains three
warmups and ten measurements. Workload fingerprints and environment/settings
match across the four processes. Every profile has valid explicit feed state,
12 audited tick calls, 12 successes and no rejected subtasks. All idle,
operation and HTTP network-attempt counters are zero. These original tick
counters are cumulative since their observer was installed; they are not
presented as exact meter-window deltas. Session/report, asset-count and market
fixture assertions remain intact. Recomputing all four summary files reproduces
the retained bytes exactly. Full decoded cross-version output equality is not
claimed by this common-workload harness.

## CPU and recurring stalls

CPU is percent of one logical core. Ranges are two observations, not confidence
intervals. The paired differences preserve each baseline/candidate pairing.

| Profile | RC16 CPU | Candidate CPU | Paired change, percentage points | Change of means |
| --- | ---: | ---: | ---: | ---: |
| Typical | 0.9463–0.9583% | 0.5314–0.7524% | −0.4149 / −0.2059 | −32.60% |
| Stress | 2.1638–2.1681% | 1.7458–1.8401% | −0.3237 / −0.4223 | −17.22% |

| Process | Typical CPU time / audited ticks | Stress CPU time / audited ticks |
| --- | ---: | ---: |
| RC16 first | 331.250 ms / 12 successful | 757.417 ms / 12 successful |
| Candidate first | 186.177 ms / 12 successful | 644.150 ms / 12 successful |
| Candidate second | 263.370 ms / 12 successful | 611.092 ms / 12 successful |
| RC16 second | 335.440 ms / 12 successful | 758.867 ms / 12 successful |

Maximum idle loop delay also falls in both pairs: typical
23.63–26.13 → 14.34–15.29 ms; stress 83.95–84.87 → 52.63–71.83 ms. These are
bounded observed maxima, not a production-latency guarantee.

The result supports the refined candidate's lower recurring CPU cost against
RC16 under the unchanged startup-inclusive workload. The earlier `05d0d4b`
increase remains a valid observation of that source and run. This new result
does not prove that the repeated work removed here was the specific cause of
its increase: source/counting diagnostics found much of that work in both
RC16 and the earlier candidate. It establishes that avoidable work could be
removed without slower polling or discarding the previous adverse evidence.

## Remaining adverse and neutral metrics

| Stress metric | RC16 | Candidate | Change of means |
| --- | ---: | ---: | ---: |
| State projection p50 | 26.49–26.68 ms | 26.84–28.06 ms | +3.25% |
| State projection p95 | 30.40–31.70 ms | 34.27–43.59 ms | +25.36% |
| State HTTP p50 | 46.16–48.93 ms | 50.30–52.61 ms | +8.23% |
| State HTTP p95 | 57.88–58.48 ms | 57.95–61.74 ms | +2.86% |
| Session report p50 | 105.61–108.43 ms | 110.91–115.55 ms | +5.81% |
| Session report p95 | 140.91–141.98 ms | 144.73–148.72 ms | +3.74% |

**The state-projection p95 increase meets the checkpoint's repeated >10% and
>1 ms signal rule:** the paired increases are +3.87 ms/+12.72% and
+11.88 ms/+37.48%. It is the only row meeting that repeated latency rule in
this run. Ten-sample nearest-rank p95 is the largest sample, so this identifies
a tail-cost investigation rather than estimating a stable production p95. The
limited sample count does not dismiss the repeated signal.

For context only, the earlier `05d0d4b` comparison on its own GitHub runner had
stress state-projection p95 pairs 24.58 → 19.58 ms and 18.80 → 21.59 ms: mixed
directions, without a repeated tail flag. Its state-projection median was
7.53% higher by means. The direct measured reader (`core.snapshots`, names,
and full JSON serialization) is unchanged by the latest `fa6e852` diff. This
makes the wider state-projection concern pre-existing, while its repeatable
tail signal is newly established in the present comparison. Scheduling,
allocation and other earlier RC17 changes can still influence that path; its
cause is unresolved. No cross-run causal claim, ratio chaining or assertion
that the refinement introduced the tail cost follows.

Typical state HTTP p50 is essentially flat and p95 falls
28.97–31.81 → 20.98–21.48 ms. Initialisation changes by about −1.00% typical
and −0.67% stress by means, with mixed pair directions; no startup improvement
is established. Typical RSS pair directions also differ. Stress ordinary idle
RSS is lower, 222.36–222.84 → 189.51–202.13 MiB, but this focused meter has no
forced-GC attribution and does not establish a general live-heap saving or
memory-retention solution. Full operation values remain in the raw summary.

## Retrieved evidence and internal bundle

The raw-evidence ZIP is 96,411 bytes, SHA-256
`b052ced8bf78db62aade26451aa476821b092b0dd3afb12e1dcc1e4ffc7b6519`.
All 16 extracted artifact files were checked and inventoried. Job logs retain
the successful 781-test result, source guards, measurement and packaging steps.

The internal bundle ZIP is 31,468,048 bytes, SHA-256
`000603647c14c5d6261a0777311589c8dd2df02416ac8ea4c9aa68181fb410c8`.
Its verified inner tar is 31,512,288 bytes, SHA-256
`27903bcb347f66f9593046b656027ff924014d9c603e6c72d2341129aef1d3ee`;
all **1,239** inventory files verify. The runtime and metadata identify
`fa6e852`, with the source/build fingerprint above. Metadata correctly says
`requestedSuite: backend`, `allComparisonLanesPassed: false` and
`releaseReady: false`. There is no combined browser acceptance for this new
source. The earlier exact-browser gate belongs to `05d0d4b` and is not silently
transferred to the refinement.

The [raw evidence](../raw/github-run-37083252892/), independent verification and
bundle verification records support this scoped result. The bundle's report is
the pre-retrieval packaging revision; the canonical whitepaper is updated
separately. This is an internal checkpoint handoff with an explicit remaining
state-tail issue, not clean release preparation or approval to merge 8.0.
