# Independent static names protocol review

Chronology note added by the implementation owner after this static review: the reviewer statements below describe the pre-runtime review point. Subsequent `semantic-attempt1` passed75/75 tests; `counts-attempt1` and `abba-attempt1` passed their source/domain guards. `RESULTS.md` records those later outcomes. Compiled Dashboard race/bootstrapping and combined-source acceptance remain open. The reviewer did not execute those workloads.

Reviewed 2026-10-08 by `review_m9_summary_trial/review_write_inputs`. No application runtime, tests, builds, measurements, source edits or remote operations were performed by this reviewer. This is a source review, not adoption or RC17 closure evidence. PR #10 remains withdrawn.

Scope: isolated `kairo-names-227-baseline` versus `kairo-names-227-candidate`, both exact `22773cc7cb6e83ac51e412565ba65c101613536a` plus the accepted hidden saved-binding filter. Neither contains the subsequently accepted Assets context boundary; combined integration still needs that boundary. The initial proposal is retained in `initial-review-proposal/`; this report also reviews the author's subsequent first-open/disconnect corrections.

## Findings and correction review

1. **Initial proposal blocker: delayed legacy startup HTTP could be discarded without recovery.** Dashboard's initial `/state` read captured the names fence before EventSource opened. The original unconditional `connect()` and ancillary counter increment invalidated that capture; the first `onopen` did not request a follow-up. A legacy server supplies no global `names` event, so its initial directory could remain empty until a selected-pilot snapshot or the 30-second poll. The corrected owner (`components/kairo/name-directory-state.mjs:21–27`) returns false and preserves the capture on a clean first open; Dashboard increments its ancillary fence only for an actual invalidation (`dashboard.tsx:176–177`). A new owner regression test expresses this ordering. **Addressed by static inspection; runtime verification remains required.**

2. **Initial proposal blocker: HTTP recovery could not cross epochs during an SSE outage.** Once a names event established epoch A, an error did not change the owner state; even a newly requested authoritative `/state` from restarted process B was rejected at the cross-epoch check. The corrected `disconnect()` (`name-directory-state.mjs:29–32`) invalidates outstanding captures, permits fresh HTTP authority while awaiting a new bootstrap, and rejects obsolete disconnected-stream names events (`:54`). Dashboard calls it on error (`dashboard.tsx:186`) and requests a scoped-refresh follow-up after an initial error followed by the first successful open (`:183`). The new tests cover old-read rejection, fresh empty epoch reset during an outage, reconnect fencing, and initial-error recovery signaling. **Addressed by static inspection; runtime verification remains required.**

No further concrete blocker was identified in the reviewed corrected files. This statement does not replace the required semantic, compiled-browser, and matched performance gates.

## Reviewed invariants

- **Per-client delivery:** `server/core.mjs:41–54` tracks accepted delivery separately for every response in a WeakMap. A new connection's bootstrap cannot mark earlier connections current. A failed client is removed without suppressing delivery to other clients. The encoded frame is shared within one publication boundary, not retained as a mutable name-map reference in a transport queue.
- **Ordering and asynchronous collectors:** `send('snapshot')` sends any changed directory before encoding/enqueuing its snapshot (`core.mjs:56–66`). Name mutation, revision increment, and each publication are synchronous JavaScript segments. Concurrent collectors may resolve between their awaits, but a publication observes the map and revision together; a later collector mutation requires delivery at the next boundary. Both normal and error snapshot exits use this path (`:297`), as does combat (`:93–97`). Accepted Core close work still publishes through the same path. Actual multi-collector and interrupted-read tests remain useful below.
- **Zero-client behavior:** the early return at `core.mjs:57` prevents names/snapshot serialization when the client set is empty. Persistence and revision increment remain ordinary name-change work; this is not a claim of zero total name-change cost. `connectUI` intentionally adds a full-map SSE bootstrap on top of the HTTP startup map; this extra work must be measured separately.
- **HTTP authority:** `/state` builds and serializes the full map/revision synchronously (`server/index.mjs:137–139`). The owner rejects captured reads invalidated by names events or connection transitions, rejects lower same-epoch counters, accepts an authoritative full reset on a new epoch at recovery, and preserves identity for an unchanged revision without scanning its keys.
- **Selected pilot and component lifetime:** the global names handler precedes and sits outside the selected-pilot snapshot filter (`dashboard.tsx:192–204`). The owner is stable for one Dashboard instance (`:52`). Scoped refresh closes the old pilot scope and suppresses its late publish (`components/kairo/scoped-refresh.mjs:13,36`); a real Dashboard remount creates a new owner. These are source-level conclusions; browser event/remount behavior remains unexecuted.
- **Legacy compatibility:** full unversioned HTTP names use `retainValue` and retain removal/reset semantics; unversioned snapshot names use `mergeResourceNames`. A legacy mutation disables revision-only identity reuse but retains the last epoch/counter to reject older versioned packets. The same authoritative revision can subsequently recover from legacy fallback.
- **Own properties:** the new owner does not assign incoming name keys onto a prototype-bearing target. Existing `sameValue` uses `Object.hasOwn`; `mergeResourceNames` iterates own enumerable keys and uses object spread, including own `__proto__` and `constructor` values. Existing resource-state tests cover these boundaries. Core's numeric positive-ID writer and its validation are unchanged apart from revision increment. The apparent direct Store writer in `goals.mjs:84` is a fallback: both production HTTP callers (`index.mjs:265,270`) provide `core.rememberNames`. No new untracked production names writer was found.

## Evidence still required

The drafted seven Core tests and thirteen owner tests were read but **not run**. Existing transport/resource/scoped-refresh/lifecycle coverage must run against the frozen correction. In addition:

1. Exercise the actual compiled Dashboard wiring for delayed initial legacy `/state` across first SSE open; initial error/open while that read is pending; established epoch A, disconnect, fresh epoch B HTTP while SSE remains down, then reconnect. Assert rendered names and number of recovery reads, not only helper return values.
2. Exercise actual pilot switching/remount with an old `/state` still pending and a newer global names event. Verify that the old scope cannot republish and that the new instance/bootstrap remains authoritative.
3. The author subsequently added an owner regression for inherited-key omission, own JSON `__proto__`/`constructor` preservation and versioned replacement; this was statically reviewed and is included in the binding below. It still needs execution. A null-prototype/full-empty transition through the owner would extend the existing primitive coverage, but no concrete defect was found there.
4. Gate two real asynchronous collectors independently around name resolution, interrupt one with failure or accepted close, and verify monotonic per-client revisions and names-before-snapshot ordering for each publication. The current close test gates the provider and manually mutates names; it does not independently interleave two real resolver completions.
5. Measure ordinary unchanged, changed, batched, connection/reconnection and zero-client paths in fresh matched processes. Preserve the full-map startup cost, all adverse rows, exact application output checks, and the accepted hidden-filter adverse cases at combined integration. Static review establishes none of these performance outcomes.

The protocol assumes that production `rememberNames` owns mutations of Core's map. Its existing public `names()` accessor returns that mutable object; no external mutation was found in the reviewed production callers. Future direct mutation would need the revision owner as well. Cross-process counters are intentionally unordered; recovery uses the current connection/bootstrap and HTTP capture policy, not numerical comparison between epochs.

## Reviewed corrected file binding

Hashes were read directly from the candidate after the three ordering regression tests and the additional own-property regression were added. Later edits require a new binding and targeted re-review; this table is not a claim that a stale proposal manifest was verified.

| Candidate file | Bytes | SHA-256 |
| --- | ---: | --- |
| `components/kairo/dashboard.tsx` | 29496 | `0abdef27e8ca60bbbefb8332c4207c5455ee36cafe4d609805d2ad5edce702bb` |
| `components/kairo/name-directory-state.mjs` | 3843 | `4ad913228a9ab47fea5aed464d52a123fb02954c038746bd1ab0fc3472f95cb9` |
| `server/core.mjs` | 30175 | `06a3792479179b72012049fdea2c85f59f04853a97bb881481b4f81eace9e3d1` |
| `server/index.mjs` | 52200 | `b203440a549aea5d86b8d2606933dfb7155cc0ce6b1767b397526bb486645995` |
| `tests/kairo/core-name-directory.test.mjs` | 10583 | `6e7fbd24440bb7f7c0be36ca3e4c4ec02e81fa19c1a2b4ae0e7b6ba163914809` |
| `tests/kairo/name-directory-state.test.mjs` | 8699 | `a818aafed601b7a73f86105e0994a58c0992766719865289d656c12aa944433a` |
