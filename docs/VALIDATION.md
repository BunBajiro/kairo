# Validation and release readiness

**RC17 remains internal work in progress. PR #10 is withdrawn; a clean 0.8.0 review candidate is not yet available.** The [analysis checkpoint](https://github.com/BunBajiro/kairo/blob/perf/rc16-checkpoint-v0.8.0/analysis/rc17/completion/c954-resumption/resumed/CURRENT-CHECKPOINT.md) records accepted changes, rejected experiments, remaining findings and exact source/evidence boundaries. Do not infer final acceptance from an older test count or a successful ordinary test-build workflow.

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

## What is verified at this checkpoint

Application code checkpoint `a7b1bf97b0073695926c443e52d523638e59e48d` passed [test build #63](https://github.com/BunBajiro/kairo/actions/runs/37753808235): types, fresh build, selected compiled Session/Universe/replay/dataset checks, extraction and packaged-runtime checks. The analysis record contains the narrower source-bound optimization gates that led to it. This is not a claim that a full current optimization matrix or final combined suite has passed.

Remaining closure includes source-bound component decisions, combined correctness/performance, startup/state/idle/retention and independent CI/package acceptance. Documentation changes do not close runtime findings. Final acceptance must name the exact source commit, built assets, harness/fixtures and retained failures/adverse results.

## Performance evidence rules

Compare matched baseline/candidate work and complete outputs. Keep first-use, changed, unchanged, small, large, zero-consumer and write/storage costs where relevant. Run ordinary elapsed timing separately from profiles, counters and forced garbage collection. Preserve failed attempts and adverse rows; an instrumented sample or request count is attribution, not a speed result. Do not pool repeated samples from one process as independent process replications.

An isolated improvement does not automatically close an entire whitepaper finding. Final combined source, local measurements, independent CI and the extracted package must meet the declared gates before a clean review handoff. Merge/release still follows human review under [AGENTS.md](../AGENTS.md).

## User-environment checks

Automated fixtures cannot establish the user's actual EVE SSO/scopes or structure permissions, Windows DPAPI under their login, rendered OBS/audio/scene/cover behavior, or long play-session coverage. The release handoff must identify which of these remain for in-app review. Missing provider observations, cache delays, incomplete public killmails and historical data gaps are product limits described in the user/domain guides.

Historical version-by-version validation is retained in the [documentation archive](https://github.com/BunBajiro/kairo/tree/perf/rc16-checkpoint-v0.8.0/analysis/rc17/completion/c954-resumption/resumed/oct8/documentation-prune/originals/docs), with its original source/date limitations. It is not current RC17 acceptance.
