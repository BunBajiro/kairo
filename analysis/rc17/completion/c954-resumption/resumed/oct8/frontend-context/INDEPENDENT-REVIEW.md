# Read-only review of the Assets view proposal

Reviewer `/root/restore_source_9afa`, 8 October 2026. Reviewed the one-file proposal against exact 227 without runtime or edits. No concrete blocker was found before the compiled gate.

All consumed values are represented by assets, prices, fittings, contracts and whole names props. Whole names is required for nested fitted-module labels outside the row model's name IDs. Full ModuleState values preserve status/error/truncated/updatedAt freshness. Dashboard clears data and unmounts content through stateReady on pilot changes; the reauthorization banner is outside AssetsView. NoData independently subscribes to Context and continues updating character/navigation beneath a memoized ancestor.

Native fitting details and DataTable query/sort/page state remain under stable component/row identities. Handler closures capture current props or local state. Other pages retain their Context wrapper; the extracted table uses the same skills/array fallback and model lifetime. Assets uses native details disclosures, not a separate details dialog.

The reviewer requested explicit metadata-only snapshot and zero-character connection-action checks in addition to deep fitting names. Those controls were added to the compiled diagnostic harness before running it. This review is not a performance adoption decision or full F3 closure.
