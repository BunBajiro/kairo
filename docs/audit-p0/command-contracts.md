# P0-02A: settings, OBS and Session command boundaries

Source assessed: `5f63d8c6195844aad9c620dfe3b5312921c93be1`, tree `e17073951723132b4cda44b28948bb69e77e4733`. Its executable is unchanged from [Build97](../REVIEW-BUILD.md). **This is a source-grounded contract/design unit, not implemented behavior or new runtime proof.** Current behavior and selected target behavior are deliberately separate below and in each owner document. No new defect is asserted without a reproduction; the historical findings stay closed.

This first P0-02 slice covers seven mutating HTTP handlers and the two Session action selectors from the [194-entry manifest](http-surface.tsv). Read endpoints mentioned here are dependencies, not a claim that all their behavior was audited.

| Slice | Exact manifest scope | Author | Independent source reviewer |
| --- | --- | --- | --- |
| [Settings](settings-command-contracts.md) | HTTP-033, HTTP-034: polling, theme and Client ID | `algorithms_inventory` | `api_inventory` |
| [OBS](obs-command-contracts.md) | HTTP-044, HTTP-047, HTTP-048: save, reconnect, apply | `runtime_inventory` | `api_inventory` |
| [Sessions](session-command-contracts.md) | HTTP-072, HTTP-077, HTTP-168, HTTP-169: start, end, details | `domain_inventory` | `api_inventory` |
| Shared semantics and continuation | This document, ledger, handoff and receipt | `root` | `inventory_review` |

These are live assignments for this unit only. Review disposition and static verification belong in [the unit receipt](command-verification.json). Required executable acceptance remains pending. Corresponding implementation cannot start until the remaining owner dependencies and P0-04 budgets are reviewed; this document does not authorize broad P1 work.

## Current shared boundary

[`server/index.mjs`](../../server/index.mjs) tracks each private handler promise in `requests`, including body receipt/validation, and drains it before closing dependencies. `stopping` rejects newly arriving handlers. This transport ownership is **not** proof that a command passed domain validation or committed. Host, dashboard session, Origin/Sec-Fetch-Site and non-GET CSRF checks precede private dispatch. The JSON reader counts raw bytes (150,000 by default), decodes split UTF-8 and parses the completed body; domain validation follows. Neither the body cap nor a per-provider timeout proves an aggregate command wait/queue bound.

Most errors map to HTTP 400; an error carrying status 409 maps to 409. The current envelope carries only an error message. A thrown publication or connection error can follow a local write. The current [`api()`](../../components/kairo/model.ts) rejects failed HTTP, transport and JSON parsing, with no retry and no commit classification. None of the scoped routes returns a persisted command token or authoritative compare-and-set revision. [`store.set()`](../../server/store.mjs) commits one synchronous SQLite statement; callers own atomic grouping. `snapshotRevision()` is a process-local UI delivery token, **not** a suitable durable command revision.

Existing [HTTP-body](../../tests/kairo/http-body.test.mjs) and [lifecycle](../../tests/kairo/lifecycle.test.mjs) tests cover byte/guard behavior and drain of a connected/disconnected Goal command. They are useful seams, not new proof of the selected contracts for all scoped commands. We read these tests; we did not run them in this documentation unit. Owner documents link their narrower historical evidence.

## Selected shared semantics

The following decisions settle the behavioral contract for these owners. They do not prescribe a universal retry wrapper or require a permanent operation journal. Wire names, storage layout and helper placement are implementation choices subject to review and measured cost.

| Boundary | Required meaning |
| --- | --- |
| UI accepted intent | Snapshot the submitted owner, payload and draft generation. Unsubmitted newer text remains a separate draft. A browser queue orders only its own accepted work; it cannot establish cross-tab or process order. |
| Transport admitted | Handler owns resources and eventual completion even if its socket closes. Before domain acceptance it may still reject invalid, stale or excess-capacity work without mutation. |
| Domain accepted | Entire input, current authorization/connection ownership, target and expected entity revisions have been checked at the authoritative boundary. Any asynchronous preparation must recheck them before commit/dispatch. Acceptance alone is not durable success. |
| Local committed | All required local changes, entity revisions and the command token commit atomically. Required semantic event records belong in that transaction when they are part of the domain invariant. Failed transactions preserve the prior committed state. |
| Follow-up published/applied | Bindings, invalidation, scheduling, subscribers and external actions have their own outcomes. A failure here cannot turn a committed save into a rejection or authorize replaying it. Required accounting must recover through deduplicated delivery or authoritative projection rebuild; transient toasts are not replayed to repair accounting. |
| Acknowledged | The client receives and validates the exact command's result/revision, with local outcome separated from follow-up status. Reading mutable current state after an `await` must not substitute a later command's result. Receipt does not mean every tab saw an SSE event, or OBS output is correct. |
| Outcome unknown | Lost/malformed response, timeout, interrupted handler or unavailable commit evidence cannot establish rejection. Preserve the submitted snapshot and newer draft, read authoritative evidence, and never blindly resend. |

### Conflicts, identity and restart

Use server-owned compare-and-set (CAS) revisions per logical entity. A write supplies its base revision; the atomic commit succeeds only against that base. Stale requests are explicit conflicts with zero mutation or external dispatch. There is no global ordering by browser click time, wall clock, response arrival or client timestamp. Independent theme and Client ID edits use separate entities; a request supplying both must validate and CAS both atomically. Polling uses one policy entity; OBS configuration and its credential one entity; Session lifecycle one entity per pilot, details one per Session. Owner documents specify the target/precondition details.

Revisions survive a normal runtime restart and include an opaque storage lineage or equivalent non-reuse rule, so a stale tab cannot accidentally match a newly initialized/reset profile. This is a fresh-profile correctness rule, not a requirement to preserve or migrate pre-final data. Every successful new commit advances the relevant revision even if the requested value already matches; a coincidentally equal value alone is not proof of which request committed.

Retain only the **latest commit token per entity**, atomically with its revision (and only safe result metadata needed for read-back). Each new intent uses a fresh opaque token, bound at acceptance to its owner, storage lineage, expected revision and immutable validated payload. Its receipt includes the base/result revisions and entity identity. Matching that tuple proves the local commit; bare token equality or matching values do not. The token is not an authentication secret, diagnostic correlation ID or promise of idempotency. A repeated current token cannot authorize a new commit, including with changed payload; return a conflict/read-back disposition. Once a token is superseded there is no permanent replay-history guarantee, and the client must still never reuse it. No password or private-content digest/echo is needed in the receipt to prove an OBS credential/configuration commit.

A missing/different token, overwritten receipt, new profile or failed read does not prove that the old command never committed. Once superseded, the UI may show current state but cannot claim the exact earlier outcome without surviving domain evidence. No permanent per-click history or replay endpoint is required. Composite settings results expose the touched entities; later replacement of one entity can leave only partial attribution for the earlier request.

A queued same-dashboard successor may adopt the exact successful predecessor's returned revision when it was already accepted as that same entity's continuation. This preserves ordered intent while CAS still rejects intervening writes from other tabs. Conflict or unknown outcome pauses unresolved successors; retain their snapshots and newer drafts. Do not silently rebase them onto another tab's state or release the queue by assuming the failed predecessor did nothing. Queue/deadline exhaustion leaves an explicit unresolved result and releases transport resources; it must not keep a hidden promise chain alive forever.

Reconciliation never reuses the mutation transport automatically. Select **one initial authoritative read per uncertain command**; if it cannot settle the result, retain uncertainty and permit a deliberate later inspection. Do not poll indefinitely, treat an unchanged old revision as rejection while a handler may still commit, or replay a save to discover its outcome. Read-back must have bounded deadlines/capacity and avoid provider side effects; the current Session-report GET and OBS inventory GET are not automatically acceptable reconciliation APIs. Exact read shape and limits are prerequisites in the owner implementation/budget unit. A user's later save is a new explicit intent against a freshly observed base, not an automatic retry of the old command.

Browser process loss may lose its in-memory pending token/draft. On reopening, render authoritative current state and surviving safe server evidence; do not claim the lost intent was rejected or completed, and do not resubmit it. This unit does not add browser persistence for passwords, notes or pending payloads. Runtime restart must retain local commit evidence in the active profile; interrupted OBS effects remain separate and may stay unknown. Background owners and cross-tab SSE refresh converge on server revisions without overwriting dirty drafts.

### Cancellation and capacity

Cancellation before dispatch may discard unaccepted local work. After server acceptance, closing a dialog, switching pilot, aborting fetch or losing a tab does not undo a save. A cancelled/superseded view must not publish old success, clear a newer draft or change another owner's busy state. Dependencies stay alive until owned work settles; bounded drain failure is a failed handoff, not proof of rollback. Explicit domain cancellation, where supported in later families, needs its own command contract.

Queues, accepted pending intents, reconciliation reads and OBS effect work require finite capacity and deadlines. Capacity rejection happens **before acceptance** and retains the user's draft; silently dropping an accepted command or replacing it with a newer one is forbidden. Do not add an unbounded receipt journal or a per-tab multiplier at the runtime. P0-04 must set and measure the numerical budgets before code: aggregate/per-owner admission, queued payload bytes, read/write deadlines, drain time, receipt bytes, provider requests and CPU/memory/tail latency. Existing 150,000-byte HTTP and OBS per-request caps are observations, not proof that those budgets are met.

## Acceptance to implement and verify

Each owner document supplies acceptance scenarios. Use deferred barriers at body receipt, async preparation, immediately before/after transaction commit, publication, response and drain. Assert SQL values/revisions/event records and external request counts, not only messages. Include these shared controls:

- Complete validation before mutation; type/shape, missing/unknown field, numeric and boundary cases; healthy valid controls. Inject failure at each required local write and prove atomic rollback.
- Two independent tabs/clients from the same base: one commits, the stale one conflicts without overwriting or external dispatch. Fresh explicit save then succeeds. Independent entities do not conflict unnecessarily; composite requests remain atomic.
- Lose the response after commit; the bound receipt tuple reconciles. Read before a delayed commit; old state cannot be called rejection. Supersede the receipt, restart the runtime, initialize a fresh profile, and fail the read; none authorizes blind replay.
- Fail publication/derived work after commit; keep local success attributable, recover required accounting without duplicating semantic records, transient notifications or provider effects. A later success cannot mask an earlier effect error.
- Navigate/unmount/change owner and type a newer draft while a request is pending; acknowledge only the accepted snapshot. Browser restart reads current truth without replaying lost intent.
- Saturate each finite cap and cap+1; account for all clients together, release resources on every terminal path, and demonstrate healthy recovery afterward. Measure changed costs against the P0-04 baseline.

Defects need failing-before/fixed regressions on the actual owner plus independent review. New protocol behavior needs requirement acceptance. Changed UI needs Chrome and Firefox, including cold navigation, reconnect, desktop and narrow layouts. Existing Build97 receipts do not prove these new cases. Native Windows/DPAPI, live EVE/OBS and extended use remain separate evidence limits.

## Precise continuation

P0-02 remains incomplete. This slice settles only the listed seven handlers/two selectors and their shared target semantics; it does not settle every command in C01–C16. Next **P0-02B**: Auth start/callback/disconnect (HTTP-035, HTTP-036, HTTP-154), module toggles (HTTP-037) and their Client ID/polling prerequisites. In particular, bind the selected application across async discovery, redirect, callback and token use; a local Client ID save queue cannot establish that ownership. Read the actual Auth/Registry tests before selecting those contracts.

Then bank separately reviewed families from the unchanged manifest: Stream/OPSEC controls and local output; dataset/sync/background admission; Markets/import jobs and plans; Goals/notes/places/Journey; Universe settings/feeds/operations/Maps/J-Space/navigation/waypoints; browser-local actions and retained extension/read-through effects. They are pending obligations, not exclusions. Reconcile the full manifest and non-HTTP inventory before claiming P0-02 complete.

P0-03 diagnostics/toast decisions and P0-04 measured budgets are also pending. No logging defaults/retention/caps are finalized here; no implementation or product/performance/browser tests occurred. Preserve [the clean-slate policy](../PERSISTENCE.md#production-baseline-and-version-compatibility), historical receipts, release pause, unchanged version/main and draft PR #12. Recover the next exact bank through [the ledger](../AUDIT-LEDGER.md), not this workspace.
