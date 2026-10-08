# Saved hidden binding decision and names wire diagnosis — 8 October 2026

**Adopt the saved-hidden-only Core filter. Pursue a separate names protocol trial; do not close full-names wire cost as a retain decision.** This is exact985-derived isolated evidence, not final integrated acceptance or cleanRC17. PR10 stays withdrawn.

## Identity and checks

- Source base `985a6c17d466d01f1f098a1704de68f6eae5f6e6`; candidate changes one routine Core projection line and adds three regression tests. Exact hashes and patch: `proposal-files.json`, `hidden-only.patch`.
- `semantic-attempt1`: **29/29 tests passed**, including the three new hidden/source-read, preview/show/expiry/ownership and visible-disconnected/reconnect/OPSEC regressions; full source/harness end guards passed.
- `aligned-baseline-attempt1` and `aligned-candidate-attempt1`:72cases and10controls each, complete and source verified. No counter wrapper runs in ordinary timing.
- `aligned-abba-attempt1`:4fresh processes in baseline/candidate/candidate/baseline order,72cases and10controls per process, all source/harness guards passed. `summarize.py` verifies result hashes, harness identity, all public state/output hashes and exact full-name wire byte parity before deriving `summary.json`.
- Independent reviewer `/root/review_enrichment_oct8` found no actionable correctness issue. Config sanitization produces boolean visibility; output uses the same predicate; save/preview still resolve submitted identities freshly; module/pilot/freshness gates, visible0-client updates and independent OPSEC publication remain. Reviewer verified exact985 core baseline and both candidate hashes.

The first current-source diagnostic attempt completed72rows but failed its first expiry control because the fixture retained a future refreshAt while setting only expiresAt to now. Production deliberately prefers refreshAt. That failed result, log, receipt and exact harness are preserved in `baseline-diagnostic-attempt1`; it is not passing evidence. Attempt2 fixed both deadlines and passed, but used a760001B names fixture. It remains separate. Final aligned results use the frontend profile's sparse-ID550001B directory; see `FIXTURE-ALIGNMENT.md`.

## Hidden evaluation decision

For50hidden widgets, three stable routine updates change full-names reads3→0, source snapshot reads12→0, explicit SQL prepares30→0 and Auth roster reads3→0. Existing Stream config reads remain3. All provider calls and stable no-work publications remain0. A one-second hidden-only progress advance changes182broadcast bytes/version+1 to0bytes/version+0. These are counters, not timing claims.

Ordinary update medians at20knames/oneStreamclient:10hidden widgets2.441→0.018ms;50hidden widgets2.525→0.043ms. The filter removes saved hidden projections only. Save and preview still compute fresh submitted configuration, and visible elements continue to update with0consumers for immediate reconnect freshness.

**Bounded transition cost:** save currently seeds binding values for all submitted elements. The first routine filtered update after a save removes hidden binding keys, so it adds one version change and, with connected clients, one identical-visible-state frame. The reviewer and coordinator accepted this bounded transition cost. The proposal does not claim that all work or frames involving hidden configuration disappear.

## Names wire decision

At20knames, the frontend-aligned map is550001JSON bytes. Four Wallet snapshots deliver2,201,277bytes perUIclient, or6,603,831bytes to three clients. Counters verify one packet encode per event, not per client;0UIclients perform0snapshot encodes. The existing encode-once and no-client optimization already works.

Ordinary baseline medians for four Wallet publications are0.591ms with0clients versus21.453ms with1client and21.359ms with3clients. At10knames,1client is10.844ms versus0clients0.580ms. These local consuming sinks isolate production Core/JSON/SSE work; they do not measure TCP, browser parsing or rendering. The frontend agent separately attributes substantial cost to repeatedly parsing/checking the same20k map. The results justify a separate revisioned full-map-on-change proposal. The hidden filter leaves the names protocol and names bytes unchanged.

## Adverse rows and coordinator disposition

All ordinary rows, per-arm p50/p95/max/mean/CPU and both paired deltas remain in `summary.json`; no adverse values were removed. Two specified visible rows must remain in final combined acceptance:

- Visible10widgets/20knames/0clients, updateBindings median2.313→2.427ms (+0.114ms); p952.754→5.680ms, paired p95 deltas+4.717/+1.135ms. The same fixture's no-work-sync median and p95 improve.
- Visible50widgets/10knames/1client, no-work-sync p956.905→12.815ms, paired p95 deltas+0.121/+11.698ms. No cause was established for this or the other tail variation.

The coordinator accepted the narrow filter using paired ordinary medians: the visible median increase is below the1ms material threshold. Short within-process p95 windows are not silently converted into that median gate, but the adverse tails remain recorded and required in the final matrix. No optional rerun was used to replace them. There is no blanket claim of faster visible workloads, lower tails or general CPU reduction.

## Complete ordinary rows

Times below are means of the two per-process medians / p95 values, in milliseconds. Full per-process observations, maxima, CPU and paired signs remain in the JSON.

| Names | Widgets | Visibility | Clients | Update median B→C | Update p95 B→C | No-work sync median B→C | No-work sync p95 B→C |
|---:|---:|---|---:|---:|---:|---:|---:|
| 100 | 0 | none | 0 | 0.054 → 0.030 | 0.103 → 0.089 | 0.481 → 0.326 | 5.867 → 6.235 |
| 100 | 0 | none | 1 | 0.013 → 0.015 | 0.019 → 0.028 | 0.254 → 0.260 | 0.438 → 0.506 |
| 100 | 0 | none | 3 | 0.014 → 0.015 | 0.043 → 0.041 | 0.279 → 0.278 | 0.609 → 0.511 |
| 100 | 10 | all | 0 | 0.380 → 0.352 | 0.636 → 0.591 | 0.726 → 0.696 | 1.062 → 1.112 |
| 100 | 10 | all | 1 | 0.351 → 0.337 | 0.609 → 0.534 | 0.640 → 0.639 | 1.086 → 0.864 |
| 100 | 10 | all | 3 | 0.296 → 0.288 | 0.618 → 0.451 | 0.607 → 0.554 | 0.761 → 0.784 |
| 100 | 10 | none | 0 | 0.301 → 0.022 | 0.564 → 0.118 | 0.654 → 0.261 | 0.861 → 0.508 |
| 100 | 10 | none | 1 | 0.286 → 0.021 | 0.599 → 0.068 | 0.647 → 0.258 | 2.434 → 0.585 |
| 100 | 10 | none | 3 | 0.329 → 0.023 | 0.586 → 0.088 | 0.654 → 0.269 | 1.020 → 0.489 |
| 100 | 50 | all | 0 | 0.569 → 0.503 | 0.939 → 0.751 | 0.849 → 0.835 | 1.505 → 1.050 |
| 100 | 50 | all | 1 | 0.496 → 0.533 | 0.826 → 0.809 | 0.758 → 0.858 | 0.953 → 1.141 |
| 100 | 50 | all | 3 | 0.654 → 0.490 | 1.022 → 1.251 | 0.861 → 0.741 | 1.373 → 0.907 |
| 100 | 50 | none | 0 | 0.545 → 0.064 | 0.934 → 0.141 | 0.859 → 0.316 | 6.118 → 0.664 |
| 100 | 50 | none | 1 | 0.617 → 0.064 | 0.968 → 0.211 | 0.724 → 0.316 | 1.051 → 0.646 |
| 100 | 50 | none | 3 | 0.452 → 0.050 | 0.651 → 0.091 | 0.785 → 0.315 | 0.994 → 0.543 |
| 1000 | 0 | none | 0 | 0.013 → 0.014 | 0.049 → 0.031 | 0.234 → 0.230 | 0.438 → 0.467 |
| 1000 | 0 | none | 1 | 0.013 → 0.014 | 0.029 → 0.041 | 0.338 → 0.247 | 0.481 → 0.497 |
| 1000 | 0 | none | 3 | 0.012 → 0.013 | 0.015 → 0.031 | 0.227 → 0.232 | 0.428 → 0.386 |
| 1000 | 10 | all | 0 | 0.331 → 0.358 | 0.488 → 0.640 | 0.577 → 0.674 | 0.703 → 0.901 |
| 1000 | 10 | all | 1 | 0.329 → 0.345 | 0.526 → 0.619 | 0.576 → 0.589 | 0.731 → 0.905 |
| 1000 | 10 | all | 3 | 0.523 → 0.346 | 0.859 → 0.519 | 0.612 → 0.615 | 1.134 → 1.061 |
| 1000 | 10 | none | 0 | 0.358 → 0.019 | 0.547 → 0.047 | 0.608 → 0.263 | 0.815 → 0.499 |
| 1000 | 10 | none | 1 | 0.328 → 0.022 | 0.494 → 0.044 | 0.604 → 0.293 | 0.785 → 0.529 |
| 1000 | 10 | none | 3 | 0.323 → 0.029 | 0.498 → 0.082 | 0.608 → 0.245 | 3.068 → 0.563 |
| 1000 | 50 | all | 0 | 0.503 → 0.549 | 0.714 → 0.871 | 0.760 → 0.809 | 0.889 → 1.753 |
| 1000 | 50 | all | 1 | 0.537 → 0.557 | 0.623 → 0.845 | 0.752 → 0.916 | 1.085 → 1.245 |
| 1000 | 50 | all | 3 | 0.498 → 0.525 | 0.676 → 0.765 | 0.740 → 0.801 | 1.246 → 1.182 |
| 1000 | 50 | none | 0 | 0.498 → 0.047 | 0.737 → 0.133 | 0.766 → 0.259 | 1.551 → 0.466 |
| 1000 | 50 | none | 1 | 0.553 → 0.054 | 0.877 → 0.089 | 0.996 → 0.291 | 1.124 → 0.452 |
| 1000 | 50 | none | 3 | 0.646 → 0.047 | 0.797 → 0.069 | 0.756 → 0.266 | 0.960 → 0.514 |
| 10000 | 0 | none | 0 | 0.011 → 0.011 | 0.014 → 0.015 | 0.240 → 0.227 | 0.693 → 0.451 |
| 10000 | 0 | none | 1 | 0.011 → 0.015 | 0.015 → 0.024 | 0.231 → 0.272 | 0.459 → 0.549 |
| 10000 | 0 | none | 3 | 0.011 → 0.015 | 0.027 → 0.039 | 0.230 → 0.224 | 0.401 → 0.404 |
| 10000 | 10 | all | 0 | 1.263 → 1.436 | 2.064 → 1.845 | 1.606 → 1.743 | 6.797 → 2.463 |
| 10000 | 10 | all | 1 | 1.250 → 1.443 | 1.517 → 2.028 | 1.578 → 1.626 | 2.406 → 2.176 |
| 10000 | 10 | all | 3 | 1.697 → 1.262 | 2.210 → 1.632 | 1.963 → 1.617 | 2.176 → 1.762 |
| 10000 | 10 | none | 0 | 1.256 → 0.017 | 1.720 → 0.029 | 1.494 → 0.233 | 2.072 → 0.392 |
| 10000 | 10 | none | 1 | 1.267 → 0.017 | 1.831 → 0.059 | 1.551 → 0.227 | 2.669 → 0.345 |
| 10000 | 10 | none | 3 | 1.365 → 0.017 | 1.901 → 0.032 | 1.762 → 0.225 | 2.284 → 0.342 |
| 10000 | 50 | all | 0 | 1.541 → 1.549 | 3.332 → 2.414 | 1.905 → 2.207 | 3.182 → 3.160 |
| 10000 | 50 | all | 1 | 1.605 → 1.476 | 2.102 → 1.997 | 1.788 → 1.853 | 6.905 → 12.815 |
| 10000 | 50 | all | 3 | 1.545 → 1.474 | 2.202 → 1.946 | 1.825 → 1.821 | 2.100 → 2.420 |
| 10000 | 50 | none | 0 | 1.490 → 0.043 | 1.814 → 0.087 | 1.806 → 0.268 | 2.265 → 0.530 |
| 10000 | 50 | none | 1 | 1.490 → 0.043 | 1.959 → 0.090 | 1.818 → 0.260 | 6.632 → 0.384 |
| 10000 | 50 | none | 3 | 1.496 → 0.044 | 1.987 → 0.105 | 1.761 → 0.296 | 2.678 → 0.910 |
| 20000 | 0 | none | 0 | 0.012 → 0.012 | 0.023 → 0.014 | 0.215 → 0.237 | 0.345 → 0.485 |
| 20000 | 0 | none | 1 | 0.013 → 0.012 | 0.022 → 0.028 | 0.274 → 0.233 | 5.024 → 0.443 |
| 20000 | 0 | none | 3 | 0.011 → 0.012 | 0.023 → 0.020 | 0.223 → 0.294 | 0.515 → 0.801 |
| 20000 | 10 | all | 0 | 2.313 → 2.427 | 2.754 → 5.680 | 2.773 → 2.637 | 3.653 → 2.983 |
| 20000 | 10 | all | 1 | 2.365 → 2.295 | 3.171 → 2.767 | 2.822 → 2.674 | 5.745 → 8.766 |
| 20000 | 10 | all | 3 | 2.508 → 2.423 | 3.426 → 3.971 | 2.759 → 2.665 | 4.877 → 3.016 |
| 20000 | 10 | none | 0 | 2.375 → 0.018 | 2.970 → 0.038 | 2.684 → 0.246 | 5.883 → 0.375 |
| 20000 | 10 | none | 1 | 2.441 → 0.018 | 3.248 → 0.125 | 2.774 → 0.254 | 3.226 → 0.574 |
| 20000 | 10 | none | 3 | 2.491 → 0.018 | 3.550 → 0.032 | 2.861 → 0.253 | 5.180 → 0.417 |
| 20000 | 50 | all | 0 | 2.649 → 2.486 | 3.235 → 3.088 | 3.147 → 3.052 | 6.824 → 10.807 |
| 20000 | 50 | all | 1 | 2.640 → 2.591 | 3.198 → 3.290 | 2.924 → 2.965 | 3.493 → 3.581 |
| 20000 | 50 | all | 3 | 2.626 → 2.692 | 3.580 → 5.799 | 2.931 → 3.028 | 3.906 → 4.959 |
| 20000 | 50 | none | 0 | 2.558 → 0.043 | 2.949 → 0.092 | 2.908 → 0.260 | 8.248 → 0.410 |
| 20000 | 50 | none | 1 | 2.525 → 0.043 | 3.903 → 0.125 | 2.899 → 0.271 | 3.407 → 0.546 |
| 20000 | 50 | none | 3 | 2.756 → 0.043 | 4.030 → 0.118 | 2.928 → 0.255 | 3.364 → 0.638 |

| Names | UI clients | Four-snapshot median B→C | Four-snapshot p95 B→C | Names JSON bytes |
|---:|---:|---:|---:|---:|
| 100 | 0 | 0.609 → 0.579 | 2.591 → 2.787 | 2751 |
| 100 | 1 | 0.670 → 0.783 | 1.197 → 1.400 | 2751 |
| 100 | 3 | 0.670 → 0.664 | 1.480 → 1.248 | 2751 |
| 1000 | 0 | 0.571 → 0.541 | 0.980 → 1.143 | 27501 |
| 1000 | 1 | 1.129 → 1.236 | 1.718 → 1.746 | 27501 |
| 1000 | 3 | 1.191 → 1.256 | 2.499 → 1.838 | 27501 |
| 10000 | 0 | 0.580 → 0.584 | 1.017 → 1.187 | 275001 |
| 10000 | 1 | 10.844 → 10.940 | 13.935 → 13.229 | 275001 |
| 10000 | 3 | 10.443 → 9.779 | 18.906 → 16.004 | 275001 |
| 20000 | 0 | 0.591 → 0.574 | 0.979 → 0.924 | 550001 |
| 20000 | 1 | 21.453 → 20.456 | 37.786 → 35.899 | 550001 |
| 20000 | 3 | 21.359 → 20.347 | 40.276 → 33.752 | 550001 |

## Remaining work

Integrate only the two proposal files, preserving exact source hashes, then run the required combined verification. Final acceptance must retain both specified visible tail rows. A separate global names protocol needs its own bootstrap, selected-pilot-independent delivery, change batching, reconnect/lost-event, late-state and process-epoch tests plus matched backend/browser measurements. Other whitepaper findings and final local/independent gates remain open.
