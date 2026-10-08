# Report and naming cancellation focus: isolated gate passed

The reviewed combined patch `32c908a8687c0fbd57ac179d1d32f75d59d5b61ca48064ed2af0baa8d112560c` was applied only to the local feature checkout `/workspace/scratch/a2f3334402fc/kairo-focus-a7-baseline`, based on exact `a7b1bf97b0073695926c443e52d523638e59e48d`. No continuation source or remote ref was changed by this lane.

The affected session archive, event-window and sessions suites passed 25/25; typecheck and fresh production build passed. Source/build fingerprint: `6289b6cf59ac7cfc15b7005008e1b6667feb89d92a3d62dc8dbcd64c2a8f2a6c`.

The fresh full compiled gate (`focus-gate2`) passed 25 hard checks and both naming-focus observations. It verifies native archive Enter, exact opener restoration after Escape/Close and a completed 270-event publication, Live and End session restoration, unchanged active-minute updates 0→1→0, Show on Map, navigation teardown, real synthetic roster/pilot replacement, all original session labels/data and private pilot separation. All source/end guards and independent browser/app/temp cleanup passed. There were no application exceptions or external requests; the synthetic disconnect used its explicitly injected empty discovery response.

The first full compiled attempt remains under `focus-gate1`: it passed 16 checks but the Show on Map query did not trim JSX leading whitespace. Raw DOM proves the button was visible. The fresh retry changed only that selector on the same already-built source; no timeout extension or repeated build/semantics. Partial run 1 is not acceptance.

This closes the observed report and naming Escape/Close focus behavior in the isolated candidate. Main integration and combined-source validation remain necessary. A successful naming submission may close while the Start control remains busy/disabled; no new focus guarantee is claimed for that distinct path. Native Find remains unverified in this runtime and no virtualized DOM change is part of this patch.

The subsequent memo screening uses this exact focus fix in both arms. The memo proposal itself is not adopted by the focus result.
