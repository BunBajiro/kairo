# Final documentation and package preparation

Preparation only, read against application source `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`. No application file changed and no build, test, package or benchmark ran. Independent Actions/report/package closure must precede review promotion. Keep the existing API guides; no second API document is needed.

## Exact documentation changes

| File / existing passage | Narrow change |
|---|---|
| `docs/VALIDATION.md`, “What is verified at this checkpoint”, paragraph beginning “Application code checkpoint a7b1bf97…” | Replace the old current-status paragraph with the source70 wording below; retain old build #63 only as historical evidence if useful. |
| Same section, “Remaining closure includes source-bound component decisions…” | Remove the outdated implication that component decisions remain open: all 46 are closed. Name only remaining Actions/report/package and user-review boundaries. |
| `docs/VALIDATION.md`, opening internal-work-in-progress paragraph | Keep the review-withheld status until actual closure. At clean handoff replace with the conditional candidate wording below, naming exact source/build/download and report links. PR10 remains withdrawn; never present it as the new review candidate. |
| `docs/VALIDATION.md`, relative `../.github/workflows/test-build.yml` link | Replace with a GitHub URL pinned to the final application commit. `.github` is intentionally excluded from the ZIP, so the current relative link breaks in the extracted package. |
| `README.md`, bold “0.8.0 development…still under validation…” | Change only at clean handoff to the candidate wording below. Keep installation guidance and the requirement to use the designated build. Add the exact successful feature-build artifact link to the handoff/Validation record. |
| `CHANGELOG.md`, RC17 heading and first bullet saying review “remains withheld…” | At clean handoff use “0.8.0-rc.17 — Optimisation and refactoring review candidate”; replace the withheld sentence with “The accepted changes and retained performance trade-offs are documented in the final comparison report.” Link the actual finished report. Keep the substantive feature bullets. |
| `CHANGELOG.md`, second empty `## Unreleased` immediately above 0.7.3 | Remove that duplicate empty heading; keep the populated top Unreleased section. Do not create a stable 0.8.0 release/date before user approval. |
| `docs/README.md`, opening and final “open findings” phrase | Prefer durable wording: “These are the maintained user and developer entry points. See Validation for the exact candidate and review status.” Change “measurements and open findings” to “measurements, decisions and release acceptance”. |

**Source70 wording supported now:**

> Application source `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789` passed 1,004 runtime tests, type checks and a fresh build, plus 89 compiled integration controls. All 46 refactoring and optimisation component decisions have supported dispositions. The final local collections and their independent reviews retain both improvements and adverse observations. Independent Actions, the final three-version report and clean extracted-package acceptance determine readiness for user review; an ordinary test build alone is insufficient.

Use the “final local collections” sentence after the updater audit is banked. Link the source70 correctness receipt and the single current ledger/report instead of copying every measurement into product docs. Source70's successful ordinary test-build #65 may be identified accurately as a separate check, not the complete performance acceptance.

**Conditional wording only after all declared automated/package acceptance succeeds:**

> This 0.8.0 candidate has completed the declared automated acceptance and is ready for user review. The exact source, verified package and performance report are linked below. It has not been merged or released; actual EVE, Windows and OBS checks remain part of user review.

Below it, record actual final application commit, measured runtime source70 relationship, tested ZIP hash, successful feature-build run/download, three independent acceptance run IDs, and final report permalink. Do not commit placeholders or claim an unobserved pass. Keep performance-evidence rules and real-environment limits unchanged. The API reference's **initial** a7 audit date/receipt is historical provenance, not an erroneous current acceptance claim; do not relabel that receipt as source70.

## Source and version boundary

Use the application feature branch, never the perf analysis branch or internal instrumented bundle. Source70 currently has `0.8.0-rc.17` in `package.json`, lockfile top-level and lockfile root package. Keeping that reviewed RC label is sufficient for a clean RC17; stable `0.8.0` promotion belongs after user review. Any intentional version change must keep all three values equal.

Commit the documentation/version preparation before collecting its final package identity. Preserve the exact diff from measured source70. Documentation-only changes need source/package/link verification, not another numerical benchmark; runtime changes require the affected acceptance gates. `package-release.py` checks 54 required paths, including both API guides, user guide, retained notices and runtime data. It excludes `.github`, performance fixtures/traces, dependencies and local credential/database files. It does **not** independently exclude an arbitrary `analysis/` directory, which is another reason packaging must use the clean application checkout.

## Exact package verification commands

The required feature-branch `test-build.yml` already performs locked install, type check, build, Session/Universe/dataset browser checks, packaging, extraction and extracted `npm run test:kairo`, then uploads the ZIP. Use that actual successful artifact for user review. The sequence below is the reproducible local package check when needed; it is not a request to duplicate a successful identical package gate or rerun benchmarks. Select the committed final application checkout; the path shown is the current application workspace.

```bash
set -euo pipefail
export KAIRO_RC_SOURCE=/workspace/scratch/a2f3334402fc/kairo-rc17-c954-continuation
export KAIRO_RC_WORK="$(mktemp -d /tmp/kairo-clean-rc17-XXXXXX)"
export KAIRO_RC_SHA="$(git -C "$KAIRO_RC_SOURCE" rev-parse HEAD)"
cd "$KAIRO_RC_SOURCE"
test -z "$(git status --porcelain --untracked-files=all)"
test -z "$(git ls-files analysis)"
printf '%s\n' "$KAIRO_RC_SHA" > "$KAIRO_RC_WORK/source-commit.txt"
node --version > "$KAIRO_RC_WORK/node-version.txt"
npm run install:ci 2>&1 | tee "$KAIRO_RC_WORK/install.log"
npm run check:kairo 2>&1 | tee "$KAIRO_RC_WORK/types.log"
npm run build 2>&1 | tee "$KAIRO_RC_WORK/build.log"
node /workspace/scratch/a2f3334402fc/kairo-analysis-restored/analysis/rc17/harness/source-manifest.mjs capture "$KAIRO_RC_SOURCE" "$KAIRO_RC_WORK/source.json" "$KAIRO_RC_SHA"
python3 scripts/package-release.py "$KAIRO_RC_WORK/Kairo-review.zip" | tee "$KAIRO_RC_WORK/package-receipt.json"
python3 -m zipfile -e "$KAIRO_RC_WORK/Kairo-review.zip" "$KAIRO_RC_WORK/extracted"
```

Before executing tests, compare every ZIP member with both the source and extracted file and retain the inventory outside the application/package:

```bash
python3 - <<'PYCODE'
from pathlib import Path, PurePosixPath
import hashlib, json, os, zipfile
source = Path(os.environ['KAIRO_RC_SOURCE'])
work = Path(os.environ['KAIRO_RC_WORK'])
sha = lambda value: hashlib.sha256(value).hexdigest()
rows = []
with zipfile.ZipFile(work/'Kairo-review.zip') as archive:
    assert archive.testzip() is None
    names = archive.namelist()
    assert len(names) == len(set(names))
    for item in archive.infolist():
        path = PurePosixPath(item.filename)
        assert path.parts[0] == 'Kairo' and '..' not in path.parts and not path.is_absolute()
        relative = Path(*path.parts[1:])
        assert relative.parts and relative.parts[0] != 'analysis'
        data = archive.read(item)
        assert data == (source/relative).read_bytes()
        assert data == (work/'extracted'/Path(*path.parts)).read_bytes()
        rows.append({'path':str(relative), 'bytes':len(data), 'sha256':sha(data)})
package = json.loads((work/'extracted/Kairo/package.json').read_text())
lock = json.loads((work/'extracted/Kairo/package-lock.json').read_text())
assert package['version'] == lock['version'] == lock['packages']['']['version']
assert not (work/'extracted/Kairo/node_modules').exists()
(work/'package-inventory.json').write_text(json.dumps({'sourceCommit':os.environ['KAIRO_RC_SHA'], 'version':package['version'], 'zipSha256':sha((work/'Kairo-review.zip').read_bytes()), 'files':rows}, indent=2)+'\n')
PYCODE
cd "$KAIRO_RC_WORK/extracted/Kairo"
npm run test:kairo 2>&1 | tee "$KAIRO_RC_WORK/extracted-tests.log"
node /workspace/scratch/a2f3334402fc/kairo-analysis-restored/analysis/rc17/harness/source-manifest.mjs verify "$KAIRO_RC_WORK/source.json"
sha256sum "$KAIRO_RC_WORK/Kairo-review.zip" > "$KAIRO_RC_WORK/SHA256SUMS.txt"
```

Retain process exit outcomes, build/package/source records and ZIP checksum in the analysis bank; verify downloads against the actual CI artifact digest and extracted inventory. Confirm changed relative documentation links resolve in the extracted package and required guides/notices remain. The existing packager excludes credential/database files and asserts forbidden performance paths plus 54 required files; do not substitute the internal comparison archive for this check. Any extraction test failure remains a release blocker, not a reason to relabel an older package as current.

## Handoff boundary

Provide the exact verified clean test-build link, final three-way report and retained first-use/large-case costs. State that internal API development guidance is already in `docs/INTERNAL-API.md`, with HTTP/events in `docs/API-REFERENCE.md`; explain those entry points without another copy. User checks cover actual EVE scopes/structure permissions, Windows DPAPI, OBS scenes/audio/protection and normal-session use. Keep PR10 withdrawn and do not merge, update main or dispatch the stable `release.yml`: that workflow expects a stable semver/changelog on main and ultimately publishes the release. Those actions follow explicit approval after review.
