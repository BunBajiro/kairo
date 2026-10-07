# Atlas and first-format conditional evidence

Prepared 7 October 2026. These harnesses are executable diagnostics; an unrun harness does not close a finding. No production source is edited by them.

## Five-file immutable-index trial (startup M1)

`runner.mjs` compares the frozen a27 source against a trial changing exactly five server files: `universe-static`, `universe`, `universe-operations`, `universe-navigation`, and `universe-intel`. The runner checks that file delta and the bundled Atlas identity. Each ABBA observation is a fresh process. Cold Universe import, explicit topology load, Universe construction, first real Intel ingestion and first named itinerary save are separate and cumulative metrics. Warm Intel duplicate handling and repeated itinerary save retain their own distributions; they are not conflated with raw parser speed.

Collected heap and Map constructor/entry counters use separate children. Counter wrappers are absent from timing and heap lanes. Construction counts include temporary maps and do not alone establish retained ownership. The heap lane retains ordinary objects across prescribed phases and collects before reading memory; collected heap must not be described as ordinary RSS. Default readonly topology identity and an injected parser with duplicate/exact/multiword names are checked outside the measurement intervals.

## First formatted Stream binding (G7-adjacent)

The common `bindingProjection` entry point is compared across RC16, fa6 and the trial source. The lane reports cold module import, first formatted Wallet, first formatted Goal, warm Wallet/Goal pairs and cumulative import+first pair. Its controlled Store adapter removes SQLite fixture cost and preserves exact formatted output, binding status and values. This isolates the projection/formatter path, not whole-Core launch with configured Stream bindings. Separate constructor counters show eager versus lazy/reused formatter ownership.

Inputs to the runner are existing source manifests in a JSON mapping:

```json
{"a27":"/absolute/a27.json","trial":"/absolute/trial.json","rc16":"/absolute/rc16.json","fa6":"/absolute/fa6.json"}
```

```bash
node analysis/rc17/completion/atlas/runner.mjs source-config.json output-directory 3 all
```

The runner acquires `/tmp/kairo-rc16-benchmark.lock`, saves each child result, uses an immutable completed file, verifies semantic digests and source/harness hashes, and retains partial progress on failure. Obtain the coordinator's quiet slot before launch.

## Atlas M7/M8

`layout-worker.mjs <repo> <manifest> <physical|schematic> <timing|heap>` loads exact production layout functions and complete bundled topology. Fresh physical-first and schematic-first children separate deferred first switch from mount work. Warm recomputation and complete retained layouts/radar remain visible. This is a kernel lane, not a React/browser measurement.

`browser-profile.mjs` starts a real local app and Chrome, loading the freshly compiled `/#universe-kspace` route with the complete bundled Atlas. Four fresh pages use physical/schematic/schematic/physical order. Raw CPU profiles retain cold mount, first switch, warm switch and native pan/zoom/activity work. A separate page instruments actual Canvas calls and draw-containing animation callbacks; those durations include instrumentation and cannot be used as unmodified performance numbers. The first pass leaves renderer functions unmodified and uses sampled profiles plus CDP process metrics. Profile self-time is sampled wall attribution, not exact CPU or a proof of per-loop cost.

```bash
KAIRO_BENCH_REPO=/absolute/current-frozen-source \
KAIRO_CHROME_PATH=/tmp/kairo-chrome-runtime/chromium \
KAIRO_BUILD_RECEIPT=/absolute/frozen-build-receipt.json \
KAIRO_BROWSER_OUTPUT=analysis/rc17/completion/atlas/browser-result \
node analysis/rc17/completion/atlas/browser-profile.mjs
```

The browser lane records compiled/source identity and verifies it again afterwards. It uses a complete activity fixture and real Canvas paths. Radar/replay semantics remain covered by their separate correctness suites; this browser lane does not currently time replay mounting or radar interaction. Do not mark those workload dimensions measured from the kernel result alone.

M6 Maps memo/culling needs the coordinator's final camera profile. Atlas Canvas sampling cannot support a disposition about Maps React scene leaves. Preserve remaining style/layout/paint/React attribution and all unchanged 100/600-node camera fixtures when deciding whether additional memo/culling is warranted.

Browser runs require the coordinator's build receipt containing `sourceFingerprint` (the captured source+compiled manifest fingerprint), `buildCommand`, `completedAt`, `exitCode: 0`, and `logSha256`; optional `buildLog` is verified against that hash. This explicitly binds the successful frozen build record to the captured source/assets, beyond merely finding nonempty `dist`. Harness and helper hashes are also verified after the run.
