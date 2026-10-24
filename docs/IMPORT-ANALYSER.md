# Import Analyser

This guide describes the 0.8.0 feature set in the current **0.8.0-rc.17 review candidate**. Import Analyser helps plan immediate purchases at Jita for resale at a saved destination hub. Choose separate buying and selling characters, or use one pilot for both. It uses cached books and regional trading history, then applies your selling character’s fee profile, budget and cargo capacity. It never places, edits or cancels EVE market orders.

[Documentation index](README.md) · [Markets, scans and history](MARKETS.md) · [Setup and connections](USER-GUIDE.md)

## Your first import

1. Open **Markets**, select the destination, then **Import Analyser**. Jita is the purchasing reference, so select another hub to see recommendations.
2. Choose the **buying character** for Jita purchases and the **selling character** for destination listings. Both can differ from your active pilot or the alt used to scan a structure. **Same as selling character** is the default for buying, including existing installations; choose a specific buyer to keep that pilot when you change sellers. Each destination remembers its own selections.
3. Enter **Cargo per round trip / m³** and **Available capital / ISK**. Open **Demand, hauling & fee assumptions** to set the estimated share of regional trade, target turnover, trips per item, hauling costs and minimum return. Choose **Apply & analyse** to save the settings for this destination. Until applied, cards still use the last saved settings.
4. Use **Update trader data**. The seller needs skills, open orders and, for NPC stations, NPC standings. The buyer needs open orders to exclude their own Jita listings, but does not need trading skills or standings for immediate purchases. The interface explains missing scopes/modules or a character that needs reconnecting. Connected alts’ available order snapshots are also checked. When one pilot fills both roles, their data is requested once.
5. In the scan controls above the tabs, enable **Include Jita reference** and choose **Full scan** for broad coverage. Empty results also offer **Full scan + Jita reference** directly. Quick scans support the same analyser but cover fewer goods. The first EVE Ref import can take longer; progress appears above the tabs and the rest of Kairo remains usable.
6. Compare the category cards. Open a card to inspect source dates, demand windows, purchase tiers, alternative strategies and editable quantities/prices/durations.
7. Add a chosen option to the draft manifest. Choose **Review & save plan** to recompute costs and combine whole items into loads, then **Save import plan** in the review to persist a named snapshot with both characters. See [saving and reusing plans](#save-and-reuse-plans) for the distinction between a draft and a saved quote.

Saving a plan does not reserve stock. The estimates assume the quoted quantities remain available and every proposed unit eventually sells at the chosen price.

## Characters and trader data

Three character choices serve different purposes:

| Choice | Used for |
| --- | --- |
| **Scan access** in Markets | Reading a structure book, when required. This does not choose either trader. |
| **Buying character** | Identifying the buyer and excluding their own Jita listings. Immediate purchases do not use their skills or standings. |
| **Selling character** | The destination fee profile and existing local sell listings. This need not be the active dashboard pilot. |

**Update trader data** first applies the current settings, then requests the selected seller's skills, standings and orders, and available order updates for other connected characters. If buyer and seller are the same, the pilot is refreshed once. Data collection still respects enabled modules and authorized scopes:

| Required data | Module and permission |
| --- | --- |
| Seller's active trading skills | **Training & clones** · `esi-skills.read_skills.v1` |
| Seller's NPC standings, for an NPC destination | **Combat record** · `esi-characters.read_standings.v1` |
| Seller's and buyer's open orders | **Wallet & trade** · `esi-markets.read_character_orders.v1` |

For a structure destination, enter **Total structure broker fee / %** as displayed in game, including the SCC surcharge. ESI does not supply that personal fee and Kairo does not guess it. An NPC destination's owner and the seller's raw standings determine the NPC fee profile.

Missing required data blocks personalized recommendations. Older usable samples can still be used with their timestamps and an update prompt; they are not fresh observations. Refresh after skill training, clone/account changes, standing changes or market activity. Changing the buyer does not change the seller's fees or the manually entered capital budget.

**Order coverage** shows which connected characters have current authorized snapshots. Older usable authorized snapshots also contribute to own-order exclusions, while the coverage display marks them as needing an update. An active local sell listing in these snapshots excludes the whole item from recommendations; own Jita orders are excluded from purchase depth. Expired orders are ignored. Unconnected characters and characters without authorized order data cannot be identified as your other traders. Updating data can therefore remove an opportunity you already list or clear an exclusion left by an older snapshot.

## Set the planning assumptions

Settings are saved per destination. They are estimates and limits you supply, not a wallet balance, ship selection or observed station demand.

| Setting | Default | Meaning |
| --- | --- | --- |
| Cargo per round trip | 10,000 m³ | Available packaged-item capacity for each load. |
| Available capital | 1 billion ISK | Budget for purchases, initial listing fees and hauling. |
| Share of region volume | 10% | Your assumed share of regional executed activity at this destination. |
| Target turnover | 7 days | Caps recommended inventory using modelled daily demand. |
| Maximum trips per item | 3 | Per-item limit; the combined plan can require more trips. |
| Hauling cost per trip | 0 ISK | Your fuel/courier allowance for each round trip. Enter a value to include it. |
| Minimum net return | 15% | Minimum estimated net profit as a percentage of upfront capital for suggested options. |
| Minimum net profit | 500,000 ISK | Minimum estimated total profit for suggested options. |
| Repricing fee allowance | 1 update | Reserve for same-price or downward price updates. |
| Total structure broker fee | Not set | Required for a structure destination; use its actual total fee. |

Cargo accepts 1–10,000,000 m³; capital 1,000–1,000,000,000,000,000 ISK; demand share 0.1–100%; target turnover 1–90 days; maximum trips 1–50; and repricing allowance 0–20 whole updates. Kairo does not calculate a courier service's contract tariff, collateral, fuel consumption or route risk for you. Enter the allowance appropriate to your planned haul.

## Data and refreshes

Order books and histories are updated through [Markets](MARKETS.md#choose-the-right-update). Reading recommendations, quotes and saved plans uses the local cache; **Update trader data**, market scans and **Update history** are explicit collection actions. The four core hubs use EVE Ref histories; other saved hubs use ESI. See [history sources and dates](MARKETS.md#history-sources-and-dates) for coverage and refresh behavior.

Local sell supply and Jita purchase depth refer to their specific scanned locations. Neither history source provides executed trading volume for that station. **Share of region volume** is your assumed capture of regional activity, including both regional buy and sell transactions. The default 10% is a starting assumption, not a measured hub statistic. Adjust it to your knowledge of that market.

Daily windows end on the previous completed UTC day. Missing dates contribute no volume and remain visible as coverage gaps; averages use full calendar windows. Regional prices are weighted by executed volume. A full local book can support an empty-shelf opportunity; an unscanned item in a quick scan cannot be assumed to have zero supply.

Check the local, Jita and history timestamps in the expanded opportunity. A history-only update does not refresh the order book. Stale usable data is marked; refreshing a hub or your traders can change which items qualify.

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

## Price, quantity and turnover

**Anchoring Price** seeks a profitable reduction of at least 10% below the lowest existing local sell. Candidate prices balance a fee-adjusted return floor, recent regional prices and a roughly 25–50% premium over starting Jita prices. Exact Jita depth and all modelled costs decide whether a candidate survives. An anchor is unavailable when no profitable correction meets the settings. A listing can introduce a cheaper alternative; it cannot force other sellers to follow it.

**Profiteering Price** considers undercutting the lowest local sell by a valid EVE price tick, plus alternatives closer to recent traded values. Extreme asking prices do not automatically imply fast sales. When the scanned local shelf is empty, historical prices and Jita replacement costs provide candidate values.

The baseline assumed daily demand is the lower of the 7- and 30-day calendar averages, multiplied by your share. Above recent regional traded prices, the scenario reduces demand by the square of the price ratio. This is an explicit conservative modelling choice, not a fitted sales forecast. Lower prices do not create an assumed demand boost above the baseline.

Suggested inventory is limited by Jita stock, fees/capital, cargo, trips and your target turnover. Listing duration is selected from **Day, 3 Days, Week, 2 Weeks, Month, 3 Months**, normally allowing 25% time beyond the modelled sale period. The expanded view supports other valid durations and flags a duration shorter than expected turnover. Duration is the order’s expiry, not a promise of when the stock sells.

For otherwise comparable options, ranking rewards net profit and return on capital, discounts longer turnover, and applies an additional penalty for every trip. Activity and short-window supply gaps improve item ranking. Profit shown assumes every proposed unit sells at the chosen listing price.

### Explore and edit an opportunity

Open a card with **Explore & plan**. The detail view shows 1-, 3-, 7- and 30-day regional windows, reported-day counts, source timestamps and packaged volume. Switch between **Anchoring Price** and **Profiteering Price**, then choose **Use** beside an alternative. Up to 12 alternatives per strategy are shown.

Edit **Import quantity**, **Local list price / ISK** or **Sell order duration**, then choose **Recalculate**. A changed input needs a new quote before it can be added to the plan. Listing prices must use EVE's four-significant-digit ticks, with a minimum tick of 0.01 ISK; an arbitrary number of decimal places is not always a valid price.

Custom quotes can go beyond the recommended margin, budget or turnover target. Read the recalculated net amount and notices: an option may exceed available capital, take longer to sell than the selected duration, or cross a cached buy order and sell immediately instead of establishing a sell listing. Cached purchase stock and per-item hauling limits still apply. Expand **All available Jita price tiers** for source depth; **More price tiers** reveals another 20 levels.

## Purchase costs and fees

Procurement fills the cheapest eligible cached Jita sell levels in order, displaying quantity, total cost, weighted purchase price and the highest required price. **Buy the displayed price batches separately.** The model prices each batch at its listed price; one purchase at the highest required price can overpay cheaper units. The expanded card includes these batches. Actual prices and remaining quantities can change after scanning.

The selected seller’s active skill levels and raw NPC standings determine the fee profile. Immediate Jita purchases have zero buyer sales tax and broker fee in this model. Buy orders that wait on the market are not modelled by the analyser.

These are the calculations implemented in this candidate:

| Cost | Calculation |
| --- | --- |
| Immediate Jita purchase | Sum of quantity × price at each required sell level; no buyer sales tax or broker fee |
| Sales tax | 7.5% × (1 − 0.11 × active Accounting level) |
| NPC station broker rate | 3% − 0.3 percentage points × Broker Relations level − 0.03 points × raw faction standing − 0.02 points × raw corporation standing |
| Structure broker rate | Enter the actual total fee displayed in game, including the 0.5% SCC surcharge; NPC standings/Broker Relations do not reduce it |
| Listing fee | Rate × listing value, with the 100 ISK minimum |
| Repricing reserve | Chosen update count × the greater of 100 ISK and listing value × broker rate × (0.5 − 0.06 × Advanced Broker Relations level) |
| Hauling | Combined whole-item trips × the entered cost per round trip |

The repricing allowance models same-price or downward updates. Advanced Broker Relations raises the standard 50% relist discount by six percentage points per active skill level, reaching 80% at level V; CCP made this [permanent change in July 2021](https://www.eveonline.com/news/view/the-grand-heist-now-live). A future upward price change or additional updates can incur further fees. Sales tax is charged on sale; the initial capital figure includes purchases, listing fees and hauling. Estimated net additionally subtracts sales tax and the repricing reserve. Saved plans retain these assumptions with the quoted prices and timestamps; applying a corrected fee calculation does not rewrite an older saved quote. Use it as a draft and save again to obtain a current quote.

## Save and reuse plans

1. In an opportunity's calculated quote, choose **Add anchoring option to plan** or **Add profiteering option to plan**. Adding the same type again replaces its existing draft line; a plan keeps one line per item.
2. Review **Your import plan** below the cards. Give it a name, remove unwanted lines, or choose **Clear draft** to start again. Clearing the draft does not delete a saved plan.
3. Apply any pending settings changes, then choose **Review & save plan**. This recalculates every line against the current cache and applied assumptions, then packs the combined cargo. Opening this review alone does not save it.
4. Check capital, net profit, combined trips, purchase batches and **Round-trip manifests**. Choose **Save import plan** to persist the snapshot.

Combined packing keeps individual items whole and shares spare cargo capacity between types. Combined hauling is charged once per packed trip, rather than summing each item's separate trip allowance. The maximum-trip setting applies per item; it is not a cap on the combined manifest. The packing algorithm is a practical whole-item arrangement, not a guarantee of the mathematically smallest possible trip count.

An over-budget combined plan is flagged and can still be saved. Adjust it before using it to buy. A plan supports up to 100 different items; each hub retains up to 100 saved plans. A combined plan above 5,000 trips is rejected, and the review displays the first 200 load manifests when there are more.

**Saved plans** are dated snapshots that remain available after restarting Kairo. Opening one shows its saved purchases, characters, fees and totals without silently repricing them. Choose **Delete saved plan** to remove it, or **Use as draft** to edit and reprice it:

- The draft restores the saved item lines, name, plan identity and buying/selling character selections.
- It retains the destination's current cargo, budget, demand and other assumptions. It does not restore every historical setting from the saved quote.
- If restored character selections differ, choose **Apply & analyse**. Review the resulting current recommendations, then **Review & save plan** to requote. A line that no longer qualifies may need removing or replacing.
- Saving this draft updates the same saved plan. To build a separate plan, clear the draft and add a new set of opportunities.

The unsaved manifest is temporary: save it before changing hub, leaving Import Analyser or closing Kairo. Older saved plans without a buying character remain readable and show **Not recorded in this plan**. Using one as a draft defaults buying to the saved seller. A saved plan records a decision and its assumptions; it does not reserve stock, create an EVE fitting, arrange a courier contract or place any in-game orders.

## Common symptoms

| Symptom | Next step |
| --- | --- |
| **Choose the destination hub. Jita is the purchasing market.** | Select a saved hub other than Jita. The source is fixed to Jita in this candidate. |
| Recommendations still use old settings | Choose **Apply & analyse**. The pending-settings notice means the visible cards use the previous saved values. |
| Trader data or fees are unavailable | Select connected traders, enable the required modules/scopes, reconnect if requested, then choose **Update trader data**. For a structure, enter its total broker fee. |
| **No qualifying imports in this category** | Check scanned coverage, history, capital, cargo and thresholds. A full destination/Jita scan and history update can improve coverage; fewer than ten results is normal when fewer qualify. |
| An expected item is missing | It may be already listed by a connected character, lack recent history or known packaged volume, exceed your hold, or fail the stock, activity, margin and turnover screens. Review the screening counts and **Order coverage**. |
| **This item no longer qualifies…** | The cache, access or settings changed. Close the detail, refresh/reapply the relevant inputs and choose a currently qualifying opportunity. Remove obsolete lines before reviewing a saved draft. |
| Listing-price validation error | Use a valid four-significant-digit price tick, then recalculate. |
| **Review & save plan** is disabled | Add a line, finish any current action and apply pending settings. |
| Review or saving fails after a scan/settings change | Check the error for the affected line or limit; the quote must still fit current cached stock and hauling constraints. Recalculate or replace the line and retry. |

## Maintainer source map

UI labels, draft settings, custom quotes and saved-plan behavior are in [`import-analyser.tsx`](../components/kairo/import-analyser.tsx). Trader access, own-order exclusions, cached analysis and persistence are in [`server/imports.mjs`](../server/imports.mjs). Settings, fee equations, candidate ranking and packing are in [`server/import-math.mjs`](../server/import-math.mjs). Market ancestry and packaged volumes come through [`market-categories.mjs`](../server/market-categories.mjs) and its dataset.

Behavioral evidence includes [`imports.test.mjs`](../tests/kairo/imports.test.mjs), [`imports-roster.test.mjs`](../tests/kairo/imports-roster.test.mjs) and browser coverage recorded in [Validation](VALIDATION.md). The equations above describe implemented behavior; neither the bundled datasets nor the demand model predicts future local demand.
