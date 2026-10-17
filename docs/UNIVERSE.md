# Universe: Atlas, Maps and navigation

[Documentation index](README.md) · [Setup and data care](USER-GUIDE.md) · [Sessions](SESSIONS.md) · [Troubleshooting](TROUBLESHOOTING.md)

This guide describes the **0.8.0 feature set in candidate `0.8.0-rc.17`**. It is not a stable-release announcement. Current review evidence and environment-specific limits are recorded in [Validation](VALIDATION.md).

Universe has three sidebar entries:

| Workspace | Use it for |
| --- | --- |
| **Atlas** | Explore New Eden, inspect systems and political territory, compare activity, and plan travel. |
| **Maps** | Keep private layouts of wormhole chains, known-space systems and permanent travel networks, with independent observations and notes. |
| **Universe settings** | Manage Ansiblex networks, pins, power blocs, map display preferences, operational sources and alerts. |

[Sessions](SESSIONS.md) remains a separate workspace. Its **Show on Map** action opens a recording inside Universe; it does not turn that recording into a live chain map. The former standalone Journey visit log and lifetime counters are retired.

## Choose a task

- [Explore Atlas](#explore-the-atlas), [read political territory](#power-blocs-and-inferred-coalitions) or [read public reports](#eve-scout-thera-turnur-and-storms).
- [Create a map](#create-and-open-a-map), [add and arrange systems](#add-and-arrange-systems) or [configure tracking and scope](#tracking-and-map-scope).
- [Record a connection](#record-and-maintain-connections), [use Scanner](#scanner-and-bookmarks), [record reports](#reports-ownership-and-notes) or [log passages](#passage-ledger).
- [Plan a route](#routes-and-special-connections), [compare jump range](#jump-routes-and-range) or [find an exit or service](#find-an-exit-or-service).
- [Import or export a map](#import-export-and-duplicate-maps), [import Ansiblexes](#ansiblex-lists-and-smt-migration) or [configure sources and alerts](#operational-sources-and-alerts).
- [Understand cleanup](#expiry-removal-and-undo), [settings and saving](#universe-settings-and-saving), [data scope](#data-and-privacy) or [unexpected results](#common-questions-and-troubleshooting).

## Explore the atlas

1. Open **Universe → Atlas**. The bundled static map is available without connecting an EVE pilot. Connect and select a pilot for personal standings and permission-dependent observations.
2. Search for a system, known-space region or political territory. Press **/** to focus search; use the arrow keys and Enter to choose a result. A region selection frames that region; a territory selection opens its intelligence and observed holdings.
3. Drag to pan and use the wheel or zoom controls. **Map key & controls** opens navigation help and the legend. Touch supports pinch zoom. The overview inset helps recover your position at close zoom.
4. Select a system to inspect its security, hierarchy, activity, known structures, celestials and stargates. Use **Details** to show or collapse the dock. Its **Operations** selector switches between **System**, **Politics**, **Navigate**, **Live intel** and **Exploration**.
5. Choose a background from the territory strip, or open **Layers & views** for indicators, filters and saved configurations. Named views are saved per pilot.

The **3D / 2D** switch selects two map projections:

| Projection or view | Meaning |
| --- | --- |
| **3D** | A flattened X–Z projection of physical space. Its scale shows projected distance; vertical separation still matters to jump reach. |
| **2D** | CCP's schematic map positions. Region framing uses the same layout as the full universe. |
| Local radar | A separate gate-hop view, not a physical-distance map. |
| Saved Maps | A diagram you arrange. Card spacing does not measure travel distance or establish a connection. |

The projection is remembered across navigation and reloads. Jump calculations always use full physical X, Y and Z coordinates, regardless of the visible projection. Motion settles when idle and respects the operating system's reduced-motion preference.

### Layers, activity and inspection

Backgrounds include power blocs, sovereignty, selected-pilot standings, security and ship/pod kill activity. Indicators include ship, pod and NPC kills, gate traffic, faction warfare, incursions, manufacturing cost index and personal mining. View filters affect presentation; they do not change route restrictions or territory boundaries.

Use **Data sources** beneath the map to inspect the timing and availability of changing data. Missing or unavailable activity is different from a reported zero. NPC change compares two rolling one-hour totals; it is not the number killed since the previous refresh. Kairo does not provide a verified pilots-in-space count or camp detector.

Structure visibility is partial. Public sovereignty structures are not a complete Upwell inventory. A known player structure ID can be checked with a pilot holding `esi-universe.read_structures.v1`; visibility does not establish docking or bridge access.

Selected-system actions also support field notes and known-space pins. A dated pin can reference a calendar entry, retaining its actual title and EVE time. Confirm the system and event type yourself: a calendar header does not reliably identify a solar system or moon extraction. Manually entered timers remain manual records.

The tactical-window control detaches the map into browser picture-in-picture where available, or a normal popup otherwise. The operations dock stays in the main window. Use **Return map to workspace** to restore it. This is a private map view; use [Stream Studio](STREAMING.md) for broadcast output. A normal popup cannot guarantee operating-system always-on-top or click-through behavior.

## Create and open a map

1. Select a connected pilot and open **Universe → Maps**.
2. Choose **Create your first map** or **Create new map**. Enter a name and optional description.
3. Choose at least one connected **Tracked pilot**. The current pilot is preselected. The chosen pilots start tracking automatically.
4. Optionally set a [map scope](#tracking-and-map-scope). Leave it empty to accept eligible live chains throughout the universe.
5. Select **Create map**. Add systems manually or let new eligible travel observations populate it.

Maps belong to the selected connected pilot. Each map has independent system instances, scanner data, notes, observed ownership, reports and private connections. Static reference data and explicitly configured Ansiblex references are shared. Creating a map does not populate it from old visit history.

The landing page lists your maps. **Search map…** searches existing map systems, including aliases; a result names its map and opens the matching card. The **Notes** search category searches map-local notes by text, author pilot or system. Landing search does not create cards.

Use the map picker to change maps and **Maps** to return to the landing. Each saved map retains its own camera. **Hide sidebar** in the application top bar gives the workspace more width and remembers that choice.

### Read a system card

A card identifies the real system, its class, optional alias, status and reference indicators. For example, the bundled reference identifies **C4 J225111** with expected **C1 · C3** static destinations; hovering or focusing those badges reveals **P060** and **C247**. Static badges describe recurring type expectations, not scanned signatures or the current destination of a hole.

Select a card or choose **System details** from its context menu. The dock provides **System**, **Scanner**, **Reports**, **Notes**, **Navigate** and **Intel**. Signature, structure, timer, report and note badges open the corresponding context and appear only for positive counts. Known-space cards offer **View in Atlas**; system menus also offer **Open zKillboard**.

Full system intelligence includes class, statics, weather/effect modifiers and nominal wormhole properties with provenance. Unknown values stay unknown. J-Space's underlying region and constellation IDs are not navigation groups or physical-distance references.

## Add and arrange systems

Use the map's add/search field to find a system by name or ID. Selecting an existing card frames it; selecting a new system adds it. Placing a card alone does not create a connection.

To place a known-space group:

1. Select **Constellation** or **Region** in add/search and choose the group.
2. Review the staged layout. It uses the same CCP schematic geometry as Atlas 2D, spaced for cards, with internal stargates and configured Ansiblexes.
3. Drag the preview to the desired location.
4. Choose **Confirm placement** or **Cancel placement**. The preview is not saved before confirmation.

Existing cards keep their positions and annotations; duplicate links are not added. Once confirmed, every new system is an independently movable card.

Drag a card to move it. Position saves on release; another drag can begin while the previous position save completes. Shift/Ctrl-select cards or use a selection rectangle to move multiple unlocked systems. Use fit, frame, follow and overview-inset controls to recover orientation. Locks protect systems from movement and automatic disconnected-card cleanup. Aliases, labels, tags, status and home/staging roles belong to that map.

### Display preferences and groups

Open **Display** on a map, or **Universe settings → Mapper preferences**, for independent **K-space node size** and **J-space node size** controls. Both begin at 100% and allow 50–150%. **Focus-based map detail** is off by default. When enabled, selected systems and the settled view centre remain detailed while surrounding cards become smaller after movement stops. These preferences save immediately for the selected pilot in this browser.

To make a collapsible display group, open **Display**, choose a region, constellation or **Selected systems**, give it a name and select a real anchor system. Geographic groups capture matching cards already on the map; custom groups capture the current selection. Choose **Create collapsed group**. Use **Expand**, **Collapse** or the remove control in the group list afterward.

A group is a saved membership snapshot: adding more cards later does not enroll them automatically. Up to 32 groups with 600 saved members each are supported. Group definitions and collapse state are stored in this browser per pilot and map; they are not included in transferable map records.

Collapsed groups retain the anchor, real entry/exit systems, current pilots, selections and route context. Search can reveal a hidden member. Hidden cards keep their positions and records; collapsing a group does not merge systems, add travel links or suspend connection expiry.

## Tracking and map scope

**Pilots** opens the map's subscribed roster. Add connected pilots or pause/resume an individual pilot for this map. Tracking uses Kairo's existing location observations; adding maps does not add an ESI polling loop for each map.

Fresh continuous observations can add current J-Space positions and record K→J, J→J and J→K transitions. Known-space entrances and exits remain part of the chain. Automatically recorded wormholes begin **unconfirmed**, without route access, using the default **16h / Normal / L** conditions. Observed movement is not proof of a wormhole's type, true lifetime or access.

Paused, stale, disconnected and out-of-order samples do not establish a traversal. Resuming tracking starts a new baseline. Switching the active pilot also resets the live source's baseline; it does not invent travel between different pilots' locations. Old visits are never used to seed a new chain.

### Choose which chains populate a map

Set **Scope** when creating a map or in **Map settings**. Supported selections are individual systems, known-space constellations, known-space regions, sovereign alliances, sovereign corporations and configured power blocs.

Selections use **OR**, both within and across categories: one matching system admits its connected eligible live wormhole chain. Empty scope means the whole universe. A later discovered exit can make an earlier, still-live chain eligible without restarting its connection lifetimes.

Scope controls population, not visibility. Changing it does not hide or delete saved cards, notes or connections. Sovereign alliance/corporation/bloc matching needs fresh complete sovereignty. Inferred coalitions, NPC station ownership and manually assigned J-Space dominion do not establish those scope matches. J-Space's organisational regions and constellations are deliberately absent.

Copied systems start with independent annotations; copied connections start at default conditions, unconfirmed and inaccessible. Existing target-map edits are preserved. Only eligible subscribed pilots' live topology is considered, not deleted connections or historical visits.

### Inspect the live source

Open **Maps settings → View live source** to see the active pilot's lightweight, read-only observed chain. It is not in the normal map picker and never opens by default. **Create new map** from this view opens the normal creation form and copies eligible live topology for the chosen pilots, preserving connection ages.

The source does not hold editable system notes, scanner records, ownership, activity logs or passage ledgers. Use a named map for operational work.

## Record and maintain connections

### Draw or add a connection

Drag a connection tab from the left, right, top or bottom of one card to another card. The preview follows the pointer; press Escape to cancel. Keyboard users can activate an origin handle and then a destination handle. The saved line retains those attachment sides. Drawing an already recorded live pair reuses it.

Alternatively, select **Connect** and choose two mapped systems and a connection kind:

| Kind | What Kairo records |
| --- | --- |
| **Wormhole** | A temporary observation with signatures, type, conditions, expiry, confirmation and access. |
| **Stargate** | A permanent link that must match an actual pair in the active static atlas. |
| **Ansiblex** | A reference to your configured network or an independent bridge private to this map. |

Permanent links do not receive wormhole mass, lifetime or size settings. Access on a configured Ansiblex is managed in **Universe settings**. Removing that line from a map does not delete the configured network entry. Private map bridges remain isolated to their map.

### Verify a wormhole before routing

Select the edge and open **Connection conditions**. Record what you observed: endpoint signatures, hole type, life, mass and size limit. Link existing scanner signatures to the exact connection where appropriate. Confirmation and route access are explicit choices; neither drawing a line nor importing a report grants them.

The quick condition controls offer:

| Field | Choices and meaning |
| --- | --- |
| Lifetime | **1h, 4h, 4.5h, 16h, 24h, 48h**. Deliberately choosing a lifetime sets expiry from now. **Manual expiry** accepts an exact time. |
| Mass | **Verge / Half / Normal**: observed condition, not a calculated remaining-mass meter. |
| Ship size | **S / M / L / H / XL**; H represents freighters and XL capitals in the connection display. Routing also considers vessel class and nominal single-transit limits. |

New drawn links default to **16h / Normal / L**, unconfirmed and without route access. Ordinary condition edits preserve the existing expiry; selecting a new lifetime deliberately changes it. The outer stroke represents lifetime and the inner fill mass. Only system cards can be locked; a connection cannot be locked past its expiry.

Imported observations can have an unknown lifetime. Supply observed lifetime evidence, confirmation and access before expecting them in a route. Nominal type properties and size labels do not prove current passability.

### Expiry, removal and Undo

Deleting, collapsing or expiring a wormhole removes the canonical connection and its connection notes, passages, bound wormhole signatures and cached route references. There is no connection archive or Undo. Expiry is reconciled while Kairo runs even if the map is closed; reopening does not restart an expired connection's lifetime.

System cards have a different lifecycle:

- A disconnected, unlocked system leaves the diagram 30 minutes after its last connection disappears. Never-connected standalone cards remain.
- Locking prevents that automatic cleanup. Unlocking or manually restoring a card gives it a fresh 30-minute grace period.
- Removed/pruned system membership and metadata remain associated with that map. Restoring or rediscovering the system restores its own records, including notes, unrelated signatures, reports and observed ownership.
- **Undo map edit** handles supported layout/annotation changes. Restoring a system cannot resurrect a deleted connection or its deleted records.

Use a native export before deliberately removing a whole map if you want a transferable copy. Removing the map removes its private records; other maps remain independent.

## Scanner and bookmarks

1. Select a system and open **Scanner**.
2. Paste scan rows into the composer. English, German, French and Russian scanner labels are supported.
3. Use **Update scan** for a clean partial scan. Review any row diagnostics.
4. Mark a scan complete only when it really is complete. Kairo reviews missing observations before importing a complete scan; partial or malformed input cannot prove a signature disappeared.

Anomalies are optional. Signature rows and counts remain visible in the notebook. Add observed hole type/destination information to a saved signature, and use **Connection conditions** to bind it to the correct mapped connection.

Bookmark naming supports Wanderer token spellings, custom labels, explicit branch indices and return-hole markers. Branch naming is deliberate; Kairo does not infer automatic tree numbering. Copying a bookmark name copies text only and does not create an EVE bookmark.

Recently deleted signatures can be restored for 24 hours, preserving original observation times without overwriting a newer record. Selected signature deletion reports partial failures if only some individual deletions succeed.

Atlas **Exploration** exposes the system notebook and infrastructure tools outside a saved map. A saved map's notebook is independent of Atlas and other maps.

### Infrastructure observations

In Atlas, select a system and open **Exploration → Infrastructure**. Enter an upgrade slot, name, level, reported online state and observation notes, then choose **Save infrastructure record**. These are user observations; they do not establish current structure status or access.

**Import or export infrastructure** accepts SMT text or JSON. Paste the data, choose **Preview infrastructure import**, and inspect all listed systems and slots before **Import infrastructure observations**. Existing records in matching slots are updated. Copy/download exports are available in both formats; choose JSON when you need to retain Kairo notes, because SMT text cannot carry them.

## Reports, ownership and notes

### Reports

Choose **Reports** in system details. **Structures**, **Timers** and **Field reports** have separate forms and counts. A structure with an attached schedule remains a structure.

New observation times default to current UTC/EVE time. Editing preserves the original time unless you change it or explicitly reobserve. Observation expiry is optional. A timer reaching its scheduled time does not establish that a structure actually changed state.

D-scan and three-line timer pastes show a preview before creating observations. Review resolved systems, names and times. A paste does not silently resolve an ambiguous name or establish that a structure is powered.

### Observed J-Space ownership

In a wormhole system's **System** details, choose Alliance or Corporation and search by name. Select the result with the intended name, logo and EVE ID. The card displays this as local observed dominion. It does not change formal sovereignty, standings, ownership-based map scope or route access.

### Notes

Open **Notes** on a system or connection. New notes use the selected connected pilot's trusted identity and show that pilot's name and portrait. Imported known attribution is preserved; unknown older authors show **Pilot unavailable**.

Search the current location or select **Entire map** to search its complete notebook. Results open the relevant location. Retained notes for off-map systems remain searchable without restoring the card automatically. Notes use UTC date groups and pages of 12; recent notes show elapsed minutes, with a precise timestamp available on hover.

Deleting a connection deletes its notes. System notes survive card removal within their map. Atlas field notes have a separate, locally shared scope; see [data and privacy](#data-and-privacy).

## Passage ledger

Select a wormhole and open **Passages**. Record the pilot, hull, direction, occurrence time and estimated mass of a known transit. Editing or deleting a passage adjusts the observed total.

To collect sampled passages, enable **Map settings → Passage logging → Log sampled passages**, then **Save map details**. Fresh sampled ESI transitions must correspond to a unique confirmed mapped connection. They retain sampled provenance, begin with unknown mass and require review; they do not create or confirm a connection.

The ledger is incomplete traffic evidence. Fittings, propulsion and unseen pilots affect real mass consumption. Kairo does not subtract this total from nominal hole mass and present it as verified remaining mass.

## Routes and special connections

### Plan a gate itinerary

1. Open **Navigate → Gate route** beside Atlas or a saved map. System details provide origin/destination shortcuts.
2. Enter **Route origin** and **Route destination**. Use **Add waypoint** for multiple ordered stops; move or remove stops with their controls.
3. Choose **Shortest route**, **Prefer high security** or **Prefer low security**.
4. Choose whether to use enabled accessible Ansiblexes and confirmed unexpired wormholes. Saved-map navigation uses that map's connection context.
5. Open **Public shortcuts & vessel limits** to opt into fresh Thera/Turnur reports or allow Zarzakh transit. Enter vessel size, class and fitted mass when relevant.
6. Set standings, security and system exclusions in the route controls, then choose **Calculate route**.
7. Review the route briefing, each leg's connection type, warnings and any incomplete-route explanation. Use **Fit route** to frame it, or copy/download the itinerary.

A high-security preference is a weighted preference, including available standings and destruction evidence. It does not guarantee safety. Map filters and projection do not alter the route's preferences. Stale, expired, inaccessible, disabled or unconfirmed special links cannot establish an eligible route.

Itineraries are saved per pilot, with independent saved-map context. **Advance origin with fresh pilot location** follows accepted fresh location observations. Changing the draft requires recalculation before it can be sent to EVE.

### Send waypoints to EVE

Planning, copying and downloading are local. **Send to EVE** is explicit and requires `esi-ui.write_waypoint.v1`. Review whether to append to the client's existing waypoints or replace them before sending. Partial failures report which steps were sent; inspect that result before retrying. Calculating a route or selecting a public entrance never sends waypoints automatically. EVE waypoints do not execute wormhole or jump-drive travel; follow those legs manually. A single send is limited to 500 waypoint targets, so split a larger itinerary.

### Jump routes and range

**Navigate → Jump route** plans from physical XYZ distance. Choose a hull/JDC range profile or enter your effective in-game range. Add intermediate stops as needed and calculate the jump route. Alternate midpoint candidates can be added and recalculated.

Eligible arrivals are low/null systems. Highsec destinations, wormhole space, Jove, Pochven, Zarzakh and Exordium are excluded; a high-security origin may jump outward. The result does not verify cynos, fuel, fatigue, jammers, docking or every ship-specific eligibility condition.

**Fuel planning** uses your supplied isotope rate, effective multiplier, reserve and optional unit price/volume. It rounds consumption up per jump and excludes cyno fuel, conduit passengers and fatigue. Use actual hull/skill values.

For a reach comparison, open **Range**, enter up to four origins and their radii, and select **Show reachable systems**. The result distinguishes the union of reachable systems from systems within every entered range. An optional **Alternate midpoint destination** finds intersection candidates. Physical-map circles are projected outer bounds; highlighted systems use exact XYZ distances. Schematic positions never enter range calculations.

### Ansiblex rules in this candidate

The default **Live rules (22 Sep)** model is the implementation pinned to an effective date of 22 September 2026 and a source verification date of 25 September 2026. These dates describe the candidate's stored model, not a new check of live game rules.

It requires the pilot's alliance to match the starting system's reported sovereign alliance and separately requires recorded bridge access. Owner/capital data and vessel eligibility are used where required. Zones are directional, from the recorded owning alliance's capital to the destination; an unknown capital cannot bypass a restrictive zone selection. Known hulls can receive nominal capacitor estimates, but actual available capacitor, fuel and online state are not reported.

**Legacy rules · comparison only** and **Pre-release model · comparison only** are distinct historical models. They are not aliases for current game rules. See the [technical routing contract](UNIVERSE-ROUTING-VALIDATION.md) for implementation and source ownership.

### Find an exit or service

In a map, open **Find an exit or service** to search the eligible graph for high-/low-sec exits, trade hubs, blue-/red-loot buyers, security-status services and fresh public Thera/Turnur entrances. Results use the selected chain's confirmation, expiry, vessel limits and exclusions. Public shortcuts require an explicit choice.

Service locations are dated references. Docking, current NPC services and buy orders are not verified. A suggested destination remains a plan, not a waypoint command to EVE.

## EVE-Scout: Thera, Turnur and storms

Thera and Turnur entrances come from EVE-Scout's public reports, with source attribution, endpoint signatures, hole type, observation time, expiry and size limit. The feed uses a five-minute cache. Nominal type data is separate from current conditions and does not establish remaining mass.

On Atlas, entrance symbols remain visible at every zoom level. Hover for their meaning or click/tap to pin details; keyboard users can open the map symbol list. Hub controls frame reported entrances in the active scope. Entrance actions can set a destination or open its exploration notebook without leaving the workspace.

On saved Maps, toggle Thera/Turnur overlays to show temporary, read-only public cards. An unexpired cached report can remain visible during a failed refresh, marked stale and excluded from public routing. A successful snapshot reconciles additions and removals while preserving surviving overlay positions. Adopting a report as your own connection is explicit, preserves its reported expiry, and still requires verification for route access.

Routes use the actual Thera/Turnur system: two entrances form two legs. There is no invented physical K-Space position for Thera. Expired, incomplete and stale reports are not active public route edges. Vessel restrictions apply before planning, and nominal mass is not remaining mass.

Storm footprints use EVE-Scout's structured observations and real gate hops for strong/weak ranges. Reference ice, observatory, invasion and point-of-interest markers are attributed historical data, not confirmed current availability. Campaign, development and vulnerability context comes from central ESI snapshots.

## Ansiblex lists and SMT migration

Open **Universe settings → Connections & pins**. For an individual bridge, choose **Ansiblex**, enter origin/destination and optional label, record access and any known owner alliance/capital, then **Save connection**.

For a list:

1. Choose **Import** and give the list a name.
2. Paste an SMT list, EVE bridge links or CSV/TSV, or load a text file smaller than 2 MB.
3. Set access only if you have verified it. Imported visibility is not proof of access.
4. Choose **Preview bridge list**, resolve reported line/system issues, then **Import bridge list**.

An SMT line can look like:

```text
0 UALX-3 --> IL-YTR
```

Here `0` means the structure ID is unknown. Each line is directional. Reciprocal entries merge while retaining each endpoint's structure/access/owner information. Blank lines, comments and repeated whitespace are accepted. Preview validates before the atomic import.

Use **Export SMT** to download a list. Individual bridges and whole lists can be disabled independently. Deleting an imported list removes its bridges without deleting unrelated lists. **Discover visible Ansiblex structures** can prepare candidates if the pilot has the required search/structure permissions; review pairing and access before importing.

Kairo does not watch SMT preferences automatically or replicate native overlays, global hotkeys, tray controls or every SMT display option. Attribution and licenses remain in [third-party notices](THIRD-PARTY-NOTICES.md).

## Power blocs and inferred coalitions

Open **Universe settings → Power blocs** to create a named bloc, choose a colour and add alliances by name or verified alliance ID. Changes remain a draft until **Save changes**. **Revert** returns to saved settings. Membership is exclusive; moving an alliance between blocs is an explicit action. Mark an alliance **Keep independent** to exclude it from inferred fallback.

Configured memberships are authoritative. With inference enabled, unassigned alliances can appear in **Inferred Coalitions** unless kept independent. Solid borders identify configured groups; dashed borders identify inferred ones. System dots and details retain actual sovereign owners.

Select a political territory to open its inspector and use **Frame territory** to frame observed holdings. Member lists explain provenance and coverage; regional holdings navigate to the corresponding region. Share bars count observed owned systems, not map area. Frontiers list actual stargate crossings to neighbouring owners. Adjacency does not imply diplomatic relations, and activity in owned systems is not activity attributed to their owner.

The palette reserves Caldari blue, Gallente teal, Amarr gold and Minmatar rust. Duplicate or reserved bloc colours are flagged with alternatives. Existing conflicting settings remain loadable and receive distinct display colours. Names, outlines and source labels remain useful where colour alone is ambiguous.

Inference uses this installation's collected combat evidence over a bounded 60-day window. Repeated cooperation across days is the primary signal, direct fighting is counterevidence, and shared opponents/adjacency provide supporting context. Neighbouring territory alone cannot establish a coalition. Missing evidence stays unresolved; collection is not a complete global combat dataset.

Stale or incomplete assessments are labelled. Inference does not overwrite configured memberships, set standings, authorize transit or control OPSEC. Personal, corporation and alliance contacts inform the selected pilot's standings; personal contacts take precedence and explicit Neutral is respected. Stale, missing or wrong-membership evidence remains Unknown.

## Operational sources and alerts

**Live intel** combines explicit pasted reports, optional local EVE chat/game logs, connected pilot positions and an authorized fleet. Reports retain source, channel, time, resolved systems and clear/question/hostile classification. Alerts support expiry, cooldown and acknowledgement.

Open **Reports → Add an observation**, paste/write an intel message, add a source label and choose **Record report**. The selected system provides context while named systems in the message are also resolved. Filter by all observations, the selected system or the planned route; **Include history** includes older reports. Unresolved names remain unresolved.

**Signals** provides source-labelled public connections, campaigns, storms, combat, development, NPC changes and points of interest, with scope/search controls. **Pilots** shows connected pilot positions and the fleet's collection status; selecting an available position frames that system. Use the acknowledgement control on an alert once reviewed.

To configure collection:

1. Open **Universe settings → Sources & alerts** and enable the sources you want.
2. For logs, enable **Monitor EVE chat and game logs**, select or enter the local folder containing `Chatlogs` and `Gamelogs`, and enter channel matches one per line.
3. Choose **ESI telemetry**, **Local chat log observations**, or **Prefer ESI, fall back to logs** as the operational location source.
4. Optionally enable fleet reads or public combat reports. Set the combat observation window (5–120 minutes).
5. Configure watch range, report lifetime, cooldown, keywords and watched system IDs as needed.
6. Choose **Save operational settings**. Collection and watch rules are not applied merely by editing them.

The log reader starts from the current end of eligible files, matches the pilot's listener and never edits originals. Log-derived locations expire after five minutes and do not change ESI telemetry or OPSEC policy. Fleet collection needs fleet permission and the appropriate EVE role. Missing permission, a stale roster and a confirmed empty roster remain distinct states.

Public combat collection is opt-in and bounded to 500 observations. Incomplete coverage does not mean no activity. Clear reports and questions do not create hostile alerts; ignored text is excluded before alert rules.

Sound and desktop notifications are separate opt-in browser/device choices and save immediately. Use **Test sound** to check audio. Desktop notifications require browser permission and may contain pilot/system names. The private alert inbox remains usable when notifications are unavailable or denied.

## Universe settings and saving

| Location | What belongs there | How changes apply |
| --- | --- | --- |
| **Universe settings → Connections & pins** | Shared configured Ansiblex networks/imports and known-space pins | Explicit add/import actions; individual toggles/removals save when used. |
| **Universe settings → Power blocs** | Configured alliance membership, colours, independence and inference | **Save changes** applies the draft. |
| **Universe settings → Mapper preferences** | K/J-space card sizes and focus detail | Immediately, per pilot in this browser. |
| **Universe settings → Sources & alerts** | Operational collection, logs, fleet, public combat and watch rules | **Save operational settings**; device sound/notifications save immediately. |
| **Map settings** on a named map | Name, description, scope, sampled passage logging, export/duplicate/removal | **Save map details** applies the form. Transfer/removal use separate actions. |
| **Pilots** on a named map | Its tracked pilot roster and pause/resume | Explicit roster actions apply to that map. |
| **Display** on a named map | Card preferences and collapsible groups | Immediately in this browser; group state is per pilot and map. |

Changing Universe settings tabs preserves unfinished form edits. Leaving the workspace or reloading is not a substitute for an explicit Save. Read any failure or conflict message before assuming a change was stored.

Dataset updates and ESI polling live in the application's main Settings, not Universe settings. See [Datasets](DATASETS.md) and [ESI polling](ESI-POLLING.md).

## Import, export and duplicate maps

Open a named map's **Map settings**:

- **Export map** downloads the native `.kairo-map.json` representation of recorded context.
- **Export for Wanderer** downloads a portable version-1 `.wanderer-map.json` containing supported systems, connections and signatures. It omits private notes, observations and passage history, and cannot carry full expiry/trust/observation-age context. Unconfirmed, inactive, expired and collapsed links are omitted.
- **Duplicate map** makes independent layout, system, scanner, intel, infrastructure and connection records. Changes to the copy do not modify the original.
- **Remove map** asks you to confirm removal of that map and its private records.

To import, use **Import a map** on the landing or toolbar. Select a JSON file smaller than 4 MB or paste JSON, choose **Preview import**, and review counts, warnings and errors. **Import as a new map** creates a separate map only after a valid preview. Kairo accepts its own version-1 format and compatible Wanderer version 1.

Imports preserve observation age where the format supplies it; they do not inherit route trust or access. Missing lifetime evidence remains unknown rather than becoming a fresh hole. Review imported connections before routing. A native export is a map transfer, not a complete application backup: browser display groups, camera/device choices and other application data need the separate [backup procedure](USER-GUIDE.md).

Kairo's Maps are local private workspaces. They do not provide hosted collaboration, remote map-user accounts, corporation/alliance ACL inheritance, invitations, external map tokens or signed webhooks.

## Sessions and map replay

Start/end operations and review their reports in [Sessions](SESSIONS.md). **Show on Map** opens that Session's fixed replay snapshot inside Universe. Playback, speed, scrubbing, event context and follow-player controls exist only in this view. Follow pans smoothly; scrubbing moves to the requested point. Exit replay to return to Atlas.

Recorded J-Space movement is a schematic chain including its known-space entrances/exits. Later K-Space-only travel returns to the remembered Atlas projection, and rewinding chooses the matching view. Replay does not recreate expired connections or populate a live map.

The background uses current cached sovereignty with its cache time. **At visit** ownership is shown only when captured from fresh sovereignty at recording time; older visits without it show **not recorded**. The replay does not reconstruct missed gates or an exact flight path from a straight line. Event positions retain explicit/combat-derived/contemporaneous-visit/unavailable provenance.

Routine entered-system and OPSEC events are omitted from replay event cards and stepping while recorded travel remains intact. Up to 10,000 relevant events are included with coverage metadata when the limit is reached; all visits remain present. Live sessions replay a fixed snapshot, and older data can contain gaps or unusable coordinates. See the Sessions guide for report and recording limits.

## Data and privacy

Static browsing and gate/range planning work from the bundled official snapshot without ESI or a connected pilot. Official data can later be updated through [Datasets](DATASETS.md). Dynamic sovereignty, activity, standings, feeds and permission-dependent observations retain their own timing and availability.

| Data | Scope |
| --- | --- |
| Static system/reference data | Shared across the installation. |
| Views, pins, connection lists and ordinary navigation | Selected pilot, with a separate guest workspace before connection. |
| Configured power blocs | Local Universe configuration shared across pilots. |
| Atlas field notes | Locally shared Atlas scope. |
| Named-map systems, private links, scanner, reports and notes | Independent records in the selected pilot's map. |
| Mapper preferences, display groups, sound and notifications | Browser/device storage with pilot/map scope as described above. |
| Session travel/replay | Owned by the Session recording. |

Universe/replay APIs require the local Kairo session; mutations require CSRF protection. Private map state is not served by the OBS output server. See [Authentication and security](AUTH-AND-SECURITY.md), [data retention](DATA-RETENTION.md) and [backup guidance](USER-GUIDE.md) for the wider installation.

Travelling outside a Session still updates live location, discovered-system membership and ordinary activity, without maintaining the retired lifetime Journey log. Existing historical visits and Sessions remain readable; old `#journey` links open Atlas. Historical observation edges are not imported as live routing connections.

## Common questions and troubleshooting

| Symptom or state | What to check |
| --- | --- |
| **Create map** is unavailable | Select or connect a pilot; creation also requires a name and at least one tracked pilot. Static Atlas remains usable as a guest. |
| A new map is empty | Historical visits do not seed maps. Add a system, observe fresh eligible travel, or explicitly create from the live source. Check scope and tracked pilots. |
| A visible wormhole is absent from routing | Check confirmation, access, expiry, vessel restrictions and selected map. A public cached report can be visible yet stale and ineligible. |
| A route cannot be completed | Inspect the explanation and current exclusions. Check each special link's evidence and access; a drawn line does not itself establish transit. |
| A disconnected system disappeared | Unlocked cards prune after the 30-minute grace period. Search/add the system in that same map to restore its retained system records. Deleted connection records do not return. |
| A collapsed group appears to have lost cards | Expand it from **Display** or search for a member. Grouping does not delete cards or their connections. |
| A scan would mark signatures missing | Verify that the input is a genuinely complete valid scan. Use a partial scan when coverage is incomplete. |
| **This map changed in another window** | Kairo loaded the latest revision. Review the refreshed state and reapply/save the intended change. |
| A map edit fails | Read the error and confirm that the pilot/map is still selected. Do not assume an optimistic position or unsaved form draft has persisted. |
| Fleet, activity or standings is unavailable | Inspect source status, freshness and character permissions. Unknown/unavailable is not a confirmed empty or neutral result. |
| Desktop alerts are absent | Enable device notifications and browser permission. Review the private alert inbox and saved watch rules; source collection and device notification choices are separate. |

For startup, core disconnection, dataset update, authentication and general browser issues, use [Troubleshooting](TROUBLESHOOTING.md).

## Implementation references

User workflows above are derived from the current Universe UI and owning services, particularly `components/kairo/universe.tsx`, `jspace-workspace.tsx`, `jspace-workspace-panels.tsx`, `universe-navigation-ui.tsx`, `universe-connections.tsx`, `universe-operations-settings.tsx` and `server/universe*.mjs`.

Developers should start with [Architecture](ARCHITECTURE.md), [Internal API](INTERNAL-API.md) and the [HTTP/event reference](API-REFERENCE.md). Specialized contracts are in [static Universe data](UNIVERSE-DATA.md), [schematic geometry](SCHEMATIC-GEOMETRY.md) and [routing](UNIVERSE-ROUTING-VALIDATION.md). Service/HTTP tests cover ownership, revisions, expiry, import rollback, native round trips and OBS isolation. Browser coverage and remaining environment-specific gates belong to [Validation](VALIDATION.md); older investigations belong to [history](history/README.md).
