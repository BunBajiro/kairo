# Universe static-data contract

[Documentation index](README.md) · [Universe user guide](UNIVERSE.md) · [Dataset lifecycle](DATASETS.md) · [Architecture](ARCHITECTURE.md)

This is the static-data format and importer reference for the **0.8.0 feature set, candidate `0.8.0-rc.17`**. It describes the checked-in baseline and the runtime reader, not a claim that every installation still uses the baseline build. The active official SDE can be newer after an application-managed update. Use [Datasets](DATASETS.md) for download, activation, cancellation, rollback and user controls.

## Bundled baseline and active data

The checked-in snapshot derives from CCP's official JSON Lines SDE build **3503375**, released **10 September 2026**. Its provenance is in [`server/data/universe-provenance.json`](../server/data/universe-provenance.json):

| Content | Count |
| --- | ---: |
| Systems | 8,490 |
| Known-space systems | 5,485 |
| Wormhole systems | 2,604 |
| Abyssal / other systems | 200 / 201 |
| Regions | 114 |
| Constellations | 1,184 |
| Undirected stargate links | 6,989 |
| Stargate endpoint records | 13,978 |
| Celestial bodies | 454,830 |
| NPC stations | 5,210 |

The snapshot includes spaces beyond ordinary known-space Atlas navigation. Those records do not make every system a valid jump destination or bulk-placement group.

[`dataset-paths.mjs`](../server/dataset-paths.mjs) resolves the official files for the runtime. [`universe-static.mjs`](../server/universe-static.mjs) reads the selected generation, with the bundled data as the baseline. Dataset selection and activation belong to [`datasets.mjs`](../server/datasets.mjs) and the startup supervisor; map readers do not replace an active graph in place.

Separate bundled references such as `universe-wormholes.json`, `universe-destinations.json` and `universe-points.json` are not made current by downloading a newer official SDE. Their own provenance remains meaningful. Changing sovereignty, contacts, traffic, kills and player structures come from separately timestamped observations.

## Files and lazy detail reads

| File | Purpose |
| --- | --- |
| `server/data/universe.json.gz` | Approximately 0.87 MB topology: system coordinates, gate graph, parent entities, summary counts and per-system detail index. |
| `server/data/universe-details-000.bin` through `-002.bin` | Baseline's logical detail archive, 22,854,089 bytes total, split into ordered shards of at most 8 MiB. |
| `server/data/universe-provenance.json` | Build/release metadata, original source/archive checksum, consumed-file checksums, projection, counts and detail-file integrity metadata. |

The shard count is a property of a generation, not a hard-coded requirement that future SDEs have exactly three files. Include every shard listed by that generation's manifest when updating or packaging it.

The logical archive contains one gzip member per system: stars, planets, moons, asteroid belts, secondary stars/effects, NPC stations and stargates. `getUniverseSystem(id)` reads and inflates only the indexed member. A member crossing a shard boundary is assembled from both files. Sharding does not alter logical offsets or the checksum of the concatenated archive.

`getUniverseStatic()` loads and freezes the topology once. Its map/set interfaces expose lookup and iteration without mutators. The reader retains at most 48 detailed system records; `getUniverseSystem(id, {celestials: false})` uses a lightweight immutable record. Routine location polling does not load celestial detail, and reading a map or calculating a route does not initiate an SDE download or per-system ESI fan-out.

The reader validates schema, manifest shape, sequential filenames, bounded shard/member sizes, offsets and record identity. Dataset preparation additionally verifies the complete generation before activation. Keep topology, provenance and all detail shards together; replacing a subset is not a supported update procedure.

## Coordinates, hierarchy and topology

Physical `x`, `y`, `z` remain in metres. The physical map projection uses:

```text
map_x = x / 9460000000000000
map_y = -z / 9460000000000000
```

Jump planning uses all three physical axes and Kairo's game-specific light-year constant, **9,460,000,000,000,000 metres**. The physical map is a projection, not an exact two-dimensional reach test.

Schematic `position2D` coordinates are retained as `schematic_x` and `schematic_y` and never enter physical jump calculations. [Schematic geometry](SCHEMATIC-GEOMETRY.md) defines the shared Atlas/group-placement contract and explicit fallbacks.

Celestial positions are local to a system's star and use a different local handedness. A north-up local view negates local X and local Z; stars are at the local origin. Official unique names are preserved where supplied; other names derive from the system, orbit and celestial indices. NPC station naming uses published corporation and operation names.

The importer validates parent relationships and reciprocal stargate endpoints. A dangling or non-reciprocal source gate fails import instead of becoming a traversable link. Coordinates and historical visits never infer wormhole connections. Wormhole class follows the SDE's system/constellation/region inheritance, while effect descriptions derive from the official secondary-sun effect type.

`jump_eligible` is a structural filter excluding wormhole/abyssal/other space, Jove regions, Pochven, Zarzakh and Exordium. It does not establish a cyno, usable ship, permission or access. The [route planner](UNIVERSE-ROUTING-VALIDATION.md) separately applies security and effective range.

## Regenerate the bundled snapshot

This is a developer workflow for replacing repository data. Ordinary users should use Settings' dataset controls; they do not need Python or a manual SDE conversion.

Obtain the JSON Lines ZIP linked from the [official Static Data page](https://developers.eveonline.com/docs/services/static-data/), retain it locally, and run from the repository root:

```sh
python3 scripts/import-universe.py /path/to/eve-online-static-data-BUILD-jsonl.zip
node --test tests/kairo/universe-static.test.mjs
```

`BUILD` and the path are placeholders for the actual archive. The importer also accepts an extracted JSONL directory. ZIP input includes the complete source archive's SHA-256 in provenance; an extracted directory cannot supply that archive checksum. The script uses the Python standard library and reads the build/release timestamp from `_sde`.

To inspect conversion without replacing checked-in data:

```sh
python3 scripts/import-universe.py /path/to/eve-online-static-data-BUILD-jsonl.zip --output /temporary/universe-check
```

`--output` changes only the conversion destination. The runtime tests above read the repository's selected data, so a successful temporary conversion is not by itself validation of a subsequently packaged generation. Review its manifest/checksums, then validate the actual data selected for the build through the [dataset](DATASETS.md) and [development](DEVELOPMENT.md) workflows.

The generator sorts entities and serializes JSON consistently. Gzip members have no timestamp, filename or host OS marker; the release date comes from the source. Identical input with the same Python/zlib toolchain produces byte-identical output. Different zlib versions can change compressed bytes without changing decoded data.

The Python script is an offline repository-generation tool. The application's automatic updater uses its own worker and conversion/validation path; it is not a request to run Python in the user's installation. See [`sde-worker.mjs`](../server/sde-worker.mjs) and [`sde-build.mjs`](../server/sde-build.mjs).

## Verification and ownership

[`tests/kairo/universe-static.test.mjs`](../tests/kairo/universe-static.test.mjs) covers provenance/checksum consistency, known physical coordinates, the reciprocal graph, every indexed detail record, summary counts, cross-shard records, immutability and invalid/truncated/mismatched shards. [`tests/kairo/universe-schematic-layout.test.mjs`](../tests/kairo/universe-schematic-layout.test.mjs) covers the schematic coordinate contract.

Dataset activation and failure/recovery evidence belongs to [Datasets](DATASETS.md) and current release acceptance to [Validation](VALIDATION.md). This page's baseline counts and byte sizes describe the checked-in source; they are not performance measurements or proof of live EVE state.
