# Universe operational integration contract

Implementation target: 0.8.0-rc.5. Reference: SMT source commit `6b3b4c6a213a349549ef737c89584fc3f048033b`.

All routes below are local authenticated `/api` routes. Private routes use the existing `?character=ID` selection and validate a connected pilot (guest 0 supports manual records only). Mutations require the existing CSRF header. Operational state never appears on the OBS/public server. The existing `/api/universe` response gains `operations`, `feeds` and `navigation` objects; historical replay continues to exclude current operational data.

## Operations

- `GET /universe/operations`: cached operational state.
- `GET /universe/operations/config`, `PUT /universe/operations/config`: read/save the per-pilot configuration.
- `GET /universe/log-directories`: local default-directory suggestions, no ingestion.
- `POST /universe/intel`: ingest user-provided text; `DELETE /universe/intel/:id` removes one report.
- `POST /universe/alerts/:id/ack`: acknowledge a local alert.
- `POST /universe/signatures/preview`: read-only add/update/missing comparison and line diagnostics.
- `POST /universe/signatures/import`: import scanner clipboard text for a system.
- `POST /universe/signatures`: create/update a signature; `DELETE /universe/signatures/:id` removes it.
- `POST /universe/upgrades`: create/update a manual infrastructure record; `DELETE /universe/upgrades/:id` removes it.
- `POST /universe/upgrades/preview`, `POST /universe/upgrades/import`: preview and atomically merge SMT text or JSON infrastructure notes. `GET /universe/upgrades/export?format=smt|json&system=ID` returns the exact text export; system filter is optional.
- `POST /universe/operations/refresh`: request an eligible fleet refresh; respects scope, access and cooldown.

## Public sources

- `GET /universe/feeds`: cached feed state and source metadata.
- `GET /universe/feeds/config`, `PUT /universe/feeds/config`: source preferences.
- `POST /universe/feeds/refresh`: request refresh of enabled sources, subject to provider backoff.
- `POST /universe/feeds/import`: explicit manual storm/POI observations when appropriate; imported observations retain provenance.

## Navigation

- `GET /universe/navigation`: cached itinerary, plan and export status.
- `PUT /universe/navigation/itinerary`: save origin, ordered stops and preferences with revision checking.
- `DELETE /universe/navigation/itinerary`: clear the selected pilot's itinerary.
- `DELETE /universe/navigation/stops/:id`: remove a stop.
- `POST /universe/navigation/reorder`: reorder the complete stop ID list.
- `POST /universe/navigation/plan`: calculate the itinerary; never changes the EVE client.
- `POST /universe/navigation/waypoints`: explicitly send the selected itinerary to EVE, with user-selected replace/append behavior.
- `POST /universe/navigation/bridges`: scoped ESI discovery/search for candidate Ansiblex structures.
- `POST /universe/navigation/reachability`: physical XYZ range/intersection results.
- Existing `/universe/link-lists` also accepts SMT's unchanged `structureID FROM --> TO` text, comments and unknown `0` IDs, alongside the existing CSV format.
- `POST /universe/links/preview`: validate pasted SMT/CSV/TSV/JSON before import, including per-line diagnostics. `GET /universe/link-lists/:id/export` exports an existing list as SMT text.

## Lifecycle

`createUniverse` composes operations, feeds and navigation. The existing core scheduler calls bounded `universe.tick()` and shutdown calls `universe.close()`. Data-source callbacks and explicit mutations reuse the existing local SSE change notification. Disabled modules stop collection. Tests inject provider fetchers and clocks; no fixture sends actual EVE commands.
