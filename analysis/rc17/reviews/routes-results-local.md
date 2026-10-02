# RC17 route preparation and isolated latency — local refined comparison

The repeated per-stop preparation cost is removed. On the same local host, the
50-stop itinerary median fell from **737–745 ms in RC16 to 33.2–33.6 ms** in the
refined candidate, about **95.5% lower** across both repetitions. Every returned
plan matched RC16 exactly. This is an isolated backend result, not a claim that
the complete UI or mixed workload improved by the same factor.

## Evidence and method

- Raw evidence: [results.json](../raw/local-refined-1/routes/results.json).
- Baseline: canonical RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1`.
- Candidate: `05d0d4b36c154329006d6772769063db874762da`.
- Both application checkouts were clean. Source/build file sets and harness
  hashes passed end verification; the lane reports `complete: true`.
- Environment: Node v24.19.0, AMD EPYC 9V74, nine reported logical CPUs. Local
  results must not be pooled with GitHub Actions timings or other hosts.
- Order: RC16 / candidate / candidate / RC16, each in a fresh child process.
  Two warmups and nine uninstrumented samples per size; the second pair reverses
  the order of the 1/10/50-stop cases. Raw samples remain in the evidence file.
- The real `Universe.navigation.plan` uses the complete static catalogue and
  corrected stress database. Its origin and repeating stops match the mixed
  workload; routing policy explicitly selects shortest gate routes with optional
  connections off. There is no Core scheduler, HTTP server or browser in this
  lane. All six diagnostic/timing children recorded zero external IO attempts.
- Timing covers plan computation, production acceptance checks, persisted result
  save and the returned clone. Setup, itinerary edits, assertions and source
  hashing are excluded. Instrumented diagnostics are separate processes and
  supply no latency samples.

The fixture preserves the same 2,000 legacy visits and 100 distinct discoveries.
Candidate setup reproduces the upgrade migration's membership seeding before
measurement; RC16 retains discovery through its legacy visits. This preparation
is recorded and validated in each child result, and its helper is included in
the harness provenance.

## Timing results

Each cell is **median / p95 milliseconds** for one nine-sample child run. With
nine samples, the nearest-rank p95 is the maximum observed sample, not a precise
tail-latency estimate.

| Stops | RC16 first | Candidate first | Candidate second | RC16 second |
|---:|---:|---:|---:|---:|
| 1 | 23.03 / 33.18 | 15.02 / 22.59 | 11.83 / 20.86 | 14.09 / 22.76 |
| 10 | 170.09 / 284.34 | 14.36 / 24.69 | 14.47 / 24.48 | 156.63 / 172.29 |
| 50 | 737.22 / 776.99 | 33.16 / 41.58 | 33.59 / 42.09 | 745.39 / 843.13 |

The 10-stop result is roughly 91% lower and the 50-stop result roughly 95.5%
lower across the two paired repetitions. The one-stop case is much noisier:
RC16's own medians range from 14.09 to 23.03 ms, so a precise small-route speedup
would overstate the evidence. The clear result is the multi-stop preparation
improvement and its repeated benefit at 10 and 50 stops.

## Work removed, independently of timing

| Stops | Hops retained | Graph builds RC16 → candidate | SQL calls RC16 → candidate | Logical result rows RC16 → candidate |
|---:|---:|---:|---:|---:|
| 1 | 11 | 1 → 1 | 69 → 32 | 138 → 23 |
| 10 | 115 | 10 → 1 | 492 → 32 | 1,245 → 23 |
| 50 | 565 | 50 → 1 | 2,372 → 32 | 6,165 → 23 |

Candidate diagnostics show one computational snapshot projection and one final
six-source validation query per itinerary, independent of stop count. RC16
performed the lifetime visit aggregate and place-note scan once per stop; neither
is part of the candidate route path. The prepared graph is scoped to this
request, so a later request builds from fresh evidence rather than a persistent
cache requiring invalidation.

Logical JSON result materialisation was 167,886 / 1,649,813 / 8,233,523 bytes for
RC16 and 12,317 / 90,820 / 437,090 bytes for the candidate at 1/10/50 stops.
These are instrumented SQL return values, **not disk IO, resident memory or
allocation totals**. Candidate bytes still grow with the itinerary because its
persisted plan and returned result grow; the refactor does not make all routing
work constant-time. Each leg still needs a path search and its route output.

## Behaviour and remaining scope

All diagnostic and timing results passed complete-result digest equality against
RC16 for their case. The fixed synthetic clock permits comparison without
masking any fields: ordered stops, segment identity, exact edges, costs, source
badges, warnings, revision and generated timestamps all match. The three sizes
retain 11, 115 and 565 hops respectively.

Separate deterministic production tests cover changed routing snapshots, pilot
reauthorisation/scopes, module policy, source expiry, private connection access,
confirmation, ship-size/mass changes, disabled lists, removed maps and public
feed/type freshness. Relevant changes reject the pending result; unrelated pilot,
display-data and other-map changes remain allowed. The combined routing,
navigation, service, destination and preparation suite passed 98 tests when this
refactor was integrated. A separate frozen-RC16 pure-algorithm comparison passed
600 gate plans, 600 jump plans and 600 alternate-midpoint projections; that is
correctness evidence, not additional timing evidence.

The timed scenario covers gate itineraries and the controlled stress fixture.
It does not establish an isolated jump-drive latency result, timings for every
optional private/public connection combination, cold-start cost, or responsiveness
under concurrent UI/SSE traffic. Those distinctions remain explicit: jump and
connection semantics are tested, and the separate mixed lane assesses concurrent
behaviour. These results support keeping the request-scoped service boundary and
avoiding a long-lived route cache in this pass.
