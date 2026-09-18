# Universe · 0.8.0-rc.1

Universe replaces the earlier New Eden lookup and separate Journey atlas with a complete local map. **Sessions remains a separate workspace** for starting and ending operations, reviewing reports and reading combat records. Universe contains geographic exploration and travel history.

## Explore the atlas

The default view is a two-dimensional X–Z projection of the actual New Eden coordinates, with subtle sovereignty territory shading and stargates. Drag to pan, wheel or use the buttons to zoom, and search or select a system to inspect it. The region selector focuses the map without adding a row of region cards.

**Layers & views** separates the territory background from system indicators. Choose sovereignty, selected-pilot standings, security or activity as the background. Indicators include ship, pod and NPC kills, gate traffic, faction warfare, incursions, manufacturing cost index, personal mining and visits. Save named configurations per pilot or start from the supplied presets. Map filters do not change route preferences.

Selected system cards show security, hierarchy, activity, known structures, static celestials, connected gates and field notes. Structure visibility is partial: public sovereignty structures are not a complete Upwell inventory. You can verify a known player structure ID using a connected pilot with `esi-universe.read_structures.v1`. ESI visibility does not prove docking or transit access.

The selected pilot's own alliance and personal, corporation and alliance contacts inform standings. Personal contacts take precedence over corporation and alliance entries; explicit Neutral is respected. Missing, stale or wrong-membership evidence stays Unknown. OPSEC remains governed by its existing protection policy.

Calendar headers do not reliably identify a solar system or a moon extraction. A selected-system event pin can be linked to a specific calendar entry; Kairo uses the event's actual title and EVE time. Confirm the system and event kind yourself. A manually entered timer is labelled as a manual record.

## Routes and special connections

The **Route** sidebar calculates locally from the bundled stargate graph. Choose shortest or safer, list systems to avoid, and optionally include enabled Ansiblexes and confirmed, unexpired wormholes. Safer prefers high security and friendly territory and weighs reported destruction; it cannot establish that a route is safe. The exact connection type appears on every leg.

In **Connections & pins**:

- Add individual Ansiblexes or import a CSV/TSV list of origin system, destination system and optional label. Confirm the pilot's access separately.
- Enable or disable individual entries or entire imports, and remove either without affecting the other lists.
- Record wormholes with a default 16-hour remaining lifetime. Change it to 16, 12, 8, 4 or 1 hour, or expire it immediately; mass state is editable.
- Consecutive fresh observations involving wormhole space can suggest a connection. Such observations require confirmation before routing and are not proof of a wormhole. Known pod-loss evidence suppresses the suggestion.
- Expired links are excluded at route time and removed from active map connections. Pins and notes can retain disconnected discoveries, which remain unroutable until a usable connection is recorded.

Ansiblex zone controls use the model announced for **22 September 2026**, clearly labelled as a planning preview in this 18 September build. Capital distance is directional and measured from the owning alliance capital to the destination. Unknown capitals cannot bypass a selected zone limit. The announced model enforces owning-alliance membership. Ship-specific capacitor calculations remain future work.

The **Jump range** sidebar uses full physical X, Y and Z positions and EVE's exact light-year of 9.46 × 10¹⁵ metres. Enter the effective in-game ship range. Each destination must be an eligible low/null system; highsec destinations, wormhole space, Jove, Pochven, Zarzakh and Exordium are excluded. The result is a physical range plan: fuel, fatigue, cynos, jammers, ship suitability and docking must be checked in game.

## Sessions and map replay

Open **Sessions** to record an operation and review its report. **Show on Map** opens a replay bound to that session inside Universe. Playback, speed, timeline scrubbing, event context and follow-player controls exist only in this view. Follow mode pans smoothly; scrubbing moves directly to the requested point. Exit the replay to return to the ordinary atlas; Sessions remains available in the main navigation.

Replay uses recorded visits and occurrence timestamps. It does not reconstruct missed gates, infer an actual flight path from a straight map line or show current sovereignty as historical sovereignty. Event locations are marked as explicit, combat-derived, inferred from a contemporaneous visit, or unavailable. The replay includes up to 10,000 events, with explicit coverage metadata when that limit is reached; all visits remain present. Sessions can contain gaps or legacy records with no usable coordinates. Live sessions replay a fixed snapshot, avoiding a moving end time during playback.

## Data and privacy

The official static snapshot is bundled, so browsing and routing work without ESI or a connected pilot. Static coordinates, hierarchy, gates, celestial bodies and NPC stations are read locally. ESI supplies changing state and retains source timing and availability. Blank/unavailable activity is distinct from a reported zero. Kairo does not invent pilots-in-space counts, camp detection or a complete public structure inventory.

Views, pins and connection lists are scoped to the selected pilot, with a separate guest workspace before sign-in. Existing field notes keep their original locally shared scope. Universe and replay APIs require the local Kairo session, mutations require CSRF, and none of this private map state is exposed by the OBS server.

Existing visits, sessions, notes and settings are retained. The independent Journey module and old atlas UI are retired; a legacy `#journey` link opens Universe's travel log. Historical observation edges are never imported as routing connections. Universe adds its own private-record table; no reset is required.

## Implementation contract

- Static: `GET /api/universe/static` returns versioned metadata, systems, regions, constellations and reciprocal gate pairs. Physical metre coordinates remain distinct from display projection coordinates. The response is cached with an ETag and gzip.
- State: `GET /api/universe?character=ID` returns source metadata, sparse per-system overlays, pilot-specific links/lists/pins/views, calendar headers and Journey records.
- Detail: `GET /api/universe/systems/ID?character=ID` loads one system's static detail and available state.
- Planning: `POST /api/universe/route` and `/api/universe/jump-plan` accept IDs and explicit travel preferences. Visual layers are never graph inputs. Dynamic evidence comes from the selected pilot on the server.
- Records: `POST /api/universe/views`, `/links`, `/link-lists`, `/pins`; include an existing record ID to edit. `DELETE` the respective `/ID` path to remove a record. All use `?character=ID`.
- Verification: `POST /api/universe/structures/verify` checks a supplied structure ID through that pilot's authorized ESI cache.
- Replay: `GET /api/sessions/SESSION_ID/replay?character=ID` provides a session-scoped snapshot of visits, event context and coverage. No external collection is triggered.
- Export: the existing local history export includes Universe records.

See [static data provenance and refresh](UNIVERSE-DATA.md) and [route validation and timing](UNIVERSE-ROUTING-VALIDATION.md). External specifications: [CCP map conventions](https://developers.eveonline.com/docs/guides/map-data/), [ESI API explorer](https://developers.eveonline.com/api-explorer), [Ansiblex announcement](https://www.eveonline.com/news/view/major-update-force-projection-revamped).
