# RC17 candidate: local bounded memory and Sessions results

The candidate removes the repeated route construction from live-feed checks that
are not due. It does **not** reduce the minimal Core's retained memory budget in
this sample. A separate direct 10,000-visit route operation becomes modestly
slower and is retained as a comparison signal, despite the much larger saving on
the recurring not-due path.

## Identity and completion

- Baseline: canonical RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1`.
- Candidate: `059b95909dffa82f8b10dfd266954323147d7580`.
- Both source checkouts are clean. The manifests cover 407 baseline source files
  plus 20 built assets, and 439 candidate source files plus 24 built assets.
- Evidence: [run manifest](../raw/local-comparison-2/memory/memory-all-run.json),
  [summary](../raw/local-comparison-2/memory/memory-summary.json), and all fourteen
  child outputs in the same directory.
- Node 24.19.0, Linux x64, AMD EPYC 9V74, nine visible logical CPUs. Do not pool
  these observations with earlier local or two-CPU GitHub results.
- The run manifest spans 22:57:01.447–22:57:20.062 UTC on 2 October 2026
  (18.615 seconds, excluding runner startup). Every child completed, reported zero
  external attempts, and verified its initial source/build manifest at the end.
  All fourteen output hashes and six harness/helper hashes independently match.

Ordinary residency, forced-GC attribution and Session timings each use fresh
RC16 → candidate → candidate → RC16 children. Two separate children collect SQL
diagnostics. Timing uses three warmups and seven samples per operation; retained
heap measurements never supply timing claims. Five fixture-level route/combat
semantic comparisons match across all repetitions.

## Not-due live-feed work

The fixture uses the real `sessionCombat.syncLive()` path with its feed deadline
one hour ahead. It includes preserved legacy visit rows, one minute apart,
cycling through 100 systems. Each original timed presence interval survives.

| Fixture | RC16 not-due median range | Candidate not-due median range | Visit rows read across three diagnostic calls, RC16 → candidate |
|---|---:|---:|---:|
| One live Session, 100 visits | 0.688–0.707 ms | 0.0046–0.0047 ms | 300 → 0 |
| One live Session, 1,000 visits | 5.464–5.731 ms | 0.0034–0.0058 ms | 3,000 → 0 |
| One live Session, 10,000 visits | 51.307–51.903 ms | 0.0034–0.0037 ms | 30,000 → 0 |
| 100 in-window visits plus 10,000 older visits | 0.589–0.593 ms | 0.0033–0.0034 ms | 300 → 0 |
| Four live Sessions, 1,000 visits each | 20.830–22.298 ms | 0.0033–0.0034 ms | 12,000 → 0 |

Every candidate not-due diagnostic performs **zero SQL statements**, not just
zero returned visits. The strong conclusion is removal of history-dependent work
from this recurring ineligible path. At a few microseconds, portable speedup
ratios would imply more timing precision than this probe provides.

The 10,000-visit fixture represents an extreme 6.94-day live Session. The
older-history fixture confirms that ordinary route retrieval remains bounded to
the Session window. Combat request groups remain deduplicated by
system/year/month; visits are not collapsed merely because a system is revisited.

Both implementations still return the full route when explicitly requested. The
10,000-visit route has an identical 3,087,894-byte serialized size. Its
system/time/duration/active hash and full combat-group hash match, as do the
other four fixtures. These hashes do not prove whole Session report, replay,
sovereignty or ship-field equivalence; dedicated production tests cover those
contracts.

The candidate's discovery table is explicitly seeded from the legacy rows before
measurement, reproducing a real upgrade. Exact membership is 100 pilot/system
pairs in the single-pilot fixtures and 400 in the four-pilot fixture. This avoids
an artificial empty-discovery candidate caused by inserting synthetic visits
after the one-time migration has already run. Old visit ownership remains NULL,
as intended for preserved legacy evidence.

## Direct route caveat

The candidate's direct `sessionRoute()` operation at 10,000 visits measures
**53.897–55.727 ms**, compared with **48.210–50.052 ms** in RC16: +11.56% by the
ratio of the two run means. Both paired observations exceed 10% and 1 ms. The
candidate's route-plus-combat-groups operation is 54.723–59.800 ms versus
53.903–54.677 ms; its two repetitions do not meet that same repeated threshold.

Both direct route paths issue one bounded query and return exactly 10,000 rows.
The candidate query adds explicit Session ownership filtering while accepting
legacy NULL-owned rows. This proves the preserved scope and added policy, but
does not by itself isolate the extra latency to the SQL predicate. Smaller
fixtures remain broadly similar. Retain this extreme explicit-read signal in
the final report and assess it alongside the full Session report's shared-read
result, rather than calling all Session operations faster.

## Core import and ordinary allocation

The minimal fixture has four synthetic pilots, small current snapshots, no
assets, user map nodes or live Sessions, and collectors disabled. It does not
start HTTP or the updater supervisor.

| Ordinary phase | RC16 | Candidate |
|---|---:|---:|
| Core module import elapsed | 41.311–41.346 ms | 59.889–65.175 ms |
| Core construction elapsed after import | 132.506–138.120 ms | 128.030–131.688 ms |
| Constructed process RSS | 114.414–116.789 MiB | 124.172–124.406 MiB |
| Constructed JS heap used | 47.273–54.129 MiB | 54.085–54.141 MiB |
| Constructed external memory | 4.540 MiB | 9.405 MiB |

The candidate import phase is approximately 21 ms slower on average; subsequent
construction is approximately 5 ms faster. These component phases are not a
complete packaged startup measurement. Ordinary snapshots include uncollected
allocations and temporary buffers. Their higher RSS/external allocation must not
be described as the amount of retained application state.

## Separate collected-heap attribution and closure

These values are the medians of two fresh forced-GC children, in MiB. Each marker
follows event-loop yields and two explicit collections.

| Diagnostic stage | RC16 JS heap | Candidate JS heap | RC16 RSS | Candidate RSS |
|---|---:|---:|---:|---:|
| Core module imported | 11.83 | 12.01 | 54.66 | 58.35 |
| Explicit topology first load | 28.17 | 28.35 | 98.05 | 102.26 |
| Core constructed | 40.54 | 40.73 | 114.57 | 117.79 |
| 80 additional pilot state pairs | 40.93 | 41.13 | 133.00 | 136.64 |
| Lightweight details across the atlas | 44.63 | 44.84 | 136.60 | 140.13 |
| 384 distinct celestial details visited | 45.39 | 45.59 | 140.91 | 144.07 |
| Core closed, reference released | 34.85 | 35.06 | 136.98 | 140.14 |

Topology adds about 16.34 MiB of collected JS heap in both builds. Core
construction after topology adds about 12.37 MiB in both. The candidate's
constructed held heap is about 0.19 MiB higher, and post-close held heap is about
0.21 MiB higher. This lane supports a largely unchanged topology/cache/Core
budget, not a measured memory optimisation.

Lightweight details remain bounded by the finite atlas and celestial details by
the existing 48-entry LRU. Shape/identity controls validate real work, including
124 Universe state responses, 124 J-space responses, 9,490 light details,
384 celestial details and ten Core recreation cycles per retention child.

The artificial same-process recreation pattern still grows process residency:

| Post-close cycle | RC16 heap used / heap capacity / RSS | Candidate heap used / heap capacity / RSS |
|---|---:|---:|
| 1 | 34.87 / 100.70 / 137.61 MiB | 35.07 / 100.95 / 140.43 MiB |
| 5 | 35.01 / 164.07 / 166.21 MiB | 35.22 / 164.45 / 169.67 MiB |
| 10 | 35.27 / 164.45 / 197.19 MiB | 35.50 / 164.82 / 200.27 MiB |

Both retain roughly another 0.4 MiB of live JS over cycles 1–10 while V8 heap
capacity expands by about 64 MiB and RSS by about 60 MiB. The candidate preserves
this pattern rather than resolving it. Much of per-Core JS becomes collectible,
but these snapshots neither prove a leak nor establish a residency plateau.
Shared module caches remain process-owned; normal managed replacement uses a
fresh child process. Positive restart evidence is therefore the relevant normal
activation gate, alongside this explicitly artificial reconstruction diagnostic.

No additional benchmark was run while writing this review. The evidence does
not justify a broad cache/GC rewrite or a general claim of lower memory usage.
