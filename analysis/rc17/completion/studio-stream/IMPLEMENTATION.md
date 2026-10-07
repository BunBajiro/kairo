# Studio and browser-source completion work (F8 / F9)

Status: source mechanisms, ten targeted correctness checks and **10 / 10 compiled browser acceptance checks pass**. Matched populated-layout profiling remains pending. This record does not close F8/F9 or authorize clean RC17 review.

## F8: Studio work and source ownership

`components/kairo/studio.tsx` now keys the preview endpoint from binding identity (`id`, `kind`, binding, pilot, source and display), independently of geometry, wording, style, paused/muted state or toast rules. The minimal request goes through the existing server sanitizer and binding projection endpoint. Geometry-only drafts never restart the projection POST. Unsupported OPSEC/clock/divider bindings are excluded consistently with the sanitizer.

`components/kairo/studio-work.mjs` owns one debounced projection transport, remembers the newest input, rejects superseded results immediately and drops publication after unmount. Repeated invalidations cannot overlap transports. The explicit source refresh uses this owner too. Results are tagged with their projection key so a newly selected binding cannot display an old binding's projection while loading.

Studio consumes Dashboard's `kairo:source-changed` event before selected-pilot filtering. Snapshot keys and pilot IDs are filtered against the actual bindings; Goal sources include all relevant snapshot changes, manual Goal events refresh Goal bindings, Session events/activity refresh their appropriate bindings, and reconnect/global recovery invalidates all bound content. Current-pilot fallback revisions include source status/freshness and Session fields, not array identity. This preserves nonselected bound pilots.

Clock state moved from Studio into memoized visible `StudioText` leaves. Clock/countdown/Session text updates without a periodic render of the editor. Pointer movement stores one latest position for each animation frame; pointer-up flushes its final coordinates immediately, and cancellation/lost capture flushes the latest accepted point. Positions preserve grid/clamp semantics. Keyboard and persisted Save paths remain unchanged. Unmount cancels queued work.

## F9: browser source rendering and safe recovery

`public/stream/render.js` compares displayed text before assigning it, including updates to an already active toast. Its ordinary 250 ms tick visits only rendered time widgets with an eligible binding. The cadence remains unchanged; a second-resolution value is written only when it changes.

Recovery persistence now retains structural/visual layout, static wording, pause/mute/position and current cover geometry. Volatile bound text/value/times and packet version/server time/protection transitions do not rewrite storage. Bound recovery values are explicitly disconnected. Startup still forces UNKNOWN/hidden protection and toasts are not recovered.

An additional concrete safety defect was found: the old state handler wrote localStorage before calling render, inside one try/catch. Quota/privacy errors could prevent a fresh protection state from rendering. Rendering now happens first and persistence has a separate guarded failure boundary. Protection state and latest in-memory cover geometry update synchronously even if storage is unavailable. A later reload can recover only the last *successfully persisted* geometry; the browser cannot persist through denied storage.

## Verification and executable browser lane

Passed:

- `node --test tests/kairo/studio-work.test.mjs tests/kairo/stream-render-writes.test.mjs`: **10/10**.
- Studio TSX syntax transpilation with the repository TypeScript compiler.
- `node --check analysis/rc17/completion/studio-stream/browser-acceptance.mjs`.

Tests cover actual sanitizer/projection equivalence; stale response, failure/retry and unmount publication; one-frame/final pointer commit and clamp/grid; bound-pilot/Goal/Session source invalidation. Renderer tests execute the actual `render.js` in an instrumented small DOM: same-second writes, paused/filtered widgets, volatile persistence, latest cover recovery, storage-denial safety, node order, toast bounds and disconnect.

`browser-acceptance.mjs` is a separate diagnostic acceptance lane. It starts the real local server with controlled persisted data, loads compiled `/#studio` and `/stream`, and exercises actual UI drags/keyboard, held real preview responses, bound-pilot switching, real nonselected manual Goal mutations, time text, Save and live iframe. On the real renderer it counts actual DOM/storage writes, changes cover geometry and protection over SSE, denies storage, disconnects/reconnects the real stream, and reloads offline. The deterministic renderer clock and counting hooks are diagnostics, **not performance measurements**. Source and compiled asset hashes are captured before the run and verified afterwards. Screenshots and `result.json` are saved even on a failure.

Run after a fresh current-source build, with no other source edits during the lane:

```bash
KAIRO_BENCH_REPO=/workspace/scratch/a2f3334402fc/kairo-rc17-completion \
KAIRO_CHROME_PATH=/path/to/chrome \
KAIRO_BUILD_RECEIPT=/absolute/frozen-build-receipt.json \
KAIRO_BROWSER_OUTPUT=analysis/rc17/completion/studio-stream/browser-result \
node analysis/rc17/completion/studio-stream/browser-acceptance.mjs
```

Compiled acceptance is complete as recorded below. Remaining closure evidence: run matched realistic populated-layout drag/idle windows without diagnostic instrumentation; retain first-use/active/idle output costs and failures. The harness checks real rendered recovery and request/write counts, not total OBS CPU. Native audio playback/disposal and screen-reader/real-OBS behavior remain outside this standalone browser lane; the renderer's audio lifecycle code was not changed.

Browser runs require the coordinator's build receipt containing `sourceFingerprint` (the captured source+compiled manifest fingerprint), `buildCommand`, `completedAt`, `exitCode: 0`, and `logSha256`; optional `buildLog` is verified against that hash. This explicitly binds the successful frozen build record to the captured source/assets, beyond merely finding nonempty `dist`. Harness and helper hashes are also verified after the run.


## Recovered compiled acceptance — 7 October 2026

[Browser run 4](browser-run4/result.json) completed all ten checks against clean source `c954c0d808847f249df0659ed15fdce2e89f84c4`, source/build fingerprint `472afe35fc135243350cad554205ac5845e5bd9404e81838a52aca8d09b63b27`. It verifies its frozen build receipt and harness/helper hashes, has no runtime exceptions or external calls, and completed cleanup. Real Chromium DOM acceptance covers geometry-only POST suppression, one-flight stale-preview fencing, nonselected-pilot Goal invalidation, clock/countdown/Session progress, persisted Save/live output, changed-text/recovery writes, quota-denial protection, real SSE disconnect/reconnect, and offline last-successful-geometry recovery.

Earlier failed attempts remain retained. Run 1 assumed an uncontrolled protection state/count; run 3 overlooked shared-origin live iframe persistence in its storage-denial fixture; run 4 drives real Core protection and closes the live iframe before storage-denial fault injection. These are diagnostic harness corrections, not source modifications or discarded performance samples. Compiled acceptance does not measure total OBS CPU.
