# Kairo user guide

Use this guide for installation, local data, Goals, Markets and streaming. Detailed map, Session and hauling workflows have their own guides in the [documentation map](README.md). Release announcements are kept in [CHANGELOG.md](../CHANGELOG.md).

## Start and connect

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

### Connect a character

Open **Connections** inside Kairo. The page walks through the same setup:

1. Visit EVE's [developer applications](https://developers.eveonline.com/applications) and create an application using **Authentication & API Access**.
2. Set its callback URL to exactly `http://127.0.0.1:4380/auth/eve/callback`.
3. Add the scopes for the modules you want. Kairo lists the precise scopes and their purpose; **Pilot essentials** selects pilot telemetry and training scopes, and **All modules** selects the supported module scopes, including optional Universe fleet/structure access and EVE waypoint commands. Waypoint commands are sent only through **Send to EVE**.
4. Paste the application's **Client ID** into Kairo. The PKCE flow does **not** need your Client Secret.
5. Choose the scopes you want to authorize and click **Log in with EVE Online**. Sign in on EVE's own website, select the character and approve access.
6. Kairo verifies the returned identity, stores the tokens in its local vault, and starts collecting the authorized data. Repeat for additional characters or additional scopes.

The app cannot access private character data until you complete this setup. It ships with **no credentials, connected characters or invented live pilot data**. Public server status, public system lookup and routing work independently of character authorization.

The Client ID and callback must belong to the same EVE application. If you change the local dashboard port, update the registered callback too. Disconnect characters before changing the application's Client ID.

## Upgrade and back up

Stop Kairo with Ctrl+C, extract the new package into a new folder and run its launcher. Keep the same Windows account and any `KAIRO_DATA_DIR` override; do not run two versions at once. The application keeps its data outside the installation folder. Refresh the dashboard and OBS browser sources after an upgrade.

For older installations: the 0.7.3 migration adds a Session query index and trims only the derived market-history analysis cache to its 30-day window. Upgrading from before 0.6.0 retires old market scans/order-history responses once and queues fresh books, with Jita first; characters, hubs, goals and other player data remain. Failed scans can be resumed from Markets, and private structures may require an authorized pilot. These are existing migrations, not a new RC17 reset. See the changelog for older release-specific changes.

For a full backup, stop Kairo and copy the entire data directory. The history export does not include all database/cache or credential files. Windows credentials generally remain tied to the original user account; reconnect EVE when moving to another machine.

## Find your workspace

Use the sidebar or Ctrl+K. Times labelled EVE are UTC. Pilot, Wallet, Assets and Industry pages use your selected character's authorized snapshots; unavailable data is not presented as a successful zero result. Enable/disable modules under Settings and grant additional scopes through Connections.

- [Universe](UNIVERSE.md): Atlas, private Maps, routes, intel, signatures, notes and map replay.
- [Sessions](SESSIONS.md): recording, archived reports, combat coverage and observed travel.
- [Import Analyser](IMPORT-ANALYSER.md): trader/buyer settings, fees, cargo and saved plans.
- [ESI polling](ESI-POLLING.md): collection preferences, cache deadlines and recovery.
- [Dataset updates](DATASETS.md): background static-data updates and safe activation.

## Markets

Open **Markets** to switch between Jita, Amarr, Dodixie and Hek. NPC station markets are public: you can scan them from anywhere, with no EVE sign-in or travel required. All books are shared by your local characters, so another connected pilot can browse data scanned using an alt.

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

## OPSEC behaviour

To use organization standings, add `esi-corporations.read_contacts.v1` and `esi-alliances.read_contacts.v1` to your registered EVE application, then use **Connections → Update access** for the character. Existing scopes are retained. EVE's roles and permissions still determine which organization endpoints are available; the OPSEC page reports each source's status.

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
- Mail/calendar/transaction lists are their recent API windows. Combat verifies up to 100 unseen details per pass, drains cached backlogs and retains verified participation in its durable ledger. Public history and report settlement are bounded as described in [Sessions](SESSIONS.md).
- Session travel records are observations made while Kairo and a Session are active. ESI cannot supply past travel or every fast transit; retained legacy evidence can still appear in older reports.
- Asset values are ESI reference averages, excluding unpriced items. Station names are public; player structure names need the optional `esi-universe.read_structures.v1` scope and actual character access. Unresolvable locations remain IDs.
- Objectives support both manual and automatic tracking. Skill and job completion notifications are based on observed state transitions, so initial historical data does not produce a burst of completion notifications.
- Modules disabled in the UI stop future collection/subscriptions; already-running work may finish. Existing history remains.

Kairo Intelligence, a fitting simulator, a full EVE encyclopedia, corporation administration, hardcoded coalition lists and unattended Windows service installation are not included. The application works without any AI service.
