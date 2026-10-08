# M7 decision on the selected 9afa lineage

Adopt the exact four-file isolated lazy-layout patch. The coordinator applied it to the selected continuation, and affected combined-source correctness gates pass. The historical matched decision supports deferring allocation and derivation of a projection that has not been requested. This is not a uniform whole-browser speed claim. Final RC17 acceptance remains separate.

Source is exact `9afa9a7197fa6b5a802e9efdaa322dedf2439150` plus the four files in `proposal-files.json`; the baseline and trial source-manifest difference is exactly that set. The modified UniverseMap baseline bytes and all four trial bytes match the independently measured c954 trial. No excluded 508/build #55 integration was used.

## Current validation

`attempt1/completed.json` is complete with all command logs and source/build fingerprints. All 60 affected layout, navigation, schematic and replay semantic tests pass; type checking passes. Both builds are fresh. Unchanged compiled browser harnesses run once on each source in Chromium 138.0.7204.0 and preserve all 12 paired Canvas pixels, overview content, physical-distance scales and point-count labels exactly. Both radar labels retain 23 systems; first/warm projection switches, heap pages and unmount cleanup pass. No application errors or external traffic; all source and cleanup checks pass. These two browser runs are affected correctness verification, not a new performance ABBA. All recorded timings and heap observations remain in raw outputs.

Baseline source/build fingerprint: `ea97c17b0a822e9cf4f0fe56623209b4c77bd36bd93569c133538cc6add193f8`.
Trial source/build fingerprint: `9150adeba58fa766732c7abb4b95e4ec30fd7638c7fce4aa048818563fd33783`.

## Why the bounded change is supported

Historical complete kernel evidence contains 24 fresh timing processes plus 8 separate collected-heap processes; the compiled comparison contains 4 ABBA processes and 48 exact snapshots. All 36 child result hashes plus the separate compiled replay result were rechecked against retained completion receipts (`historical-evidence-integrity.json`). Those observations remain bound to their original c954 source.

| Historical kernel, ms, six-run medians | Eager | Lazy |
|---|---:|---:|
| Initial physical owner/layout | 14.610 | 6.878 |
| First schematic switch | 0.002 | 7.861 |
| Physical-first cumulative two layouts | 14.612 | 14.618 |
| Initial schematic owner/layout | 13.789 | 10.080 |
| First physical switch | 0.002 | 2.215 |
| Schematic-first cumulative two layouts | 13.791 | 12.354 |

The first switch pays the deferred work. Node collected-heap growth is roughly 0.960MiB eager versus0.484–0.491MiB lazy before using the second layout; both retain roughly 0.962–0.974MiB after both exist. Compiled collected-heap saving is roughly 0.30–0.35MiB while the second projection remains unused and disappears after both are used. Neither is ordinary RSS or a long-term memory claim.

All historical whole-browser ScriptDuration medians, including adverse rows, remain material:

| Compiled browser phase, ms | Eager | Lazy |
|---|---:|---:|
| Mount physical | 301.14 | 294.47 |
| Mount schematic | 292.01 | 302.78 |
| First physical switch | 49.63 | 59.03 |
| First schematic switch | 52.69 | 52.49 |
| Warm physical switch | 43.48 | 46.33 |
| Warm schematic switch | 40.84 | 44.35 |

Ranges overlap and drawing/territory geometry remain substantial. The change is adopted for verified removal of unused initial layout work with bounded ownership and equal outputs, not because every browser row improved.

## Ownership and scope review

Independent read-only review found no blocker for the existing immutable Atlas contract. One owner retains at most physical and schematic arrays for one `atlas.systems` identity. Atlas fetch/replacement and replay filtering create replacement arrays; no in-place mutation was found. React memo replacement releases the old owner, with no global cache. Finite known-coordinate filtering and order are unchanged; empty physical scale remains 10 and singleton/coincident scale 1000. Radar uses the same first valid known system. Empty radar arrays, replay radar-to-physical selection and wormhole discovery remain equivalent. Lazy fill is deterministic if React restarts rendering or discards a memo.

Historical compiled replay covers 1,000 systems/10,000 events, backward/end/natural completion, pilot fencing and unmount/remount. That result is verified against its original seven compiled asset hashes. Live Atlas replacement is covered by unit/kernel equality, not claimed from that browser replay. Current combined-source validation is now complete as recorded below; the historic replay remains separately labelled. Broader M6 scene work, M9 parsing and remaining RC17 findings are unaffected by this scoped decision.

## Combined-source integration acceptance

The coordinator applied the exact four files on base `985a6c17d466d01f1f098a1704de68f6eae5f6e6`. `integrated-attempt1/completed.json` is complete. All 60 affected tests, type checking and a fresh production build pass. The previous build was preserved outside the source checkout before rebuilding; its path is retained in the receipt. The combined source/build fingerprint is `2c72fd451304d300e05a57d9b4eecc8bd906233c65c9478ad353e4578a474872`, covering 487 source files and 20 compiled files.

All 12 compiled Atlas snapshots and both radar labels exactly match the frozen 9afa baseline. A separate current compiled schematic replay covers 1,000 distinct systems and 10,000 events; backward seek, midpoint playback, end seek, natural completion, pilot fencing and unmount/remount pass. All seven requested replay script hashes match the combined build. Renderer exceptions, external responses/fetches, stale Universe requests and wrong-owner requests are zero. Source and compiled files are unchanged between pre/post checks.

This closes the bounded M7 adoption and affected integration decision. Its replay lane uses focused collected-heap/ownership diagnostics; its timings are not ordinary performance evidence. It does not close final populated startup/idle/state, broader replay performance, other Maps findings or clean RC17 acceptance. The source is measured before the coordinator's Git commit; the immutable source-file/build hashes provide the binding for that subsequent commit.
