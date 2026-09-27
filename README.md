# Kairo — Capsuleer operations

A local EVE Online workspace with a separate, transparent OBS output service.

**Version 0.8.0-rc.12 · Universe review build · Windows first · No cloud deployment**

See the [changelog](CHANGELOG.md) for release notes.

## Download the latest release

Download **Kairo-test-build.zip** from the successful feature-branch GitHub Actions run linked in the draft PR. This release candidate awaits in-app review; the approved stable release remains available on [GitHub Releases](https://github.com/BunBajiro/kairo/releases/latest). Extract it into a new folder, stop any running Kairo instance, then open **Kairo/START_KAIRO.bat**. Node.js 24 or newer is required; the ZIP contains the compiled application and needs no npm install or local build. A SHA-256 checksum is included alongside the ZIP.

## Download a test build

1. Open [GitHub Actions](https://github.com/BunBajiro/kairo/actions/workflows/test-build.yml) and choose the latest successful **Kairo test build** run for the feature branch you want to test.
2. While signed into GitHub, click **Kairo-test-build.zip** under **Artifacts**, or use the download link in the run summary. Builds are retained for 30 days.
3. Extract the ZIP into a new folder. Stop any running Kairo instance, then open **Kairo/START_KAIRO.bat**. You need Node.js 24 or newer; no npm install or compilation is needed.

The test build uses your existing local Kairo data and settings. **Code → Download ZIP** downloads source code and does not contain the compiled application. Test builds are created on feature-branch pushes after type checks, compilation and tests of the extracted package pass; they do not merge into `main` or publish a release.

## Upgrading from an earlier version

Stop Kairo with Ctrl+C, extract this entire release to a new folder, then run **START_KAIRO.bat** there. Your existing data remains in `%LOCALAPPDATA%\Kairo`; startup preserves characters, goals, notes, journey/session history and stream layouts. Use the same Windows account and any existing `KAIRO_DATA_DIR` override. Do not run both versions at once.

Version **0.8.0-rc.12** introduces **Universe**, bringing the full New Eden atlas, local routing, live intel and your travel history into one module. **Sessions** has its own navigation entry for operation recording, archives, combat records and reports. The map works before connecting a pilot. Connect a character for standings, personal activity, saved views and private connection networks. See [the Universe guide](docs/UNIVERSE.md). The [SMT feature comparison](docs/SMT-INTEGRATION.md) distinguishes parity, Kairo improvements and browser adaptations, including EVE-Scout Thera/Turnur integration.

Configure named power blocs and their member alliances in **Settings → Universe**. Unconfigured alliances can use **Inferred Coalitions**, an explicitly uncertain fallback from combat evidence collected locally. Crisp vector borders, separate K-Space and J-Space navigation under Universe, bounded zoom and larger visual controls make the political map easier to read. Replay keeps recorded travel while hiding routine system-entry and OPSEC event cards.

Universe opens as an immersive map workspace by default, with a collapsible details dock, direct territory exploration, regional holdings, physical stargate frontiers and unified system/region/territory search. Fluid navigation, an overview inset and route framing keep travel and political exploration connected. Primary controls use 16px text; motion respects reduced-motion settings and settles when idle. Distinct political territories use unique colours, with Caldari blue, Gallente teal, Amarr gold and Minmatar rust reserved for their factions.

J-Space opens directly into a dedicated chain workspace: compact class/name/static cards, responsive dragging, visible drag-to-connect handles, offline effect reference, saved positions and locks, scanner linkage, passage records and observations. Static hole codes appear on hover; drawn links begin unconfirmed with unknown expiry. Journey and Ansiblex management stay in K-Space. Separate named maps can be imported from Wanderer or exported for transfer. See the [Wanderer feature comparison](docs/WANDERER-INTEGRATION.md) for verified coverage and the remaining collaboration boundaries.

Thera and Turnur entrances appear directly on the map. Hover a symbol for its meaning, click or tap for connection details and nearby actions, or use the keyboard-accessible Symbols list. J-Space centres on known systems, wormhole classes and connections; its internal regions are not presented as destinations.

Existing visits, sessions and notes are retained. The old Journey navigation opens **Universe → K-Space → Journey**. Its separate module and map are retired; observed travel is never imported as a verified routing network. There is no data reset in this build.

Version 0.7.3 includes the optimisation/refactoring pass and its database follow-up. No data reset is required when upgrading from 0.7.2 or the earlier 0.7.3 review build. The first start adds a session-query index and trims the derived market-history cache to its saved 30-day analysis window; daily archive rows and player data are retained. A large existing cache can make this first start take longer. Upgrading from the approved 0.7.3-rc.1 retains its completed database migration.

Version 0.7.0 added a separate **Buying character** to **Markets → Import Analyser**. Choose a connected Jita buyer or keep **Same as selling character**, apply the settings and use **Update trader data**. Immediate purchases have no buyer tax or broker fee; resale fees still use the selling character. New saved plans record both pilots, and older plans remain usable. Upgrading from 0.6.0 preserves market scans and other local data, with no new scopes or data reset.

Version 0.6.0 added **Markets → Import Analyser**, shared EVE Ref regional histories for Jita, Amarr, Dodixie and Hek, and saved import plans. Recommendations use Jita sell depth, the selected trader’s fee profile, estimated demand and your cargo capacity. Market comparisons now use the lowest local and Jita sell prices; scan reminders wait at least 24 hours.

**When upgrading from a version older than 0.6.0, Kairo retires previous market scans and their cached order/history responses once.** Kairo automatically queues fresh books for previously scanned, enabled hubs, with the Jita reference first. It preserves your hub list, quick-scan basket, characters, polling preferences and other player data. Previously full-scanned hubs receive a full refresh; others receive a quick refresh. Follow the progress banner in Markets. Failed or cancelled refreshes pause with a **Resume fresh scans** control; private structures may require reconnecting an authorized alt. Disabling Markets pauses this work. Future restarts retain the newly scanned data. Refresh the dashboard after starting the new release.

No new scopes are introduced, but the analyser requires the chosen selling character’s skills, NPC standings and open orders. Use **Update trader data** after choosing that character. A structure’s actual total broker fee must be entered because ESI does not expose it. See [the Import Analyser guide](docs/IMPORT-ANALYSER.md) for assumptions, fees and a first import.

Version 0.5.2 optimizes ESI collection and adds **Settings → ESI polling**. Tune 35 data batches with snapped sliders, readable descriptions and recommended defaults. Skill queue checks default to one minute; slower routine collectors reuse data between checks. Protection keeps its priority and freshness rules. Per-ID names, persistent retry backoff and shared market cache reuse reduce redundant requests. Existing Modules and Appearance controls now live in Settings. That release needed no new EVE scopes or data reset.

Version 0.5.1 adds EVE’s nested market category browser: expandable branches, cached-item counts and breadcrumbs. Choose a category to browse it and its descendants, or search across all cached offerings. Categories are bundled locally from CCP’s SDE, so existing scans are categorized immediately and browsing makes no ESI requests. New types absent from the bundled catalog remain visible under **Uncategorized**.

Version 0.5 adds a shared market desk with hub scans, Jita comparisons and regional reports. Goal widgets return as a dedicated template; all widgets now match the compact toast surfaces. The Journey region atlas stays within the page as you explore. Existing local data and layouts migrate automatically.

Version 0.4 counts every verified killmail attacker, adds public zKillboard participation collection and durable combat history, gives the journey map reversible connection pruning, and adds seven automatic goal sources. Existing manual goals, sessions, visits, notes, OPSEC settings and the compact toast layout are retained. Restart Kairo, then refresh the dashboard and OBS browser sources after upgrading.

Version 0.3.1 makes stream toasts 82px tall at the existing 440px width. Each toast shows a small event category and timestamp, then up to two lines of message context. The separate title is removed; an older saved title is used only if its message is empty. Studio previews use the same layout. Restart Kairo and refresh the dashboard and OBS browser sources to load the compact design.

Version 0.3 adds corporation/alliance standings, the full space-category set, readable sovereignty owners, subtle page transitions and a shared Signal frame style for studio widgets and broadcast output. It retains the 0.2.1 jump-continuity and five-entry activity fixes. Refresh your dashboard and OBS browser sources after upgrading to load the new interface and renderer.

**Enable organization standings:** add `esi-corporations.read_contacts.v1` and `esi-alliances.read_contacts.v1` to your registered EVE application, then open **Connections → Update access** for your character. This retains existing scopes and adds the OPSEC contact permissions. EVE may restrict organization endpoints for your character; the OPSEC page shows each source's availability. Signing in again is required to grant new permissions.

Version 0.2.1 fixes protection flicker during cache refreshes and brief jumps, prioritizes protection telemetry over slower collectors, and limits activity to five entries per page. Older events remain available through Older/Newer controls, full-history search and export. Existing recorded transitions are preserved.

Version 0.2 introduced record-linked widgets, contextual toasts, local OBS control, named session reports, editable place details and a visual journey atlas. Existing toast wording stays as saved; choose **Use event context** to adopt the new templates.

## Start here

1. Install **Node.js 24 or newer** from <https://nodejs.org/> if it is not already installed.
2. Extract the entire ZIP to a folder on your computer. Do not run the launcher from inside the ZIP.
3. Double-click **START_KAIRO.bat**. Kairo opens your browser after the local services are ready.
4. Keep that window open while playing or streaming. Press **Ctrl+C** in it to stop Kairo cleanly.

The release includes the compiled website. **No npm install or frontend build is needed to run it.**

- Dashboard: <http://127.0.0.1:4380>
- OBS canvas: <http://127.0.0.1:4381/stream>
- Toasts only: <http://127.0.0.1:4381/stream/toasts>
- OPSEC covers only: <http://127.0.0.1:4381/stream/opsec>

Both services bind to `127.0.0.1`. No public or LAN listener is created. Kairo makes outbound HTTPS requests to EVE SSO, ESI and EVE’s image service when needed, plus public zKillboard participation requests while Combat is enabled, and EVE Ref daily history downloads during core-hub market refreshes. Universe also reads EVE-Scout public connection/storm reports and, when explicitly enabled, the public zKillboard R2Z2 stream.

On Linux/macOS, use `./start-kairo.sh` with Node.js 24+. Windows credential protection is the primary target; see the storage notes below for other platforms.

## Connect Bun Bajiro, or another character

Open **Connections** inside Kairo. The page walks through the same setup:

1. Visit EVE's [developer applications](https://developers.eveonline.com/applications) and create an application using **Authentication & API Access**.
2. Set its callback URL to exactly `http://127.0.0.1:4380/auth/eve/callback`.
3. Add the scopes for the modules you want. Kairo lists the precise scopes and their purpose; **Pilot essentials** selects pilot telemetry and training scopes, and **All modules** selects the supported module scopes, including optional Universe fleet/structure access and EVE waypoint commands. Waypoint commands are sent only through **Send to EVE**.
4. Paste the application's **Client ID** into Kairo. The PKCE flow does **not** need your Client Secret.
5. Choose the scopes you want to authorize and click **Log in with EVE Online**. Sign in on EVE's own website, select the character and approve access.
6. Kairo verifies the returned identity, stores the tokens in its local vault, and starts collecting the authorized data. Repeat for additional characters or additional scopes.

The app cannot access private character data until you complete this setup. It ships with **no credentials, connected characters or invented live pilot data**. Public server status, public system lookup and routing work independently of character authorization.

The Client ID and callback must belong to the same EVE application. If you change the local dashboard port, update the registered callback too. Disconnect characters before changing the application's Client ID.

## What is included

| Workspace | Working capabilities |
| --- | --- |
| Command centre | Current hull and system; pilot context; wallet, skills and industry summaries; wallet history chart; recent activity and goals |
| Pilot & training | Live queue, trained skills, attributes, implants, jump clones, calendar, EVE notifications and recent mail headers |
| Wallet & markets | Wallet balance, journal, recent transactions, open orders, loyalty points and NPC standings |
| Hangar & assets | Searchable inventory, nested asset location resolution, ESI reference valuations, saved fittings and contracts |
| Industry & planets | Manufacturing/research jobs, planetary colonies and extractor expiry, mining ledger and blueprints |
| Sessions | Independent operation recording, archived reports, combat records, debriefs and session-bound map replay with smooth camera follow and a scrubbable event timeline |
| Universe | Full New Eden atlas; configured/inferred power blocs; gate/capital itineraries; SMT Ansiblex import/export; EVE-Scout connections; private intel, fleet and local logs; signatures/infrastructure notebook; public signals; tactical window and historical replay |
| Goals & notes | Manual and ESI-tracked objectives, completion events and private notes |
| Markets | Shared hub caches, category browser, quick/full scans, alt access, EVE Ref history, Jita comparisons, Import Analyser and saved hauling plans |
| Stream studio | Canvas editor, drag/keyboard positioning, element properties, layer visibility, duplication, record-specific module bindings, individual widget source URLs and live saved-output preview |
| Notification rules | Explicit opt-in events, context templates, character filters, location redaction, custom wording, duration, cooldown, delay, position, sound and test controls |
| OPSEC | Manual cover override; character selection; friendly/hostile sovereignty policies; FW detection; unknown/stale context stays hidden; OBS state actions for sources, filters, audio and program scenes |
| Settings | Enable/disable modules; adjustable ESI polling batches with recommended defaults; three interface accents |
| Connections | PKCE SSO, character selection, scope controls, encrypted persistence, automatic refresh and disconnect |

Use the sidebar or **Ctrl+K** to jump between modules. Tables support filtering, sorting and paging. All times labelled EVE are UTC.

## ESI polling preferences

Open **Settings → ESI polling**, choose a module or search for a batch, then drag its slider or click a labelled point. The marker shows the recommended interval. Each batch explains what it updates and which reports, goals or widgets use it. Click **Save changes** to apply the displayed preferences to all connected characters. **Restore recommended** resets the draft; save it to apply the reset. Disabled modules remain disabled.

The skill queue defaults to **one minute**, including when a skill has days remaining. Trained skills default to ten minutes; known completions can bring checks forward. Current ship defaults to one minute, with docking and login hints. Countdown displays update locally between ESI checks.

ESI cache expiry and server cooldowns always take precedence. **Auto** follows ESI cache timing. Location offers 5, 10 or 15 seconds; OPSEC still rejects observations at 30 seconds. Protection context follows ESI cache timing whenever the selected protected pilot needs it, even if a slower routine interval is chosen. Market scans stay manual. [The complete collection policy](docs/ESI-POLLING.md) explains each default and the shared cache behavior.

## Markets

Open **Markets** to switch between Jita, Amarr, Dodixie and Hek. NPC station markets are public: you can scan them from anywhere, with no EVE sign-in or travel required. All books are shared by your local characters, so Bun Bajiro can browse data scanned using an alt.

- **Quick scan** collects 27 common supplies by default: paste, ammunition, cap boosters, drones, deployables, fuel and Tritanium. **Edit quick-scan supplies** adds exact item names or removes goods, up to 80 types. Editing the basket never deletes older cached items.
- **Full scan** reads every order page, resolves item names and saves a complete station book. The four core hubs share EVE Ref daily archives for their regional histories; custom hubs collect ESI histories per item. The first archive import downloads up to 30 days, then reuses them across all four hubs. Large custom hubs can take longer; the book is browsable as soon as it is saved.
- **Include Jita reference** also scans the matching quick basket or full Jita book. The Jita reference has its own observed date. It is shared across every hub report.
- One scan runs at a time. Continue using Kairo while it works, or **Cancel scan**. Completed books remain available. If history collection stops, **Update history** reuses the book and skips unchanged archives or ESI histories still inside their cache window. After a restart, an interrupted scan is clearly marked; start it again to reuse cached responses.
- **Last scanned**, **Data observed**, the scan character and **Last full book** distinguish a recent quick refresh from an older full scan. Each item keeps its own observation and expiry dates. Update suggestions begin after 24 hours, independently of ESI’s shorter HTTP cache lifetime. Stale data is retained indefinitely; browsing does not scan or prune books. The one-time upgrade refresh described above is the exception to manual scanning.

Use **Manage hubs** to find NPC market stations by system name, use the selected scan character’s current location, or enter a station/structure ID and optional nickname. Up to 32 hubs may be followed. Removing one hides it while preserving its cache; re-add the same location to recover it. **Restore core hubs** brings the four default hubs back.

For an Upwell structure, add `esi-universe.read_structures.v1` and `esi-markets.structure_markets.v1` to your EVE application, select Markets in **Connections**, and update the alt’s access. Choose that alt under **Scan access**. The alt needs actual structure access; being in the same system alone does not grant it. ESI supplies every structure order page even for a quick scan, so these quick scans only reduce retained items and history work, not the structure order download. **Use scan character’s location** also needs the location scope. No buy/sell orders are placed or modified.

The browser opens with an expandable category tree matching EVE’s market groups. Selecting a parent includes all its subcategories; breadcrumbs let you move back up. Counts refer to the selected hub’s cached types, including those without sellers. Search spans all cached items; **All items** also remains available. Categories and item assignments come from CCP SDE build 3494416, bundled with this release. The browser searches and pages only the selected category in the local cache. Select an item for local buyers/sellers, quantity, order minimum/range, expiry and per-order Jita percentages. Best buy means the highest buy order **placed at this station**; ranged buy orders originating elsewhere are excluded. Local listing average is the sell-quantity-weighted asking price, not an average of completed station trades. **Regional history** shows completed daily prices/volumes and a 30-calendar-day volume-weighted average; days with no reported trades contribute zero volume. Item/category details can be loaded on demand.

**Hub report** screens for high lowest local sell prices versus the lowest Jita sell price, thin supply, prices below Jita’s best sell, and large local bid/ask spreads. The browser uses the same lowest-price comparison. Thresholds are editable; unscanned prices are never zero. Both EVE Ref and ESI trading histories cover the **region**, not the station. Thin supply is station quantity divided by the region’s daily average volume, using at least seven reported trading days and a current history response. This is a screening ratio, not a prediction of local sellout time. Scan dates and missing coverage remain visible. Listing averages remain descriptive only. Browser/report price differences exclude taxes, fees and hauling; the Import Analyser models these costs separately.

**Import Analyser** groups up to ten qualifying imports per category, including Ships, Ship Equipment & Drones (with rigs/subsystems), and Ammunition. Choose the **selling character** and **buying character** (or use the seller for both), enter your cargo capacity and purchasing budget, and apply. Update trader data, scan the destination with a Jita reference, then analyse. Cards compare **Anchoring Price** and **Profiteering Price** with quantities, durations, net returns, supply signals and trips. Open a card for regional volume windows, alternative quantities/prices, fee breakdowns and real Jita price tiers. Add choices to a draft, review the combined loads and save a named plan. Saved plans retain both pilots and their dated inputs; use one as a draft to reprice it.

Activity screens use regional trading volume multiplied by an editable assumed hub share. There is no station-level executed-volume feed. Cargo uses repackaged item volume; large hulls cannot be split across trips. Connected characters’ active local sell listings are excluded when their authorized order snapshots are available; the interface shows missing alt coverage. Neither recommendations nor plans place orders. Existing market data scanned by an alt remains usable by every local character.

The EVE Ref command is a separate database importer, so this release uses a lightweight local importer for the [same daily archive dataset](https://docs.everef.net/datasets/market-history.html). It needs no Docker or additional database. Only the four named hubs use that source; custom hubs keep ESI histories.

Market API semantics and scope requirements were checked against CCP’s [current OpenAPI specification](https://esi.evetech.net/meta/openapi.json) and [API Explorer](https://developers.eveonline.com/api-explorer). Scans use the existing shared ESI cache and protection-priority request scheduler.

## Stream Studio

The stream canvas starts **completely transparent and empty**. It has no dashboard navigation, labels, background, default widgets or default toasts. The checkerboard belongs only to the editor.

1. Add a Browser Source in OBS or Streamlabs.
2. Paste `http://127.0.0.1:4381/stream` and set **1920 × 1080**.
3. Keep the source loaded when it is inactive.
4. In **Stream studio**, add templates, drag them into position, edit their properties and click **Save changes**.
5. Send a **Test toast** and check **Live output**. All already-loaded browser sources update without reloading.

Widgets support **Signal surface** (the same restrained gradient, slim accent rail, readable text and thin progress line as toasts) or **Minimal / plain filler**. Blank fillers retain their flat adjustable black background. Covers remain opaque and appear immediately. Countdown/clock numerals use steady widths; progress animates without restarting on every refresh. Ordinary widget entrances, page changes and toast arrivals use short transitions, respecting reduced-motion preferences. Compact toast headers show an approved event category and EVE timestamp, with separate accents for losses and protection events. The message is the main content; longer text is capped at two lines with an ellipsis, and the lifetime indicator sits on the bottom edge.

Available templates: blank panels/fillers, text, lower thirds, countdowns, EVE clock, Kairo goals, progress bars, OPSEC covers and dividers. Use a blank panel for the requested flat translucent black filler. Text and labels are optional. For a single element, select it and copy its widget-specific URL.

To link a widget, select **Pull from Kairo** in its properties and choose a character and data source. For an objective, add **Kairo goal** and select any existing goal from the picker. Each option identifies its owning character; local and alt goals appear together. The chosen owner is retained with the binding. Choose title, numbers, or both; the bar follows progress automatically. Saving approves these fields for broadcast.

Text widgets also support session timers, current-session kill/loss counts, completed goal counts, wallet balance and current hull. Training and industry bindings support titles, progress and countdowns. Missing, stale or disabled sources show an unavailable state instead of retaining a live-looking value. Goal names and financial values can be visible when explicitly selected. Record IDs, raw snapshots, notes and credentials do not accompany display values.

To configure toasts, open **Notification rules**, enable the events you want, write their stream wording, set duration/cooldown/delay/sound, then **Save changes**. Use **Use event context** for a suggested template, or insert the available `{{fields}}` into your text. Examples: `{{hull}}`, `{{attackers}}`, `{{goal}}`, `{{skill}}`, `{{state}}`, `{{previous}}`, `{{reason}}`. Put the key detail first: the stream shows at most two lines. The editor shows a matching example preview. Character filters limit automatic emissions.

`{{system}}` and `{{region}}` are redacted while protection is engaged unless you explicitly enable **Allow location fields while protected**. This is checked at display time, including delayed and already-visible notifications. **Test saved rule** uses saved settings and clearly illustrative example context. Rules are disabled by default; tests are deliberate manual emissions. At most three notifications are visible at once. Pause clears pending notifications; OPSEC covers remain active.

Sounds need browser-source audio enabled in OBS/Streamlabs. Browser audio policy can also suppress sound; text notifications continue normally. Direct control is available through the separate OBS connection below. Browser sources continue to work in OBS/Streamlabs; direct automation requires an OBS Studio-compatible WebSocket 5 server.

## OBS state actions

1. In OBS Studio, open **Tools → WebSocket Server Settings**, enable the server and authentication, and note the password and port (normally 4455).
2. In Kairo **OPSEC control → Control OBS directly**, enable the local connection, enter those settings and click **Save & connect**.
3. Click **Read OBS targets**. Configure actions for Blue, Hostile, Low-Sec, Neutral, High-Sec, Triglavian Space, Anoikis and Unknown, plus the Manual and Faction Warfare overrides. A source action targets its specific occurrence inside a scene or group; nested scenes can also be selected as scene items.
4. Add source show/hide, input mute/unmute, filter enable/disable, or program scene switches. **Copy to all protected states** copies the selected protected-state configuration; set High-Sec separately.
5. Enable **Apply actions automatically** and save. This immediately applies the current state. The status and action log show success or the failed target. **Apply current state** reapplies the saved current state.

Unlisted targets remain as they are. Hides and mutes execute before filters, reveals and scene switches. A failed protective action blocks subsequent reveals and switches; other protective actions are still attempted. Kairo rechecks the scene collection and the source identity before changing scene items. State changes cancel obsolete queued actions. Reconnection applies the latest state, without replaying old transitions. Authentication rejection or a server kick requires manual reconnection.

A scene switch changes the live program output, including when OBS Studio Mode is active. Kairo does not start or stop streaming or recording. OBS automation supplements your browser-source covers. When the WebSocket is disconnected it cannot change OBS itself; keep covers configured and loaded. Setup reference: [OBS remote control guide](https://obsproject.com/kb/remote-control-guide).

On upgrade, Low-Sec, Neutral, Triglavian and Anoikis inherit your previous Unknown actions. High-Sec inherits Safe actions if high-sec cover release was already enabled; otherwise it retains Unknown actions. In that case the old Safe rules remain available through **Use previous Safe actions** in the High-Sec editor. Existing Blue, Hostile, FW and Manual rules are preserved. Saving an empty list later is intentional and does not trigger inheritance again.

## Sessions, reports and your New Eden atlas

Version **0.7.2** adds a summary card for the session’s duration, travel, personal/alliance combat, wallet and LP changes, with missing or delayed data clearly labelled. It highlights the most active system by unique personal/alliance killmails, falling back to the most total observed time for quiet sessions. It aligns the activity cards into consistent rows and brings their typography, metric sections, status footers and detail panels in line with the Import Analyser. Opening a card shows its detail across the full row; narrow screens stack the cards and show LP values without sideways scrolling. The [v0.7.2 release](https://github.com/BunBajiro/kairo/releases/tag/v0.7.2) was approved after review of its feature-branch test build.

Alliance killmails now count as **either a kill or a loss**. An alliance victim is a loss even when friendly attackers appear; its value never adds to destroyed ISK. Other victims count as kills when your alliance appears among their attackers. Your own kills/losses remain included in alliance totals. Existing saved killmails use the corrected calculation automatically.

Version **0.7.1** expands the session overview into clickable cards for **all observed visits**, ships flown, personal combat, alliance combat, personal LP changes, wallet activity, milestones and the timeline. Alliance combat only adds a ±10-minute tracking buffer to a visit when an alliance kill or loss occurs during that visit. Every other visit stays in the route. [Sessions guide and collection rules](docs/SESSIONS.md).

Existing sessions retain their saved visits and events, but uncaptured alliance, LP and starting-ship baselines cannot be reconstructed. New sessions capture these baselines when the relevant modules and permissions are available. Battle Reports remain separate future work.

**Sessions → Start session** asks for a name. **End session** opens its report. Open any entry in **Sessions** to revisit it, rename it or add a debrief. The report includes recorded events, combat counts, goal completions, training levels, ready industry jobs, ship changes, observed travel, journal inflows/outflows and a wallet/SP comparison when start/end samples are available. A live session also has **Live report** and **Refresh report** controls.

**Kills mean participation**, including zero-damage EWAR entries in the killmail’s attacker list. Personal ESI only supplies losses and final blows, so Kairo supplements it with public zKillboard references and verifies the full killmail through ESI. It never infers credit solely from fleet/corporation membership. Private killmails are not uploaded to zKillboard.

The public history API withholds records under five minutes old and has a one-hour client cache. **Live sessions** also check zKillboard's incremental feed about every **two minutes**. That fast feed stops for a session when it ends; pending and delayed history checks continue under source cache/rate limits until **24 hours after session end**. After that, opening or refreshing the report reads saved records without starting collection. The summary identifies live, settling and archived sessions. Unpublished kills and logistics/fleet contributions absent from the attacker list remain unavailable. Source status and timing appear beside the combat record and inside each report. Initial historical imports do not replay old kill toasts.

Personal ESI references are paged across its 90-day window. Public backfill also covers up to 90 days, within zKillboard’s 100-page API limit. At most 100 unseen details are verified per pass; an initial backlog continues from cached references. A partial/source error is shown rather than claiming a complete combat record. The recent table shows up to 200 records; previously collected session events remain in local history.

Reports are based on observations and event timestamps. Missing scopes, disabled modules, ESI cache delays and time spent with Kairo closed limit coverage. Events that arrive late can enter an earlier report if their occurrence time is inside that session. Existing 0.1 sessions retain historical events and visits, but cannot reconstruct start/end wallet or SP samples that were never captured.

**Universe → K-Space → Journey → Systems visited** retains the observed system ledger. Use the **My footprint** map preset or **Your visits** indicator to explore this history on the full atlas. ESI can miss brief transits; visits are observations and do not establish usable connections. The earlier Journey connection-pruning data is retained for compatibility but does not affect the new routing graph.

In a selected Universe system, open **Field notes** to edit system, constellation or region notes, tags and personal markers. Notes remain local and never appear in OBS automatically. They do not change OPSEC policy.

## Automatic goals

Open **Goals & notes → New objective**, then choose **Track progress from**. Name the goal and set its target. For a skill, item, resource or product, use its exact in-game name with **Find**, or pick from your ESI records. Kairo resolves the type name; you do not need an EVE type ID.

| Tracking source | How progress works |
| --- | --- |
| Wallet balance | Your current character wallet balance, including transfers and spending |
| ISK received | Positive journal entries dated after creation; transfers and refunds count too |
| Train a skill | Trained level 1–5, applying completed queue entries when that queue is fresh |
| Collect an item | Quantity owned across your character’s assets, including containers and ships |
| Mine a resource | Newly reported units after the first fresh starting sample, tracked by date/system/type |
| Complete manufacturing runs | Runs for the selected product that finish after creation and are reported ready or delivered; research/invention are excluded |
| Participate in kills | Verified attacker participation dated after creation, including assisted kills |

Automatic goals use the same authorized ESI scopes and cached collectors as the rest of Kairo. Source availability and sample time are shown on the goal. Stale, incomplete, disabled or unauthorized sources retain the last confirmed progress. Combat goals can count confirmed records while awaiting additional public records. Use **Update EVE access** or **Open modules** when a source is unavailable.

Wallet balance and asset quantity can fall while a goal is in progress. Once a goal is reached, it stays completed; spending ISK afterward does not reopen it or repeatedly fire completion notifications. Manual checklists/counters retain their existing controls. Automatic progress cannot be overwritten manually.

Income, mining and manufacturing keep a local per-record ledger so repeats, restarts and records falling out of ESI’s rolling windows do not double-count or remove credited progress. Mining is aggregated by EVE day and may arrive late, so the baseline measures newly reported quantities, not the exact amount mined after a particular second. Time with Kairo closed can leave gaps longer than the source’s history window.

Existing **Goals · an existing objective** Studio bindings work with automatic goals too. Completion uses the existing goal event/toast rules. Progress does not add a timeline event on every refresh.

## OPSEC behaviour

Create and position an **OPSEC cover** over each region of the EVE UI you want protected. Covers use the requested `//Element Disabled` and `//IMPERIUM BROADCAST RULES` wording by default.

| Space category | Classification |
| --- | --- |
| Blue | Excellent (+10) or Good (+5) standing; own alliance or explicit blue override |
| Hostile | Terrible (−10) or Bad (−5) standing; explicit hostile override |
| Low-Sec | Displayed security 0.1–0.4 in known space |
| Neutral | Neutral or no standing for the sovereignty holder in available lists; unclaimed/null-sec without an alliance holder |
| High-Sec | Displayed security 0.5–1.0 in known space; covers remain unless explicitly released |
| Triglavian Space | Pochven or identified Abyssal Deadspace |
| Anoikis | Identified wormhole/J-space systems |
| Unknown | Missing, outdated or unsupported classification data |

Manual protection remains an override, and detected faction-warfare systems retain the FW override and its OBS actions. Classification order is manual, special space, FW, sovereignty standings, then security. Each category has its own OBS action list. Covers remain required for every category other than explicitly released High-Sec.

Explicit Blue/Hostile IDs take precedence, then your own alliance. For other sovereignty holders Kairo uses the first matching alliance entry from available personal, corporation, then alliance contacts. A matching Neutral entry is also explicit. Both positive standing levels are Blue and both negative levels are Hostile. The protection reason identifies the level and source; the access panel shows which lists are available. Missing/failed requested data is not treated as an empty list. Organization snapshots are bound to the current corporation/alliance ID and cannot survive a membership change as valid contacts. Contact lists truncated at the pagination ceiling are excluded from classification.

Public sovereignty holders are resolved through ESI's name service, including looked-up systems. Failed name requests show an unavailable label; Kairo does not invent an alliance name. Coalition membership itself is not inferred from a name or a hardcoded coalition list.

Cache expiry schedules a refresh; it does not immediately discard recent protection evidence. Location must be less than 30 seconds old; other required context has a bounded 30-second refresh allowance after expiry. Brief location/context gaps retain the last covered category and its OBS actions, displaying **Updating · Covered** privately. Continuity ends at most 30 seconds after the last verified location, or earlier if required context expires. Released High-Sec never carries through missing location. Routine refreshes and held states do not produce extra protection-change events or toasts.

Abyssal/Anoikis classification uses CCP's [documented system and region ID ranges](https://developers.eveonline.com/docs/guides/id-ranges/); Pochven uses region 10000070. If ESI does not provide a usable location observation, Kairo cannot infer an Abyssal transit and uses the same bounded continuity/Unknown behavior. Missing Pochven region context remains Unknown rather than being assumed neutral.

Protection covers are opaque. The display retains enabled cover geometry when its local event connection fails, uses Unknown, and remembers the last sanitized layout for reconnects. This behaviour depends on having loaded and saved your covers first.

ESI is polled, so context changes can be delayed or missed between samples. Keep manual protection enabled whenever immediate concealment is required. **Test the actual regions, sources, startup/reload behaviour and scene transitions in OBS before relying on them during a broadcast.** OBS rendering and real EVE sign-in still need validation on your PC; they were not exercised on your Windows account during this build.

## Data, privacy and persistence

Windows data location: `%LOCALAPPDATA%\Kairo`.

Other platforms: `$XDG_DATA_HOME/Kairo`, or `~/.local/share/Kairo` when unset.

- `kairo.sqlite`: settings, snapshots, ESI cache, local history, reports, goals, notes and place details.
- Windows: a random encryption key protected by **Windows DPAPI CurrentUser**, stored as `vault.dpapi`; tokens and the OBS password are encrypted using **AES-256-GCM**.
- Linux/macOS: `vault.key` is a local key with restrictive file permissions. It is not integrated with Keychain or Secret Service in this release.
- Tokens stay in the backend. They are not returned in bootstrap/state/export data or put in browser storage.
- The OBS service has its own origin, a read-only route allowlist, sanitized state and a restrictive content security policy. It cannot serve the dashboard's API.
- Dashboard writes require a local session, an origin check and a CSRF token. Unexpected Host headers are rejected.

This is protection for a local companion, not a sandbox against malicious software running under your own operating-system account. Historical activity and cached character data are local files, not a fully encrypted database.

The private **Export history** action excludes tokens and bulk ESI/market books, but includes your notes, goals, travel history, hub configuration, quick-scan item IDs, import settings and saved import plans. Treat the export as private. For a full manual backup, stop Kairo and copy the entire data directory. DPAPI-backed credentials generally remain tied to the original Windows user/account; on another machine, reconnect EVE instead of expecting the credential vault to transfer.

Disconnect removes local tokens and per-character ESI snapshots/cache. It preserves history, goals, notes and shared market books scanned using that character. Use EVE's own Authorized Applications page to revoke the authorization at the provider as well. No data is uploaded to a Kairo cloud service.

## Reliability and collection limits

- ESI compatibility date: **2026-09-04**. The updated sovereignty and POST routing APIs are used.
- The shared service respects ESI expiry/Cache-Control, ETags and 304s, deduplicates concurrent requests and limits concurrent requests to four.
- Rate/error limits are observed; failures preserve prior data as stale and are retried on the scheduler. Protected-character location and required context have a priority refresh path independent of long asset or industry collections, while sharing cache deduplication and the four-request concurrency limit. Transient location failures start with a three-second retry and back off to at most fifteen seconds; explicit ESI cooldowns still take precedence. Other failing resources use longer persistent backoff, and known rate-limit groups cool down independently.
- Scheduled X-Pages datasets collect up to 250 pages and identify capped results. User-triggered market scans have a separate 2,000-page / two-million-order ceiling per hub and reject incomplete books.
- Mail/calendar/transaction lists are their recent API windows. Combat verifies up to 100 unseen details per pass, drains cached backlogs and retains verified participation in its durable ledger. Public history is bounded as described above.
- Journey records are observations made while Kairo is running. ESI cannot supply past travel or every fast transit.
- Asset values are ESI reference averages, excluding unpriced items. Station names are public; player structure names need the optional `esi-universe.read_structures.v1` scope and actual character access. Unresolvable locations remain IDs.
- Objectives support both manual and automatic tracking. Skill and job completion notifications are based on observed state transitions, so initial historical data does not produce a burst of completion notifications.
- Modules disabled in the UI stop future collection/subscriptions; already-running work may finish. Existing history remains.

Kairo Intelligence, a fitting simulator, a full EVE encyclopedia, corporation administration, hardcoded coalition lists and unattended Windows service installation are not included. The application works without any AI service.

## Developer notes

Develop changes and new versions on a feature branch and open a draft pull request for review and testing. Do not push directly to `main` or merge until the user explicitly approves after review. See [AGENTS.md](AGENTS.md).

Record completed, user-visible changes under **Unreleased** in [CHANGELOG.md](CHANGELOG.md), grouped as Added, Changed, Fixed, Removed or Security where applicable. When releasing, move those entries under the released version and date (`YYYY-MM-DD`), then start a fresh Unreleased section. Include upgrade steps or data changes where needed; keep planned work outside the changelog.

The source is included alongside the compiled release. The frontend uses the retained React/Vinext Sites starter; the shipped runtime is a standalone Node local service, not a hosted Worker.

- `npm run start:local` — start the compiled release.
- `npm run test:kairo` — local contract/integration tests with isolated temporary data.
- `npm run check:kairo` — application TypeScript checks (after installing source dependencies).
- `npm run build` — compile the frontend using the retained toolchain (Linux/WSL; build helper uses Bash and GNU timeout).

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for module boundaries and [docs/VALIDATION.md](docs/VALIDATION.md) for the checks and their limits. The complete Sites scaffold is retained for source work; do not deploy it to a public host with this local-only runtime design.

EVE Online and its game assets belong to their respective owners. Kairo is an independent, unofficial companion.

Participation source: [current zKillboard API documentation](https://zkillboard.com/api/docs/). ESI schemas: [EVE API Explorer](https://developers.eveonline.com/api-explorer).
