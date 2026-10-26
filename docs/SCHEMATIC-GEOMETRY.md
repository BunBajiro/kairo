# Universe schematic geometry

[Documentation index](README.md) · [Universe user guide](UNIVERSE.md) · [Static data](UNIVERSE-DATA.md) · [Routing](UNIVERSE-ROUTING-VALIDATION.md)

This is the implemented geometry contract for the **0.8.0 feature set, candidate `0.8.0-rc.17`**. Atlas 2D and known-space region/constellation placement in Maps use the same source positions. Physical jump reach uses a separate coordinate model.

## Coordinate source

The importer preserves CCP's `mapSolarSystems.position2D` as:

```text
schematic_x = position2D.x / LIGHT_YEAR
schematic_y = -position2D.y / LIGHT_YEAR
```

`LIGHT_YEAR` is `9460000000000000` metres. The screen's downward Y axis requires the negation. These are diagram positions; the divisor does not make their distances usable for jump-drive planning. The source reference is CCP's [2D schematic map documentation](https://developers.eveonline.com/docs/guides/map-data/#2d-schematic-map).

All 5,485 known-space systems in bundled build 3503375 have unique finite 2D positions. This is a checked-in baseline fact, validated by the existing tests, rather than a guarantee about all future datasets. No separate third-party layout dataset is required.

## Shared layout helper

[`lib/universe-schematic-layout.mjs`](../lib/universe-schematic-layout.mjs) exports:

```js
schematicLayout(systems, {nodeWidth = 0, nodeHeight = 0, gap = 32} = {})
```

The result is `{points, bounds, scale, source}`. Points retain their source system and calculated `x`/`y`; `source` is `sde`, `physical` or `grid`.

The helper deduplicates valid system IDs, sorts them deterministically, recentres the group and applies one uniform scale. It preserves relative geometry and angles; there is no separate X/Y stretch or pilot-centred gate-hop layout. For card placement, positive node dimensions plus padding determine sufficient spacing. This pairwise spacing work occurs when preparing the bounded group preview, not as a continuous map-animation task.

Atlas and Maps supply edges separately from real stargates and configured Ansiblexes. Geometric proximity does not create a connection. After placement, every card is an independent map node.

## Fallbacks

| Available positions | Result |
| --- | --- |
| Complete finite schematic positions | `source: 'sde'` |
| Missing schematic positions but complete finite `map_x`/`map_y` | `source: 'physical'` |
| Neither complete coordinate set, or coincident chosen positions | `source: 'grid'` with deterministic placement |

A group uses one coordinate space; the helper never mixes physical and schematic positions or silently discards a member due to a missing coordinate. Invalid IDs are filtered before layout. Empty input returns an empty finite layout. The current bundled known-space data does not require the physical/grid fallback.

## Validation

Run from the repository root when changing this contract:

```sh
node --test tests/kairo/universe-schematic-layout.test.mjs tests/kairo/map-group-placement.test.mjs
```

The tests cover Tenerifis reference geometry, complete galaxy/region/constellation membership, centre-independent ordering, uniform collision-free card spacing, explicit fallbacks and empty/single-system input. For changes to user interaction, add the relevant Chrome and Firefox flow coverage described in [Validation](VALIDATION.md).

## Historical context

An earlier regional schematic reused local-radar hop bands, causing single-system bands to align into an artificial column. That investigation explains the separation of radar and schematic geometry; it is not a remaining issue or a user workaround. Radar still represents hop-distance topology, while Atlas schematic uses CCP's full layout with ordinary framing and political layers. Changing the selected pilot/system does not rearrange that layout.

Historical investigations and their original records remain under [documentation history](history/README.md). Current application acceptance belongs to [Validation](VALIDATION.md).
