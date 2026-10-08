# Retained failed second attempt

The first report-open wait timed out after CDP Enter activation at the 30-card prefix. All six preceding checks pass: exact ordered prefix, three full-prefix refreshes, visible/focused oldest text, and the absence of an application search field. All three text-reachability samples identify the exact renamed oldest label and a focused visible button. The selection result array is still empty. The failure DOM contains the archive and no report dialog, summary or loading state.

The timed-out call is the asynchronous Runtime.evaluate waiting for `.session-report-dialog .session-summary` after Enter keyDown/keyUp. The in-page wait and the outer CDP command both used 30-second limits, so the outer timeout obscures the inner condition diagnostic. This is not evidence of expensive 1,500-card rendering: execution has not reached the 300/1,500-card stages. Cleanup completed and no benchmark process remains.

The sent keyDown omitted text/character data. A minimal independent native-button event probe is prepared to compare that exact sequence, a keyDown carrying Enter text, and an explicit character event. That is a hypothesis pending the saved control; no application change or increased timeout is justified from this incomplete run. Future attempts will label each phase and use a shorter inner condition timeout to preserve the actual failed condition.

Original worker and runner bytes are retained beside the raw run. Attempt2 is incomplete and is not performance acceptance or pooled with subsequent runs.

## Minimal control completed

`../keyboard-probe.json` verifies the specific input defect. With a plain focused button, the original Enter keyDown/keyUp produces trusted keydown and keyup, but no keypress or click (zero activations). Adding `text: '\r'` and `unmodifiedText: '\r'` to keyDown produces trusted keydown, keypress, click and keyup, with exactly one activation. An explicit rawKeyDown/char/keyUp sequence also produces one activation. The next worker uses the verified Enter-text sequence. No application source was changed.

The corrected worker also labels its current phase, captures keyboard and report-read evidence on failure, and shortens its inner condition deadline to 15 seconds so it reports before the unchanged 30-second CDP deadline. Neither timeout is extended.
