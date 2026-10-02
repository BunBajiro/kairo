# RC17 Maps: local comparison results

**Latest:** [refined candidate `05d0d4b`](#refined-candidate-05d0d4b-final-local-maps-checkpoint) repeats the completed lane. Initial `059b959` evidence is retained below.

The completed Maps lane shows that the candidate removes repeated whole-library link materialization and per-signature edge filtering. At 24 populated maps, compatible full-state service medians fell from **307.19 / 330.96 ms** to **40.52 / 39.41 ms** in the forward/reverse runs. Selected-map work also fell, but its latency still grows with unrelated-map volume. This is a material improvement, not proof that every Maps operation is independent of library size.

## Evidence and boundaries

These six phases completed on 2 October 2026, 22:55:27–22:55:51 UTC: baseline/candidate diagnostics, then baseline-1, candidate-1, candidate-2 (reverse cases), baseline-2 (reverse cases). A later route-fixture failure stopped the broader orchestrator after this completed lane; it does not turn this into a complete whole-application benchmark run.

Each phase independently verified its source/build manifest before and after. Both checkouts were clean, all six reported stable source/harness hashes and zero external requests. Retained raw files are under [`raw/local-comparison-1/maps`](../raw/local-comparison-1/maps/).

| Identity | Value |
| --- | --- |
| Baseline commit | `57c8dcc7fbd8fc2b62129498d1819050c78381a1` |
| Candidate commit | `059b95909dffa82f8b10dfd266954323147d7580` |
| Baseline source/build fingerprint | `02558f159d1fea0b7c1670856e40e52894dd62ea76c733c929cc6d9c4af43a85` |
| Candidate source/build fingerprint | `7e1aaeefaa28d131d858e8dc86355f7fb56ce6f5c60366ebcd46309349502c93` |
| Adapter SHA-256 | `c950575e1b3984105c3facee4d370b49abe735013d5cdf47177e6f2c637a781d` |
| Manifest helper SHA-256 | `4cd636f98836261ee7808daa7ad98c7eda16f21bf8847a9ae1196042ccf58487` |
| Environment | Node 24.19.0, Linux x64, AMD EPYC 9V74 80-Core Processor |

Every timing cell below is **one run's median of seven uninstrumented service calls**, after three warmups for that case. B1/C1 traverse cases forward; B2/C2 reverse them. Samples are not pooled and no percentile or statistical confidence claim is made. JSON serialization is measured separately. SQL diagnostics are a separate instrumented invocation per case and are never latency evidence. All diagnostic reads reported zero writes.

Fixtures use the actual bundled atlas and actual services, a fixed clock, synthetic private maps, no accounts or external collectors, and no optional passages/intel/undo/tracked-pilot workloads. Service timing excludes HTTP transport, browser layout/painting and end-to-end workspace refresh. Browser behavior has [separate evidence](maps-browser.md).

## Semantic verification

All paired cases have identical fixture totals and identical output byte counts between baseline and candidate. Within each implementation, the selected object remains identical across 1/8/24 map libraries and selected/full-list retrieval paths. Checks preserve node identities and coordinates, canonical endpoints, ordered signature bindings, revision, scope ownership, access, confirmation and expiry.

The raw selected JSON digest differs between implementations: baseline `b38a1d82a5af13ada4c466aa907a3ba81261dbb4d5f37953789899e55bcbbd7c`; candidate `5064dfaae3e14d49957e6d37c7f3772cb036d7c3f382a84f192848e7f92a8968`. The separate [untimed equivalence check](../raw/maps-equivalence-059/comparison.json) now proves the difference is object-property insertion order only: all 99 connection objects place their signature display fields later in the candidate. The complete selected objects are deep-equal, with zero field differences and **all array order preserved**. Recursively sorting object keys yields the same SHA-256, `c854757119d11244fd3a86cd82acbb94b19892a8a1c281eab1bcd796a72b1066`, on both checkouts. The probe reproduces both original raw digests exactly and independently verifies the same clean source/build fingerprints before and after. It makes one untimed selected-map call per checkout and contributes no latency samples. The frozen measured harness and production source remain unchanged.

## Fixed selected map; growing populated library

The selected map always contains 100 nodes, 99 links and 100 bound signatures. Each added map contains the same counts, with independent IDs. The selected payload remains **229,559 bytes**.

| Service / maps | RC16 B1 ms | RC16 B2 ms | RC17 C1 ms | RC17 C2 ms |
| --- | ---: | ---: | ---: | ---: |
| Selected detail / 1 | 3.75 | 2.79 | 2.79 | 1.68 |
| Selected detail / 8 | 5.77 | 5.65 | 3.84 | 3.34 |
| Selected detail / 24 | 12.07 | 13.53 | 6.51 | 6.65 |
| Full library / 1 | 3.60 | 3.17 | 2.12 | 1.81 |
| Full library / 8 | 49.77 | 48.60 | 16.80 | 14.32 |
| Full library / 24 | 307.19 | 330.96 | 40.52 | 39.41 |

The 24-map full-state medians are 86.81% and 88.09% lower than their corresponding forward/reverse baseline medians; selected detail is 46.06% and 50.82% lower. These are comparisons of the retained run medians, not universal speed guarantees.

| Service / maps | SQL calls, RC16 → RC17 | Canonical link bodies | Signature bodies | Logical JSON bytes returned by SQL |
| --- | ---: | ---: | ---: | ---: |
| Selected detail / 1 | 227 → 27 | 99 → 99 | 298 → 100 | 325,875 → 162,502 |
| Selected detail / 8 | 227 → 27 | 792 → 99 | 298 → 100 | 661,287 → 162,502 |
| Selected detail / 24 | 227 → 27 | 2,376 → 99 | 298 → 100 | 1,427,943 → 162,502 |
| Full library / 1 | 234 → 28 | 198 → 99 | 298 → 100 | 375,323 → 163,268 |
| Full library / 8 | 1,816 → 84 | 7,128 → 792 | 2,384 → 800 | 5,675,156 → 1,300,782 |
| Full library / 24 | 5,432 → 212 | 59,400 → 2,376 | 7,152 → 2,400 | 35,422,148 → 3,900,814 |

For selected reads, candidate SQL calls (27), result rows (203), JSON materialization (162,502 bytes), canonical link bodies (99) and signature bodies (100) stay constant across these library sizes. The 99 selected links use the scoped query; unrelated canonical bodies no longer cross into JavaScript. This does **not** mean constant latency: pilot expiry reconciliation and the next-expiry scheduling query still run, and their underlying database work can depend on broader stored data. Candidate 24-map selected medians remain 2.33× / 3.96× its one-map medians.

For full reads, RC16 materializes `99 × N × (N + 1)` canonical link bodies: all `99 × N` stored links are read for each of N maps and the source descriptor. The observed totals are 198, 7,128 and 59,400. That mechanism is **quadratic in map count for this fixed per-map population**, not exponential. Candidate link materialization is `99 × N`: 99, 792 and 2,376 bodies. Full-library latency from one to 24 maps grows 85.31× / 104.49× in RC16 and 19.10× / 21.77× in the candidate. Three sizes establish the diagnosed repeated work and its removal; they do not justify fitting a universal asymptotic timing model.

## Compact library summaries

The summaries API did not exist in RC16. Baseline entries explicitly record it as unavailable; they are not zero-cost measurements. Candidate summaries preserve library counts, revision and next expiry while omitting node geometry, links, signatures, notes and other operational payloads.

| Maps | RC17 C1 ms | RC17 C2 ms | Payload bytes | SQL calls | Link bodies | Signature bodies |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1.04 | 0.82 | 834 | 6 | 99 | 0 |
| 8 | 6.55 | 5.85 | 2,920 | 6 | 792 | 0 |
| 24 | 19.95 | 18.92 | 7,688 | 6 | 2,376 | 0 |

At 24 maps, summaries are 7,688 bytes versus the compatible full-state response's 5,509,856 bytes. Summaries plus one selected map total 237,247 payload bytes. This is a deliberately different consumer contract, so its savings must not be described as making an unchanged response equally smaller. The six SQL calls are constant in number, but they still read/reconcile all relevant library documents and canonical links; summary latency and materialized bytes grow with library contents.

Full-state JSON serialization remains substantial because that response is preserved. Its per-run serialization medians at 24 maps are **20.14 / 21.77 ms** for RC16 and **21.14 / 19.97 ms** for RC17. Selected-map serialization remains about 0.71–0.81 ms across these runs; compact 24-map summary serialization is 0.0266 / 0.0226 ms. Avoiding the full payload in the normal library workflow matters beyond the service-only savings.

## Constant total links

These cases hold **720 total canonical links** and zero signatures fixed, with 60 nodes per map. Node/document totals therefore grow with map count and this is not a constant-total-data fixture.

| Full-library maps | RC16 B1 ms | RC16 B2 ms | RC17 C1 ms | RC17 C2 ms | Link bodies RC16 → RC17 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 10.67 | 9.38 | 8.10 | 5.91 | 1,440 → 720 |
| 8 | 34.92 | 34.15 | 7.93 | 8.82 | 6,480 → 720 |
| 24 | 86.24 | 87.71 | 15.48 | 14.43 | 18,000 → 720 |

RC16 repeats the same 720-link collection N+1 times; the candidate reads 720 bodies once in every case. The candidate still pays for the growing node/document collection. Candidate-only summaries are 4.71 / 4.60 ms, 5.00 / 5.26 ms and 6.56 / 7.27 ms at 1/8/24 maps respectively.

## Dense signature/edge projection

One selected map has 100 nodes, 0/100/1,000 unbound Data Site signatures and 100/1,000 links. Bound-signature lookup savings are measured in the earlier independence family; this family isolates the former repeated edge-filter workload more clearly.

| Signatures / links | RC16 B1 ms | RC16 B2 ms | RC17 C1 ms | RC17 C2 ms | RC16 edge-filter predicate visits | RC17 visits |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 / 100 | 1.63 | 1.56 | 1.92 | 1.28 | 0 | 0 |
| 0 / 1,000 | 10.04 | 9.03 | 8.72 | 8.59 | 0 | 0 |
| 100 / 100 | 2.30 | 2.21 | 1.71 | 1.96 | 10,000 | 0 |
| 100 / 1,000 | 12.15 | 11.43 | 9.41 | 9.79 | 100,000 | 0 |
| 1,000 / 100 | 6.62 | 6.97 | 5.22 | 5.46 | 100,000 | 0 |
| 1,000 / 1,000 | 20.28 | 27.70 | 12.34 | 16.24 | 1,000,000 | 0 |

The maximum case removes **1,000,000 predicate visits** while preserving its 2,013,934-byte payload and ordered binding assertions. Its medians fall by 39.14% / 41.39%. This records removal of the specific S×E filter, not zero edge work: the candidate builds a reverse index in one edge pass. Larger signatures and output still cost time.

The smallest zero-signature case moves in opposite directions between runs (candidate 17.41% slower forward and 17.83% faster reverse, with sub-millisecond absolute changes). There is no repeatable improvement claim for that case. Higher-volume improvements align with the measured work reductions, but these short local runs do not establish user-hardware tail latency.

## Remaining work and interpretation

The main repeated whole-library projection is addressed. Selected-detail latency still includes broader expiry/scheduling work, summaries still reconcile the library, and the compatible full-state API still serializes a large response. These are explicit residual costs for future profiling rather than claims of completed constant-time behavior. This fixture does not exercise many tracked pilots, large note/passage histories, expiry deletions during a read, HTTP backpressure or interactive rendering; their functional and mixed-workload checks are separate.

The raw-digest discrepancy is resolved by the complete selected-object equivalence check above. Within-run identity and the listed field-level contracts also passed. This proves the fixed selected fixture's cross-version equality; the other fixture families retain their explicit cardinality/binding/access/geometry checks and equal payload sizes. GitHub confirmation and whole-application conclusions must use their own completed evidence, not this local lane alone.

## Raw file integrity

| Phase | SHA-256 |
| --- | --- |
| baseline-1 | `48ce084ec246f9276a83698682d9cce34dcb037115cd60a993a1022181a6102e` |
| baseline-2 | `b975c61e928762339e2467100eab427dab9a61eea93436b739a79c418dd4c5a6` |
| candidate-1 | `d73d87f122694169c143ef7b6b933dc3e2c33468ebb6240b703de552fadc1a54` |
| candidate-2 | `aa35efc83dfc9291004ac1909a5e0efe46e42326bdad7343084600d9ab71a4be` |
| baseline-diagnostics | `09c5cabc9898687cef37f0d4b0bfe6e969e1dfa688b53a27fbcb536eb5f05831` |
| candidate-diagnostics | `44fb1106b8ff54b98613b03e66cb79c000a01f2b2f864e74b7f7838e5faf4033` |

The untimed companion ran at 23:06:34 UTC. Its fixture and `assertMap` bodies match the frozen comparison adapter verbatim. A first restricted invocation failed at Git subprocess admission before application fixture work; the authorized invocation completed successfully.

| Untimed equivalence artifact | SHA-256 |
| --- | --- |
| comparison.json | `0c579d6b4aeb53b3a671ad25b2bf00f1b9673d4e2f3d78fc66b191a4f441802b` |
| baseline.json | `434ad72defbbee34f01011c2e2fca606077aea835c6d679b9bdced39dd90f82f` |
| candidate.json | `f4ea6478b8f490815903cae5dd741ad9bb89fab242f65de1e6897067ddbdefbb` |
| maps-equivalence.mjs | `c9b010766aac15a4759ff386081e6c4523f8d6092d99ace7355df00149f8566b` |

## Refined candidate 05d0d4b: final local Maps checkpoint

Use this section for the refined build's Maps numbers. The preceding sections retain the initial `059b959` checkpoint unchanged as development evidence. The refined Maps lane completed all six phases on **2 October 2026, 23:17:08–23:17:33 UTC**, with the same fixtures, adapter, diagnostic separation, three warmups/seven timing samples and forward/reverse ABBA order. Its completion is independent of the status of later whole-application lanes.

| Identity | Value |
| --- | --- |
| RC16 baseline | `57c8dcc7fbd8fc2b62129498d1819050c78381a1` |
| Refined RC17 candidate | `05d0d4b36c154329006d6772769063db874762da` |
| Refined source/build fingerprint | `b927c985297161a30987b4b9a329cf53610d7ffd309e405389ccbe6429129e82` |
| Raw results | [`raw/local-refined-1/maps`](../raw/local-refined-1/maps/) |
| Environment | Node 24.19.0, Linux x64, AMD EPYC 9V74 80-Core Processor |

All six phases again verify clean source/build manifests unchanged before/after, identical harness/helper hashes, zero external requests and zero diagnostic writes. Medians were independently recomputed from each run's seven samples. All paired fixtures and output byte counts agree. **No samples are pooled between checkpoints or runs.**

### Semantic continuity

The five measured Maps source hashes, the frozen adapter hash and the manifest-helper hash are unchanged from `059b959`. The refinement changes only `server/projections.mjs`, `server/session-details.mjs` and its Session regression tests. Every refined selected/full-library independence result reproduces the same raw JSON digest as its initial implementation: baseline `b38a1d82…bcbbd7c`, candidate `5064dfaa…2a8968`. The candidate payload remains 229,559 bytes.

Therefore the earlier full-output comparison remains applicable to this exact fixed selected-map result: the refined run reproduces the bytes whose parsed objects were proven equal, including all array order; the shared sorted-key digest is `c854757119d11244fd3a86cd82acbb94b19892a8a1c281eab1bcd796a72b1066`. **No new equivalence execution was performed against the refined commit**; continuity is established by the unchanged relevant source and reproduced output hashes. This does not extend whole-object equality to unmeasured fixtures or live user data.

### Refined timings and work counts

Each value is the median service time in milliseconds for its own run. B1/C1 are forward cases; B2/C2 are reverse cases.

| Service / populated maps | RC16 B1 ms | RC16 B2 ms | RC17 C1 ms | RC17 C2 ms |
| --- | ---: | ---: | ---: | ---: |
| Selected detail / 1 | 4.20 | 2.88 | 2.58 | 1.75 |
| Selected detail / 8 | 5.86 | 5.45 | 3.86 | 3.35 |
| Selected detail / 24 | 11.99 | 11.86 | 6.58 | 6.55 |
| Full library / 1 | 3.43 | 3.75 | 2.04 | 1.81 |
| Full library / 8 | 50.73 | 48.32 | 16.07 | 14.02 |
| Full library / 24 | 315.51 | 323.92 | 39.19 | 40.07 |

At 24 maps, full-library service time is **87.58% / 87.63% lower** in the corresponding forward/reverse comparisons; selected detail is **45.12% / 44.76% lower**. These are observed per-run median comparisons, not end-to-end browser or tail-latency claims.

The refined diagnostics reproduce every initial `fixture`, `correctness`, `totals`, `materialization` and `outputBytes` field exactly. In particular:

| Work measure | RC16 | Refined RC17 |
| --- | ---: | ---: |
| Selected canonical link bodies at 1 / 8 / 24 maps | 99 / 792 / 2,376 | 99 / 99 / 99 |
| Selected SQL calls at each library size | 227 | 27 |
| Selected signature bodies at each library size | 298 | 100 |
| Full 24-map SQL calls | 5,432 | 212 |
| Full 24-map canonical link bodies | 59,400 | 2,376 |
| Full 24-map signature bodies | 7,152 | 2,400 |
| Full 24-map logical JSON materialization bytes | 35,422,148 | 3,900,814 |
| Full 24-map payload bytes | 5,509,856 | 5,509,856 |

The removed canonical-body rereading remains quadratic in this fixed-per-map fixture (`99 × N × (N + 1)` versus `99 × N`), not evidence of exponential scaling. Selected detail still rises from 1.75–2.58 ms at one map to 6.55–6.58 ms at 24 maps despite constant returned body counts. The earlier expiry/scheduling limitation therefore remains: Maps reads are cheaper, but the selected path is not proven independent of the broader library.

| Candidate-only summaries / maps | C1 ms | C2 ms | Payload bytes | SQL calls |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1.03 | 0.81 | 834 | 6 |
| 8 | 5.88 | 5.92 | 2,920 | 6 |
| 24 | 18.97 | 17.99 | 7,688 | 6 |

Summaries still read the relevant library documents and canonical links but no signature/operational bodies. RC16 lacks this contract, so the six unavailable summary cases are explicitly skipped in each baseline phase. At 24 maps, compact summaries plus selected detail remain 237,247 payload bytes, versus 5,509,856 bytes for the compatible full response. Their different information content is intentional and must be identified when quoting that saving.

Full-state serialization at 24 maps has per-run medians **23.62 / 27.12 ms** for RC16 and **21.03 / 22.07 ms** for RC17; selected serialization is **0.72 / 0.74 ms** versus **0.74 / 0.73 ms**. Candidate summary serialization is **0.0241 / 0.0252 ms**. The service timing table excludes these separate serialization measurements.

| Constant 720 links / maps | RC16 B1 ms | RC16 B2 ms | RC17 C1 ms | RC17 C2 ms |
| --- | ---: | ---: | ---: | ---: |
| 1 | 10.65 | 8.80 | 7.53 | 6.15 |
| 8 | 34.92 | 31.52 | 7.96 | 7.80 |
| 24 | 90.74 | 85.29 | 14.34 | 12.25 |

As before, total nodes/documents grow with map count in this family; only links are fixed. Candidate canonical-body materialization stays at 720 rather than RC16's 1,440 / 6,480 / 18,000. Candidate constant-link summaries take 4.33 / 4.37 ms, 5.12 / 4.88 ms and 6.85 / 7.34 ms at 1/8/24 maps.

| Dense signatures / links | RC16 B1 ms | RC16 B2 ms | RC17 C1 ms | RC17 C2 ms |
| --- | ---: | ---: | ---: | ---: |
| 0 / 100 | 1.55 | 1.45 | 1.58 | 1.34 |
| 0 / 1,000 | 10.68 | 9.09 | 8.53 | 9.32 |
| 100 / 100 | 2.19 | 2.29 | 1.69 | 1.99 |
| 100 / 1,000 | 13.44 | 11.57 | 8.74 | 10.66 |
| 1,000 / 100 | 6.88 | 7.03 | 4.88 | 5.30 |
| 1,000 / 1,000 | 24.34 | 27.84 | 12.66 | 17.09 |

The 1,000-signature/1,000-link case again removes 1,000,000 predicate visits, retains the 2,013,934-byte response, and records **48.00% / 38.60% lower** service medians. The zero-signature cases remain noisy: 0/100 changes by +2.08% then −7.44%, and 0/1,000 by −20.06% then +2.60%. No consistent improvement is claimed for either across the two refined runs. The earlier fixture, observer and scale limitations continue to apply.

### Refined raw integrity

| Phase | SHA-256 |
| --- | --- |
| baseline-1 | `3df79f5a9a8412525e921fe478b2b0020f043e159ebdebdf515289df42891406` |
| baseline-2 | `c7811d52d03ee54303ebd21b9bd6c00c62c64de96e8c322a73366e92a9524ccc` |
| candidate-1 | `c72bac8cbe81e1c1c226f6a0eb22cf146c61a0dc69460eb7d3a817d4783aba5c` |
| candidate-2 | `259aba56cbf78bde688d4eede8e2a453d40d4b932b26486f8794a52fd8bd7d86` |
| baseline-diagnostics | `2df9856ba434bb4926e3719139b930a92ca5845e3eda94398650bd18735ad7ae` |
| candidate-diagnostics | `cb73b0b598670395aa73f3bcb9c97aa511d623580e3a9d74892dd01463c3b5a6` |
