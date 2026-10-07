# M9 isolated semantic validation

**210/210 tests passed**, zero failures, cancellations or skips. This is a
targeted correctness result for the isolated proposal; it is not performance
acceptance or an integrated source gate. PR #10 remains withdrawn.

- Base: `c954c0d808847f249df0659ed15fdce2e89f84c4` (#54). #55/508 is excluded.
- Root: `/workspace/scratch/a2f3334402fc/kairo-m9-c954-isolated`.
- First and only attempt: 7 October 2026, start `2026-10-07T13:38:24.804078+00:00`.
- Node: version recorded in `tests-attempt1.json`.
- Full command: recorded as an argument array in `tests-attempt1.json`; 14 Node
  test files execute with `--test-concurrency=1` under
  `flock -x /tmp/kairo-performance.lock`.
- Source: all 482 paths/hashes match the c954 source manifest plus the five
  declared proposal files before and after execution. Runner, patch, aggregate
  source and individual test-file hashes are in the receipt.
- Full output: `tests-attempt1.log`, SHA256
  `fa5109cc3445de1426efcdff986f8c69f3577ffdd2706974c8664a1ba25aa31e`.
- Test runner duration: 6,826.343372 ms. This is a correctness-run receipt, not a
  benchmark or comparison claim.

Coverage includes the new real-SQLite Auth read budget and request freshness
tests; a real retained passage in unchanged reads; all five legacy normalization
faults; scope revocation and disconnect while fleet IO waits; J-Space cleanup,
grace/prune/undo/import/export; tracking/scope behavior; Universe service;
routing/preparation/navigation; and J-Space/Operations HTTP suites.

The independent review found no material source bug, and requested that the
passage/no-op test include an actual passage. That refinement changed tests only,
was included in the frozen proposal hashes, and passed alongside the retention
suite. No production source change was needed after the initial proposal.

No shared continuation source, compiled assets, Git stage/commit or GitHub state
was changed by this validation. No build or performance workload ran. The
exclusive runtime slot was released after the test process completed.

Next: assigned separate diagnostics and complete matched ABBA against exact c954,
with new manifests/output directories and preserved complete result equality.
Wide-summary input parsing remains a separate unresolved part of M9; these two
mechanisms cannot close it by themselves.
