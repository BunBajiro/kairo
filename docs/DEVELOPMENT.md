# Develop, test and package Kairo

[Documentation index](README.md) · [Architecture](ARCHITECTURE.md) · [Validation](VALIDATION.md)

The current application is **`0.8.0-rc.17`**. Follow [AGENTS.md](../AGENTS.md) and keep changes on a feature/review branch. The current documentation phase uses `review/0.8.0-rc-premerge-bug-review`, draft PR #12. No version bump, merge or stable release is authorised by documentation completion.

## Recover before changing anything

Compare the actual branch head, PR and local `git status` with the relevant handoff. Preserve and reconcile workspace changes; never overwrite them merely because GitHub is newer, or assume an old workspace contains the accepted build. The [current review handoff](REVIEW-BUILD.md) identifies the verified download and tested source. The [manual](DOCUMENTATION-WORK.md) and [source documentation](SOURCE-DOCUMENTATION-WORK.md) ledgers preserve their completed phases; [premerge review](PREMERGE-BUG-REVIEW.md) preserves build90's original bug-review acceptance. Bank useful checkpoints and record what is committed versus workspace-only.

```sh
git status --short
git branch --show-current
git log -5 --oneline
git fetch origin
git rev-parse HEAD origin/review/0.8.0-rc-premerge-bug-review
```

Fetching is not reconciliation: inspect any difference before switching, rebasing or restoring files. A download's bundled documentation reflects its source commit, not later branch documentation.

## Toolchain and first build

Use **Node.js 24+** and npm with the checked-in lockfile. The supported source workflow uses Linux/WSL, matching the Ubuntu Actions runner. The install helper requires **Bash, Linux `flock`, GNU `timeout`, `curl`, `sha256sum` and `/proc` process inspection**. Packaging needs **Python 3**. Running a compiled package on Windows is a separate supported path and does not require these build tools.

From the repository root:

```sh
npm run install:ci
npm run check:kairo
npm run build
npm run test:kairo
```

`install:ci` calls [install-ci.sh](../scripts/install-ci.sh) through the project environment wrapper. It verifies the locked toolchain, uses a writable project-local cache and runs one bounded `npm ci`. Let it finish before building; do not run overlapping installs or bypass a failed integrity check. Defaults are an eight-minute install limit and a three-minute build limit, with termination grace periods. The wrapper owns temporary build-tool environment settings; do not use its temporary home as Kairo's real user-data home.

`build` runs the locked Vinext compiler through [build-verified.sh](../scripts/build-verified.sh), producing `dist/client`. The standalone runtime serves that compiled frontend. Rebuild after UI changes before using the normal launcher or compiled-browser tests.

`npm run dev` is the retained Vite/Vinext development scaffold. It does not launch the standalone Core/SSO/Stream supervisor and is not a substitute for testing the real local application. The retained Cloudflare/Drizzle files are build scaffolding; **`npm run db:generate` does not generate Kairo's SQLite runtime migrations**. See [Persistence](PERSISTENCE.md).

## Run locally without touching a real profile

After building, use the supervisor entrypoint (`npm start` or `npm run start:local`). The latter opens a browser. A development instance should use a separate data directory and distinct ports from a real running installation:

```sh
KAIRO_DEV_DATA="$(mktemp -d /tmp/kairo-dev.XXXXXX)"
KAIRO_DATA_DIR="$KAIRO_DEV_DATA" KAIRO_PORT=4480 KAIRO_STREAM_PORT=4481 npm start
```

This creates a fresh temporary data directory outside the repository and listens only on loopback. Keep its path if you need to return to that test profile; a new `mktemp` call creates another empty profile. Keep real profiles and exports outside source/package trees. No credentials are required for public/fixture workflows. If you choose to sign into EVE there, register the matching callback `http://127.0.0.1:4480/auth/eve/callback`.

Press Ctrl+C and allow accepted work to drain. Use `server/start.mjs`, not `server/index.mjs`, for normal operation: the supervisor owns the runtime lease and managed dataset activation/rollback. Direct `startKairo(...)` is an integration seam used by tests and does not provide the full managed restart lifecycle.

## Choose meaningful verification

| Change | Verification |
| --- | --- |
| Documentation only | Check local paths and heading anchors, exact commands/payloads against their owners, version/release claims and example syntax. Confirm no unintended application/evidence changes. |
| Isolated behaviour | Owning Node tests, meaningful outputs and boundary/failure controls. |
| Persistence/service/API | Real SQLite/service or HTTP integration, ownership, invalid input, stale/retry and shutdown/recovery boundaries. |
| Frontend/interaction | Fresh compiled output and affected behaviour in **Chrome and Firefox**, including relevant desktop/narrow widths, loading, navigation and late-response recovery. |
| Packaging/runtime/datasets | Fresh build/package, extraction, source identity and tests run inside the extracted package without source dependencies. |

Run a focused owner suite first, for example:

```sh
node --test tests/kairo/runtime-supervisor.test.mjs
```

The full runtime command is `npm run test:kairo` (`npm test` is currently the same command), which runs `tests/kairo/*.test.mjs` with Node's test runner. Build first for controls that inspect compiled assets. `npm run test:scaffold` runs a fresh build and `tests/*.test.mjs`; it is a separate scaffold check, not a replacement for the runtime or browser gates. `npm run lint` is available but is not a substitute for the defined acceptance workflow.

For an actual bug, demonstrate failure on the pre-fix owner and success after the fix with healthy controls. Independently review the correction and affected request/query/storage bounds. A total passing count does not establish a particular fix. Do not introduce speculative refactors or in-product repair notices during documentation work.

### Browser checks

[Test-build workflow](../.github/workflows/test-build.yml) is the exact runnable inventory. It installs Firefox through isolated Playwright tooling, uses Chrome, runs the blocking compiled checks and retains results/screenshots as Actions artifacts. It covers the named regression flows, not every visual state or live provider combination.

For a representative cross-browser runner after a fresh build, with browser tooling installed separately:

```sh
KAIRO_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
KAIRO_CHROME_PATH=/usr/bin/google-chrome \
KAIRO_BROWSER_OUTPUT=/tmp/kairo-navigation-check \
node tests/premerge-pass4-navigation-ui.mjs
```

The Playwright path is a placeholder for an actual installation. The workflow pins its tooling version and installs the matching Firefox binary; do not add it to application dependencies just to run a harness. Browser execution also requires an environment that permits local listeners/browser processes. If that capability is unavailable, use the authorised hosted gates and report that limitation; do not claim local browser execution.

[Validation](VALIDATION.md#browser-compatibility) describes the required browser scope and historical build90 coverage; the [current review handoff](REVIEW-BUILD.md) records Build91's actual results and counts. Windows DPAPI, live EVE SSO/permissions, actual OBS scene/audio output and extended play remain environment-specific checks.

## Package and verify

Use a clean source checkout at the intended commit with a fresh build. The packager includes source/docs/tests broadly, not a handpicked application allowlist; inspect the tree for private exports, screenshots and ad hoc files first. Do not package a working profile or arbitrary notes. [package-release.py](../scripts/package-release.py) excludes dependencies, Git/Actions directories, performance output/harnesses, known credentials and database/log/archive suffixes, but filename filtering is not a privacy audit.

Run from the repository root:

```sh
npm run check:kairo
npm run build
npm run test:kairo
python3 scripts/package-release.py ../Kairo-review.zip
python3 -m zipfile -t ../Kairo-review.zip
python3 -m zipfile -e ../Kairo-review.zip ../kairo-package-check
```

Use an empty extraction destination. Then, in the extracted runtime:

```sh
cd ../kairo-package-check/Kairo
npm run test:kairo
```

The compiled package needs Node 24+, not `node_modules`. Record SHA256, ZIP CRC, packaged source identity and compiled asset presence; compare source files to the exact tested commit, not a later worktree. A local package is not an independently downloaded Actions artifact. Do not relabel it as the hosted download.

## Review and release procedure

1. Work on a feature/review branch and maintain the owning guide and evidence ledger.
2. Bank scoped checkpoints. Documentation-only commits may skip the expensive build workflow; state the checks actually run and keep the last accepted application identity explicit.
3. For application changes, complete the relevant owner/type/build gates and affected Chrome/Firefox checks. Preserve failures and partial runs with their original identities.
4. Use the **Kairo test build** workflow for a review package. It runs on non-main pushes or manual dispatch, packages only after blocking browser gates, extracts and tests the runtime, then uploads the ZIP.
5. Independently download and verify the intended artifact before calling it an accepted package. Keep PR draft and provide the exact successful download for user review.
6. Merge/version/release actions require Bun's separate explicit approval. Do not infer that approval from closed bugs, finished documentation or a successful build.

The existing [release workflow](../.github/workflows/release.yml) is restricted to `main`; it runs on a `package.json` change there or a manual dispatch. It requires a stable `x.y.z` version, matching package/lock versions and a matching changelog section, then builds, packages, tests the extracted runtime and publishes a GitHub release with a checksum. **It does not itself repeat the feature-branch browser suite.** Review acceptance must already cover the exact proposed application changes; the workflow is not approval to skip those gates. The current `0.8.0-rc.17` intentionally fails its stable-version requirement.

Preserve the completed [performance evidence](history/README.md) and bounded ownership contracts. Do not restart historical benchmark/refactor work merely to validate prose.

## Documentation maintenance

Keep one home per topic using the [documentation index](README.md). Use relative links for current files, immutable commit links for historical evidence and current UI labels in user steps. Keep technical internals and repair history out of user workflows unless they explain a meaningful limitation or action. Do not add screenshots from mocks as though they were the current application.

When a change moves a heading, check incoming fragment links. When a command is illustrative, mark its placeholders and prerequisites. Preserve the completed bug ledger and raw evidence; append a separate documentation verification record instead of rewriting historical test results.
