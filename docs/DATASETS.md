# Static datasets and updates

This guide describes the implemented **0.8.0-rc.17** updater. Application releases and static-data updates are separate: an SDE update changes reference data, not Kairo's package version. Start with the [user guide](USER-GUIDE.md) for installation and [ESI polling](ESI-POLLING.md) for live character collection.

## Using Settings → Datasets

Kairo includes reference data and can start without first downloading the SDE. While running through its normal launcher, it checks CCP's SDE metadata shortly after startup and hourly thereafter. A scheduled check automatically prepares a newer eligible build. Cached metadata and provider retry deadlines can defer a network request.

| Control or field | Meaning |
| --- | --- |
| **Check for updates** | Check availability; this action alone does not request installation. It joins any existing check and respects cached metadata and retry deadlines. |
| **Install update** | Prepare the available build and activate it through the supervised runtime. A manual installation can retry a previously failed build. |
| **Released** | Source release date, when recorded. |
| **Last installed** | Local preparation date for a downloaded generation. Bundled data has no invented installation timestamp. |
| **Next check** | Next scheduled opportunity, not a promise of a download or request at that instant. |
| **Supplemental datasets** | Wanderer wormhole/destination references and SMT landmarks bundled with this Kairo release. The SDE updater does not replace them. |

The three automatically updated datasets are **Universe & celestial data**, **Market categories & volumes**, and **NPC market owners**. They are generated together from one official build. Market order books, character data, sovereignty observations and community live feeds have their own collectors.

There is no user-facing updater schedule switch or dataset Cancel button in this candidate. Normal shutdown cancels incomplete preparation and waits for its worker to stop. A generation already fully prepared before shutdown remains eligible for activation at the next supervised start.

## Understanding update states

| State | What to expect |
| --- | --- |
| Checking | Kairo is reading availability or reusing valid cached metadata. |
| Downloading | The official archive is being streamed to temporary storage. The installed data stays usable. |
| Preparing and validating | A background worker converts and checks the archive. Percentages describe the current stage, not a fixed overall completion time. |
| Applying the dataset update | The normal launcher replaces the core process. The page stays open and reconnects automatically. |
| Update ready to activate | An embedded/unsupervised host has staged the generation but has not supplied automatic activation. Restart through the supported launcher. |
| Update check needs attention | Read the displayed error. The installed generation remains available; requests are backed off. |
| Dataset cleanup needs attention | Activation can have succeeded while old files remain locked or inaccessible. Inspect the listed filenames, free space and permissions; cleanup retries at the next check or restart. |

During managed activation, the browser displays **Applying dataset update — reconnecting**. Existing browser session credentials move privately between the old and replacement processes. The mounted page and unfinished forms remain in place; data-dependent resources refresh when the dataset revision changes. A slow or failed reconnect has its own recovery state. See [troubleshooting](TROUBLESHOOTING.md) before deleting or replacing any data.

If the replacement fails to start, the supervisor attempts the previous valid generation (or bundled data) once and reports recovery. It does not loop indefinitely. A failed conversion or activation build is suppressed from automatic installation until a manual retry or a different build. Ordinary failed downloads can be retried after backoff.

The default pre-download free-space check requires **2,048 MiB available** for the worst-case archive, conversion spool, output and reserve. This is a preparation budget, not the final size of an installed dataset. Keep sufficient free space even when the downloaded ZIP itself is small.

## Storage boundaries

Downloaded generations live in `datasets/` under the [Kairo data directory](PERSISTENCE.md#data-directory-and-files). Each generation is immutable. Temporary archives and staging directories are removed after success, failure or cancellation; startup also cleans crash leftovers. Cleanup failures are recorded so they can be retried.

The previous downloaded generation is retained during activation, then retired after the replacement reports ready and the active pointer commits. Kairo does not keep a selectable archive of all past SDE versions. Bundled fallback data remains in the application package. Maps, notes, authorizations, histories and other user records are outside dataset generations and are not reset by this process.

A cached generation older than the newest bundled official component cannot override that bundled baseline. Older releases bundled components from different builds; one coherent update can bring those components onto the same build without downgrading the newest component.

## Developer contract: lifecycle and ownership

Owners are [datasets.mjs](../server/datasets.mjs), [runtime-supervisor.mjs](../server/runtime-supervisor.mjs), [runtime-child.mjs](../server/runtime-child.mjs), [runtime-lock.mjs](../server/runtime-lock.mjs), and [dataset-paths.mjs](../server/dataset-paths.mjs). Runtime lifecycle and HTTP/event delivery are covered in [Architecture](ARCHITECTURE.md) and [API reference](API-REFERENCE.md).

1. The supervisor acquires a SQLite `BEGIN IMMEDIATE` lease in `datasets/runtime-lock.sqlite` **before** inspecting or cleaning generations. A second launcher using the same data directory fails without touching the first runtime's download. Never remove the lock file to bypass a running process; the lease is released by SQLite when its owner closes or crashes.
2. `prepareDatasetRuntime(dataDir)` validates active/pending pointers against the bundled baseline, verifies pending hashes, rejects cancelled or failed UUIDs, cleans abandoned files and selects one generation before consumers import static indexes.
3. The child imports with `KAIRO_SDE_DIRECTORY` set to that generation. Official static readers use this immutable directory for the process lifetime. Do not change the environment or files underneath live indexes.
4. `createDatasetService()` owns one scheduled deadline and one check/install flight. `start()` schedules the first automatic opportunity after one second; normal checks recur hourly. Concurrent callers share work and combine installation intent. `check({install:false})` and `install()` return status when the shared work settles; HTTP handlers return `202` immediately and report progress through existing events.
5. Download and conversion produce a validated `manifest.json`, rename staging to `build-<build>-<uuid>`, then atomically publish `pending.json`. Only then is `onReady(selection)` called. It is deliberately not awaited by preparation because the supervisor must be able to close the preparing service.
6. The supervisor drains accepted work, stops the old core, and passes browser sessions over its private IPC channel. Once the new core reports ready, `commitDatasetRuntime()` atomically writes `active.json`. Cleanup/status-write failure after that point must not roll back the committed generation.
7. Before commit, failed activation calls `rollbackDatasetRuntime()`, which records the rejected UUID outside its payload directory before touching pointers. A locked or partly removed payload cannot become eligible on a later startup. One recovery activation is attempted; unrecoverable failure is reported honestly.

`startKairo()` can be embedded directly. Without an `onDatasetsReady` activation owner it stages updates and reports `restartRequired`; it does not replace its embedding process. `noSync` disables automatic collection/update checks for offline tests, while explicit dataset actions remain available. `KAIRO_SDE_DIRECTORY` is an internal generation selection mechanism, not a user preference.

### Cancellation and shutdown

`close()` stops admission/scheduling, aborts active work and awaits preparation plus activation-failure cleanup. Worker cancellation waits for actual worker exit before removing files. Abort checks enclose publication: if cancellation occurs after `pending.json` publishes but before readiness, a durable cancellation marker prevents later activation of that UUID, even if cleanup is locked. Cancellation does not permanently blacklist the build; a subsequent service can prepare it under a new UUID.

Closing an already prepared service does not retract a completed generation. Keep this distinction when writing tests: incomplete publication is cancelled; a completed preparation is available on restart. Settings writes, including Client ID saves, do not own or cancel the updater.

### Validation and resource bounds

Metadata is fetched from CCP's `latest.jsonl`; archives use the advertised build-specific JSONL ZIP. Redirects are rejected. Metadata requests use ETag/Last-Modified validators, a five-minute minimum cache delay and upstream cache deadlines. Retry-After is respected for 429/503; ordinary failure backoff grows from five minutes to six hours.

| Boundary | Default enforced limit |
| --- | --- |
| Metadata response | 128 KiB; 30-second request timeout |
| Download | 512 MiB archive; 30-minute request timeout; received length checked |
| Worker conversion | 20 minutes total; two minutes without progress |
| Worker resources | 512 MiB V8 old generation; 256 MiB tracked external data budget |
| Conversion spool | 768 MiB total; 64 MiB per bucket; 8 MiB buffered spool |
| Output and reserve | 512 MiB output; 256 MiB free-space reserve |

These are failure budgets, **not** a total process RSS guarantee. ZIP structure, entry sizes, CRCs, source build identity, record references, output inventory and SHA256 checksums are validated by [sde-archive.mjs](../server/sde-archive.mjs), [sde-build.mjs](../server/sde-build.mjs) and [sde-limits.mjs](../server/sde-limits.mjs). Resource-limit failures leave installed data selected.

### Verification map

The existing tests cover coherent preparation, metadata cache/backoff, disk/worker limits, cleanup persistence, rejected-generation restart behavior and supervised rollback. Start with [datasets.test.mjs](../tests/kairo/datasets.test.mjs), [datasets-http.test.mjs](../tests/kairo/datasets-http.test.mjs), [dataset-publication-cancellation.test.mjs](../tests/kairo/dataset-publication-cancellation.test.mjs) and [dataset-settings-overlap.test.mjs](../tests/kairo/dataset-settings-overlap.test.mjs). Compiled reconnect behavior is covered by [datasets-ui.mjs](../tests/datasets-ui.mjs). [Validation](VALIDATION.md) owns the exact verified build and environment limits.
