# Wanderer wormhole reference data

Kairo derives `server/data/universe-wormholes.json` from the following MIT-licensed files in [wanderer-industries/wanderer](https://github.com/wanderer-industries/wanderer/tree/6c5d43936e88f1d2acabc4d45fc82cbb67d4a08a/priv/repo/data), revision `6c5d43936e88f1d2acabc4d45fc82cbb67d4a08a`:

- `wormholeSystems.json`: per-system static and wandering types.
- `wormholes.json`: nominal hole types, destinations, mass and lifetime references.
- `wormholeClasses.json`: readable classes and special-system titles.
- `effects.json`: six wormhole modifier tables.
- `shatteredConstellations.json`: shattered classification.

The normalization script verifies the SHA-256 of each pinned input. Rebuild with:

```sh
python scripts/build-universe-wormholes.py /path/to/wanderer/priv/repo/data
```

This is an offline reference: 2,604 J-space systems, 100 hole types and six environmental effects. It does not create discovered connections, reveal current endpoints or signatures, measure remaining mass, establish expiry times or guarantee passage. A static describes a respawning destination class. Null values remain unknown, including K162 destination/mass/lifetime and the five Drifter types' unreported mass regeneration. Source mass-regeneration values are in kilograms; their upstream table does not specify a period, so Kairo does not label them per-hour or simulate regeneration from them.

Official CCP SDE system IDs, names, classes and environmental-effect identities take precedence. Kairo preserves newer official names for the five Drifter systems. The effect's strength comes from its official effect record, which gives C13 systems C6-strength effects and Drifter systems C2-strength effects. The reference loader does not change coordinates, gates, jump eligibility or static data provenance.

The normalization records these upstream corrections:

| Source issue | Kairo normalization | Evidence |
| --- | --- | --- |
| J005926 is labelled Pulsar | Red Giant, strength 1 | Bundled CCP SDE `mapSolarSystems` effect |
| J010569 is labelled Red Giant | Wolf-Rayet Star, strength 1 | Bundled CCP SDE `mapSolarSystems` effect |
| Shattered list omits 15 C13 systems and Thera | All 25 C13 systems and Thera are shattered | CCP's [Thera and the Shattered Wormholes](https://www.eveonline.com/news/view/thera-and-the-shattered-wormholes) |
| Black Hole's C6 ship-velocity cell is `+100` | `+100%` | CCP's [Into the Known Unknowns](https://www.eveonline.com/news/view/into-the-known-unknowns) effect table |

The result contains 106 shattered systems, including the five Drifter systems already identified by the upstream list. `frigateOnly` is the conventional C13 classification field; the interface calls these **small-ship connections** because actual passage depends on a ship's mass, not just its hull category. No ship compatibility is inferred solely from this flag.

CCP's [static-data guide](https://developers.eveonline.com/docs/guides/staticdata/) describes the authoritative class and effect fields. CCP's game-data intellectual-property notice remains applicable; see [UNIVERSE-DATA.md](UNIVERSE-DATA.md). Kairo's graph rendering, interaction, local storage and navigation code are independently implemented.

## Upstream license

MIT License

Copyright (c) 2024 Wanderer Industries

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
