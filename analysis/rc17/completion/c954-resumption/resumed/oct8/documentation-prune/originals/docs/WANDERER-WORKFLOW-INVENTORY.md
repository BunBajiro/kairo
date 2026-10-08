# Wanderer workflow inventory and Kairo baseline

This inventory is pinned to Wanderer `6c5d43936e88f1d2acabc4d45fc82cbb67d4a08a` and compares **Kairo 0.8.0-rc.6 before the J-Space overhaul**. It is a requirements/audit artifact, not a claim that the new build has completed every row. [WANDERER-SOURCE-AUDIT.md](WANDERER-SOURCE-AUDIT.md) supplies source paths, semantic cautions and attribution. The implementation release needs its own feature-coverage matrix with explicit evidence and remaining differences.

“Existing” means a core task is already available in Kairo; “partial” means substantial capabilities exist but the Wanderer workflow has missing steps; “gap” means the task has no equivalent complete workflow. A local adaptation and a remote collaboration feature are not interchangeable.

## Natural mapping and reference workflow

| ID | User task verified in Wanderer | Kairo rc.6 baseline | Required outcome / acceptance boundary |
| --- | --- | --- | --- |
| W01 | Read class, real system name, static destination categories and effect directly on a system node | Partial: class and effect data, small point/label schematic; no guaranteed-static reference badges | Readable Kairo card: C4, J225111, C1 and C3 statics; no region navigation for J-Space. Unknown references remain unknown. |
| W02 | Inspect static wormhole types, possible destinations, nominal mass/lifetime and effect modifiers | Gap for full offline catalogue; public EVE-Scout type data exists | Reach reference detail from the card. Distinguish nominal properties from a currently scanned connection and observed remaining life/mass. |
| W03 | Add systems manually and automatically when tracked pilots discover them | Partial: search/selection, pins, travel and connection observations establish known systems | Add/remove an atlas node without changing the real system catalogue or deleting Journey history. Automatic discoveries cannot assert an unverified route. |
| W04 | Arrange and persist a schematic chain by dragging nodes | Gap: deterministic automatic J-Space discovery layout | Save node coordinates per chain/pilot, keep them across refresh/reload and distinguish node drag from map pan. No physical distance claims. |
| W05 | Select several systems, move or remove them, and lock important systems | Gap for graph editing and locks | Clear selection/focus cues, predictable locked-node behaviour and bounded action scope. Keyboard/touch equivalent for essential actions. |
| W06 | Recover orientation with pan/zoom, minimap, fit and following a pilot | Existing camera/minimap; partial follow workflow | Keep focus/selection through data refresh. Fit frames useful chain cards with padding; follow is explicit and can be paused. |
| W07 | Give systems aliases, descriptions, tags, labels and status | Partial: pins and place notes exist, not chain-node metadata | Alias supplements the real name. Home/friendly/target/danger are observations, not standings or OPSEC authority. |
| W08 | Mark route hubs and personal destinations | Partial: itinerary and pins | Direct card action adds destination to navigation; saved quick targets survive reload and never send an EVE command implicitly. |
| W09 | See unlinked wormhole signatures attached to their system | Gap | Visually distinguish unscanned/unlinked signatures from real destination nodes and connectable confirmed edges. |
| W10 | Use contextual system actions and reference links | Existing hover/pin cards, route/notebook actions and links | Same notice → hover/focus → inspect → act behaviour in the J-Space graph; no required hidden right-click-only action. |

## Scanning and signature-to-connection workflow

| ID | User task verified in Wanderer | Kairo rc.6 baseline | Required outcome / acceptance boundary |
| --- | --- | --- | --- |
| W11 | Paste six-column EVE probe scanner results | Existing English/German/French cosmic-signature import, preview and diagnostics | Preserve valid rows and supported localized kinds/groups. Report unsupported rows. Russian and anomaly support require real parser coverage before claiming parity. |
| W12 | Reconcile a new scan with saved signatures; find additions and missing rows | Existing partial/complete scan choice, first/last seen and missing state | Malformed or partial scans never prove disappearance. Preview explains additions, updates and missing records before applying. |
| W13 | Manually create/edit signatures and filter/select/copy/delete them | Existing core notebook, lacks full wormhole metadata | Keep signature ID, kind/group, site/type, note, temporary name, timestamps and attribution. Distinguish site name from wormhole type code. |
| W14 | Undo accidental signature deletion | Gap | Undo restores the deleted observation safely without clobbering newer edits or reviving expired connection access. |
| W15 | Identify a wormhole type and annotate incoming/unknown/multiple-destination type | Gap in notebook; some public link type fields exist | K162 and multi-destination types retain uncertainty. Type reference assists the user but does not guess the live destination. |
| W16 | Link a signature to its destination system and return-side signature | Gap: private link has signature text fields, no notebook linkage workflow | One stable link identity ties the endpoints, both signatures and observation. Change/delete semantics are explicit and stay consistent in map and notebook. |
| W17 | Update life/mass on a signature and see it on the linked connection | Partial: independent private link life/mass fields | A single update keeps card, edge and notebook consistent. Unknown, normal/reduced/critical and end-of-life observations remain distinguishable. |
| W18 | Produce a recognizable bookmark name from a configurable convention | Gap | Copy signature/class/type/direction/state/template result. Explain that copying text does not create an in-client bookmark. Respect unknown values and user gestures. |
| W19 | Number/nickname branches and treat return holes consistently | Gap | Stable chain identity cannot depend on display index. Rename/index updates do not duplicate systems or create new routes. |

## Connection lifecycle and passages

| ID | User task verified in Wanderer | Kairo rc.6 baseline | Required outcome / acceptance boundary |
| --- | --- | --- | --- |
| W20 | Create a manual connection between systems | Existing private wormhole connection editor | Fast from-node interaction plus accessible form; verify endpoints, retain source, and keep schematic annotations separate from route edges. |
| W21 | Inspect life, mass, ship-size/type and lock state on an edge | Partial: life/mass/size exist, canvas line context exists; no full chain edge grammar | Crisp visual encodings and hover explanation. Colour is supplemented by pattern/icon/text; stale/expired observations are unmistakable. |
| W22 | Change life state/EOL, mark critical, lock or remove a connection | Partial: existing private link edit/delete/expiry, no graph lock workflow | Expired/closed link is not routable even if graph-locked. Missing expiry is not silently replaced with a fresh one on import. |
| W23 | Age and clean a chain while retaining useful system annotations | Partial: expires/prunes temporary links, notes/pins persist | Remove unusable edge from route graph, make stale observations reviewable, and never remove history because a connection vanished. |
| W24 | Automatically discover a link from tracked transit | Existing unconfirmed travel candidate | Keep the safer Kairo confirmation step; sampled location changes cannot prove wormhole transit. Show provenance and review action. |
| W25 | Inspect recorded passages with pilot/hull/direction/time | Gap: Journey exists but no connection-specific passage ledger | Explicit observed/manual ledger tied to connection identity; avoid duplicate ingestion and distinguish manual and sampled observations. |
| W26 | Edit a passage mass and total recorded mass | Gap | Treat hull/default/manual mass as estimates; show unobserved traffic and fit/propulsion uncertainty. Never label subtraction as verified remaining mass. |
| W27 | Review who locked/edited an operational record and when | Partial timestamps; no full chain audit workflow | Useful local history should record action/source/time and conflicts. It is not a remote multi-user security audit unless implemented as such. |

## Navigation and public exits

| ID | User task verified in Wanderer | Kairo rc.6 baseline | Required outcome / acceptance boundary |
| --- | --- | --- | --- |
| W28 | Route through discovered wormholes and ordinary stargates | Existing internal typed route engine and private confirmation rules | Use the same graph/pilot/restrictions in J-Space and Navigate. Static expectations, unconfirmed links and expired reports cannot enter routing. |
| W29 | Exclude EOL/critical/small holes, particular systems or unsafe space | Partial to existing: private mass/expiry, size/mass constraints, safer routing and exclusions | Surface relevant wormhole constraints close to chain-route action. A successful path is still not an access/safety guarantee. |
| W30 | Choose shared/personal quick routes or closest useful destination | Partial: ordered itineraries, landmarks and hubs, no full category-nearest query | Supported categories can include market, loot sale and public exits; distinguish nearest eligible route from Euclidean distance and show no-route honestly. |
| W31 | Include Thera/Turnur public data | Existing rc.6 map entrance symbols, network framing, typed public route legs | Reuse current provider cache/freshness and same actual hub identities; no second polling path or duplicate false edges. |
| W32 | Send EVE waypoints to a selected authorized character | Existing explicit waypoint command, append/replace and partial failure | Plan first, explicit send second; ordinary selection, hover and route preview never command a client. |
| W33 | Configure ship/skills and plan capital travel | Existing internal XYZ solver, range sets, alternatives and fuel estimates | Kairo already goes beyond Wanderer's Dotlan URL frontend. Capital movement does not use schematic J-Space distances. |

## Intel, structures and daily operation

| ID | User task verified in Wanderer | Kairo rc.6 baseline | Required outcome / acceptance boundary |
| --- | --- | --- | --- |
| W34 | See own tracked pilots and their ships in a selected system | Existing connected pilots and authorized fleet map layers | Label tracked/observed presence and source age. A count is not a complete list of J-Space inhabitants. |
| W35 | Follow one character while seeing others | Partial: current location and selection/camera tools | Explicit follow can update focus smoothly; manual inspection pauses/frees the camera predictably. Missing/stale location never teleports it. |
| W36 | Review recent system kills and map activity badges | Existing public-combat feed/list and map symbols | Public uploads are incomplete and delayed. Preserve opt-in, bounded retention and source status. Sessions remains separate from public system intel. |
| W37 | Paste D-scan structures, edit type/name/owner/status and notes | Gap: infrastructure upgrades and verified structure lookup are different workflows | New structure observations must not pretend ESI verification or ownership. D-scan paste gets bounded preview/diagnostics and keeps unrelated records. |
| W38 | Track observed anchoring/reinforcement timers | Partial: calendar-linked pins/reminders, no structure-timer workflow | UTC/EVE time explicit, owner/time/state editable, no automatic prediction that reaching zero proves vulnerability. Integrate existing reminders without duplicate alerts. |
| W39 | Keep per-system discussion/notes | Existing place notes; no shared comments/thread workflow | Reuse notebook for local knowledge, attribution and timestamps. Calling a private note “shared discussion” would overclaim parity. |
| W40 | Set a rally and route characters toward it | Partial: destination/pin and route workflow; no shared rally service | Local operation target can integrate with Session/navigation, but remote broadcast is a distinct authorized collaboration feature. |
| W41 | Review character/map contributions and active viewers | Partial: Journey/Sessions personal history; no shared participation dashboard | Use local evidence for personal history; do not infer who is actively viewing a map from EVE online state. |

## Map management and integration boundaries

| ID | User task verified in Wanderer | Kairo rc.6 baseline | Required outcome / acceptance boundary |
| --- | --- | --- | --- |
| W42 | Create/select/configure multiple independent maps/chains | Partial: named display views, not independent chain records | Independent named chain contents/layouts require a true record scope; a visual preset alone is not multiple-map parity. |
| W43 | Duplicate a map | Gap for chain-specific clone | Clone supported nodes/links/signatures with explicit rules, new identities and observation age preserved; do not transfer permissions accidentally. |
| W44 | Export/import portable map contents | Partial: full history export and SMT lists, no Wanderer format | Version-1 Wanderer document has map/systems/connections/signatures. Preview, idempotent merge, real counts, supported metadata preservation and unsupported-field diagnostics. Imported links lack fresh evidence. |
| W45 | Configure widgets/theme/default layout and save per-user preferences | Adapted: unified map/dock and named views | Keep essential tasks within Kairo's natural map workspace. Arbitrary floating widgets and every theme control are not required to copy the operational task. |
| W46 | Collaborate live on a shared map | Gap: local application and connected EVE characters, not remote user collaboration | Must not claim parity from local multi-character state. A remote shared-map system needs authenticated users, conflict/reconnect behaviour and scoped access. |
| W47 | Grant map access to characters/corporations/alliances, roles and invitations | Gap | Real server-enforced scope, deny-by-default policy and revocation are necessary; a chain label or export is not an ACL. |
| W48 | Restrict tracking/viewing and manage active map users | Gap for remote users; existing local character controls | Pilot data permissions and viewer session presence are distinct. No remote tracking from an unverified imported identity. |
| W49 | Use map-token APIs and subscribe to SSE map events | Partial: local authenticated internal API/events | Local Kairo APIs are reusable foundations. External-token administration and scoped public SSE require explicit implementation and tests before a parity claim. |
| W50 | Receive signed webhooks and operate external bots | Gap | Endpoint validation, HMAC/retry/idempotency/secret rotation and opt-in delivery are required; do not send private data merely because an import contains a URL. |
| W51 | Use managed hosting, subscriptions, donations and plan limits | Different product architecture | Cloud service/business operations are outside the local atlas integration. No artificial paid limits should be copied into local Kairo. |

## Kairo opportunities beyond the source workflow

1. **One operational record:** A system card opens its existing notebook, scan, connection evidence, routes and Session context. A connection edit updates the map and routing together instead of creating competing truths.
2. **Readable at a glance:** Larger class/name hierarchy, explicit static badges, bounded detail levels, accessible meanings, selected-chain focus and quiet borders. An exploration map should be navigable without reading a wall of rows.
3. **Evidence-aware topology:** Separate static expectations, unlinked signatures, travel candidates, confirmed private observations, public reports and historical links. Explain why an edge is unavailable to a route.
4. **Useful Journey connection:** Prompt for evidence after an eligible observed transition, attach confirmed passage history and make Session replay useful without resurrecting old connections into live navigation.
5. **Preparation and return:** Route from the current chain to a chosen home/hub/public exit with constraints and recorded observation age, using Kairo's existing internal navigation and explicit EVE commands.
6. **Local, predictable performance:** Use central caches, bounded record sets, memoized topology and finite camera transitions. Stable coordinates and no idle simulation avoid recreating the user's earlier fan/CPU problem.

## Release evidence required

The implementation matrix should name which of W01–W51 are supported, adapted or still absent, with source/test evidence. At minimum exercise the supplied J225111 card, special/unknown classes, persisted node movement, link/signature synchronization, partial versus complete scan, import/re-import with stale metadata, connection expiry, passage uncertainty, selected-pilot isolation, replay separation, narrow screens, keyboard operation and reduced-motion/idle behaviour. Exercise actual compiled UI workflows, not just normalization helpers. Do not use a green unit-test count as proof that remote collaboration exists.
