# RC17 continuation from build #54

> **Live task status:** the [current issue ledger](resumed/CURRENT-ISSUES.md) owns closed decisions and remaining work. The four traces preserve the c954 audit boundary; the [checkpoint](resumed/CURRENT-CHECKPOINT.md) pins newer source and evidence.

The verified pause checkpoint is `801829695f5f5956b1fac137c2e4e77b54c4dfb7`. **The user resumed work later on 7 October.** Start with the [recovery handoff](PAUSE-HANDOFF.md), then the newer records under `resumed/`. PR #10 remains withdrawn.

The user explicitly selected **Kairo test build #54**, commit `c954c0d808847f249df0659ed15fdce2e89f84c4`, and instructed this process to disregard **build #55**, commit `508f2d450c7cc17cc464cf316b80748367adc9e2`, created by a parallel ChatGPT process. This instruction supersedes the source selection and adoption claims in the earlier live checkpoint.

## Authoritative source

- Source commit: `c954c0d808847f249df0659ed15fdce2e89f84c4`; Git tree: `87c20772b3843504a467c3e7f6de05f9018b3b6c`.
- Continuation branch: `refactor/rc17-c954-continuation-v0.8.0`, created directly at that commit on GitHub. The existing shared branch and excluded commit are preserved; their contents are not silently inherited.
- Clean local checkout: `/workspace/scratch/a2f3334402fc/kairo-rc17-c954-continuation`.
- [Fresh source/build inventory](source.json): all 482 source files and 26 compiled assets match the earlier c954 verification. Fingerprint: `472afe35fc135243350cad554205ac5845e5bd9404e81838a52aca8d09b63b27`.
- GitHub run `37613842075`, test build #54: completed successfully. Existing local evidence is 941 passing runtime tests, passing types and build. Those checks do not constitute final optimization acceptance.

## Evidence boundary

Evidence identifies the exact source bytes it measured. A c954 result remains usable when its receipts and completion checks establish that identity. Historical RC16/fa6/05d observations and isolated trials remain observations about those sources. They are not relabeled as c954. Build #55, its verification and its integrated changes are excluded from current acceptance.

In particular, c954 does **not** include the later lazy Atlas layouts, bounded enrichment admission or native Window timer correction. Independent trial evidence can inform a future reviewed change, but no such change is treated as adopted by this resumption. The separate updater rollback patch also remains outside c954. Failed and interrupted lanes remain failed or incomplete even if their files were recovered.

The trace is split into [frontend](frontend-trace.md), [backend and Sessions](backend-trace.md), [Maps and Atlas](maps-atlas-trace.md), and [original gates and updater](gates-updater-trace.md). Each records implemented code, known or likely causes, evidence limits, concrete changes and the tests or matched measurements still needed. The original [a27 trace](../TRACEABILITY.md) remains a historical record.

## Review gate

PR #10 remains **withdrawn and draft**, at unchanged head `9a01826d863602c5738b89c90644933d2f30ddc2`. There is no clean RC17 package or review handoff. Every remaining implementation and conditional recommendation must receive an evidence-backed disposition, followed by frozen-source local and independent CI acceptance and package verification, before a clean RC17 is prepared. No merge, main update or release is authorized.

## Recovered work

Recovered reports and raw evidence are banked to prevent another workspace loss. Banking does not certify their source, completeness or conclusions. The per-finding trace takes precedence over old live-status wording. Compressed raw backups, where present, retain exact original hashes and paths for lossless restoration.
