# Mixed operational responsiveness follow-up

The added navigation and map workload materially delayed other requests on RC16's real server. All four windows completed the planned workload and retained safe location/OPSEC ordering. This is a bounded contention result, not a browser/GPU/physical OBS test or a production percentile estimate.

## Evidence and scope

- Source: RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1`; all 405 application blobs verified before execution. Only the two documented investigation guard files were exempted.
- Command, from the repository root: `node analysis/rc16/followup/harness/mixed-run.mjs analysis/rc16/raw/followup/mixed`. The runner acquires `/tmp/kairo-rc16-benchmark.lock` itself. No other benchmark ran concurrently.
- Raw evidence: `../raw/followup/mixed/mixed.json`; derived transitions and counts: `../raw/followup/mixed/mixed-summary.json`. Reproduce the summary with `node analysis/rc16/followup/harness/mixed-summary.mjs analysis/rc16/raw/followup/mixed/mixed.json`.
- Node v24.19.0, AMD EPYC 9V74 host, nine logical CPUs exposed. Order: quiet, loaded, loaded, quiet. Each fresh server/fixture had a 28-second measured window; first window start through last window end was 115.247 seconds. Two replicates per condition warrant ranges, not significance claims.
- Real Core, scheduler, auth-vault/ESI processing, HTTP routes, dashboard SSE, and stream SSE ran against synthetic transports. Two pilots, 20,000 assets each, 50,000 events, one active session, eight 100-node maps, a 50-stop navigation itinerary, and ten stream widgets. Seven widgets had real session/wallet/ship bindings, including repeated sources. Legacy session backfill was held fresh; the live feed cursor remained enabled. There were zero forbidden/external requests.
- Quiet and loaded windows shared 28 dashboard state requests, 28 stream state requests, two SSE clients, asset refreshes, and the same fake location changes/outage/recovery. Loaded windows added four 50-stop navigation plans plus four map changes and their read bursts: 56 versus 92 total HTTP requests. Every planned request completed successfully. Each plan returned all 50 segments; changed map names and retained 100-node maps were checked.

## Results

| Measure | Quiet range | Loaded range |
|---|---:|---:|
| Server CPU, % of one core | 7.47–8.24 | 22.68–23.20 |
| Maximum server event-loop delay | 115.08–120.46 ms | 886.57–984.09 ms |
| Common dashboard state p50 | 46.45–53.41 ms | 57.96–65.97 ms |
| Common dashboard state p95 | 77.41–77.79 ms | 987.10–1,012.19 ms |
| Common stream state p95 | 80.35–91.95 ms | 870.62–880.31 ms |
| Navigation p50, four requests per loaded window | — | 788.72–795.27 ms |

The common dashboard tail rose about thirteenfold while the observer's maximum event-loop delay stayed at 46–66 ms across all windows. This supports server contention under the added workload. It does not isolate navigation from the map bursts or provide the exact savings of a proposed refactor. Long navigation and repeated synchronous projections merit priority because they interfere with otherwise identical polling.

## Freshness and protection ordering

The synthetic provider phase changed at offsets 2/8/14/20 seconds, but expected protection was derived from observations accepted by production, not from those injected times. Each run actually fetched hostile space, high security space, an intentional HTTP 503, and recovery. The normal scheduler first requested these at 2.858–2.970, 8.854–8.967, 14.857–14.965, and 20.850–20.945 seconds respectively. The fake response delay was nominally 50 ms, with observed delays up to 80 ms under contention.

Accepted hostile observations hid the overlay; stale observations from the 503 entered `unknown` and remained hidden; recovery reached the stream client. Across the four transitions per run, location commit to protection update was 1–22 ms and commit to stream receipt was 21–59 ms. These are same-host epoch-clock differences at millisecond resolution; HTTP durations use the observer's monotonic clock. No unsafe producer release or invalid stream unhide was observed. The independent reviewer additionally matched every in-window visible wire state covered by the producer trace to an unexpired accepted producer state; all arrived at least 24 seconds before that state's expiry.

These windows are not adversarially aligned to make every ESI completion coincide with the worst navigation stall. They establish correctness during this schedule and the presence of large server stalls; they do not bound worst-case protection latency. Both SSE connections remained alive without protocol errors. Cleanup completed with zero pending transport operations or forbidden requests.

## Consolidation opportunity

Every run called `setBindings` 29 times with a JSON-identical projection to the preceding bindings. Each stream client received 34 state messages, 29 of which repeated content after excluding only `version` and `serverTime`; the encoded stream events totaled 96,296 bytes per window, of which 82,114 bytes (85.3%) belonged to those unchanged state messages. This fixture includes actual session, wallet, and ship bindings, rather than empty binding snapshots. Core currently projects every configured element separately, and `setBindings` unconditionally triggers a state broadcast. Reusing identical source projections within an update and coalescing unchanged data broadcasts are concrete refactoring candidates.

Freshness must remain explicit: dashboard traffic totaled about 8.09 MB per window, and all seven repeated-data snapshots also changed freshness/status metadata. Those events cannot be removed merely because their data hash matches. Preserve protection deadlines, heartbeat/liveness, state version semantics, and recovery notifications when testing consolidation. This measurement counts repeated work and bytes; it does not quantify the CPU savings available from removing them.

## Retained smoke failures and original legacy fixture correction

`mixed-smoke`, `mixed-smoke-2`, and `mixed-smoke-3` remain under `../raw/followup/`. The first exposed a harness error inherited from the frozen legacy fixture: `universe:feeds:storms` was seeded as `[]`; production expects `{storms:[],points:[]}`. The second correctly observed `triglavian` rather than the intended `hostile` case because the first qualifying low-security atlas system was in Pochven. The final harness selects a known-space system outside region 10000070. Its outage ends at 20 seconds so the real retry schedule reaches recovery inside the unchanged 28-second window. No production polling was forced. Smoke 3 passed before the full four-window run; failed smokes are not application regressions or performance results.

The storms error also qualifies the original local and GitHub legacy idle results. In RC16, `Core`'s background ticker calls `universe.tick()`, whose `Promise.allSettled` contains `feeds.tick()`. The malformed cached storms value rejects when `feeds.refresh()` builds `feeds.state()`; the outer promise still resolves, so the ticker's catch does not report that rejected subtask. Universe operations and politics refresh continue. Stable v0.7.3 has no Core Universe service, so it does not traverse this branch. Initial Universe construction schedules expiry without calling feed state; original direct state/session/OPSEC/market/database probes do not call that projection either. The limitation is an unsuccessful RC16 background feed projection, not blanket invalidation of the original database or HTTP evidence.

A separate corrected backend-only ABBA copy under `followup/harness/legacy-corrected` repairs the schema and asserts real tick-subtask success. The successful rerun is documented in `followup-legacy-corrected.md` and supersedes the original claim about fully successful RC16 warm-cache background feed ticks. The original frozen harness and measurements remain intact. The corrected fixture's version-1 fingerprint describes workload counts only; corrected content is identified by scope and harness hashes, not that fingerprint alone.
