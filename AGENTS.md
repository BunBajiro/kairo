# Kairo development workflow

## Internal RC16 performance checkpoint

This `perf/rc16-checkpoint-v0.8.0` branch is investigation-only, based on
RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1`. Do not merge it into the
application, create an end-user package from it, or use it as the RC17
implementation base. Application source, version and dependencies must stay
unchanged during this analysis. Keep disposable harnesses and synthetic evidence
under `analysis/rc16`. Run timed workloads sequentially; record exact source and
harness provenance. Future optimisation starts from clean RC16 and is retested
with these external harnesses. Only the clean RC17 review build may advance to
the user, and main still requires explicit approval after human review.

The downloadable test-build workflow is disabled for `perf/**`, including manual
dispatch. This overrides the normal feature-build handoff requirement below.

- Make changes and prepare new versions on a feature branch, never directly on `main`.
- Verify the work and open a draft pull request so the user can review and test it.
- Provide the successful GitHub Actions test-build download when handing over a feature for in-app review.
- Do not push changes into `main` or merge a pull request until the user explicitly approves after review.

- Kairo is in alpha iteration. Preserving existing data is desirable but is not a requirement; explain any reset in the handoff. Mandatory data preservation begins with production.
