# Idle refinement: independent local evidence review

The refinement removes measured redundant work while preserving dataset checks and the observed workload contracts. The original startup-inclusive local benchmark shows **substantially lower typical-workload CPU**, but only a **small mean stress reduction with overlapping results**. It does not support a blanket 30–36% reduction in Kairo CPU, and it does not identify the cause of the original internal RC17 (`05d0d4b`) GitHub increase.

This review launched no runtime or benchmark. It independently checked the completed count and backend lanes, and wrote only this report and the explicitly derived [`refinement-local-summary.json`](../cpu-investigation/refinement-local-summary.json). Raw evidence, harnesses and application files were not modified.

## Source and evidence checks

| Source | Commit | Independently verified source/build fingerprint |
|---|---|---|
| baseline | `57c8dcc7fbd8fc2b62129498d1819050c78381a1` | `02558f159d1fea0b7c1670856e40e52894dd62ea76c733c929cc6d9c4af43a85` |
| candidate | `fa6e852b76089b51cd552fa202de85ad6948b0ec` | `0c39f9e6baf146cb09685b5449b9323ab5988280f587be71f5bc1b017c8cd2b5` |

Both working trees were clean. Source/build fingerprints were independently rebuilt from the current files and Git identities after measurement and match the recorded manifests. All recorded executable adapter/helper hashes match retained files. The refinement manifest has exactly the same 24 compiled frontend asset entries as the retained original `05d0d4b` manifest. The source change is the small Core protection/feed-upkeep refinement and its tests; this is not a new frontend benchmark claim.

The counts lane (`raw/refinement-counts-1`) records completion, cleanup, per-process source verification and final source/harness verification. The backend ABBA lane (`raw/refinement-backend-1`) records completion and final end verification. The backend runner and fixture are the original unchanged accepted files: `backend-run.mjs` SHA-256 `5c823f7483cd571202aaa25bd639289ddd125127b6c72a5963bc0d40c1ec2804`, fixture SHA-256 `62ea73e7fc23ab6c69ba7986c2162823146e350e474729f7cc9c478485cc4073`.

Both use Node v24.19.0 locally on AMD EPYC 9V74 with nine visible logical CPUs. The backend order is RC16 / refinement / refinement / RC16, each with typical and stress fixtures. Idle retains the original one-second warm-up followed by 35 seconds; it was not substituted with the settled 30-second-window adapter. Every operation retains three warm-ups and ten recorded serialized samples. The derived file records raw-file checksums and retains all metrics.

## Separate diagnostic counts

Each counting process warms for 30 seconds and observes another 30 seconds. Both windows contain ten successful real Universe ticks and fulfilled Operations/Feeds subtasks, zero pending ticks at both boundaries, zero network attempts and zero tick rejections. Both start with 3,000 Politics queue records, drain them during warm-up and remain empty after observation. Candidate semantic-task pending/failure counts remain zero.

| Counter per observed 30 seconds | RC16 | Refined candidate |
|---|---:|---:|
| Snapshot scheduling metadata | 1,330 | 1,330 |
| Full snapshot reads | 2,700 | 640 |
| Character roster reads | 2,020 | 660 |
| OPSEC projections | 360 | 70 |
| Stream binding calls | 53 | 53 |
| JSON parses | 11,050 | 3,490 |
| Parsed JSON input characters | 8,739,390 | 2,857,080 |
| All measured SQL executions | 13,197 | 5,964 |
| SQL get | 11,086 | 5,213 |
| SQL all | 2,111 | 751 |
| SQL run | 0 | 0 |

The earlier `05d0d4b` counting lane had the same metadata, snapshot, roster, OPSEC and JSON counts as RC16; its SQL total was 13,184. The refinement now demonstrates less recurring work rather than fewer scheduling checks or successful ticks. It keeps 40 Session cursor reads and 53 Stream setting reads, preserving those existing candidate behaviors.

The two instrumented CPU readings are 440.525 ms and 348.481 ms. They are diagnostic values with count-wrapper overhead and are **not** the performance claim. In particular, a large reduction in calls or parsed bytes is not an equal reduction in whole-process CPU.

## Original startup-inclusive idle workload

The tables retain actual ABBA order. CPU percentage is of one logical core; each cell is one process's approximately 35-second idle window.

| Profile | RC16-1 CPU ms / % | Candidate-1 CPU ms / % | Candidate-2 CPU ms / % | RC16-2 CPU ms / % | Change in two-process normalized mean |
|---|---:|---:|---:|---:|---:|
| typical | 295.090 / 0.842245% | 225.180 / 0.642708% | 176.871 / 0.504823% | 332.253 / 0.948309% | -35.912%; -0.321512 percentage points |
| stress | 550.403 / 1.572300% | 550.402 / 1.572319% | 609.194 / 1.740258% | 642.653 / 1.835840% | -2.804%; -0.047781 percentage points |

Typical candidate readings are below both RC16 readings, with a normalized mean reduction of 35.912% in this fixture. Stress readings overlap: the first pair is essentially unchanged, while the second candidate is below its bracketing RC16 result. The stress mean reduction is only 2.804%. Two repetitions per source/profile do not establish a portable budget or statistical confidence interval.

All eight idle meters report twelve cumulative successful Universe ticks and zero rejections/network attempts. This unchanged historical audit is cumulative from startup, not exact per-window deltas; the counts lane supplies the separate precise settled-window accounting. Original meters retain total process CPU, not user/system components. Do not transfer the settled adapter's richer boundaries into these historical-format records.

## Startup, memory, loop delay and HTTP

Ranges below are the two process observations, not confidence intervals. MiB uses 1,048,576 bytes. Loop-delay percentiles are timer-observer samples, not HTTP response percentiles.

| Profile / metric | RC16 range | Candidate range |
|---|---:|---:|
| typical / startup ms | 143.519–154.216 | 170.569–178.849 |
| typical / idle RSS after, MiB | 158.688–159.062 | 150.387–151.117 |
| typical / idle peak RSS, MiB | 158.688–159.062 | 150.387–151.117 |
| typical / idle heap after, MiB | 54.909–55.060 | 68.202–68.293 |
| typical / idle loop p95, ms | 10.174–10.174 | 10.158–10.207 |
| typical / idle loop maximum, ms | 16.335–21.365 | 13.607–27.754 |
| typical / HTTP state p50, ms | 9.524–10.075 | 8.947–9.663 |
| typical / HTTP state p95, ms | 11.317–12.201 | 10.165–13.046 |
| stress / startup ms | 146.269–153.790 | 144.574–159.981 |
| stress / idle RSS after, MiB | 200.395–207.883 | 176.027–180.406 |
| stress / idle peak RSS, MiB | 205.512–209.625 | 176.027–185.781 |
| stress / idle heap after, MiB | 44.279–59.376 | 62.450–62.501 |
| stress / idle loop p95, ms | 10.166–10.199 | 10.166–10.199 |
| stress / idle loop maximum, ms | 58.622–59.998 | 47.809–55.181 |
| stress / HTTP state p50, ms | 40.621–41.997 | 40.634–40.971 |
| stress / HTTP state p95, ms | 54.365–55.581 | 49.478–54.559 |

Adverse/flat observations remain visible: typical startup is slower in both candidate processes; typical loop maximum has a wider range rather than a uniform win; HTTP ranges overlap, including a higher typical candidate tail. Idle RSS is lower in these observations, but this is not a leak diagnosis or a general memory result. Stress startup remains overlapping. The unchanged built frontend does not establish anything about browser CPU in this lane.

## All direct operation timings

Cells show the range of each process's p50 / p95 milliseconds. With ten samples, the retained nearest-rank p95 is the sample maximum. No adverse operation was removed from this table.

| Profile / operation | RC16 p50 / p95 | Candidate p50 / p95 |
|---|---:|---:|
| typical / opsec | 0.070–0.080 / 0.110–0.394 | 0.084–0.088 / 0.175–0.190 |
| typical / state | 4.034–4.061 / 4.257–4.495 | 4.407–4.444 / 5.238–6.352 |
| typical / journey | 1.811–2.042 / 2.057–2.598 | 1.832–1.842 / 1.931–2.219 |
| typical / session | 15.292–15.381 / 18.145–21.897 | 15.612–15.710 / 16.282–16.740 |
| typical / market_browse | 2.047–2.181 / 2.330–4.964 | 2.033–2.053 / 2.343–2.620 |
| typical / market_report | 6.525–6.943 / 7.537–8.202 | 6.253–6.720 / 6.783–9.060 |
| typical / imports_warm | 0.598–0.623 / 0.835–1.008 | 0.554–0.555 / 0.790–1.059 |
| typical / imports_after_write | 0.601–0.648 / 0.723–1.843 | 0.578–0.580 / 0.600–0.600 |
| stress / opsec | 0.085–0.086 / 0.147–0.252 | 0.084–0.085 / 0.121–0.121 |
| stress / state | 21.626–21.726 / 29.929–37.928 | 21.246–22.030 / 22.541–22.905 |
| stress / journey | 3.500–3.506 / 3.716–3.743 | 3.667–3.694 / 3.963–4.656 |
| stress / session | 84.272–87.559 / 101.935–106.172 | 88.586–97.832 / 97.711–107.594 |
| stress / market_browse | 6.412–6.641 / 7.039–13.078 | 6.458–7.036 / 6.535–8.318 |
| stress / market_report | 32.643–33.260 / 34.365–45.562 | 33.564–34.098 / 35.608–42.998 |
| stress / imports_warm | 0.684–0.684 / 1.026–1.073 | 0.640–0.673 / 0.945–0.991 |
| stress / imports_after_write | 0.681–0.697 / 0.736–0.821 | 0.646–0.673 / 0.692–0.755 |

The typical direct state medians are higher in both candidate processes (4.407–4.444 ms versus 4.034–4.061 ms). Stress Session report medians are also higher (88.586–97.832 ms versus 84.272–87.559 ms); the second candidate contributes the larger difference. Typical Session medians are slightly higher while its tails are lower. Direct OPSEC medians remain tiny but are not uniformly improved. Market results and tails vary; warm import caching and caching after an unrelated settings write remain effective. These observations do not establish that the idle refinement caused each difference: the matched candidate contains all changes since RC16, and no simultaneous `05d0d4b` operation comparison was run.

## Contract coverage and limits

All four backend reports completed both fixtures with correct cached-feed shape. Every stored operation and HTTP meter reports zero external fetch attempts. The harness's existing assertions passed for asset count, bounded legacy Journey visits, Session event/personal combat counts and nonempty alliance combat, market row/total counts, and qualified import opportunities. The review independently recomputed every latency/CPU sample p50, p95, minimum and maximum; checked CPU/elapsed normalization, fixture fingerprints, sample counts and expected operation inventory; and inspected all direct operation, idle, startup and HTTP measurements.

Response byte counts for state, OPSEC, market browse/report and imports match between sources in each fixture. Journey and Session responses retain the already-existing candidate expansion: typical Journey and Session are each 5,400 bytes larger; stress Journey is 9,000 bytes larger and Session 36,000 bytes larger. These paths include the candidate's Session ownership fields, so byte equality was never their contract. This benchmark's count/shape checks are not a full object-equality proof; the existing behavioral suite provides the broader semantic gates. The legacy Journey operation is a compatibility reader over seeded rows, not a restored lifetime logging feature.

The source review separately checked that cached datasets retain scope/owner checks, real evidence changes refresh OPSEC immediately, the completed protection batch still evaluates expiry, and the feed maintenance path prunes connections while preserving explicit view responses and avoiding post-close tick reads. Test results reported elsewhere should retain their own provenance; this independent review did not execute those tests.

## Interpretation and next evidence

The refinement has a demonstrated mechanism: it removes unnecessary OPSEC projections, routine roster reads and the discarded feed view. The local typical CPU gain and preserved activity counts support the change. Stress CPU is broadly overlapping, with a small mean improvement; it should be reported that way rather than called a large win.

This remains RC16 versus `fa6e852`, not a controlled original-`05d0d4b` versus refinement CPU pair. The shared inefficiencies existed in RC16 and original RC17, so removing them does not explain why original RC17 had higher short-warm-up CPU on GitHub. That causal question remains open, and the earlier adverse evidence remains valid for its measured workload. A focused independent CI backend lane is the next useful verification for the environment where the original increase was observed; another full browser/Maps/three-version matrix is not needed solely to assess this narrow CPU refinement. Neither the local observations nor this review grant release approval.
