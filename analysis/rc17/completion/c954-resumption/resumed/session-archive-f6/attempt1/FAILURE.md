# Retained failed first attempt

The inherited harness required `window.find` to find the renamed oldest archive label. All three 30-row refreshes and exact DOM ordering passed, but every native find returned false. The retained failure state includes the exact visible `Refreshed 30 2` text.

The subsequent minimal control in `../find-probe.json` shows the same runtime returns false for a visible plain paragraph and button on a data page, despite document focus and visible page state, before and after bringing the page to front. This establishes a find-probe capability limitation; it is not evidence of missing archive text.

Attempt1 is incomplete and is not acceptance or pooled performance evidence. The original worker/runner bytes are retained here. Attempt2 retains the native-Find coverage gap explicitly and checks complete ordered DOM text, actual visibility, native Enter activation of the oldest button and Escape focus return. No application source was changed. Future virtualized/windowed candidates would need Find testing in a browser with working native search.
