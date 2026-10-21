# Kairo documentation

These guides describe the **0.8.0 feature set in candidate `0.8.0-rc.17`**. They describe implemented behaviour, not a stable-release promise. For the exact tested download and outstanding environment checks, see the [current review build](REVIEW-BUILD.md) and [Validation](VALIDATION.md). The [completed premerge review](PREMERGE-BUG-REVIEW.md) preserves the original bug-review evidence.

## For users

Start with [installation and first run](USER-GUIDE.md), then choose a task:

| Task | Authoritative guide |
| --- | --- |
| Install, connect characters, manage modules, upgrade or restore a backup | [User guide](USER-GUIDE.md) |
| Read pilot/training/wallet/assets/industry data; manage goals and notes | [Pilot workspace](PILOT-WORKSPACE.md) |
| Manage hubs; scan, browse categories and use hub reports | [Markets](MARKETS.md) |
| Plan imports with buying/selling pilots, fees, cargo and manifests | [Import Analyser](IMPORT-ANALYSER.md) |
| Explore Atlas, maintain Maps, plan navigation and configure Universe | [Universe](UNIVERSE.md) |
| Record an operation, interpret its report and replay travel | [Sessions](SESSIONS.md) |
| Configure Studio, toasts, OPSEC covers and direct OBS control | [Streaming](STREAMING.md) |
| Adjust collection frequency and understand freshness | [ESI polling](ESI-POLLING.md) |
| Check static datasets and understand update/restart behaviour | [Datasets](DATASETS.md) |
| Understand retained records and replaceable caches | [Data retention](DATA-RETENTION.md) |
| Resolve an actual error or unfamiliar application state | [Troubleshooting](TROUBLESHOOTING.md) |

The guides use current interface names. **Atlas**, **Maps** and **Universe settings** are separate destinations; Sessions remains its own workspace. Journey is a legacy name/bookmark, not a second current mapping workflow.

## For developers

Read [AGENTS.md](../AGENTS.md) before changing the repository. Then follow [Development](DEVELOPMENT.md) for the local toolchain and review process.

| Question | Authoritative reference |
| --- | --- |
| Where does behaviour live and how does the runtime start/stop? | [Architecture](ARCHITECTURE.md) |
| How do modules cooperate, publish events and own frontend requests? | [Internal API and extension guide](INTERNAL-API.md) |
| What are the HTTP routes, payloads, guards and SSE contracts? | [API reference](API-REFERENCE.md) |
| Who owns each database/cache and how are schema changes applied? | [Persistence](PERSISTENCE.md) · [Retention policy](DATA-RETENTION.md) |
| How do authentication, scopes and local security boundaries work? | [Authentication and security](AUTH-AND-SECURITY.md) |
| How are ESI requests collected, cached, paced and retried? | [ESI polling](ESI-POLLING.md) |
| How are datasets downloaded, installed, activated or rolled back? | [Datasets](DATASETS.md) |
| How are static geography and map layouts built? | [Universe data](UNIVERSE-DATA.md) · [Schematic geometry](SCHEMATIC-GEOMETRY.md) |
| What routing rules and regressions must remain true? | [Routing validation](UNIVERSE-ROUTING-VALIDATION.md) |
| What must pass before a review package or release? | [Validation](VALIDATION.md) · [Build and release workflow](DEVELOPMENT.md) |

Current source, configuration and behavioural tests define implementation. Document a changed contract in its owning guide and link to it elsewhere. Examples are local-development examples, not a supported remote/cloud API. Do not put tokens, real character exports or user vaults in fixtures or packages.

## Release status, evidence and history

- [Final release/baseline audit](FINAL-AUDIT.md): completed scope, corrections, independent reviews and remaining environment/approval boundaries.
- [Source documentation ledger](SOURCE-DOCUMENTATION-WORK.md): source contracts, coverage, exclusions and verification.
- [Documentation work ledger](DOCUMENTATION-WORK.md): inventory, decisions, checkpoints and documentation verification.
- [History and evidence index](history/README.md): completed premerge review, failed baselines, original performance measurements and superseded plans.
- [Changelog](../CHANGELOG.md): release history, distinct from current operating instructions.
- [Third-party notices](THIRD-PARTY-NOTICES.md): attribution and bundled reference terms.

Build93 consolidates the final audit's corrections with the refreshed guides and source comments. The [current handoff](REVIEW-BUILD.md) records its exact package, verification and the distinction between packaged documentation and later branch updates. Audit completion does not change application version or merge/release authority.
