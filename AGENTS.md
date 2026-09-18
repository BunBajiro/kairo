# Kairo development workflow

- Make changes and prepare new versions on a feature branch, never directly on `main`.
- Verify the work and open a draft pull request so the user can review and test it.
- Provide the successful GitHub Actions test-build download when handing over a feature for in-app review.
- Do not push changes into `main` or merge a pull request until the user explicitly approves after review.

## Internal performance investigation branch

- `perf/benchmark-baseline` is an internal investigation of unchanged v0.7.2, not an end-user build or a version update. Hand over the report and measurement evidence; do not package an app for this investigation.
- Never merge this investigation branch into `main` or use it as the next development base. Start the subsequent v0.7.3 optimisation and refactoring work from clean v0.7.2, commit `b151125cd7b26611364923f00683b1c6f1c1bdd6`.
- Keep instrumentation, synthetic fixtures, captured profiles and benchmark workflows on this investigation branch or in disposable measurement checkouts. Preserve front-facing functionality and behaviour feel when implementing its findings.

## Database implementation review

- `perf/database-review-v0.7.3` reviews the pinned clean v0.7.3 alpha candidate through external imports. Experimental indexes, projections and transaction batches belong only in disposable synthetic databases.
- Hand over the report and evidence without modifying or rebuilding the application. Never merge this review branch into an implementation branch or `main`.

## Alpha data policy

- Kairo is still in alpha. Preserving existing data during iteration is desirable but not required; a fresh schema or data reset is acceptable when it simplifies a justified change. State any reset in the build handoff.
- Data preservation becomes a requirement from production onwards. Do not let alpha migration compatibility constrain the database review, and continue to preserve front-facing functionality and behaviour.
