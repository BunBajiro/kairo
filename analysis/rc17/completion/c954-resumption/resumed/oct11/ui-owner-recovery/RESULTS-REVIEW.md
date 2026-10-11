# Independent UI recovery results review

11 October 2026. **Pass for the two remaining local UI cap lanes.** No correctness, ownership or evidence-integrity blocker was found. This is an offline review of the completed recovery; no browser, application, build or measured workload was rerun. Release approval remains separate.

Recovery `ui-owner-recovery-attempt1` executed only repeat-cap followed by distinct-cap on candidate `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`, fingerprint `09dfcf5950c2e6b340ea03ae1e813caffd2bd4e4d98d1e1c7a7ae6fe6ad22262`. Both worker and outer command exits were zero. All four outer commands, including source verification before and after, recorded actual descendant drain, empty final process groups and `waitpid` confirmation of no children. The six adopted child exits were zero. Four temporary-path observations were empty.

Independently rehashed 15 final inventory files, 13 closed files, 25 input pins, nine adoption bindings and all 506 candidate source/build files. Both inner receipts bind their raw result and closed harness log; their harness/owner identities and source verification match the outer envelope. Raw source and served-asset hashes match disk. Final cross-binding passed. The archived old owner and corrected owner remain separately bound.

The original failed attempt and failed repeat-small lane receipt remain failed and byte-identical. The already audited four successful lanes and repeat-small worker are retained through the unchanged independent audit and adoption hash links; their measurements were not reanalysed or rerun. This review adds only the two previously unrun lanes to local UI coverage.

Both new records use schema 2 with `environment.smoke:false`. Each completed two warm-up cycles and 12 measured cycles, all 15 unmounted ownership checkpoints and 14 pilot-switch fences. No stale universe requests, wrong-owner requests, previous replay visibility, renderer exceptions or successful external fetches were recorded. Each retained one successful SSE connection. Overview checkpoints had stable global listener signatures, no replay/map DOM, and final counters of one document, 583 nodes and 614 event listeners.

Both fixtures validated 1,000 visits, 10,000 events, 999 travel entries, owner 42 and matching route hashes, with no gaps, inferred visits, missing coordinates or truncation. Repeat-cap covered 11 distinct systems; distinct-cap covered 1,000. Backward seek returned to the initial system at zero, end transition paused at the final system, and start/middle playback advanced by 360,000 ms at 60× before pausing.

Retained costs remain visible:

| Diagnostic | Repeat-cap | Distinct-cap |
| --- | ---: | ---: |
| Warmed retained heap, bytes | 9,368,840 | 9,364,132 |
| Retained heap after 12 cycles, bytes | 9,980,556 | 9,990,592 |
| Growth from warmed baseline | 611,716 B (6.53%) | 626,460 B (6.69%) |
| Replay preparation window | 937.33 ms | 922.34 ms |
| Replay request total | 188.29 ms | 194.73 ms |
| Start/middle renderer task duration | 1,364.89 / 1,957.74 ms | 1,536.97 / 1,934.02 ms |
| Start/middle maximum RAF interval | 33.3 / 16.8 ms | 50.1 / 33.4 ms |

Distinct-cap start recorded one **62 ms long task** and one RAF interval above the harness threshold. Other timed samples recorded no long tasks. The task durations cover approximately six-second playback windows. Preparation includes navigation, API/parse, readiness polling and two fixed 350 ms settles, so it is not a pure API latency measurement.

Heap figures use the third explicit GC pass after two seconds on Overview. Growth persists despite stable DOM/listener observations; twelve cycles do not prove absence of leaks or a settled plateau. These are instrumented headless software-renderer, single-candidate observations, with different route geography between cases. They establish neither matched performance improvement nor desktop GPU/FPS, RSS or natural-GC memory behavior. Complete replay bodies are not archived; fixture assertions and matching recorded route hashes are the available semantic evidence.

Machine-readable pins, checks, timing values and limitations are in `RESULTS-AUDIT.json` (SHA256 `5ff35259b884520340464d81dc853176c0ddd76fa835ab27e3a6bf418c692934`).
