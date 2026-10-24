# Dependency and Node security disposition

Status: correction independently accepted by `docs_tests`; banking and combined candidate gates are tracked by the coordinator.

The [unchanged-lock baseline](evidence/dependency-audit-baseline.json) reports
32 affected package entries (1 critical, 24 high, 6 moderate, 1 low), resolving
to 81 unique advisory URLs across 19 actual advisory-owning packages. Inherited
findings are not separate reproduced Kairo defects. The registry snapshot omits
newer upstream RSC advisories, so it is not a complete current security inventory.

## Bounded corrections

| Owner and exposure | Correction and primary evidence |
| --- | --- |
| Vinext development/Worker scaffold accepts RSC transport requests through its server decoder, even without authored Server Actions. The standalone server does not execute this decoder. | React, ReactDOM and `react-server-dom-webpack` **19.2.6 → 19.2.9** address the [October RCE](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3) and [DoS](https://github.com/react/react/security/advisories/GHSA-h3gv-c5rc-p453). |
| `@vitejs/plugin-rsc` independently vendors RSC; changing the direct package alone leaves that copy affected. | **0.5.26 → 0.5.38**, the [upstream patched version](https://github.com/vitejs/vite-plugin-react/security/advisories/GHSA-59pf-q495-3c99). The version-specific license supplement uses the exact release-tag license, whose text is unchanged. |
| Vite owns the source dev server/compiler. Its Windows filesystem advisories require conditions beyond Kairo's loopback/Linux source defaults. | **8.0.13 → 8.0.16**, the existing-minor [alternate-path bypass patch](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff), also outside the audit's editor/UNC affected range. |
| The standalone OBS client uses Node's built-in Undici WebSocket. A crafted loopback peer reproduced the affected runtime's process failure. This is separate from npm's installed Undici package. | Require **Node 24.21.0 or newer with a patched embedded Undici**; server startup and both Linux/Windows launchers enforce the supported-runtime predicate. See the independent [before/fixed runtime receipt](evidence/runtime-version-verification.json). |

Vinext 0.0.50's existing peer ranges accept the chosen package versions. The
lock change is limited to these five direct dependencies and their required
transitive resolution. Original libc selection constraints were preserved on
40 unchanged optional packages; no arbitrary
major migration or `npm audit fix` was used. The application version is unchanged
by this correction. Runtime guard details and prerequisites belong to the
existing development/launch documentation, not a second user guide here.

## Remaining advisory ownership

| Surface | Disposition |
| --- | --- |
| Distributed standalone runtime | Imports Node builtins and local modules, not Next, Vite, Cloudflare or the RSC server. `node_modules`, Worker/SSR output and performance tooling are excluded from the ZIP. The Node/Undici defect above was evaluated separately. |
| Compiled browser | The baseline license graph includes RSC and Vinext client code. The server returns fixed compiled `.rsc` bytes; it does not run server functions. A package name in a client chunk does not establish reachability of its server-decoder advisory. |
| Next 16.2.6 | Retained build/type/scaffold dependency, absent from the standalone import path and client license graph. The [Windows router](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36), [AVIF optimizer](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) and [ImageResponse](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j) critical findings concern owners Kairo's standalone launch does not invoke. Reassess before changing hosting architecture. |
| Sharp/image-size, Cloudflare/Miniflare/Wrangler, installed Undici/ws; Babel, PostCSS/maps, glob/brace parsers, ESLint/Drizzle, Browserslist, fflate/nanoid/fast-uri | Build, source-development or retained scaffold dependencies. They do not process live EVE/OBS/market data in the standalone server. Remaining findings are maintenance obligations with those input assumptions, not a blanket claim that every npm severity is a shipped exploit. Broad major upgrades are deferred. |

## Verification

The [verification receipt](evidence/dependency-verification.json) binds the
final lockfile to a clean `install:ci` under verified Node 24.21.0/npm 11.19.0,
a fresh build, **16/16** packaging controls and the regenerated **85-entry**
license inventory. All six supplemental versions and text digests match; the
same four generated empty entries are covered. The source type check passed,
and the installed plugin's separate RSC copy is patched **19.3.1**. `docs_tests`
independently accepted the lock scope, source ownership, installation, build
and notices.

The [after-scan](evidence/dependency-audit-after.json) reports **28 package
entries** (1 critical, 20 high, 6 moderate, 1 low; 75 unique advisory URLs),
down from 32. RSC, Vite, nanoid and source-map-js leave the affected-package
list. Remaining Next/tool findings retain the ownership limits above; this is
not a zero-advisory claim. The complete browser/runtime and extracted-package
gates, exact final source/artifact identity and release decision remain in the
combined candidate receipt. Local patch verification is not release acceptance.
