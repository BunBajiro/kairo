# Universe · 0.8.0-rc.5

Universe replaces the earlier New Eden lookup and separate Journey atlas with a complete local map. **Sessions remains a separate workspace** for starting and ending operations, reviewing reports and reading combat records. Universe contains geographic exploration and travel history.

## Explore the atlas

The default view is a two-dimensional X–Z projection of the actual New Eden coordinates, with power bloc borders and stargates. **K-Space** and the violet **J-Space** tab have separate extents. Drag to pan, wheel or use the buttons to zoom, and search or select a system to inspect it. Zooming out stops at the active space or selected region with a small margin. J-space positions provide a schematic of discoveries, not physical distances or proof of connections.

Universe opens directly into a map workspace that fills the available application viewport. Its compact command area and collapsible details dock keep the map central; there is no separate immersive mode to enter. The scope overview shows geography, exploration coverage, reported ownership and activity for the selected region or space.

Search systems, known-space regions and political territories from the same field. Press **/** to focus search, use arrow keys to choose a result and Enter to open it. Selecting a region frames it; selecting a political territory opens its intelligence and frames its observed holdings.

Selecting a system, zooming and fitting the map use smooth camera movement. Dragging has a short bounded coast, touch supports pinch zoom, and an overview inset helps you navigate at close zoom. The K-space scale represents projected distance; the J-space discovery graph is schematic. A brief targeting cue identifies a selection; panels and replay events enter with finite transitions. The quiet background moves only with the camera. Motion settles when idle and respects the operating system's reduced-motion preference. **Map key & controls** expands the legend and navigation help.

**Layers & views** separates the territory background from system indicators. Choose power blocs, sovereignty, selected-pilot standings, security or activity as the background. Indicators include ship, pod and NPC kills, gate traffic, faction warfare, incursions, manufacturing cost index, personal mining and visits. Save named configurations per pilot or start from the supplied presets. Map filters do not change route preferences or move territory borders. Borders use cached vector geometry and quiet flat fills; individual systems no longer have influence glows. Map labels fade across a 44-pixel boundary zone, and rounded screen-space text halos avoid sharp joins over territory fills.

## Operational workspace

The **Operations tool** selector keeps inspection, politics, navigation, live intel and exploration beside the same map. Physical space remains the default. Optional schematic and local-radar projections show gate topology; their layout does not represent jump-drive distance. A private detachable tactical window uses browser picture-in-picture where available and a normal popup otherwise. It is not an OBS source; a normal popup cannot promise operating-system always-on-top or click-through.

**Live intel** combines explicit pasted reports, optional EVE chat/game logs, connected pilot positions and the selected pilot’s authorized fleet. Reports retain timestamps, channels, resolved systems and clear/question/hostile classification. Alerts have expiry, cooldowns and acknowledgment. Enable log monitoring and select a local EVE log folder in **Settings → Universe**; Kairo starts from the current end of each eligible file, matches the pilot’s listener and never edits the originals. Location can use ESI, local logs or fresh ESI with a log fallback. Operational positions do not replace OPSEC evidence.

Sound and desktop notifications are opt-in device choices. Fleet collection needs the fleet scope and appropriate EVE role; an empty, unavailable or stale roster is labeled accordingly. Missing permission does not turn into an empty confirmed fleet.

**Exploration** includes system signatures, scanner clipboard import, private infrastructure notes and attributed public observations. A partial scan preserves existing signatures; only an explicitly complete, valid scan can mark missing signatures. Saved map annotations remain after a temporary connection disappears.

## EVE-Scout: Thera, Turnur and storms

Thera and Turnur reports are collected from the documented EVE-Scout public API and refreshed with its five-minute cache. Connection details preserve both endpoint signatures, wormhole type, observation time, expiry, ship-size limit and source. Nominal type data uses the separately cached wormhole-types API. Nominal jump/total mass and lifetime are not remaining mass or a guarantee that a connection is still passable.

Reported hub connections appear on the map and can be explicitly enabled in navigation. Routes pass through the actual Thera or Turnur system; two exits are two legs. Expired, incomplete and stale reports cannot become active route edges. Ship limits are applied before planning. Saving a connection as your own verified observation is explicit and preserves the reported expiry and provenance.

Storms use EVE-Scout’s structured observations API. Strong and weak footprints follow actual gate hops. Public combat reports are separately opt-in, deduplicated and bounded to 500 observations in a configurable 5–120-minute display window. Campaigns, development and vulnerability context come from the existing central ESI snapshot. NPC change is a signed comparison of two rolling one-hour totals, not kills since the preceding refresh. Reference ice, observatory, invasion and point-of-interest markers are historical, attributed data rather than confirmed current availability.

## Itineraries and SMT migration

Navigation saves an ordered itinerary per pilot, with accessible reorder/remove controls, route restrictions, typed connection legs and exclusions. Capital planning uses physical XYZ distances, hull/skill presets, alternate midpoints and range intersections. Route planning and copying remain local. **Send to EVE** explicitly appends or replaces client waypoints and requires `esi-ui.write_waypoint.v1`; partial failures show which steps were sent.

Paste an existing SMT Ansiblex list unchanged into the connection import. Kairo accepts comments, blank lines, repeated whitespace and lines such as `0 UALX-3 --> IL-YTR`. A zero means that the structure ID is unknown. Each line is directed; reciprocal entries merge while preserving each endpoint’s structure/access/owner metadata. Preview reports malformed or unknown systems before an atomic import. Lists export back to SMT text, and each list can be disabled independently. Importing or discovering a visible structure does not prove fuel, online state or access.

The integration review and feature mapping are in [SMT integration](SMT-INTEGRATION.md); API research and attribution are in [the source audit](SMT-SOURCE-AUDIT.md) and [third-party notices](THIRD-PARTY-NOTICES.md).

## Power blocs and inferred coalitions

Open **Settings → Universe → Power blocs** to create a named bloc, choose its colour and add alliances by known name or verified alliance ID. Changes remain a draft until saved. Membership is exclusive: moving an alliance requires an explicit action. Mark an alliance **Keep independent** to exclude it from the inferred fallback. These settings apply across the local Universe module; pilot standings and private travel records retain their existing scope.

Configured membership is authoritative. Alliances without a configured membership can appear in **Inferred Coalitions**, unless kept independent or inference is disabled. Solid borders identify configured groups; dashed borders identify inferred groups. System dots and detail cards retain the actual sovereignty owner. The bloc inspector shows member alliances, provenance, evidence and coverage. Removing a configured membership returns that alliance to fallback eligibility.

The political palette assigns a distinct colour to every alliance, corporation, faction and bloc in the complete ownership roster before region or standings filters apply. Caldari blue, Gallente teal, Amarr gold and Minmatar rust are reserved for their factions. Settings flag duplicate or reserved bloc colours and offer an available alternative. Older conflicting configurations remain loadable and receive distinct display colours until corrected. Colour works alongside names, outlines and membership-source labels; a dense map cannot rely on colour alone. Security, activity and standings retain their category-based legends.

Political borders are interactive. Select a territory to spotlight it and open its holdings, or use **Frame territory** to bring all its observed systems into view. The political atlas includes factions and separate alliance owners alongside blocs. Its share bars count observed owned systems, never map area. Regional holdings lead into the relevant region; stargate frontiers list actual gate crossings to neighbouring owners and let you inspect their endpoints. Gate adjacency describes geography, not diplomatic relations or hostility. Activity totals describe events in those systems, not actions attributed to their owner. Missing coverage remains unavailable rather than becoming zero.

Inference is an assessment, not a declaration of diplomacy. It uses combat records already collected by this Kairo installation: repeated cooperation across distinct days is the main signal, direct fighting provides counterevidence, and shared opponents and neighbouring sovereignty provide supporting context. Neighbouring territory alone cannot establish a coalition. Groups require agreement between their members, preventing a single connecting alliance from joining unrelated blocs. Kairo uses a bounded 60-day local evidence window with age weighting and freshness limits, and records assessment/configuration snapshots. Missing evidence stays unresolved. It does not download a complete New Eden combat dataset or claim global coverage.

The inspector labels incomplete collection and stale assessments. An outage can retain a clearly marked previous assessment while its supporting evidence remains valid; expired evidence is withheld. Inference never rewrites configured memberships, establishes transit access, changes standings, or controls OPSEC.

Selected system cards show security, hierarchy, activity, known structures, static celestials, connected gates and field notes. Structure visibility is partial: public sovereignty structures are not a complete Upwell inventory. You can verify a known player structure ID using a connected pilot with `esi-universe.read_structures.v1`. ESI visibility does not prove docking or transit access.

The selected pilot's own alliance and personal, corporation and alliance contacts inform standings. Personal contacts take precedence over corporation and alliance entries; explicit Neutral is respected. Missing, stale or wrong-membership evidence stays Unknown. OPSEC remains governed by its existing protection policy.

Calendar headers do not reliably identify a solar system or a moon extraction. A selected-system event pin can be linked to a specific calendar entry; Kairo uses the event's actual title and EVE time. Confirm the system and event kind yourself. A manually entered timer is labelled as a manual record.

## Routes and special connections

**Navigate → Gate route** calculates locally from the bundled stargate graph. Choose shortest, prefer high security or prefer low security, list systems to avoid, and optionally include enabled Ansiblexes and confirmed, unexpired private wormholes. Fresh public Thera and Turnur reports have separate opt-ins and remain identified as reports. The high-security preference also considers standings and reported destruction; it cannot establish that a route is safe. The exact connection type appears on every leg.

System details offer origin and destination shortcuts. **Fit route** frames the route's systems in the active space; a route spanning both spaces remains split across the K-space and J-space views.

In **Connections & pins**:

- Add individual Ansiblexes or import a CSV/TSV list of origin system, destination system and optional label. Confirm the pilot's access separately.
- Enable or disable individual entries or entire imports, and remove either without affecting the other lists.
- Record wormholes with a default 16-hour remaining lifetime. Change it to 16, 12, 8, 4 or 1 hour, or expire it immediately; mass state is editable.
- Consecutive fresh observations involving wormhole space can suggest a connection. Such observations require confirmation before routing and are not proof of a wormhole. Known pod-loss evidence suppresses the suggestion.
- Expired links are excluded at route time and removed from active map connections. Pins and notes can retain disconnected discoveries, which remain unroutable until a usable connection is recorded.

Ansiblex planning defaults to **Live rules (22 Sep)**, verified for this build on 25 September 2026. It requires the pilot's alliance to match the starting system's reported sovereign alliance and separately requires recorded bridge access. Legacy and pre-release rules are labelled comparison models. Zone distance is directional, from the recorded owning-alliance capital to the destination; an unknown capital cannot bypass a selected zone limit. Known vessel classes receive nominal capacitor-cost estimates when the zone is known. Live capacitor availability, fuel and online state are not established by those estimates.

**Navigate → Jump route / Range** uses full physical X, Y and Z positions and EVE's exact light-year of 9.46 × 10¹⁵ metres. Choose a hull/JDC preset or enter the effective in-game range; compare multiple origins or select alternate midpoints. Each destination must be an eligible low/null system; highsec destinations, wormhole space, Jove, Pochven, Zarzakh and Exordium are excluded. Optional fuel planning uses your supplied consumption values. The result remains a physical range plan: actual fuel, fatigue, cynos, jammers, ship suitability and docking must be checked in game.

## Sessions and map replay

Open **Sessions** to record an operation and review its report. **Show on Map** opens a replay bound to that session inside Universe. Playback, speed, timeline scrubbing, event context and follow-player controls exist only in this view. Follow mode pans smoothly; scrubbing moves directly to the requested point. Exit the replay to return to the ordinary atlas; Sessions remains available in the main navigation.

Replay uses recorded visits and occurrence timestamps. Routine “Entered system” and OPSEC policy events are omitted from its event cards, markers and stepping controls; recorded travel and camera movement remain intact. It does not reconstruct missed gates, infer an actual flight path from a straight map line or show current sovereignty as historical sovereignty. Event locations are marked as explicit, combat-derived, inferred from a contemporaneous visit, or unavailable. The replay includes up to 10,000 relevant events, with explicit coverage metadata when that limit is reached; all visits remain present. Sessions can contain gaps or legacy records with no usable coordinates. Live sessions replay a fixed snapshot, avoiding a moving end time during playback.

## Data and privacy

The official static snapshot is bundled, so browsing and static gate/range planning work without ESI or a connected pilot. Static coordinates, hierarchy, gates, celestial bodies and NPC stations are read locally. ESI and the explicitly identified public feeds supply changing state, retaining source timing and availability. Dynamic route options need their respective observations and permissions. Blank/unavailable activity is distinct from a reported zero. Kairo does not invent pilots-in-space counts, camp detection or a complete public structure inventory.

Views, pins and connection lists are scoped to the selected pilot, with a separate guest workspace before sign-in. Existing field notes keep their original locally shared scope. Universe and replay APIs require the local Kairo session, mutations require CSRF, and none of this private map state is exposed by the OBS server.

Existing visits, sessions, notes and settings are retained. The independent Journey module and old atlas UI are retired; a legacy `#journey` link opens Universe's travel log. Historical observation edges are never imported as routing connections. Universe adds its own private-record table; no reset is required.

## Implementation contract

- Static: `GET /api/universe/static` returns versioned metadata, systems, regions, constellations and reciprocal gate pairs. Physical metre coordinates remain distinct from display projection coordinates. The response is cached with an ETag and gzip.
- State: `GET /api/universe?character=ID` returns source metadata, sparse per-system overlays, pilot-specific links/lists/pins/views, calendar headers, Journey records and the `operations`, `feeds` and `navigation` snapshots.
- Detail: `GET /api/universe/systems/ID?character=ID` loads one system's static detail and available state.
- Planning: `POST /api/universe/route` and `/api/universe/jump-plan` accept IDs and explicit travel preferences. Visual layers are never graph inputs. Dynamic evidence comes from the selected pilot on the server.
- Operations: the `/api/universe/operations`, `/feeds` and `/navigation` route families provide source configuration, local intel, ordered itineraries, range comparison and explicit waypoint delivery. Signature and infrastructure imports have separate preview routes. The full paths and response boundaries are in [the operational integration contract](SMT-INTEGRATION-CONTRACT.md).
- Records: `POST /api/universe/views`, `/links`, `/link-lists`, `/pins`; include an existing record ID to edit. `DELETE` the respective `/ID` path to remove a record. All use `?character=ID`.
- Verification: `POST /api/universe/structures/verify` checks a supplied structure ID through that pilot's authorized ESI cache.
- Politics: `GET/PUT /api/universe/politics/config` reads/saves module-wide bloc settings with revision checks. `GET /api/universe/politics` reads the cached assessment; `POST` requests reassessment of locally collected records. `GET /api/universe/politics/alliances?q=TEXT` searches known alliances; `POST /api/universe/politics/alliances/resolve` verifies a name or ID through ESI when needed. Every mutation requires the local session and CSRF protection.
- Replay: `GET /api/sessions/SESSION_ID/replay?character=ID` provides a session-scoped snapshot of visits, event context and coverage. No external collection is triggered.
- Export: the existing local history export includes Universe records.

See [static data provenance and refresh](UNIVERSE-DATA.md) and [route validation and timing](UNIVERSE-ROUTING-VALIDATION.md). External specifications: [CCP map conventions](https://developers.eveonline.com/docs/guides/map-data/), [ESI API explorer](https://developers.eveonline.com/api-explorer), [Ansiblex announcement](https://www.eveonline.com/news/view/major-update-force-projection-revamped).
