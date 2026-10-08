# Import Analyser

Import Analyser helps plan purchases at Jita for resale at a saved destination hub. Choose separate buying and selling characters, or use one pilot for both. It uses cached books and regional trading history, then applies your selling character’s fee profile, budget and cargo capacity. It never places, edits or cancels EVE market orders.

## Your first import

1. Open **Markets**, select the destination, then **Import Analyser**. Jita is the purchasing reference, so select another hub to see recommendations.
2. Choose the **buying character** for Jita purchases and the **selling character** for destination listings. Both can differ from your active pilot or the alt used to scan a structure. **Same as selling character** is the default for buying, including existing installations; choose a specific buyer to keep that pilot when you change sellers. Each destination remembers its own selections.
3. Enter available cargo in m³ and your capital budget. Open **Demand, hauling & fee assumptions** to set the estimated share of regional trade, target turnover, trips per item, hauling costs and minimum return.
4. Use **Update trader data**. The seller needs skills, open orders and, for NPC stations, NPC standings. The buyer needs open orders to exclude their own Jita listings, but does not need trading skills or standings for immediate purchases. The interface explains missing scopes/modules or a character that needs reconnecting. Connected alts’ available order snapshots are also checked. When one pilot fills both roles, their data is requested once.
5. Use **Full scan + Jita reference** for broad coverage. Quick scans support the same analyser but cover fewer goods. The first EVE Ref import can take longer; progress appears above the tabs and the rest of Kairo remains usable.
6. Compare the category cards. Open a card to inspect source dates, demand windows, purchase tiers, alternative strategies and editable quantities/prices/durations.
7. Add a chosen option to the draft manifest. **Review & save plan** recomputes costs, combines whole items into loads and saves a named snapshot with both characters. Open it later, or use it as a draft to restore its character selections and reprice against your current scans. Use **Apply & analyse** if the restored selections differ from the current ones. Older plans remain readable and show that their buyer was not recorded; loading one as a draft defaults buying to the saved seller.

Plans support up to 100 different items and 100 saved plans per hub. Saving a plan does not reserve stock. An over-budget combined plan is clearly flagged for adjustment. The maximum-trip setting applies per item; the manifest shows the combined trip count separately.

## Data and refreshes

| Destination | History source | Executed-volume coverage |
| --- | --- | --- |
| Jita IV – Moon 4, Caldari Navy Assembly Plant | EVE Ref | The Forge |
| Amarr VIII (Oris), Emperor Family Academy | EVE Ref | Domain |
| Dodixie IX – Moon 20, Federation Navy Assembly Plant | EVE Ref | Sinq Laison |
| Hek VIII – Moon 12, Boundless Creation Factory | EVE Ref | Metropolis |
| Other saved stations or structures | ESI | Their region |

Local sell supply and Jita purchase depth refer to the specific scanned station/structure. Neither history source provides executed trading volume for that station. **Share of region volume** is your assumed capture of regional activity at the destination, including both regional buy and sell transactions. The default 10% is a starting assumption, not a measured hub statistic. Adjust it to your knowledge of that market.

Daily windows end on the previous completed UTC day. Missing dates contribute no volume and remain visible as coverage gaps; Kairo does not inflate averages by dividing only by active dates. Regional price averages are weighted by executed volume. A full local book can support an empty-shelf opportunity; an unscanned item in a quick scan cannot be assumed to have zero supply.

History imports use EVE Ref’s [daily archive dataset](https://docs.everef.net/datasets/market-history.html). The [documented import command](https://docs.everef.net/commands/import-market-history.html) targets its own database setup. Kairo instead includes a compatible importer for its existing local SQLite store, avoiding a separate Docker/database installation. All four core hubs share each downloaded day. The importer caches the manifest, fetches missing/changed dates and periodically rechecks for corrections. Validated dates survive restarts and interrupted downloads. Custom hubs retain ESI history requests.

The 0.6.0 upgrade intentionally invalidates old market scans and order/history responses once, then queues fresh scans of previously scanned enabled hubs with Jita first. Other player data, hub preferences and scopes remain intact. Failed/cancelled refreshes pause; **Resume fresh scans** continues the queue. Structures may need an authorized alt reconnected. New installations do not start a bulk scan automatically.

After this migration, stale books are retained until a successful replacement scan. Hub reminders begin at 24 hours after scanning; individual prices retain their own observation ages. Analysis and report browsing make no ESI requests. A history-only update does not pretend to refresh the order book.

## Activity screens and indicators

Each category shows up to ten qualifying items, ordered by estimated return, turnover and hauling effort. Kairo shows fewer if the evidence or margins do not support ten.

| Category | Minimum estimated hub units in a completed 1-, 3- or 7-day window |
| --- | ---: |
| Ships | 3 |
| Ship Equipment & Drones, including rigs/subsystems | 20 |
| Ammunition | 10,000 |
| Implants & Boosters | 5 |
| Industry & Trade Goods | 1,000 |
| Structures & Equipment | 2 |
| Blueprints & Skills | 3 |
| Misc | 5 |

These screens apply after multiplying regional volume by your assumed share. Shorter qualifying windows and higher activity receive more weight. A candidate also needs seven reported days in the last 30, two active days in the last seven and activity in the last three. These checks reduce recommendations caused by a single isolated trade.

- **Stock below 3d / 7d / 30d demand:** local sell quantity is below the assumed share of that window’s regional volume. Shorter shortages carry more weight.
- **+100 / +200 / +500 / +1000% vs Jita:** the lowest local sell exceeds the lowest usable Jita sell by that amount. Lower premiums can still qualify when a feasible import is profitable.
- **Trips and cargo:** quantities use repackaged item volume. An individual hull must fit; it cannot be split between trips. Combined manifests share spare space between items.

Existing active local sell listings from connected characters exclude that item entirely, using their authorized order snapshots. Own Jita sell orders are excluded from procurement. Expired orders are ignored. Alt coverage and observation times are shown; an unconnected or unauthorized character’s listings cannot be identified as yours.

## Price, quantity and turnover

**Anchoring Price** seeks a profitable reduction of at least 10% below the lowest existing local sell. Candidate prices balance a fee-adjusted return floor, recent regional prices and a roughly 25–50% premium over starting Jita prices. Exact Jita depth and all modelled costs decide whether a candidate survives. An anchor is unavailable when no profitable correction meets the settings. A listing can introduce a cheaper alternative; it cannot force other sellers to follow it.

**Profiteering Price** considers undercutting the lowest local sell by a valid EVE price tick, plus alternatives closer to recent traded values. Extreme asking prices do not automatically imply fast sales. When the scanned local shelf is empty, historical prices and Jita replacement costs provide candidate values.

The baseline assumed daily demand is the lower of the 7- and 30-day calendar averages, multiplied by your share. Above recent regional traded prices, the scenario reduces demand by the square of the price ratio. This is an explicit conservative modelling choice, not a fitted sales forecast. Lower prices do not create an assumed demand boost above the baseline.

Suggested inventory is limited by Jita stock, fees/capital, cargo, trips and your target turnover. Listing duration is selected from **Day, 3 Days, Week, 2 Weeks, Month, 3 Months**, normally allowing 25% time beyond the modelled sale period. The expanded view supports other valid durations and flags a duration shorter than expected turnover. Duration is the order’s expiry, not a promise of when the stock sells.

For otherwise comparable options, ranking rewards net profit and return on capital, discounts longer turnover, and applies an additional penalty for every trip. Activity and short-window supply gaps improve item ranking. Profit shown assumes every proposed unit sells at the chosen listing price.

## Purchase costs and fees

Procurement fills the cheapest eligible cached Jita sell levels in order, displaying quantity, total cost, weighted purchase price and the highest required price. **Buy the displayed price batches separately.** EVE’s immediate matching uses the buyer’s offered price; placing one large purchase at the highest required price can overpay cheaper units. The expanded card includes these batches. Actual prices and remaining quantities can change after scanning. See CCP’s [buy and sell order guide](https://support.eveonline.com/hc/en-us/articles/203218932-Buy-and-Sell-Orders).

The selected seller’s active skill levels and raw NPC standings determine the fee profile. The buying character’s skills and standings do not reduce the cost of an immediate Jita purchase: there is no buyer sales tax or broker fee for this purchase mode. Buy orders that wait on the market are not modelled by the analyser. See CCP’s [broker fee and sales tax guide](https://support.eveonline.com/hc/en-us/articles/203218962-Broker-Fee-and-Sales-Tax).

Missing required data blocks a personalized recommendation; older usable profiles retain their sample times and an update prompt. Refresh trader data after training, clone/account changes or standing changes. Changing the buyer does not change the seller’s fee profile or the manually entered capital budget. Own-order exclusions still cover all connected characters with authorized order data.

| Cost | Calculation |
| --- | --- |
| Immediate Jita purchase | Sum of quantity × price at each required sell level; no buyer sales tax or broker fee |
| Sales tax | 7.5% × (1 − 0.11 × active Accounting level) |
| NPC station broker rate | 3% − 0.3 percentage points × Broker Relations level − 0.03 points × raw faction standing − 0.02 points × raw corporation standing |
| Structure broker rate | Enter the actual total fee displayed in game, including the 0.5% SCC surcharge; NPC standings/Broker Relations do not reduce it |
| Listing fee | Rate × listing value, with the 100 ISK minimum |
| Repricing reserve | Chosen update count × the greater of 100 ISK and listing value × broker rate × (0.5 − 0.05 × Advanced Broker Relations level) |
| Hauling | Combined whole-item trips × the entered cost per round trip |

The repricing allowance models same-price or downward updates. A future upward price change or additional updates can incur further fees. Sales tax is charged on sale; the initial capital figure includes purchases, listing fees and hauling. Estimated net additionally subtracts sales tax and the repricing reserve. Saved plans retain these assumptions with the quoted prices and timestamps.

Defaults are 10,000 m³, 1 billion ISK capital, three trips per item, seven-day target turnover, 10% assumed regional capture, 15% minimum net return, 500,000 ISK minimum net profit and one repricing update. Hauling defaults to zero additional charge; enter fuel/courier costs to include them. Structure fees have no guessed default.

Fee references: CCP’s [Broker Fee and Sales Tax](https://support.eveonline.com/hc/en-us/articles/203218962-Broker-Fee-and-Sales-Tax) and [Broker Relations](https://www.eveonline.com/news/view/broker-relations). Market categories, packaged volumes and NPC ownership are bundled from CCP’s official SDE. These sources do not predict future local demand.
