# Documentation map

These are the maintained user and developer entry points. Start the current phase at [0.8.0 RC Premerge Bug Review](PREMERGE-BUG-REVIEW.md); [Validation](VALIDATION.md) describes the required checks.

## Users

| Need | Read |
| --- | --- |
| Install, connect, upgrade, manage data, Goals or OBS | [User guide](USER-GUIDE.md) |
| Explore Atlas, Maps, routes and intel | [Universe](UNIVERSE.md) |
| Record operations and interpret reports | [Sessions](SESSIONS.md) |
| Plan market imports | [Import Analyser](IMPORT-ANALYSER.md) |
| Change collection or data updates | [ESI polling](ESI-POLLING.md) · [Datasets](DATASETS.md) |
| Understand retained versus replaceable data | [Data retention](DATA-RETENTION.md) |

## Human and AI developers

1. Follow [AGENTS.md](../AGENTS.md) for branch and review requirements.
2. Use [Architecture](ARCHITECTURE.md) to find the owner of a behavior.
3. Use [Internal API](INTERNAL-API.md) to add a feature through existing services, refresh owners and lifecycle contracts.
4. Use [API reference](API-REFERENCE.md) for HTTP, events, guards and response ownership.
5. Follow [Validation](VALIDATION.md), checking the exact source/build before making a completion claim.

Technical references: [Universe data/rebuilds](UNIVERSE-DATA.md), [schematic geometry](SCHEMATIC-GEOMETRY.md), [routing rules and validation](UNIVERSE-ROUTING-VALIDATION.md), and [third-party notices](THIRD-PARTY-NOTICES.md).

Source code and its behavioral tests define implemented behavior. These guides explain it; old plans, comparisons, changelog entries and individual successful builds are not substitutes for current source or a completed release gate. Keep one current home for each contract and link to it instead of copying it into multiple guides. Update the owning guide with a changed API or user workflow.

## History and investigation

[CHANGELOG.md](../CHANGELOG.md) owns release history. Superseded release-review notes, source audits and feature comparisons are preserved in Git history and the separate [documentation archive](https://github.com/BunBajiro/kairo/tree/perf/rc16-checkpoint-v0.8.0/analysis/rc17/completion/c954-resumption/resumed/oct8/documentation-prune). They are not current instructions or acceptance evidence for a newer source tree. RC17 measurements, decisions and release acceptance are tracked in the [analysis checkpoint](https://github.com/BunBajiro/kairo/blob/perf/rc16-checkpoint-v0.8.0/analysis/rc17/completion/c954-resumption/resumed/CURRENT-CHECKPOINT.md).
