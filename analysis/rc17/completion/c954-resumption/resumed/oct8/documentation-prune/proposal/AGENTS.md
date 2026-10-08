# Kairo development workflow

- Make changes and prepare new versions on a feature branch, never directly on `main`.
- Verify the work and open a draft pull request so the user can review and test it.
- Provide the successful GitHub Actions test-build download when handing over a feature for in-app review.
- Do not push changes into `main` or merge a pull request until the user explicitly approves after review.

- Kairo is in alpha iteration. Preserving existing data is desirable but is not a requirement; explain any reset in the handoff. Mandatory data preservation begins with production.

Current user/developer documentation starts at [docs/README.md](docs/README.md). Read the owning service and its tests before changing a contract; historical investigation documents are not current release acceptance.
