# Independent static review — final merged frontend envelope

8 October 2026. Reviewed revision 5, with no application changes, syntax execution, tests, build or browser runtime by this reviewer. No blocking issue remains in the inspected envelope. This is readiness for the coordinator's frozen-source correctness gate, not execution or release acceptance.

- `run.py` SHA256: `7065bf877587e16696e015a81eec7c4371cd1ef1bcb62d1ca17d1afdc1f6d359`.
- `PREPARED.json` SHA256: `04d0d66b74f5a5fc316a6fcb4c63379b07595b610d69803b90fd7f9b32453bf4`; all 11 bound harness/helper hashes match.

The wrapper requires the same clean source files/commit in prebuild and built manifests, no prebuild assets, postbuild assets, accepted names/Assets/clock/report bytes, and pre/post full source plus input/harness guards. It retains the five existing fixtures and their 31 + 10 + 10 + 13 + 25 = 89 assertions; the names owner independently reviewed its worker copies. M6 also checks the exact saved drag positions and loaded script bytes. Performance counters from these correctness fixtures are not a new performance comparison.

The Assets/focus copies use the previously reviewed actual-Chromium-exit helper. The wrapper waits for owned process/group cleanup before hashing closed logs; final source checks, artifact hashing and completion writes remain under its shared lock. Review found that inaccessible `/proc` state could initially escape this drain path. Revision 5 now preserves unknown state, retries observation/owned-group termination while retaining the lock, catches blocked-receipt/notice IO failures, and fails the cleanup receipt even if observation later recovers. Normal signal/interruption, surviving descendants and cleanup failures remain failures; no fixture assertion was weakened.

Final source choice, accepted F6 memo decision, actual execution and whole RC17/CI/package gates remain with the coordinator. The focus guarantee is connected report/naming cancellation openers, not successful naming submission while its opener is busy.
