# RC17 Maps: GitHub comparison results

The Maps service lane in [GitHub run 37078241973](https://github.com/BunBajiro/kairo/actions/runs/37078241973) completed successfully. For 24 populated maps, compatible full-state service medians fell from **231.46 / 238.34 ms** to **29.79 / 26.63 ms**, or **87.13% / 88.83% lower** in the corresponding forward/reverse comparisons. Selected-map medians fell from **9.22 / 9.23 ms** to **5.03 / 5.05 ms**. The diagnostic work reductions and payload contracts reproduce the [refined local checkpoint](maps-results-local.md#refined-candidate-05d0d4b-final-local-maps-checkpoint).

This accepts the completed Maps service lane, **not the overall Actions run as green**. `github-jobs.json` records “Measure Maps with equivalent fixtures” as successful and the overall job/run as failed at the later compiled Mapper check. That browser step and its cleanup failure are outside this service-results review. Missing or failed lanes are not counted as passes.

## Identity, ordering and verification

| Item | Recorded value |
| --- | --- |
| Actions attempt | 1 |
| Analysis commit | `82394c58d0a7d8987877835b693f31f09c3c0d7f` |
| RC16 baseline | `57c8dcc7fbd8fc2b62129498d1819050c78381a1` |
| RC17 candidate | `05d0d4b36c154329006d6772769063db874762da` |
| Baseline source/build fingerprint | `14392904b3f8083a6651ca8f6aa428331b74281d6e694108e609ff9c748a2d11` |
| Candidate source/build fingerprint | `9df9de9ed3e9740df9955c59aa8b09c0b03693cbb41875cc716b6b499021ea84` |
| Maps adapter SHA-256 | `c950575e1b3984105c3facee4d370b49abe735013d5cdf47177e6f2c637a781d` |
| Manifest helper SHA-256 | `4cd636f98836261ee7808daa7ad98c7eda16f21bf8847a9ae1196042ccf58487` |
| Runtime | Node 24.19.0, Linux x64 |
| CPU model reported by runner | AMD EPYC 9V45 96-Core Processor |
| Raw results | [`github-run-37078241973/maps`](../raw/github-run-37078241973/maps/) |

The raw completion timestamps and job log establish the sequential order: baseline diagnostics (23:37:23 UTC), candidate diagnostics (23:37:25), baseline-1 (23:37:31), candidate-1 (23:37:35), candidate-2 (23:37:38), baseline-2 (23:37:44), all on 2 October 2026. Both `*-2` runs traverse the same cases in reverse. All 21 cases are accounted for per phase; RC16 explicitly skips its six unsupported summary cases, leaving 15 paired cases and six candidate-only cases.

Independent review confirmed that each embedded source manifest matches the run's captured source manifest, source pins match run provenance, both checkouts are clean, and before/after fingerprints agree. The harness/helper hashes match run provenance and the local checkpoint. Every phase records stable source/harness and zero external requests. All diagnostic reads report zero database changes. The five measured Maps source hashes are unchanged from the refined local run.

Every timing value below is **one run's median of seven uninstrumented service invocations after three warmups**. Recorded medians/minima/maxima were recomputed from their samples. No samples are pooled across runs or environments; no percentile or confidence interval is inferred. Serialization is separate, checks run outside measured durations, and the diagnostic invocation supplies work counts only. These are actual service calls with synthetic supported-size fixtures, not HTTP or browser frame timings.

## Semantic acceptance

Every paired fixture retains identical population totals and output bytes. Within each implementation, the complete fixed selected object is unchanged across 1/8/24 map libraries and selected/full-list APIs. Geometry coordinates, IDs, endpoint topology, ordered signature bindings, revision, scope ownership, access, confirmation and expiry checks pass.

The raw fixed selected-map digests reproduce the earlier outputs exactly: RC16 `b38a1d82a5af13ada4c466aa907a3ba81261dbb4d5f37953789899e55bcbbd7c`; RC17 `5064dfaae3e14d49957e6d37c7f3772cb036d7c3f382a84f192848e7f92a8968`. The [prior untimed full-output comparison](../raw/maps-equivalence-059/comparison.json) proved these objects deep-equal with all array order retained. Their raw difference is property insertion order in the 99 connection objects; sorted-key SHA-256 is `c854757119d11244fd3a86cd82acbb94b19892a8a1c281eab1bcd796a72b1066` for both.

No new whole-object equivalence execution occurred in this CI lane. The conclusion for this exact fixed fixture follows from the reproduced output hashes and unchanged Maps source; it does not claim exhaustive equality over live data. Other cases retain their explicit semantic assertions and equal byte counts.

## Growing populated libraries

The selected map always holds 100 nodes, 99 links and 100 bound signatures; added maps have independent IDs and the same counts. Selected detail remains **229,559 bytes**.

| Service / maps | RC16 B1 ms | RC16 B2 ms | RC17 C1 ms | RC17 C2 ms |
| --- | ---: | ---: | ---: | ---: |
| Selected detail / 1 | 2.96 | 2.40 | 1.88 | 1.38 |
| Selected detail / 8 | 4.71 | 4.19 | 2.36 | 2.64 |
| Selected detail / 24 | 9.22 | 9.23 | 5.03 | 5.05 |
| Full library / 1 | 3.36 | 2.57 | 1.78 | 1.32 |
| Full library / 8 | 37.78 | 35.43 | 12.47 | 12.74 |
| Full library / 24 | 231.46 | 238.34 | 29.79 | 26.63 |

Selected detail at 24 maps is **45.41% / 45.32% lower**, but remains 2.67× / 3.67× its candidate one-map median. It still performs expiry reconciliation and broader next-expiry scheduling work. Constant returned rows therefore do not establish constant-time selected reads.

| Service / maps | SQL calls, RC16 → RC17 | Canonical link bodies | Signature bodies | Logical SQL JSON bytes |
| --- | ---: | ---: | ---: | ---: |
| Selected detail / 1 | 227 → 27 | 99 → 99 | 298 → 100 | 325,875 → 162,502 |
| Selected detail / 8 | 227 → 27 | 792 → 99 | 298 → 100 | 661,287 → 162,502 |
| Selected detail / 24 | 227 → 27 | 2,376 → 99 | 298 → 100 | 1,427,943 → 162,502 |
| Full library / 1 | 234 → 28 | 198 → 99 | 298 → 100 | 375,323 → 163,268 |
| Full library / 8 | 1,816 → 84 | 7,128 → 792 | 2,384 → 800 | 5,675,156 → 1,300,782 |
| Full library / 24 | 5,432 → 212 | 59,400 → 2,376 | 7,152 → 2,400 | 35,422,148 → 3,900,814 |

All diagnostic fixture, correctness, totals, materialization and payload fields match the local checkpoint exactly. RC16's full-state path reads `99 × N × (N + 1)` canonical bodies in this fixture; the candidate reads `99 × N`. This diagnoses and removes a **quadratic** repeated-read component, not exponential growth. Full-state median growth from one to 24 maps is 68.85× / 92.82× for RC16 and 16.70× / 20.20× for RC17. These finite measurements do not establish a universal timing-complexity model.

## Compact summaries and serialization

| Candidate summaries / maps | C1 ms | C2 ms | Payload bytes | SQL calls | Signature bodies |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.58 | 0.54 | 834 | 6 | 0 |
| 8 | 3.97 | 4.35 | 2,920 | 6 | 0 |
| 24 | 13.09 | 13.03 | 7,688 | 6 | 0 |

At 24 maps, summaries are **7,688 bytes**, compared with **5,509,856 bytes** for compatible full-state. Summaries plus one selected map total **237,247 bytes**. The compact API deliberately returns metadata instead of complete operational payloads; this saving is a changed consumer contract, not compression of an unchanged response. RC16 has no summary timing. Six SQL calls still process a growing collection of map documents and canonical links, so summaries are not independent of library size.

At 24 maps, per-run full-state JSON serialization medians are **10.40 / 10.06 ms** for RC16 and **11.37 / 11.01 ms** for RC17: the large compatible response remains expensive and did not improve here. Selected serialization is **0.532 / 0.550 ms** versus **0.602 / 0.516 ms**; compact summaries are **0.0218 / 0.0190 ms**. All are excluded from the service medians above.

## Constant links and dense maps

The constant-link family holds 720 total links and zero signatures fixed, with 60 nodes per map. Total nodes and document overhead increase with map count.

| Full-state maps / 720 links | RC16 B1 ms | RC16 B2 ms | RC17 C1 ms | RC17 C2 ms |
| --- | ---: | ---: | ---: | ---: |
| 1 | 7.96 | 5.95 | 5.32 | 4.19 |
| 8 | 23.24 | 21.28 | 5.58 | 5.94 |
| 24 | 57.39 | 58.53 | 8.48 | 9.04 |

Candidate canonical-body materialization stays at 720; RC16 reads 1,440 / 6,480 / 18,000. At 24 maps the candidate's full-state service medians are **85.22% / 84.55% lower**. Candidate-only summaries take 2.84 / 3.12 ms, 3.35 / 3.77 ms and 4.46 / 4.48 ms at 1/8/24 maps.

Dense fixtures keep one map with 100 nodes, unbound Data Site signatures and varying edge counts.

| Signatures / links | RC16 B1 ms | RC16 B2 ms | RC17 C1 ms | RC17 C2 ms | RC16 predicate visits | RC17 visits |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 / 100 | 1.90 | 0.99 | 2.00 | 0.94 | 0 | 0 |
| 0 / 1,000 | 7.41 | 6.64 | 8.04 | 6.95 | 0 | 0 |
| 100 / 100 | 2.24 | 1.68 | 1.33 | 1.48 | 10,000 | 0 |
| 100 / 1,000 | 8.33 | 11.13 | 6.64 | 10.13 | 100,000 | 0 |
| 1,000 / 100 | 5.11 | 4.82 | 4.01 | 4.15 | 100,000 | 0 |
| 1,000 / 1,000 | 17.61 | 18.63 | 9.20 | 13.61 | 1,000,000 | 0 |

The maximum case removes **1,000,000** signature-by-edge predicate visits and retains its **2,013,934-byte** response. Its per-run service medians are **47.73% / 26.98% lower**. A one-pass reverse index still performs edge work; the removed filter count is not a claim of zero projection cost.

The zero-signature/1,000-edge case is **0.629 / 0.309 ms slower** in the candidate, or **8.50% / 4.66%**. The zero-signature/100-edge case changes direction between runs (+5.24% then −5.01%). No blanket improvement claim is made for all Maps cases. Full-state serialization also remains a cost, as recorded above.

## Accepted conclusion and limits

GitHub independently reproduces the removal of repeated canonical materialization and S×E binding scans, the large full-library improvement, and the compact summary contract. It also confirms residual selected-detail scaling and small no-signature overhead. Functional output checks and fixed-fixture whole-object digest continuity pass.

The test population omits large notes/passage histories, tracked-pilot fanout, live expiry deletion during measurement and external feeds. It does not measure browser painting, transport, production memory or user-hardware tail latency. These service results must remain separate from browser, mixed-workload and whole-application gates, including the overall failed Actions conclusion. Local and GitHub timings are reported separately because their environments differ.

## Raw integrity

| Phase | SHA-256 |
| --- | --- |
| baseline-1 | `e49ac4a799dbe523597b70c7f488879f39856ec6ad0c56d058cfc2955ac4e192` |
| baseline-2 | `2c71d686455c43c3b948928b836cd6d0fae0cf7a25556fb49c595e71d36f1143` |
| candidate-1 | `9c8a1d1413e8d28b8a0e9b2971f497a42e4ade439a90d288888b5d4d758e2a1b` |
| candidate-2 | `0d0b9ed2479047f91b73ed4764ac8e054cb23b04c3db952df6b2429ff06623f6` |
| baseline-diagnostics | `49dd651b88d10e78b86ab898cc34a982789838899315fae9494ebbf0021f559b` |
| candidate-diagnostics | `ee6430bfdd6aed74cf4875f3588bf733d759d9ad27683d60894194f204b5e7ec` |
