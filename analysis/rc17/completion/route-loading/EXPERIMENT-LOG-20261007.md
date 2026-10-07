# Route delivery experiment log — 7 October 2026

This is internal evidence, not a clean RC17 readiness claim. Active RC17 application source has not changed.

- Matched production builds for isolated a27 baseline and two-file lazy-boundary candidate both passed. Candidate TypeScript check passed. Logs: `build-20261007/`.
- `raw-20261007-1/` failed during baseline Atlas settling: Chromium reported the dedicated worker script request in its parent network session but did not send that session a loading-finished event. Its three earlier samples are retained, not accepted as the planned experiment.
- `raw-20261007-2/` repeated that failure: browser-level target discovery did not expose the dedicated worker in this environment. No candidate timing was accepted.
- Third attempt uses page-level CDP worker auto-attachment without pausing the worker and observes its detachment after the app terminates it. All route reads and active worker lifetimes must finish before the next sample. This is harness-only instrumentation; source is unchanged. ABBA attempt completed under `/tmp/kairo-performance.lock` with all four fresh-process runs and 28 compiled checks passing.
- `integration-c954.patch` ports only the same two-file boundary change onto c954, preserving newer scoped refresh/context code. `git apply --check` passes against the current c954 tree. This prepared patch is not yet an adoption decision and has not been applied.

Both failed raw attempts retain full source/build inventories, bundle inventory and partial observations. Build inventory shows initial static JavaScript closure changes from 1,657,020 to 985,812 bytes (gzip potential 477,502 to 302,070). All emitted JavaScript increases by 11,484 raw bytes and 21,890 gzip bytes. These static counts alone do not establish navigation correctness or user-perceived performance.

Final decision: reject the current lazy/Suspense trial because first deferred navigation regresses and cold Overview has no demonstrated speed/CPU benefit. See `RESULTS-20261007.md`; the prepared c954 patch is explicitly not for integration.
