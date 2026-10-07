---
name: run-app
description: Start the ECG/SCG monitor dev server and check a UI change in the running app (Chrome). Use after any change to src/ui, src/plot or src/sources, or when the user asks to run, open or screenshot the app.
---

# Run the app and check it

1. Start the dev server in the background: `npm run dev` (port 5173). Wait for `Local: http://localhost:5173/ecg-scg-monitor/`.
2. Open `http://localhost:5173/ecg-scg-monitor/` in Chrome (browser tool if available; otherwise ask the user to open it).
3. Check, in this order:
   - The page loads with no errors in the browser console.
   - Pick a recording (a synthetic one is always available; real ones only if `public/samples/local/` is populated).
   - Press **Start**: the status badge shows `running` and the trace scrolls.
   - Timing: 10 s on a stopwatch ≈ 10 s of signal on the X axis.
   - **Pause** freezes the plot; **Resume** jumps back to live; **Stop** returns to `idle`.
   - Performance (when the plot changed): Chrome DevTools → Performance, record 5 s, frames stay near 60 fps
     and the JS heap does not grow steadily.
4. Take a screenshot if useful for the weekly update and save it under `docs/updates/img/`.
5. Stop the dev server when done.
6. Report to the user in Italian: what you checked, what worked, what did not.

If something fails, fix it or say clearly what is broken. Do not report success without seeing it work.
