# Markets

This guide describes the 0.8.0 feature set in the current **0.8.0-rc.17 review candidate**. Markets keeps one local cache shared by your connected characters. It provides a **Market browser**, **Hub report** and [Import Analyser](IMPORT-ANALYSER.md). It does not place, edit or cancel in-game orders.

[Documentation index](README.md) · [Setup and connections](USER-GUIDE.md) · [Import Analyser](IMPORT-ANALYSER.md)

## Start with a scan

1. Open **Markets** and select Jita, Amarr, Dodixie or Hek. These are the four initial hubs.
2. For an NPC station, **Scan access → Public ESI · no character needed** is sufficient. You can scan from anywhere; you do not need to travel or sign in to EVE. For a player structure, choose a connected character with the required access described below.
3. Leave **Include Jita reference** on when comparing another hub with Jita. The switch has no effect when Jita itself is selected.
4. Choose **Quick scan** for your supply basket or **Full scan** for broad coverage. The progress panel reports the current work; you can continue using Kairo while it runs.
5. Open **Market browser**, expand a category and select its name, or choose **All items**. Select an item to inspect its orders and history. Use **Hub report** for comparisons across the scanned inventory.

A new installation does not automatically scan every hub. Viewing cached books or reports does not request new ESI market data. Start a scan or an explicit update when you need fresher information.

## Follow your own hubs

Open **Manage hubs** to add an NPC station or player structure. Up to 32 hubs can be followed.

| Action | What to do |
| --- | --- |
| Find NPC market stations | Enter an exact system name and choose **Find stations**, then select a result. Discovery shows up to 30 stations; use a station ID if your result is outside that list. |
| Add a known location | Enter its **Station / structure ID**, optionally enter a **Hub nickname**, then choose **Add hub**. Use the location ID from an EVE location link, not a solar-system ID. |
| Add the scan character's current structure | Select that character under **Scan access**, dock them in the structure, open **Manage hubs**, then choose **Use scan character’s location**. Select the docked result. |
| Hide a hub | Use its remove button in **Manage hubs**. Its saved market data is retained. Cancel a scan involving that hub before removing it. |
| Return to the initial hubs | Choose **Restore core hubs**. This restores Jita, Amarr, Dodixie and Hek within the same 32-hub limit. |

Adding the same location again restores its followed status and lets you supply a nickname. Discovery by system finds NPC stations; it does not enumerate every private structure in that system.

### Structure access

In [Connections](USER-GUIDE.md), authorize the scan character for the Markets permissions:

| Permission | Purpose |
| --- | --- |
| `esi-universe.read_structures.v1` | Resolve the structure's identity when adding it. |
| `esi-markets.structure_markets.v1` | Download its market orders. |
| `esi-location.read_location.v1` | Required additionally for **Use scan character’s location**. |

The EVE application must allow the scopes, and the character must authorize them. The character also needs actual in-game structure access; being in the same system does not grant it. Reconnect a character marked **reconnect** before scanning with them. **Scan access** is independent of the buying and selling characters chosen in Import Analyser.

A successfully scanned structure book remains available to your other local characters, including after the scan character is disconnected. That is retained local data, not evidence that the remaining characters can access the structure themselves.

## Choose the right update

| Control | Order-book coverage | History work |
| --- | --- | --- |
| **Quick scan** | The shared quick-supply basket at the selected hub; includes the same basket at Jita when enabled. Other previously scanned items remain cached. | Updates regional history for the selected hub; the core hubs use the shared EVE Ref archive import. |
| **Full scan** | All listings at the selected location, plus quick-supply and previously known items so empty shelves remain represented. Includes a full Jita book when enabled. | Collects regional history after the books are saved. |
| Item refresh button | Updates the selected cached item, plus its Jita reference when enabled. | Updates its regional history; core-hub history still uses the shared archive import. |
| **Update history** | Leaves existing order books and their observation times unchanged. | Updates history for cached items at a custom hub, or the shared core-hub archive history. |

For NPC stations, a full scan reads regional orders and retains orders located at the selected station. A quick scan requests the basket's types. Structure ESI requires reading every order page even for a quick or single-item scan; these modes reduce retained items and history work, not the structure order download.

Only one market scan runs at a time. Transient or malformed order-page responses receive up to two recovery attempts across the scan, respecting provider cooldowns and a 60-second recovery-wait budget. Progress shows the retry; **Cancel scan** remains available. A completed book is kept even if later Jita or history work fails. A partially downloaded book does not replace its previous complete book. After Kairo closes during a scan, restart the scan; completed books and usable cached responses remain available.

If the job stopped during history collection, select that job's destination hub and choose **Continue histories** when offered. **Update history** also retries history without rescanning its books. Custom hubs need an initial book before a general history-only update can identify the items to fetch.

### Edit the quick-supply basket

Choose **Edit quick-scan supplies**. The initial basket includes common charges, drones, repair paste, deployables, minerals and fuel. Add an item's exact in-game market name, or remove an existing entry. The basket is shared across hubs and holds 1–80 items.

Edits take effect on the next scan and do not remove earlier cached items. Finish or cancel the active scan before editing the basket. A full scan is still required for a broad view beyond the basket.

## Browse and inspect items

The category tree follows the active EVE static dataset's market hierarchy, supplied initially with Kairo and maintained through [dataset updates](DATASETS.md). Click a branch arrow to expand it and a category name to display that category and its descendants. Counts are cached items at the selected hub, including subcategories; they are not the total EVE catalogue or a count of currently stocked items. **Uncategorized** holds cached items not present in the available taxonomy.

Typing in **Search all cached items…** searches across categories by name, or matches an exact numeric type ID. It searches your cache, not the live market. Clear the text to return to the category chooser. The filter and sort controls still apply to search results.

| Filter | Meaning |
| --- | --- |
| **All offerings** | All cached items in the selected category/search. |
| **Quick supplies** | Cached items belonging to the shared quick-scan basket. |
| **With sell orders** | Items with positive cached sell quantity. |
| **No local sellers** | Cached items with zero local sell quantity; this does not identify every unscanned item as absent. |

Sort by **Item name**, **Lowest sell price**, **Highest Jita premium** or **Lowest supply**. The browser is paginated. Click an item name for:

- Lowest local sell, highest local buy, quantity-weighted local listing average and Jita's lowest sell.
- **Sellers** with cached prices, quantities and expiry dates; **Buyers** with prices, quantities, minimum volumes and ranges.
- **Regional history**, including 30-day average price, average daily units, source, dates, reported-day coverage, chart and daily rows.
- The item refresh button for a targeted update. **Load item category**, when shown, explicitly retrieves that item's additional category metadata.

Prices and quantities cover orders originating at this station or structure. Buy orders placed elsewhere are excluded even when their range reaches the selected hub. A listing average describes current cached asking prices weighted by remaining quantity; it is different from a regional average of completed trades.

## Read the Hub report

**Hub report → Supply & price report** screens the selected hub's cached items. Choose a signal, adjust thresholds, then select an item to open its order book in **Market browser**.

| Signal | Calculation and threshold |
| --- | --- |
| **Above Jita sell** | `(lowest local sell / lowest Jita sell − 1) × 100`, at least **Price gap ≥ %**. |
| **Below Jita sell** | The same comparison, at or below the negative price-gap threshold. |
| **Wide local spread** | `(lowest local sell − highest local buy) / lowest local sell × 100`, at least the price-gap threshold. |
| **Thin local supply** | Local sell quantity divided by regional average daily traded units, below **Stock / region daily volume <**. Requires current history, at least seven reported days and at least one regional unit/day. |

The default price gap is 20%; the default stock/volume threshold is 1. Price gap accepts 1–1,000%, and the stock/volume threshold accepts 0.01–30.

Thin supply is a screening ratio, not predicted days until that station sells out. Regional trades include activity elsewhere in the region. The report does not apply the Import Analyser's assumed hub share, taxes, fees or hauling costs. Use [Import Analyser](IMPORT-ANALYSER.md) to model those costs and an assumed capture of regional demand.

Missing Jita prices and unscanned histories are not treated as zero. The report shows how many items have comparisons and history, and flags old books. An empty report can mean no match within scanned coverage; it does not establish that the wider market has no opportunities.

## History sources and dates

| Hub | History source | Completed trades cover |
| --- | --- | --- |
| Jita IV – Moon 4 – Caldari Navy Assembly Plant | EVE Ref | The Forge region |
| Amarr VIII (Oris) – Emperor Family Academy | EVE Ref | Domain region |
| Dodixie IX – Moon 20 – Federation Navy Assembly Plant | EVE Ref | Sinq Laison region |
| Hek VIII – Moon 12 – Boundless Creation Factory | EVE Ref | Metropolis region |
| Other saved stations or structures | ESI | Their region |

Neither source supplies completed trading volume for an individual station. Kairo's EVE Ref importer is built in: no Docker service, external importer command or extra database setup is required. Its first update checks the last 30 completed UTC days; all four core regions share each downloaded archive. Later updates reuse validated dates, fetch missing or changed dates and periodically recheck corrections. Completed dates survive interrupted imports and restarts. A custom hub uses the ESI path even if it is in one of those four regions.

History windows end on the previous completed UTC day. Daily averages divide volume by the full calendar window, including dates with no reported volume. Missing dates can represent source gaps; they are not silently excluded to inflate the average. Regional price averages are weighted by executed volume. A 30-day display is a bounded analysis window, not a promise that every day has a report.

### Understand freshness

- **Last scanned** is when Kairo completed that book. **Data observed** is the oldest source observation used for the book; ESI may return a reusable cached response.
- **Last full book** records the broader scan separately. A later quick scan refreshes only its basket, so individual items can have different ages.
- A hub shows **Update suggested** 24 hours after its last scan. Individual prices and Jita references also retain their own observation ages; an asterisk beside a Jita comparison marks a reference older than 24 hours.
- History has its own expiry and source timestamp. Updating history does not refresh prices or make an old order book new.

Cached books remain readable while stale or when **Markets** is disabled in **Modules**. Disabling the module blocks new scans; enable it to collect new data.

## Common symptoms

| Symptom | Next step |
| --- | --- |
| **Your trade network is empty** | Open **Manage hubs**, add a location or restore the core hubs. |
| **Choose a market category** | Select a category name or **All items**; expanding an arrow alone does not select a category. |
| **No matching items** | Clear the search/filter, check another category, or run a full scan to expand coverage. |
| **No Jita scan** or missing comparison | Enable **Include Jita reference** and scan the selected hub. Some items may have no cached Jita sell order even after scanning. |
| **History awaiting scan** | Update the item or choose **Update history** after the initial book. Check job progress before assuming the history stage has finished. |
| A scan stopped after saving books | Read the job detail. Existing completed books remain available; retry the scan or continue histories as appropriate. |
| Structure authorization error | Check the selected scan character, reconnect required scopes, and verify their in-game access. |
| EVE Ref asks you to wait | Respect the retry time in the error, then retry history. Cached history remains available. |
| Browse/category request failed with **Retry** | Retry the failed view; this reloads its local resource and does not request a new market scan. |
| **Resume fresh scans** after an older upgrade | Resume the queued refresh, enabling Markets and reconnecting structure access if needed. The one-time pre-0.6.0 market migration retires old books; this is not a new 0.8.0 reset. See [upgrade guidance](USER-GUIDE.md). |

## Maintainer source map

The current UI labels and workflows are in [`markets.tsx`](../components/kairo/markets.tsx) and [`market-categories.tsx`](../components/kairo/market-categories.tsx). Book ownership, scan modes, hub limits, reports and pagination are in [`server/markets.mjs`](../server/markets.mjs); archive handling and calendar summaries are in [`market-history.mjs`](../server/market-history.mjs) and [`market-history-store.mjs`](../server/market-history-store.mjs).

Behavioral evidence includes [`markets.test.mjs`](../tests/kairo/markets.test.mjs), [`imports.test.mjs`](../tests/kairo/imports.test.mjs), [`market-categories.test.mjs`](../tests/kairo/market-categories.test.mjs) and the [validation record](VALIDATION.md). These references support the guide; they are not additional steps for users to perform.
