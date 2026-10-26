# Pilot workspace, goals and notes

This guide describes the implemented 0.8.0 feature set in **0.8.0-rc.17**, the current review candidate. Start with the [user guide](USER-GUIDE.md) for installation and character access, or return to the [documentation index](README.md).

## Choose a pilot and find a page

Use **Active character** at the top of the workspace to select whose private ESI data, goals and Sessions you are viewing. The selection is remembered in this browser. It does not change the separately configured **Character to protect** in OPSEC, a Studio widget's source character, or a market scan's access character.

Use the sidebar, or **Ctrl+K / Cmd+K** to search destinations. **Ctrl+B / Cmd+B** toggles the sidebar; on a narrow screen it opens as a drawer. The top-right clock and times labelled EVE use UTC.

| Destination | What to do there |
| --- | --- |
| **Command centre** | Review current location/hull, wallet, training, jobs, objectives and recent activity. |
| **Pilot & training** | Inspect your skills, queue, clones, implants, calendar, notifications and mail headers. |
| **Wallet & trade** | Read wallet journal, recent transactions, open orders, LP and NPC standings. |
| **Hangar & assets** | Search owned items and inspect saved fittings and contracts. |
| **Industry & planets** | Review jobs, planetary colonies, mining records and blueprints. |
| **Markets** | Scan hub books, compare reports and plan imports. See [Markets](MARKETS.md) and [Import Analyser](IMPORT-ANALYSER.md). |
| **Sessions** | Record an operation and inspect its report, combat and map replay. See [Sessions](SESSIONS.md). |
| **Atlas**, **Maps**, **Universe settings** | Explore New Eden, maintain private connection maps and configure navigation/intel. See [Universe](UNIVERSE.md). |
| **Goals & notes** | Keep manual tasks, automatic objectives and private notes. |
| **Stream studio**, **OPSEC control** | Choose broadcast content and protection rules. See [Streaming](STREAMING.md). |
| **Settings**, **Connections** | Enable collectors, adjust polling/appearance/datasets and manage EVE access. See the [user guide](USER-GUIDE.md). |

There is no separate Ships page: the current hull is in Command centre, owned ships and saved fittings are in Hangar & assets, and recorded hull changes are in Sessions. Older Journey bookmarks open Atlas.

## Read the data state before the number

Most pilot pages read the latest locally saved, authorized snapshots. They do not query EVE on every page opening. Module switches in **Settings** control collection across the installation; scopes granted through **Connections** control which private data each character can supply. A page may combine several modules: for example, **Wallet & trade → Loyalty & standings** uses **Combat record**, while Pilot's calendar and messages use **Calendar & notifications**.

| Status | Meaning and next step |
| --- | --- |
| **Synced** | A successful snapshot is available. Inspect its sample timestamp when freshness matters. |
| **Awaiting sync** | No completed sample is available yet. Keep Kairo running and check collection/access. |
| **Scope needed** / **Connect this data** | Use **Manage connection** and authorize the required scopes. |
| **Disabled** / **Module disabled** | Use **Manage modules** to enable the owning collector. |
| **Cached · stale** | Saved data is available but is no longer current; do not treat it as a live reading. |
| **Sync issue** | Read the error on the status/empty state and check the owning connection or service. |
| **collection capped** | The source exceeded its collection limit; the table is incomplete. |

The top-bar **Refresh ESI data** button requests a sync for the selected character. It respects ESI cache deadlines and rate limits; repeated clicks do not force newer server data. See [ESI polling](ESI-POLLING.md) for cadence and recovery.

Tables generally offer **Filter records…**, sortable column headings, page controls and a sample timestamp. Filtering searches the loaded records; it does not fetch additional ESI history. An empty filtered result differs from missing access or an unsuccessful collection. Public station names can be resolved without private access; player structures need the optional structure scope and actual access. Unresolved names can remain numeric IDs.

## Command centre

After selecting a character, use the four summary cards to open wallet, skills/training or industry detail. **In space** shows the last supplied system, security, region, current hull/ship name and online status. Its **BROADCAST** field reflects the installation's OPSEC state, which can protect a different selected character.

**Training queue** previews up to four entries; **View training** opens the full page. **Your objectives** previews up to three unfinished objectives. **Recent activity** shows five recent retained events. Follow its link into Atlas for the current map workspace; it is not a complete travel journal.

The wallet chart uses balances in recent journal entries. **ISK received / 24h** sums positive entries, including transfers/refunds, and is not a measure of profit. The industry card separates active jobs from jobs ready for delivery. Unavailable snapshots show an unavailable state rather than proving the pilot has nothing.

## Pilot & training

1. Select **Pilot & training** and check the character/corporation/alliance strip.
2. Open the relevant tab below. Its source status and timestamp tell you how current the information is.
3. Make in-game changes in EVE, then let the collector refresh or request **Refresh ESI data**.

| Tab | What it shows |
| --- | --- |
| **Training queue** | Up to 50 pending/unfinished queue entries in queue order, target levels and remaining time; the first entry has a progress bar. Entries without a finish date show **Paused**. |
| **Skills** | Active and trained levels plus skill points per skill. The header shows total SP and the number of trained skills. |
| **Clones & implants** | Jump-clone names, locations and implants; active implants and Intelligence, Perception, Charisma, Willpower and Memory. |
| **Calendar** | Upcoming event titles, EVE times and the current response supplied by ESI. |
| **Notifications & mail** | Notification types, timestamps/read state and expandable **Show details**; recent mail subjects, senders, timestamps and read state. |

These are read-only views. Kairo does not edit the skill queue, jump clones, reply to calendar events, mark messages read or send mail. Mail bodies are not fetched by this page. Calendar and mail lists reflect their recent ESI windows rather than a complete account archive. Training times are projections from ESI's dates; the application cannot make a paused queue advance.

## Wallet & trade

Use **Wallet journal** to inspect recorded amounts, running balances, activity types and descriptions. Positive entries are inflows and negative entries are outflows; transfers, refunds and purchases are included. Use **Transactions** for the recent ESI buy/sell window, quantities, unit prices and calculated totals. The journal is collected across available pages; the transaction list is explicitly a recent window.

**Market orders** shows current orders, remaining/total volume, price, location and issue time for this character. It is different from the shared scanned order books on Markets. Kairo does not place, modify or cancel orders.

**Loyalty & standings** shows LP balances by NPC corporation and NPC standing values. These standings are not the personal/corporation/alliance contact lists used for OPSEC. LP is a current balance, not a gross earnings history; spending or donating lowers it. Use [Sessions](SESSIONS.md#ships-and-lp) to compare recorded operation balances.

## Hangar & assets

1. Open **Hangar & assets → All assets** and filter for an item or location.
2. Read quantity, **Location / container**, storage flag and reference value.
3. Use **Saved fittings** to inspect a fitting's hull, description and expandable fitted-item list, or **Contracts** to review title, type, status, price and expiry.

The top-level **ASSET REFERENCE VALUE** multiplies owned quantities by ESI market averages and excludes unpriced items. It is not an executable sale price or the value of everything at a particular trade hub. Blueprint icons and names distinguish the supplied item data, but an unpriced asset remains unpriced.

Location/container information follows the owned asset relationships. A structure name may remain unresolved when the character lacks access. This does not mean the assets are gone. Assets can take longer to refresh than location or wallet data; check the timestamp before comparing with a recent move.

Fittings and contracts are inspection views. This release does not simulate fittings, import them into EVE, accept contracts or move assets.

## Industry & planets

| Tab | Practical use and limits |
| --- | --- |
| **Industry jobs** | Review product, activity, status, runs, completion and job cost. Manufacturing, research, copying, invention and reactions use the status supplied by ESI. Active jobs show remaining time; ready jobs still need delivery in EVE. |
| **Planetary colonies** | Review planet/system/type, command-centre level, installation count, extraction-program timers where details are available, and the last update. This is an overview, not a colony layout editor. |
| **Mining ledger** | Inspect dated resource quantities and systems. ESI aggregates mining by day and can report it late; this is not a second-by-second mining meter. |
| **Blueprints** | Search the library and compare original/copy/stack, ME, TE, remaining runs and location. Originals display unlimited runs where supplied. |

All four tabs describe the selected character's authorized records, not corporation-wide operations. Kairo does not start/deliver jobs or operate planetary colonies. The planetary scope's ESI name includes `manage_planets`, but this page uses it to read colony data.

Skill and job completion events are based on observed transitions. Loading an existing history for the first time does not emit a burst of historical completion notifications. If Kairo was closed or a module/access was unavailable, some transitions may not have been observed.

## Goals and manual tasks

Goals belong to the currently selected character. When no character is connected/selected, manual goals and notes can be kept locally; automatic objectives require a connected character.

For a task or counter:

1. Open **Goals & notes → New objective**.
2. Leave **Track progress from** as **Manual checklist / counter**.
3. Enter an **Objective name** and **Target amount**. Use a target of `1` for a simple task.
4. Select **Create objective**.
5. Change the progress field to update a counter; it saves when you leave the field. **Complete** sets progress to the target. **Reopen** resets a completed manual objective to zero.

Use the trash button to delete an objective you no longer need. There is no separate to-do application or task scheduling system. A manual objective is the supported checklist/counter workflow.

## Automatic goals

Choose a tracking source in **New objective**. For a skill, item, resource or product, type its exact in-game name and press **Find**, or choose a type from your ESI records. Wait for **Selected: …**, set the target, then **Create objective**. A skill target must be level 1–5; a numeric EVE type ID is not required.

| Tracking source | Progress means |
| --- | --- |
| **Wallet balance** | Current character wallet balance, including spending and transfers. |
| **ISK received** | Positive journal entries dated after objective creation; transfers and refunds count. |
| **Train a skill** | Trained level, including completed queue entries when the queue is fresh. |
| **Collect an item** | Quantity owned across this character's assets, including containers and ships. |
| **Mine a resource** | Newly reported units after the first fresh starting sample, tracked by date/system/type. |
| **Complete manufacturing runs** | Runs of the selected product finishing after creation and reported ready or delivered. Research and invention do not count. |
| **Participate in kills** | Verified attacker participation dated after creation, including assisted and zero-damage EWAR participation. Fleet membership alone does not count. |

Automatic progress uses the same collectors and access as the other pages. Its status and **Last sample** explain whether the source is tracking, waiting, stale, incomplete, paused or unavailable. **Update EVE access** opens Connections; **Open modules** opens Settings. Refreshing objectives re-reads their current state; it does not bypass ESI caching.

Wallet and asset progress may fall before the target is reached. Once an automatic objective completes, it stays complete; subsequent spending does not reopen it or repeatedly fire a completion event. Automatic progress cannot be edited manually.

Income, mining and manufacturing retain credited records locally so repeated samples, restarts and rolling ESI windows do not double-count them. Mining starts from a fresh baseline: a daily total can arrive later, so progress measures newly reported quantity rather than the exact amount mined since a particular second. Long gaps while Kairo is closed can outlast the source's history window. Missing data is not reconstructed.

To broadcast a goal, explicitly bind a **Kairo goal** widget in [Stream studio](STREAMING.md#link-a-widget-to-kairo). The picker includes local and other connected characters' goals and retains the chosen owner. Goal titles and progress become visible only when selected for a saved stream binding or enabled notification rule.

## Private notes

In **Goals & notes → Private notes**, write up to 5,000 characters and choose **Save note**. Saved notes show their creation time and have a delete button. This page adds and deletes notes; it has no edit-in-place control. Use **Debrief & notes** inside a Session report for an editable report-specific note, or the map/place notes described in [Universe](UNIVERSE.md).

Private notes stay out of the sanitized stream output, but they are local plaintext application data and are included in private history exports. Capturing the dashboard itself in OBS can expose them. See [data retention](DATA-RETENTION.md) for backup, export and disconnect behavior.

## Common questions

| Symptom | What to check |
| --- | --- |
| A table is empty or shows a dash | Confirm the active character, owning module, scope and status. A missing source is not a successful zero result. |
| A recent in-game change is absent | Check sample time and [polling](ESI-POLLING.md). Refresh respects the upstream cache. |
| A skill/item name or structure is an ID | Name resolution may be pending or unavailable; structure names also require access. |
| A goal stopped moving | Read its tracking explanation. Stale/incomplete/disabled/unauthorized sources keep the last confirmed progress. |
| ISK received differs from profit | It includes all positive journal entries; costs and transfers require interpretation. |
| Kairo shows ready jobs but they are still in EVE | Kairo reads job status. Deliver them in the EVE client. |

Implementation references for maintainers: [page views](../components/kairo/operations.tsx), [workspace navigation](../components/kairo/workspace-navigation.mjs), [module catalog](../server/modules/catalog.mjs), [goal service](../server/goals.mjs), [goal editor](../components/kairo/goals.tsx). Behavior is covered by the existing asset-location, frontend-derived-model, goal and milestone tests in `tests/kairo/`; current release evidence is in [Validation](VALIDATION.md).
