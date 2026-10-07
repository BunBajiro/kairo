# F5 administrative refresh completion — implementation and acceptance

**Native timer defect found after the virtual-clock checks:** the c954 compiled diagnostic passes below do not close F5. Native scheduling invokes detached Window timers with an invalid receiver. The fix and new native verification are recorded below.

7 October 2026. This is completion work on top of `a27d36c`, not approval to create a clean RC17. PR #10 remains withdrawn. The source changes below are now committed in the internal c954 checkpoint; fresh compiled acceptance is recorded below.

## Changed paths and ownership

| Resource | Current mechanism | Recovery and correctness contract |
|---|---|---|
| `components/kairo/markets.tsx` | A mounted `createAdministrativeRefresh` owner replaces the four-second interval. One read in flight and one retained invalidation. Next deadline starts after completion: 2 seconds while running, 30 seconds while idle/terminal. | Visibility suspends automatic reads; focus, visibility return and EventSource open recover. Local scan/cancel/hub/supplies mutations force a read. Old books and selections remain visible during reads/errors. Market books remain shared, rather than keyed by scan pilot. |
| `components/kairo/obs-controls.tsx` | Existing Dashboard `obs` SSE is delivered through `kairo:obs-status`. Initial/reconnect reads use `/obs`; ordinary 30-second/focus recovery uses new readonly `/obs/status`. | Status and edit generations independently reject delayed reads/responses. Dirty port/password/rules survive recovery and edits made during save survive its response. Initial configuration failure retries full configuration. Hidden pages stop fallback reads; stream delivery remains immediate. |
| `components/kairo/goals.tsx` | Separate mounted readers for `/goals`, `/notes` and `/goals/sources`. Context `goalsRevision` owns progress invalidation. Metadata is retained/marked dirty while its dialog is closed and read on open. | Source snapshots never reload private notes. Metadata updates during an open creation dialog; explicit Refresh updates all three. Note mutations update notes, Goal mutations update progress. Typed raw events, reconnect and selected-pilot disposal retain cross-tab and missed-event recovery. Old-pilot read/mutation completions cannot publish into the new pilot. |

New small helpers: `administrative-refresh.mjs` / `.d.mts` and `goal-resource-reads.mjs` / `.d.mts`. Both reuse the existing `scoped-refresh.mjs` owner. No backend ESI, recording, OPSEC, source-renderer or market scanning cadence changes.

The Dashboard/Core contract is implemented by the frontend refresh coordinator: `kairo:events-connected`, `kairo:obs-status`, `kairo:resource-changed`, and `goalsRevision`. Resource metadata accepts `goalSources` and `goal-sources`. Notes and Goal deletion need typed server invalidation; those route changes belong to the coordinator. Goal progress raw events are filtered at this consumer because the context revision already owns them, avoiding two independent triggers.

## Targeted verification completed

`node --test tests/kairo/administrative-refresh.test.mjs tests/kairo/scoped-refresh.test.mjs`: **15 / 15 pass** (10 new administrative/resource cases and five existing owner cases).

These are deterministic scheduler/request and publication tests, not host performance measurements:

| Fixture window | Prior mechanism | New tested count |
|---|---|---|
| Visible idle Markets, 120 seconds including initial read | Initial plus 30 four-second interval callbacks: 31 reads, with overlapping transport possible | 5 reads: initial plus four completed-read 30-second deadlines |
| Already hidden Markets, following 120 seconds | 30 interval callbacks | 0 new reads; one immediate recovery on visibility return |
| Running Markets | Four-second interval regardless job | Two-second completed-read deadline, reverting to 30 seconds after complete/cancelled/failed; delayed transport and 20 invalidations produce one active and one follow-up read |
| OBS, visible 120 seconds including initial read | 41 full config/status reads | 1 full read plus 4 status-only reads; stream changes do not issue HTTP reads |
| Eight independent Goal source invalidations, closed creation dialog after initial load | 8 progress + 8 notes + 8 metadata reads | 8 progress + 0 notes + 0 metadata reads; opening the dialog fetches latest choices |

Additional assertions cover failed-read recovery with retained view; disposal and late publication; newer OBS SSE status winning over an older HTTP response; dirty fields surviving full recovery; save response preserving subsequent edits; failed initial configuration retry; hidden reconnect; unrelated pilot events; and old-pilot pending reads.

The three edited TSX files were syntax-transpiled successfully. The coordinator completed the integrated type check, 941-test suite and production build at c954; this lane adds source-bound compiled acceptance.

## Executable compiled UI acceptance

`browser-acceptance.mjs` runs a production UI against real local HTTP/SSE endpoints in a disposable synthetic store with two pilots. It uses the historical Chrome/CDP helper and captures source/build fingerprints before and after. Run only after the current integrated build is available and the coordinator grants the runtime slot:

```sh
KAIRO_CHROME_PATH=/path/to/chrome node analysis/rc17/completion/admin-polling/browser-acceptance.mjs /absolute/path/to/kairo-rc17-completion /absolute/path/to/admin-polling/browser-acceptance.json
```

The runner has now completed against source `c954c0d808847f249df0659ed15fdce2e89f84c4`, fingerprint `472afe35fc135243350cad554205ac5845e5bd9404e81838a52aca8d09b63b27`: **18 / 18 compiled checks pass** in [browser-run1.json](browser-run1.json), with no browser exceptions or external requests. The associated successful frozen build receipt is retained as [candidate-build-receipt.json](candidate-build-receipt.json). It asserts:

- Idle/running/hidden/focus Markets request counts, complete/cancel/error transitions, old cached book visibility, delayed transport with a 20-event burst, no overlap and retry after a failed request.
- OBS status-only idle fallback, direct SSE status publication, dirty port/password through real EventSource disconnect/reconnect and focus recovery.
- Eight Goal snapshot invalidations without note/source reads, unrelated-pilot event suppression, real note create/delete HTTP mutations without progress/metadata reload, and selected-pilot publication.

Administrative two-second/thirty-second timeout deadlines are driven by a diagnostic virtual clock; intervals, backend time and other deadlines remain native. Visibility is a controlled `document.hidden` transition. This permits exact compiled request counts in a bounded acceptance run; it is **not** a populated-browser CPU/latency measurement and does not establish real OBS WebSocket integration or operating-system background throttling. Pending loaded/idle matched UI measurement remains separate from this correctness gate.

## Closure disposition

F5 source work, targeted contracts and source-bound compiled acceptance are implemented and pass. The integrated 941-test source/build verification is recorded in the parent completion checkpoint. The frontend matched loaded/idle measurement and final frozen-source matrix remain separate closure requirements. Keep PR #10 withdrawn until the complete RC17 ledger has closure evidence.


## Native-browser correction found during measurement

The first uninstrumented candidate in `../frontend-models/abba-run1` raised four Chromium `TypeError: Illegal invocation` exceptions when Markets/OBS tried to arm their ordinary timers. The source was `createAdministrativeRefresh` constructing `timers = {setTimeout, clearTimeout}` and then calling `timers.setTimeout(...)`: the receiver becomes the helper object instead of the browser Window. Node timers and the earlier virtual-clock wrappers tolerate this receiver, masking the real-browser defect. The complete failed ABBA attempt is retained and is not performance acceptance.

[native-timer-fix.patch](native-timer-fix.patch) uses default wrappers that invoke `globalThis.setTimeout` and `globalThis.clearTimeout` on their required receiver. Injected timer-object methods remain unchanged. A new regression checks the receiver for both scheduling and disposal. The fix is prepared in an isolated c954 worktree; native compiled verification and corrected ABBA are pending.
