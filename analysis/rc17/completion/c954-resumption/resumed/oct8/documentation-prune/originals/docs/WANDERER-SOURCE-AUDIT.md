# Wanderer source audit

Audited on 25 September 2026 for the Kairo Universe J-Space overhaul. This is a source review of [wanderer-industries/wanderer](https://github.com/wanderer-industries/wanderer/tree/6c5d43936e88f1d2acabc4d45fc82cbb67d4a08a), pinned at **`6c5d43936e88f1d2acabc4d45fc82cbb67d4a08a`**. The checkout's latest changelog heading is v1.103.4, dated 20 September 2026. A changelog version is not proof of the deployed cloud version. README explicitly distinguishes continuously updated Cloud from Community Edition; this audit does not claim to have exercised a private cloud account.

The baseline comparison is Kairo **0.8.0-rc.6**, before this overhaul. Later implementation coverage belongs in a separate release matrix; the baseline gaps below must not be presented as completed features.

## What makes the mapper useful

Wanderer treats J-Space as a changing, human-maintained connection graph. A system is a readable operational card, a connection is an inspectable observation, and signatures are the bridge between scanning in EVE and recording a destination. The strongest lesson is the relationship between these parts, rather than any particular window arrangement.

The core loop is: locate or add a system, paste a scan, identify a wormhole, traverse or record its destination, link the signature, annotate the connection, and plan a route using the currently usable chain. Contextual actions, static reference data and pilot presence support that loop without requiring geographical region navigation.

Kairo should use this as the natural J-Space atlas. It already has the larger Universe context, authenticated pilot collection, route planning, Journey, Sessions, notebooks and private intel. Reusing those capabilities avoids a second set of disconnected records and collectors.

## Reference data and the supplied example

The following files are real checked-in reference data, not the contents of a user's current chain:

| Source file | Contents inspected | Count in pinned source |
| --- | --- | ---: |
| `priv/repo/data/wormholeSystems.json` | System ID/name, static wormhole type codes, possible wandering types, environmental effect name | 2,604 unique system IDs |
| `priv/repo/data/wormholes.json` | Type code, possible source/destination categories, lifetime, nominal total mass, nominal per-jump mass, mass regeneration and respawn classification | 100 types |
| `priv/repo/data/effects.json` | Named effects and class-dependent modifier reference values | 11 effect records |
| `priv/repo/data/wormholeClasses.json` | Space/class reference labels | 28 rows |
| `priv/repo/data/wormholeClassesInfo.json` | Additional class information | Object, two top-level keys |
| `priv/repo/data/shatteredConstellations.json` | Internal reference for shattered-system classification | Reference, not a proposed J-Space navigation unit |
| `priv/repo/data/route_by_systems/*.json` | Blue/red loot, security-status cleaning and trade-hub destinations | Category-specific destination and station records |

Every static type referenced by the 2,604 system rows resolves in the bundled type catalogue; no duplicate system IDs were found in that file. The result says nothing about live wormhole availability.

**J225111** is system **31001658**. Its row has no named effect and two static types:

| Static type | Destination category | Nominal per-jump mass | Nominal total mass | Nominal lifetime |
| --- | --- | ---: | ---: | ---: |
| P060 | C1 | 62,000,000 kg | 500,000,000 kg | 16 hours |
| C247 | C3 | 375,000,000 kg | 2,000,000,000 kg | 16 hours |

The type records identify C4 as their source category. This supports the requested card hierarchy **C4 · J225111 · C1 / C3 statics**. Static badges mean that the system has those recurring connection types; they do not identify the current destination, signature, spawn time, remaining life or remaining mass. An unscanned static must never create a route edge. The `wanderers` list is also a reference of possible types, not a live list of exits.

The important presentation paths are:

- `assets/js/hooks/Mapper/components/map/components/SolarSystemNode/SolarSystemNodeDefault.tsx`: class/name header, static class badges, effect, status, custom name, labels, lock, routing hub, presence, kill activity and unlinked signatures.
- `assets/js/hooks/Mapper/components/map/hooks/useSolarSystemNode.ts`: assembles static and dynamic node information.
- `assets/js/hooks/Mapper/components/map/components/WormholeClassComp/WormholeClassComp.tsx`: derives destination-class labels from wormhole type metadata.
- `assets/js/hooks/Mapper/components/mapInterface/widgets/SystemInfo/SystemInfoContent/SystemInfoContent.tsx` and `components/ui-kit/WHEffectView/WHEffectView.tsx`: reference detail and effects.

Kairo's official atlas remains the authority for system IDs and basic system identity. Supplemental mapper reference data needs pinned provenance, validation against the atlas and explicit unknown handling. Special classes and multiple destination categories must survive normalization; do not reduce everything to C1–C6 or invent a single destination for K162.

## Concrete source inventory

Source paths in this table are relative to the pinned Wanderer checkout. To keep the table readable, frontend paths beginning `components/` or `mapRootProvider/` continue from `assets/js/hooks/Mapper/`; a filename immediately following a full path uses that same directory.

| Area | Implementation evidence | What the source establishes |
| --- | --- | --- |
| Graph editing | `assets/js/hooks/Mapper/components/map/Map.tsx`; `components/map/hooks/useSolarSystemNode.ts`; `lib/wanderer_app/map/map_position_calculator.ex`; `lib/wanderer_app/api/map_system.ex` | ReactFlow nodes, connection handles, multi-selection, saved positions, node dragging, manual connections and system metadata. Positions are a schematic, not physical jump distance. |
| System actions | `assets/js/hooks/Mapper/components/contexts/ContextMenuSystem/useContextMenuSystemItems.tsx`; `components/contexts/ContextMenuSystem/useContextMenuSystemHandlers.ts`; `components/map/constants.ts` | Name/description, tags, labels, statuses, lock, shared/personal route hubs, EVE waypoints, capital planner, rally and removal. Status choices include Home, Friendly, Looking for, Warning, Target and Dangerous. |
| Connection state | `assets/js/hooks/Mapper/types/connection.ts`; `components/map/components/ContextMenuConnection/*`; `lib/wanderer_app/map/operations/connections.ex`; `lib/wanderer_app/map/server/map_server_connections_impl.ex` | Wormhole/gate/bridge distinctions; normal/half/verge mass; life categories; size classes; locks; inferred size defaults; life ageing and cleanup. |
| Passage ledger | `assets/js/hooks/Mapper/components/mapRootContent/components/Connections/Connections.tsx`; `Connections/PassageMassDialog.tsx`; `lib/wanderer_app/api/map_chain_passages.ex` | Tracked-character transits, timestamp/direction, hull and mass, editable passage mass, approximate total. It is not an all-traffic sensor. |
| Scanner workflow | `assets/js/hooks/Mapper/helpers/parseSignatures.ts`; `components/mapInterface/widgets/SystemSignatures/*`; `lib/wanderer_app/map/operations/signatures.ex`; `lib/wanderer_app/map/server/map_server_signatures_impl.ex` | Six-column paste, signature kinds/groups, merge/update/delete, scanner identity and timestamps, group filtering, editing and deletion undo. Language maps cover English, Russian, French and German labels. |
| Signature-to-chain workflow | `assets/js/hooks/Mapper/components/mapInterface/components/SystemLinkSignatureDialog/*`; `components/mapRootContent/components/SignatureSettings/*`; `components/map/components/UnsplashedSignature/*` | Destination linking, unknown/incoming/multiple-destination handling, type/life/mass metadata, temporary names and visible unlinked signature markers. |
| Bookmark names | `assets/js/hooks/Mapper/helpers/bookmarkFormatHelper.ts`; `components/mapRootContent/components/MapSettings/components/BookmarkNameFormatSetting.tsx` | Clipboard name formatting, signature/class/type/life/mass substitutions, number/letter chain indices, return-hole conventions and configurable mappings. This does not create an in-client EVE bookmark. |
| Structures | `assets/js/hooks/Mapper/components/mapInterface/widgets/SystemStructures/*`; `lib/wanderer_app/api/map_system_structure.ex`; `lib/wanderer_app_web/live/map/event_handlers/map_structures_event_handler.ex` | D-scan/show-info paste, name/type/owner/notes, observed power/anchoring/reinforcement state and timer, edit/delete and API access. |
| Notes/comments | `assets/js/hooks/Mapper/components/mapInterface/widgets/CommentsWidget/CommentsWidget.tsx`; `lib/wanderer_app/api/map_system_comment.ex` | Per-system attributed comments, markdown presentation, bounded lengths and subscription-dependent limits. |
| Tracking/presence | `assets/js/hooks/Mapper/components/mapRootContent/components/TrackingDialog/*`; `components/mapInterface/widgets/LocalCharacters/*`; `lib/wanderer_app/map/server/map_server_characters_impl.ex` | Enable tracking for characters, select main/followed pilot, display observed local tracked pilots, add systems/connections from movement, and presence lifecycle. |
| Quick routes | `lib/wanderer_app/map/map_routes.ex`; `lib/wanderer_app/map/routes_by.ex`; `lib/wanderer_app/route_builder_client.ex`; `assets/js/hooks/Mapper/components/mapInterface/widgets/RoutesWidget/*` | Shared/personal hubs, shortest/security choices, exclusions, EOL/critical/size switches, public connections, category-based nearest destinations and station detail. Routing calls a separate route-builder service. |
| Capital planner | `assets/js/hooks/Mapper/components/mapRootContent/components/JumpPlanner/JumpPlanner.tsx`; `JumpPlanner/getJumpPlannerUrl.ts` | Ship and skill preferences produce a Dotlan jump-planner URL. It is not a self-contained capital-path solver in this frontend. |
| Public connections | `lib/wanderer_app/server/thera_data_fetcher.ex`; `lib/wanderer_app/server/turnur_data_fetcher.ex` | EVE-Scout public hub data enters available routing/reference workflows. |
| Combat context | `assets/js/hooks/Mapper/components/mapInterface/widgets/WSystemKills/*`; `components/map/components/KillsCounter/*`; `lib/wanderer_app/kills/*`; `lib/wanderer_app/map/map_zkb_data_fetcher.ex` | System kill activity, age/filter preferences, list/detail and map counters from public kill reporting. |
| Rally and activity | `assets/js/hooks/Mapper/components/mapInterface/components/PingsInterface/*`; `lib/wanderer_app/api/map_ping.ex`; `lib/wanderer_app/character/activity.ex`; `lib/wanderer_app_web/live/map/map_audit_live.ex` | Shared rally destination, route to rally, tracked-user contributions, audit filters and map usage context. Some UI actions are subscription-gated. |
| Map lifecycle | `lib/wanderer_app/map/operations/duplication.ex`; `lib/wanderer_app/map/operations/transfer.ex`; `lib/wanderer_app_web/live/maps/*` | Create/configure/select maps, duplicate and portable version-1 map-content export/import. Map scope and metadata are distinct from per-user presentation settings. |
| Collaboration | `lib/wanderer_app/api/map_access_list.ex`; `lib/wanderer_app/api/map_invite.ex`; `lib/wanderer_app/permissions.ex`; `lib/wanderer_app_web/live/map/map_characters_live.ex` | Character/corporation/alliance ACLs, roles, invitations, tracking restrictions, active viewers and map-scoped commands. |
| Integration API/events | `lib/wanderer_app/api/policies/map_scoped.ex`; `lib/wanderer_app/api/actor_helpers.ex`; `lib/wanderer_app/external_events/*`; `lib/wanderer_app_web/controllers/map_events_api_controller.ex`; `map_webhooks_api_controller.ex` | Map-token APIs, resource authorization, SSE with reconnect/backfill, event filtering and signed webhook delivery/retry/rotation. |
| Layout/settings | `assets/js/hooks/Mapper/components/mapInterface/constants.tsx`; `components/mapRootContent/components/MapSettings/*`; `mapRootProvider/migrations/*` | Nine configurable widgets, stored window arrangement, minimap, themes/display settings, user settings and administrator defaults/reset. |

## Semantics and failure modes to preserve or improve

### Separate evidence from predictions

Wanderer's `map_server_characters_impl.ex` calls `update_location`, which can add nodes and call `maybe_add_connection`. The latter identifies actual stargate pairs and otherwise chooses a wormhole, with inferred size/lifetime defaults. It also records a passage for an automatic movement before checking whether a connection is newly created. These paths are useful automation, but consecutive sampled positions alone cannot prove that a usable wormhole joins the two systems: a sampling gap, clone event or another transport mechanism can produce misleading topology.

Kairo already has a stronger baseline: `server/universe.mjs` creates an **unconfirmed**, inaccessible travel candidate for eligible consecutive J-Space observations, and only confirmed usable private links enter routing. Preserve that distinction in the new chain UI. Discovery, verification and routing eligibility should be visible states, not silently merged meanings. Historical travel may position or annotate a node but must not keep a dead connection active.

### Keep static properties apart from live observations

Class, effect and static destination categories belong to reference data. A signature's existence, remote destination, remaining-life category, mass state and confirmed transit are observations. Known nominal per-jump/total mass is not remaining mass. A type's maximum lifetime does not tell us when an already existing hole will collapse. Locks protect map editing; they must never override age, closure or route restrictions.

The passage guide `priv/posts/2024/09-19-connection-info.md` is appropriately explicit that only tracked pilots contribute and hull mass ignores fittings/propulsion. The empty UI string “Nobody passed here” in `Connections.tsx` is stronger than that evidence; Kairo should say “No recorded passages.” A ledger sum should remain an observed minimum/estimate, never an exact remaining-mass meter.

### Make scan reconciliation explicit

Wanderer's parser skips malformed rows and falls back to generic signature categories; its lazy-delete flow can use the remaining parsed list to reconcile signatures. Kairo's current preview/diagnostics and explicit complete-scan choice are useful safeguards. Retain them while adding richer kinds, type metadata and linkage. Partial or malformed input cannot prove that omitted signatures disappeared. Deleting or undoing a signature must have specified effects on any linked connection; never leave a hidden active edge or revive expired topology accidentally.

Incoming K162 is not a unique destination class or a reliable nominal mass type. Multiple-destination types need the observed destination or an explicit unknown state. Return-hole naming/index logic is separate from graph identity; renaming a bookmark must not create a second connection.

### Treat imports as data transfer, not trust transfer

The current `Transfer` module exports version 1 with map metadata, systems, connections and optional nondeleted signatures. It deliberately omits ACLs, subscriptions and per-user settings. Existing visible systems retain their existing attributes. Exported connection fields include state categories and type, **but not a verified current expiry, observation time or passage history**. It does not transfer structures or comments in that document.

A Kairo importer should preview counts, preserve supported metadata, report unsupported fields and avoid inventing live freshness from `exported_at`. Re-import should be idempotent; destructive replacement is a separate explicit action. Names and markup are untrusted text. Importing a graph does not grant route access or authorize another application's API token.

Wanderer's structure clipboard helper provides another useful improvement opportunity: a four-column D-scan row creates an observed structure but defaults its status to `Powered`. A D-scan row by itself does not establish power state. Kairo should preserve the successfully parsed type/name and start with an unknown state unless an explicit status or timer snippet supplies evidence. Its three-line timer snippet matches an existing structure by name, so ambiguous duplicate names need a review choice rather than a silent update.

### Authorization boundaries are part of the feature

Wanderer's September changelog records fixes for cross-map access, deny-by-default API policy, token-only v1 access and actor propagation. These are valuable regression cases, not evidence that the pinned code remains vulnerable. Kairo's local selected-pilot isolation, CSRF/session checks and revision conflicts must remain enforced at the server. If remote shared maps are added later, map IDs from a request cannot themselves establish authorization.

SSE/webhooks solve a real multi-user integration problem, but they are not equivalent to a local notebook or local export. Token-bearing URLs can leak through logs/history. Event delivery requires bounded retention, reconnect/backfill, idempotency and scope checks; outbound webhook support also needs its own destination validation and secret handling. Do not call a local update event “webhook parity.”

### Design for orientation and low idle cost

Wanderer's compact nodes and adjacent signature markers have a clear visual hierarchy. Some default node details use very small fonts; Kairo should adopt the hierarchy while retaining larger type, touch targets, explanatory hover/focus text and sensible detail levels. User node positions should survive refresh and should not jump when a feed changes. A “fit chain” command and minimap should make recovery easy.

Kairo's finite camera transitions, viewport label fading, rounded halos and reduced-motion support are strengths. A readable chain can feel alive through directed state changes and brief confirmation cues without a permanent particle loop or animated glow on every system. Observed pilot movement must not move the camera unless follow is enabled.

## What Kairo already does well

- One central ESI/public-feed collection path with explicit freshness, permissions and source errors, instead of independent polling per visual widget.
- Explicit unknown values and confirmed-route boundaries; private/public observations remain distinct.
- A real internal gate/capital solver, three-dimensional jump eligibility, typed legs, exclusions and fuel estimates. Wanderer's current capital frontend delegates its result to Dotlan.
- Previewed scanner/Ansiblex/infrastructure imports, deterministic normalization and diagnostics.
- Existing pilot-scoped notebooks, Sessions and historical Journey/replay; the chain should connect to these rather than store another disconnected history.
- OPSEC remains separate from manually entered system labels and local intel; an observed “friendly” label cannot override protection policy.
- A unified responsive map with keyboard/touch access, finite animation and no continuous idle render loop.

## Adaptation boundaries

The requested J-Space overhaul can implement local operational equivalents for chain editing, signatures, reference data, connections, passages, structures, routing, notes and portable import/export. Wanderer's hosted multi-user service is a separate architectural surface: map accounts, corporation/alliance ACLs, invitations, simultaneous remote editing, API-token administration, public SSE, webhook subscriptions, subscription billing and bot hosting. These must be listed individually as supported, adapted or absent in the release matrix. A local implementation must not be described as full multi-user parity merely because multiple EVE characters are connected.

Paid plan limits, donations and cloud infrastructure are service/business features, not useful requirements for the local Universe atlas. Arbitrarily floating widgets and every theme preference can be adapted to Kairo's own readable map workspace, provided the underlying user tasks remain accessible.

## License and provenance

`LICENSE` is the MIT License, copyright (c) 2024 Wanderer Industries. Any copied source or substantial reference data must retain its notice in Kairo's third-party notices and record the pinned source SHA and file hashes. The repository license should not be represented as ownership of CCP's EVE names or data. This audit does not copy Wanderer's art or brand into Kairo.

This source review used README, CHANGELOG, checked-in user guides under `priv/posts`, frontend interaction paths, server operations and bundled JSON. Roadmap announcements were treated as plans, not as implemented features. The detailed baseline tasks and acceptance criteria are in [WANDERER-WORKFLOW-INVENTORY.md](WANDERER-WORKFLOW-INVENTORY.md).
