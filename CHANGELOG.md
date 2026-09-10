# Changelog

Notable changes to Kairo, listed newest first. Completed changes for the next release are collected under **Unreleased**.

## Unreleased

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
