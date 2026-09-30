# RC16 checkpoint: method and reproduction

This branch is internal evidence only. Do not merge it, package it for users, or
use it as the RC17 implementation base. The application remains RC16.

## Source identity and isolation

| Role | Canonical GitHub commit |
|---|---|
| RC16 application | `57c8dcc7fbd8fc2b62129498d1819050c78381a1` |
| Released, post-optimisation v0.7.3 baseline | `239794774320fcdebaa1d76ce8a77c5c25cfc48c` |
| Previous database investigation/evidence | `b75ce9452d161a2bf91b66d7c64f33bbc8292224` |
| Previous optimisation investigation/evidence | `14a53a8f002c956a5da88e216f63b9d51cba018f` |

The workspace's existing RC16 repository had reconstructed local commit ancestry.
Its local `36c69fb` commit has exactly the canonical RC16 Git tree
`83635e81965febbcc0b9e36c032d91ab95678469`: every one of 407 tracked blob hashes
matched GitHub before branching. These local and remote commit IDs are not
interchangeable. Subsequent checks preserve 405 files byte for byte, allowing only
the investigation's `AGENTS.md` and downloadable-build workflow guard to differ.
All 195 baseline files were recovered and checked against their canonical Git
blob hashes. See `rc16-source-manifest.json`, `historical/retrieval-manifest.json`
and `raw/source-verification.json`.

Harnesses, fixtures, diagnostics and reports live under `analysis/rc16`.
Application code, runtime dependencies, version, and lockfile are unchanged.
The branch disables the end-user build workflow for `perf/**`; its separate
Actions workflow uploads internal evidence only. It starts with a fresh output
directory and captures the run URL, harness commit, source identities and hashes.
Reports cannot inherit a successful old output if a new lane fails.

The independent GitHub run [36708404690](https://github.com/BunBajiro/kairo/actions/runs/36708404690)
completed successfully on 30 September 2026, using harness commit
`0344ff4ec069080a87e19294fa8fddc28f737327`. Its artifact is preserved unchanged
under `raw/github-run`, alongside the retrieved job log and verification record.
All 20 harness hashes match the local files; the downloaded artifact SHA256
matches GitHub's published digest. Later report/evidence commits do not alter
the measured harness. The CI lane uses Node 24.19.0 on an Ubuntu runner and
independently installs both applications' locked dependencies. Compare versions
within each host; browser/platform differences preclude cross-host timing ratios.
CI repeats every lane except real-archive installation/cancellation, which remains
local evidence. See `reviews/github-confirmation.md` for agreements and exceptions.

## Five complementary measurement lanes

1. **Matched legacy comparison.** The previous external harness is adapted to
   import either pinned application without editing either one. Run order is
   v0.7.3 → RC16 → RC16 → v0.7.3, sequentially, with fresh processes/profiles.
   Each profile observes 35 seconds of idle time with the real three-second Core
   scheduler enabled, then three warmups and ten observations per operation,
   including complete JSON serialization. Authenticated loopback HTTP is measured
   from a separate observer. The typical workload has one character, 2,000 assets,
   10,000 events, 300 visits, 600 combat records and 1,000 market types; stress has
   four characters, 20,000 assets each, 50,000 events, 2,000 visits, 4,000 combat
   records and 5,000 types. Fresh public-feed caches prevent background network
   work in RC16, just as fresh ESI snapshots do in the original harness; the new
   Universe tick remains enabled. Automatic SDE scheduling is deferred and
   measured separately. This is a controlled warm-cache comparison, not a
   complete default-network startup, supervised-process or multi-browser test.

2. **Database continuity.** Identical pre-migration fixtures use the pinned old
   store and baseline taxonomy to seed 365 days for 5,000 types. Each application
   performs its actual startup migration. Cold imports, working JSON bytes,
   1,000-type history writes, 5,000-event transactions, index size and initial-open
   cost are retained. Full aged-import and written-history hashes must match.
   This does not establish equality of all application responses: RC16 has new
   fields and features. `startKairo` latency excludes module import and supervisor
   launch. RSS is process residency, not a leak diagnosis.

3. **Universe/backend scaling.** New features have no v0.7.3 equivalent. The
   actual bundled SDE and deterministic private map records exercise 0/10k/100k
   visits, 1/8/24 populated maps, and 1/10/50 itinerary stops. Each populated map
   has 100 nodes, 99 wormhole links and 100 signatures; production also exposes
   its empty discovery map. These are scaling fixtures, not claims about typical
   player data. SQL-count diagnostics run separately from timings. Timings use
   three warmups/nine observations and forward/reverse scenario order, with JSON
   serialization reported separately. Query counts/body bytes mean rows emitted
   to JavaScript, not physical disk reads. The offline housekeeping tick does not
   measure network-enabled collection.

4. **Compiled browser.** A real headless Chromium instance loads the production
   frontend and loopback server with synthetic local data. Maps at 25/100/300/600
   nodes, Atlas, replay, idle windows, camera interaction and event refresh bursts
   are observed. The minimal Overview comparison uses the same fixture in both
   builds; it is separate from historical rich-dashboard browser measurements.
   Renderer main-thread TaskDuration is not total browser, worker or GPU CPU.
   RAF intervals under software rendering are not desktop GPU frame rates. Idle
   samples do not run an RAF sampler. Interaction windows have a small RAF
   observer; Atlas draw counters, long-task observation and CDP network tracing
   add diagnostic overhead. CPU profiling follows the measured windows. Open
   windows include deliberate settlement time and must not be quoted as exact
   user-perceived load latency. HTTPS/image attempts are blocked and logged;
   backend external fetches are forbidden.

5. **Updater and lifecycle.** The real 99,197,259-byte CCP archive (build 3552227)
   streams from local disk through the unchanged worker, generation selection,
   validation and cleanup code. This excludes Internet throughput and loaded
   Core/browser contention. Memory/disk peaks are sampled lower bounds, supplemented
   by OS maximum RSS; the 5ms loop-delay histogram has a resolution floor. Simulated
   metadata/cache deadlines establish request/timer counts, not a 24-hour soak.
   The async-disposal diagnostic controls callback/store-close ordering in the
   real bus/history subscriber; it demonstrates a lifecycle gap, not a measured
   full-supervisor crash rate.

## Reproduction

Use Node 24.19.0 and a supported Chrome/Chromium executable. Compile both pinned
applications using their locked dependencies before browser/HTTP measurements.
Never run measurement lanes concurrently on the same machine. Generated player
databases and browser profiles are synthetic and disposable.

```sh
python3 analysis/rc16/harness/verify-source.py
node analysis/rc16/harness/legacy/abba.mjs /absolute/v073 /absolute/rc16 /absolute/output
python3 analysis/rc16/harness/legacy-summary.py /absolute/output
node analysis/rc16/harness/backend-universe.mjs diagnostics
node analysis/rc16/harness/backend-universe.mjs timings
node analysis/rc16/harness/backend-universe.mjs timings --reverse
KAIRO_CHROME_PATH=/path/to/chrome node analysis/rc16/harness/frontend-browser.mjs
node analysis/rc16/harness/updater-bench.mjs light
node analysis/rc16/harness/updater-bench.mjs archive /absolute/CCP.zip 3552227
node analysis/rc16/harness/updater-bench.mjs abort /absolute/CCP.zip 3552227
node analysis/rc16/harness/architecture-shutdown.mjs
```

The updater commands and disposal diagnostic print JSON to stdout; redirect them
to unique raw-output files. Component and browser scripts record their own files.
See the individual review documents for environment switches and workload details.
The local updater's measured harness provenance, including a post-run output-field
rename and reconstruction limitation, is disclosed in `raw/updater-provenance.json`.

## Interpretation and RC17 gates

Use the old measurements as a historical reference, not as a direct percentage
comparison across hardware, dates or fixture differences. Compare paired builds
within each current environment. Ranges are the two run medians; nine/ten-sample
tails are descriptive maxima, not production percentile guarantees. A repeated
increase above both 10% and 1ms is a useful advisory signal for legacy operations,
not an automatic reason to remove functionality. Idle CPU is percentage of one
logical core. Absolute CPU percentage-point changes and memory costs remain visible.

For optimisation, branch from clean canonical RC16, make deliberate application
changes there, and import/copy the external harness into disposable measurement
checkouts. Re-run the same fixtures in balanced order, compare full outputs where
contracts are unchanged, and explicitly validate intentional new fields and
clock/revision/expiry semantics. Convert the shutdown diagnostic into a regression
test asserting successful drain; it currently asserts RC16's known failing behaviour.
Keep existing runtime, type, Universe/Maps/replay/reconnect browser gates. Final RC17
packaging must be checked for absence of `analysis/`, performance fixtures, profiles,
databases and investigation workflows, then tested from the extracted package.
Human in-app review remains the gate before merging 0.8.0 into main.

This checkpoint does not measure a real Windows player database, physical fans,
desktop GPU power, EVE/OBS contention, live external-service performance or a
long-running soak. Those limits do not invalidate the repeated local work and
amplification counts; they bound what can be concluded from them.
