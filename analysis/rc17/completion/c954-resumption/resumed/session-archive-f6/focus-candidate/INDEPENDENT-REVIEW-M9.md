# Independent F6 focus-restoration review

Read-only review by `review_m9_summary_trial`, 8 October 2026. No application execution, build, browser run or source edit was performed. Reviewed the two proposed source copies/patch at base `a7b1bf97b0073695926c443e52d523638e59e48d` and `focus-browser.mjs`; this is static review, not validation evidence.

## Source conclusion

No concrete source blocker found in the proposed focus fix. `openReport` captures the initiating native button and pilot; the following parent render captures that owner for the callback. Normal Dialog dismissal sets the explicit restoration flag. The callback consumes only the same owner and verifies mount state, current pilot, connected element and enabled state before focusing. Old close callbacks cannot consume a newer report's owner. Pilot changes and unmount clear ownership. Show on Map calls the ordinary close/navigation path without the explicit-dismiss flag, so the close autofocus hook suppresses default restoration and does not focus the departed opener.

Capturing the End session button through its async response is reasonable, and the mounted/current-pilot guards prevent reopening after teardown or pilot replacement. The element may remain the same button when End becomes Start; restoring that connected enabled element is intentional. If it is still disabled while the pending refresh runs, the guard deliberately does not focus it. The current browser fixture waits until it is enabled before its End-session close check, so it does not establish a focus fallback for an early close during that busy interval.

Existing archive publication preserves keyed opener elements; the fixture checks the selected report and all 270 ordered events while another row's label is published. Archive Escape/Close, Live report Escape, End-session Escape, Show on Map, route teardown and pilot replacement are covered. Teardown cases remove the old opener, so they do not independently exercise a still-connected button repurposed for another pilot; the source's current-pilot guard covers that case by inspection.

## Harness adjustments before claiming the full gate

1. The finalizer currently wraps browser close, application close and directory removal in one try. If browser close throws, the live servers and temporary directory are never attempted. Attempt each cleanup independently, preserve every error and mark cleanup/complete false if any fails. This matters for reliably releasing the shared runtime lane after a failed browser run.
2. The durable-data digest omits **all** session labels. The assertion text says unchanged except the deliberate label, but unintended edits to any other label would pass. Include labels with normalization only for `focus-000`, or assert the exact original label for every other seeded session and the exact deliberate replacement for `focus-000`.
3. The trusted-click assertion searches the whole historic click array. On the second opening of the same archive button, an old trusted entry could satisfy the assertion. Capture the click-array length immediately before each key activation and inspect only new entries for that opening. The separate dialog-open wait is useful but does not establish that the particular activation was trusted.

These are small harness corrections; none requires widening the source fix. Preserve prior failed baseline observations and use a newly frozen compiled source/manifest for the candidate. After the corrections, this review supports proceeding to the focused runtime gate; it does not establish successful focus restoration, clean RC17 readiness or native Find acceptance.

## Corrected harness re-review

The three requested harness changes are now present: trusted clicks are scoped to the current activation, exact labels are asserted for every seeded archive row with only the declared replacement, and browser/application/temporary-fixture cleanup are each attempted independently. Reviewed harness SHA-256: `029200140b26b2150d4f22638788e07c228fe3ecc24d0944802f689a977435cc`. Naming-dialog Escape/Close observations are recorded as adjacent findings with separate acceptance, rather than folded into report-focus success. No further actionable static blocker found. This supports the focused compiled runtime gate only; no runtime was performed by this reviewer.

## Adjacent archive-card memo review

Read the separate memo proposal at patch SHA-256 `0a6531c4cf5b894d4eac8596998cae99897f22c4d6b6436f65ca15024f4fe772`. No concrete semantic blocker found. The primitive props cover every field rendered by the card; the parent still calculates active minutes on every render, so a minute change invalidates the shallow comparison. Label and active-state changes also rerender normally. The stable opener callback changes with pilot identity and keeps the same native button capture and keyed DOM behavior required by the focus fix. No new clock or update cadence is implied. The proposed browser clock/publication control is useful direct coverage. This is static acceptance for evaluation only; no build, browser run or performance validation was performed by this reviewer.

## Combined report and naming focus re-review

Verified combined patch `32c908a8687c0fbd57ac179d1d32f75d59d5b61ca48064ed2af0baa8d112560c` and both source-copy hashes against the refreshed manifest. The naming dialog now captures an independent opener owner, so report callbacks cannot consume naming ownership. Its close-autofocus handler prevents the triggerless default and attempts restoration only for the render-captured owner that still matches the current ref, mounted page, pilot, connected button and enabled state. Pilot changes and teardown clear both ownership refs. The report logic remains unchanged from the earlier reviewed fix. No concrete blocker found for the combined compiled correctness gate.

The reported baseline reproduction covers naming Escape and Close with a connected Start button. Successful form submission closes the dialog while the opener may still be busy/disabled, so this guard intentionally does not promise restoration after submission; that behavior is outside the cancellation defect established by those controls. The mechanically rebased memo patch `719fc58da60cca22399f35f9dd44f91dc03dca69c6cfdb5ccab71b599a8aa464` retains the same primitive props, parent-computed minutes and pilot-dependent stable callback; no new memo logic was found. This was static review only, with no build, browser or M9 runtime.
