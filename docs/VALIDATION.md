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
| Chrome | Market icons across desktop/narrow views, image recovery, session cards, Universe/replay and dataset updates/reconnects; Range navigation, import quote ownership, Session snapshot paging, hull-image recovery, denied-storage pilot selection and overlapping module settings at 1600/390 widths; PlaceNotes discard, denied-storage Atlas/Maps/replay, Studio/OPSEC/import saved-draft ownership, appearance write ordering and Session error ownership at both widths; narrow Studio rightmost-control scrolling and pointer reachability; Maps/Atlas pointer-relative connection hover, manifest review/save/name ownership, Client ID draft ownership, Studio capacity, Goals write ordering, import analysis error ownership and manifest text/scroll/pointer geometry at both widths |
| Firefox | Fresh desktop market leaf before All items, All items and return, with delayed image loading and geometry checks; Range navigation, import quote ownership, Session snapshot paging, hull-image recovery, denied-storage pilot selection and overlapping module settings at 1600/390 widths; PlaceNotes discard, denied-storage Atlas/Maps/replay, Studio/OPSEC/import saved-draft ownership, appearance write ordering and Session error ownership at both widths; narrow Studio rightmost-control scrolling and pointer reachability; Maps/Atlas pointer-relative connection hover, manifest review/save/name ownership, Client ID draft ownership, Studio capacity, Goals write ordering, import analysis error ownership and manifest text/scroll/pointer geometry at both widths |

The Firefox market regression is a required baseline, not full cross-browser coverage of every module. Future changes must cover their affected behavior in both browsers rather than relying on that baseline alone. The Firefox runner uses an isolated Playwright installation in Actions, separate from application dependencies. The workflow retains both browser checks as blocking steps before package creation; failures must not be made non-blocking to obtain a downloadable build.

Build #86 passes the current coverage table. Historical build #69 passed the original market/session/Universe/dataset scopes, and Bun confirmed its category-first icon fix in Firefox on 13 October 2026. That closes the reported icon finding; it is not blanket approval of every UI flow or authorization to merge/release.

## Active follow-up and previous bug-review acceptance

PBR-58 reproduces missing blueprint images: the provider exposes `bp`, while the shared image component requests `icon`. The earlier market image fixtures accepted every image URL and did not establish blueprint resource correctness. Build86 below remains the last verified package for its recorded scope; the fourth comprehensive pass and blueprint correction are in progress. The live ledger distinguishes banked source, workspace-only changes and pending verification.

Build #86 at `695c50ce7b095bf3e61d97ce97d12bcdee4a1746` passes types, a fresh build, every blocking Chrome/Firefox gate, **991/991** bug-specific browser checks and **1,164/1,164** packaged-runtime tests. The independently downloaded ZIP passes CRC and SHA256, byte comparison of all 540 packaged source files, and all 1,164 tests without source dependencies. The [live handoff](PREMERGE-BUG-REVIEW.md#current-verified-candidate) owns the exact download, digest, completed seven-area third pass and **57 closed findings**, including 20 from this pass. [Structured final evidence](review-evidence/2026-10-15-third-pass-fixed.json) retains actual browser results, package identity, independent reviews, screenshot scope and retained attempts. No confirmed finding remained open at that checkpoint; PBR-58 is the subsequent reported follow-up.

Source acceptance includes the final scoped manifest CSS fix. Build84 first passed the preceding 19 corrections and 975 browser checks. Visual review then found Firefox390 item-name/quantity overlap, confirmed by build85's real text-range failure. Final build86 passes all 16 additional geometry/reachability controls and all four final manifest screenshots were reviewed. Historical Studio horizontal cropping remains reachable; it was not treated as a new defect. Screenshot review is explicitly scoped in evidence and does not imply all-flow visual coverage.

Corrections preserve intended workflows without repair notices or extra controls. Map pointer motion retains zero extra geometry queries/requests and no canvas redraw; Core details keep bounded workers and constant-time connection checks; combat notifications publish once per changed batch; Stream timer ownership stays bounded. Manifest/save/error ownership and Goals ordering retain explicit request counts; PBR-57 is one CSS declaration with no runtime work. Existing indexed paging, ESI pacing/coalescing and cached-path roster costs remain covered. These are bounded correctness regressions, not new elapsed-performance measurements.

All 37 earlier fixes also received retrospective source/evidence review, recorded separately from the third pass. The evidence audit completed 79 targeted owner controls after identifying two older partial logs; those partial captures and an empty supplemental capture remain labelled rather than counted as complete runs. Failed hosted baselines, cancelled build81 and fixture corrections remain explicit.

Real Windows/DPAPI, actual EVE permissions/SSO, OBS scene/audio output and extended play remain outside the automated evidence. They do not require the user to reproduce internal races already established by deterministic regressions. PR #12 stays draft; merge and stable release still need separate approval.

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
