# Refined candidate: memory and Sessions verification

The accepted rerun supports keeping the route allocation change: the direct
10,000-visit route regression is gone, with both candidate medians below their
paired RC16 observations. Lazy formatter construction removes most of the
initial candidate's additional import time, but **a 5.16 ms / 12.81% cold Core
import overhead remains** in this accepted run. Retained memory is essentially
unchanged by these two refinements; this is not a memory-footprint reduction.

## Accepted evidence and excluded attempts

Accepted evidence is
[`local-refined-memory-3/memory`](../raw/local-refined-memory-3/memory/):

- RC16: `57c8dcc7fbd8fc2b62129498d1819050c78381a1`.
- Refined candidate: `05d0d4b36c154329006d6772769063db874762da`.
- Both source manifests are clean and match their child results and end checks.
- Immutable [completion record](../raw/local-refined-memory-3/memory/memory-all-completed.json)
  SHA-256: `9681b510fcb6f0697b7df73e97c3a1dfda086c65464b167e2e360a300a79ef9e`.
- [Summary](../raw/local-refined-memory-3/memory/memory-summary.json) cites that
  exact completion digest. Independent review verified all 14 result digests,
  matching source fingerprints, child completion/end checks, zero external
  network attempts and five cross-build semantic fixture comparisons.

The memory outputs in `local-refined-1` and `local-refined-memory-2` are retained
but **not accepted as completed benchmark evidence**. Their mutable progress
manifest remained incomplete and its digest differed from the complete manifest
cited by the generated summary. The cause is unproved. Individual child checks
do not repair that missing final record, and none of their timing values are used
below. Their raw files were not rewritten.

The harness now writes progress through temporary-file replacement and publishes
a separate schema-2 completion record exactly once, only after the existing final
source and harness checks succeed. The summarizer requires that record for new
runs. Measurement loops and semantic assertions are unchanged. A static protocol
test confirmed incomplete progress alone is rejected and a valid completion
record remains authoritative if progress is stale.

Historical initial-candidate evidence remains in
[`local-comparison-2/memory`](../raw/local-comparison-2/memory/) and
[its original report](memory-results-local.md). That candidate was
`059b95909dffa82f8b10dfd266954323147d7580`. These are successive ABBA blocks, not
one interleaved three-version experiment; refinement attribution is supported
by the code change and observed direction, not established by a factorial test.

## Sessions

Each entry below is the range of two independent per-process medians in
milliseconds; each process uses three warmups and seven measured calls. The
percentage compares the median of each pair. Small-n descriptive results do not
provide confidence intervals.

| Fixture and operation | Matched RC16 | Refined candidate | Change |
|---|---:|---:|---:|
| 100 visits: direct route | 0.677–0.693 | 0.606–0.649 | −8.46% |
| 1,000 visits: direct route | 5.021–5.252 | 5.284–5.783 | +7.72% |
| 10,000 visits: direct route | 48.957–50.917 | 47.127–47.197 | −5.56% |
| 10,000 visits: route and combat request groups | 53.370–53.733 | 50.245–52.570 | −4.00% |
| 100 in-window plus 10,000 older visits: direct route | 0.461–0.463 | 0.417–0.508 | +0.03% |
| 10,000 visits: live feed before its next deadline | 51.040–53.654 | 0.003295–0.003375 | −99.994% |
| Four pilots × 1,000 visits: feed before deadline | 20.264–21.003 | 0.003275–0.003375 | −99.984% |

The initial candidate's direct 10,000-visit route was 53.897–55.727 ms against
48.210–50.052 ms RC16, a repeatable +11.56% aggregate regression. The refined
candidate's pair median is 13.96% below that earlier candidate median while its
matched RC16 baseline remains close to the earlier baseline. This supports the
narrow allocation change, rather than removing the new ownership guard.

Direct routes already performed one bounded SQL read; they did not execute the
extra JavaScript filter used when a report supplies prepared rows. The refinement
removes a redundant array and per-visit object copies used only to normalize
names. The final output projection resolves the same name fallback. SQL,
timestamps, ordering, nullable legacy ownership, prepared foreign-row filtering
and sovereignty decoding are unchanged. Frozen-input regression tests check
both paths, full output fields, equal-time rows and synthetic starts; the final
combined suite passed 771 tests.

The largest recurring improvement remains the earlier deadline check in the live
feed. Three not-due calls now return **zero visit rows**, compared with 30,000 for
the 10,000-visit RC16 fixture, while ordinary route calls still return those
30,000 rows. Microsecond no-op timings are near harness overhead; the robust
conclusion is that unnecessary target construction and SQL work have stopped.

The benchmark preserves system/time/duration/active route fields and combat
request-group hashes across five fixtures. It is not a full report/replay JSON
equivalence proof; the regression suite separately covers ownership, historical
sovereignty, event cursors and report/replay boundaries. Not every small fixture
is faster: the 1,000-visit direct route is about 0.397 ms slower, and the
100-visit route-plus-groups result is about 0.100 ms slower. Neither meets the
checkpoint's combined 10% and 1 ms repeatable-regression threshold.

## Cold import and formatter hypothesis

| Phase, milliseconds | Historical RC16 | Initial candidate 059 | Matched RC16 rerun | Refined candidate 05d |
|---|---:|---:|---:|---:|
| Core module import | 41.311–41.346 | 59.889–65.175 | 38.274–42.346 | 44.023–46.925 |
| Core construction after import | 132.506–138.120 | 128.030–131.688 | 117.397–119.757 | 120.611–123.357 |

The import phase's candidate median fell from 62.532 to 45.474 ms after the
shared `Intl.NumberFormat` moved from eager module construction to first use.
The matched import gap narrowed from 21.203 to 5.164 ms, supporting the hypothesis
that eager formatter initialization caused most of the added cold cost. The
remaining gap is **12.81%**, and both paired comparisons exceed 10% and 1 ms;
retain it as a small absolute startup regression, not a parity claim.

Import plus construction in this rerun is 158.887 ms RC16 versus 167.458 ms
candidate, a difference of 8.571 ms / 5.39%. Lazy creation defers first formatting
work; it does not eliminate that work. This fixture has four pilots, empty public
activity, no live sessions or populated maps, and no formatted stream widgets.
It measures fresh-process module work without HTTP/supervisor startup or cold
disk caches, not end-user launch time or the first formatted widget's latency.

## Retained memory

Forced-GC diagnostics remain separate from ordinary allocation snapshots.

| Retained heap marker, MiB | RC16 | Refined candidate | Difference |
|---|---:|---:|---:|
| Core constructed | 40.541 | 40.726 | +0.185 |
| Core closed after detail/state workload | 34.855 | 35.063 | +0.207 |
| Recreate/use/close cycle 10 | 35.271 | 35.501 | +0.229 |

The candidate's constructed retained heap is about 0.46% above RC16 and nearly
identical to the initial candidate's 40.726 MiB. Removing transient route copies
and deferring a formatter is not expected to remove Kairo's topology or service
residency. Cycle 1→10 grows by approximately 0.405 MiB RC16 and 0.425 MiB
candidate; this short diagnostic does not establish an unbounded leak. Module
singletons and the bounded celestial cache intentionally survive Core shutdown.
RSS reflects allocator/process residency and must not be called retained JS size.

The earlier [0.7.3→RC16 memory attribution](../../rc16/reviews/followup-memory.md)
still explains the larger feature-era residency increase. This refined run
confirms that the optimisation pass has not materially reduced that footprint.
