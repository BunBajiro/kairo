# P0-01 HTTP and command surface

Static inventory at recovered bank `fa56b0824133da6f07393d9b04beb9ad6b242de3`; executable source remains Build97 `0eece9d7d5f60f0246dbfda89b5cb4f55e576979` / tree `3349f0b083bb9df8a88fc99f3f4fb36ade8d3d10`. Author: `api_inventory`; independent reviewer: `inventory_review` (disposition recorded by coordinator). This inventory does not verify behavior, settle command contracts or reopen historical findings.

The [TSV denominator](http-surface.tsv) contains **194 entries**:

| Surface | Entries | Meaning |
| --- | ---: | --- |
| Private API | 146 | Method/predicate handlers, expanding every literal collection/action dispatch |
| Dashboard | 6 | Callback, API guard/dispatch, redirects, session establishment and static fallback |
| Broadcast | 7 | Public state/SSE and separate root/prefix/asset aliases |
| Validation/fallback/method boundaries | 5 | Two private prefix validators, private 404; broadcast non-GET rejection and 404 |
| Nested command selectors | 28 | 23 J-Space `op` values, Session start/end and three OPSEC body variants; not extra HTTP endpoints |
| Retained hosting scaffold | 2 | Worker image optimizer and framework fallback; outside the local runtime |

Every route row gives source line, matcher, method, C-row ownership and the delegated service. Private rows are behind the common session/origin check; all non-GET API dispatch passes CSRF. Source line numbers are pinned to the recovered source, not promises about later edits. Regex paths are full matches (`^…$`); prefix paths deliberately retain `*` because the handler extracts a selected segment rather than enforcing a single-segment template. Query parameters/body validation and per-domain authorization remain part of the linked owner units.

`read` means a query entry point, **not proof of no side effects**: query handlers can refresh data, lazily initialize state, update derived caches or read providers. `query-post` distinguishes calculations/previews from intended durable edits; it does not authorize replay or assert pure execution. `read-through-refresh` includes collector/cache publication, and `job-control` includes admission/cancel/update control. `local-command` requires authoritative commit/read-back analysis; `external-command`, `local-and-provider-command` and `external-session-or-command` require separate uncertain-outcome handling. `/universe/navigation/plan` stores its computed plan; `/waypoints` can dispatch EVE commands and persists status. These are starting classifications for P0-02, not accepted retry semantics.

Important retained boundaries:

- Dashboard `/auth/eve/callback` and `/stream*` branches have no method predicate; they occur before the generic GET/HEAD static check. Localhost GET redirect precedes them. Record this actual grammar for later C01 coverage without inferring a defect.
- GET `/api/sessions/*` may schedule combat refresh. Retained Journey/place/notes APIs remain in the denominator even when their historic page is hidden.
- `/api/modules/*` dispatches an enabled registry module's optional `read`; the current built-in `milestones` extension has no `read`. Review the extension contract and newly loaded modules at the C03 boundary; do not invent a built-in response handler.
- Root/static aliases and the Stream listener are separate from private APIs. Stream-toast delivery remains C13 correctness scope and excluded from application-toast consolidation.
- `worker/index.ts` delegates to the hosting framework; `app/chatgpt-auth.ts` only builds reserved proxy URLs (`/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`) and does not register local routes. These remain C16 scaffold integration scope.

Existing owner tests and historical proof are linked by the runtime/domain/UI inventories. No runtime, browser, provider or performance tests were run for this enumeration. Next: P0-02 joins each mutating/refreshing selector to admission, acceptance, durable commit, publication, acknowledgment and reconciliation; specify conflicts and uncertain outcomes before corresponding implementation. Resolve generic extension behavior and query side effects in their owner units rather than treating this table as automatic retry policy.
