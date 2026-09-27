# Validation — 27 September 2026

## Universe 0.8.0-rc.12

This pass separates connection lifetime from system retention, isolates mutable J-Space data per map, and uses one location dispatcher with a lightweight live source and configurable map population.

- All 540 Node tests pass. Application TypeScript and production compilation pass.
- The compiled J-Space browser suite passes 28 workflow/layout groups with no console errors. Desktop and mobile captures cover readable map interactions and owner autocomplete, including an unavailable-logo fallback. Exact-commit Actions additionally runs the combined Universe/replay suite, Sessions browser checks and extracted-package tests before the ZIP is advertised.
- Node regression coverage checks actual database deletion at exact expiry, including disabled modules/no-sync, all J/J and J/K directions, manual deletion/collapse, bound signatures and deletion tombstones, passage/comments/undo cleanup, native imports, route caches and delayed public-provider responses.
- Map isolation checks use the same system and scanner code in independent maps and pilots. Migration copies existing map instances, removes global J-Space scanner/pin/field-note remnants, and never seeds new maps from visit history. Copies receive independent connection/observation identities and cannot edit the source.
- Tracking checks cover default enabled membership, add/remove/pause/resume, shared pilot dispatch to independent maps, no extra polling, sample deduplication, current-location baseline, entrances/internal movement/exits, stale/future/out-of-order/docked/gated/pod-loss transitions, missed-sample gaps, and route/passages remaining unconfirmed unless explicitly verified. Map navigation respects paused/removed membership.
- Source and scope coverage checks the six OR-combined selection groups, K-Space-only organisational areas, fresh complete sovereignty, configured-only power blocs, late-exit chain population, preservation of observation age/expiry and independence from existing map edits. Scope controls population rather than removing or hiding saved records.
- Read-only source checks cover active-pilot baselines, compact summaries, on-demand topology, no source annotations/passages, and rejection of direct scanner/intel/infrastructure mutation or cross-pilot access. Operations copies preserve independent intel/alert/upgrade identities and references.
- Backfill regressions prevent unrelated source movement from restoring deleted connections or removed cards, preserve remaining timers, permit genuine traversal to rediscover topology, and defer capacity-blocked delivery without losing it. Closed-view maintenance prunes source systems after 30 minutes, including disconnected accounts.
- Native operational round trips preserve reports, alert references and infrastructure with new identities and original ages. Malformed payloads and storage failures roll back the whole import; configuration and live pilot telemetry stay out of portable files and imported alerts are not replayed.
- Ownership search review covers selectable alliance/corporation names, logos and EVE IDs, preserving assigned identities without treating them as formal sovereignty.
- Browser acceptance covers the pilot roster, source selection, map configuration, scoped scanner/navigation, empty-map creation, public-report target-map adoption, immediate private/public expiry, permanent edge removal, system-only Undo, owner selection and existing interaction/layout coverage. Final TypeScript, production-build and browser results are recorded with the draft test build.

Existing maps migrate automatically. System locks and the 30-minute disconnected-system grace remain, including a fresh grace after unlocking/restoration. Dead connections and their associated records are deliberately removed. The draft PR supplies the successful exact-commit Actions result and standalone ZIP; main remains unmerged.

## Universe 0.8.0-rc.11

Focused corrections update the requested connection presets and defaults, continuous curves, unified system details, diagram cleanup, manual J-Space dominion and public-feed refresh continuity.

- All 478 Node tests pass. Lifetime tests cover fractional 4.5h, all six presets, default 16h/Normal/L, explicit resets versus unrelated edits, ship-size mapping and import-age preservation.
- Deterministic lifecycle checks cover the last connected edge, expiry/deletion, lock protection, fresh grace after unlocking/manual restoration, reconnection, archived metadata/ownership, signatures/notes/reports/passages and native round trips. Never-connected standalone nodes remain; cleanup only removes diagram membership.
- A held-provider refresh test keeps cached public cards/IDs present and in place while stale, with no routing eligibility. The completed snapshot updates modified reports and adds/removes endpoints without clearing the whole network.
- The compiled J-Space browser suite passes 24 acceptance/layout groups with no browser errors; desktop and 390px captures were inspected. Browser checks exercise the single persistent system-details host across all six tabs, assigned owner text on the card, corrected quick controls and defaults, solid strokes, scanner cancellation, route-draft invalidation and desktop/390px layout. Tab/system switches reset panel scroll; background refresh preserves it. The selected tab is restored per pilot when returning from K-Space.

Application TypeScript and production compilation pass. Exact-commit Actions runs the wider Universe/replay suite, Sessions suite and extracted standalone tests before the draft PR advertises its download. Existing data requires no reset; main remains unmerged.

## Universe 0.8.0-rc.10

This focused J-Space pass reclaims window space, adds qualitative connection life/mass controls, improves card status/sovereignty and fixes zoom-level card rendering.

- All 471 Node tests pass. Application TypeScript and production compilation pass. Regressions cover conservative lifetime bounds, mass-only observation-age preservation, legacy full-record edits, native round trips and whole-card fit geometry.
- The compiled J-Space browser suite passes 23 acceptance/layout groups with no browser errors. Desktop and 390px captures were inspected. Coverage includes sidebar width recovery, dominant graph height, 390px fitting, complete card rendering across zoom, status gradients, sovereignty on exit cards, right-click lifetime/mass persistence, independent border/fill colours and system context links. Existing pointer drag, keyboard connections, scanner, passage, public-report and pilot-isolation checks remain in the same suite.
- Right-click menus leave the detailed workbench closed, preventing it from covering quick actions. Ordinary edits retain exact expiry; a newly observed band can shorten an earlier bound but cannot renew it or confer confirmation/access. Qualitative bands are observations, not precise collapse predictions.

Existing data requires no reset. The draft PR provides the exact-commit Actions result and downloadable standalone ZIP after its combined Universe/replay, Sessions and extracted-package gates pass. No merge into main is authorized.

## Universe 0.8.0-rc.9

This pass simplifies and styles **J-Space only**: permanent chain search, direct card badges, immediate observed-status/role and connection condition controls, a visible scanner composer, and scoped Undo for diagram removal. Shared tool navigation uses one dock, while K-Space retains its existing interface and workflow.

- All 466 Node tests pass. TypeScript and production compilation pass.
- The compiled J-Space browser suite passes 21 acceptance/layout groups with no browser errors. It covers direct partial scan updates, explicit complete-scan review, cancellation of delayed validation when leaving Scanner, and notebook context for systems outside the private chain. It also verifies one-click status/role changes, exact expiry and route-trust preservation, node/edge/group removal with canonical records retained and real Undo, compact card metric bounds, direct notes/reports, and desktop/390px layouts.
- Existing real-pointer drag/connection tests, queued save responsiveness, keyboard gestures, reduced motion, scanner linkage/restoration, observations, passage records, migration, pilot isolation, public report expiry and navigation invalidation remain covered. Desktop and narrow captures were inspected. Collapsed/public conditions use compact read-only tiles; collapsed quick edits cannot rewrite historical expiry.
- Review caught and fixed a delayed scanner import after unmount, a refresh request-epoch collision, and overlapping or incorrectly replaced shared-tool context. Ordinary quick connection patches preserve recorded expiry, observation age and verification/access. Diagram-removal Undo is bound to the exact pilot, map and revision; canonical changes retain their existing distinct history semantics.

The exact-commit GitHub Actions test-build gate runs the combined Universe/replay suite, Sessions browser suite and 466 extracted-package tests before publishing its downloadable ZIP. See the draft PR for the successful run and artifact. No live EVE waypoint commands are issued by synthetic verification. Existing data requires no reset; no merge into main is authorized.

## Universe 0.8.0-rc.8

This pass addresses direct manipulation and readability in the J-Space chain: compact class/name/static cards, visible connection handles, immediate pointer tracking, and shorter contextual copy. J-Space opens directly into its chain; K-Space retains Journey and connection-network management.

- All 466 Node tests pass. New regressions cover unknown-lifetime connections and explicit confirmation, queued position revisions, pilot/map scope cancellation, connection targets, and legacy J-Space navigation state.
- TypeScript and production compilation pass. The focused compiled J-Space browser run passes 14 acceptance/layout groups with no browser errors. It verifies real pointer motion within two animation frames before release, a second saved drag while the first response is delayed, visible handle previews/pending state, pointer and keyboard connection creation, cancellation and invalid drops, exact C1/P060 and C3/C247 badge mappings, and unchanged saved itineraries.
- Existing scanner reconciliation, signature restoration/linkage, passage records, observations, native/Wanderer import/export, pilot isolation, nearest exits, public report age/expiry and restored-route invalidation remain covered by that browser run. Desktop and 390px captures were inspected; narrow-screen fitting accounts for the readable overview labels and their handles.
- Direct manipulation updates only moved cards and their incident SVG paths during pointer input. Geometry and position persistence settle on release; rejected or superseded saves cannot overwrite a later gesture. Pilot/map changes invalidate old gesture scopes. This is a focused responsiveness check, not a frame-rate guarantee for every graph or device.

The full combined Universe and Sessions browser suites and standalone packaged-runtime tests remain required gates in the exact-commit GitHub Actions test build. The draft PR links the successful run and downloadable artifact. Synthetic fixtures issue no live EVE waypoint commands. Existing maps, settings and history require no reset.

## Universe 0.8.0-rc.7

This candidate separates K-Space and J-Space in the Universe navigation category and adds a dedicated chain workspace. The [Wanderer matrix](WANDERER-INTEGRATION.md) and [51-workflow inventory](WANDERER-WORKFLOW-INVENTORY.md) distinguish implemented parity, Kairo additions, local adaptations and remaining gaps.

- All 457 Node tests pass. New coverage includes the complete supplemental wormhole reference, exact J225111 statics, CCP effect corrections, private chain persistence and revisions, canonical signature/connection linkage, age-preserving import/duplication, reviewed passage tracking, localized scanner/bookmark formats, destination routing, saved-navigation invalidation and a freshness clock that cannot be postponed by repeated edits.
- TypeScript and production compilation pass. The Sessions browser suite retains nine cards, four visits, three buffered visits, 135 events and 390–1600px layout coverage.
- The isolated compiled J-Space suite passes ten grouped workflows with no browser errors: class/static/reference cards and symbol explanations; persisted drag/group/lock/keyboard layout and undo; canonical scanner reconciliation, bookmark text and deletion restoration; two-sided connection conditions and mass ledger; structures, timers, field notes and expiring local rallies; native/Wanderer import/export; pilot isolation and remembered workspaces; 390px layout; constrained nearest exits; attributed public overlays and explicit adoption; and stale-route rejection after closing/reopening or remounting navigation. Several related tasks share one group.
- Desktop overview, framed/selected cards, reference detail, public connections, scanner, passage ledger, exit finder and mobile captures were inspected. Final visual corrections address first-load framing, readable compact labels, class/static badge fit, toolbar/minimap CSS collisions and edge captions obscured by intervening cards. Public controls and group selection now share normal layout flow instead of competing fixed positions. The graph uses crisp SVG connections and HTML cards, finite camera transitions, reduced-motion support and viewport-edge fading. These focused checks are not a complete accessibility audit or a guarantee for every graph size and device.
- Final review corrected the exit finder's critical-lifetime guard: both EOL and critical lifetime require the end-of-life opt-in; critical mass independently requires its mass opt-in. Actually expired connections remain excluded with either or both options enabled. Other regressions prevent unrelated edits from renewing connection/signature ages, imported links from acquiring route trust and an old saved route from reappearing over a newly selected destination.

The browser fixtures use isolated synthetic pilots, scans, reports and passages. They do not issue live private EVE waypoint commands or establish complete traffic, remaining mass, access or safety. Static badges are expected destination classes, never current scanned endpoints. Hosted shared-map collaboration, remote ACL/invitations and webhook services are not implemented; the matrix also records narrower operational differences such as manual branch naming and portable-format limits. Existing local history and settings require no reset. This remains a draft feature-branch candidate for in-app review, not a merge into main.

## Universe 0.8.0-rc.6

This candidate puts public hub connections and contextual actions directly on the map. Thera rings and Turnur diamonds mark actual reported entrances, network framing respects the current space/region scope, and hover, click/tap and keyboard access share the same symbol model. J-Space presents systems, wormhole classes and connection context rather than internal EVE regions.

- All 391 Node tests pass. Seven new portal-model tests cover hub identity, direction/signatures, duplicate reports, malformed endpoints, source freshness, incomplete scans and expiry. Four presentation tests cover J-Space search/context and known-system discovery without losing K-Space region navigation.
- TypeScript and production compilation pass. The Sessions browser suite retains its nine-card, 135-event and 390–1600px layout checks.
- The compiled Universe suite passes 44 acceptance/layout groups. New checks exercise actual entrance-symbol mouseover without camera/dock changes, click/tap pinned details, keyboard selection and Escape focus, native type-limit expansion within the canvas, a 390px card, route-draft actions without saved-itinerary changes, stale warnings, timed expiry and pinned pilot-card dismissal when its layer is hidden.
- J-Space checks confirm that system search and discovery context remain while region navigation, grouping and internal geography disappear; K-Space region controls remain available. Existing political paint, routing, exact SMT import, operational notebook, detached-window updates and historical replay checks continue to pass.
- Desktop portal overview, hover, pinned details, mobile context, J-Space and legacy workflow captures were inspected. Rounded label outlines, viewport-edge fading, reduced motion and hidden-page camera pause remain intact. A three-second idle sample recorded zero canvas redraws and about 9 ms of renderer tasks. These are focused local checks, not a full accessibility audit or hardware guarantees.

Map context never calculates a route or sends EVE waypoints implicitly. Destination actions prepare the navigation form; public shortcuts remain opt-in. Source observations, nominal wormhole limits and remaining mass retain their existing distinctions. Tests use synthetic observations, not private live EVE commands. Existing history and settings require no reset. This remains a draft feature-branch candidate awaiting the user's review.

## Universe 0.8.0-rc.5

This candidate integrates SMT-reviewed navigation, local intelligence and exploration workflows into the existing Universe workspace, with EVE-Scout Thera/Turnur details and public operational signals. The [feature matrix](SMT-INTEGRATION.md) distinguishes workflow parity, Kairo improvements and browser adaptations; the [source audit](SMT-SOURCE-AUDIT.md) records provider contracts and attribution.

- All 380 Node tests pass in the workspace and extracted standalone ZIP without development dependencies. New coverage includes exact SMT Ansiblex and infrastructure formats, gate/capital itineraries, live rule restrictions, waypoint mutation semantics, local log rotation and encoding, canonical location/progress, fleet permissions, private intel and alerts, signatures, public-feed cache/expiry/mass semantics, FW classification and HTTP session/CSRF/OBS isolation.
- TypeScript and production compilation pass. The existing Sessions browser suite passes its nine-card, 135-event and 390–1600px layout checks.
- The compiled Universe suite passes 39 acceptance/layout groups. It exercises configured/inferred territories and actual paints; gate and capital planning; the user's exact 22-direction Ansiblex list (11 reciprocal pairs) and compatible export; legacy CSV imports; private intel/alerts/fleet; EVE-Scout report promotion with exact expiry and nominal limits; public-source filters; complete/partial/malformed scanner previews; infrastructure import/export; mobile notebooks; and physical/schematic/two-hop radar views.
- The detached tactical popup retains the same canvas, selection and camera. A fresh private report arrives through SSE while the parent document is simulated hidden, and restoring the map retains the adjusted camera. Historical replay excludes current operational overlays and continues to omit routine entry/OPSEC event cards.
- Canvas instrumentation verifies zero bitmap influence draws or radial system glows, rounded 2.5px text outlines and matching fill/outline opacity. A label moved to 26px from the viewport edge fades to approximately 0.48 opacity instead of disappearing or changing anchor. Four focused label tests cover the underlying geometry.
- Desktop, 390px notebook, political, route, intel, infrastructure, tactical-window and replay screenshots were inspected. The final visual pass corrected an absolute-position CSS collision in the intel status row and separated adjacent signature actions. Sampled primary text remains at least 16px and supporting text at least 14px, with sampled contrast exceeding 4.5:1. Reduced-motion and hidden-page camera checks pass. A three-second idle sample recorded zero canvas redraws and about 10 ms of renderer tasks; these are focused local checks, not a full accessibility audit or hardware guarantees.
- The full browser pass also caught and corrected lifetime-edit precedence: an explicit wormhole duration overrides an echoed old expiry, while ordinary edits preserve exact reported expiry, including already-expired records. The composed HTTP regression covers four-hour, immediate-expiry and invalid-duration requests.

Automated fixtures make no external ESI or login requests. No private live EVE waypoint command, authenticated fleet response or structure discovery was performed for parity verification. The user's actual permissions, Windows log paths, browser notification/audio support and live operational use still require in-app review. Public observations and nominal mass remain incomplete evidence, not guarantees of access or remaining mass. Existing local history and settings require no reset. This remains a draft feature-branch candidate awaiting the user's review.

## Universe 0.8.0-rc.4

This candidate makes the immersive map workspace Universe's default layout. It adds direct territory exploration, regional holdings, real stargate frontiers, unified search, route endpoints and framing, an interactive overview, bounded drag inertia and touch pinch navigation.

- All 264 Node tests pass. New political-atlas checks cover observed ownership, configured/inferred membership validity, full-roster colours, regional aggregation, unique real gate frontiers, missing activity and stale provenance. New navigation checks cover cursor anchoring, wheel accumulation, pinch bounds, finite drag coast, overview footprints and projected-distance scales.
- TypeScript and production compilation pass. The existing Sessions browser suite passes its nine-card, event pagination, legacy report and 390–1600px layout checks.
- The compiled Universe suite passes 32 acceptance/layout groups. Checks cover the default desktop/mobile workspace, preserved canvas and camera when toggling details, overlay placement and focus restoration, keyboard search, actual polygon selection, complete territory framing, regional totals, real frontier endpoints, route shortcuts, overview navigation, touch pinch and bounded inertial panning. Existing settings, palette, privacy, space bounds and replay checks continue to pass.
- Desktop, narrow-screen, political, settings and replay captures were inspected. Sampled primary text remains at least 16px and supporting text at least 14px; sampled contrast exceeds 4.5:1. Motion draws intermediate positions, reduced-motion navigation settles immediately, and simulated hidden-page motion pauses. A three-second idle sample recorded zero canvas redraws and about 14 ms of renderer tasks. These focused local checks are not a full accessibility audit or hardware guarantees.

Political shares count observed owned systems rather than map area. Frontiers establish gate adjacency, not diplomacy. Activity describes events in those systems, not actions attributed to their owners; unavailable observations remain unknown. The fixtures are synthetic and do not establish live coalition accuracy. Existing saved settings and historical data require no reset. This candidate remains on the draft feature branch for the user's review.

## Universe 0.8.0-rc.3

This candidate raises Universe's map and simplifies its command area, enlarges controls and inspector text, adds finite navigation/replay transitions, and assigns distinct territorial colours with fixed empire shades.

- All 246 Node tests pass. New palette checks cover 1,200 owners plus blocs, input-order stability, reserved empire colours, unique fills/outlines, readable outlines for dark custom colours, legacy conflict handling and reuse of unchanged palettes.
- TypeScript and production compilation pass. The existing Sessions browser suite passes its nine-card, event pagination, legacy report and 390–1600px layout checks.
- The compiled Universe browser suite passes 26 acceptance/layout checks, including map-first desktop framing, 16px primary and 14px supporting text, sampled text contrast of at least 4.5:1, smooth camera movement, reduced motion and simulated hidden-page cancellation. These are focused checks, not a complete accessibility audit.
- Canvas instrumentation checks actual configured, inferred, independent and unassigned territory paints against the shared palette, including all four empire shades. It also checks vector borders without bitmap influence draws or radial gradients. Settings checks cover unused new-bloc colours and disabled conflicting colour choices.
- Desktop and mobile map, settings and replay captures were inspected. Smooth zoom/focus produced intermediate positions across roughly 0.5/0.74 seconds; reduced-motion zoom produced one position. A three-second idle sample recorded zero canvas redraws and about 12 ms of renderer tasks. These local timings are not hardware guarantees.

The fixtures use synthetic pilots, sovereignty and combat evidence. They verify rendering and application behaviour, not live political accuracy. Configured memberships remain authoritative; unchanged saved settings and historical data require no reset. This candidate remains on the draft feature branch for the user's review.

## Universe 0.8.0-rc.2

This candidate adds configured power blocs, an explicitly uncertain inferred fallback, vector political borders, separate space tabs and a more readable Universe/replay interface.

- All 236 Node tests pass, including configured/independent precedence, duplicate evidence, sustained hostility, ambiguous relationship bridges, inference expiry, bounded ingestion, cached reads, settings revisions, verified alliance lookup, session/CSRF enforcement and stream isolation.
- Twelve map geometry/camera checks cover invariant ownership under filtering, shared boundaries, disconnected holdings, minimum zoom, edge bounds and resize behaviour. The territory partition runs in a worker and is reused while panning and zooming.
- TypeScript and the production build pass. The existing Sessions Chrome suite passes its nine-card, pagination, report and 390–1600px layout checks.
- The compiled Universe suite passes 22 acceptance/layout checks: bloc creation, colour selection, explicit move to independence, save/reopen, remaining inferred fallback, both space tabs, bounded zoom, routes/connections, replay event filtering and smooth camera follow. Desktop and 390px settings, atlas and replay screenshots were inspected; key body/control text is 14–15px or larger.
- A dense synthetic sovereignty fixture verifies grouped borders while preserving four distinct owner-dot colours. Fit and zoom screenshots were inspected. The instrumented redraw recorded vector fills/strokes with zero bitmap influence draws and zero radial gradients. A three-second idle sample recorded zero canvas redraws and about 6 ms of renderer tasks; this is a focused local measurement, not a hardware guarantee.

Inference uses a bounded sample of locally collected pilot/session killmails. These checks establish implementation behaviour with synthetic evidence, not real-world coalition accuracy or complete New Eden coverage. Configured memberships remain authoritative, and the feature does not alter OPSEC, standings or transit access. This remains a draft candidate awaiting the user's review.

## Universe 0.8.0-rc.1

This candidate adds a complete local SDE atlas, independent Sessions navigation and session-bound map replay. Validation includes every bundled system detail and gate reference, exact EVE distance units, local graph routes, source freshness/standings, pilot isolation, CSRF, dynamic-connection expiry/access, session event boundaries and legacy gaps. Live authenticated structure access and the user's own imported network require in-app review.

- Backend: 203 tests passed in the workspace and extracted standalone ZIP, including static checks across all 8,490 systems and session recording with Universe disabled.
- Existing Sessions browser suite passed: nine report cards, full event pagination, legacy sessions and 390–1600px layouts.
- Universe core browser checks passed: full public atlas, system search, pan/zoom, named views, standing filters, real local routes, private connection/pin isolation, import/toggle/delete, wormhole expiry and 390–1600px layouts.
- Session replay browser checks passed: report → Show on Map, playback/pause, time and event scrubbing, measured intermediate camera positions during smooth follow, manual drag/resume, event popups, mobile layout and clean exit. The combined Universe/replay harness has 15 acceptance/layout checks and made no external ESI requests.
- Idle map sample (three seconds): zero canvas redraws; about 6 ms of renderer tasks. This is a focused idle sample, not a claim about every computer or playback workload.
- Route timings and dataset provenance are recorded in [UNIVERSE-ROUTING-VALIDATION.md](UNIVERSE-ROUTING-VALIDATION.md) and [UNIVERSE-DATA.md](UNIVERSE-DATA.md).
- The feature-branch GitHub Actions build repeats type checking, compiled-browser checks, packaging and the backend suite against the extracted ZIP without development dependencies.

The browser harness uses synthetic pilots and records. No instrumentation is included in the production runtime. This candidate still awaits the user's human review and is not merged into main.


## Completed

- Successful production/static export with the retained Vinext build workflow.
- Release ZIP includes compiled assets and source, excludes dependencies and local credentials/data. CI runs the Node suite again from the extracted package without an npm install.
- Application TypeScript check using `tsconfig.kairo.json`.
- 144 passing Node tests, including four session-summary checks and fifteen new alliance-classification/feed-lifecycle regressions:
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

## Added in 0.7.2

- The Sessions browser fixture includes both populated sessions and the reported mixed legacy state: ship images, a long route, valued personal kills and a wallet change alongside missing alliance/LP baselines.
- Browser assertions compare card borders and heading/preview/footer positions at 1600, 1024 and 820px. They also check full-width expanded panels, 390px wrapping, LP cells, disclosure state and keyboard focus restoration.
- Summary assertions check the six recorded values for populated and legacy sessions, missing-alliance/LP and delayed-estimate labels, its position above the activity cards, and aligned tiles without horizontal overflow. Four focused tests cover unique personal/alliance killmails, combat ranking, total time across return visits, stable ties and missing observations.
- All 144 Node tests pass locally and from the standalone ZIP in the [approved review workflow](https://github.com/BunBajiro/kairo/actions/runs/34823930536), which also passed TypeScript, production compilation and Chrome checks. All nine captured screenshots were inspected, including aligned populated and legacy cards, the live summary, full-width details and mobile LP rows. The downloaded package matched the Actions checksum and reviewed source files.
- New regressions cover exclusive alliance sides, friendly attackers, unequal destroyed/lost totals, raw v0.7.1 record reuse and full personal participation in alliance totals. The browser fixture renders a friendly-fire loss and checks that its value appears only under lost ISK.
- Thirteen feed/lifecycle tests cover the two-minute cadence, shared cursor and restart, live-only targets, ending during a request or spacing delay, other live pilots, paused combat, unrelated packet filtering, ESI verification, duplicate packets, bounded/oversized/malformed responses, 404/429 delays, shutdown, end-triggered cached rechecks, all recent sessions and the exact 24-hour cutoff, including in-flight work.
- Browser checks now distinguish live, ended and archived sessions, show delayed checks after ending, and retain archived status after manual refresh. Public R2Z2 sequence/packet responses were inspected successfully; an actual long-running player session remains a human review check.
- Visual review caught clipping during a window resize. Sessions now disables the dialog's width transition, and the browser check requires both dialog edges to remain inside the viewport. It also explicitly confirms that personal kills and losses remain included in alliance totals; deduplication is confined to the most-active-system ranking.
- On 14 September 2026, the user approved merging v0.7.2 after receiving the reviewed build and requested the final release ZIP. See [PR #3](https://github.com/BunBajiro/kairo/pull/3) for the verification results and approval record. This approval is separate from the automated checks above.

## Added in 0.7.1

- Twelve Sessions regression tests cover all visits (including quiet and repeated visits), exact presence boundaries, buffer qualification before expansion, overlapping windows, deduplication, independent alliance sides and missing/zero valuations.
- Ships of the same hull retain separate changes. Personal public valuations enrich earlier ESI records without duplicate activity events.
- Per-corporation LP accounting includes spent/removed balances, missing snapshots, first-sample reconciliation, persistence and uncertainty across adjacent sessions.
- The collector is tested against supported system/month requests, UTC month/year boundaries, cached repeat requests, resumable detail budgets, character isolation, rate-limit failures and retained historical totals.
- Legacy session data remains readable, and the new SQLite migration runs only once.
- Type checks, production compilation and all 125 Node tests passed locally and in [GitHub Actions](https://github.com/BunBajiro/kairo/actions/runs/34765639230), including from the extracted standalone ZIP without source dependencies.
- The Chrome smoke test passed for nine overview cards, opening/closing details, four visits including a quiet transit, three qualifying combat badges, per-corporation LP, 100-to-135 event pagination, persisted names/notes, Enter/Escape controls and legacy reports. No uncaught browser exceptions occurred.
- Five captured screenshots were visually inspected at 1600×1050 and 390×844. The report stacks its cards on narrow screens, and the LP table scrolls within its card. The fixture uses synthetic local data; it does not validate live EVE collection or the user's machine.
- On 13 September 2026, the user reviewed the test build, asked about missing new data in legacy sessions and approved merging once that expected limitation was confirmed against the implementation. This approval is separate from the automated checks and screenshot inspection.

## Added in 0.7.0

- Five additional Import Analyser tests cover buyer defaults and validation, separate buyer order coverage, zero immediate-purchase fees, refresh behavior and saved-plan attribution.
- Application type checks, compilation and all 113 tests passed in GitHub Actions, including tests run from the extracted test build without source dependencies.
- The user downloaded the feature-branch build, confirmed it worked and approved merging and publishing the release.

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
- Comprehensive live-session and browser coverage beyond the user's review of the v0.7.1 and v0.7.2 test builds. Automated browser coverage uses synthetic Sessions and Universe fixtures; it does not replace long-running player sessions.
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
