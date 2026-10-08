# Documentation consolidation — current work

The user requires usable documentation for users and human/AI developers, and wants the current credit budget focused on shipping 0.8.0. This is part of the refactor, not a new redesign project.

The exact pre-edit README, AGENTS and 23 domain/developer Markdown files are preserved under `originals/`, bound to application a7b1bf97 by `ORIGINALS.json`. Historical validation is evidence about its original versions, not a current RC17 pass. Preserve license/attribution notices and the existing branch/review rules.

Proposed current structure:

- A short README with actual build/review status, launch instructions and user/developer entry links.
- `docs/README.md` as the small documentation map and authority guide for both humans and AI.
- Focused getting-started and everyday-use/streaming guidance extracted from the duplicated README, retaining real upgrade/data and protection limits.
- Existing Universe, Sessions, Import Analyser, polling, data/retention and source/provenance guides, corrected to current behavior without obsolete version headings.
- `INTERNAL-API.md` as the development workflow and ownership contract, plus `API-REFERENCE.md` for HTTP/events. ARCHITECTURE becomes a compact source map and domain ownership reference, avoiding a second copy of the API guide.
- VALIDATION becomes instructions and exact current acceptance limits, with old run/test counts removed from current guidance.
- Remove obsolete release review/optimization notes and superseded source-audit/workflow/feature-comparison documents from the application documentation. Retain their exact originals in this analysis bank and Git history; move any unique still-current user limitation or implementation invariant into its owning current guide.

Before adopting: inspect cross-links in Markdown, scripts, tests, package workflow and license notices; update each affected reference; check that current instructions remain reachable and examples match source. Do not label the branch a user-review build while RC17 closure is open. Final integration must reconcile any accepted names/Maps/scene contract changes. Documentation-only changes do not require new unit tests or a benchmark rerun.
