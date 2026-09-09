# Validation — 9 September 2026

## Completed

- Successful production/static export with the retained Vinext build workflow.
- Release ZIP includes compiled assets and source, excludes dependencies and local credentials/data; the same 108 tests also run from the extracted package without an npm install.
- Application TypeScript check using `tsconfig.kairo.json`.
- 108 passing Node contract/integration tests:
  - S256 PKCE generation.
  - JWT issuer, application/EVE audience, expiry and character claim checks.
  - Authenticated vault encryption and tamper detection.
  - OAuth state binding and one-time use, signed identity validation, refresh single-flight and rotated refresh token storage.
  - Concurrent ESI request deduplication and Cache-Control.
  - ETag/304 freshness and stale-data retention on failure.
  - Multi-page collection and per-character private caches.
  - 429 backoff.
  - OPSEC unknown/stale/manual policies and FW/blue/hostile precedence.
  - Empty stream defaults and allowlisted configuration fields.
  - Opt-in notifications, allowlisted context templates, location redaction, cooldowns and pause behaviour.
  - Module migration, page registration and disabled-subscription isolation.
  - Host and CSRF validation.
  - HTTP serving, compiled asset access, private-session enforcement, cross-origin rejection, stream read-only routes and CSP.
  - Simulated signed SSO → scoped ESI → observed location → SQLite journey → authenticated state API, with no character/location leakage to stream state.

## Added in 0.2

- Upgrade of a pre-0.2 SQLite database preserves sessions, goals and custom stream wording; reopening does not repeat the migration.
- Selected goals update widget text and progress; deleting a source or changing character cannot expose another record. Binding IDs and private metadata stay off the stream endpoint.
- Stale, disabled and disconnected ESI bindings produce unavailable states.
- Context toasts filter characters, allow only declared tokens, redact locations at delayed delivery and after protection transitions, and respect pause.
- Named reports include wallet/SP samples, diverse events, late combat, character/time boundaries and full totals despite paginated event display.
- System, constellation and region notes retain separate identities; public coordinates and private markers enrich the journey ledger.
- A real local WebSocket fixture exercises the native Node client: OBS v5 challenge authentication, encrypted credential storage, request correlation, source inventory, hide/mute ordering, obsolete reveal cancellation, failed-action blocking, collection/source mismatch refusal, server kicks, bad passwords and reconnection to the latest state.
- HTTP feature APIs persist linked goal output through a process restart and remain unreachable from browser-source routes.

The OBS fixture simulates the protocol and is not an installed OBS Studio instance. Real scene rendering and stream capture still require the user's environment.

## Added in 0.2.1

- Expired location cache entries retain recent classification during revalidation; old/invalid observations and expired public context fail closed.
- A simulated jump retains Blue with covers active, emits no repeated transition events, and changes directly to the verified Hostile destination.
- Continuity cannot renew its own deadline, preserve Safe through missing data, mask denied access, or carry across a character/policy change, manual override or verified unclassified destination.
- The real core keeps UI freshness reporting separate from protection evidence; repeated evaluations and brief fetch errors do not flood history.
- Location refresh proceeds while a paged collector is blocked and deduplicates work with ordinary syncs.
- Protection requests take priority inside the shared four-request cap; stale responses preserve access-denied status.
- Requests blocked by rate limits resume after cooldown, without a permanently retained rejected promise.
- Authenticated timeline API defaults to five newest entries, pages equal timestamps without gaps, preserves character isolation, and searches older history.

## Added in 0.3

- Both Good/Excellent and Bad/Terrible classify correctly in each personal, corporation and alliance source; Neutral precedence is explicit.
- Stale/denied/truncated and wrong-membership contacts are rejected. Authorized organization collectors use scoped membership routes and refetch on membership change.
- High-/Low-Sec thresholds, neutral null-sec, Pochven, Abyssal and Anoikis identification, unsupported spaces, missing region context, manual and FW overrides.
- New covered categories retain bounded jump continuity; released High-Sec does not.
- Legacy OBS rules migrate once without silently revealing a previously covered High-Sec scene; intentionally emptied rules survive restart.
- Both reported sovereignty owners resolve via the real names-service code path in an isolated HTTP fixture. All browser-source assets are served through the read-only allowlist.
- The stream remains empty by default, covers stay opaque, plain fillers stay blank, and notification styling metadata comes only from approved event types.
- Renderer JavaScript syntax and application TypeScript checks. No browser/visual QA was requested or performed.

On 6 September, the pinned ESI specification was fetched again and the personal/corporation/alliance contact scopes verified. Live public requests resolved alliance 99011223 to Sigma Grindset, alliance 99012279 to Sportmodel, and region 10000070 to Pochven. Actual private contact responses still require the user's renewed EVE authorization.

## Added in 0.3.1

- Compact notifications use shared Studio/OBS styling: 440px width, 82px height, small event category and EVE timestamp, and a two-line message with a bottom-edge lifetime indicator.
- The separate title row and title editor are removed. Older title-only rules retain their wording as a message fallback; active toast updates still replace the displayed context after protection changes.
- Renderer JavaScript syntax, application TypeScript and production export checks pass. The same 45 existing contract/integration tests pass from the extracted release.
- Sizing is defined in CSS; this update was not visually tested in a browser or OBS instance.

## Added in 0.4

- 13 additional tests cover participant/final-blow/loss classification, zero-damage EWAR, exclusion of unrelated fleet/corporation members, collection beyond 50, cross-source deduplication and retention after a source window shrinks.
- Public collection uses no EVE authorization headers, respects the one-hour cache, and preserves records during Retry-After cooldowns.
- Late assisted kills backfill archived sessions without replaying initial historical notifications; time and character boundaries remain enforced.
- Hiding/restoring exact journey legs preserves visits, does not bridge across a pruned edge, rejects another character’s visits, and persists through reopening the store.
- Automatic wallet/asset goals pause on stale, truncated, disabled or unauthorized data. Completion happens once and stays recorded after the balance falls.
- Skill goals validate skill types/levels and apply completed fresh queue entries. Public type lookup resolves human-readable names.
- Mining baselines and accounting survive restart and repeated/dropped/reappearing daily totals. Income and manufacturing retain credits when source windows move; deliveries do not recount ready jobs.
- Combat goals count verified involvement since creation. Legacy manually tracked goals retain their progress and mode.
- Normal core collection updates automatic progress and a selected Studio widget. New HTTP writes enforce CSRF and character ownership, and the OBS listener cannot access them.

On 6 September, the pinned current ESI specification and current zKillboard API documentation were read. A read-only public request for character 2124473839 returned 200 records: 18 final-blow kills, 139 other attacker participations and 43 losses. The response uses full ESI-style killmails plus zKillboard metadata and reports a 3600-second cache duration. No private EVE sign-in was used for that check. ESI’s location schema has only system/station/structure identifiers and no travel-method field.

## Live official endpoints checked

The current OpenAPI specification was downloaded from `https://esi.evetech.net/meta/openapi-3.0.json?compatibility_date=2026-09-04` and the collection catalog compared with it. The spec reported version `2026-08-18`. Endpoint-specific scopes were checked against the spec.

Successful live requests included:

- SSO discovery: `https://login.eveonline.com/.well-known/oauth-authorization-server`.
- `GET /status`, including a live request through the actual Node ESI service.
- `GET /sovereignty/systems` (new nested sovereignty claim format, normalized by Kairo).
- `GET /fw/systems`.
- `POST /universe/ids` with `UALX-3`, resolving to system `30004807`.
- `POST /route/30000142/30002187` with `preference: Safer`.

The compatibility date is pinned, not advanced automatically. New changes should be reviewed against the ESI spec before updating it.

## Remaining real-environment checks

These were not performed and are not represented as passing:

- EVE SSO sign-in using the user's actual registered application and Bun Bajiro's authorization.
- Authenticated ESI responses for the user's actual scopes, assets, permissions and account.
- Windows DPAPI encryption/decryption under the user's Windows login.
- Visual/browser interaction tests, including responsive rendering at real viewport sizes.
- OBS/Streamlabs browser-source rendering, audio, exact cover placement, startup/reload handling and scene transitions.
- Long-duration collection during an actual play session.

The update has passed automated contract and integration checks. Real EVE authorization, Windows DPAPI and rendered OBS output remain environment-dependent checks.

## Primary references

- [EVE SSO, PKCE and JWT validation](https://developers.eveonline.com/docs/services/sso/)
- [ESI overview and compatibility dates](https://developers.eveonline.com/docs/services/esi/overview/)
- [ESI rate limiting](https://developers.eveonline.com/docs/services/esi/rate-limiting/)
- [X-Pages pagination](https://developers.eveonline.com/docs/services/esi/pagination/x-pages/)
- [EVE image service](https://developers.eveonline.com/docs/services/image-server/)
- [Current ESI API Explorer](https://developers.eveonline.com/api-explorer)

- [OBS Browser Source documentation](https://obsproject.com/kb/browser-source)
- [Node.js downloads](https://nodejs.org/en/download)

- [OBS WebSocket v5 protocol](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md)
- [OBS remote control guide](https://obsproject.com/kb/remote-control-guide)

- [CCP system and region ID ranges](https://developers.eveonline.com/docs/guides/id-ranges/)

- [Current zKillboard API documentation](https://zkillboard.com/api/docs/)

## Added in 0.5

- Thirteen focused market/goal contract and HTTP tests cover station filtering, buy/sell aggregation, paginated public orders without private auth, Jita comparisons, regional-volume reports, full scans across 251 pages, bounded/clamped browsing, malformed/changed/oversized page sets, failure-safe promotion, quick refreshes preserving other types, cancellation, restart, history continuation, alt structure access, hub removal/restoration and exact-owner goal projection.
- Market routes require a private dashboard session; writes require CSRF. Both market state and browse routes are absent from the OBS listener. Existing OPSEC/concurrency and all previous module tests continue to pass.
- Live public ESI smoke scan: Jita Nanite Repair Paste and Cap Booster 800, two order pages plus both histories, successfully produced buy/sell, quantity, weighted listing average and regional daily-volume values. Four default station identities and all 27 quick-supply names were resolved against the current ESI API. This did not use private character credentials.
- A synthetic 20,000-item-per-hub SQLite cache produced a 60-row browser response in approximately 24ms and a 40-row supply report in approximately 102ms (37.6KB response) in this build environment. These are one local measurement, not a performance guarantee for the user’s PC or network. Network collection time depends on hub size and ESI cache/rate limits.
- No browser visual testing or live OBS interaction was performed. Real private structure ACL/scoped scans and Windows SSO/DPAPI remain user-environment checks; protocol and access behavior were tested with isolated fixtures. Compact toasts, blank stream defaults and opaque OPSEC boundaries remain covered by existing contracts.

## Added in 0.5.1

- Two focused tests cover descendant selection, sibling isolation, aggregated counts, unknown-type fallback, and existing-book browsing with real CCP category assignments while network access and the Markets collector are disabled. Search, supply filters and hub isolation remain effective with a category selected.
- The market HTTP boundary test also verifies category requests require a dashboard session and are absent from OBS. TypeScript and the production build pass; all 73 tests also pass from the extracted standalone release.
- Official SDE build 3494416 provided market groups and type assignments; ZIP entry CRCs were checked during extraction. Only the 248KB compact category catalog is bundled. No browser visual testing was performed.
## Added in 0.5.2

- Fourteen additional tests exercise actual scheduler/request counts, the one-minute queue requirement regardless of predicted completion time, edits/cancellation, early trained-skill refresh, goals, hull changes, warm restart and observation timestamps.
- The five-minute fixture retains 51 location requests, makes six ship and six queue requests including startup, and collects slower training/calendar datasets once. Its OPSEC remains Blue with one initial transition. These are controlled fixture results, not a measured user bandwidth benchmark.
- Overlapping name batches resolve each ID once; names persist across service restart, public calls use no private tokens, and structure caches remain character-specific. Equivalent URL queries share a cache, and 304 responses preserve the prior cache policy.
- Durable failure backoff retains old samples, respects Retry-After and recovers; static 404s back off while location failures retry promptly. Market group limits survive restart without blocking unrelated protection or another character.
- Manual market scans reuse names, cached books and histories across alts. Browsing/report/category reads make no ESI requests.
- Custom intervals persist, change request cadence and recalculate from the observation time. Required protection context still refreshes on time. Invalid updates are atomic; disabled modules and failed samples cannot be reactivated by setting a longer interval.
- Polling settings enforce local sessions and CSRF, survive a service restart and remain absent from OBS. All 87 contract/integration tests, TypeScript checks and the production build pass; the same tests run from the extracted standalone ZIP.
- The Settings tab uses labelled Radix sliders with discrete choices, keyboard controls, explicit value text and clickable stops. CSS provides bounded module navigation, narrow-screen stacking and reduced-motion handling. Browser visual/interaction testing and real private EVE/OBS validation were not performed.

## Added in 0.6.0

- Completed-day history windows use calendar denominators and reject current-day volume; duplicate dates do not double-count.
- Fee calculations exercise active Accounting/Broker Relations skills, unmodified faction/corporation standings, entered structure fees, minimum broker fees and repricing reserves. NPC station owners resolve factions from CCP static data when the public corporation response lacks that field.
- Procurement walks actual Jita price tiers and respects EVE price ticks, available units, fees, capital limits and margins. Recommendations enforce category activity thresholds, history coverage and assumed hub demand.
- Cargo tests enforce indivisible repackaged hulls, capacity/max-trip bounds, fewer-trip ranking and shared load packing without duplicate hauling charges.
- Offline analysis returns at most ten ranked recommendations per category, groups rigs/subsystems/drones as equipment, excludes authorized alts’ local sales and own Jita orders, and ignores expired depth. Missing trading authorization does not become zero fees.
- Saved plans are recalculated server-side, reject duplicate/invalid lines, persist through restart and retain source/fee snapshots. Settings validation is atomic.
- Real compressed fixtures exercise CRC failures, truncation, date validation, selected regions, changed-day imports, persistent reuse, incomplete archive rejection, cancellation and rate-limit cooldowns. Requests carry no credentials.
- A public EVE Ref daily file was decoded successfully: 47,396 records, of which 20,993 belonged to the four selected regions. This checks real archive compatibility in addition to deterministic fixtures.
- Only Jita, Amarr, Dodixie and Hek use the archive path; custom hubs exercise ESI history. Lowest-price comparisons ignore deliberately distorted listing averages. Update suggestions begin at the full 24-hour boundary.
- The upgrade test clears old market books/responses once, preserves goals/settings and unrelated caches, scans fresh Jita/local books, retains a hidden Jita preference, and keeps new books on restart. Missing structure access leaves an explained pending queue.
- Import APIs require private sessions and CSRF protection; every tested import route is absent from the OBS service.

The archive, NPC ownership and tax sources were checked against public EVE Ref/CCP material. Tests use deterministic character snapshots rather than a live private EVE account. Actual Windows launch, in-game fees/orders, browser rendering and OBS rendering were not exercised in this environment. Regional history cannot verify station-level turnover or guarantee the model’s projected sale times.
