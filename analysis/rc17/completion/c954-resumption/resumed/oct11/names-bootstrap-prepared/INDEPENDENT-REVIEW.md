# Independent review of the two-phase names comparison

Reviewed 2026-10-11 by the independent namespace/backend reviewer. The prepared runner is acceptable for the coordinator's controlled execution. This is a static approval of the harness, not a measurement result or release approval. No application, browser, build, or benchmark was started during this review.

The comparison is the original names component baseline `c9d04ef62cb8a18292b309a2452fcab851185a7d` against integrated source `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`, in A/B/B/A order. It is not an RC16 comparison and cannot isolate a names-only causal effect. Both original phase bodies, metrics collection, phase wrapper, route barrier, receiver probe and frame drain match the seven original lines exactly. The original fixture is imported unchanged, including its quiesce behavior. Baseline historical manifest equality covers all 488 source files; candidate has 486. Both prebuild/built pairs preserve their exact source files and carry 20 built assets, with their successful build receipts and closed-log hashes verified.

All 22 preparation bindings were independently rehashed. Python AST parsing passed, and the recorded JavaScript syntax check is bound by the static-check hash below. The three ownership methods match the approved frontend runner exactly. Signals address only the locally owned child process group; unknown observation or live descendants retain the shared locks. Command deadlines, leader exit, namespace-aware group drain and closed-log hashing precede acceptance. Both existing runtime locks and the explicit coordinator grant remain required.

The final inventory now compares each command log with its earlier closed-log byte/hash tuple, each worker JSON with the exact bytes consumed for validation, and copied manifests/build receipts with their original reviewed bindings. A mismatch retains the raw files and forces `complete:false`. Bound inputs are rechecked after both final source verifications. This closes the concrete earlier-consumption versus later-inventory gap identified during review; subsequent bank/extraction verification is still required because a process cannot prevent an external writer after its final read.

The worker records its actual Node version and the coordinator requires `v24.19.0`; plain Node execution and absence of inherited NODE_OPTIONS/NODE_V8_COVERAGE are enforced. Ordinary mode excludes packet mirroring and profiling. Only initial Overview and first Assets execute; first Assets retains the original route barrier and 120 ms wait, with its 30-row correctness assertion outside the measured phase. Two observations per arm remain sparse samples, and renderer metrics exclude browser/GPU/worker CPU. Any adverse rows must remain visible in the eventual evidence review.

| File | Reviewed SHA-256 |
| --- | --- |
| browser-bootstrap.mjs | e4564bdf69b4691917bb31c45356cd9e94584c3baf8226f6cf2401b5e23b8f08 |
| run.py | aca36bfd586f614860d086c736d0d03aace14baaf42948f40c95bc85e2dbd058 |
| PREPARED.json | c4da51dadc7cf256500b9baa06c7b3aca46789c7b0314aa3f149d8efb2ae5fce |
| STATIC-CHECK.json | 811a5cd5b582ce995a1447da015459635ee9dcd68e614fac74906c974747dae1 |

The frozen PREPARED status remains historical. This review supersedes its awaiting-independent-review wording; the coordinator's runtime grant is still pending. No reviewed runner bytes were changed by this review.
