# Universe routing contract and validation

[Documentation index](README.md) · [Route-planning user guide](UNIVERSE.md#routes-and-special-connections) · [Internal API](INTERNAL-API.md) · [Validation](VALIDATION.md)

This page describes the routing models implemented by the **0.8.0 feature set, candidate `0.8.0-rc.17`**. It is not a fresh verification of all live EVE rules. Source dates are part of each stored model, and gameplay conditions still need in-game confirmation.

## Owners and graph boundaries

| Owner | Responsibility |
| --- | --- |
| [`server/universe-routing.mjs`](../server/universe-routing.mjs) | Pure route/range calculations, special-link eligibility, ship/rule models and fuel estimates. |
| [`server/universe-navigation.mjs`](../server/universe-navigation.mjs) | Pilot/map-scoped saved itineraries, revisions, evidence assembly, plan freshness, bridge discovery and explicit EVE waypoint writes. |
| [`server/universe.mjs`](../server/universe.mjs), [`universe-jspace.mjs`](../server/universe-jspace.mjs) | Canonical private links, map ownership, expiry and removal. |
| [`components/kairo/universe-navigation-ui.tsx`](../components/kairo/universe-navigation-ui.tsx) | Route drafts, typed results, user choices and send/copy/download controls. |

Map visibility, projection, layout spacing and historical Session travel never create route graph edges. The planner receives physical coordinates, explicit preferences and current service-owned evidence. Canonical connection deletion/expiry invalidates saved route references; a copied drawing is not independent authorization to travel.

Guest users can plan against static data. Saved-map context requires its owning connected pilot. **Send to EVE** separately requires a connected authorized pilot, the waypoint scope, an explicit append/replace choice and a current plan revision. See [API reference](API-REFERENCE.md) for HTTP contracts and [authentication/security](AUTH-AND-SECURITY.md) for the write boundary.

## Gate and special-link routes

Static gates come from the validated reciprocal SDE graph. Special edges separately apply direction, enabled/confirmed/access state, expiry and required pilot evidence. Plans preserve typed leg identities: two different edge kinds or observations between the same systems are not interchangeable.

The `safer` preference weights available security, standings and destruction evidence. It is not a safety prediction. Explicit system/security exclusions and vessel constraints apply independently of display filters.

Private wormholes require explicit confirmation and access. Fresh EVE-Scout Thera/Turnur reports are separate opt-ins; stale, unavailable, incomplete or expired reports cannot become active public edges. A hub crossing routes through the actual hub, so two entrances mean two legs. Nominal size/mass constrains an individual transit and never proves the remaining hole budget. Unknown size/lifetime is not promoted to verified evidence. Thera additionally applies the modeled capital restriction with its explicit freighter exception.

Saved-map routing uses the map's own private topology. Imported observations lose confirmation/access trust; scope population, political membership and inferred coalitions do not grant transit permission.

## Jump and reach models

Jump planning and highlighted range results use full physical X/Y/Z and `9,460,000,000,000,000` metres per light-year. Physical-map rings are projected outer bounds; schematic coordinates are never a range input.

Each arrival must satisfy structural eligibility and security rules. Wormhole/abyssal/other space, Jove regions, Pochven, Zarzakh and Exordium are excluded, as are high-security destinations. A high-security origin can jump outward.

`JUMP_SHIP_PRESETS` supplies named base ranges and source references; JDC adds 20% per level. Custom effective range accepts a value above zero and at most 20 LY. These presets assume unmodified hull/JDC values; callers can supply actual in-game range for other bonuses or conditions. Reach comparisons support multiple origins and alternate midpoint intersections.

Fuel estimates use supplied isotope units per LY, effective multiplier and reserve. Units round up per physical leg; optional price/volume values produce cost/cargo estimates. Fuel in the hold, fatigue, cynos, jammers, docking, conduit passengers and complete ship eligibility are outside the calculation.

## Pinned Ansiblex models

| API value | UI label | Meaning |
| --- | --- | --- |
| `live` | **Live rules (22 Sep)** | Default model with `effectiveDate: 2026-09-22` and `verifiedAt: 2026-09-25`. |
| `current` | **Legacy rules · comparison only** | Retained older comparison model. The name does not mean latest live rules. |
| `announced` | **Pre-release model · comparison only** | Earlier proposal model, kept distinct from the live implementation. |

The default model checks starting-system sovereignty membership, recorded bridge ownership when present, eligible hull classes and explicit access. Directional capital zones measure from the owning alliance's recorded capital to the destination. Separately owned return gates use their own owner/capital. Missing required capital evidence cannot bypass a restrictive zone selection.

The module retains the zone table, nominal capacitor costs/capacity and official-source URLs alongside these dates. Nominal cost is not live capacitor availability. Fuel, online state and practical access are not inferred from an imported list or visible structure.

Before changing rules, verify the pinned sources and actual model requirements; do not silently redefine `current` or `announced` as aliases. Preserve explicit source/effective dates and add boundary evidence for any changed rule.

## Reproduce relevant checks

From the repository root:

```sh
node --test tests/kairo/universe-routing.test.mjs tests/kairo/universe-navigation.test.mjs tests/kairo/universe-route-preparation.test.mjs
```

Those suites cover physical range and prohibited arrivals, mixed edge identities, disabled/unconfirmed/expired links, one-way paths, disconnected systems, standings/activity preferences, owner/capital direction, zone limits and evidence preparation. For changes at service boundaries, also select the owning tests, such as:

```sh
node --test tests/kairo/universe-map-navigation.test.mjs tests/kairo/universe-waypoint-ownership.test.mjs tests/kairo/universe-http.test.mjs
```

Waypoint tests use controlled ESI behavior; they do not establish live SSO permissions or prove the real EVE client's result. UI changes require relevant Chrome and Firefox coverage, including drafts/async results, pilot/map switches and narrow layouts. Use [Validation](VALIDATION.md) for the actual candidate acceptance and environment-specific limits, and [Development](DEVELOPMENT.md) for the broader commands.

## Historical measurements

The 18 September pure-planner measurements excluded HTTP, database context and rendering. Their exact table and fixture description remain in the [immutable historical original](https://github.com/BunBajiro/kairo/blob/27516e5c6e1d73e5118835c798ed3420a30c2b0d/analysis/rc17/completion/c954-resumption/resumed/oct8/documentation-prune/originals/docs/UNIVERSE-ROUTING-VALIDATION.md). They are not current candidate latency evidence.

Preserve those measurements and failed-baseline provenance when changing documentation. Current matched performance evidence and the completed premerge acceptance belong to [Validation](VALIDATION.md) and its linked checkpoints. See [history](history/README.md) for the wider investigation record.
