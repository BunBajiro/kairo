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

## Browser compatibility

Chrome (Blink) and Firefox (Gecko) are required targets for future review and release builds. Both browser gates must pass before packaging and handoff. For a new or changed UI flow, add or extend behavioral coverage in both engines; if part of the check requires manual interaction, record the browser/version, steps and result before calling that flow verified. One engine's result must not be presented as coverage of the other.

Exercise the affected flow from a fresh page/context as well as after normal navigation. Include delayed or failed resource recovery and desktop/narrow layout where relevant. Keep lazy-loaded offscreen resources distinct from missing visible content. Save useful failures, screenshots and results through the existing Actions artifacts; report the exact tested commit and browser scope.

Current automated coverage is intentionally explicit:

| Browser | Existing compiled checks |
| --- | --- |
| Chrome | Market icons across desktop/narrow views, image recovery, session cards, Universe/replay and dataset updates/reconnects |
| Firefox | Fresh desktop market leaf before All items, All items and return, with delayed image loading and geometry checks |

The Firefox market regression is a required baseline, not full cross-browser coverage of every module. Future changes must cover their affected behavior in both browsers rather than relying on that baseline alone. The Firefox runner uses an isolated Playwright installation in Actions, separate from application dependencies. The workflow retains both browser checks as blocking steps before package creation; failures must not be made non-blocking to obtain a downloadable build.

Build #69 passed these automated scopes, and Bun confirmed the category-first icon fix in Firefox on 13 October 2026. That closes the reported icon finding; it is not blanket approval of every UI flow or authorization to merge/release.

## What is verified at this checkpoint

Measured application source `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789` passed **1,004 runtime tests, type checks and a fresh build**, plus **89 compiled integration controls**. [Test build #65](https://github.com/BunBajiro/kairo/actions/runs/37768942689) separately verified its ordinary feature-build/package checks. All **46 refactoring and optimisation component decisions** have supported fix, retention or rejection dispositions in the [single issue ledger](https://github.com/BunBajiro/kairo/blob/perf/rc16-checkpoint-v0.8.0/analysis/rc17/completion/c954-resumption/resumed/CURRENT-ISSUES.md).

The final local historical/current comparisons, startup and full-contract/database adapters, completion UI, configured first binding and real-archive updater collections have independent reviews. The [three-version performance report](https://github.com/BunBajiro/kairo/blob/perf/rc16-checkpoint-v0.8.0/analysis/rc17/PERFORMANCE-REVIEW-0.8.0.md) retains improvements, adverse results, first-use trade-offs and limits. The 0.7.3/RC16 and RC16/current groups are separately matched; their percentages are not combined into an inferred 0.7.3/current result.

The [current acceptance record](https://github.com/BunBajiro/kairo/blob/perf/rc16-checkpoint-v0.8.0/analysis/rc17/completion/c954-resumption/resumed/CURRENT-CHECKPOINT.md) owns the independent comparison/UI/updater Actions results and the exact extracted package. Documentation-only preparation after source70 must record the changed files and unchanged runtime/build inputs there; it does not relabel earlier measurements as having run on a later commit. A passing ordinary build or documentation update alone does not close release acceptance.

## Performance evidence rules

Compare matched baseline/candidate work and complete outputs. Keep first-use, changed, unchanged, small, large, zero-consumer and write/storage costs where relevant. Run ordinary elapsed timing separately from profiles, counters and forced garbage collection. Preserve failed attempts and adverse rows; an instrumented sample or request count is attribution, not a speed result. Do not pool repeated samples from one process as independent process replications.

An isolated improvement does not automatically close an entire whitepaper finding. Final combined source, local measurements, independent CI and the extracted package must meet the declared gates before a clean review handoff. Merge/release still follows human review under [AGENTS.md](../AGENTS.md).

## User-environment checks

Automated fixtures cannot establish the user's actual EVE SSO/scopes or structure permissions, Windows DPAPI under their login, rendered OBS/audio/scene/cover behavior, or long play-session coverage. The release handoff must identify which of these remain for in-app review. Missing provider observations, cache delays, incomplete public killmails and historical data gaps are product limits described in the user/domain guides.

Historical version-by-version validation is retained in the [documentation archive](https://github.com/BunBajiro/kairo/tree/perf/rc16-checkpoint-v0.8.0/analysis/rc17/completion/c954-resumption/resumed/oct8/documentation-prune/originals/docs), with its original source/date limitations. It is not current RC17 acceptance.
