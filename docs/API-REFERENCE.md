# HTTP and event reference

This reference describes the **0.8.0 feature set in candidate `0.8.0-rc.17`**. It is the authoritative documentation for local HTTP and SSE contracts. For in-process integration, use [Internal API](INTERNAL-API.md); for security rationale, [Authentication and security](AUTH-AND-SECURITY.md); for candidate evidence, [Validation](VALIDATION.md).

The original source audit was `a7b1bf97`, 8 October 2026. Its historical [audit receipt](https://github.com/BunBajiro/kairo/blob/27516e5c6e1d73e5118835c798ed3420a30c2b0d/analysis/rc17/completion/c954-resumption/resumed/oct8/internal-api-docs/HTTP-SOURCE-NOTES.json) pins that earlier source and its dispatcher conditions. This documentation pass checked the current dispatcher and owners against the build90 source carried by checkpoint `42c00e6`; the historical receipt is not current release acceptance.

The route dispatcher is `server/index.mjs`. Unless a row says otherwise, dashboard routes below are relative to **`/api`**, return JSON with HTTP **200**, and set `Cache-Control: no-store`. Service names identify the authoritative implementation and return value; they do not imply an additional response envelope. The API does not have a generated schema or versioned public compatibility promise.

The tables inventory current route families and their owners. They are not a complete JSON Schema for every nested record. Where a row names a domain input/projection, follow the linked owner below; do not assume an omitted property is accepted or required. [Worked requests](#worked-requests) show exact envelopes for common integration patterns.

| Find | Contract home |
| --- | --- |
| Session, Host/Origin, CSRF, error and body rules | [Listener and request boundary](#listener-and-request-boundary) |
| Bootstrap, snapshots, settings, EVE login, modules and export | [Core routes](#bootstrap-data-configuration-and-authentication) |
| Scans, cache reads and import plans | [Markets](#markets-and-import-planning) |
| Private stream configuration, OBS commands and protection | [Studio, OBS and OPSEC](#studio-obs-and-opsec) |
| Timeline, legacy Journey, annotations, Goals and Sessions | [Local records](#timeline-journey-places-goals-notes-and-sessions) |
| Atlas, Maps, operations, feeds, navigation and politics | [Universe](#universe-maps-and-operations) |
| Private delivery and reconnect | [Dashboard SSE](#dashboard-sse-and-client-invalidation) |
| Public-to-OBS display DTO | [Browser-source API](#read-only-browser-source-api) |

Nested validators/DTO owners: [Goals](../server/goals.mjs), [Markets](../server/markets.mjs), [Import Analyser](../server/imports.mjs), [Sessions/report](../server/history.mjs), [replay](../server/session-replay.mjs), [Stream config](../server/stream.mjs), [OBS](../server/obs.mjs), [Universe](../server/universe.mjs), [Maps commands](../server/universe-jspace.mjs), [operations](../server/universe-operations.mjs), [navigation](../server/universe-navigation.mjs), [feeds](../server/universe-feeds.mjs), and [politics](../server/universe-politics.mjs).

## Listener and request boundary

| Boundary | Implemented behavior |
|---|---|
| Dashboard | Binds `127.0.0.1`; default port 4380 (`options.port` / `KAIRO_PORT`). Canonical origin is `http://127.0.0.1:<port>`. |
| Browser source | Separate listener, default dashboard port+1 (`options.streamPort` / `KAIRO_STREAM_PORT`). Both ports must be distinct integers 1024–65535. |
| Host validation | Exact `127.0.0.1:<listenerPort>` or `localhost:<listenerPort>`. Other Host values receive 403. Dashboard GETs on localhost outside `/api/` redirect 302 to the canonical 127.0.0.1 origin. |
| Session | Opening dashboard `/` establishes a random `kairo_session` cookie if no current session exists. Cookie: HttpOnly, SameSite=Lax, Path=/, `Max-Age=86400`. Session/CSRF values live in a process Map; valid requests extend server expiry by 24 hours. Managed restart can supply preserved `initialSessions`. |
| Private API gate | `/api/` requires a valid session and `isOwn(req)`: Origin absent or exactly the canonical dashboard origin, and Sec-Fetch-Site not `cross-site`. Failure is 401. This applies to reads and SSE too. It is not bearer-token authentication. |
| Mutations | Every non-GET API request additionally needs `x-kairo-csrf` equal to the bootstrap token and the same-origin check. Failure at this stage is 403. HEAD/OPTIONS are not treated as GET by API dispatch. |
| JSON body | Routes that call `body()` require Content-Type beginning `application/json`; cumulative request bytes default to 150,000. Empty accepted body becomes `{}`; malformed JSON, wrong content type and overflow throw and normally become 400. Routes without `body()` do not acquire an implicit body requirement. |
| Larger bodies | J-Space import preview/import: 4,100,000 bytes. Upgrade preview/import: 1,000,000. Links preview and link-list save: 2,000,000. Other parsed bodies remain 150,000. |
| Character selector | Where marked **C**, query `character` is parsed through `checkedChar`: omitted→0; safe integer≥0; positive IDs must be in `auth.characters()`. Downstream service checks still own scope/map/pilot requirements. This is not an automatic rule for every endpoint. |
| Failures | Dashboard thrown errors become `{error: message}` with 400, except `error.status===409` produces 409. Explicit cases include 401 session, 403 host/CSRF, 404 unknown route, and 503 shutdown/dataset handover. Unknown API method/path generally falls through 404 after the CSRF gate, not 405. |
| Shutdown | Stopping listeners return 503 and `Retry-After: 2`. Accepted dashboard handler promises are tracked/drained during shutdown, including writes whose client disconnected. New event-stream connection is also refused 503 while dataset activation is underway. |
| Headers | Dashboard CSP limits connections to self and frames to the source origin; frame ancestors none. Source CSP allows only its own scripts/connections, local/data images and framing by dashboard origin. Both set nosniff and no-referrer. |

Outside `/api`: `/auth/eve/callback` consumes session-bound OAuth `state` and `code`, redirects 303 to Connections with `auth=connected`, `cancelled` or `failed`; its path branch is not method-gated. Starting OAuth is the POST below. Dashboard `/stream*` redirects 302 to the source listener preserving pathname (not query). Remaining dashboard static requests allow GET/HEAD and reject other methods 405. Static serving tries the path, `.html`, and `/index.html`, checks containment, rejects NUL/backslash, and returns 404 when absent. HTML is no-store; other dashboard assets normally cache one hour. Do not derive API method behavior from these static-file rules.

## Bootstrap, data, configuration and authentication

| Method/path | Inputs | Output / owner |
|---|---|---|
| GET `/bootstrap` | Session | `{csrf,configured,clientId,characters,modules,settings,stream,streamOrigin,version,datasetRevision,datasetRecovery,vault,localOnly,pages}` assembled by index/Core/registry. No OAuth tokens returned. |
| GET `/state` | C | `{data,names,namesRevision,health,opsec,sessions,resourceRevisions}`. Core snapshot map; latest 20 selected-pilot session rows ordered by start; authoritative full private name map with its process-qualified revision. |
| GET `/events` | Session | Dashboard SSE described below; initial global names bootstrap, connected comment and dataset revision/status frames. |
| POST `/sync` | `{character?}` |202 `{ok:true}`; validate connected nonzero pilot, queue that pilot and global 0 through `core.requestSync`. Not a synchronous completion report. |
| GET `/datasets` | — | Dataset service status plus `managedRestart`. |
| POST `/datasets/check` | No parsed body |202 current status; starts `datasets.check({install:false})` asynchronously. Observe status/events for completion. |
| POST `/datasets/install` | No parsed body |202 current status; starts installation asynchronously. |
| GET `/settings/polling` | — | `core.pollingSettings()`: current collector cadence configuration. |
| PUT `/settings/polling` | `{intervals}` | `core.savePolling(intervals)`; service validates policy. |
| PUT `/settings` | `{clientId?,theme?}` | `{ok:true}`; Client ID is 8–128 word/hyphen chars and cannot change with connected characters. Allowed themes mint/amber/ice. |
| POST `/auth/start` | `{scopes: string[]}` from `allScopes` | `{url}` from `auth.authorize(session.key, uniqueScopes)`; browser navigates to EVE authorization. |
| DELETE `/characters/:id` | Numeric path segment, prefix dispatch | `{ok:true}`; `auth.disconnect`, refresh OPSEC/bindings, invalidate roster/state/Goals. |
| PUT `/modules` | `{id,enabled:boolean}` | `{modules}`; `core.toggle` enables/disables catalog or registry module and refreshes derived output. |
| GET `/modules/:id` | C; prefix dispatch | Enabled registry module's `read({db,store,characterId})` result. Unknown/disabled/no-read module falls through 404. No generic module write endpoint. |
| GET `/export` | — | Attachment `kairo-history.json`, export format version 9: selected history/user-data tables, goals/tracking, notes, visits, sessions, places, combat, maps/universe data, Markets settings/plans/hubs, stream config, and character ID/name pairs. Read the concrete export DTO before extending it; it is not a full SQLite/vault backup. |

Registry details: `server/registry.mjs` loads `.mjs` default exports from `server/modules`, validates unique IDs against `^[a-z][\w-]*$`, and exposes enabled `page` metadata via bootstrap. Core's built-in catalog is separate from registry extension `read`. The shipped `milestones` extension publishes semantic events but has no `read`/`page`, so it does not currently create a data endpoint despite being a registered module. A new extension must explicitly implement `read` to use this route.

## Markets and import planning

These endpoints share the local market cache; they are not selected-pilot scoped by `checkedChar`. Pilot IDs needed for ESI access/trader settings are validated inside `server/markets.mjs` and `server/imports.mjs`. The dispatcher forwards body/query fields to those service methods.

| Method/path | Inputs | Output / owner |
|---|---|---|
| GET `/markets` | — | `markets.overview()`: hubs, jobs/current job, quick supplies, Jita scan, archive/upgrade/module state. |
| POST `/markets/hubs` | Hub input: `locationId`, optional `name`, access `characterId` | Verified saved hub from `addHub`. |
| DELETE `/markets/hubs/:digits` | Numeric hub path ID | Updated overview from `removeHub`. |
| POST `/markets/defaults` | No parsed body | Updated overview from `restoreDefaults`. |
| POST `/markets/discover` | Discovery input (current pilot location or system name, access pilot) | `discover(body)` result. |
| PUT `/markets/quick` | Add exact `name`, or `remove` / `removeName` | Updated overview from `quickChange`. |
| POST `/markets/scan` | `{hubId,mode,characterId?,typeId?,compareJita?}`; mode `quick`/`full`/`item`/`history` |202 job from `markets.start(body)`; later overview exposes progress. One active scan; repeated identical active input can return its existing job. |
| POST `/markets/upgrade` | No parsed body | `resumeUpgrade(true)` overview. |
| POST `/markets/cancel` | No parsed body | `cancel()` current job/result. |
| GET `/markets/categories` | `hub` | `categories(Number(hub))`. |
| GET `/markets/browse` | `hub`, `category`, `query`, `filter`, `sort`, zero-based `page` | `browse(hub, query)` → `{rows,total,page,pages,hub}`; up to 60 rows. Filters `all`/`quick`/`sell`/`empty`; sorts `name`/`sell`/`premium`/`quantity`. |
| GET `/markets/item` | `hub`, `type`; additional query e.g. side/page | `detail(hub,type,query)`. |
| GET `/markets/report` | `hub`, `signal` (`premium`/`undersupply`/`bargain`/`spread`), `threshold`, `cover`, zero-based `page` | `report(hub,query)` includes rows/total/page/pages/counts, thresholds and generation time; up to 40 rows. |
| POST `/markets/type` | `{typeId}` | Verified/enriched type from `enrichType`. |
| GET `/markets/imports` | `hub` | `imports.state(hub)`: settings/fees/buyer/watched pilots/categories/saved-plan summaries. |
| PUT `/markets/imports/settings` | `{hubId,settings}` | `saveSettings(hubId,settings)`. |
| POST `/markets/imports/refresh` | `{hubId}` | Awaited `refresh(hubId)`. |
| GET `/markets/imports/analyse` | `hub` | `analyse(hub)` opportunities, reasons, source stamps and context. |
| GET `/markets/imports/item` | `hub`, `type` | `detail(hub,type)` qualifying opportunity. |
| POST `/markets/imports/quote` | `hubId` and quote input: typeId, strategy, price, quantity, duration | `quote(hubId,body)`; server price/availability/haul checks remain authoritative. |
| POST `/markets/imports/plan-quote` | `hubId`, `lines` | `planQuote(hubId,body)` including totals/packing. |
| GET `/markets/imports/plans` | `hub`, optional `id` | `getPlan(hub,id)`. |
| POST `/markets/imports/plans` | `hubId`, `name`, `lines`, optional saved `id` | `savePlan(hubId,body)` saved quoted plan. |
| DELETE `/markets/imports/plans` | JSON `{hubId,id}` | `removePlan(hubId,id)`, normally `{ok:true}`. This DELETE uses a body. |

## Studio, OBS and OPSEC

These are private control-plane routes. Only the separate source listener carries display output.

| Method/path | Inputs | Output / owner |
|---|---|---|
| GET `/stream` | — | Sanitized saved `core.stream.config()`. |
| PUT `/stream` | Full `{elements,rules,position,muted,paused}` configuration | Sanitized saved config; dispatcher computes `bindingProjections(store,auth,elements)` before `stream.save`. At most 50 elements. |
| GET `/stream/sources` | — | `{goals,contexts}`: goal ID/pilot/title/progress/target/done rows and supported toast contexts. |
| POST `/stream/preview` | Sanitizer-compatible config (`elements` and `rules` required; Studio uses minimal binding fields) | Element binding projection map from `projections.mjs`; does not save draft geometry/config. |
| POST `/stream/test` | `{event?}` (default `test.toast`) | `{ok: emitted}` from `stream.emit(event,true)`; paused output can suppress it. |
| GET `/obs` | — | `{config,status}` from `core.obs`. Config includes `passwordSaved`, not decrypted password. |
| GET `/obs/status` | — | Current connected/connecting/state/applied/error/version/changing/log status. |
| PUT `/obs` | OBS config/rules, optional password | `{status,config}` after awaited `obs.save`; this can connect/apply, not just persist. |
| GET `/obs/targets` | — | Awaited scene/input/collection inventory; may connect through OBS service. |
| GET `/obs/filters` | `source` | Filter name/enabled list from `obs.filters(source)`. |
| POST `/obs/reconnect` | No parsed body | Status from awaited `obs.reconnect()`. |
| POST `/obs/apply` | No parsed body | Status from awaited `obs.reapply()`. |
| PUT `/opsec` | `{manual,allowHighsec,blueAlliances,hostileAlliances,characterId}` | `{ok:true,state}`; IDs filtered to positive safe integers/max 100 per override list; blue/hostile overlap rejected; connected pilot required when nonzero; recompute protection. |

`sanitizeConfig` in `server/stream.mjs` clamps geometry/style, validates eligible binding kinds and reconstructs supported toast rules. Routine Core binding refresh evaluates saved visible elements; private preview and explicit save still evaluate their requested sanitized inputs. Do not confuse that accepted hidden-element optimization with an API change.

## Timeline, journey, places, Goals, notes and Sessions

| Method/path | Inputs | Output / owner |
|---|---|---|
| GET `/timeline` | C; `before`, `beforeId`, `limit` 1–100 (default 5), `q` trimmed/lowercased/max 200 | `{items,more,nextCursor}`. Descending `(at,id)` stable cursor, includes selected-pilot and global events; parsed payload JSON. `nextCursor` is `{at,id}`. |
| GET `/journey` | C | `journeyData(store,character)`. |
| PUT `/journey/connections/:digits` | C; numeric connection ID; `{hidden}` | `setJourneyConnection` result. |
| POST `/journey/enrich` | C; no parsed body | `{results:[{id,ok}]}` for up to 25 systems missing coordinates/region; per-system failures retained. |
| GET `/places` | — | All place notes ordered updated descending, parsed tags. |
| GET `/places/:kind/:id` | kind system/constellation/region; positive safe ID | Existing note or `{kind,entity_id,body:'',tags:[],status:'none'}`. |
| PUT `/places/:kind/:id` | Valid place + note body | `savePlaceNote` result. |
| DELETE `/places/:kind/:id` | Valid place | `{ok:true}`. J-Space systems/containers matching wormhole systems are rejected here; chain-map notes own them. |
| GET `/goals/sources` | C | `goalSourceOptions(store,auth,character)`. |
| POST `/goals/type` | Type lookup input | `lookupGoalType` verified type; remembers verified names. |
| GET `/goals` | C | `listGoals` projected goals, including tracking state. |
| POST `/goals` | C; goal creation body, optional `typeId` verified first |201 goal from `core.goals.create`; refresh bindings. |
| PUT `/goals/:id` | `{progress}`; optional C ownership check if query present | `{ok:true}`; finite progress clamped 0..target; automatic tracked goals reject manual progress. Publishes goal.updated/completed when appropriate and updates bindings. |
| DELETE `/goals/:id` | Optional C ownership check | `{ok:true}`; invalidates owning pilot Goals and updates bindings. |
| GET `/notes` | C | Latest 100 notes, descending created. |
| POST `/notes` | C; `{body}` trimmed/max 5000/nonempty |201 `{id}`; publishes `note.created`. |
| DELETE `/notes/:id` | Optional C ownership check if note exists | `{ok:true}`; invalidates owning pilot notes when found. |
| POST `/session` | C; `{action:"start",label?}` or `{action:"end"}` | `{id}` from `history.mjs`; end targets this pilot’s active Session. Updates bindings and can request Session combat refresh. |
| GET `/sessions` | C; `offset` integer-clamped 0..100000 | `{items,more}`; 30 rows from 31 fetched, descending `(started,id)`. |
| GET `/sessions/:id/replay` | C; URI-decoded single-segment ID | `sessionReplay` fixed snapshot: session/times/visits/events/systems/travel/coverage. Pilot ownership, event-cap/gap/inferred metadata belong to `server/session-replay.mjs`. |
| GET `/sessions/:id` | C; report `offset` clamped 0..100000; optional `eventCursor` nonnegative safe integer and `eventEnd` valid time within the Session's current interval | `sessionReport`: start/finish, activity/route/combat/economic detail, 100 events +more/offset, and `eventCursor`/`eventEnd`. Pass both snapshot fields for later pages to retain event membership/counts despite delayed inserts. Source projections can change independently; the UI appends only events/more and retains its original summary/details. Existing Refresh acquires a new snapshot. May asynchronously refresh Session combat when syncing is enabled. |
| PUT `/sessions/:id` | C; `{label,notes}` | `{ok:true}`; nonempty trimmed label≤100; notes≤12000; selected-pilot ownership required; invalidate Sessions/update bindings. |

Do not infer a universal REST ID parser: some legacy routes use prefix matching and raw `split('/')` segments, while newer routes use exact regexes and `decodeURIComponent`. The [dynamic dispatch inventory](#exact-dynamic-dispatch-patterns) records this deliberately. Clients should use the canonical routes shown, not rely on extra suffixes accepted by prefix dispatch.

## Universe, Maps and operations

Unless a row explicitly says **global**, these routes use C. The Universe service and its J-Space/operations/navigation/feed owners enforce additional scope, revision and ownership contracts. Command bodies are domain DTOs, not arbitrary database updates; map commands/removal can reject stale revisions with 409. Use service validators and current UI command construction when adding fields.

| Method/path | Inputs | Output / owner |
|---|---|---|
| GET `/universe/static` | Global; Accept-Encoding / If-None-Match | Static atlas JSON. Lazily retained raw/gzip buffers; SHA256 ETag; private,no-cache; Vary Accept-Encoding; exact ETag match 304. No character query validation. |
| GET `/universe` | C | `core.universe.state(character)` private overlay/state DTO. |
| GET `/universe/systems/:digits` | C; numeric system | `universe.detail` plus full names map; sovereignty owner names may be enriched first. |
| POST `/universe/search` | C; `{name}` exact case-insensitive static system match | Same detail +names result; unknown name 400. |
| POST `/universe/route` | C; route request body | `universe.route(character,body)`. |
| POST `/universe/jump-plan` | C; jump request body | `universe.jump(character,body)`. |
| POST `/universe/structures/verify` | C; `{structureId}` | Awaited `verifyStructure`. |
| GET `/universe/jspace` | C | `jspace.state(character)` private workspace state. |
| GET `/universe/jspace/summaries` | C | `jspace.summaries(character)`. |
| GET `/universe/jspace/search` | C; `kind?`, `q` | `jspace.search(character,{kind,q})`. |
| PUT `/universe/jspace/tracking/active` | Global query handling; body `{character_id}` | `jspace.setActivePilot(character_id)`; owner validates target. |
| GET `/universe/jspace/scope-options` | C | `universe.scopeOptions(character)`. |
| GET `/universe/jspace/owners/search` | C; `kind`, `q` | Awaited `universe.searchOwners`. |
| POST `/universe/jspace/destinations` | C; destination lookup body | `universe.jspaceDestinations`. |
| POST `/universe/jspace/maps` | C; map creation body | `jspace.create`. |
| POST `/universe/jspace/import/preview` | C; import body≤4,100,000 bytes | `jspace.previewImport`. |
| POST `/universe/jspace/import` | C; import body≤4,100,000 bytes | `jspace.importMap`. |
| GET `/universe/jspace/maps/:id` | C; URI-decoded map ID | `jspace.map`. |
| DELETE `/universe/jspace/maps/:id` | C; ID + JSON removal/revision body | `jspace.remove`. |
| POST `/universe/jspace/maps/:id/commands` | C; ID + command/revision body | `jspace.command`; shared map mutation boundary. |
| POST `/universe/jspace/maps/:id/duplicate` | C; ID + duplication body | `jspace.duplicate`. |
| GET `/universe/jspace/maps/:id/export` | C; ID; `format` default `kairo` | `jspace.exportMap`; JSON attachment `kairo-jspace-map.json`. |
| GET `/universe/operations` | C; `map_id` | `operations.state`. |
| GET `/universe/operations/config` | C | `operations.config`. |
| PUT `/universe/operations/config` | C; config body | `operations.saveConfig`. |
| GET `/universe/log-directories` | Global | Awaited `operations.defaultLogDirectories()`. |
| POST `/universe/intel` | C; intel body | `operations.ingestIntel`. |
| DELETE `/universe/intel/:id` | C; decoded ID; `map_id` | `operations.removeIntel`. |
| POST `/universe/alerts/:id/ack` | C; decoded ID; `map_id`; no parsed body | `operations.acknowledge`. |
| POST `/universe/signatures/preview` | C; signature import body | `operations.previewSignatures`. |
| POST `/universe/signatures/import` | C; signature import body | `operations.importSignatures`. |
| POST `/universe/signatures/restore` | C; restoration body | `operations.restoreSignature`. |
| POST `/universe/signatures` | C; signature record body | `operations.saveSignature`. |
| DELETE `/universe/signatures/:id` | C; decoded ID; `map_id` | `operations.removeSignature`. |
| POST `/universe/upgrades/preview` | C; import body≤1,000,000 bytes | `operations.previewUpgrades`. |
| POST `/universe/upgrades/import` | C; import body≤1,000,000 bytes | `operations.importUpgrades`. |
| POST `/universe/upgrades` | C; upgrade record body | `operations.saveUpgrade`. |
| DELETE `/universe/upgrades/:id` | C; decoded ID; `map_id` | `operations.removeUpgrade`. |
| GET `/universe/upgrades/export` | C; `format` default `smt`, `system?`, `map_id` | `{text,format}` service result written as text/plain attachment `kairo-infrastructure.json` or `.txt`. |
| POST `/universe/operations/refresh` | C; `map_id`; no parsed body | Awaited `operations.refresh`. |
| GET `/universe/feeds` | Global | `feeds.state()`. |
| GET `/universe/feeds/config` | Global | `feeds.config()`. |
| PUT `/universe/feeds/config` | Global; config body | `feeds.saveConfig`. |
| POST `/universe/feeds/refresh` | Global; refresh body | Awaited `feeds.refresh`. |
| POST `/universe/feeds/import` | Global; import body | `feeds.importData`. |
| PUT `/universe/feeds/storms` | Global; array or `{items}` | `feeds.saveStorms(items)`. |
| GET `/universe/navigation` | C; `map_id` | `navigation.state`. |
| PUT `/universe/navigation/itinerary` | C; itinerary body | `navigation.saveItinerary`. |
| DELETE `/universe/navigation/itinerary` | C; `map_id`; no body | `navigation.clearItinerary`. |
| DELETE `/universe/navigation/stops/:id` | C; decoded stop ID; `map_id` | `navigation.removeStop`. |
| POST `/universe/navigation/reorder` | C; reorder body | `navigation.reorderStops`. |
| POST `/universe/navigation/plan` | C; planning body | Awaited `navigation.plan`. |
| POST `/universe/navigation/waypoints` | C; waypoint body | Awaited `navigation.sendWaypoints`; can invoke authenticated ESI waypoint actions. |
| POST `/universe/navigation/bridges` | C; discovery body | Awaited `navigation.discoverBridges`. |
| POST `/universe/navigation/reachability` | C; reachability body | Awaited `navigation.reachability`. |
| POST `/universe/links/preview` | C; link import body≤2,000,000 bytes | `universe.previewLinks`. |
| POST `/universe/links/prune-expired` | C; no parsed body | `universe.pruneExpired`. |
| GET `/universe/link-lists/:id/export` | C; decoded ID | `universe.exportLinks().text`; text/plain attachment `kairo-ansiblex-smt.txt`. |
| POST `/universe/views` | C; view body | `universe.saveView`. |
| DELETE `/universe/views/:id` | C; decoded ID | `universe.deleteView`. |
| POST `/universe/links` | C; link body | `universe.saveLink`. |
| DELETE `/universe/links/:id` | C; decoded ID | `universe.deleteLink`. |
| POST `/universe/link-lists` | C; list body≤2,000,000 bytes | `universe.saveLinkList`. |
| DELETE `/universe/link-lists/:id` | C; decoded ID | `universe.deleteLinkList`. |
| POST `/universe/pins` | C; pin body | `universe.savePin`. |
| DELETE `/universe/pins/:id` | C; decoded ID | `universe.deletePin`. |
| GET `/universe/politics/config` | Global | `universe.politicsConfig()`. |
| PUT `/universe/politics/config` | Global; politics config | Saved config; publishes `universe.politics_configured` with revision. |
| GET `/universe/politics` | Global | `universe.politicsState()`. |
| POST `/universe/politics` | Global; no parsed body | `universe.refreshPolitics({force:true})` result. |
| GET `/universe/politics/alliances` | Global; `q`≤150 | `{items}` from `politicsAlliances`. |
| POST `/universe/politics/alliances/resolve` | Global; `{query}` exact alliance name/ID, 1–150 chars | Known match or ESI-verified `{alliance_id,name,ticker}`; rejects stale/unverified result and remembers verified name. |

## Worked requests

These examples run **inside the local dashboard application** with its existing session. They use the real [`api`](../components/kairo/model.ts) helper, whose path is relative to `/api`. `character` is the current connected pilot ID; `boot` is the current bootstrap object. The snippets demonstrate operations individually, not a script to run against a user's live data.

### Read a snapshot and request synchronization

```ts
const state = await api(`/state?character=${character}`);
const wallet = state.data.wallet;
// Inspect wallet.status and timestamps before interpreting wallet.data.
const accepted = await api('/sync', 'POST', {character}, boot.csrf);
// accepted is {ok: true}; HTTP 202 is queue acceptance, not data completion.
```

A common snapshot is `{status,data,updatedAt?,expiresAt?,refreshAt?,retryAt?,error?,dataRevision?}` with further per-source metadata. Missing, stale, disabled and zero data are different states. Full freshness/identity semantics are in [Internal API](INTERNAL-API.md#read-models-freshness-and-identity).

### Create a private note

```ts
const created = await api(
  `/notes?character=${character}`,
  'POST',
  {body: 'Prepare probes before the next session.'},
  boot.csrf,
);
// HTTP 201; created is {id: '<generated UUID>'}.
const notes = await api(`/notes?character=${character}`); // An array, not {data: ...}.
```

The server trims note text, rejects an empty result and limits it to 5,000 characters. Read-model invalidation follows `note.created`; it is not the note body broadcast as an SSE payload.

### Edit a revisioned private map

```ts
const mapPath = `/universe/jspace/maps/${encodeURIComponent(mapId)}`;
const map = await api(`${mapPath}?character=${character}`);
const updated = await api(
  `${mapPath}/commands?character=${character}`,
  'POST',
  {revision: map.revision, op: 'map.update', name: 'Expedition chain'},
  boot.csrf,
);
// updated is the full projected map, including its new revision.
```

Both pilot ownership and map writability are checked. The command envelope is `{revision,op,...operationFields}`; it is not `{command:{...}}`. A stale or missing revision produces HTTP 409 `{error: message}`. The dispatcher does not serialize the in-process error's `code` or `revision`, so fetch the current map to reconcile. The `api` helper throws a plain `Error(message)` and does not preserve HTTP status; a caller needing status must explicitly retain the response.

The command switch currently recognizes `map.update`, `group.add`, `node.save`, `nodes.position`, `node.remove`, `nodes.remove`, `connection.save`, `connection.remove`, `pilot.add`, `pilot.tracking`, `pilot.remove`, `passage.add`, `passage.save`, `passage.remove`, `observation.save`, `observation.remove`, `comment.add`, `comment.remove`, `ping.add`, `ping.remove`, `signature.save`, `signature.remove` and `undo`. Each operation has its own validator and undo policy in [`universe-jspace.mjs`](../server/universe-jspace.mjs); the names alone do not define its body schema. Canonical expiry can advance a revision during a read.

### Page a Session report without changing its event snapshot

```ts
const path = `/sessions/${encodeURIComponent(sessionId)}?character=${character}`;
const first = await api(path);
if (first.more) {
  const query = new URLSearchParams({
    offset: String(first.events.length),
    eventCursor: String(first.eventCursor),
    eventEnd: first.eventEnd,
  });
  const next = await api(`${path}&${query}`);
  // Append next.events; retain first's summary/details and snapshot fields.
}
```

Use [`loadSessionReportPage`](../components/kairo/session-report-page.mjs) in the product UI: it supplies the existing ownership and merge behavior. The cursor/end freeze event membership; they do not freeze independently updated combat/source projections. A deliberate Refresh starts a new report snapshot.

### Read a saved market book

```ts
const query = new URLSearchParams({
  hub: String(hubId), category: 'all', filter: 'sell', sort: 'name', page: '0',
});
const book = await api(`/markets/browse?${query}`);
// book is {rows,total,page,pages,hub}; rows come from the local saved scan.
```

`hubId` is a saved hub ID from `/markets`. Browsing does not start a scan. A scan is an explicit POST, for example `{hubId,mode:'quick',characterId,compareJita:false}` to `/markets/scan`; its HTTP 202 job is followed through `/markets`. Structure access, catalog/type validity and scan admission remain server responsibilities.

### Preview and save Stream configuration

```ts
const config = await api('/stream');
const preview = await api('/stream/preview', 'POST', config, boot.csrf);
// preview is an element-ID-to-binding-projection map; it does not save config.
const saved = await api('/stream', 'PUT', config, boot.csrf);
// saved is sanitized configuration. The separate source receives projected state.
```

`PUT /stream` is a whole-configuration save, not a JSON patch. A minimal example must still include `elements` and `rules` arrays. Real Studio editing should use its existing draft and preview owners so a late save cannot overwrite a newer draft. Never send raw snapshots to the source listener.

## Exact dynamic dispatch patterns

These are dispatcher patterns after stripping `/api`; names such as `:id` in tables are readable aliases, not a router library's matching syntax. Source order matters: exact special routes appear before generic prefix handlers.

| Shape | Actual recognition and extraction |
|---|---|
| Markets hub deletion | `^/markets/hubs/\d+$`; numeric segment 3. |
| Journey connection | `^/journey/connections/\d+$`; numeric segment 3. |
| Character deletion | `startsWith('/characters/')`; numeric segment 2. No end-anchored route regex. |
| Goal / note update-delete | `startsWith('/goals/')` / `startsWith('/notes/')`; raw segment 2. |
| Place record | `startsWith('/places/')`; kind segment 2 and numeric ID segment 3; domain validation then method branch. |
| Session replay | `^/sessions/[^/]+/replay$`; decoded segment 2. Checked before generic Sessions. |
| Session report/update | `startsWith('/sessions/')`; raw segment 2. |
| Map record | `^/universe/jspace/maps/[^/]+$`; decoded segment 4. |
| Map command | `^/universe/jspace/maps/[^/]+/commands$`; decoded segment 4. |
| Map duplicate | `^/universe/jspace/maps/[^/]+/duplicate$`; decoded segment 4. |
| Map export | `^/universe/jspace/maps/[^/]+/export$`; decoded segment 4. |
| Intel deletion | `^/universe/intel/[^/]+$`; decoded segment 3. |
| Alert acknowledgment | `^/universe/alerts/[^/]+/ack$`; decoded segment 3. |
| Navigation stop | `^/universe/navigation/stops/[^/]+$`; decoded segment 4. |
| Link-list export | `^/universe/link-lists/[^/]+/export$`; decoded segment 3. |
| System detail | `^/universe/systems/\d+$`; numeric segment 3. |
| Signature / upgrade deletion | Loop-generated `startsWith('/universe/'+collection+'/')`; decoded segment 3. |
| View / link / link-list / pin deletion | Same loop-generated prefix pattern; decoded segment 3. |
| Extension read | `startsWith('/modules/')`; raw segment 2, registry lookup +enabled+read checks. |

Array indices above are those of `path.split('/')`, whose segment 0 is empty. Extra suffix tolerance in prefix handlers is an implementation fact, not a recommended client interface. Percent decoding is only explicit where listed; invalid decoding throws through the normal error boundary.

## Dashboard SSE and client invalidation

`GET /api/events` is one private local EventSource feed for the dashboard session. Server broadcasts are not narrowed to the currently selected pilot; client owners filter applicable global 0/selected-pilot data signals, while the `names` event is always global and must be processed independently of pilot selection. Studio can still observe bindings from other pilots. Frames have `event: <type>` and one JSON `data:` line; there are no SSE event IDs, Last-Event-ID replay cursor or persisted delivery acknowledgments. Reconnect must recover authoritative reads.

| SSE event | Payload / ownership |
|---|---|
| `names` | `{names,namesRevision}`: authoritative full private ID-to-string directory, sent on every connection and before a later snapshot when that connection has not received the current revision. This is global, with no `characterId`; replacements may remove entries or be empty. |
| Initial comment `: connected` | Sent after the names bootstrap. Transport comment, not an application event named connected. Dashboard uses native EventSource open for `kairo:events-connected`. |
| `dataset-revision` | `{revision,recovery}` immediately on connection. Dataset generation/restart reconciliation. |
| `datasets` | Dataset status +`managedRestart`; sent on connect and service status changes. |
| `dataset-restarting` | `{build,startedAt}` before managed activation. |
| `dataset-restart-cancelled` | `{message}` when activation callback fails; old dataset remains active. |
| `snapshot` | `{characterId,key,snapshot,namesRevision}` from Core dataset/combat owners. No names body; any required global names event is ordered first. Snapshot includes status/data/metadata and private `dataRevision`; unchanged data identity does not imply unchanged status/expiry. |
| `changed` | `{...detail,resourceRevisions}`; detail can include characterId, type, module, resources. Semantic publishes and explicit invalidations use it. Missing/nonspecific resources mean recovery, not permission to drop invalidation. |
| `universe` | `{characterId}` with 0 global; Universe owner says to refresh relevant mounted state. |
| `obs` | Full OBS status, not configuration/password; immediate UI status updates. |
| `opsec` | Private protection state, including reason/character/freshness diagnostics. Broader than broadcast's `{state,hidden}`. |
| Heartbeat comment | `: heartbeat` every 10 seconds on UI and stream clients. Not an event for fetching all resources. |

`server/ui-resources.mjs` versions the recognized read resources `activity`, `goals`, `notes`, `sessions`, `goalSources` with opaque process-epoch tokens. Additional detail names (for example roster/state/sessionReport) still carry invalidation meaning; only recognized names participate in that version map. Consumers must not parse versions as timestamps or use them as persistent history identity.

Dashboard translates these into local DOM events (`kairo:source-changed`, `kairo:resource-changed`, `kairo:universe-changed`, `kairo:obs-status`, `kairo:events-connected`, `datasets-changed`). Those are **in-process UI notifications**, not extra server routes or SSE names. `core.publish` also emits an in-process semantic bus event after durable deduplicated history insertion; bus `data.<key>` events and semantic event payloads are not automatically sent as raw SSE. Follow the architecture guide when adding a collector or mutation.

Core advances `namesRevision` only for accepted name changes. It batches directory publication at snapshot boundaries, encodes each needed directory once for that audience and tracks delivery separately per connection. A newly bootstrapped connection does not mark older clients current. With no UI clients it performs no names/snapshot encoding; persistence and future bootstrap still apply. This is a full-map-on-change protocol, not a per-key delta stream or replay log. Initial HTTP state and the connection bootstrap can both contain the full directory.

Dashboard's `name-directory-state.mjs` owns revision equality, within-process counter order, process-epoch changes and delayed-HTTP fences. Equal versioned identity preserves its prior map without scanning keys. A changed authoritative full map replaces the directory, including reset/removal. A disconnect invalidates outstanding names reads and permits fresh HTTP recovery while SSE is down; reconnect's bootstrap establishes the current process epoch. Keep the separate snapshot/resource/pilot/dataset fences intact. The revision in a snapshot is metadata, not a delivery acknowledgment or an instruction to fetch every resource.

For declared legacy inputs, the frontend also accepts a full unversioned `/state.names` replacement and unversioned snapshot `names` merges that preserve omitted keys. Such input disables revision-only reuse until authoritative versioned state recovers it. Current server snapshots omit `names`; this fallback does not change their wire shape or make new global names events pilot-scoped.

## Read-only browser-source API

These paths are relative to **the separate source origin**, not `/api`. They require the correct local Host but no dashboard session/CSRF. Only GET is accepted; every other method is 405. Unknown path 404; unexpected source-handler failures 500 `{error:'Stream output is reconnecting.'}`. Shutdown returns 503 as above.

| GET path | Result |
|---|---|
| `/state` | `core.stream.state()` display DTO. |
| `/events` | Source SSE; initial `state` frame, later `state` and `toast` frames plus Core heartbeats. |
| `/` or `/stream*` | The same `public/stream/index.html` shell, no-store. Renderer interprets `/stream`, `/stream/toasts`, `/stream/opsec`, `/stream/widget/:id`. Arbitrary `/stream*` paths are accepted by static dispatch but are not new API capabilities. |
| `/render.js`, `/render.css`, `/widgets.css` | Allowed source static assets, no-store. No generic filesystem exposure. |

`state` contains `{version,serverTime,position,muted,paused,elements,opsec,toasts}`. Elements are saved visible elements with display projection fields. The serializer removes binding/sourceId/characterId/bindingDisplay/name control metadata; it does **not** make configured text nonprivate—users control what their overlay displays. Broadcast OPSEC contains only `{state,hidden}`. Toast projection respects configured event/pilot/location/display rules. A toast frame contains display fields such as id/signal/title/message/duration/sound/showAt/expiresAt; its exact safe rendering is owned by `projections.mjs`.

State version is a process-local counter, not persisted history or a universal content hash. Save/protection/changed-binding operations broadcast state; heartbeat binding refresh avoids broadcasting when projection bytes remain equal. Moving to hidden protection demands immediate delivery: a backlogged source client is disconnected instead of receiving the cover behind stale queued output. The renderer fails closed to unknown/hidden on disconnect, renders new protection before attempted persistence, and can only recover the **last successfully persisted** layout after a full offline reload if storage had been denied.

`server/sse.mjs` shares encoded frames across recipients, writes 64 KiB slices, bounds waiting work at 128 frames / 16 MiB, and closes stalled consumers after 15 seconds. One active large frame is allowed outside the waiting-work budget. These are internal transport limits, not application payload-size limits or permission to replay arbitrary snapshots after reconnect.

## Source anchors and maintenance

- Dispatcher, gates, larger body caps, status mapping and both listeners: [server/index.mjs](../server/index.mjs).
- Snapshot/name/private event ownership: [server/core.mjs](../server/core.mjs), [server/ui-resources.mjs](../server/ui-resources.mjs), [server/store.mjs](../server/store.mjs).
- Safe display DTO, bindings and rules: [server/stream.mjs](../server/stream.mjs), [server/projections.mjs](../server/projections.mjs), [public/stream/render.js](../public/stream/render.js).
- Transport queue/heartbeat/close contract: [server/sse.mjs](../server/sse.mjs).
- Registry extension capability: [server/registry.mjs](../server/registry.mjs), [server/modules/milestones.mjs](../server/modules/milestones.mjs).
- Frontend fetch and pilot/reconnect owners: [components/kairo/model.ts](../components/kairo/model.ts), [dashboard.tsx](../components/kairo/dashboard.tsx), [resource-state.mjs](../components/kairo/resource-state.mjs), [scoped-refresh.mjs](../components/kairo/scoped-refresh.mjs).
- Domain inputs and return shapes: service method named in each route row; dynamic command validation remains in J-Space/operations/navigation owners, not the HTTP dispatcher.

When adding or changing an endpoint, update its domain DTO and route row, preserve the relevant pilot/scope/revision checks, publish the correct invalidation after mutation, and include meaningful handler/service tests. A documented route is not sufficient evidence of a new transport protocol: adoption and current-source tests must establish that separately.
