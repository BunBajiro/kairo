# Retained internal baseline evidence

These files belong only to the internal investigation branch. Read [the findings](../PERFORMANCE-FINDINGS.md) for interpretation and [the methodology](../PERFORMANCE.md) for commands. No application optimisation was applied in these runs.

All full timing runs record clean harness commit `ec26c4f36238954227cb2af9d0f8bf330fd4a182`; its application source matches v0.7.2 commit `b151125cd7b26611364923f00683b1c6f1c1bdd6`. Environment, fixture fingerprint, fixture time, raw samples and completeness are embedded in the JSON. Original reports are copied byte-for-byte without rewriting their provenance.

| Files | Source / meaning |
|---|---|
| [workspace-run-1.json](workspace-run-1.json), [workspace-run-2.json](workspace-run-2.json) | Two sequential full local backend runs, 10 samples and 35-second idle windows |
| [github-run-1.json](github-run-1.json), [github-run-2.json](github-run-2.json) | Both backend runs from successful GitHub run 34852836758 |
| [github-browser.json](github-browser.json) | Six complete compiled-browser scenarios from the same GitHub run |
| [workspace-repeatability.md](workspace-repeatability.md), [github-repeatability.md](github-repeatability.md) | Advisory comparisons of repetitions within each environment |
| [workspace-snapshot-reads.json](workspace-snapshot-reads.json) | Separately instrumented per-key snapshot counts; JSON bytes are not physical disk I/O |
| [workspace-observer-control.json](workspace-observer-control.json) | One 35-second meter-only observation without Kairo |
| [workspace-cpu-hotspots.json](workspace-cpu-hotspots.json) | Source locations and self-sample counts from separate diagnostic profiles |
| [workspace-opsec.cpuprofile](workspace-opsec.cpuprofile), [workspace-session.cpuprofile](workspace-session.cpuprofile), [workspace-imports_after_write.cpuprofile](workspace-imports_after_write.cpuprofile) | Raw V8 CPU profiles; import into Chrome DevTools. These small captures are deliberately retained despite the general profiler-output ignore rule. |

GitHub source: [successful workflow run](https://github.com/BunBajiro/kairo/actions/runs/34852836758), artifact ID `10351651721`, named `kairo-internal-performance-ec26c4f36238954227cb2af9d0f8bf330fd4a182`. The original ZIP is 965,184 bytes with SHA-256 `dd2dfeeed74b31f82ead3fd28c07563a7d7afc0328855e2a6ab28bd13661dd36`; its digest was verified before extraction. GitHub retains its screenshots and original generated reports for 30 days. These committed results survive artifact expiry.

Do not compare workspace timing numbers directly against GitHub timing numbers as an improvement. CPU/hardware differ. No end-user tokens, installed user database or external EVE data were used. Synthetic activity events and combat tables are separate inputs, so screenshots are readiness diagnostics rather than accounting golden files.
