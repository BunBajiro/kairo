# Lazy layout compiled comparison

Complete diagnostic ABBA on the exact c954c0d baseline and four-file isolated layout trial. Source fingerprints are `472afe35fc135243350cad554205ac5845e5bd9404e81838a52aca8d09b63b27` and `1edc5371100e52e655d8d1e0569f3c89b8d1873e6875c079f76131c3d442aaa1`. Build receipts and source manifests are beside this report. The timed pages contain no sampling profiler, Canvas wrappers or application instrumentation. CDP metrics include the complete relevant main-thread work over a fixed post-action settle, not just the layout kernel. Worker rendering is not directly summed into ScriptDuration.

Four fresh-page sequences per browser process use physical/schematic/schematic/physical order; process source order is baseline/trial/trial/baseline. Every complete fixture has 8,490 systems, of which 5,485 are known-space points. **All 48 settled Canvas pixel hashes, physical distance scales and point-count labels agree exactly across both sources and every first/warm switch.** Local radar retains its exact 23-system label and returns to all known systems. `summarize-browser.py` asserts this equality plus raw/source manifest verification; `browser-summary.json` retains all samples.

| Main-thread ScriptDuration, ms (median; range; n=4 per cell) | Baseline | Lazy trial |
|---|---:|---:|
| Mount physical | 301.14 (275.06–323.19) | 294.47 (231.55–333.25) |
| Mount schematic | 292.01 (243.99–332.87) | 302.78 (270.55–331.15) |
| First switch to physical | 49.63 (48.26–91.37) | 59.03 (52.81–64.81) |
| First switch to schematic | 52.69 (49.10–57.95) | 52.49 (47.87–64.12) |
| Warm switch to physical | 43.48 (39.61–47.43) | 46.33 (44.20–49.08) |
| Warm switch to schematic | 40.84 (37.22–48.87) | 44.35 (36.45–52.49) |

These are mixed, overlapping whole-component/browser observations, not uniform end-user speed gains. In particular schematic mount and warm-switch medians are higher, as is first physical switch. The latter is expected to pay deferred physical work; the other directions are not attributed to the lazy owner merely from four samples. The separate exact kernel comparison is required to support its work-removal claim. Both sources still rebuild territory geometry on projection switches; that unchanged cost is visible here.

Collected heap uses **separate pages** and three explicit collections per boundary (two observations per source/projection). Physical-first heap is 19.982–19.987 MiB baseline versus 19.675–19.680 MiB trial; schematic-first is 20.006–20.043 versus 19.697–19.716 MiB. Thus the unselected layout saves roughly 0.30–0.35 MiB while it remains unused. Both-layout heap is comparable (baseline 21.416–21.488 versus trial 21.395–21.448 MiB), as is post-unmount heap (6.699–6.722 versus 6.686–6.711 MiB). This is collected heap in a bounded fixture, not ordinary RSS or a long-term plateau claim. DOM node/listener counts are retained in every raw result.

The accompanying kernel run has a retained failed first attempt: its comparison key erroneously conflated physical and schematic replacement hashes. The worker's exact expected-output checks passed; the corrected full run uses projection-specific keys in a fresh folder. That failed attempt is not accepted as a completed performance lane. Replay acceptance is separately owned by the Session lane. No result here closes combined final-source acceptance or authorizes a release.
