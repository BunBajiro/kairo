# Narrow name-merge ownership trial — not yet adopted

The real Core sends the complete global flat ID→name map on each snapshot. Dashboard merges it by first spreading both complete maps and then recursively comparing every key/value through `retainValue`. A wallet event can therefore copy and compare 20,000 unrelated names before React consumers receive it. Eliminating derived row reconstruction does not remove that common event-owner cost.

The isolated `name-merge-trial.patch` adds a flat-map merge helper, declaration, Dashboard call and regression. Incoming own keys are compared directly; unchanged full maps, subsets and absent maps return the existing map. A changed/new own key causes the original spread merge once, retaining absent IDs and protecting object prototype semantics. It does not change server protocol, event delivery, reconnect recovery, selected-pilot filtering or ancillary response fencing. Initial/recovery `/state` equality remains unchanged.

Trial checkout: `/workspace/scratch/a2f3334402fc/kairo-frontend-names-trial`, based on c954 plus the already proposed native administrative timer correction. Comparison baseline is `/workspace/scratch/a2f3334402fc/kairo-frontend-native-fix`; the name patch is the only source difference relevant to UI behavior. Original c954 CPU attribution is separately captured by `context-profile.mjs` with real full-name-map events. Ordinary timing must remain free of profiler/GC instrumentation.

The regression covers unchanged full and partial input identity; updated/new names while preserving other IDs; frozen source immutability; new own undefined keys; and `__proto__`/`constructor` names without prototype mutation. This is a bounded map scan with an allocation only for actual changes, not an unbounded memo table.

Build/type/test and measured adoption are pending. The first queued command accidentally named an unavailable `npm run types` script; its log is retained. The corrected build2 command uses `npm run check:kairo`. Neither command failure nor an incomplete profile is timing evidence.
