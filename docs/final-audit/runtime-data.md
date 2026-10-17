# Runtime, privacy and production data audit

Owner: `runtime_data`; correction reviewer: `docs_tests`. [Final audit](../FINAL-AUDIT.md) owns current banking, candidate acceptance and release decisions. Baseline owners match the audit starting source `b9f9e43`; historical acceptance remains attached to its original source.

## Coverage and disposition

| Area | Owners and evidence inspected | Disposition |
| --- | --- | --- |
| Startup, modules and shutdown | Index/Core, supervisor/child/lease, Registry/Bus; lifecycle, rollback, module-disable and contracts tests | No additional blocker found. Reviewed stopped admission, accepted-handler/returned-bus draining, Store-last close, failed replacement and module disposer ownership. |
| Authentication and private/public boundaries | Auth/Vault/ESI/Core fencing, HTTP/SSE and projection contracts | FA-01 below. Reviewed PKCE/JWT/scopes, connection generations, encrypted credential fields, session/Host/Origin/CSRF guards, separate broadcast listener and bounded slow-client handling. |
| Persistence and retention | Store, retention, targeted migration owners and tests | Reviewed transactional markers, failed-construction cleanup, durable versus cache data and bounded maintenance. No arbitrary-schema compatibility claim. |
| Dataset preparation/activation | Dataset owner, supervisor/child/lease and path contracts; cancellation/publication/settings tests | No additional blocker found. Reviewed immutable generation validation, cancellation/commit boundary, fallback and owned cleanup. |
| Recovery and upgrades | Persistence/user/auth guides; new recovery and previous-release fixtures | Direct evidence added below; proposed support boundary remains a release decision. |

## FA-01: private POSIX file permissions

With umask `022`, the launcher created a `0755` root before Store requested `0700`; SQLite then created WAL/SHM at `0644`. Where parents permit traversal, another local account could read private plaintext journal data.

`runtime-lock.mjs` now creates new roots at `0700`; `store.mjs` restricts the database to `0600` before SQLite opens it and repairs existing sidecars. Existing configured directories/parents are unchanged. POSIX permission failure stops startup; this does not configure Windows ACLs.

| Evidence | Result and controls |
| --- | --- |
| [Before permissions](evidence/runtime-permissions-before.tap) | Original three real-filesystem controls fail: new root, new WAL and crash-retained WAL modes. |
| [Fixed permissions](evidence/runtime-permissions-after.tap) | **5/5** pass. Crash fixture retains a committed private record, verifies `quick_check`, and repeats startup. Injected database/sidecar `EPERM` preserves bytes, propagates the original error, closes the descriptor and allows recovery. Existing `0755` directory/parent controls remain unchanged. |
| [Focused receipt](evidence/runtime-data-verification.json) | **220/220** across 22 runtime/auth/data/ownership suites on Linux Node 24.19.0; no skips/cancellations. Receipt retains commands and identities. |
| Independent review | `docs_tests` accepted the correction and before evidence; permission/recovery/runtime-lock/startup-rollback rerun **28/28**. |

Filesystem injection and umask changes are isolated to child processes. The correction adds a constant number of startup file operations, with no recurring work, provider calls, SQL scans or directory traversal.

## Recovery and upgrade evidence

| Path | What is established | Evidence |
| --- | --- | --- |
| Current-version stopped-profile restore | Real Store/Vault/Auth/lease plus managed-generation selection/commit survive a full-directory restore and two reopenings. Exact records, markers, credential decryption and dataset hashes persist; displaced profile is retained. Wrong/missing keys reject decryption without rewriting envelopes. | `persistence-recovery.test.mjs`; [initial log](evidence/runtime-recovery.tap), final 220-test receipt above; independently reviewed. |
| **0.7.3 → current 0.8.0 candidate** | Actual old runtime creates a synthetic stopped checkpoint; current runtime starts twice, retains representative durable data and credentials, seeds discovery once, and keeps legacy travel unowned. Current Session/report/plan readers work. Cache grace and 200-candidate maintenance remove only obsolete provider cache. | [Generator](../../tests/kairo/fixtures/generate-v073-upgrade.mjs), [SQL fixture](../../tests/kairo/fixtures/v073-upgrade.sql), [provenance](../../tests/kairo/fixtures/v073-upgrade-provenance.json), [regression](../../tests/kairo/upgrade-v073.test.mjs). |
| Failed forward migration and retry | Injected Session-travel marker failure rolls back its table/column/marker work, preserves old durable rows and releases the database lock. Earlier committed steps may remain. Removing the fault permits startup and exactly one discovery backfill. | Two new upgrade cases; related recovery/history/travel/rollback gate **48/48**. [Upgrade receipt](evidence/runtime-upgrade-v073-verification.json) records commands and hashes. Universe reviewer independently accepted provenance/schema and reran upgrade/retention **9/9**; banking is recorded centrally. |

The old fixture source is release 0.7.3 at `239794774320fcdebaa1d76ce8a77c5c25cfc48c`. Its generator verifies owning-source hashes, uses real old encryption/Goals/Sessions/Stream/OBS/Combat owners, forbids provider calls, and exports 29 tables/46 rows. All identities, records and keys are synthetic. Normal tests need only Node and the committed fixture, not Git or the old runtime. No application correction was needed for this upgrade path.

## Policy decision and limits

The proposed initial support boundary is the tested **0.7.3-to-0.8.0 upgrade**, with a complete stopped backup and same-machine/account restoration. Durable-user-data preservation, migration failure scope, manual recovery and unsupported in-place downgrade have one operational home in [Persistence](../PERSISTENCE.md#production-baseline-and-version-compatibility). The release owner must accept that initial boundary or request a wider tested matrix; alpha-era discard permission does not establish stable policy.

The small managed-generation fixture proves selection/integrity, not complete live Universe-reader compatibility. Neither it nor the upgrade checkpoint covers every corrupt database, alpha version, future schema or foreign Windows DPAPI key. Native Windows/ACL/DPAPI, real SSO/scopes, live CCP archives and extended play remain environment checks. No production profile, real credential or live provider request was used.
