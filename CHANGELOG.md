# Changelog

Notable changes to Kairo, listed newest first. Release history starts at **0.6.0**. Completed changes for the next release are collected under **Unreleased**.

## Unreleased

### Added

- Project changelog, linked from the README, with guidance for maintaining future release notes.

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
