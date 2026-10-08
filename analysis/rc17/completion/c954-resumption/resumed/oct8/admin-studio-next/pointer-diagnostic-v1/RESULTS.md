# First-drag attribution result

All four diagnostic arms completed on the preserved a7 source/builds. Full source and compiled-asset fingerprints, diagnostic files, pinned Chromium bytes/version and final guards matched. Every arm observed actual Chromium process exit, application close and temporary-data removal. The shared runtime lock was released after the runner exited 0.

| Fresh arm | Move command | Initial draft | Final draft | Expected | Capture lost |
| --- | --- | --- | --- | --- | --- |
| Baseline | `buttons: 1`, `button` omitted | 40, 155 | 124, 184 | 124, 184 | At first move, before pointer-up |
| Candidate | `buttons: 1`, `button` omitted | 40, 155 | 40, 155 | 124, 184 | At first move, before pointer-up |
| Candidate | `buttons: 1`, `button: 'left'` | 40, 155 | 124, 184 | 124, 184 | After pointer-up |
| Baseline | `buttons: 1`, `button: 'left'` | 40, 155 | 124, 184 | 124, 184 | After pointer-up |

All arms started at stage dimensions 929 × 522.5625 CSS px. The trusted press was at the widget center (638.859375, 611.796875); hit testing identified the widget-value span contained by the target widget and stage. Pointer-down selected the widget and acquired capture. The same DOM widget survived all commands, stage dimensions stayed stable, scroll stayed at zero and the saved layout remained 40, 155. There is no geometry-scale or wrong-hit explanation for the difference.

Both omitted-button arms emitted `gotpointercapture`, then `lostpointercapture` at the first move (639.859375, 612.1301879882812), before the remaining moves and release. The loss event remained trusted, pointer ID 1, `button: -1`, `buttons: 1`. The candidate handles lost capture by flushing any pending point and clearing the active drag. No point had yet been accepted, so its draft remained unchanged. The baseline lacks this lost-capture handler and continues processing moves over the stage.

In the explicit-left control, capture stayed owned until pointer-up at (678.859375, 625.1301879882812). Candidate pointer-up committed the independently calculated grid/clamp result 124, 184 before the subsequent lost-capture event. The baseline matched. This is the command form also used by the prior passing compiled drag gate.

The evidence supports a new versioned ordinary lane with explicit-left move commands and strict cleanup receipts. It does not support removing the candidate's lost-capture handler or changing app source. Attempt 1 remains a failed ordinary arm; its timings are not pooled into a repaired ABBA comparison. No assertion is relaxed: all three exact draft endpoints and unchanged saved output remain required in the next ordinary lane.

These external observers change scheduling and are not cost measurements. They reproduce the failure and isolate the event/capture difference under pinned Chromium, but do not establish every real hardware/OBS interaction. F5/F8/F9 remain open pending the new matched ordinary lane and native 30-second recovery controls, followed by the final combined gate.
