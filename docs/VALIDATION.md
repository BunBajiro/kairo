# Validation and release readiness

**Use the exact build designated in the [Premerge Bug Review handoff](PREMERGE-BUG-REVIEW.md).** It records the application commit, verified package/download, active branch/PR and bug ledger. The completed [performance acceptance record](https://github.com/BunBajiro/kairo/blob/568ce3e29213e4132a535340c1321e28c46a83cc/analysis/rc17/completion/c954-resumption/resumed/CURRENT-CHECKPOINT.md) preserves prior gates. Internal artifacts are not automatically clean review candidates. PR #10 remains withdrawn; PR #12 owns the current phase. A clean handoff requires the declared automated gates and extracted-package verification; merge and release require the user's later approval after review.

## Reproduce source checks

Use Node.js 24+ and the repository's locked toolchain. Source builds use Bash and GNU timeout (Linux/WSL); compiled packages need neither an install nor a build to run.

```sh
npm run install:ci
npm run check:kairo
npm run build
npm run test:kairo
```

Build before tests that require compiled `dist` entrypoints. Dependencies and the install verification live in [scripts/install-ci.sh](../scripts/install-ci.sh). For a focused change, run the behavioral tests for the affected owner first; broad release acceptance is a separate gate.

| Change | Relevant verification |
| --- | --- |
| HTTP/API or permissions | Owning service and HTTP tests, wrong pilot/scope, invalid input, status/conflict and private-versus-Stream separation |
| Snapshot/resource delivery | `resource-state`, `scoped-refresh`, SSE and dataset connection tests; compiled late-response/reconnect/pilot-switch controls |
| Collector/event lifecycle | Core/ESI/Auth/lifecycle tests; accepted work, nested listener promises, failure/close and actual worker exit |
| Session/report/replay | Session ownership/event-window/combat/travel/index tests and compiled archive/replay fixtures |
| Maps/Atlas/routes | Universe/J-Space/operations/navigation tests, expiry/unknown-field preservation and compiled interaction/output checks |
| Stream/OBS | Projection, protection, bindings, renderer recovery, native timing and actual user OBS review |
| Dataset or packaging | Fault/restart/rollback tests, fresh package extraction and checks against the extracted runtime |

The full contract suite is `tests/kairo/*.test.mjs`. Browser and packaging gates are defined in [test-build.yml](../.github/workflows/test-build.yml) and the referenced scripts. Keep synthetic fixture results separate from real EVE/OBS/Windows checks.

## Evidence required to close a bug

A bug-specific regression must demonstrate the actual failure before the fix and the intended behavior after it. Assert meaningful outputs, persisted state, ownership or recovery, with healthy controls and relevant boundaries. Exercise the real service and persistence for integration defects, and the compiled UI for browser-owned behavior. Controlled clocks, deferred promises and local provider fixtures should reproduce rare timing or failure scenarios deterministically; avoid timing-only sleeps and mocks that merely encode the proposed implementation.

Good automated evidence can establish that an internal bug is fixed even when a human cannot realistically reproduce it in Kairo. Unit tests are sufficient for isolated logic; add integration or browser coverage where the failure crosses that boundary. Record the evidence and remaining limitations in the bug ledger. A total passing-test count supports the combined gate but does not replace the specific regression. Manual review addresses genuinely unestablished environment or experiential behavior, not an automatic extra condition on every fix.

## Browser compatibility

Chrome (Blink) and Firefox (Gecko) are required targets for future review and release builds. Both browser gates must pass before packaging and handoff. For a new or changed UI flow, add or extend behavioral coverage in both engines; if part of the check requires manual interaction, record the browser/version, steps and result before calling that flow verified. One engine's result must not be presented as coverage of the other.

Exercise the affected flow from a fresh page/context as well as after normal navigation. Include delayed or failed resource recovery and desktop/narrow layout where relevant. Keep lazy-loaded offscreen resources distinct from missing visible content. Save useful failures, screenshots and results through the existing Actions artifacts; report the exact tested commit and browser scope.

Current automated coverage is intentionally explicit:

| Browser | Existing compiled checks |
| --- | --- |
| Chrome | Market icons across desktop/narrow views, image recovery, session cards, Universe/replay and dataset updates/reconnects; Range navigation, import quote ownership, Session snapshot paging, hull-image recovery, denied-storage pilot selection and overlapping module settings at 1600/390 widths |
| Firefox | Fresh desktop market leaf before All items, All items and return, with delayed image loading and geometry checks; Range navigation, import quote ownership, Session snapshot paging, hull-image recovery, denied-storage pilot selection and overlapping module settings at 1600/390 widths |

The Firefox market regression is a required baseline, not full cross-browser coverage of every module. Future changes must cover their affected behavior in both browsers rather than relying on that baseline alone. The Firefox runner uses an isolated Playwright installation in Actions, separate from application dependencies. The workflow retains both browser checks as blocking steps before package creation; failures must not be made non-blocking to obtain a downloadable build.

Build #75 passes the current coverage table. Historical build #69 passed the original market/session/Universe/dataset scopes, and Bun confirmed its category-first icon fix in Firefox on 13 October 2026. That closes the reported icon finding; it is not blanket approval of every UI flow or authorization to merge/release.

## Current bug-review acceptance

Build #75 at `e311a63a0323a5054f42f9fbdc77b52e13765b36` passes types, fresh build, every blocking Chrome/Firefox gate, and **1,074/1,074** packaged-runtime tests. The downloaded ZIP independently passes CRC and SHA256, byte comparison of all 504 packaged source files, and all 1,074 tests without source dependencies. The [live handoff](PREMERGE-BUG-REVIEW.md#current-verified-candidate) owns the exact download, digest, completed seven-area review and 20 closed findings; [structured final evidence](review-evidence/2026-10-13-second-pass-fixed.json) retains all 123 bug-specific browser checks and exact verification scope. No confirmed finding remains open.

Corrections preserve the intended experience without repair notices or extra controls. Session pagination retains one request per next page and the indexed event query; import and bootstrap ownership fencing adds no requests; OBS reuses its connection lifecycle. Auth/ESI/Core work respects connection ownership while retaining same-connection coalescing, pacing and the existing cached-path roster-read bound. Session milestones keep receipt-time ownership without added polling or historical rescans. These are bounded correctness checks, not new performance measurements. Earlier failed baselines and the corrected combined-suite/Chrome-helper attempts remain recorded.

Real Windows/DPAPI, actual EVE permissions/SSO, OBS scene/audio output and extended play remain outside the automated evidence. They do not require the user to reproduce the internal races and failure paths already established by regression tests. PR #12 stays draft; merge and stable release still need separate approval.

## Completed performance acceptance (historical)

Measured application source `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789` passed **1,004 runtime tests, type checks and a fresh build**, plus **89 compiled integration controls**. [Test build #65](https://github.com/BunBajiro/kairo/actions/runs/37768942689) separately verified its ordinary feature-build/package checks. All **46 refactoring and optimisation component decisions** have supported fix, retention or rejection dispositions in the [single issue ledger](https://github.com/BunBajiro/kairo/blob/perf/rc16-checkpoint-v0.8.0/analysis/rc17/completion/c954-resumption/resumed/CURRENT-ISSUES.md).

The final local historical/current comparisons, startup and full-contract/database adapters, completion UI, configured first binding and real-archive updater collections have independent reviews. The [three-version performance report](https://github.com/BunBajiro/kairo/blob/perf/rc16-checkpoint-v0.8.0/analysis/rc17/PERFORMANCE-REVIEW-0.8.0.md) retains improvements, adverse results, first-use trade-offs and limits. The 0.7.3/RC16 and RC16/current groups are separately matched; their percentages are not combined into an inferred 0.7.3/current result.

The [historical performance acceptance record](https://github.com/BunBajiro/kairo/blob/perf/rc16-checkpoint-v0.8.0/analysis/rc17/completion/c954-resumption/resumed/CURRENT-CHECKPOINT.md) owns that phase's independent comparison/UI/updater Actions results and extracted package. Later documentation or bug-review commits do not relabel those measurements as having run on newer source. A passing ordinary build or documentation update alone does not close release acceptance.

## Performance evidence rules

Compare matched baseline/candidate work and complete outputs. Keep first-use, changed, unchanged, small, large, zero-consumer and write/storage costs where relevant. Run ordinary elapsed timing separately from profiles, counters and forced garbage collection. Preserve failed attempts and adverse rows; an instrumented sample or request count is attribution, not a speed result. Do not pool repeated samples from one process as independent process replications.

An isolated improvement does not automatically close an entire whitepaper finding. Final combined source, local measurements, independent CI and the extracted package must meet the declared gates before a clean review handoff. Merge/release still follows human review under [AGENTS.md](../AGENTS.md).

## User-environment checks

Automated fixtures cannot establish the user's actual EVE SSO/scopes or structure permissions, Windows DPAPI under their login, rendered OBS/audio/scene/cover behavior, or long play-session coverage. The release handoff must identify which of these remain for in-app review. Missing provider observations, cache delays, incomplete public killmails and historical data gaps are product limits described in the user/domain guides.

Historical version-by-version validation is retained in the [documentation archive](https://github.com/BunBajiro/kairo/tree/perf/rc16-checkpoint-v0.8.0/analysis/rc17/completion/c954-resumption/resumed/oct8/documentation-prune/originals/docs), with its original source/date limitations. It is not current RC17 acceptance.
