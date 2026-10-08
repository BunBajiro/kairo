# Independent documentation proposal review

Read-only review on 8 October 2026 by the source-restoration reviewer. Application source is the accepted a7 checkpoint; proposal files are authored and owned by root. This review does not alter application documents, approve a release or close RC17 runtime findings.

## Usability and architecture

The new README gives the current internal RC17 status before installation, avoids directing users to the newest artifact indiscriminately, and splits user/developer entry points clearly. The documentation index gives each substantive contract one maintained home. The user guide retains the substantive Markets, automatic Goals, Stream, OBS, protection, privacy and collection limits previously embedded in README. Domain guides retain Session coverage and Import Analyser assumptions rather than replacing them with shorter marketing descriptions.

The Core facade, semantic versus observation versus invalidation events, scoped refresh owner and actual Session edit example match the source signatures and flow reviewed. The facade does not claim a versioned public SDK. The guide correctly distinguishes selected UI pilot from server authorization, changed snapshot metadata from body identity, accepted writes from display scope, and returned listener promises from untracked work. The Registry example is scoped as registration/read DTO, with live refresh ownership explicitly separate.

The route reference covers both ports, actual authentication/CSRF/body limits, dispatch fallthrough, dynamic path decoding, Stream field selection and events without promoting pending names-protocol changes. Validation explicitly preserves withdrawn PR #10 and internal work-in-progress status, does not reuse old test counts as current acceptance, and separates exact source-bound gates from user Windows/OBS/EVE review.

## Concrete edits sent to author

1. `docs/API-REFERENCE.md` still refers to itself as “This draft” and says `HTTP-SOURCE-NOTES.json` is beside the file. The receipt belongs in the analysis repository; use a pinned analysis link and a current reference description.
2. The appended `docs/ARCHITECTURE.md` Universe contract has the obsolete “Implementation target: 0.8.0-rc.5” and duplicates the new route catalog. Transfer unique service/guest/lifecycle restrictions, then link to the API reference rather than maintaining a second catalog. Root already owns compatibility transfer and incoming-link repair.
3. Replace the personalized Markets example “so Bun Bajiro can browse” with a general local-pilot example.
4. Preserve the useful current organization-standings setup instruction from old README: add `esi-corporations.read_contacts.v1` and `esi-alliances.read_contacts.v1` to the EVE application, then use Connections → Update access. EVE roles still determine availability. The new OPSEC guide otherwise explains source precedence and missing permissions but loses these exact setup steps.
5. Preserve the developer constraint that the retained React/Vinext Sites scaffold must not be deployed as a public-hosted version of this local runtime. Loopback architecture is stated, but the explicit source-development restriction helps avoid an incorrect hosting decision.
6. Preserve the concise CHANGELOG contribution rule: completed user-visible work under Unreleased; on release move to a version/date and include upgrade/data changes. This can live in AGENTS or the developer guide instead of README.

These are documentation cleanup/retention items, not newly discovered runtime blockers. No additional release-readiness claim is made by this review. Root is independently responsible for source-bound verification of the test-build #63 statement, whole-repository link audit, Universe compatibility transfer and the final accepted-source reconciliation.
