# Markets, Import Analyser and Sessions audit

Audit owner: `markets_sessions`. Starting source: branch checkpoint `b9f9e43ea84d3a7b1b8c206b48e442a75353b46d`; Build91 acceptance remains evidence for its separately recorded source. This report is a final-audit record, not a reopening of the four completed premerge passes.

## Disposition

| Area | Disposition |
| --- | --- |
| Markets, books, histories and cache reads | No new release blocker found in this review. Complete-book publication, failed-page retention, pacing, cancellable worker draining and bounded pagination agree with the owning documentation. |
| Import calculations | Confirmed fee-policy defect; corrected in the workspace with failing-before and passing-after owner evidence. Independent review and combined-candidate acceptance remain required. |
| Import settings across navigation | Concrete uncovered ownership path identified; a real compiled-UI regression is prepared for hosted Chrome/Firefox execution before any correction. Do not call it browser-confirmed until that evidence exists. |
| Saved plans | Server re-quotation, unique item identity, delete/capacity revalidation, separate buyer/seller and historical quote retention agree with the documented contract. Existing historical quotes must not silently change with corrected fee logic. |
| Sessions observation/reconciliation/reporting | No new blocker found. Receipt-time ownership, explicit unowned versus legacy evidence, initial hull handling, LP uncertainty and report paging remain coherent. |
| Replay | No new blocker found. Fixed event snapshot, observed-transition labels, coordinate gaps and current-versus-recorded sovereignty remain separate from live map state. |

No merge, version, tag, release publication or PR-ready transition is authorized by this disposition.

## Confirmed finding: Advanced Broker Relations coefficient

Severity: medium, release correction. `server/import-math.mjs:tradingRates` used a five-percentage-point skill increment, giving a 75% relist discount at level V. CCP permanently changed the increment to six percentage points, giving 80% at V. This inflated repricing reserves and break-even prices, understated net returns and could exclude/rank an otherwise qualifying import incorrectly. It does not reopen PBR-14's fee-minimum algebra: those minimum-regime controls continue to pass.

Primary sources checked 18 October 2026 (Europe/London):

- [CCP, The Grand Heist — Now Live, 27 July 2021](https://www.eveonline.com/news/view/the-grand-heist-now-live): the Advanced Broker Relations change is explicitly permanent, unlike the temporary taxes discussed in that article.
- [CCP, Broker Fee and Sales Tax, updated 2 March 2026](https://support.eveonline.com/hc/en-us/articles/203218962-Broker-Fee-and-Sales-Tax): the present NPC broker equation, raw standings, structure surcharge and base sales tax remain consistent with the other implemented rates.
- [CCP, Buy and Sell Orders](https://support.eveonline.com/hc/en-us/articles/203218932-Buy-and-Sell-Orders): order-modification fees apply the relist discount to the broker rate. No broader game-economy change is inferred.

The live ESI type-description endpoint was unavailable to the retrieval tool; no successful live ESI verification is claimed.

Bounded remediation changes one coefficient from `.05` to `.06`, links the owning policy in source, and corrects the user guide's formula. No new reads, cache invalidation, polling, rendering or network work is introduced. Saved plans retain their accepted historical quote until explicitly saved again.

Evidence:

- [Before log](evidence/import-fee-before.tap): `node --test tests/kairo/import-fee-policy-review.test.mjs`, unchanged calculation, 11 test nodes: 2 pass and 9 fail, including the failing parent of five failed trained-level subtests. The level-zero and minimum/zero-repricing controls pass. At level V a 200m ISK NPC listing reserves 500,000 instead of 400,000 ISK; its first break-even tick is incorrectly 1,049,000 instead of 1,048,000 ISK. The structure example reserves 1,250,000 instead of 1,000,000 ISK. The actual Imports service also reproduces the incorrect quote.
- [After log](evidence/import-fee-fixed.tap): the new fee-policy test plus `imports.test.mjs` and `imports-roster.test.mjs` pass 53/53. Coverage includes every skill level, NPC and structure costs, minimum fees, zero planned repricing, first profitable tick, actual quote/save, unchanged historical-plan bytes and zero provider requests.
- Source/tests/guide changes are workspace-only until the coordinating ledger supplies their pushed checkpoint. Build91 results are not relabelled for this executable correction.

## Pending compiled-UI evidence: import settings write order

`ImportAnalyser.apply` submits a settings PUT directly, while its busy guard belongs to one mounted editor. A pending request can outlive navigation; the replacement editor can accept another Apply for the same hub. The existing premerge import-draft scenario delays only the response after persistence, so it establishes later-draft preservation but does not establish accepted write order across remounts.

`tests/final-audit-import-scenarios.mjs` adds two scenarios to the shared final-audit runner: delayed older success, and delayed older failure. The first request is held before Kairo receives it; both submitted settings and final SQLite state are checked. Healthy controls cover same-editor blocking, cold mounting, retained newer editor state, obsolete failure suppression, explicit abort/retry and exactly four writes for four actions. The failed-first case must release the newer accepted action. Each scenario runs in Chrome and Firefox at desktop and narrow widths through the coordinating runner. The helper passes `node --check`; browser results are pending. No import UI correction was made before the failing baseline.

## Reviewed ownership and contracts

Full owning implementation read:

- `server/markets.mjs`, `server/imports.mjs`, `server/import-math.mjs`, `server/import-cache.mjs`, `server/market-categories.mjs`, `server/market-history.mjs`, `server/market-history-store.mjs`, `server/market-history-worker.mjs`.
- `server/history.mjs`, `server/session-policy.mjs`, `server/session-event-window.mjs`, `server/session-travel.mjs`, `server/session-details.mjs`, `server/session-live.mjs`, `server/session-combat.mjs`, `server/session-replay.mjs`.
- `components/kairo/import-analyser.tsx`, `components/kairo/markets.tsx`, `components/kairo/session-report.tsx`, `components/kairo/session-report-page.mjs`, `components/kairo/session-replay-timeline.mjs`, `components/kairo/session-replay-sovereignty.mjs`, `lib/session-summary.ts`.

Focused boundary reads: `components/kairo/session-replay.tsx` loading, ownership, playback and frame preparation; `components/kairo/model.ts` API helper; `server/index.mjs` import/settings/plan and Session report/replay/save routes; current architecture/internal API/reference sections describing these owners. `AGENTS.md`, the supplied handoff, Markets/Imports/Sessions guides, current review-build receipt/navigation, relevant completed bug-review entries, source-documentation ownership receipt and historical-evidence index supplied the acceptance context.

The owning source comments distinguish execution from estimates: fees and ISK/m³/day units; local book observation from regional completed trading; captured versus delayed Session evidence; replay snapshots from live collection. The incorrect repricing formula was the documentation discrepancy requiring correction here. Compact legacy source formatting is retained; no speculative reformat/refactor is proposed.

## Test quality and preserved costs

[Selected owner baseline](evidence/markets-sessions-owner-baseline.tap) passes 123/123 on the initial source under Node `24.19.0`. The command selected:

```text
tests/kairo/imports.test.mjs
tests/kairo/imports-roster.test.mjs
tests/kairo/markets.test.mjs
tests/kairo/market-pacing.test.mjs
tests/kairo/session-event-window.test.mjs
tests/kairo/session-report-page.test.mjs
tests/kairo/session-live.test.mjs
tests/kairo/session-travel.test.mjs
tests/kairo/session-summary.test.mjs
tests/kairo/session-replay-timeline.test.mjs
tests/kairo/session-replay-sovereignty.test.mjs
```

These tests use real SQLite/service ownership, deferred provider responses and controlled clocks. The import revision controls cover rollback/external writes and expiry; roster controls count one synchronous roster preparation and the post-await authorization read. Market pacing exercises the real ESI owner, including no delay on cache hits and cancellation before dispatch. Session tests check same-timestamp ownership, delayed enrichment, indexed event/visit windows, original paging snapshots, first hull/restart, live-versus-ended collection and current-state changes during waits. They do not prove upstream data completeness or actual player permissions.

Inspected browser harnesses include `premerge-imports-ui.mjs`, `premerge-market-edit-scenarios.mjs`, `premerge-market-plan-scenarios.mjs`, `premerge-pass4-markets-ui.mjs`, `premerge-pass4-market-settings.mjs` and the Session edit/dialog scenario boundaries. They exercise compiled controls with real owner responses and deliberate transport barriers; retained before/fixed evidence supports their established scope. The new settings scenario fills a distinct before-persistence gap without replacing these tests.

Preserved bounds checked in code and available regressions:

- One Market scan; no partial book promotion; maximum 2,000 pages per request series and two million received orders per scanned hub; local browse 60 rows, orders/report 40 rows. Books shared between local pilots remain intentional after access is removed.
- Archive fetch limits, a 32 MiB decoded worker buffer, 250,000 records, actual worker-exit ownership and 100-type projection batches. Missing calendar days do not inflate average demand.
- Import memo owns SQL/auth/expiry revision and a 30-second ceiling; calculations yield each 100 candidates, default results show ten per category, and plan validation limits 100 lines/100 plans per hub/5,000 loads. A fee coefficient change does not alter these algorithms.
- Session history work is capped at six public pages and 100 new alliance verifications per pass; shared live collection uses the two-minute cadence and stops for ended sessions. Eligible ended work stops at 24 hours after end. The R2Z2 pass has existing packet/time/size limits.
- Session events retain indexed pilot/time reads, a cursor/time snapshot and one next-page request. Reports do not acquire lifetime history. UI report polling pauses while hidden/static or after expanding beyond the first 100 events. Replay prepares its timeline once, uses indexed time lookup, caps visible activity at 10,000 server events and five recent UI events, and retains every recorded visit.

## Exclusions and release limits

This audit does not repeat the completed elapsed-time performance investigation or claim new hardware speed percentages. Its immutable acceptance pointers remain in [history](../history/README.md); the present work checks the owning cost bounds. The root audit owns full-suite/build/hosted/extracted-package acceptance, packaging/dependencies, Windows runtime and stable data policy.

No live EVE SSO, structure permission, actual trader standings/order snapshot or real market purchase was exercised. No live zKill completeness, extended play-session capture or Windows installation behavior is established by fixtures. Import demand remains an explicitly assumed share of regional trades, and saved quotes reserve no stock. LP after end remains an estimate with overlap uncertainty; missing historical observations cannot be reconstructed. These are documented product/environment limits, not zero-valued evidence.
