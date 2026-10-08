# Names protocol compiled diagnostic gate

8 October2026. Both isolated exact227 + accepted hidden-filter roots passed fresh typecheck and production build (`browser-build-attempt1`). Source files remained unchanged and compiled assets were captured/verified before and after the browser workers. The later Assets boundary is intentionally absent here. This gate supports ordinary browser comparison; it is not protocol adoption or Clean RC17 closure. PR #10 stays withdrawn.

## Preserved attempts and reviewed harness

`browser-diagnostic-attempt1` failed before launching a browser because the Chrome environment was not set. The failure/receipt and successful fixture cleanup remain. `browser-diagnostic-attempt2` used the coordinator's established Chromium138.0.7204.0 executable and runtime libraries. Its observed browser versions and launch environment are recorded; the supplied binary pin is explicitly attributed to the coordinator.

Revision6 of the four local workers was independently reviewed. The review fixes private-session preservation across managed restart, proves a real native reconnect/new-epoch bootstrap, fences measured completion on received Wallet callbacks plus two frames, and records independent cleanup before final completion. Shared Chrome/source-manifest helpers are pinned too. See `BROWSER-INDEPENDENT-REVIEW.md`; the completed backend41-file bank remains immutable and separate.

## Actual compiled results

All four diagnostic workers completed: actual-Core baseline9 checks, actual-Core candidate10 checks, and both compiled race workers10 checks each. Every check passed, all source/build/harness guards passed, both ordinary-fixture provider/clock ledgers matched, unexpected external requests were empty, and cleanup failures were empty. These are diagnostic observations, not timing results.

The populated fixture contains10,000 Assets rows for each of two pilots and20,000 sparse names totaling550,001 JSON bytes. During the actual Core twenty-Wallet-publication sequence, each arm received exactly20 snapshots, with receiver counters0→20 and two animation frames drained. No other dataset publication occurred. The baseline's twenty snapshot JSON bodies total11,006,191 bytes; the candidate's total7,131 bytes, with no repeated directory event after bootstrap. These counts exclude SSE framing and HTTP/TCP overhead. Each complete protocol worker made the same26 synthetic ESI Wallet calls with identical controlled server clock/value ledgers.

The candidate's first connection still adds a full-map names event alongside HTTP state. Its initial cost remains a separate ordinary measurement; the20-event body reduction does not make startup free. Changed names were published globally before their associated selected-pilot snapshot, while unrelated pilot data remained filtered. The candidate observes a name change arising from pilot42 while pilot43 is selected, before pilot43's own subsequent snapshot. That is a semantics check outside the timed phase.

Compiled race gates passed delayed initial legacy HTTP across clean first open, initial error followed by state recovery, delayed state versus a newer actual Core publication, batched name updates, explicit legacy partial merge and authoritative same-revision recovery, pilot-scope replacement, zero-client changes followed by a new document, and physical app restart with fresh HTTP directory reset while SSE callbacks were withheld. Restart preserved one synthetic private session using production exportSessions/initialSessions. Both arms recorded two actual native opens for the physical restart case; the candidate waited for the exact queued new-process revision before releasing the withheld open/name callbacks.

The legacy and outage cases deliberately control fetch/EventSource callback delivery and are labelled diagnostic fixtures. Document remount verifies connection ownership/current scope; it does not claim React StrictMode effect-replay coverage. No ordinary browser CPU/task/script result is present yet.

## Next gate and retained risks

Run the same compiled actual-Core worker in fresh-process browser ABBA with `--timing`, separately granted under the shared lock. Ordinary mode does not enable CDP Network event mirroring, retain packet bodies, wrap map/formatters or collect profiles. Its scalar receipt counters and two-frame drain remain matched completion controls. Keep initial bootstrap/Assets first-use, unchanged twenty-event task/script, relevant-name and unrelated-name rows separately; retain all adverse observations.

The backend's extra connection bootstrap (~5ms at20k/one client) and zero-client batchEight adverse row (+5.084ms mean, pairs+8.40%/+19.18%) remain unresolved tradeoffs/observations. Final combined acceptance must pin that zero-client row and the earlier hidden-filter adverse rows, include the accepted Assets boundary, and complete the remaining RC17 findings before user review.
