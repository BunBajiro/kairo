# S3 exact-a7 semantic and diagnostic gate

8 October 2026. The root granted only focused semantics and separate simulated diagnostics. Both shared runtime locks were held for the gate and released after successful completion. **S3 remains open: no ordinary write/storage ABBA or real 120-second cadence worker has run in this attempt.** PR #10 remains withdrawn.

The frozen comparison is exact `a7b1bf97b0073695926c443e52d523638e59e48d`, candidate unchanged and baseline with only the declared two-file S3 ablation. Prepared harness revision 2 SHA-256 is `68380761bd44f2c5f8b1f566283d59bf6ae82790d709fcb79abc4f0def784b0c`. `run-granted-diagnostic.py` captured child output through pipes, finalized/fsynced wrapper logs, and verified source/harness before and after the children.

Focused candidate tests passed **39/39**, zero failed/cancelled/skipped: `session-combat-eligibility`, `session-live`, `sessions`, and `lifecycle`. The raw focused log and exact command are in `semantic-diagnostic-attempt1/`.

The diagnostic runner completed its dedicated baseline seed child and all **12 workers**: both arms at 100/1,000/10,000 archives per pilot × one/four pilots. Every shape passed exact ordered eligibility, cutoff/tie, provider/state/cursor, complete normalized application-table parity, and full source/harness guards. All six parity groups completed. Candidate plans use the declared ended-index equality/range branches; planner checks do not measure SQLite rows examined.

| Pilots | Ticks | Eligibility calls | Returned IDs / Session reads | Route queries | Returned route rows | Historical provider calls | Live responses | Verification calls |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 41 | 41 | 143 | 7 | 4,006 | 17 | 3 | 0 |
| 4 | 41 | 164 | 572 | 28 | 16,024 | 68 | 3 | 0 |

These controls matched at all three archive cardinalities. The live sequence was 200/404/404 with cursor 100 and ready/no-failure state. Clock-field normalization was restricted to the asserted tick relationships documented in PREPARED.md; other application and provider values remained exact. All shared seeds were removed only after success, and all 34 wrapper-inventoried artifact hashes were read back and verified.

Primary receipt: `semantic-diagnostic-attempt1/receipt.json`; detailed coordinator receipt: `semantic-diagnostic-attempt1/diagnostics/completed.json`. This simulated gate establishes behavior, not elapsed cadence, ordinary speed, migration/write costs, or whole-Core concurrent scheduling. Existing adverse historical write/storage observations remain valid unresolved evidence. The six-case write/storage ABBA and eight real endpoint workers still require a separate root runtime grant.
