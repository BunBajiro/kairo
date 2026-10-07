# Native administrative timer correction

Source checkpoint: `9331b19c309a910f037825e3098a46c260bb2c41`, a direct child of selected c954, on `refactor/rc17-c954-continuation-v0.8.0` (internal draft PR #11). Only `administrative-refresh.mjs` and its test change. Excluded 508 is not an ancestor or source import.

The default scheduler previously copied Window functions into an object and invoked them with that object as receiver. Native Chromium throws `Illegal invocation`; Node timers and earlier permissive virtual clocks masked the defect. Default wrappers now call `globalThis.setTimeout` / `globalThis.clearTimeout` with the correct receiver; injected scheduler objects retain their existing contract.

## Verification

- `receiver-before.log`: new regression fails on c954 for scheduling, rearming and cancellation receivers.
- `targeted-tests.log`: **16/16** administrative/refresh-owner tests pass after the fix.
- `build.log`, `build-receipt.json`, `source.json`: types and fresh production build pass in isolated c954 + only these two files. The build has 20 inventoried assets and fingerprint `217c8f0f2539aaac102e3b5d8cd3d78cfa58cb4a0dd39f22a3ac0394c28f429c`. It is not mislabeled as the older 26-asset build.
- `compiled-counts.json`: **18/18** compiled administrative request/publication checks pass, no browser exceptions or external requests. The diagnostic clock now enforces Window receiver semantics; elapsed performance is not claimed.
- `native-populated.json`: actual native browser timers, complete and source-verified, zero exceptions/external calls. Running Markets issues three reads in six seconds; idle Markets/OBS issue none in their six-second windows. Native Studio drag/source updates and browser-source output also complete. A six-second idle window does not establish the thirty-second recovery deadline; longer-window counts are covered by the separate diagnostic lane.

The isolated source/build was frozen before these runs. Committing its unchanged two-file source delta does not change the measured bytes. Backend updater edits under review were excluded from this source snapshot and commit.

## Disposition

The native receiver correctness defect is corrected and verified. Full F5 ordinary matched loaded/idle performance and the final combined source matrix remain open. These standalone native observations are not an ABBA speedup claim. PR #10 remains withdrawn; draft PR #11 is an internal checkpoint, not clean RC17 review.
