# F9 first-source-use disposition

**Root accepts the bounded safety and steady-write tradeoff.** Retain the existing renderer with its repeated material first-use task cost, unchanged output and necessary render-before-fallible-storage/recovery behavior. No application patch or additional profile lane is warranted by the identified work. This is the component disposition; it does not claim a renderer speedup, prove a unique cause for the cost or close final combined RC17 acceptance. The original ABBA bank and reviewer addendum remain immutable.

## Recorded adverse cost and measurement boundary

The preserved a7 ordinary comparison shows source first-use renderer task medians 18.1065 → 23.695 ms, **+5.5885 ms**. Both nearest pairs exceed the shared greater-than-10% and greater-than-1-ms rule: +7.264 ms/+38.18% and +3.913 ms/+22.77%. These are retained measured costs, not noise.

The functional-readiness windows are 63.165 → 65.477 ms (+3.66%) and 60.522 → 64.525 ms (+6.61%), medians 61.843 → 65.001 ms. The helper checks DOM readiness in 50 ms polling steps; these windows are not exact first paint or user-input latency. A source target opens after the declared Studio/Markets/OBS workload in the same fresh browser process. It is a new target and an unused source origin, not a standalone cold application/browser startup test. Browser renderer-process reuse was not captured, so it must not be assumed either way.

| Counter, first source use | Baseline arm 1 / arm 4 | Candidate arm 2 / arm 3 |
| --- | --- | --- |
| Script ms | 2.874 / 2.627 | 2.925 / 2.392 |
| Layout ms | 4.632 / 4.675 | 8.234 / 5.257 |
| Style recalculation ms | 1.978 / 1.935 | 2.909 / 2.816 |
| Layout count delta | 3 / 3 | 3 / 3 |
| Style recalculation count delta | 4 / 4 | 5 / 6 |
| DOM node counter delta | 303 / 303 | 303 / 303 |
| Event-listener counter delta | 4 / 4 | 4 / 4 |
| Uncollected JS heap endpoint delta, bytes | 585,292 / 585,292 | 593,008 / 593,008 |

Script median is 0.092 ms lower. Layout/style and other renderer tasks account for the aggregate increase; the counters do not identify a causal statement or attribute time uniquely to serialization, text checks, storage order, animation or browser scheduling. Style/layout durations are subsets of task work and must not be added to task as independent costs. Heap endpoints are not retained-memory measurements.

## Exact 32-element initialization ownership

The harness creates a fresh Chromium profile for each ordinary arm and visits only dashboard origin routes until the source phase. Studio remains in its default canvas edit mode; no live iframe or source page was opened. Dashboard/source origins differ by port, so dashboard local storage does not seed source recovery. The source phase closes the dashboard target, creates a new target, enables the same CDP domains/viewport, then navigates to `/stream`. No fixture mutation occurs within its initial readiness action.

`server/index.mjs` serves the same small HTML shell, `render.css` and shared `widgets.css`, with the same listener/CSP. The shell loads one deferred `render.js`; it does not load React or compiled dashboard scripts. The renderer reads local recovery storage once and creates one EventSource at `/events`. `createStream.connect` writes one initial sanitized state. There is no renderer fetch of `/state`, new backend data collector or second EventSource. Normal later state broadcasts still belong to the existing Stream owner; this worker did not instrument the exact number of source SSE packets, so the source trace identifies the initial connect path, not a measured packet-count claim.

The saved fixture has 32 visible frame-style widgets: 4 clocks, 4 wallet text bindings and 24 static text widgets. The initial source sees wallet 2,009 ISK. Both renderers create one widget with the same section/label/content/detail/bar/fill structure per element, apply the same dimensions/appearance and enter animation, preserve the same ordering, and call the same scale function. All detail text is empty for this fixture. The ordinary output checks retain all 32 elements, exact saved 40px/155px geometry and final bound/static text.

Candidate-only initial preparation is bounded:

- Allocate/clear the time-widget Map and insert the four eligible clocks. Future 250 ms ticks visit those four entries rather than all 32 widgets. The map is rebuilt from the current rendered set, not accumulated across states.
- Compare normalized label/content/detail strings with the existing node's text before assigning. The first state still assigns 32 nonempty labels and 32 nonempty contents; 32 empty detail assignments can be avoided. Later unchanged text is not rewritten. Reading `textContent` is a DOM-text operation, not an `innerText` layout query.
- Build one normalized recovery projection: one 32-entry array, unchanged references for 28 unbound widgets, and four bound-widget copies that strip volatile text/detail/value/times and replace them with disconnected placeholders. Serialize it, compare with the single retained previous serialization and write local storage only if structural/static recovery changes.
- On this unused origin the retained key is initially empty, so the first state performs one storage write in either implementation. This equal first-write count follows from the source/fixture path; this ordinary lane does not inject a storage-write counter. The candidate pays the recovery projection/check on first use to avoid later writes from volatile wallet/timestamp/protection packets and to store a safe recovery view.

No duplicate widget tree, source connection, backend read, new layout measurement loop, unbounded cache or unnecessary second initial persistence pass was found. The extra Map, text checks and recovery representation have identifiable roles. The recorded 5.6 ms task difference cannot be assigned to their individual costs using these counters.

## Why retaining the mechanisms is justified

The historical baseline handles a state inside one `try`: parse, mark connected, write the full state to local storage, then render. A quota/privacy failure throws before render. Consequently a fresh state engaging protection or changing cover geometry can fail to update the page. The candidate parses and renders first, then persists through a separately caught boundary. This is an established correctness requirement, not optional work that should be reverted for a first-use number. Rendering here means updating the DOM; synchronous storage later in the same task can still delay actual paint, so no unmeasured paint-time guarantee is claimed.

The candidate stores explicit safe recovery structure instead of a full volatile live packet. Bound values restore as disconnected; server time, packet version and protection changes do not force storage writes. Changed text and the current eligible-clock set avoid repeated writes/work after initialization. The actual-renderer tests and earlier ten-check compiled diagnostic cover same-second writes, bound changes, ordering, protection under denied storage, reconnect and offline recovery. Their exact source boundaries remain in the evidence; they are not replaced by the ordinary timing result.

The fixture contains no OPSEC cover and does not inject storage denial. Its identical display output cannot by itself validate those safety paths; the dedicated correctness evidence does. After denied storage, the live page uses current cover geometry, while a full offline reload can restore only the last successfully persisted geometry. That limitation remains explicit.

There is no attributable waste justifying a new source edit. Skipping initialization checks on newly created nodes, changing persistence scheduling or replacing the clock collection would be an additional optimization hypothesis; none is shown to cause the repeated cost. In particular, reverting render-before-storage or persisting live bound values would weaken known behavior. The accepted tradeoff is the measured small initial task increase for bounded initialization plus safe/less repetitive steady-state behavior, with no total OBS/GPU/whole-browser CPU benefit claimed.

## Guard and closure scope

`SOURCE-RECEIPT.json` binds all four raw source-first-use observations and the audited code/harness. The candidate and baseline share identical source HTML/CSS, server route, Stream/projection owner and renderer tests; only `public/stream/render.js` differs among these inspected paths. Current accepted application bytes for every inspected path also match the a7 candidate at the recorded read-time HEAD. Other files in the overall four-mechanism baseline differ as already documented, so unique causal isolation is not asserted.

Root's disposition resolves this F9 first-use regression question without a speculative patch or optional rerun. Keep the repeated adverse row in the final ledger and verify the accepted renderer on the final combined source/build alongside startup/state/idle/retention, package/CI and actual user OBS/EVE/Windows gates. PR #10 remains withdrawn until those broader requirements are satisfied.
