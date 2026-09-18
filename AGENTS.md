# Kairo development workflow

- Make changes and prepare new versions on a feature branch, never directly on `main`.
- Verify the work and open a draft pull request so the user can review and test it.
- Provide the successful GitHub Actions test-build download when handing over a feature for in-app review.
- Do not push changes into `main` or merge a pull request until the user explicitly approves after review.

## Internal performance investigation branch

- `perf/benchmark-baseline` is an internal investigation of unchanged v0.7.2, not an end-user build or a version update. Hand over the report and measurement evidence; do not package an app for this investigation.
- Never merge this investigation branch into `main` or use it as the next development base. Start the subsequent v0.7.3 optimisation and refactoring work from clean v0.7.2, commit `b151125cd7b26611364923f00683b1c6f1c1bdd6`.
- Keep instrumentation, synthetic fixtures, captured profiles and benchmark workflows on this investigation branch or in disposable measurement checkouts. Preserve front-facing functionality and behaviour feel when implementing its findings.
