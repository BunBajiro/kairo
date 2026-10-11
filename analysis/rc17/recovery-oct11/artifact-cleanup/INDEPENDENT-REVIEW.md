# Superseded test artifact cleanup — independent review

11 October 2026. Read-only code, request and evidence review by the namespace/backend agent. No cleanup workflow, GitHub client, deletion, application runtime or benchmark was executed by this reviewer.

**Approved for the root coordinator's authorized publication and execution.** No inspected blocker remains. This approval covers the exact files below and the user's existing artifact-cleanup authorization; it does not grant a wider deletion scope.

| File | SHA256 |
| --- | --- |
| `../internal-artifact-cleanup.yml` (workspace workflow proposal) | `f7724090b539b25702faa983676117c5589c3a1ee6475c75b2be1283483dd2de` |
| `cleanup.py` | `357629952943e9183e1909c82f84b0a5bedcfdc3bc06f6b6f1c04b30c6c0a456` |
| `request.json` | `af6dd38ed523b35ac9471256536627979744cab4391c0cfe175eab2bbffe6f9c` |
| `offline-controls.py` | `05d474e57f2bf7f93f63f66b163a4fed615ca3fe0d77c9ae4561b11948a5341c` |
| `offline-controls.json` | `3ea8be6439bbae470cedd1748112388c2e46a4622c03605f60ac14fbe09eb46b` |

The request independently matches every recovered inventory row: **38 exact completed normal Kairo test-build runs, 124 artifact IDs, 2,041,005,576 bytes**. Run numbers are exactly 25–64 excluding 48 and 54, from workflow ID 354534933 and `.github/workflows/test-build.yml`. The root explicitly included the observed `Kairo-test-build.sha256` paired checksum alongside the four originally identified names. The complete allowed set is `Kairo-test-build.zip`, `Kairo-test-build.sha256`, `session-interface-check`, `universe-interface-check`, and `datasets-interface-check`. Builds 48, 54 and 65, all unlisted/internal/performance/release artifacts, workflow runs and logs are outside the target set.

The script pins the request's exact SHA256. It validates run identities, artifact IDs and names, sizes, digests, timestamps, expiry, owning run, branch, source SHA and repository IDs. A separate plan phase performs reads only. Deletion requires the same request, source commit, workflow run and exact target array; it repeats every live identity check before the first mutation and rechecks each artifact immediately before its DELETE. A changed/missing target fails closed. The only DELETE call constructs an artifact endpoint from a previously validated positive integer ID; run endpoints are read only. API origin and repository are fixed, redirects are disabled, and credentials/headers/response bodies are not printed.

The workflow is restricted to the analysis branch and uses `contents: read`, `actions: write`, with checkout credentials not persisted. It contains no source update, branch push, release mutation or run/log deletion. It prints the fixed plan, a flushed `DELETE_ATTEMPT` before each mutation, the returned deletion status, and each confirmation after HTTP 204 followed by GET 404. A failed initial identity recheck now emits a zero-mutation failure receipt; a later failure preserves the already-confirmed deletions and stops. The final receipt is printed and written locally without requiring another artifact upload while storage is full. Cancellation can still prevent the final receipt; the flushed per-attempt/result records deliberately expose that uncertainty rather than claiming unconfirmed deletion.

The implementer's eight offline controls passed using a fake API only: read-only planning, exact successful deletion IDs and absence confirmation, changed run, changed last artifact before any deletion, a late changed artifact after one confirmed deletion, protected/internal substitutions, and altered plan rejection. I inspected those controls and verified all three receipt bindings against current bytes; I also parsed the Python syntax and independently compared the request against `eligible-artifacts.json` and `workflow-runs.json`. I did not rerun the controls or make live API calls. The successful offline receipt therefore establishes bounded simulated behavior, not completion of the live cleanup.

The coordinator must retrieve the actual plan/result logs after execution before reporting freed artifact storage. This review makes no claim that the quota has already changed or that Kairo's final acceptance has advanced.
