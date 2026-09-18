# Internal performance investigation

This branch measures unchanged v0.7.2 application behaviour to guide a subsequent optimisation **and refactoring** pass. It is an internal investigation, not an end-user build or a version update. Do not merge this profiling branch into `main` or use it as the development base for v0.7.3. Start that work from clean v0.7.2 and apply the report's recommendations deliberately. Keep instrumentation, fixtures, profiles and benchmark workflows in this investigation branch.

Application source, runtime dependencies and version remain unchanged. The existing test-build workflow skips `perf/**` branches; this branch produces measurement artifacts only. The baseline application commit is `b151125cd7b26611364923f00683b1c6f1c1bdd6`.

## Running the internal suite

Requires Node 24.19.0, locked project build dependencies and Chrome for browser measurements. In the workspace or a development checkout:

```sh
npm run install:ci
npm run build
npm run test:kairo
npm run test:perf
npm run check:kairo
KAIRO_PERF_OUTPUT=performance-results/run-1 npm run bench:backend
KAIRO_PERF_OUTPUT=performance-results/run-2 npm run bench:backend
npm run bench:compare -- performance-results/run-1/backend.json performance-results/run-2/backend.json
npm run bench:browser
```

The GitHub **Kairo internal performance** workflow does this on pushes to `perf/**`. Its Actions summary and `kairo-internal-performance-<commit>` artifact contain JSON samples, Markdown summaries and browser screenshots. `workflow_dispatch` becomes available through the normal GitHub UI only if the workflow exists on the default branch; while this investigation remains isolated, a branch push is the trigger. No release or distributable app ZIP is produced.

Run measurements sequentially on a quiet worker. Do not overlap a benchmark with compilation, another benchmark, dependency installation or profiling. Repeatability results are advisory: runner scheduling, power management, CPU model and Chrome version affect timings. Comparisons refuse different CPU models, Node/browser versions, profile definitions, measurement settings or missing scenarios. They do not declare a performance pass on incomparable results. Absolute timing/CPU gates need more repeated baseline data before calibration; correctness, nonempty workloads, zero external calls and harness failures are hard failures now.

## What is measured

| Workload | Typical | Stress |
|---|---:|---:|
| Connected synthetic characters | 1 | 4 |
| Assets per character | 2,000 | 20,000 |
| Events in the populated session | 10,000 | 50,000 |
| Visits in that session | 300 | 2,000 |
| Personal and alliance combat records | 600 each | 4,000 each |
| Saved sessions | 50 | 200 |
| Market types per hub, across two hubs | 1,000 | 5,000 |
| History days per market type | 30 | 30 |

These labels describe smaller and larger synthetic fixtures, not claims about typical player history. Stress deliberately concentrates events and repeated visits into one six-hour session to reveal scaling problems. The committed taxonomy supplies real type IDs; all prices, orders, histories, characters and activity are invented. Sessions are archived; live feed lifecycle behaviour is covered by existing `session-live` correctness tests, not an external network load test.

Backend runs use a separate observer process and temporary SQLite data directories. Future dataset refresh dates exercise the **real three-second scheduler** while preventing network collection. Protection independently limits location evidence to 30 seconds, so the first idle window includes the expected transition to unknown as that evidence ages. Measurements cover idle process CPU/RSS/event loop, OPSEC evaluation, state projection, journey, session reports, market browsing, supply reports, cached imports, imports after an unrelated database write, and authenticated loopback `/api/state` requests. Direct operation timings include JSON serialization. The HTTP measurement additionally includes transfer and parsing, and is reported separately. Three warmups precede ten samples; p50/p95 use nearest-rank percentiles. At ten samples p95 is the maximum, not a robust estimate of rare tail events.

Browser runs use compiled production assets, the real local server, and headless Chrome's DevTools protocol with a 1600×1050 viewport. They record load-to-ready, idle renderer main-thread busy time, script/layout work, DOM size, heap snapshots of usage, long tasks, request cadence, received body bytes, and separate Node server CPU/RSS. Each idle window lasts 35 seconds after two seconds of settling, spanning the dashboard's 30-second fallback refresh. Page timers are not accelerated. Page setup/condition checks finish before the idle interval; there is no continuous `requestAnimationFrame` measurement loop.

Browser scenarios cover overview, assets, market overview, an archived session report, an empty stream and ten stream widgets. ESI collection is disabled for these UI measurements to isolate server/UI polling; the backend idle run measures collection scheduling separately. External image requests are fulfilled with a local one-pixel placeholder. Other external page requests fail; ESI, zKill and archive fetch seams also fail and count attempts. The suite uses no real login, tokens, user database or OBS connection. Temporary servers, profiles and data are removed after use.

## Controls and diagnostics

| Variable | Default | Purpose |
|---|---|---|
| `KAIRO_PERF_OUTPUT` | `performance-results` | Output directory |
| `KAIRO_PERF_PROFILES` | `typical,stress` | Backend profile selection |
| `KAIRO_PERF_ITERATIONS` | `10` | Timed samples per operation, 3–100 |
| `KAIRO_PERF_IDLE_SECONDS` | `35` | Backend idle observation, 5–600 seconds |
| `KAIRO_PERF_BROWSER_SECONDS` | `35` | Browser idle observation, 5–600 seconds |
| `KAIRO_PERF_BROWSER_PROFILE` | `stress` | Browser fixture size |
| `KAIRO_CHROME_PATH` | system Chrome | Explicit Chrome executable |
| `KAIRO_PERF_CPU_PROFILE` | unset | `1` writes separate V8 CPU profiles after timed samples |

Short windows and three-sample runs are harness smoke checks only. They do not establish a baseline. Diagnostic CPU profiles are collected outside timed samples; run them separately from the clean baseline. Open `.cpuprofile` files in Chrome DevTools' Performance panel. Process RSS before/after and observed peak RSS describe process memory, not proof of a memory leak; the 250ms peak sampler can miss short spikes. Event-loop delay has a 10ms sampling resolution. CPU percentage uses one logical core, so 100% means one core fully occupied, not the entire machine.

For isolated snapshot-read counts and CPU profiles of the identified hotspots:

```sh
KAIRO_PERF_OUTPUT=performance-results/diagnostic node tests/performance/diagnose.mjs
```

This temporarily counts reads at the store boundary in a disposable worker, including one explicit scheduling wave. Reported JSON bytes are the payloads returned through that boundary, not physical disk I/O. The extra instrumentation is not active during the baseline. The populated combat tables and generic activity-event stream are independent synthetic inputs; use the existing correctness tests for accounting semantics.

The completed baseline, retained raw evidence and prioritised follow-up work are in [PERFORMANCE-FINDINGS.md](PERFORMANCE-FINDINGS.md). For later comparisons, run this harness only in disposable measurement checkouts, recording both application and harness revisions. Keep the subsequent implementation branch based on clean v0.7.2 without these profiling files.

## Limits and preservation requirements

This does not measure physical fans, GPU power, actual OBS/Streamlabs rendering, Firefox, hidden-tab throttling, live internet latency or long-session memory retention. Chromium's renderer task time excludes other browser processes and compositing work. Do not infer the cause of the user's fan activity solely from these numbers. Load measurements are single observations per scenario; they are not statistically stable navigation latency benchmarks.

For the follow-up pass, choose a targeted optimisation when redundant work has a clear owner; refactor when scheduling, state ownership or cache dependencies cause the redundant work across modules. Preserve visible layout, card behaviour, search/pagination, ordering, focus, freshness indicators, character isolation and numerical outputs. Keep protection evaluation timely and fail-closed, and retain the live-only two-minute zKill cadence and 24-hour archival rules. Performance gains must not come from silently dropping data, postponing safety decisions, hiding functionality or weakening stale-data handling.

Primary measurement references: [Node performance hooks](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html), [Node CPU usage](https://nodejs.org/docs/latest-v24.x/api/process.html#processcpuusagepreviousvalue), [Chrome Performance protocol](https://chromedevtools.github.io/devtools-protocol/tot/Performance/), [Chrome Network protocol](https://chromedevtools.github.io/devtools-protocol/tot/Network/).
