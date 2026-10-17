# Frontend shell, Goals and broadcasting audit

Owner: `frontend_stream`; correction reviewer: `universe`. [Final audit](../FINAL-AUDIT.md) owns current banking and combined acceptance. This report records the scoped review and its evidence.

## Coverage

| Area | Owners and tests inspected | Disposition |
| --- | --- | --- |
| Shell, first launch, navigation and settings | Dashboard/context/model, workspace navigation, scoped/resource/name refresh, Connections, polling and shared UI; navigation, connection and refresh regressions | No additional blocker found. Reviewed bootstrap/pilot ownership, storage-denied recovery, accepted settings queues and cold/narrow presentation. |
| Goals and private notes | Goals UI, resource reads, server goals and source preparation; wallet/progress tests | No additional blocker found. Reviewed private source metadata, later-draft fencing, stale progress, completion and rollback. |
| Studio and public Stream | Studio/work/preview, server Stream/projections and renderer/protection; save atomicity, notification and renderer tests | FA-06 below. Reviewed accepted publication, source privacy, bounded notifications, disconnect covers and teardown. |
| OPSEC and OBS | Controls and server owners, HTTP commands, classifier, space standings and OBS atomicity tests | FA-05 below. Reviewed evidence freshness, private/public separation, credentials, action ordering and transition cancellation. |

The scope excludes Markets, Universe, Sessions, runtime/data and packaging internals except the cross-owner reviews noted below. Existing source contracts and bounds remain in [Internal API](../INTERNAL-API.md) and [Streaming](../STREAMING.md).

## Findings and corrections

| Finding | Reproduction and prior coverage boundary | Bounded correction |
| --- | --- | --- |
| **FA-05 — manual protection saves unrelated drafts** | Editing High-Sec release/pilot/alliance fields, then forcing protection, submitted the full draft. Releasing manual protection could expose verified High-Sec under an unsaved policy. PBR-34 covered edits after an older save started, not independent manual approval. | UI sends exactly `{manual:boolean}`; the existing PUT merges this into current persisted policy after receiving the body. Full policy replacement remains explicit. Accepted protection commands queue across remounts. |
| **FA-06 — Studio remount restores obsolete saved content** | Save, navigate away/back in the same document, then save another field: stale `boot.stream` could overwrite the accepted layout. PBR-33 covered same-editor acknowledgement; cold reload refreshed bootstrap and hid this gap. | Shell-owned saves serialize and update accepted layout state. Clean remounts adopt acknowledgements; dirty drafts remain intact. A Stream-specific generation fences older bootstrap fields while preserving unrelated metadata. |

The immutable [Build92 baseline receipt](evidence/build92-baseline-verification.json) and [check rows](evidence/build92-ui-baseline.json) record four OPSEC failures per engine/width (**16**) and five Studio failures per context (**20**) against original UI. All 24 shared cases completed. Exact source, engine and artifact identities remain in that receipt and the central ledger.

## Regression evidence

| Evidence | Result and meaningful controls |
| --- | --- |
| `tests/final-audit-stream-scenarios.mjs`: original OPSEC and Studio scenarios | Real sidebar navigation, saved SQLite configuration and sanitized public output; current failure/retry and exact mutation counts. OPSEC uses fresh synthetic High-Sec evidence. |
| Added `studio-accepted-owner` scenario | Holds successful acknowledgements across clean/dirty remounts; holds an older request before persistence while a newer editor saves; releases stale bootstrap after saving and checks unrelated module metadata still publishes. These added controls were not part of Build92. |
| `tests/kairo/opsec-manual-policy.test.mjs` | Before: four of five child cases fail, full-policy control passes. Fixed: **6/6** reported tests pass. Partial-body HTTP barrier proves latest-policy merge; invalid values leave state unchanged; actual SQLite write failure cannot publish and explicit retry succeeds; replacement/default/overlap rules remain intact. [Before](evidence/opsec-manual-policy-before.txt), [fixed](evidence/opsec-manual-policy-fixed.txt). |
| Focused existing owner/helper checks | Initial **103/103**, then **109/109** with the native regression; typecheck passes. [Initial log](evidence/frontend-owner-checks-initial.txt), [fixed log](evidence/frontend-owner-checks-fixed.txt). Workspace checks, not exact combined-candidate acceptance. |
| Independent review | Universe reviewer accepted source and harness changes and independently reran native policy tests **6/6**. No extra polling, background collector or provider request is introduced. |

`tests/final-audit-ui.mjs` isolates each scenario in a fresh actual runtime/SQLite profile and browser context. It rejects unexpected network access and incomplete aggregates, retains failed/partial artifacts, and exercises Chromium/Firefox at 1600/390 pixels. The added Studio case expands the candidate matrix from 24 to **28** cases. Fixed hosted results belong in the central ledger.

This owner independently accepted the [tactical-window/category](universe.md) corrections and [import-settings queue](markets-sessions.md), including obsolete-window cleanup, hub-keyed ordering, newer-draft preservation, rejection recovery and idle-tail cleanup.

## Limits

No live EVE/SSO, actual OBS scene/audio/crop behavior, Windows/DPAPI or extended play was exercised. Fixtures cannot establish those outcomes. The empty default Studio canvas, operator-approved custom/bound text and polled-provider observation gaps remain documented product limits. Prior closed findings and their historical evidence are unchanged.
