# Static data updates

Kairo checks CCP's SDE metadata at startup and hourly while open. Conditional ETag/Last-Modified requests and upstream cache deadlines avoid repeated transfers. Failures trigger exponential backoff. Manual checks share the same updater and respect the same deadlines.

**Settings → Datasets** shows installed versions, source release dates and local installation dates. **Check for updates** refreshes availability; **Install update** installs an available build. Scheduled checks install newer builds automatically. Bundled data is labelled accordingly rather than given an invented installation date. Wanderer and SMT references are listed separately and remain release-pinned.

## Safe activation

A background worker compiles the official JSONL ZIP into Universe topology/celestial shards, market categories and NPC ownership. Archive limits, CRCs, record references, build identity and generated file checksums are validated. Failed downloads or conversion leave the current dataset usable.

Several modules retain static indexes, so activation replaces the core process as a unit. The browser receives **Applying dataset update — reconnecting** before disconnecting. Browser sessions and CSRF credentials cross only a private in-memory process channel. The open page remains mounted; affected data refreshes after reconnecting without discarding unfinished forms.

The replacement must finish startup before it is committed. Failed startup restores the previous generation once and shows a recovery notice, without an endless restart loop. A failed build is not repeatedly downloaded automatically; manual installation can retry it. Slow or failed reconnects receive a separate actionable notice.

Normal Windows/shell launchers and `npm start` use this supervised path. Applications embedding `startKairo()` directly can stage updates, but must restart their host to activate them unless they supply the activation callback. `noSync` disables automatic update checks for offline tests.

## Storage and performance

- One shared updater and one deadline timer; no SDE checks on map ticks or ESI polling loops.
- Streamed downloads and bounded worker conversion, with celestial records processed in small groups.
- Immutable generated data under `datasets/` in Kairo's existing data directory. A small separate SQLite lease prevents concurrent launchers from touching an active update.
- Temporary downloads/staging are removed on success or failure. Crash leftovers are cleaned at the next supervised start.
- The previous generation remains only during activation. Once the replacement starts successfully, old generations are removed; a later startup retries cleanup if a file was temporarily locked.
- The bundled fallback remains intact. Maps, notes, pilot authorizations and application history are not reset or included in dataset generations.
- Older cached generations cannot override a newer dataset bundled with a future Kairo release. Earlier releases shipped different Universe/market builds; the first complete update brings the official derived datasets onto one build.

Source: [CCP static-data automation](https://developers.eveonline.com/docs/services/static-data/#automation).
