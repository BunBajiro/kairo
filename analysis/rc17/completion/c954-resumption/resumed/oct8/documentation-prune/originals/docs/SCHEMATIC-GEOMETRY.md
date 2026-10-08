# Universe schematic geometry

The Atlas 2D view and region/constellation placement in Maps use CCP's `mapSolarSystems.position2D` from Kairo's bundled official SDE. The existing importer retains these as `schematic_x = position2D.x / LIGHT_YEAR` and `schematic_y = -position2D.y / LIGHT_YEAR`. All 5,485 known-space systems in the bundled build have unique, finite 2D coordinates. No additional third-party map dataset is needed.

CCP's [Map Data documentation](https://developers.eveonline.com/docs/guides/map-data/#2d-schematic-map) identifies `position2D` as the in-game 2D map layout and specifies the axis convention. The screen's downward Y axis requires negating the source Y coordinate. These are diagram positions; physical jump calculations continue to use the original 3D system coordinates.

The previous regional schematic incorrectly reused the local radar's hop bands. Every band containing one system placed that system at the same angle, creating a tall column with unrelated systems squeezed together. The correction separates the two geometries: radar retains hop-distance rings, while Atlas schematic uses the full CCP layout and shares ordinary region framing, zoom and political layers with the physical projection. Selecting a different pilot or system cannot rearrange the schematic.

`lib/universe-schematic-layout.mjs` is shared by Atlas and staged group placement. It applies only translation and one uniform scale to the source positions. Card placement can supply node dimensions and padding; the helper finds sufficient uniform spacing without changing relative angles or stretching one axis. Each system remains an independent node after placement. Graph edges are supplied separately from actual stargates and configured Ansiblexes; geometry never invents connections.

For a future or incomplete group with missing 2D positions, the helper reports `source: physical` if all physical coordinates exist, otherwise `source: grid`. Coincident positions also use the deterministic grid fallback. It never combines physical and schematic coordinate spaces or silently loses members. The complete bundled known-space dataset does not use either fallback.

Tests cover the Tenerifis reference geometry, full-galaxy/region/constellation membership, centre-independent ordering, uniform collision-free card spacing, explicit fallbacks, and empty/single-system input.
