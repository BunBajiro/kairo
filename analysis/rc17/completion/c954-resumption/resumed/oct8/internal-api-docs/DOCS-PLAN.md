# Internal API documentation delivery plan

Requested by the user on 8 October 2026 while RC17 completion work continues. Documentation is part of the deliverable, not an optional follow-up.

Final destinations: `docs/INTERNAL-API.md` for the architecture and extension workflow, `docs/API-REFERENCE.md` for concrete HTTP/event contracts, and entry links from README / `docs/ARCHITECTURE.md`. Reconcile existing architecture prose where the accepted refactor changes its contract; preserve clearly historical version sections as history.

Drafts here are tied to accepted application `a7b1bf97b0073695926c443e52d523638e59e48d`. They are not a promise that unfinished names/Maps prototypes will ship. Recheck every affected contract after final integration, particularly names delivery/reconnect epochs, Maps metadata ownership and scene refresh. Neither rejected Maps metadata prototype belongs in the current architecture description.

Coverage: runtime and service ownership; private HTTP versus read-only Stream listener; authentication/session/CSRF; read DTOs, freshness and revision tokens; semantic bus versus UI invalidation versus sanitized broadcast; pilot/scope/async fencing; SQLite authority and cache lifetime; accepted-work drain and managed dataset restart; adding a collector, local module, command/read pair, page and projection; source-linked tests and meaningful performance gates. Include practical examples using real helpers and current paths, and a complete route-family reference with method/input/owner details.

Validate by static route/event inventory, source anchors, exact method/field examples, and independent code review. Documentation-only edits need no new unit tests; executable examples must match real signatures. The final user explanation should describe the backbone in plain language and link the completed repo documents.
