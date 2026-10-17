# Third-party notices

## Compiled frontend dependencies

Every fresh frontend build emits `dist/client/.vite/license.md` from the exact
modules bundled by the locked Vite toolchain. The distribution includes that file
with each dependency's name, version, license identifier and available license
text. The [frontend license supplement](../vendor/frontend-license-supplement.json)
retains full upstream notices for four published packages that omit their license
files, the two imported CSS packages, and Victory's vendored D3 components. Its
records identify locked versions, retrieval sources and text digests. Packaging
rejects a missing/empty generated inventory, an entry without full text or its
reviewed supplement, and a supplemental version/content mismatch.

This generated inventory belongs
to its compiled build; regenerate it with `npm run build` after dependency or
frontend changes.

Vendored source assets retain their own notices:

- `server/vendor/seek-bzip/LICENSE` covers the local bzip2 decoder.
- `vendor/shadcn-tailwind-4.13.0.LICENSE.md` covers the vendored stylesheet.

The data/reference attributions below are separate from the generated client
inventory. Package metadata and third-party notices do not choose a license for
Kairo's first-party source.

## Slazanger’s EVE Map Tool (SMT)

Universe’s operational feature design and compatible Ansiblex interchange were studied against [SMT](https://github.com/Slazanger/SMT), commit `6b3b4c6a213a349549ef737c89584fc3f048033b`. Attributed static landmark, ice and historical invasion data adapted from that repository retain their original provenance. Kairo uses its own application, storage, service and rendering implementation.

MIT License

Copyright (c) 2023 Slazanger

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## EVE universe data and public observations

Official EVE static data and ESI provenance are documented in [UNIVERSE-DATA.md](UNIVERSE-DATA.md). The 358 A0 star reference markers are derived from existing official SDE star type records (build 3503375), not from SMT, and retain their separate source attribution. EVE-Scout observations and wormhole reports remain attributed to EVE-Scout; public combat records remain attributed to zKillboard and ESI. Sources have independent coverage, expiry and availability.

## Wanderer Industries

The J-Space atlas includes normalized wormhole reference data from [Wanderer](https://github.com/wanderer-industries/wanderer), revision `6c5d43936e88f1d2acabc4d45fc82cbb67d4a08a`. The [Wanderer reference notice](WANDERER-REFERENCE-NOTICE.md) contains the complete MIT license, adapted-file inventory, deterministic rebuild instructions and documented corrections against CCP sources. The [destination catalogue notice](WANDERER-DESTINATIONS-NOTICE.md) covers the pinned loot-sale, security-status service and trade-hub reference data and its reproducible generator.
