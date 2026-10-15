# Routing rules and validation

The implementation in [universe-routing.mjs](../server/universe-routing.mjs) consumes physical coordinates, explicit travel preferences and current service-provided evidence. Map visibility, display projection and recorded travel do not create graph edges. [Universe](UNIVERSE.md#routes-and-special-connections) explains the user controls.

## Implemented models and limits

- Gate planning validates direction, confirmation/access, expiry and relevant pilot evidence. Safer routing is a weighted preference, not a safety prediction.
- Jump planning uses all three physical axes and the in-game light-year constant `9,460,000,000,000,000` metres. The static eligibility and excluded-region/system rules prevent prohibited arrivals; a high-security origin may jump outward. Range does not verify fuel, fatigue, cynos, jammers, docking or every ship eligibility condition.
- The navigation UI defaults to the stored `live` Ansiblex model. The source records its rule verification date as 25 September 2026 and its effective date as 22 September. It checks starting-system sovereignty membership, recorded bridge ownership when present, eligible hull classes and explicit access. Actual capacitor availability is not reported.
- `current` is the retained legacy comparison model; `announced` is the earlier proposal model. They are distinct choices, not aliases for whatever rules are current today. Destination-to-owner-capital zones use the selected model's fixed source data; separately owned return gates use their own owner/capital. Missing required capital information cannot bypass a restrictive zone filter.

These statements describe Kairo's implemented models, not a fresh verification of every live game rule. Review the pinned official sources in the routing module before changing those models. Geometry, modeled eligibility and observed access remain separate from an in-game travel guarantee.

## Reproduce checks and interpret measurements

Run `node --test tests/kairo/universe-routing.test.mjs` and the affected navigation/HTTP tests when changing routing. Coverage includes mixed edge identities, expiry/disabled/unconfirmed links, one-way paths, disconnected systems, standings/activity preferences, owner/capital direction, zone boundaries, physical distance and prohibited destinations.

The old 18 September pure-planner measurements excluded HTTP, database context and rendering. Their exact table and fixture description are preserved in the [historical original](https://github.com/BunBajiro/kairo/blob/27516e5c6e1d73e5118835c798ed3420a30c2b0d/analysis/rc17/completion/c954-resumption/resumed/oct8/documentation-prune/originals/docs/UNIVERSE-ROUTING-VALIDATION.md). They are not current RC17 latency evidence. Current matched measurements, adverse cases and final acceptance belong to [Validation](VALIDATION.md) and its analysis checkpoint.
