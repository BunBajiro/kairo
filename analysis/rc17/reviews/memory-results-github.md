# GitHub confirmation: memory and Sessions

GitHub run [37078241973](https://github.com/BunBajiro/kairo/actions/runs/37078241973)
confirms that not-due live-feed checks avoid route construction, and that the
refined candidate's 10,000-visit route is faster than matched RC16 on this runner.
Retained memory remains close to RC16. Cold-import measurements vary too much
between the two RC16 observations to establish a consistent improvement or
regression here; the separately recorded local startup finding remains visible.

## Independent evidence checks

Accepted [memory evidence](../raw/github-run-37078241973/memory/) compares:

- RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1`.
- Refined internal candidate `05d0d4b36c154329006d6772769063db874762da`.
- Node 24.19.0, Linux x64, AMD EPYC 9V45, two logical CPUs.

The schema-2 [immutable completion record](../raw/github-run-37078241973/memory/memory-all-completed.json)
is complete and end-verified. Its SHA-256 is
`a2c8f0cea9ed2e406e269e021adf725ad50ab729b6ca8b52617bff68a13c5303`,
matching the digest in the [summary](../raw/github-run-37078241973/memory/memory-summary.json).
The run ID is `bc0cf9d8-0bd5-4e61-a9ad-6019e2e7c8f7`.

Independent review verified all 14 child-file hashes, successful exits,
completion and source-end guards, matching commits/fingerprints, consistent
environment and zero external network attempts. Both clean source-manifest
fingerprints recompute from their recorded source/build inventories. The five
Session fixture groups have matching route lengths, combat-group counts and
recorded route/group semantic digests across timing and diagnostic children.
All memory-marker and Session summary aggregates were recomputed from the child
files and match the published summary. Raw evidence was not edited.

## Session results on this GitHub runner

Ranges are the two independent per-process medians, in milliseconds. Each
process performs three warmups and seven measured calls; the percentage uses
the median of the two process medians. These descriptive small-n results are
not confidence intervals.

| Fixture and operation | RC16 | Refined candidate | Change |
|---|---:|---:|---:|
| 100 visits: direct route | 0.594–0.639 | 0.434–0.461 | −27.46% |
| 1,000 visits: direct route | 3.638–3.646 | 3.570–3.670 | −0.62% |
| 10,000 visits: direct route | 39.008–40.964 | 33.899–35.304 | −13.47% |
| 10,000 visits: route and combat request groups | 37.288–39.076 | 35.729–36.422 | −5.52% |
| 100 in-window plus 10,000 older visits: direct route | 0.339–0.356 | 0.298–0.309 | −12.65% |
| 10,000 visits: live feed before its next deadline | 38.494–39.179 | 0.003886–0.003966 | −99.990% |
| Four pilots × 1,000 visits: feed before deadline | 14.999–15.576 | 0.003916–0.003946 | −99.974% |

The SQL diagnostics provide the strongest evidence for the live-feed change:
three not-due calls return **zero visit rows and issue zero SQL statements** in
every candidate fixture. RC16 returns 30,000 rows for the 10,000-visit fixture,
and 12,000 rows for the four-pilot fixture. Ordinary direct route construction
still reads the required in-window visits in both builds. Adding 10,000 older
visits does not increase the returned route rows for the 100-visit window.
Microsecond no-op timing percentages should not be treated as precise user
latency promises.

The initial local candidate 059 had a +11.56% direct 10,000-visit regression.
The narrow follow-up removed redundant intermediate visit copies while retaining
ownership checks and name fallback behavior. The accepted refined local run
showed −5.56% against its matched RC16; this GitHub pair independently shows
−13.47%. The direction supports retaining the refinement. These percentages
belong to different hosts and are **not pooled** into a combined speedup.

The semantic comparison covers system/time/duration/active route fields and
combat request-group hashes. It does not claim full report/replay JSON equality.
Existing regression tests separately cover legacy and session ownership,
sovereignty, end boundaries, equal-time ordering, delayed observations and
report/replay cursors. The route remains proportional to actual timed visits;
repeated visits are meaningful presence evidence and are not collapsed.

## Cold-import variability

These fresh-process observations occurred in the following ABBA order:

| Phase, milliseconds | RC16 first | Candidate first | Candidate second | RC16 last |
|---|---:|---:|---:|---:|
| Core module import | 59.453 | 37.507 | 40.764 | 32.709 |
| Core construction after import | 225.226 | 141.843 | 120.174 | 124.908 |

Import comparisons disagree in direction: candidate import is faster against
the first RC16 observation but 8.06 ms slower against the last. A lower aggregate
candidate import number would obscure that variability. This CI run therefore
does not establish a consistent startup improvement, and it does not erase the
accepted local result of +5.16 ms / +12.81% residual import cost.

The local before/after evidence supports deferring the shared formatter as the
removal of most additional eager import work; GitHub compares only RC16 with the
already-refined candidate. No claim is made that the deferred first formatting
cost disappears. The fixture has four pilots, empty public activity, no live
sessions, no populated maps and no formatted stream widgets. These phases
exclude HTTP/supervisor startup and do not represent complete user launch time.

## Retained heap and scope

Forced-GC diagnostics are separate from ordinary allocation snapshots.

| Retained heap marker, MiB | RC16 | Refined candidate | Difference |
|---|---:|---:|---:|
| Core constructed | 40.540 | 40.726 | +0.186 |
| Core closed after detail/state workload | 34.853 | 35.063 | +0.210 |
| Recreate/use/close cycle 10 | 35.269 | 35.501 | +0.232 |

The approximately 0.46% constructed-heap difference agrees with the accepted
local result. There is no meaningful footprint reduction to claim. Cycle 1→10
growth is approximately 0.405 MiB RC16 and 0.425 MiB candidate, also consistent
with the local diagnostic. This short exercise neither proves a leak nor proves
that every long-running workload is leak-free. Module singletons and bounded
detail caches intentionally remain after Core shutdown; RSS includes allocator
and native residency and must not be described as retained JavaScript size.

For the larger 0.7.3→RC16 feature-era residency increase, retain the earlier
[memory attribution](../../rc16/reviews/followup-memory.md). For the accepted
local refinement, startup residual and excluded provenance-invalid local
attempts, see [the refined local report](memory-results-refined.md). This report
adds GitHub confirmation and does not overwrite those historical findings.
