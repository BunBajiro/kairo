# Full export and stopped-directory closure

Prepared semantic acceptance control; **not executed** until the coordinator grants a reviewed attempt. No application source changes, benchmarks, new optimization proposal or repeat of accepted cold/warm decisions.

The original [RC16 methodology](../../../../../../../rc16/reviews/followup-methodology.md) requires a pre-upgrade database reopened twice and a full before/after export field/record comparison. [Backend trace G2](../../../../backend-trace.md) and the [final runbook](../../../oct8/FINAL-MATRIX-RUNBOOK.md) retain that requirement. Existing report/route controls do not exercise `/api/export`. This control uses a **new synthetic directory created by the actual RC16 Store and Core**. No named installed user database is required by those original statements; this does not claim to have upgraded Bun's installed data or to support an export/import round trip.

The single worker performs four real lifecycles: RC16, upgrade to source70, then two clean source70 reopens. It uses the already verified fresh builds. RC16 is actually closed before a byte-identical directory copy; the original stopped directory stays untouched. Both synthetic SQLite directories, complete raw HTTP responses, independent expected responses, SQL snapshots and lifecycle receipts remain as reviewable evidence.

The fixture includes two pilot identities with encrypted synthetic tokens, ended/open Sessions, tied and repeated Journey visits, sovereignty-at-visit, one hidden link, event payloads, notes, goal tracking/progress, combat and alliance ledgers, market plans/preferences/jobs, expired transport representation plus future retry owner, snapshot retry metadata, Universe pins/signature/navigation/politics/config/history and a saved overlay. Every declared retained table must be nonempty. Data is synthetic; no user payload or runtime session cookie is published. The disabled politics inference and nonexpiring Universe records avoid expected expiry mutation; existing tests own expiry policy.

Every lifecycle checks the actual dashboard cookie path, missing/invalid session, wrong Origin, cross-site request and both private export paths on the broadcast port. Successful export must be JSON, attachment `kairo-history.json`, `no-store`, and contain only public identity fields, with no token sentinel. The complete decoded response is compared against SQL rows plus explicit fixture values for navigation, politics, overlay, quick supplies and identity. No application export helper is reused by the oracle. Static ship presets are the existing RC16 contract constant; all nested output is also compared intact across versions.

Response normalization is separate from SQLite preservation:

| Comparison | Exact allowed difference |
| --- | --- |
| HTTP export | Valid ISO `exportedAt`; version 8 to 9; exact three discovered pilot/system pairs; each legacy visit gains asserted-null `session_id`; one `universe:politics:queue-version` setting with value 3 |
| Retained SQLite | Legacy visit columns gain asserted-null `session_id`; market job generated `terminal` matches known statuses; exactly three migration markers; exact queue-version setting; transport retention grace metadata has declared fields and startup-bounded introduction time |
| Two subsequent reopens | No SQLite difference at all; no export difference except valid `exportedAt`; discovery migration marker remains exactly one |

Every original selected SQLite column/value, including token ciphertext, owner, retry settings, IDs, JSON text and timestamp ties, must remain exact after those explicitly asserted additions. Old migration rows remain exact. No rows or nested export sections are dropped to make a comparison pass. An unexpected difference fails and preserves the attempt.

The outer runner reuses the independently reviewed process Envelope, acquires the two shared locks, pins its own files and imported helpers, binds both exact source manifests to the original successful fresh-build receipts/logs, verifies sources before/after, owns actual descendant drain, and hashes closed evidence before releasing locks. External application fetches are denied; only a saved native fetch performs explicit loopback requests. `noSync:true` suppresses provider polling. Timestamp bounds validate new grace metadata; this control reports no elapsed performance measurements. On failure, all synthetic data and raw evidence remain available.

After independent static review and a coordinator runtime grant, the one intended invocation is:

```sh
KAIRO_EXPORT_GRANTED=1 python3 analysis/rc17/completion/c954-resumption/resumed/oct11/release-preparation/export-closure/run.py \
  /tmp/kairo-public-resume-20261011/setup-matrix/rc16-source.json \
  /tmp/kairo-public-resume-20261011/setup/candidate-source.json \
  /tmp/kairo-public-resume-20261011/export-closure-attempt1
```

Do not reuse an output directory, change source70, amend historical evidence, or treat a failed assertion as permission to loosen normalization. Inspect any failure against its source owner before changing this acceptance control.
