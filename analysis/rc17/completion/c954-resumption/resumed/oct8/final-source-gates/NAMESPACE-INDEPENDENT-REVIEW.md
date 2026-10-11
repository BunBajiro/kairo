# Final-source namespace correction — independent review

11 October 2026. No inspected blocker remains in this narrow external-runner
correction. This is static review and evidence verification, not an application
benchmark run or final release acceptance. The reviewer did not run Kairo,
browser processes, or additional ownership controls.

Reviewed bindings:

- Runner `run.mjs`: `94c4578b68667a90fc5397c8e0d4759cbb22732ca141171b42e7290e7fce63cc`.
- Adapter `ownership.mjs`: `84b45435655d36f3115b18773d4dd4c118779e08d455e5f5bdbdf2e0ccf9626c`.
- Python bridge: `d900b2ff4f998cedd8e22fa61159c05c20c6bb0997f7ccf9ebf9e2523363a659`.
- Unchanged shared census: `e54305d8275a565c42f0be34c40319102875fce12b142869c1fd833bf166d027`.
- Revision 3 preparation: `288d9056524004800f5f18179e43bc0eaca726c693b28aede83005b4a4d0731f`.
- Successful focused receipt: `2bcbc671d18e1183be79adaf7091b031e2e12042a5ff5ece4fa42736c3fc1bde`.

All 13 preparation bindings, six receipt bindings and nine proposed changed-file
hashes matched inspected bytes. The patch SHA256 is
`25bf4a6799ef9d8febcda9f209cf557814635ac538c79ba9e851a86ace411666`.
Direct comparison with the original runner confirms only the adapter import,
explicit Python fingerprint inputs, and group observation were changed.
Startup/contracts/database workers, arguments, measured rows, source checks,
signals, drain loops, failure decisions and lock retention are unchanged.

The adapter first probes the original namespace-local child group. ESRCH proves
absence without inspecting unrelated mounted process IDs. For a live group the
bounded Python bridge imports the previously reviewed census unchanged. The
bridge inherits the caller's PID namespace and reconciles its own process ID
with mounted `/proc`; the same-namespace anchor selects the host group only for
observation. Every termination call still uses the original local child group.
Errors, denied observation, timeout, malformed or inconsistent bridge output,
and a live group without a trustworthy census stay unknown and keep the runner's
drain requirement active. The bridge creates no descendants; its completion is
awaited synchronously before the runner proceeds. A second local probe handles
disappearance during observation.

The successful receipt records 27 passing controls and no cleanup failures.
Synthetic controls cover numeric host/sibling collisions, nested descendants,
missing anchors, unsupported topology, session disagreement, zombies, vanished
rows, malformed bridge output and local disappearance. Three real owned groups
cover ordinary exit, TERM cleanup and a surviving descendant after leader exit;
the latter is adopted and reaped. Real observations use the production adapter
and bridge in the current depth-two namespace, so the original host/local
distinction is exercised. The bounded controls do not establish support for
every possible Linux permission or namespace topology.

Removing unused cleanup-only `parent`/`group` member fields is appropriate:
`{pid,state}` preserves the reviewed helper contract without a second racing
process census. No measured output row or consumer depends on those fields.
Historical frontend acceptance remains separate and valid; this correction
addresses the outstanding final-source-runner item recorded by its independent
review. Coordinator runtime authorization and the unchanged final application
gates are still required before claiming acceptance.
