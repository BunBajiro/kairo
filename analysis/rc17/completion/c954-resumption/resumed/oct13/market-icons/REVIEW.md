# Market item icons — user-review follow-up

13 October 2026. **R-UI1 OPEN: diagnosis in progress.** This is a new user-review finding after the 46 refactor component decisions and automated acceptance completed. It does not reopen unrelated performance work.

Bun reports that all market item icons are absent when opening a market category directly after restart. Clicking **All items** causes icons to load. The same browser can open the direct CCP type-34 icon URL successfully. Treat category-first versus All-items navigation as the required reproduction; the initial broad missing-icon description has been narrowed by the user.

The shared `ItemName` component requests `https://images.evetech.net/types/${id}/icon?size=32`; dashboard CSP allows that host and market consumers use the expected type IDs. A direct workspace HTTP request also returned HTTP 200 image/png without a redirect. The component predates this refactor. Its image has lazy loading, width/height attributes and shrinkable flex layout. Whether category-first layout prevents loading is under investigation. A separate static defect hides an image on error without restoring visibility on a later successful load; it is not yet established as the reported cause.

A focused compiled browser check is banked at application diagnostic commit `d605626478edb4ae16010ea248945036167de1c6`, branch `fix/rc17-market-icons-review`. It preserves runtime source from package0149 and adds only `tests/market-icons-ui.mjs` plus its Actions step/artifact. [Build 67](https://github.com/BunBajiro/kairo/actions/runs/38409913265) is the completed initial Chrome diagnostic run. It tests fresh category-first/leaf/All-items/back-to-leaf navigation, decoded image geometry and other shared market surfaces using synthetic SQLite and deterministic image responses. The test is not a live provider availability or performance benchmark.

Local Chrome could not start because socket creation returned EPERM; the configured permission policy rejected escalation. No local browser reproduction or pass is claimed. The baseline failure receipt contains zero page/image checks. GitHub Actions is the available browser execution environment.

Build66 remains the previously tested review package, now with this reported issue. No main merge, stable release or user approval has occurred. A fix and updated tested download will be designated only after the focused browser result and normal package workflow. The completed three-version report remains pinned to its measured runtime and will not be relabelled as measurements of this follow-up.

## Initial Chrome result

Build67/source d605626 passed installation, types and build. Category-first/leaf/All-items/back-to-leaf, Browse/detail/Hub Report/Import cards and plans all decoded and displayed at tested sizes. It did **not** reproduce the user's initial missing-category icons. It failed the separate forced-404 then successful-load check: the image had naturalWidth32 and dimensions30×30 but visibility remained hidden. The failure is preserved in [baseline-job.log](baseline-job.log); artifact11821465364 SHA-256 `4221b784f1a7af343ed058246aca8cdbdcce6061e48efab6922eed5e50b636e5` holds screenshots/raw failure. This is evidence of the recovery defect, not proof of the user-reported initial cause.

Bun then confirmed **Firefox** is the affected browser. The next bounded check targets a fresh Firefox leaf-category navigation before All items; no application change has yet been made.
