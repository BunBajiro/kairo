# F5 / F8 / F9 ordinary populated result

All four fresh ABBA workers and the separate native recovery worker completed on the frozen a7 baseline/candidate builds. Each ordinary arm passed all 12 phases and five output checks. Source and 20 compiled assets per root, worker/helper/harness hashes, browser binary/version and final guards remained exact. Every process records actual Chromium exit, application close and temporary-data removal. Runtime lock released after exit 0.

No application edit is proposed. The new evidence supports retaining the current administrative refresh ownership and records a useful Studio idle reduction. Drag and renderer measurements are mixed; this is not an overall performance win or final RC17 acceptance. PR #10 stays withdrawn. The complete raw rows and descriptive summaries are in `attempt-1/`, with the original failed attempt preserved separately in `../attempt-1/`.

## Source, input correction and parity

Application commit: `a7b1bf97b0073695926c443e52d523638e59e48d`. Candidate source/build fingerprint `d05f895e352deeb193eb513b38b5bcb14d2d21a52d679d4c38a5bf967cc6e7f6`; four-file legacy-mechanism baseline `7f5b08d3a8712e1784311aee7f89003178994da21fe4dcfc17d6d954dd5078c9`. The other 484 files are identical. These are not the old full eight-file c954 ablation.

The original attempt's candidate drag failed at 40/155 versus expected 124/184. The separate four-arm pointer diagnostic reproduced the native event cause: CDP moves omitting `button` lost pointer capture at the first move in both variants. Candidate intentionally ends the drag on lost capture; legacy ignores it. Adding explicit `button: 'left'` retained capture through release and both controls reached 124/184. V2 makes only that input correction and stricter cleanup changes. No DOM observer, app hook or relaxed geometry assertion enters these cost windows. Original failed/partial values are never pooled with v2.

Every v2 arm retains the same populated fixture: 32 visible elements (4 clocks, 4 wallet, 24 static); 12 Markets hubs, 2,880 saved items, 60 quick types and 8 saved jobs; 240 saved OBS actions with 24 editors visible. Fixtures and final output match across all arms. All three draft drag endpoints match independently calculated 4-unit grid/clamp coordinates; saved Stream geometry remains 40px/155px. Studio displays the final 2,009 ISK input, while the source ends with 32 elements, 3,009 ISK and the unchanged static text. No runtime exception or provider request occurred.

## Every ordinary cost row

These are medians of two fresh process observations per variant. No counter reset occurred. Full individual observations, all request records, elapsed windows, layout/style counters and ordinary uncollected heap endpoints remain in `attempt-1/summary.json`; `attempt-1/task-table.md` prints both task observations. Two processes per variant support a descriptive comparison, not statistical significance or a no-regression guarantee.

| Phase | Baseline task ms | Candidate task ms | Task delta ms | Baseline script ms | Candidate script ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| studio-first-use | 258.175 | 249.978 | -8.197 | 117.441 | 112.072 |
| studio-idle-native-6s | 53.156 | 40.030 | -13.126 | 27.009 | 13.469 |
| studio-three-drags | 897.290 | 952.604 | +55.314 | 544.469 | 580.656 |
| studio-ten-source-updates | 179.873 | 183.935 | +4.061 | 124.816 | 119.186 |
| markets-first-route | 104.594 | 110.822 | +6.228 | 41.664 | 44.622 |
| markets-idle-native-6s | 15.562 | 11.517 | -4.045 | 6.684 | 2.976 |
| markets-running-native-6s | 15.925 | 30.568 | +14.643 | 5.605 | 17.697 |
| obs-populated-route | 204.257 | 176.518 | -27.739 | 125.433 | 118.935 |
| obs-idle-native-6s | 67.884 | 14.047 | -53.836 | 53.254 | 2.522 |
| source-first-use | 18.106 | 23.695 | +5.589 | 2.750 | 2.659 |
| source-idle-native-6s | 12.327 | 13.255 | +0.928 | 3.490 | 3.290 |
| source-ten-binding-updates | 21.506 | 20.870 | -0.636 | 8.673 | 8.254 |

First-use readiness medians were Studio 441.146 → 428.589 ms and browser source 61.843 → 65.001 ms. The latter is an adverse +3.158 ms first-use observation, alongside +5.589 ms renderer task work. Markets route elapsed 769.309 → 782.136 ms is also adverse; this route includes a fixed 650 ms settle and is not a pure click-to-paint measure. OBS populated route is a remount, not cold first use.

Three-drag task observations were baseline 948.639/845.941 ms and candidate 854.642/1050.565 ms over approximately 4.12 seconds including actions and settling. Median task +55.314 ms and script +36.187 ms are retained adverse results. These overlapping small samples do not establish a drag speedup or its cause. The workload sends one sequential CDP move at a time and does not demonstrate a particular multi-event-per-frame benefit. Do not justify a faster-drag claim from the frame-coalescing implementation or reduced POST counts alone.

## Removed and intentionally added administrative work

- Studio geometry-only preview POSTs: 3 per baseline arm, 0 per candidate arm. Source-update POSTs remain 10 in each arm; minimal candidate responses total 8,970 encoded bytes versus 13,390 baseline bytes in that phase. No source observation was dropped.
- Markets idle, 6 seconds: 1 full GET per baseline arm (16,936 encoded bytes), 0 per candidate. Task median falls by 4.045 ms and script by 3.708 ms.
- OBS idle, 6 seconds: 2 full GETs per baseline arm (73,684 encoded bytes), 0 per candidate. Task median falls by 53.836 ms and script by 50.733 ms.
- Markets running, 6 seconds: baseline 1 full GET; candidate 3. Candidate deliberately polls active jobs every 2 seconds versus legacy 4 seconds, so task increases 14.643 ms and script 12.092 ms. The extra work provides the already declared active-job cadence; it is not an idle regression or a hidden cost saving.
- Studio idle, 6 seconds: no requests in either arm. Task median falls 13.126 ms and script falls 13.540 ms, consistent with moving clocks out of the full editor. The paired four-file comparison does not isolate an exact causal share for each mechanism.
- Browser-source idle and ten binding updates remain low absolute work and mixed (task +0.928 and −0.636 ms respectively). This does not establish total OBS CPU savings.

## Native recovery and disposition

The separate candidate process used real timers. Markets observed exactly one `/api/markets` fallback during 35 seconds. OBS observed exactly one `/api/obs/status` read and zero full `/api/obs` reads during its 35 seconds. No virtual timer or test-only timer receiver was used. Both controls preserve the native receiver correction and complete the declared long-deadline gap. Hidden/focus/reconnect and dirty-save fences retain their prior diagnostic source boundaries and belong in final combined acceptance.

**F5 administrative slice:** the populated idle/active ordinary comparison and native 30-second recovery gaps are now measured and passing. Retain the current ownership: idle full reads disappear, active jobs keep the intentionally faster cadence, and recovery remains bounded. This does not independently close every Goals/notes read or the final combined frontend gate.

**F8:** current source retains one debounced generation-fenced preview owner, source/pilot invalidation, clock leaves and bounded drag work. Exact compiled drag/draft/output correctness passes with valid captured input; meaningful idle work falls and geometry-only POSTs are removed. Populated drag work does not show an improvement here, and one candidate is adverse. Any further drag optimization must first explain that scoped cost, without removing lost-capture safety or weakening endpoint equivalence. This lane supports a bounded retain decision, not a universal speed claim; the coordinator owns whether the adverse drag row needs further attribution before finding closure.

**F9:** retain changed-text/time-widget/recovery-write boundaries and the rendering-before-storage-failure safety order. The populated ordinary run verifies live output parity but shows mixed small renderer costs and adverse first use. Prior diagnostic coverage remains necessary for write suppression, denied storage, protection/disconnect and recovery; this is not actual OBS/audio/GPU acceptance. After storage denial, the live page uses latest cover geometry, while a full offline reload can recover only the last successfully persisted geometry. Do not erase that limit.

The declared ordinary/native lane is complete. The final combined source/build matrix, startup/state/idle/retention gates, independent CI/package and real user EVE/OBS/Windows checks remain separate. Any acceptance language must name the source and these measured tradeoffs.
