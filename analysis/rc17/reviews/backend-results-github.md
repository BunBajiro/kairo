# Three-version GitHub backend and mixed-workload results

The same-job comparison confirms that 8.0 RC16 carries more startup work and
residency than post-optimisation 0.7.3. Refined internal RC17 preserves the large
Maps/routing/Session-cadence improvements measured in their dedicated lanes, but
the common-backend lane does **not** establish lower idle CPU or memory. Idle
CPU is higher in both matched RC16→RC17 observations for both profile sizes.
That is an unresolved regression under investigation, not an accepted feature
cost or something dismissed by the larger gains elsewhere.

This review accepts these complete backend measurements from
[run 37078241973](https://github.com/BunBajiro/kairo/actions/runs/37078241973).
The overall run remains **failed** because the compiled Mapper harness raced
Chrome's profile cleanup after its 17 feature checks. Camera, source verification
and evidence packaging still completed. A focused browser correction is separate;
it cannot rewrite this run's conclusion or settle the CPU investigation.

## Exact sources and controls

There are exactly three application versions:

- 0.7.3: `239794774320fcdebaa1d76ce8a77c5c25cfc48c`.
- RC16: `57c8dcc7fbd8fc2b62129498d1819050c78381a1`.
- Internal RC17: `05d0d4b36c154329006d6772769063db874762da`.

One unchanged RC16 version is measured alongside 0.7.3, then alongside RC17.
Keeping those two RC16 observations separate exposes changes in runner
conditions; it does not introduce a fourth version. Harness/workflow commit is
`82394c58d0a7d8987877835b693f31f09c3c0d7f`.

Both comparisons use Node 24.19.0 on the same Linux 6.17 Azure job, AMD EPYC
9V45, two visible logical CPUs and 8,323,969,024 bytes of host memory. The
0.7.3/RC16/RC16/0.7.3 block ran 23:38:19.131–23:43:48.134 UTC on 2 October;
RC16/RC17/RC17/RC16 followed at 23:43:48.395–23:49:17.273. All eight process
environment descriptors match, excluding their expected source commit fields.
Local EPYC 9V74 and previous CI EPYC 7763 observations are not pooled here.

Independent checks verified both complete ABBA records, all source/harness end
guards, sixteen typical/stress profiles, 128 direct operations, 1,280 measured
operation samples and 160 HTTP samples. Each operation has three warmups and
ten measurements. All twelve RC16/RC17 idle profiles record twelve real
Universe tick calls, twelve successes and zero rejected subtasks. All operations,
idle windows and HTTP servers report zero external request attempts. Recomputing
both summary files in temporary copies reproduces the retained summaries exactly.

The typical workload has one pilot, 2,000 assets, 10,000 events, 300 visits,
600 combat records, 50 Sessions and 1,000 market types. Stress has four pilots,
20,000 assets, 50,000 events, 2,000 visits, 4,000 combat records, 200 Sessions and
5,000 market types. Shared workload fingerprints match across both comparisons.
Real scheduler timing remains active; public data is held warm, and SDE automatic
start is deferred. These are controlled workloads, not a fresh-install benchmark.

The candidate prepares exactly 100 pilot/system discovery memberships before
timing, matching the migration that would encounter existing legacy visits.
The old Journey operation is explicitly a cold compatibility reader; it is not
active lifetime logging or the new Universe hot path. The corrected historical
storms object and real feed-success guards remain unchanged.

## Common metrics, with the RC16 measurements kept separate

Values are ranges of two observations. Operation values are per-run medians or
the explicitly labelled p95; startup is one start per profile, and idle metrics
describe 35-second windows. CPU is percent of one logical core. Ten-sample p95
is the largest sample, not a population-tail estimate.

### Typical profile

| Metric | 0.7.3 | RC16 (0.7.3 comparison) | RC16 (RC17 comparison) | Internal RC17 |
|---|---:|---:|---:|---:|
| Initialisation, ms | 16.21–16.31 | 141.70–144.40 | 145.87–184.50 | 143.98–151.27 |
| Idle CPU, % one core | 0.567–0.578 | 0.859–0.912 | 0.595–0.632 | 0.683–0.881 |
| Idle RSS, MiB | 93.67–94.14 | 184.05–184.45 | 183.74–183.89 | 183.80–184.00 |
| Maximum idle loop delay, ms | 13.52–13.66 | 21.04–25.85 | 16.99–23.87 | 24.02–24.22 |
| State HTTP p50, ms | 7.72–9.10 | 8.36–8.61 | 7.54–8.01 | 7.91–8.47 |
| State HTTP p95, ms | 16.54–28.85 | 19.04–26.42 | 13.24–22.23 | 14.33–18.07 |
| Session report p50, ms | 12.15–12.67 | 11.73–11.86 | 9.94–10.61 | 10.42–11.18 |
| Session report p95, ms | 21.11–21.17 | 13.94–17.05 | 13.69–14.46 | 14.29–15.78 |

### Stress profile

| Metric | 0.7.3 | RC16 (0.7.3 comparison) | RC16 (RC17 comparison) | Internal RC17 |
|---|---:|---:|---:|---:|
| Initialisation, ms | 18.52–18.87 | 141.89–146.44 | 130.12–141.23 | 144.14–145.07 |
| Idle CPU, % one core | 0.889–1.121 | 1.537–1.564 | 1.206–1.209 | 1.431–1.454 |
| Idle RSS, MiB | 125.40–126.30 | 202.41–203.70 | 201.95–223.84 | 203.82–221.97 |
| Maximum idle loop delay, ms | 29.79–31.49 | 44.96–50.43 | 45.71–49.64 | 45.45–49.81 |
| State HTTP p50, ms | 32.21–35.96 | 28.48–31.37 | 28.38–29.77 | 32.00–32.27 |
| State HTTP p95, ms | 37.92–50.75 | 35.29–36.42 | 38.19–42.08 | 35.16–37.49 |
| Session report p50, ms | 63.26–64.59 | 65.68–66.57 | 58.25–61.83 | 65.10–66.66 |
| Session report p95, ms | 72.46–76.16 | 78.43–93.84 | 86.26–89.62 | 95.26–121.22 |

The same RC16 code records lower idle CPU in the second comparison than the
first. That makes a single three-point trend or ratio chaining misleading. It
does not erase the **within-comparison** candidate increase: typical is +0.088
and +0.248 percentage points (+27.43% by means); stress is +0.225 and +0.245
points (+19.47% by means). Those correspond to additional CPU work within the
same fixed windows. No cause is assigned from aggregate counters alone. The
checkpoint remains open for periodic-work/window/CPU attribution.

Typical maximum loop delay rises in both pairs, but only one exceeds both 10%
and 1 ms. Stress maximum loop delay moves in opposite directions. The initial
local repeatable typical HTTP-tail signal does not reproduce as a two-pair
regression here. This is neither a universal event-loop improvement nor a reason
to delete the earlier local observations.

Stress state HTTP medians rise +10.52% by means (+2.23/+3.89 ms); one pair is
only +7.50%, the other +13.70%. Stress Session report medians rise +9.72%
(+4.83/+6.84 ms), and Session p95 rises +23.08%, driven in part by one
121.22-ms maximum. These do not meet the checkpoint's repeated >10% **and**
>1-ms latency rule in both pairs, but are still adverse measurements worth
retaining. No common-backend latency row meets that two-pair flag in this run;
that statement is **not** a no-regressions claim, especially for idle CPU.

The stress state projection p50 is 14.19–14.74 → 15.38–15.73 ms. Typical state
projection is slightly lower. Imports after an unrelated write remain below
0.9 ms in the candidate, preserving selective cache reuse. Full values are in
the [historical summary](../raw/github-run-37078241973/legacy-corrected/summary.json)
and [RC17 comparison summary](../raw/github-run-37078241973/backend/summary.json).

RSS is essentially unchanged in the candidate comparison, including substantial
stress spread. `startKairo` initialisation excludes module import and supervisor
startup; mixed pair directions make its percentage unsuitable as a blanket
startup claim. The separate memory lane retains nearly unchanged collected heap
and variable CI import timing. It does not erase the local +5.16-ms import
residual. No combined CPU/memory saving is established by this common workload.

## Mixed-workload latency and traffic

The candidate's fresh two-CPU CI windows complete quiet → loaded → loaded → quiet.
The previous full RC16 CI attempts failed continuity, so there is **no complete
paired CI mixed baseline** from which to claim a CI speedup. These values describe
the successful candidate workload; the different-date local comparison remains
separately qualified in [the local review](backend-mixed-results-local.md).

| Candidate observation | Quiet windows | Loaded windows |
|---|---:|---:|
| Dashboard HTTP p95 | 57.16–93.06 ms | 102.01–104.04 ms |
| Stream-state HTTP p95 | 81.09–85.37 ms | 98.61–109.19 ms |
| Four 50-stop plans, per-window p50 | Not submitted | 31.98–32.33 ms |
| CPU, % one core | 4.61–4.76% | 7.00–7.23% |
| Maximum server loop delay | 154.66–162.00 ms | 162.79–179.83 ms |

All 296 requests return HTTP 200 and all eight plans retain 50 segments. The
eight complete 3,262,964-byte asset frames reach continuously connected SSE
consumers. Every window still runs 29 unchanged binding boundaries, but sends
five OBS states with zero duplicates and 14,179 OBS bytes; dashboard traffic
remains 8,087,283/8,087,783 bytes in quiet/loaded windows. No reduction in all
dashboard traffic is claimed.

The [independent stream/restart review](stream-restart-results-github.md) validates
fresh/stale OPSEC ordering, full protocol bytes, zero external activity and
post-close ownership. It also accepts both positive managed-restart scenarios.
These successes address the diagnosed large-frame continuity and accepted-work
loss conditions on this constrained CI runner; they do not certify physical OBS,
all sensitive payload fields or all future backpressure patterns.

## Retrieval and open disposition

The [raw artifact and retrieval record](../raw/github-run-37078241973/) retain
both backend families, all other lanes, exact job logs, the failed run conclusion
and the 78-file immutable extraction inventory. Raw ZIP SHA-256 is
`8ff4be58d46fa5ddb1af7e322ec9ff98041afcfc83626703c6d561cd0df681e9`.
The internal bundle's outer ZIP and inner tar/inventory also verify; its
`allComparisonLanesPassed` is correctly false. A separate combined gate record
may join valid unchanged measurements with a successful focused browser cleanup
rerun, while preserving both original per-run statuses.

**The optimisation review remains open for idle-CPU attribution.** Passing
mechanical measurement/correctness gates is distinct from accepting the observed
performance trade-offs, and no clean release preparation is cleared by this
report.
