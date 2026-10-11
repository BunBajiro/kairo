# Private recovery workflow review

11 October 2026. Independent static review of `internal-recovery.yml`, SHA256
`c24ef382a584a6bfedff61afbbd6ccc715ebbb74c09e0cb49756685b4f6d912c`.

No inspected blocker to the authorized recovery export. The workflow is limited
to the analysis branch by both its push trigger and job condition, requests only
`contents: read`, and checks out with `persist-credentials: false`. It validates
the recorded checkpoints and complete history, exports a Git bundle and a
manifest, and uploads those files as an internal Actions artifact. It does not
run application code, issue releases, or write repository branches.

The exported bundle contains repository objects and references, not checkout
configuration, hooks, environment variables, or the worktree. The manifest
contains repository/run identifiers, references, and the bundle size/hash. No
credential-bearing configuration is selected for the archive. Full branch
history is recovery material and does not select excluded build #55 as the
candidate. Runtime success and the returned bundle hash remain for the
coordinator to verify; this static review is not a release or performance gate.

## Authorized branch fallback after artifact storage quota failure

The first export run reached the bundle step but failed artifact upload because
GitHub Actions storage quota was exhausted. The separately reviewed replacement
workflow has SHA256
`900195481a052c7db37102be5691b918471e935d11a5d6d9e0ee340eaac5fa36`.
The earlier read-only permissions description applies only to revision 1.

The replacement intentionally requests `contents: write` and retains checkout
authentication so it can create the new, private recovery-only branch
`recovery/rc17-workspace-20261011`. It builds and verifies the bundle before
creating that orphan branch, checks that the remote branch does not exist,
removes the inherited tracked files, stages only `repository.bundle` and
`manifest.json`, and pushes without force to that exact new reference. Existing
analysis/application/main references are not pushed. A race that creates an
unrelated branch would cause the non-force push to fail rather than overwrite
it. The bundle still contains only Git objects/references, not checkout
credentials or configuration. No release publication or application execution
is added. No inspected blocker remains for this authorized fallback; the
coordinator must verify its actual success and downloaded bundle hash.
