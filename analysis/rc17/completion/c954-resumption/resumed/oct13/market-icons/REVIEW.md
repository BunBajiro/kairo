# Market item icons — user-review follow-up

13 October 2026. **R-UI1 CLOSED — Bun confirmed build #69 works in his Firefox retest at 15:36 BST.** This closes the user-reported category-first issue. Automated evidence demonstrates the image-recovery correction; the exact original category-first mechanism remains unproven. The 46 prior refactor decisions remain closed. Historical investigation notes below preserve the earlier uncertainty and test outcomes.

Bun reports that all market item icons are absent when opening a market category directly after restart. Clicking **All items** causes icons to load. The same browser can open the direct CCP type-34 icon URL successfully. Treat category-first versus All-items navigation as the required reproduction; the initial broad missing-icon description has been narrowed by the user.

The shared `ItemName` component requests `https://images.evetech.net/types/${id}/icon?size=32`; dashboard CSP allows that host and market consumers use the expected type IDs. A direct workspace HTTP request also returned HTTP 200 image/png without a redirect. The component predates this refactor. Its image has lazy loading, width/height attributes and shrinkable flex layout. Whether category-first layout prevents loading is under investigation. A separate static defect hides an image on error without restoring visibility on a later successful load; it is not yet established as the reported cause.

A focused compiled browser check is banked at application diagnostic commit `d605626478edb4ae16010ea248945036167de1c6`, branch `fix/rc17-market-icons-review`. It preserves runtime source from package0149 and adds only `tests/market-icons-ui.mjs` plus its Actions step/artifact. [Build 67](https://github.com/BunBajiro/kairo/actions/runs/38409913265) is the completed initial Chrome diagnostic run. It tests fresh category-first/leaf/All-items/back-to-leaf navigation, decoded image geometry and other shared market surfaces using synthetic SQLite and deterministic image responses. The test is not a live provider availability or performance benchmark.

Local Chrome could not start because socket creation returned EPERM; the configured permission policy rejected escalation. No local browser reproduction or pass is claimed. The baseline failure receipt contains zero page/image checks. GitHub Actions is the available browser execution environment.

Build66 remains the previously tested review package, now with this reported issue. No main merge, stable release or user approval has occurred. A fix and updated tested download will be designated only after the focused browser result and normal package workflow. The completed three-version report remains pinned to its measured runtime and will not be relabelled as measurements of this follow-up.

## Initial Chrome result

Build67/source d605626 passed installation, types and build. Category-first/leaf/All-items/back-to-leaf, Browse/detail/Hub Report/Import cards and plans all decoded and displayed at tested sizes. It did **not** reproduce the user's initial missing-category icons. It failed the separate forced-404 then successful-load check: the image had naturalWidth32 and dimensions30×30 but visibility remained hidden. The failure is preserved in [baseline-job.log](baseline-job.log); artifact11821465364 SHA-256 `4221b784f1a7af343ed058246aca8cdbdcce6061e48efab6922eed5e50b636e5` holds screenshots/raw failure. This is evidence of the recovery defect, not proof of the user-reported initial cause.

Bun then confirmed **Firefox** is the affected browser. The following bounded check targeted a fresh leaf-category navigation before All items.

## Completed correction and validation

Source `37a0e79b7d9df4e980615e7f3711e6e5f2884d12`, tree `08b2c2b9f64986a1ee260b0075ccab93fbd599f4`, is banked on `refactor/rc17-c954-continuation-v0.8.0`.

- `app/globals.css` reserves 30×30 icon space with flex-shrink:0 and object-fit:contain. The later Import card rule still supplies 38×38. Baseline Chrome could shrink unloaded icons to 28.71875 px, but no zero-size/category failure was observed.
- `components/kairo/ui.tsx:ItemName` clears its owned visibility state on successful load and keys the image by type ID. The existing detail parent is already keyed by selected ID; detail-component reuse is not established as the cause.
- Native lazy loading remains. No polling, retry timer, new provider path or application dependency was introduced. Isolated Firefox tooling and compiled browser regression checks run in the normal Actions workflow.

[Build 68](https://github.com/BunBajiro/kairo/actions/runs/38411248795), diagnostic8dd31a, passed Firefox153's three desktop 1600×1100 stages: direct leaf before All items, All items, then leaf. Chrome repeated the recovery failure; this job remains failed overall. [Original log](firefox-baseline-job.log).

[Build 69](https://github.com/BunBajiro/kairo/actions/runs/38411934641), corrected37a, passed Firefox's three desktop stages and all 19 Chrome groups. Held initial icons reserve30×30 before decode; decoded images are visible. Import cards remain 38×38. Same-element404→200 recovery is visible. Standard session, Universe/replay and dataset browser gates passed, followed by **all 1,004 extracted-runtime tests**. [Original log](build69-job.log), [artifact metadata](build69-artifacts.json).

Chrome covers Browse/detail/report/import cards at 1600/1024/390 and import plans at 1600/390. Firefox coverage is desktop only. These checks use the real compiled app, synthetic SQLite and intercepted SVG responses, not Bun's installed database, live PNG/cache/extension conditions or Windows Firefox environment. The [independent review](INDEPENDENT-REVIEW.md) verified JSON measurements, artifact identities and representative screenshots. The recovery correction is demonstrated; neither recovery nor geometry is a proven explanation of the original category-first symptom.

Original baseline Chrome/Firefox and corrected Chrome/Firefox ZIPs are preserved in [the raw bank](bank/RAW-MANIFEST.json), with file hashes. Restore using `../../oct8/restore-evidence.py bank/RAW-MANIFEST.json NEW_DESTINATION` from this directory. The build68 duplicate Chrome ZIP was not downloaded; its repeated failure remains in the full job log.

## Tested package and user-confirmed closure

[Download build69](https://github.com/BunBajiro/kairo/actions/runs/38411934641/artifacts/11821673609): source37a, version 0.8.0-rc.17, 25,949,022 bytes, SHA256 `09d905946f1dbb8fcc412e16549c10bea5cc05aa923ecab2c03d6f4bf54517f6`. Hosted download expires 12 November 2026. The downloaded original ZIP passed CRC; all 487 packaged source files match committed37a exactly, with 20 compiled assets inventoried. [Package audit](PACKAGE-AUDIT.json). No rebuild/repack was substituted. This supersedes build66 for review.

Bun responded to the requested category-first Firefox retest of build #69: **“Yup! That works!”** on 13 October 2026 at 15:36 BST. R-UI1 is closed on this user observation together with the passing automated correction checks. No additional reproduction or causal certainty is inferred. Overall candidate approval and merge/release authorization remain separate.

The completed three-version performance report remains pinned to measured70; these correctness checks are not new performance measurements. No broader optimization retry is queued. PR11 stays draft pending actual user review and subsequent approval. PR10 remains withdrawn; main and stable release are unchanged.

## Future browser requirement

Bun also required future builds to work in Chrome and Firefox. Documentation commit `8a5359d9d35b556d5b756a7f2e03721c918fd390` changes only `AGENTS.md` and `docs/VALIDATION.md`, requiring both blocking browser gates and affected-flow checks in both engines for future UI changes. Existing Firefox coverage is desktop market navigation; Chrome has broader market, Session, Universe and dataset coverage. Full suite parity is not claimed. Independent workflow review confirmed failures in either browser prevent packaging and build upload; `always()` only retains diagnostic artifacts.

The documentation-only commit does not change runtime, dependencies, build inputs or tests. CI is skipped for that documentation checkpoint; the exact successful user-tested build #69/source37a remains the designated package. There is no replacement build or performance rerun.
