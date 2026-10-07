# Lazy layout kernel decision

**Adopt the small revision-owned lazy layout implementation**, subject to the independent compiled replay/source review and final integration gates. The complete kernel ABBA plus compiled pixel/scale/radar equality supports removing the unused projection from mount. This is a deliberate **deferral**: the first switch still pays the full other-layout cost. Do not describe it as a reduction in total two-layout work or uniform whole-browser latency.

The corrected complete run has 24 fresh timing processes and 8 separate collected-heap processes, with baseline/trial/trial/baseline order repeated three times per physical-first and schematic-first order. Exact source/build manifests are verified before/after children and exact point-array, physical-metadata and changed-source semantic hashes all agree. Shared lock: `/tmp/kairo-performance.lock`. The failed first attempt remains under `kernel/`; no result was overwritten or promoted.

| Physical-first, ms (six-run median; range) | Eager baseline | Lazy trial |
|---|---:|---:|
| Source owner + initial physical | 14.610 (11.856–19.123) | 6.878 (5.955–7.997) |
| First schematic switch | 0.002 (0.001–0.002) | 7.861 (6.862–11.922) |
| Cumulative first + switch | 14.612 (11.859–19.124) | 14.618 (13.526–18.712) |
| Changed-source physical mount | 7.968 (7.213–9.296) | 3.689 (2.951–4.686) |

| Schematic-first, ms (six-run median; range) | Eager baseline | Lazy trial |
|---|---:|---:|
| Source owner + initial schematic | 13.789 (11.802–16.890) | 10.080 (9.589–12.067) |
| First physical switch | 0.002 (0.001–0.002) | 2.215 (1.999–3.311) |
| Cumulative first + switch | 13.791 (11.804–16.892) | 12.354 (11.603–14.341) |
| Changed-source schematic mount | 7.427 (6.670–7.911) | 6.650 (6.383–7.661) |

Separate Node collected-heap increases are 0.960 MiB on eager first mount versus 0.484–0.491 MiB lazy; once both layouts exist, both arms retain 0.962–0.974 MiB. The separate compiled Chrome first-layout saving is smaller, about 0.30–0.35 MiB, and disappears after both layouts are used. Neither is ordinary process RSS.

The new owner keeps at most physical and schematic arrays for the **current `atlas.systems` identity**. An Atlas replacement creates a fresh owner; there is no global cache, cache growth by revision, geometry-worker cache, changed drawing order or altered layout function. Physical extents and the first valid known system are scanned without creating physical layout points, preserving distance scales and radar fallback. Replay/discovery continues to choose the same physical/schematic/radar paths. Returning to an already used projection returns its stable array without recomputation.

Validation: 26 targeted layout/math/operations tests, passing TypeScript and production build; 48 exact settled compiled Canvas pixel/scale snapshots and unchanged radar labels. Browser timings are mixed and retained in `BROWSER-RESULTS.md`, including higher schematic-mount and warm-switch medians. The existing full-scene draw/geometry costs remain and are the reason this report limits its speed claim to initial layout derivation.

Independent source review subsequently found no objections: known finite-coordinate filtering/order, empty extent scale, revision ownership and radar fallback match the original paths. The Session lane's `compiled-20261007/atlas-lazy-correctness-attempt2.json` passed the 1,000-system/10,000-event schematic replay, backward/end/natural completion, pilot fencing and unmount/remount checks. `replay-verification.json` mechanically binds all seven requested compiled asset hashes to this trial's frozen build fingerprint and pins the raw replay result SHA. Live SDE replacement is not simulated by that browser lane; exact replacement behavior is from the kernel/unit lane. The isolated M7 adoption gates are satisfied; final integrated-source acceptance remains required.
