# Independent final updater results review

11 October 2026. **Pass for the original local updater collection and lifecycle checks.** All 25 inventory activations and six original 60-second windows completed on candidate `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`. No evidence-integrity or functional blocker was found. Conversion has visible CPU, memory, latency and restart costs; collection success is not a uniform performance improvement or release approval.

This review executed no runtime, build or application changes. Independently verified 44 input pins, 15 final inventory files, 13 closed files, all 506 source/build files, 21 setup inventory pins and seven loaded-harness hashes. Source and fingerprint agree before/after. All four outer commands exited zero, with actual descendant drain, empty final groups and `waitpid` confirmation of no children. Five temporary-path observations were empty. The reviewed owner acquired the performance then benchmark locks and held them through final checks; the existing loaded guard avoids nested acquisition. Final cross-binding passed.

The real 99,197,259-byte build 3552227 archive rehashes to `0788ec9352556fcb2eb28ba084eb1f408cb0ad22f8e30d91bfa49f534ec1ad83`. The unchanged adapter uses the real default `workerBuild` → `sde-worker.mjs` → `buildSde` path, replacing dataset transport with this local archive. Each conversion produced the same seven-file, 23,038,926-byte manifest, apart from installation timestamp, with 8,490 systems and matching archive hash. The successful worker asserted every generated file's hash/size and absence of staging/download leftovers before cleanup. Generated files were then removed; the archived manifest and executed assertions are the surviving output evidence.

All six original request schedules and 5-second installation offsets match. There were 1,386 HTTP attempts: 1,381 succeeded and five failed during conversion 2's announced restart. Each conversion performed exactly one replacement; all nine runtime generations recorded created/summary/closed probes, with no supervisor, shutdown, unexpected external-request or scheduler errors. Both SSE clients reconnected after replacement, and updated dashboard revision was `3552227:3552227:3552227`. The real Origin/CSRF protection stayed on the installation route. Valid POSTs returned 202; the unchanged worker asserted the same cookie and CSRF token survived replacement. Raw cookie/token values and response bodies are not separately archived, and this workload contains no new negative-auth test.

Inventory initialization remains bounded in this warm-filesystem, single-process trial. First activation took **13.44 ms** wall / **14.559 ms** CPU, including first-service metadata initialization. The remaining 24 had wall p50/p95/max **7.986 / 10.442 / 10.923 ms**; CPU p50/p95/max **8.416 / 22.172 / 23.220 ms**. Across all 25, wall p95 was 10.923 ms. RSS peaked at 98,521,088 bytes and ended at 87,691,264 bytes; these unforced-GC values do not establish retained-memory growth or cold-start behavior.

Original window order and costs:

| Window | Regular HTTP success / attempts | HTTP p95 / max ms | Recorded runtime CPU ms | Highest observed RSS MiB | Restart gap ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Control 1 | 230 / 230 | 86.768 / 117.465 | 5,070.478 | 275.238 | — |
| Conversion 1 | 230 / 230 | 87.416 / 112.887 | 19,746.459 | 515.105 | 716 |
| Conversion 2 | 225 / 230 | 92.886 / 117.207 | 18,783.449 | 544.938 | 716 |
| Control 2 | 230 / 230 | 88.729 / 120.897 | 4,948.611 | 269.305 | — |
| Control 3 | 230 / 230 | 81.172 / 107.097 | 4,738.748 | 272.984 | — |
| Conversion 3 | 230 / 230 | 81.699 / 98.666 | 18,502.189 | 550.570 | 707 |

Regular HTTP excludes each conversion's install and post-replacement bootstrap requests. Latency distributions use nearest-rank quantiles over successful requests; failures remain separate. Conversion 2's five fetch failures affected state42, Stream state, universe, map and state43, 427–428 ms after the restart announcement. Each conversion also recorded six connection-error retries per SSE client: **36 reconnect errors total**. These are bounded observed interruptions, not uninterrupted availability. Maximum dispatch lateness by original window order was 3/19/5/7/2/13 ms.

For each same-source pair, applying its observed building interval to identical scheduled elapsed offsets in control and conversion selects 39 regular requests per condition, all successful:

| Pair | Building wall ms | Control → conversion HTTP p95 ms | Control → conversion HTTP max ms | Building CPU ms |
| --- | ---: | ---: | ---: | ---: |
| 1 | 10,519 | 88.502 → 107.143 | 96.035 → 112.887 | 14,924.733 |
| 2 | 10,317 | 92.723 → 96.224 | 101.478 → 98.084 | 14,519.543 |
| 3 | 9,887 | 89.312 → 82.167 | 93.708 → 95.779 | 14,275.933 |

Conversion-minus-control runtime CPU costs were **+14,675.981 / +13,834.838 / +13,763.441 ms**, or 3.89×/3.80×/3.90× control. Highest observed RSS increased **239.867 / 275.633 / 277.586 MiB**. Full-window successful HTTP p95 rose 0.649/4.157/0.527 ms. Pair 1's building interval has a larger latency cost, and pair 3's maximum still rises despite lower p95.

Event-loop p95/max, in original order, were 10.314/149.553 ms (control 1),10.445/150.733 then 10.314/77.005 (conversion 1 generations),10.420/128.319 then 10.306/83.165 (conversion 2),10.330/128.254 (control 2),10.314/125.043 (control 3), and10.338/150.733 then 10.322/68.420 (conversion 3). The conversion 3 first-generation maximum exceeds its control. Building-phase p95/max were 10.412/83.362,10.461/84.476 and10.330/65.241 ms.

CPU is summed measured runtime-generation CPU, including Worker CPU; it excludes launcher/supervisor, startup before measurement, teardown after summary and 344/344/324 ms between generation meters. RSS is the maximum of meter peaks and 100 ms observations, a sampled process-wide lower bound, not summed generation peaks or retained heap. Building boundaries are observed at about 100 ms resolution. Event-loop values are recorded histogram summaries; raw histograms cannot be recomputed or pooled. A second read-only numeric reviewer independently reproduced the HTTP distributions, paired subsets, CPU/RSS rows and restart gaps.

These are paired conversion-versus-control conditions at one source, not updater improvement over RC16 or 0.7.3. Internet download, production ESI, desktop browser and OBS behavior remain outside scope. Earlier adverse evidence stays valid. Local collection can advance to independent Actions and the wider release disposition; this review grants neither clean-candidate user review nor merge approval. Exact pins, calculations and limitations are in `RESULTS-AUDIT.json`.
