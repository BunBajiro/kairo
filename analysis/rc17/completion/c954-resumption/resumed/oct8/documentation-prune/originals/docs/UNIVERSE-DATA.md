# Bundled Universe data

Kairo ships a complete offline snapshot derived directly from the official
[EVE Static Data Export](https://developers.eveonline.com/docs/services/static-data/).
The initial snapshot is build **3503375**, released **10 September 2026**. It contains
8,490 systems, 114 regions, 1,184 constellations, 6,989 undirected stargate links,
454,830 celestial bodies and 5,210 NPC stations. This includes known space, wormhole
space, abyssal space and other SDE systems; the main map normally shows known space.

`server/data/universe.json.gz` is the approximately **0.87 MB** topology snapshot.
It contains physical system coordinates, the gate graph, parent entities, summary
counts and an index into the logical detail archive. The archive is approximately
**22.85 MB** (21.8 MiB), split into three files named
`server/data/universe-details-000.bin` through `universe-details-002.bin`. Each file
is at most **8 MiB**, keeping individual repository uploads below the API request
limit after base64 encoding. All shards are included in every standalone release.
It stores a separate gzip member for each system, including stars, planets, moons,
asteroid belts, secondary stars/effects, NPC stations and stargates. Opening a system
reads and inflates only its own member; a member crossing a shard boundary reads
from two files. Logical offsets and the checksum of the concatenated archive are
unchanged by sharding. The server retains at most 48 detailed
systems; routine location polling uses a lightweight lookup and does not load
celestials. Neither map use nor route calculation downloads the SDE or fans out ESI
requests across systems.

`universe-provenance.json` records the official source URL, release build/date,
SHA-256 of the original archive, hashes of every consumed JSONL file, the packed
details checksum, byte size, shard size, ordered shard filenames and individual
checksums, projection and counts. This is static reference data:
sovereignty, player structures, traffic, kills, contacts and other changing state
come from separately timestamped live observations.

## Coordinates and topology

Physical `x`, `y`, `z` values remain unchanged in metres. The geographic map uses
`map_x = x / 9.46e15`, `map_y = -z / 9.46e15`. Jump planning uses all three physical
axes and the [game's exact light-year constant](https://developers.eveonline.com/docs/guides/map-data/),
**9,460,000,000,000,000 metres**. The SDE's alternate schematic positions are preserved
as `schematic_x` and `schematic_y`, and do not enter jump-distance calculations.

Celestial positions are local to the system's star, using the SDE's different local
handedness. For a north-up local view, negate both local X and local Z. Stars are at
the local origin. Unique official celestial names are retained where provided;
other names are derived from the system, orbit and celestial indices. NPC station
names also use their published corporation and operation names.

Stargate pairs must be reciprocal in the imported source. The importer fails on a
non-reciprocal or dangling gate rather than silently making it traversable. No
wormhole connection is inferred from coordinates or Journey visits. Wormhole class
uses the SDE's system, constellation and region inheritance; effect names and
descriptions come from the secondary sun's official effect type.

`jump_eligible` is a structural filter that excludes wormhole/abyssal/other space,
Jove regions, Pochven, Zarzakh and Exordium. It does not assert that a cyno exists or
that a ship can travel there. Route planning applies security and the supplied
effective jump range separately; callers must still verify ship eligibility,
actual access and current conditions.

## Refreshing the snapshot

Download the JSON Lines ZIP linked by the official Static Data page, then run:

```sh
python scripts/import-universe.py /path/to/eve-online-static-data-BUILD-jsonl.zip
node --test tests/kairo/universe-static.test.mjs
```

The script also accepts an extracted JSONL directory. A ZIP input is preferable
because provenance then includes the complete official archive's checksum. It
uses only the Python standard library. It reads the build/release date from `_sde`
and validates parent relationships and gate references before replacing outputs.
Keep the topology, provenance and every listed detail shard together when
reviewing or releasing an update.

The generator sorts entities and serializes JSON consistently. Gzip members have
no timestamp, filename or host OS marker; the source's release date is recorded
instead of a changing local generation time. Re-running against the same archive
with the same Python/zlib toolchain produces byte-identical outputs. Different
zlib versions can change compression bytes without changing the decoded data.
`--output /temporary/path` supports comparison without replacing the bundled data.

The dependency-free Node tests verify source/checksum consistency, known physical
coordinates, the complete reciprocal graph, every indexed system detail, summary
counts, records crossing shard boundaries, immutable shared records and failure on
truncated, mismatched or invalidly named detail shards.
