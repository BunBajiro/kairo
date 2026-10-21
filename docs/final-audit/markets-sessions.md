# Markets, Import Analyser and Sessions audit

Owner: `markets_sessions`. Banking and combined-candidate acceptance are recorded in the [central audit](../FINAL-AUDIT.md#banking-and-current-acceptance). This report records reviewed scope and finding-specific evidence; prior Build91 and performance acceptance retain their original scope.

## Coverage and disposition

Paths below are relative to `server/` unless another directory is shown. Listed owners were read in full; focused boundary reads are identified separately.

| Area and reviewed owners | Boundaries examined | Disposition |
| --- | --- | --- |
| Markets: `markets.mjs`, `market-categories.mjs`, `market-history.mjs`, `market-history-store.mjs`, `market-history-worker.mjs`; `components/kairo/markets.tsx` | Complete-book publication, failed-page retention, pacing, actual worker exit, pagination and demand gaps | No new blocker found |
| Imports: `imports.mjs`, `import-math.mjs`, `import-cache.mjs`; `components/kairo/import-analyser.tsx` | Fees, quote/save, buyer/seller identity, historical quote retention, roster authorization, cache revision and accepted-write ownership | FA-04 and FA-07 corrected, independently reviewed and accepted in [Build93](../BUILD93-VERIFICATION.json) |
| Sessions: `history.mjs`, `session-policy.mjs`, `session-event-window.mjs`, `session-travel.mjs`, `session-details.mjs`, `session-live.mjs`, `session-combat.mjs`; `components/kairo/session-report.tsx`, `components/kairo/session-report-page.mjs`; `lib/session-summary.ts` | Receipt-time ownership, unowned versus legacy observations, initial hull, delayed enrichment, LP uncertainty and report paging | No new blocker found |
| Replay: `session-replay.mjs`; `components/kairo/session-replay-timeline.mjs`, `session-replay-sovereignty.mjs` | Fixed event snapshot, observed transitions, coordinate gaps, recorded versus current sovereignty | No new blocker found |

Focused reads covered `components/kairo/session-replay.tsx` loading/playback/frame ownership, `components/kairo/model.ts` API handling and `server/index.mjs` import/plan/Session routes. Owning guides, API contracts, source comments and completed acceptance records supplied the contract baseline.

## FA-04: retired Advanced Broker Relations coefficient

`tradingRates` used `.5 + .05 × level`, producing a 75% relist discount at V. CCP permanently changed this to `.5 + .06 × level`, or 80% at V. The error inflated repricing reserves and break-even prices, potentially changing import qualification/ranking.

Primary policy checked 18 October 2026: [CCP’s permanent 2021 change](https://www.eveonline.com/news/view/the-grand-heist-now-live), [current broker/tax rules](https://support.eveonline.com/hc/en-us/articles/203218962-Broker-Fee-and-Sales-Tax) and [order-modification fees](https://support.eveonline.com/hc/en-us/articles/203218932-Buy-and-Sell-Orders). The other implemented rates agree with those sources. Live ESI type-description retrieval was unavailable; no successful ESI verification is claimed.

`tests/kairo/import-fee-policy-review.test.mjs` reproduces the actual service quote and arithmetic. At V, a 200m ISK NPC listing incorrectly reserves 500,000 instead of 400,000 ISK; its first profitable tick becomes 1,049,000 instead of 1,048,000. The structure example reserves 1,250,000 instead of 1,000,000 ISK.

[Before](evidence/import-fee-before.tap): 2/11 test nodes pass, 9 fail, including the parent of five failing trained-level cases. Level-zero, fee-minimum and zero-repricing controls pass. [Fixed](evidence/import-fee-fixed.tap): fee/import/roster tests pass 53/53, covering all skill levels, NPC/structure rates, first profitable tick, actual quote/save, unchanged historical-plan bytes and zero provider requests.

The correction changes one coefficient and its guide/source explanation. Historical quotes change only on explicit resave; query, cache and network costs are unchanged. Reviewer `docs_tests` independently accepted the policy, regression and preservation boundaries and reran 53/53. Banked at `24bba81`.

## FA-07: import settings accepted-write order

An older Apply held before server receipt could survive navigation, then overwrite a newer accepted Apply from the remounted editor. Earlier draft tests held the response after persistence, so they did not establish durable ordering.

`tests/final-audit-import-scenarios.mjs` exercises compiled controls with real HTTP/SQLite ownership. The [Build92 receipt](evidence/build92-baseline-verification.json) and [unaltered checks](evidence/build92-ui-baseline.json) preserve before evidence: all four Chrome/Firefox, 1600/390 combinations saved obsolete cargo 20,000/budget 2bn instead of 30,000/3bn. Each success-order scenario passed its other 12 checks; all 13 failed-first checks passed in every combination.

Controls cover cold mounting, same-editor blocking, obsolete error suppression, retained current draft, failed-first queue release, current transport failure, explicit retry and exactly four PUTs for four actions. They distinguish stored state from the displayed draft.

The correction queues accepted commands by actual destination hub across remounts, snapshots submitted values, releases after rejection and removes idle tails. Successful PUT acknowledgement still preserves later edits and precedes optional trader refresh, so refresh failure cannot conceal an already saved setting. Refresh remains inside the same command because it consumes those settings. Retired editors cannot publish responses/errors.

Each Apply retains one PUT; Update trader data retains its additional POST. There are no implicit retries, polling or extra backend reads. Reviewer `frontend_stream` accepted ownership, acknowledgement, failure cleanup and cost bounds; TypeScript and scenario syntax checks pass. Banked at `edbc633`; [Build93](../BUILD93-VERIFICATION.json) verifies fixed hosted flows and combined-candidate gates. Separate-hub concurrency and optional refresh sequencing were source-reviewed, not separately browser-asserted.

## Supporting evidence and limits

The [selected owner baseline](evidence/markets-sessions-owner-baseline.tap) passes 123/123 under Node 24.19.0. Imports/roster, Markets/pacing and Session event/report/live/travel/summary/replay tests use real SQLite, deferred providers and controlled clocks. They check rollback/expiry, authorization across awaits, cached-request pacing, indexed snapshots, same-timestamp ownership and live-versus-ended collection. Existing import draft/plan/settings and Session edit/dialog browser harnesses were inspected; their retained evidence remains separate.

Reviewed bounds remain: one Market scan, 2,000 pages/two million received orders per hub; 32 MiB/250,000-record history worker and 100-type projections; 30-second import memo, 100-candidate yields, 100 lines/plans and 5,000 loads; six Session public pages/100 verifications per pass, indexed report cursors and bounded replay. No elapsed-time investigation was repeated.

Fixtures establish neither upstream completeness nor actual permissions. Live SSO, structure access, trader standings/orders, purchases, zKill completeness, extended play and Windows installation remain outside this review. Demand is an assumption; quotes reserve no stock; LP overlap and missing historical observations remain documented limitations. Full-suite, hosted/package and environment acceptance belong to the central audit.
