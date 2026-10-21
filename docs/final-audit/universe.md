# Final audit — Universe, Maps and navigation

Owner: `universe`; correction reviewer: `frontend_stream`. Source review is complete. Both new UI findings were reproduced in both browser engines and widths; their reviewed corrections are banked and verified in Build93. [Final audit](../FINAL-AUDIT.md) owns current banking and combined acceptance. The 74 closed premerge findings and their scoped evidence remain closed.

## Coverage and disposition

Compared current owners and tests with the Universe, routing, schematic, architecture and internal-API contracts. This is boundary-focused review, not line-by-line certification of every form, visual declaration or imported datum.

| Area and inspected owners/tests | Disposition |
| --- | --- |
| Geometry/static: `universe-static`, routing, schematic layout, projections; static/schematic/map-navigation suites | Physical XYZ/LY remains separate from schematic/radar coordinates. Generation-owned topology, lazy detail reads and bounded caches remain intact. No new issue. |
| Scopes/tracking: J-Space scopes/tracking and active-pilot integration; J-Space scope cases | Ownership selectors require fresh complete sovereignty. Inferred blocs/private annotations grant no authority. Shared observations avoid per-map collectors. No new issue. |
| Persistence/expiry: Universe/J-Space reconciliation, revisions, imports and savepoints; J-Space/read-bound/portable-link suites | Canonical removal clears exact signature bindings, route references and undo copies. Pruning preserves map-local annotations; imported trust is demoted while endpoint/direction evidence survives. No new issue. |
| Navigation: preparation/context/routing; route-preparation and waypoint-ownership suites | One request owns its graph/grid; acceptance rechecks used evidence and freshness. Waypoint admission is ordered per pilot and connection-owned. No new issue. |
| Public/inferred data: providers, politics, sovereignty and scene projection; feed/politics suites | Unknown differs from zero; nominal wormhole limits do not imply remaining mass. Political inference is attributed, bounded and separate from access/OPSEC authority. Duplicate category finding below. |
| Pilot/map/draft ownership: Universe/Navigation/JSpaceWorkspace and request/layout helpers; navigation-state/request tests and prior pass-4 harness | Refreshes and dock state remain pilot/map scoped. Saves serialize accepted revisions; obsolete views cannot publish results. No evidence contradicts closed findings. |
| Effects/private window: Atlas worker/RAF/resize/visibility, Maps camera, tactical hook | Renderer cleanup is explicit. Deferred PiP completion has the new ownership defect below. |
| Replay: Universe composition, Session replay and sovereignty projection | Bounded historical playback creates no live chain/operational overlays. Current sovereignty is labelled as cached backdrop; missing captured evidence stays missing. Session accounting is separately audited. |

## Confirmed findings and correction evidence

**FA-08 — deferred tactical PiP completion, medium.** In `components/kairo/universe-tactical-window.tsx`, an awaited `requestWindow()` could finish after Universe unmounted. Success adopted a stale portal into an ownerless child; rejection attempted popup fallback. Unmount could not close a child that had not yet returned.

`tests/final-audit-tactical-scenarios.mjs` controls API promise timing around real sidebar navigation, uses actual same-origin browser windows and moves the compiled React portal. It does not reconstruct the hook. The [baseline receipt](evidence/build92-baseline-verification.json) and [unaltered checks](evidence/build92-ui-baseline.json) retain exact source/engine/artifact identities. Across Chrome/Firefox at 1600/390 pixels, tactical checks recorded **12 expected failures and 60 healthy controls**: late child closure, stale-host prevention and rejected-request fallback each failed in all four contexts.

The correction fences completion by lifetime and request generation, retires generations on return/unmount, and closes an obsolete returned child without closing a newer owned target. Existing canvas adoption/return and explicit retry remain intact. Healthy controls cover current success, same-renderer identity, blocked-popup failure/retry and adopted-window unmount. Added reordered-request controls exercise older success/rejection after a newer open adopts the renderer; these were added after the baseline. Cleanup closes child windows and settles pending promises.

**FA-09 — duplicate landmark category, low.** `universe-operations-detail.tsx` supplied `a0_star` twice. Actual visible-picker checks recorded **eight duplicate failures and 16 healthy controls** across the same four contexts. A0-only filtering and All-category recovery passed. The correction removes only the duplicate entry.

Reviewer `frontend_stream` accepted both exact corrections and added controls: the fence runs after the await and before fallback, stale cleanup preserves the current target, and return/unmount retain resource ownership. No polling, extra request or second renderer was introduced. Local harness syntax and hook TypeScript-strip parsing passed. [Build93](../BUILD93-VERIFICATION.json) verifies the fixed browser flows and combined candidate gates.

## Regression quality and limits

Fresh inspection covered actual stored-evidence mutation and unrelated-write controls in route preparation; projection/graph counts across fifty stops; SQLite expiry and pilot/source isolation in J-Space reads; atomic failed imports, scope backfill and map-local rediscovery; paused-provider connection replacement/shutdown in waypoint/structure ownership; and feed outage, stale evidence and bounded ingestion. Portable-link coverage preserves closed PBR-59. These inspections do not rerun historical evidence; execution identities remain with the combined gate.

No live EVE account/provider, structure permission, in-game waypoint result, native OS PiP surface or extended play session was exercised. Controlled dual-engine PiP timing establishes the asynchronous owner contract, not native-window compatibility. Practical access, docking, fuel/capacitor, remaining wormhole mass and safe arrival remain outside routing guarantees. Pinned game models retain their recorded effective dates. Upgrade/restore policy, Windows behavior and private/broadcast HTTP separation belong to their cross-system audits.
