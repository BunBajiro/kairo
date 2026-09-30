# RC16 follow-up: browser ownership and longer recorded journeys

Status: complete. The isolated full run passed on 30 September 2026 in 172.5 seconds. No application changes. The initial `c30258d` benchmark remains frozen. This follow-up harness is frozen at `9b95f023147dfa5317c15ab203b8d1b6e9f65dac5e26121c69995a2390a67ca5` against RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1`.

The bounded run found working map/replay/pilot ownership cleanup, with no accumulating DOM or global listeners. Longer replay histories increased payload size and midpoint task time, but this fixture produced no long tasks or poor RAF intervals. It does not establish a browser leak or justify treating replay as a higher priority than the already measured Maps camera and refresh costs.

Evidence: `raw/followup/frontend-retention-replay.json` and `.log`; smoke controls in `raw/followup/frontend-smoke.json` and `.log`. Independent review verified completion, all source/harness hashes, seven downloaded build-asset hashes, and all 502 recorded API requests returning 200. The full result contains eight timed samples, five retained-memory checkpoints, 17 after-unmount invalidation checks and one EventSource connection. Renderer exceptions, denied backend fetch attempts, browser external attempts and successful external responses were all zero.

## Measured results

Local environment: Node 24.19.0, HeadlessChrome 153.0.8010.0, nine logical CPUs exposed from an AMD EPYC 9V74 host, Linux SwiftShader, 1,600×1,050 at DPR 1. These results are local follow-up evidence, not pooled with the initial GitHub runner.

| Recorded visits / events | Distinct systems | Replay JSON body | Preparation task / window | Start playback task / window | Midpoint playback task / window |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 / 2 | 7 | 11,379 B | 218.9 / 905.7 ms | 2,005.2 / 6,072.2 ms | Not sampled |
| 100 / 20 | 11 | 70,537 B | 217.4 / 868.9 ms | 1,797.1 / 6,073.5 ms | 2,099.8 / 6,039.4 ms |
| 1,000 / 200 | 11 | 640,522 B | 225.1 / 896.4 ms | 2,088.3 / 6,075.3 ms | 2,753.8 / 6,091.7 ms |

Preparation windows include 700 ms of explicit settling, so they are not direct API or render latency. Each preparation also fetches the ordinary Universe snapshot (745,086 transferred bytes here) and revalidates static topology. Replay body sizes above exclude response headers. Server performance is evaluated separately by the backend lane; CDP request lifecycle durations are not server execution times.

All five playback windows had zero observed long tasks and RAF p95 of 16.7–16.8 ms. Each repainted the Atlas canvas 236–238 times. Midpoint 1,000-visit playback used 443.1 ms of script time and 886.2 ms of style recalculation, versus 411.2 ms and 786.9 ms at 100 visits. The larger total task duration is therefore not evidence that timeline scans alone dominate; repeated drawing, style and scene work also matter. The 1,000-visit start window included one ordinary `/state` poll; the other playback windows had no API requests. Exact route order, first/midpoint elapsed advancement, manual end position and automatic near-end completion all passed.

Retained-memory snapshots below use the third explicit GC pass. MB means decimal megabytes. Native DOM counters include non-element nodes; visible Overview elements remained 432.

| Completed cycles after warmup | Renderer JS heap used | Embedder heap used | Backing storage | Native DOM nodes / JS event listeners / documents |
| --- | ---: | ---: | ---: | --- |
| 0 | 9.482 MB | 3.132 MB | 1.693 MB | 577 / 612 / 1 |
| 4 | 9.822 MB | 3.259 MB | 1.693 MB | 577 / 612 / 1 |
| 8 | 9.906 MB | 3.387 MB | 1.693 MB | 577 / 612 / 1 |
| 12 | 9.960 MB | 4.034 MB | 1.693 MB | 577 / 612 / 1 |

Retained JS heap rose 478,228 bytes (5.0%) over the warmed baseline, with successive four-cycle increases of 339,860, 83,868 and 54,500 bytes. Embedder heap rose 901,176 bytes, so overall retained memory cannot be described as flat. This short run does not identify the owners of that growth or distinguish remaining warmup from longer-term accumulation. No map canvases, map nodes or replay controls remained on Overview. Window/document listener signatures were identical at every checkpoint, no worker targets remained, and all 17 scoped invalidation probes produced zero stale Universe GETs. Single-stream ownership, pilot-scoped map selection and removal of the previous pilot's replay timeline passed. There is no concrete ownership-leak blocker from this bounded sequence; keep the checkpoints as regression gates rather than adding a speculative memory rewrite.

## Method and limits

`followup/harness/frontend-retention-replay.mjs` runs against compiled production RC16 with two synthetic pilots. Each owns a 25-node and 100-node map. Recorded sessions contain 10, 100 and 1,000 visits, each 60 seconds apart, following a deterministic contiguous walk on bundled known-space gates. There is one meaningful synthetic event every five visits. Sessions are archived and nonoverlapping. The 100- and 1,000-visit routes revisit the same 11 physical systems: this tests growing recorded history, not growing geographic coverage. The browser verifies the returned visit sequence hash, counts, ownership, complete coordinates, no inferred visits, no gaps and no truncation before accepting results.

Warm Atlas preparation precedes a single ascending size sweep. Samples record preparation through ready controls, six seconds of playback at 60× at the beginning, and—for 100 and 1,000 visits—another six seconds around the midpoint. Each window advances six minutes of simulated travel; the full 16-hour-40-minute record is not played through. Preparation includes two deliberate 350 ms settles and readiness polling at 100 ms. End scrubbing and near-end automatic completion are behavior gates, outside playback timings. This is bounded exploratory scaling, not a balanced repeated estimate of a causal size effect. Software rendering and main-thread CDP durations cannot establish desktop GPU frame rates or total process CPU.

Retention diagnosis follows all playback timings. Two warmup cycles precede three batches of four cycles. Each cycle switches Atlas between local radar and physical projections, opens Maps at 100 and 25 nodes, switches pilots and maps, opens/plays/pauses a 1,000-visit replay, switches to the other pilot and verifies the ownership error removes the old timeline, closes replay, and returns to the original pilot on Overview. Scoped invalidation events sent after unmount must produce no Universe GETs. At quiescent Overview, the harness waits two seconds, releases remote listener handles, and records three explicit GC passes with retained heap and native DOM counters. Window/document listener signatures and worker targets are recorded alongside the visible DOM. Timed sample observers are inactive throughout this diagnostic phase.

These checkpoints can identify retained ownership growth after bounded use. They do not prove absence of all leaks, measure a full working day, or characterize normal-GC residency. No conclusion is based on short RSS observations. All runtime commands acquired `/tmp/kairo-rc16-benchmark.lock`; backend retained memory is a separate follow-up lane. Smoke ran reduced coverage separately and is excluded from timing/retention tables.

## Refactoring boundaries to preserve

- **Separate timeline preparation from replay ticks.** `components/kairo/session-replay.tsx:95–124` prepares sorted records but copies/reverses or scans visit/event/travel collections as time advances. A compiled timeline with indexed lookups and cursor advancement is a coherent ownership boundary if the longer replay evidence justifies it. Preserve backwards scrubbing, repeated-system visits, event ordering, pause and exact end behavior, fixed live snapshots, character ownership, and sovereignty-at-visit semantics.
- **Separate scene lifetime from camera lifetime.** The original checkpoint established Maps camera updates repeatedly reconcile the complete SVG/HTML scene. Refactor the camera controller and visible scene ownership together, preserving node interaction, minimap, fit/framing, detached surfaces, reduced motion, and teardown. Removing the unused zoom property is only the first measured opportunity.
- **Give scoped refresh work one owner.** The original duplicate-invalidation evidence supports a shared pilot/map refresh coordinator rather than independent subscriptions and timers. It should coalesce identical work, bound in-flight requests, reject obsolete responses, and dispose timers/subscriptions on pilot or view changes. The after-unmount event gate in this follow-up must remain valid; current cleanup should not be weakened by centralization.
- **Retire lifetime summary consumers deliberately.** Removing My footprint requires normalization of saved `journey` preset IDs and `visits` indicators, in both per-pilot/per-space session storage and server-saved views. `universe.tsx:140` assumes `intel.journey` exists when intel is present; changing the API contract without changing this consumer can throw. `universe-map.tsx:127` also uses journey systems to preserve discovered wormholes; replay trails use a distinct input at line 261. Preserve historical discovery and session/replay sources through explicit replacement contracts. System visit/last-visit metrics at `universe.tsx:188–189` and map context overlays need separate decisions. The comprehensive retirement matrix is in the follow-up methodology review.
