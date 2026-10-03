# Independent idle diagnostic review

Reviewed completed `analysis/rc17/cpu-investigation/raw/profile-1` and `raw/counts-1` on 2026-10-03. This is a read-only review: no benchmarks, application changes or raw-evidence edits were performed. Steady-state observation results are not part of this review yet.

Both pairs completed with source/end verification and successful cleanup. All recorded adapter/helper hashes match the retained exact adapter snapshots and frozen helper files. The profile adapter predates the warm-up CPU fields; its original bytes are preserved separately, so the later counts adapter does not silently replace its provenance. The applications remain RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` and candidate `05d0d4b36c154329006d6772769063db874762da`.

## Validity and boundaries

Both modes reuse the frozen corrected stress fixture, run the real scheduler and wait 30 seconds before a 30-second measured interval. They use no manual tick/sync invocation, clients, requests or network traffic. Every measured interval records exactly ten Universe ticks started/completed/successful, ten fulfilled operations subtasks and ten fulfilled feed subtasks. Pending ticks are zero at both boundaries, no subtask rejects, and the candidate semantic bus has zero pending work/failures. The counters are window deltas, fixing the initial benchmark's cumulative-tick ambiguity.

All four workers record a Politics queue of 3,000 after startup, zero after warm-up and zero after measurement. The separate counts pair records three queue batch reads and 3,000 deletions during warm-up, and zero during the measured interval, on both sources. This establishes startup backlog in this fixture and excludes it from these settled windows. The original one-second-warm-up benchmark remains valid as a combined startup/idle observation; these diagnostics do not retrospectively measure how much of its CPU difference came from backlog processing.

The adapter counts selected callable service methods and SQL reads; it is not a complete timer-callback inventory. Core's local sync/protection calls are observed through their SQL/store effects, not direct wrappers. Universe subtask completion is audited, but synchronous wrapper duration does not include all asynchronous work and nested timings must not be summed as exclusive CPU.

## Settled activity counts

| Counter, per 30-second counts interval | RC16 | Candidate |
|---|---:|---:|
| Universe tick / operations / feeds completions | 10 / 10 / 10 | 10 / 10 / 10 |
| Snapshot metadata reads | 1,330 | 1,330 |
| Full snapshot reads | 2,700 | 2,700 |
| Character-list reads | 2,020 | 2,020 |
| OPSEC updates | 360 | 360 |
| Stream binding / config calls | 53 / 53 | 53 / 53 |
| Public combat / recent Session checks | 40 / 40 | 40 / 40 |
| JSON parses | 11,050 | 11,050 |
| JSON input characters | 8,739,390 | 8,739,390 |
| SQL `get` calls | 11,086 | 11,073 |
| SQL `all` calls | 2,111 | 2,111 |
| SQL `run` calls | 0 | 0 |

The only nonzero counter differences are candidate **+40** `session:live-feed` setting reads and **−53** `stream` setting reads, producing **−13** SQL settings reads overall (7,046 → 7,033). No additional observed scheduler/subtask work accounts for the CI increase. Equal counts do not guarantee equal instruction cost, allocation or system CPU; they narrow the investigation.

Counts-mode CPU is 442.649 ms RC16 versus 431.035 ms candidate in its measured interval; warm-up CPU is 517.260 versus 516.049 ms. These are single instrumented diagnostics and must not be substituted for the accepted benchmark or treated as evidence that the CI regression has disappeared.

## Profile interpretation

Profile metadata was independently checked against the `.cpuprofile` sample/node counts and durations. Each profile has approximately 27,000 idle samples and fewer than 300 other samples. The leading common stack is native SQLite `get` under `store.snapshotMetadata` → `runDataset`, with 159 samples on each source and weighted sample intervals of approximately 173.993 ms RC16 / 172.620 ms candidate. This is a shared optimization lead, not evidence of a candidate-specific hotspot.

The profile interval includes Inspector startup outside the separately sampled process-CPU window: the `node:inspector` `post` frame receives a single 76.971 ms RC16 / 49.623 ms candidate weighted interval. Overall profile durations are 30.078633 / 30.051701 seconds. Profile-mode process CPU is about 1.26 seconds on each source and reported event-loop utilization about 0.642, unlike the unprofiled counts run. These observer-affected values are unsuitable for an idle performance comparison. Weighted profile intervals are sampled wall intervals, not measured process CPU attribution; the retained profile summary labels this correctly.

## Assessment

No provenance or counter-boundary blocker was found in the completed diagnostics. They show a shared startup backlog and substantial repeated metadata/protection work after it drains. They do **not** establish either unavoidable feature cost or harmless noise as the cause of the original CI increase. The source-guarded, unprofiled ABBA observation is the appropriate next step; its repeated windows should be treated as trajectories within each process, not independent trials.
