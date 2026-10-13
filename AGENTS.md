# Kairo development workflow

Current phase: [0.8.0 RC Premerge Bug Review](docs/PREMERGE-BUG-REVIEW.md), branch `review/0.8.0-rc-premerge-bug-review`, draft PR #12. The performance/refactor phase is complete; start the next bug-review chat from that handoff and its issue ledger.

- Make changes and prepare new versions on a feature branch, never directly on `main`.
- Verify the work and open a draft pull request so the user can review and test it.
- Provide the successful GitHub Actions test-build download when handing over a feature for in-app review.
- Chrome (Blink) and Firefox (Gecko) are required browser targets. Before handing over a build, keep both browser gates passing and verify new or changed UI flows in both engines, including relevant cold navigation, loading/recovery and viewport behavior. A Chrome-only pass does not establish Firefox compatibility. Record the actual coverage and any manual checks in the handoff; see [browser validation](docs/VALIDATION.md#browser-compatibility).
- Do not push changes into `main` or merge a pull request until the user explicitly approves after review.

- Kairo is in alpha iteration. Preserving existing data is desirable but is not a requirement; explain any reset in the handoff. Mandatory data preservation begins with production.

Current user/developer documentation starts at [docs/README.md](docs/README.md). Read the owning service and its tests before changing a contract; historical investigation documents are not current release acceptance.
