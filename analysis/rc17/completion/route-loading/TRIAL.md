# F4 isolated route-delivery trial

7 October 2026. Trial only; no active RC17 source change and no readiness claim. PR #10 remains withdrawn.

## Source and chosen boundaries

Both `kairo-rc17-route-lazy-baseline` and `kairo-rc17-route-lazy-trial` start at `a27d36c602435ce220452b5d45b0109d30efa533`. The trial edits only `components/kairo/dashboard.tsx` and adds `components/kairo/deferred-page.tsx`.

Atlas/Maps, Universe settings, Markets, Studio and OPSEC become module-level React lazy components. OPSEC imports its controls directly so opening protection settings does not first load the editor. A Suspense boundary shows the page name during first load, while the navigation shell remains usable. A page error boundary provides Retry page. Retry reloads the current URL/hash, clearing the browser's failed module-import cache; an ordinary successful import never reloads. A failed first page import has no mounted page draft to discard. Existing route-change unmount behavior is preserved. Lazy component identities are stable across context/state updates, so a mounted unsaved Studio draft is retained.

Overview retains its existing operations module and Recharts dependency because the initial populated wallet chart uses them. No blanket chart-library replacement or speculative split of every component is included. The trial measures whether the large noninitial page graphs justify boundaries; remaining shared entry cost is reported rather than attributed to deferred pages.

## Matched build requirements

The roots have identical package lock SHA-256 `ee62865dfc3f03b1aca7978d205583f4d67c0c0e4a6fd489fa6c1baa0b6f78b2` and symmetric symlinks to the same installed dependency tree. Fresh build both roots with `npm run build`, sequentially after the coordinator grants the runtime slot. Do not rebuild the separate frozen `kairo-rc17-a27-baseline`; it is used by other evidence lanes.

**Current status: completed and rejected on measured navigation cost. Matched builds/type check and all 28 compiled checks pass, but first deferred navigation regresses without a demonstrated cold Overview speed benefit. See `RESULTS-20261007.md`.**

## Evidence harness

`bundle-inventory.mjs` verifies identical package/config/build-script files, inventories every emitted JS/CSS file with raw bytes, gzip level-9 bytes and SHA-256, and follows static ES imports from HTML script/modulepreload roots. This distinguishes reduced entry delivery from total output growth. Gzip values are compression potential, not a claim that the local server uses compressed transfer.

`run.mjs` takes the shared benchmark lock and executes baseline–candidate–candidate–baseline, with fresh backend and browser processes each time. The second pair reverses route order. A synthetic connected pilot has a populated Overview wallet chart and a manual goal; cold Overview execution therefore includes its real chart path. Every first navigation includes chunk fetch, initialization and page read to a visible ready condition. Raw results retain renderer task/script/layout time, wall ready time, exact requested JS assets and their raw/gzip inventory. Two observations per source are bounded comparative evidence; they do not establish a statistical confidence interval or real desktop/internet latency.

```sh
KAIRO_CHROME_PATH=/path/to/chrome node analysis/rc17/completion/route-loading/run.mjs /absolute/path/to/kairo-rc17-route-lazy-baseline /absolute/path/to/kairo-rc17-route-lazy-trial /absolute/path/to/route-loading/raw
```

Separate diagnostics run after timing: ordinary navigation does not reload; back/forward retains routing; an unsaved Studio draft survives a source update without reaching saved output; detached Atlas opens and restores; the independent browser source renders its saved fixture. Candidate-only fault injection holds then fails the Markets module request, verifies loading/navigation/error states, and retries at the same route with a fresh module map. This intentionally tests the new route boundary; the eager baseline cannot fail one page chunk independently of the whole entry.

## Original decision criterion

Adopt only with material measured entry deferral and successful compiled navigation/diagnostics, while explicitly retaining first-navigation costs and any total-JS/CSS increase. Otherwise record a measured no-change disposition. Parent will port an accepted change into the integrated RC17 source and repeat its acceptance after integration.

Final disposition: preserve the existing integrated routing. `integration-c954.patch` is an unapplied, rejected experiment artifact. See the measured result for complete byte, timing and correctness evidence.
