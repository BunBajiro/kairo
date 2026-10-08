# Changelog

Notable changes to Kairo, listed newest first. Completed changes for the next release are collected under **Unreleased**.

## Unreleased

### Changed

- Consolidates current user/developer documentation, adds the internal API and HTTP/event guides, and removes superseded research/review notes from the application docs while preserving their originals in the analysis archive.

## 0.8.0-rc.17 — Optimisation and refactoring development

- Refactors shared work across Kairo, including existing services beyond the Universe sprint. Clean RC17 review remains withheld until the optimization and refactoring findings have evidence-backed closure.
- Loads the Maps library through compact summaries and the opened map through selected detail. Request-scoped reads share canonical links and operational records; signature bindings use one edge pass, and overlapping browser refreshes are coalesced.
- Prepares route evidence and graph/spatial indexes once per itinerary, reuses them across legs and validates relevant evidence and connections again before saving the result.
- Retires the standalone Journey log, lifetime visit counters, footprint preset and visit overlay. Sessions owns new operation travel, preserving reports, combat and replay. Discovery, ordinary activity and OBS notifications remain independent; existing records and exports are retained without a reset.
- Adds independent K-space/J-space node sizes, collapsible geographic/custom display groups and **Focus-based map detail**, **off by default**, under **Universe settings → Mapper preferences**. Browser-local preferences and saved group membership preserve canonical map geometry and connections.
- Shares source preparation across Goals and widget bindings, resolves repeated asset containment paths once per batch and avoids rewriting identical combat records. Unchanged widget projections no longer rebroadcast the same state.
- Drains accepted requests, dataset enrichment, semantic subscribers and worker shutdown before releasing their dependencies. Session ownership is captured before slow metadata lookup, preventing delayed observations from moving into a later Session.
- Handles large dashboard event frames with ordered, drain-aware writes and bounded waiting work. Blocked OBS clients fail closed when protection engages. SDE activation/recovery, OPSEC rules and shared ESI cache, priority and rate-limit policies remain in place.

## 0.8.0-rc.16 — Automatic static-data updates

- Checks CCP's SDE metadata at startup and hourly with conditional requests, cache deadlines and retry backoff. One updater serves the application; maps do not poll for SDE updates.
- Prepares Universe, celestial details, market categories and NPC ownership from one official export in a background worker. No Python or extra runtime installation is required.
- Activates a validated dataset through a controlled core restart, preserving browser sessions, open pages and unsaved forms. Update, rollback and ordinary disconnect notices are distinct.
- Adds **Settings → Datasets** with versions, release/update dates, progress and manual controls. Bundled Wanderer and SMT references retain their own provenance.
- Removes temporary downloads and failed staging files. Retires previous generations after successful activation; restores the prior dataset if startup fails. Concurrent launchers cannot disturb an update.
- Preserves saved maps, notes, pilots and other user data.

## 0.8.0-rc.13 — Reliable travel and clearer map entry

- Fixes automatic K→J, J→J and J→K mapping with normal ESI cache refresh intervals. Both K-Space endpoints are displayed; new connections use 16h/Normal/L without resetting existing timers.
- Restores a map landing with existing maps and Create New Map. The read-only Live source is available only through settings.
- Uses one floating creation form for name, description, at least one tracked pilot and optional scope, including creation from the source. Tracking is automatic for selected pilots; source copies retain their remaining lifetime.
- Separates Structures, Timers and Field reports, with distinct icons and counts. A structure with an attached schedule remains a structure.
- Shows structure counts on system cards, hides zero-count indicators and removes the decorative chain icon from connection labels.
- Prefills Observation time with current UTC for new records, preserving the original timestamp on ordinary edits. Expiry remains optional.
- Consolidates system right-click detail shortcuts into one System details action, keeping distinct map and external actions separate.
- Keeps recorded J-Space entrances, internal travel and exits visible in session replay, including rewind, using historical visits independently of live maps.
- Restores current sovereignty shading in K-Space replay. The pilot-location readout shows ownership captured at the visit when available; older visits without a capture remain explicitly unrecorded.

## 0.8.0-rc.12 — Independent maps and live tracking

- Deletes expired, collapsed and manually removed wormhole connections immediately, including their connection notes, passage records, bound signatures, cached routes and undo copies. Connections have no archive or lock; system data and its 30-minute grace period remain.
- Gives each J-Space map independent system annotations, signatures, intel and connections. Existing maps migrate into separate instances; new maps never import visited-system history.
- Adds a per-map pilot roster with tracking enabled by default and explicit pause/resume. One tracking service distributes existing live location samples to subscribed maps, without additional ESI requests or per-map polling.
- Adds a lightweight, read-only Live source for the active pilot. It records current observed topology without system notes, scanner records or passage history, using existing location samples without extra polling.
- Configures map population by systems, K-Space constellations/regions, sovereign alliances/corporations and user-defined power blocs. Selections combine with OR; matching live chains populate independent map instances, including when a later exit establishes the match. This controls population, not visibility of saved cards.
- Requires fresh, complete sovereignty for owner-based scope matches; inferred coalitions and manually assigned J-Space dominion never stand in for sovereignty.
- Copies live source chains with independent default annotations and connection conditions, preserving their original observation age and remaining lifetime. Dead topology and visited-system history are never imported.
- Keeps deleted connections and removed cards absent during unrelated backfill; fresh traversal can discover them again without retaining deleted connection records.
- Adds effective-owner name search with alliance/corporation logos and EVE IDs in selectable results.
- Keeps explicit Kairo/Wanderer imports and copies map-local; expired connection data is omitted rather than revived. Native exports preserve map reports and infrastructure with independent imported IDs, without exporting live pilot telemetry or replaying alerts.

## 0.8.0-rc.11 — Clearer chain workflows

- Uses lifetime presets 1h, 4h, 4.5h, 16h, 24h and 48h; mass Verge/Half/Normal; ship sizes S/M/L/H/XL. New links default to 16h, Normal and L while routing verification remains explicit.
- Draws continuous solid connections, retaining lifetime borders and mass fill colours.
- Unifies detailed system work in one System/Scanner/Reports/Notes/Navigate/Intel panel.
- Archives unlocked disconnected cards after 30 minutes, preserving their user data and metadata for rediscovery. Unlocking or manually restoring a card grants a new 30-minute grace period.
- Adds manually assigned alliance/corporation dominion to J-Space cards.
- Keeps unexpired public Thera/Turnur reports visible during refresh, with stale status and stable positions; successful snapshots reconcile added, changed and removed reports.

## 0.8.0-rc.10 — More room for the chain

- Gives J-Space the available application viewport, with tighter gutters, compact pilot controls and a clear sidebar collapse/restore action.
- Replaces split zoom-level card rendering with a single complete card, removing blank overlapping rectangles and abrupt loss of card content.
- Adds observed lifetime bands (less than one day, eight hours or four hours) to connection quick menus and details. Life controls the outer line colour; mass controls the inner colour. These reports remain uncertain upper bounds, not exact disappearance times.
- Tints system-card gradients by observed status and shows concise sovereignty on K-Space exit cards.
- Adds direct system context links to zKillboard and to the K-Space atlas for known-space systems.
- Preserves verification/access boundaries, existing data and the draft-only review workflow.

## 0.8.0-rc.9 — J-Space at a glance

- Puts system search directly in the chain toolbar, with one action to add a new card or frame an existing one.
- Gives J-Space a stronger visual identity, with clearer class/static hierarchy, quieter cartographic depth, condition symbols and direct scanner/observation/note badges on cards.
- Adds immediate observed-status, home/staging and connection mass/life controls beside the map. Ordinary condition updates preserve expiry and route trust.
- Removes diagram cards and connections immediately with a scoped Undo action, including group removal. Shared routing disable and whole-map deletion remain separate deliberate operations.
- Opens scanner paste and signature rows directly in J-Space. Valid partial scans update in one action; complete scans and diagnostics retain review. Removes K-Space Infrastructure tools from this notebook.
- Consolidates repeated headers and gives shared tools a consistent Scanner/Navigate/Intel/System strip. Existing maps and history remain available without a reset; K-Space workflows are unchanged.

## 0.8.0-rc.8 — Direct chain interaction

- Makes card movement track the pointer directly, including connected lines, and queues release-time position saves so another drag does not wait for the previous response.
- Adds visible drag-to-connect handles, live connection previews and keyboard connection creation. Drawn links start unconfirmed with unknown expiry and no route access.
- Compacts system cards around class, name and static destination classes. Hole codes move to concise hover/focus detail; secondary information remains in the inspector.
- Removes Journey and Ansiblex management tabs from J-Space, retaining the K-Space tools and shared notebook/navigation. Legacy J-Space tab state opens the chain.
- Trims repeated explanatory copy and keeps decision-relevant trust, expiry and error states. Existing maps and history are retained; no data reset is required.

## 0.8.0-rc.7 — J-Space chain workspace

- Splits Universe into separate K-Space and J-Space navigation entries, with independent remembered workspace state and legacy link compatibility.
- Replaces the live J-Space discovery canvas with readable system cards and editable named chains: class, statics, effects, saved layouts, locks, aliases, status and contextual actions.
- Bundles attributed offline references for 2,604 wormhole systems and 100 hole types, including documented corrections against CCP data. Expected static types never become live routing edges.
- Adds connection conditions and linked scanner signatures, manual and reviewed sampled passage ledgers, observations/timers, field notes, map activity, undo, duplication and Kairo/Wanderer version-1 import/export, with explicit format limits.
- Extends scanner support to four languages and optional anomalies, configurable bookmark text and safe recently-deleted signature restoration.
- Adds graph-based nearest exits and services using confirmation, expiry, vessel and routing restrictions. Preserves recorded ages and separates public reports from private confirmation.
- Retains the existing K-Space political atlas, EVE-Scout integration, Sessions and replay. No local data reset is required. See the Wanderer coverage matrix for the local operational scope and remaining remote-collaboration differences.

## 0.8.0-rc.6 — Connections on the map

- Brings Thera and Turnur reports onto their actual map entrances with distinct symbols and source-aware network focus.
- Adds contextual explanations for map symbols on hover and pinned details on click/tap, with keyboard access and direct system/destination actions.
- Keeps map context and camera stable during inspection; network framing and selection use finite motion with reduced-motion support.
- Presents J-Space through systems, wormhole classes and connections, removing internal region/constellation groupings from navigation, search, details and notebook context.
- Retains exact expiry and source-age distinctions, keeps current reports out of replay, and preserves existing local data.

## 0.8.0-rc.5 — Operational Universe

- Integrates SMT-inspired intelligence, pilot/fleet context, signatures, infrastructure notes, tactical map projections, itinerary and capital planning into the normal Universe workspace.
- Accepts unmodified SMT Ansiblex lists with comments, `0` structure IDs, directed entries and reciprocal endpoints; previews errors before atomic import and exports compatible lists.
- Integrates EVE-Scout Thera/Turnur connections and wormhole type details, with source age, expiry, routing limits and explicit private confirmation. Uses its structured storm API instead of webpage scraping.
- Adds attributed historical reference markers, public sovereignty campaign/development context, opt-in bounded public combat observations and correctly labeled NPC window changes.
- Adds optional local EVE log ingestion, private alerts, scope-aware fleet collection and explicit EVE waypoint export. Replays and OBS output exclude current private operational overlays.
- Adds smooth viewport-edge label fading and thinner rounded text halos, removing pointed outline artifacts over territory fills.
- Preserves existing local history and settings. This remains a draft review candidate; detached tactical windows use browser capabilities, while native Windows tray/global-hotkey/click-through behavior is not duplicated.

## 0.8.0-rc.4 — Explore the political atlas

- Added an immersive map workspace, linked territory selection and richer regional context.
- Made political territories directly explorable, with framing, regional holdings and neighbouring stargate connections.
- Added fluid drag and touch navigation, a map overview and route framing while retaining bounded views and reduced-motion support.
- Unified local search across systems, regions and political territories with keyboard navigation.
- Preserved unique territory colours, configured membership precedence and the explicit uncertainty of inferred groups.

## 0.8.0-rc.3 — Immersive Universe and distinct territories

- Reshaped Universe around a larger map with a compact command area, clearer contrast, larger type and visual system/bloc cards.
- Added smooth navigation and finite selection, view and replay-event transitions. Reduced-motion preferences are respected, and map rendering settles when idle.
- Reserved Caldari blue, Gallente teal, Amarr gold and Minmatar rust for their factions. Distinct political territories receive unique colours; configured colour conflicts are flagged.
- Kept crisp vector borders, actual sovereignty ownership, inferred-membership provenance and all existing routing, discovery and replay tools.

## 0.8.0-rc.2 — Power blocs and Universe readability

- Added user-configured power blocs in Settings → Universe, with named colours, alliance membership and explicit independence. Configured memberships take priority over inferred groups.
- Added an evidence-based inferred fallback from locally collected combat records, showing coverage and uncertainty without changing standings, OPSEC or connection access.
- Replaced the soft territory raster with crisp vector segments, removed per-system glows, and preserved territorial ownership when filtering visible systems.
- Bounded zoom and panning to the active space, with separate K-Space and J-Space tabs.
- Increased Universe and replay readability with larger text, clearer controls, visual summaries and political legends.
- Removed routine system-entry and OPSEC events from replay presentation while retaining recorded movement and session history.

## 0.8.0-rc.1 — Universe review build

- Replaces the earlier New Eden lookup and Journey atlas with the full offline New Eden map, sovereignty territories, selected-pilot standings, configurable layers and saved views.
- Adds local gate routing, pilot-specific imported/manual Ansiblex networks, confirmed expiring wormholes, persistent discoveries and physical XYZ jump planning.
- Adds system details, static celestials/NPC stations, public sovereignty structures, structure visibility checks, incursions, industry/mining overlays and calendar-linked event pins with source status.
- Keeps **Sessions** as its own workspace. Session reports can open a session-bound Universe replay with timeline scrubbing, event context and smooth follow-player panning.
- Retains existing sessions, visits and notes while retiring the separate Journey module. Observed travel never becomes a routing connection automatically.
- Bundles official SDE build 3503375, adds explicit data provenance, bounded lazy system detail loading and redraw-on-demand map rendering.
- Ansiblex zone calculations are labelled as the announced 22 September model; ship-specific capacitor modelling is not included.

This release candidate awaits human review. It is not merged into `main`.

## Unreleased

## 0.7.3 — 2026-09-18

### Changed

- Reduce background work by reading only protection evidence during OPSEC evaluation and using lightweight metadata for scheduler decisions. Protection cadence, freshness checks and OBS behaviour remain unchanged.
- Keep import analysis cached after unrelated settings/activity writes. Relevant books, history, character access, orders, fees and expiry still invalidate it; concurrent changes and transaction rollback cannot leave a stale result cached.
- Refactor session combat matching into per-system time indexes and reuse joined system metadata, reducing report work while preserving visits, combat windows, accounting, ordering and cards.
- Reuse prepared SQLite store statements.
- Bound the market-analysis history cache to its 30-day calendar window while retaining the daily archive separately. Compact existing projections once at startup, preserving their saved dates, summary values and freshness.
- Add a selective character/type/time index for session event queries.
- Save history and source metadata atomically in prepared, bounded batches, with event-loop yields between archive batches. Failed batches roll back together; interrupted refreshes can resume.
- Existing player data and settings are preserved; no data reset is required.
- Keep the production package free of profiling tools, synthetic performance fixtures, traces and CI workflows.

### Verification

- 155 behaviour tests, full before/after response comparisons and 250 deterministic combat-matching cases pass. Repeated comparisons against clean v0.7.2 demonstrate lower idle CPU, faster session reports and faster imports after unrelated writes; see [the implementation and verification notes](https://github.com/BunBajiro/kairo/blob/a7b1bf97b0073695926c443e52d523638e59e48d/docs/OPTIMISATION-v0.7.3.md).
- Approved for release after the user tested 0.7.3-rc.1 and confirmed it runs well. Stable 0.7.3 promotes that reviewed implementation with version labels and release documentation updated.

## 0.7.2 — 2026-09-14

### Added

- A full-width session summary above the activity cards: duration, systems and visits, personal/alliance kills and losses, wallet change and LP change, plus the most active system by unique personal/alliance killmails. Quiet sessions show the system with the most total observed time. Missing baselines and delayed LP estimates retain their status labels.
- A shared, persistent zKill incremental feed checks about every two minutes **only while sessions are live**, verifies relevant records with ESI and shows source timing, catch-up and failure status.

### Fixed

- Sessions cards align their borders, headings, metric areas and footers across each row, including cards with ship images, extra status text or missing legacy data.
- Long names and unavailable values wrap within their cards. On narrow screens, LP corporations show labelled start/end/change values without requiring horizontal scrolling.
- Resizing an open session keeps its dialog within the window instead of briefly clipping its sides during a width transition.
- Alliance victims always count as losses, including killmails with friendly attackers. Other victims count as kills only when the tracked alliance is among the attackers. This removes `K + L` entries and excludes alliance losses from destroyed ISK. Saved v0.7.1 killmails recalculate correctly on reopen.

### Changed

- Sessions adopts the Import Analyser's clearer section backgrounds, larger figures, grouped values, category accents and status/action footers.
- Opening a card reveals a full-width detail panel below its row. Explicit close controls return keyboard focus to the card; Enter and Space open cards, and Escape closes the report.
- The Chrome smoke check covers populated and legacy layouts at multiple widths, actual card/section alignment, expanded panel width and keyboard focus.
- Ending a session stops its incremental feed and triggers pending history checks. Delayed history checks obey source caches and finish within 24 hours after session end. Older sessions no longer collect on open or refresh; the former eight-session automatic-check cap is removed.

### Upgrade notes

- Existing data, visits and LP samples are retained. The corrected alliance classification is applied to saved records. Personal kills/losses remain included in alliance totals; deduplication across the two lists is only used to rank the summary's most active system.
- Approved for release after the user's review of the feature-branch build. Battle Reports remain reserved for v0.8.

## 0.7.1 — 2026-09-13

### Added

- **Expandable session overview cards** for route and visits, ships flown, personal combat, alliance combat, personal LP changes, wallet activity, progress, coverage and the activity timeline.
- **Complete observed visit history within each session**, including order, entry/exit times, durations, regions, repeated systems and quiet transits. Starting and ending visits are clipped to the session window.
- **Alliance combat around qualifying visits:** an alliance kill/loss during a visit enables its ±10-minute buffer in that system. Overlapping same-system windows merge and killmails are deduplicated. This rule only affects alliance combat tracking; every visit remains visible.
- **Separate personal and alliance ISK destroyed/lost**, using available zKillboard totalValue estimates. Unknown values are labelled unpriced.
- **Personal LP changes by NPC corporation**, with saved start/end balances, sample timestamps, delayed reconciliation and explicit uncertainty when samples overlap adjacent sessions.
- **Ships flown and change history**, including swaps between ships of the same hull type.

### Changed

- Public combat collection retains valuations even when a killmail was already received through ESI.
- Cached, rate-limited alliance collection uses supported system/month queries, verifies killmail details with ESI and retains records locally. Recent sessions continue collecting delayed public records; opening older sessions resumes checks.

### Upgrade notes

- Existing local data, settings, market scans and session history are preserved. New tables migrate once; no additional SSO scope is introduced.
- Enable the combat module and its existing loyalty-point permission before starting a session to capture LP. Historic sessions cannot recreate uncaptured LP, ship or alliance baselines.
- Battle Reports and public sharing are deferred to v0.8 or later.

## 0.7.0 — 2026-09-10

### Added

- **Downloadable test builds:** GitHub Actions packages feature branches into a ready-to-run ZIP after type checks, compilation and tests of the extracted runtime pass, so changes can be reviewed before merging.
- **Import Analyser buying character:** select a separate Jita buyer or use the selling character, with per-destination preferences, buyer order coverage and both pilots recorded in saved plans. Immediate purchases retain zero buyer fees; resale fees use the selling character’s profile. Existing settings and plans remain compatible.
- **Downloadable releases:** approved version changes merged into `main` build a versioned application ZIP, verify the extracted runtime and publish the ZIP with a SHA-256 checksum on GitHub Releases.
- Project changelog covering releases from 0.1.0 onward, linked from the README, with guidance for maintaining future release notes.

### Upgrade notes

- Upgrading from 0.6.0 preserves existing data, market scans, settings and saved import plans. There is no new data reset or EVE SSO scope.
- Existing destinations default to using the selling character for purchases. To use another buyer, connect that character with access to open orders, choose it under **Buying character**, apply the settings and use **Update trader data**.
- Older saved plans remain usable and show that the buying character was not recorded. Newly saved plans record both characters.

## 0.6.0

### Added

- **Markets → Import Analyser:** plan purchases at Jita for resale at a saved destination hub, using cached Jita sell depth, estimated regional demand, the selected selling character's fee profile, available capital and cargo capacity.
- **Saved import plans:** combine items into a hauling manifest, review purchase tiers, taxes, listing and repricing fees, hauling costs and round trips, then save a named plan. Reopen saved plans as drafts to reprice against current scans.
- **Shared EVE Ref histories:** daily regional market history for Jita, Amarr, Dodixie and Hek, with up to 30 days imported initially and downloaded archives reused across all four hubs.

### Changed

- Market browser and hub reports compare the lowest local sell price with the lowest Jita sell price.
- Market scan reminders begin after 24 hours. Cached prices keep their observation timestamps, and a history-only update does not mark the order book as freshly scanned.

### Upgrade notes

- Existing market scans and cached order/history responses are retired once. Kairo queues fresh scans for previously scanned, enabled hubs, with Jita first. Failed or cancelled refreshes can be resumed from Markets. Other player data and preferences are preserved; new installations do not start bulk scans automatically.
- No new EVE SSO scopes are introduced. For personalized import calculations, choose a selling character and use **Update trader data** to refresh skills, NPC standings and open orders. Enter a structure's actual total broker fee manually.

See the [Import Analyser guide](docs/IMPORT-ANALYSER.md) for setup, assumptions and fees.

## 0.5.2

### Added

- **Settings → ESI polling:** adjustable intervals for 35 data batches, with discrete sliders, descriptions, recommended defaults, module filtering and search.

### Changed

- Skill queue checks default to one minute, including when the next completion is days away. Slower routine collectors reuse cached data between checks.
- Per-ID name caching, shared market responses and persistent retry backoff reduce redundant ESI requests while preserving protection priority, freshness checks and rate-limit handling.
- Modules and Appearance controls now live in Settings.

### Upgrade notes

- Existing data and settings are retained. No new EVE SSO scopes or data reset are required.

## 0.5.1

### Added

- **Market category browser:** expandable EVE market groups, descendant browsing, cached-item counts and breadcrumbs, alongside search across cached offerings.
- Locally bundled CCP SDE categories immediately organize existing scans without ESI requests. Types missing from the bundled catalog remain available under **Uncategorized**.

## 0.5.0

### Added

- **Shared market desk:** quick and full hub scans, cached buy/sell orders, Jita comparisons and regional market reports.
- Public station scans and authorized-alt access to private structure markets, with shared local books, scan cancellation and reusable history collection.

### Changed

- Goal widgets return as a dedicated Stream Studio template.
- Widget surfaces match the compact toast design.

### Fixed

- The Journey region atlas stays within the page while exploring additional regions.

### Upgrade notes

- Existing local data and stream layouts migrate automatically.

## 0.4.0

### Added

- **Public zKillboard participation collection** and durable verified combat history, including late-arriving kills in archived session reports.
- **Journey connection controls:** hide and restore individual observed travel legs without deleting visits or drawing replacement connections across the gap.
- **Automatic goals** for wallet balance, ISK received, skill training, item ownership, mining resources, manufacturing runs and kill participation.

### Changed

- Kill credit counts every verified attacker in the killmail, including zero-damage EWAR participation. Fleet or corporation membership alone does not grant credit.
- Automatic goal progress uses authorized cached data, retains confirmed progress when sources are unavailable and records completion once.

### Upgrade notes

- Existing manual goals, sessions, visits, notes, OPSEC settings and compact toasts are retained. Restart Kairo and refresh the dashboard and OBS browser sources.

## 0.3.1

### Changed

- Stream toasts use a compact **440 × 82 px** layout with an event category, EVE timestamp, up to two lines of message context and a lifetime indicator.
- Stream Studio previews and OBS output use the same compact layout.

### Removed

- The separate toast title row and title editor. Older title-only rules retain their wording as a message fallback.

### Upgrade notes

- Restart Kairo and refresh the dashboard and OBS browser sources to load the updated layout.

## 0.3.0

### Added

- **Corporation and alliance standings** alongside personal contacts for OPSEC classification, with source availability and membership checks.
- Expanded space categories: Low-Sec, Neutral, High-Sec, Triglavian Space and Anoikis, alongside Blue, Hostile and Unknown. Manual protection and faction-warfare overrides remain available.
- Readable sovereignty-owner names resolved through ESI.

### Changed

- Subtle dashboard page transitions and a shared **Signal** frame style for Stream Studio widgets and broadcast output.
- OBS actions support the expanded space categories, with existing action lists migrated while preserving protection.

### Upgrade notes

- To enable organization standings, add `esi-corporations.read_contacts.v1` and `esi-alliances.read_contacts.v1` to the registered EVE application, then use **Connections → Update access** and authorize again.
- Refresh the dashboard and OBS browser sources to load the updated interface and renderer.

## 0.2.1

### Fixed

- OPSEC protection flicker during cache refreshes and brief jumps. Recent covered states retain bounded continuity while fresh context is collected, without repeated transition events.
- Slow background collectors delaying protection telemetry; location and required protection context receive priority within the shared request limit.
- Rate-limited requests failing to resume correctly after their cooldown.

### Changed

- Activity displays five entries per page, with **Older/Newer** controls, full-history search and export. Existing recorded transitions remain available.

## 0.2.0

### Added

- **Record-linked widgets** for selected goals and ESI-backed information, with unavailable states for missing, stale or disconnected sources.
- **Contextual event toasts** with template fields, character filters and location redaction while protected.
- **Local OBS automation** through WebSocket v5, covering source visibility, filters, audio and program scene changes.
- **Named sessions and reports**, with recorded activity, wallet/SP comparisons, editable names and debriefs.
- **Visual journey atlas** and editable system, constellation and region notes, tags and personal markers.

### Upgrade notes

- Existing sessions, goals and custom toast wording are preserved. Choose **Use event context** to adopt the contextual toast templates.

## 0.1.0

### Added

- **Initial local EVE Online dashboard**, with EVE SSO integration and authorized ESI data collection.
- Persistent activity and journey history, sessions and goals.
- **Stream Studio** with editable overlays, widgets and countdowns, plus separate transparent OBS browser sources.
- **OPSEC covers** with manual protection, friendly/hostile and faction-warfare handling, and protection for unknown or stale context.
- Configurable, opt-in event toasts.
