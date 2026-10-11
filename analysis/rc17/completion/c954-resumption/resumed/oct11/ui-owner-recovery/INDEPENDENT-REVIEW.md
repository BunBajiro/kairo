# Independent schema correction and recovery review

11 October 2026. **Approved for the two unrun local UI lanes after the coordinator banks this correction.** This review executed only offline assertions and file/hash checks. No application, browser, build or measured worker was run; no prepared implementation was edited.

The canonical owner is exactly the original owner with one replacement: `result.smoke` becomes `result.environment?.smoke`; strict equality to `false` remains. Original bytes match failure bank `4249df1bdb6437884d3a7ff4338c85958d9cd1f7`. Independently extracted the complete replay-validation branch: the old branch reproduces rejection of the real schema2 record, the corrected branch accepts it, and11 malformed smoke/environment variants are rejected, including true,0,string false,null,objects,missing metadata and misleading top-level false. The author's19-control record is hash-bound and retains the other source/case/cycle/error/publication assertions.

Independently verified all10 preparation bindings and nine adoption bindings. Checked192 prior inventory-file pins and462 prior input-pin observations across historical/comparison/UI receipts. The only substitution is the one canonical owner path, checked against its exact archived bytes in each of the three stages. No other old input is rebound. Historical/comparison remain complete; original UI and repeat-small lane receipts remain failed and untouched.

The four completed UI receipts retain worker/outer exits0, actual descendant drain, source verification before/after and matching file pins; their66 existing checks are retained. The repeat-small worker separately exited0 with12 measured cycles and `environment.smoke:false`. Its new adoption receipt binds the unchanged raw result, failed receipts, independent raw/source audit and corrected assertions. This is validation of existing evidence, not a replacement measurement or conversion of the original failed receipt to success.

Recovery executes only repeat-cap followed by distinct-cap. Neither original output exists, and the runner explicitly refuses an already-started original cap lane. It requires a fresh output directory, both locks in performance→benchmark order, canonical bytes equal to the reviewed proposal, frozen70 source/build verification before and after, and separate old/new owner identities. The shared subreaper/namespace envelope requires actual leader and descendant exit; source/input and closed log/raw pins are rechecked through final inventory. Replay scratch/profile paths must be absent before and after. Prior raw and input pins are rechecked at completion, so retaining completed work does not weaken evidence guards.

Reviewed identities:

| File | SHA256 |
| --- | --- |
| Archived old owner | `58ff9778d7dc8857bad3f9c29d2c53e55b1ffd95115348c49ef7d482e8441b43` |
| Corrected canonical/proposed owner | `27f05929f03ec6b17d9632c561420b0a802578518db93169d046ed0f0a134378` |
| Recovery `run.py` | `86fa38e188eac71349a25397bec62023f21b93d7d109a29598eff1dfc141e961` |
| Shared ownership envelope | `f0b54c70c93891fd105d4f950a72046ce7998d21a8154e65a0440aca2b61a61a` |

This approves recovery preparation, not its future outcome. Require actual successful exits, both new lane receipts, final cross-binding and unchanged retained evidence before assembling local UI completion. Independent Actions, matched performance interpretation and release approval remain separate.
