# Independent updater preparation review

11 October 2026. **Approved for the coordinator's exclusive local collection.** This review executed no application, build, browser, updater window or new ownership test. It does not establish performance acceptance, Actions completion or release readiness.

Independently rehashed all eight `STATIC-CHECK.json` bindings, all21 completed setup inventory files and the99,197,259-byte official build3552227 archive. Archive SHA256 is `0788ec9352556fcb2eb28ba084eb1f408cb0ad22f8e30d91bfa49f534ec1ad83`; its download receipt agrees. Candidate setup/root/commit/fingerprint mappings agree with the clean source manifest; prebuild source arrays equal the fresh20-asset build. The selected build has its actual successful command, timestamps, empty process group and unchanged log. The three original updater workers are byte-identical to bank `2a7e475`.

The coordinator genuinely acquires `/tmp/kairo-performance.lock` followed by `/tmp/kairo-rc16-benchmark.lock` before invoking either workload. Its existing `KAIRO_UPDATER_LOCKED=1` flag avoids reacquiring the already-held performance lock in `loaded-run.mjs`; it is not used to bypass acquisition. Both locks remain held through descendant drain and final evidence checks.

The unchanged inventory worker performs25 activations in one warm Node process. The unchanged loaded worker runs exactly six default60,000ms windows in control1/conversion1/conversion2/control2/control3/conversion3 order. The coordinator rejects inherited Kairo window/order overrides and passes none. Original installation at5s, real Worker/supervisor replacement, HTTP/SSE schedules, cookie/CSRF checks, source checks and generated manifest validation remain intact. Outer deadlines are900s for inventory and1,800s for the entire loaded owner; they do not shorten measurement windows.

The shared envelope starts independent process sessions and acts as a child subreaper. It awaits the direct leader, maps owned groups and adopted descendants through the namespace census, reaps children, and requires no remaining descendants. Unexpected live survivors fail the command; unknown/live ownership prevents lock release. Reviewed the already-recorded four ownership/evidence controls without rerunning them. The updater checks both temporary prefixes before execution, after each owner and at final inventory; it preserves leftovers rather than deleting them to pass. Current `TMPDIR`, `TMP` and `TEMP` resolve to the expected `/tmp` location. Preserve that environment when invoking this prepared command.

Copied source/setup/download/build evidence is pinned immediately. Closed command logs are pinned after actual drain; inventory JSON and the loaded output tree are pinned after their respective owners exit. Later captures first recheck prior pins, and the final inventory must match all captured raw/log/input tuples. The original loaded report is still mutable inside its original owner until that owner exits; no in-window observer was added. Top-level `completed.json`, its `finalCrossBindingPassed`, ownership receipt and actual process exit must all be inspected before claiming collection success.

Reviewed hashes:

| File | SHA256 |
| --- | --- |
| `run.py` | `c5245ba897550fc2b36cf9579af1a4df15e88cf73b6e6ad07f79e5f837ba677f` |
| Shared `envelope.py` | `f0b54c70c93891fd105d4f950a72046ce7998d21a8154e65a0440aca2b61a61a` |
| `inventory-run.mjs` | `62f3d5b85fde5db18d27ac4db0fa79db7f4e1d4c55dfe26e59e449c35e5aeb87` |
| `loaded-run.mjs` | `cc67c5945b32d7933abfb8fee87ea684afeaaeb6923f3cab0e7d021cf2eb1731` |
| `loaded-child.mjs` | `ad42f06db21e2897117c6750d28d3f688410cdb8db0098c377c0a19e8f7c497d` |

Retain all adverse HTTP, event-loop, restart-gap and memory observations. This preparation supplies the original local workload and evidence envelope only; numerical audit and performance disposition follow collection.
