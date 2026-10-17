# 0.8.0 documentation work ledger

This is the documentation phase, following the completed four-pass premerge review. The documented feature set is 0.8.0; the application is still **0.8.0-rc.17**. No merge, release or version bump is authorised.

## Recovery and authority

On 17 October 2026, GitHub PR #12 and both the previous workspace and a fresh checkout agreed on `42c00e6e56ef89e2e365836aac565942b015fd64`. Both workspaces were clean. PR #12 was open/draft on `review/0.8.0-rc-premerge-bug-review`, targeting unchanged main `239794774320fcdebaa1d76ce8a77c5c25cfc48c`.

Build90 application source remains `5c55cbbbae6c935a86ad5dde71cc1899958fde62`. Its 1,215 runtime tests, 2,317 browser checks, downloaded-package identity and 74 closed findings are recorded in [the completed review](PREMERGE-BUG-REVIEW.md) and [Validation](VALIDATION.md). These are existing verified results, not tests rerun by this documentation phase. Preserve the ledger and raw `review-evidence/` files unchanged.

Current source, configuration, tests and evidence are authoritative. Old plans, past chats and historical measurements do not establish current implementation or acceptance. All edits remain workspace-only until listed in a pushed checkpoint below.

## Inventory and authoritative homes

The starting tree contains 24 Markdown files: root README, AGENTS and changelog; 19 directly under `docs/`; and two vendored source/licence notices outside `docs/`. The evidence directory contains structured review records rather than user instructions.

| Starting material | Assessment and disposition |
| --- | --- |
| Root README, `docs/README.md` | Useful but lead readers into the completed bug-review phase. Rewrite as product/setup and audience-specific navigation; keep candidate status explicit. |
| `AGENTS.md` | Review requirements remain valid; replace the active bug-hunt instruction with documentation-phase scope. |
| `USER-GUIDE.md` | Mixes installation, privacy, Markets, Goals and streaming in a long guide. Retain setup/connection/settings/backup/upgrade; move domain workflows to their authoritative guides. Remove release-migration narrative from everyday instructions. |
| No substantial pilot workspace guide | Add `PILOT-WORKSPACE.md` for Command centre, Pilot & training, Wallet & trade, Hangar & assets, Industry & planets, Goals & notes. |
| Markets embedded in user guide; `IMPORT-ANALYSER.md` | Add `MARKETS.md` for hubs/scans/browser/reports/history. Keep import costing, trader roles, quotes and plans in Import Analyser; remove duplicate history explanations. |
| `UNIVERSE.md`, `SESSIONS.md` | Preserve verified behaviour, improve task navigation and practical workflows, and separate observed data from inferred/current context. |
| Streaming/OPSEC embedded in user guide | Add `STREAMING.md` for Studio, toasts, OBS actions and protection; retain timing and real-environment limits. |
| `DATASETS.md`, `ESI-POLLING.md`, `DATA-RETENTION.md` | Update source-derived states, supported controls and policies. Distinguish lifecycle cancellation from a user-facing Cancel control; cover the full polling catalog. |
| `ARCHITECTURE.md`, `INTERNAL-API.md`, `API-REFERENCE.md` | Substantial current material with repeated lifecycle/refactor explanations. Give each one a clear role: ownership/lifecycle, extension/interoperability, HTTP/SSE contracts. |
| Missing developer setup/security/persistence homes | Add `DEVELOPMENT.md`, `AUTH-AND-SECURITY.md`, `PERSISTENCE.md`; document exact scripts, schema ownership, privacy boundaries and examples. |
| No central troubleshooting guide | Add `TROUBLESHOOTING.md`, keyed to actual visible states and supported recovery; no invented repair controls. |
| `UNIVERSE-DATA.md`, `SCHEMATIC-GEOMETRY.md`, `UNIVERSE-ROUTING-VALIDATION.md` | Retain specialist references; clearly label historical measurements/corrections and current contracts. |
| `VALIDATION.md` | Retain exact build90 acceptance and historical failed/partial evidence. Link current developer workflow and record documentation-only verification separately. |
| `PREMERGE-BUG-REVIEW.md`, `review-evidence/` | Completed provenance, preserved intact. Link through a history/evidence landing page; do not reopen findings without new evidence. |
| Prior plans/investigations | Already archived on the preserved performance branch. Add `history/README.md` with immutable source links; do not copy stale guidance into current manuals. |
| `CHANGELOG.md`, `THIRD-PARTY-NOTICES.md`, Wanderer notices, vendor notices | Preserve release history and attribution; do not repurpose as usage instructions or invent a stable release. Check their links. |

## Work and verification

| Work item | State |
| --- | --- |
| Recovery and initial inventory | Complete; checkpoint below records banking |
| User setup, navigation, backup and troubleshooting | In progress |
| Markets and Import Analyser | In progress; source review assigned |
| Universe and technical map references | In progress; source review assigned |
| Pilot workspace, Sessions and streaming | In progress; source review assigned |
| Architecture, internal API and HTTP/events | In progress; source review assigned |
| Auth, ESI, persistence and datasets | In progress; source review assigned |
| Independent documentation review | In progress |
| Internal paths/anchors, commands/examples and change-scope verification | Pending integration |

Use no new screenshots unless captured from the verified application and checked. Documentation changes require link/command/example validation; an application correction would need separate review and meaningful regression evidence. No application correction is currently planned.

## Banked checkpoints

- Recovery/inventory checkpoint: this ledger and the phase instruction are prepared for the first documentation-only commit. Later checkpoints will record its verified SHA after push.

## Handoff

Work remains in progress. The latest downloadable application remains build90, whose packaged documentation predates this phase. Do not describe newer source documentation as already included in that ZIP. No new runtime, browser, performance or environment result is claimed here.
