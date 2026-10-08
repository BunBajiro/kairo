# Independent compiled names gate review

8 October 2026, `review_m9_summary_trial/review_write_inputs`. Static review only: no build, browser, test or measured worker was executed by this reviewer. The four files reviewed are `browser-fixture.mjs`, `browser-protocol.mjs`, `browser-races.mjs`, and `run-browser.mjs`, plus the directly relevant production/session and shared helper paths. This is preparation evidence, not a names protocol adoption, performance result, or Clean RC17 handoff. PR #10 remains withdrawn.

## Findings preserved

1. **Restart fixture lost private HTTP authentication.** The initial `restart()` closed the app and started a new one without its in-memory session entries. Production `server/index.mjs:67` creates a fresh session map; the existing browser cookie would receive HTTP 401 at `:496–498`, so the fresh `/state` request could not reach the intended names reset check. The correction carries `app.exportSessions()` into the supported `initialSessions` startup option and records the count/contract without exporting the secret session entries in evidence. Static inspection confirms this addresses the intended managed-restart fixture.

2. **The reconnect assertion could pass before native reconnection.** The initial callback adapter's `resume()` unconditionally emitted `open`, and the physical-restart case checked labels after 180 ms without waiting for the new native EventSource connection. It could therefore pass while the browser's retry was still pending. The correction records withheld real native opens; restart now waits for the real server client and pending native open, and candidate additionally waits for a queued names bootstrap carrying the exact new process revision. Only that withheld open is released. The initial synthetic error remains explicitly labelled and withholds an actual first open. Static inspection confirms the revised branch exercises native reconnect before claiming the outcome.

3. **Measured windows did not prove receiver completion.** `core.sync` proves server-side persistence/publication, not that a browser has decoded and applied its SSE queue. A fixed 100 ms tail after twenty publications could end with a slow arm's work still pending, while initial `online + 250 ms` did not establish complete initial state/bootstrap. The correction adds identical scalar receipt counters on the existing `kairo:source-changed` Wallet event, counts candidate names-event delivery without copying or parsing bodies, waits for all twenty callbacks, and waits two animation frames before the measured burst ends. Initial startup additionally waits for the compiled state-ready content and candidate's bootstrap event. These small completion probes are included in both arms and are disclosed; ordinary mode still avoids large DevTools packet mirroring. The same issue was then corrected for measured relevant/unrelated single-name publications and the filter-state row: revision 6 uses a shared helper that waits for the one Wallet callback and two animation frames. This prevents a candidate's preceding names packet from ending the phase before its following Wallet snapshot has been applied.

4. **Cleanup and completion were ordered incorrectly.** The initial workers wrote `complete:true` before cleanup; a browser-close failure could skip fixture close, and fixture-close failure could skip restoration of `Date.now`. Corrected workers independently attempt both cleanups, mark the result incomplete/nonzero on any failure, and only then write their final artifact. Fixture close restores the clock in `finally`. The coordinator also requires a successful child exit, so a cleanup failure cannot be accepted as a successful arm.

5. **Two imported harness owners were outside the original guard.** The initial runner pinned only its four local files. `chrome.mjs` owns the driver/waits/metrics and `source-manifest.mjs` owns source verification, so either could change between arms without the local guard detecting it. Both shared files are now included in the runner's before/end harness hash set.

## Verified static scope and limits

The fixture uses real `startKairo`, `Core.sync`, `/state`, `/events`, and compiled Dashboard code. Only controlled local ESI Wallet responses and synthetic auth are allowed. All enabled non-Wallet snapshots are seeded with future freshness and their revisions are checked after each sync. The sparse two-pilot directory's representation is pinned to 550,001 bytes; complete fixture hashes and exact Wallet provider/clock ledgers are compared across the matched arms. Random Store epoch prefixes alone are omitted from the revision ledger, while pilot/key/counter remain.

The browser clock, renderer work and 40 ms update gaps remain real. Only the server's domain `Date.now` advances polling deadlines; this is not an accelerated full production scheduler. Ordinary mode does not enable DevTools Network packet mirroring. Diagnostic mode records actual Core-emitted frames and separately labels legacy manual snapshot injection and HTTP/EventSource callback gates. The physical restart and browser remount are actual app/document lifecycles; remount does not establish React StrictMode effect replay.

Build mode checks the reviewed proposal's exact tracked/untracked file inventory before and after the build and records compiled client hashes. Diagnostic/ABBA mode requires a completed build receipt, verifies those source/build manifests and rechecks them at the end. The root must still grant the exclusive performance slot. The proposal intentionally predates the accepted Assets context boundary; even successful isolated measurements require combined-current-source acceptance.

The required compiled semantic traces cover delayed initial legacy state, initial error/open recovery, newer real SSE versus held HTTP, batched names, legacy partial fallback and same-authority recovery, pilot scope replacement, zero clients/remount, fresh HTTP reset while callbacks are held down, and native reconnect/new-epoch bootstrap. Actual pass/fail and ordinary cost remain unknown until execution.

## Final review binding

Revision 6 in `BROWSER-WORKERS-REVIEW.json` was statically re-reviewed, including the shared single-publication completion helper. All five reported gaps are addressed in the reviewed code; no further concrete blocker was found. The root still owns runtime scheduling. This is not an executed semantic or performance pass.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `browser-fixture.mjs` | 7212 | `c60f95589832dac8b7e298a9e83e7b72b4e02cf5d10a5dd09e2fd902139377a1` |
| `browser-protocol.mjs` | 12028 | `f70af4f4cebf2e2fe0ef61f39d6381e7dabccfe4592b9ec2d652995e9ebbab89` |
| `browser-races.mjs` | 13158 | `5ecb18340784a2b6e2d4fdd9dd240f179fa514008dd0b0db7553d8eadf20f368` |
| `run-browser.mjs` | 5607 | `e8cc745313fd0fa3d9c1b4c67b1e6f7e5c0f1ab2210f50ff4c9df6573c90f573` |
