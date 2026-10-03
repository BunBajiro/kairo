# RC17 isolated routes — independent GitHub comparison

The two-CPU GitHub run independently reproduces the multi-stop improvement.
For 50 stops, RC16 medians were **770.84 / 760.66 ms**, versus **25.86 / 31.13 ms**
for the refined candidate: **96.65% / 95.91% lower** in the paired observations.
All complete plan digests match. The route lane is accepted; the overall workflow
remains failed because a separate browser-correctness step failed during Chrome
profile cleanup. Accepting this lane does not turn that workflow green.

## Identity and independently checked evidence

- [GitHub run 37078241973](https://github.com/BunBajiro/kairo/actions/runs/37078241973).
- [Unmodified route evidence](../raw/github-run-37078241973/routes/results.json).
  SHA-256: `2454f71f687bfa17d606470fbc57d40fbba1e1e883a55bc98fc7b611e045543f`.
- RC16: `57c8dcc7fbd8fc2b62129498d1819050c78381a1`; refined RC17:
  `05d0d4b36c154329006d6772769063db874762da`.
- Harness commit: `82394c58d0a7d8987877835b693f31f09c3c0d7f`.
- Node v24.19.0; AMD EPYC 9V45; two reported logical CPUs; Ubuntu GitHub runner.
- RC16 source/build fingerprint:
  `14392904b3f8083a6651ca8f6aa428331b74281d6e694108e609ff9c748a2d11`.
  Candidate fingerprint:
  `9df9de9ed3e9740df9955c59aa8b09c0b03693cbb41875cc716b6b499021ea84`.

Both source manifests report clean checkouts. They contain 407 RC16 source files
and 439 candidate source files, each with 20 built client assets. Their fingerprints
were independently recomputed and matched the route result and workflow provenance.
All ten route/fixture/provenance helper hashes match both the workflow's initial
harness ledger and the inspected harness bytes. The route result declares complete
source/harness end verification, and the workflow's final source/compiled-assets
verification step succeeded.

The reviewer independently checked all six child records, all 18 case-level
fixture/result digest pairs, and recomputed the reported median, minimum, maximum
and p95 from all **108 raw timing samples**. This review reads retained evidence;
it does not rerun or modify the application, harness or raw records.

## Method and timing

Diagnostics run in separate children and produce no latency samples. Timing
children run RC16 / candidate / candidate / RC16, with two warmups and nine
samples at each of 1, 10 and 50 stops. The second pair reverses case order.
Each child starts a fresh instance using the full static catalogue and identical
corrected stress fixture. The route policy is explicitly shortest gate routing,
with optional private/public connections off. The origin and repeating stops
match the mixed workload.

Timing includes the real `Universe.navigation.plan`, acceptance checks, saved
result and returned clone. It excludes fixture setup, itinerary edits, assertions
and source hashing. There is no HTTP, Core scheduler or browser in this lane.
The fixed synthetic clock permits full-result equality without masked fields.

Each table cell is **median / p95 milliseconds** for one nine-sample child run.
With nine samples, nearest-rank p95 equals the observed maximum; it is not a
precise production tail estimate.

| Stops | RC16 first | Candidate first | Candidate second | RC16 second |
|---:|---:|---:|---:|---:|
| 1 | 18.24 / 35.34 | 15.07 / 25.51 | 10.02 / 34.38 | 13.25 / 29.52 |
| 10 | 151.76 / 227.39 | 13.73 / 32.41 | 12.94 / 35.01 | 152.31 / 188.91 |
| 50 | 770.84 / 817.60 | 25.86 / 29.46 | 31.13 / 46.31 | 760.66 / 868.16 |

Ten-stop medians are 90.95% and 91.51% lower in the paired observations; 50-stop
medians are 96.65% and 95.91% lower. One-stop medians are lower in both pairs,
but the second candidate's one-stop p95/maximum is **34.38 versus 29.52 ms**,
an adverse 4.86 ms observation. Small-route/tail improvements are consequently
not universal. The robust conclusion is the repeated multi-stop preparation
benefit. GitHub and local values remain separate samples from different machines;
they are not pooled, and no 0.7.3 Maps/itinerary timing is invented.

## Preparation and semantic controls

| Stops | Hops retained | Graph builds RC16 → candidate | SQL calls RC16 → candidate | SQL result rows RC16 → candidate |
|---:|---:|---:|---:|---:|
| 1 | 11 | 1 → 1 | 69 → 32 | 138 → 23 |
| 10 | 115 | 10 → 1 | 492 → 32 | 1,245 → 23 |
| 50 | 565 | 50 → 1 | 2,372 → 32 | 6,165 → 23 |

These instrumented counts independently reproduce the local structural result.
The candidate builds one graph, projects the relevant snapshot inputs once and
performs one final six-source acceptance check per itinerary. It removes the
per-stop lifetime visit aggregate and place-note read. Preparation is scoped to
the current request; subsequent requests obtain fresh inputs.

Candidate SQL JSON result bytes still increase with returned plan size:
12,317 / 90,820 / 437,090 bytes at 1/10/50 stops, versus RC16's
167,886 / 1,649,813 / 8,233,523 bytes. These are logical SQL materialisation
counts, not disk IO, allocation or residency measurements. Route searches,
serialization and result storage still grow with the itinerary; routing has
not become constant-time.

All children report zero external IO attempts and the same stress-fixture
fingerprint. The same 2,000 preserved legacy visits represent 100 distinct
discoveries. Before measurement, the candidate receives and verifies the exact
membership table its upgrade migration would produce; RC16 retains membership
through the legacy rows. The discovery helper is included in the harness hashes.

Every case retains ordered stops, segment identity, endpoints and revision.
The complete result digest includes exact edges, costs, warnings, source badges
and timestamps. Candidate diagnostic and timing digests equal RC16's, and all
repeated plans retain the same digest. There is no field masking or substitution
of a smaller response to obtain the measured saving.

## Interpretation limits

This lane measures a warm, isolated gate-itinerary workload. It does not establish
jump-drive timing, optional-connection timing, cold-start performance or loaded
UI/SSE responsiveness. Source expiry and mutation acceptance are covered by
separate deterministic tests; the fixed-clock timing lane does not itself
exercise those transitions. The small sample count and noisy one-stop tail remain
visible above. The larger checkpoint's failed browser cleanup remains a required
separate acceptance item even though routing and final source verification passed.
