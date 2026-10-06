---
name: run-app
description: Start the ECG/SCG monitor dev server and verify it in a real browser with Playwright (screenshot + console errors). Use when asked to run, start, try, or screenshot the app, or to confirm a UI change works.
---

# Run and check the app

1. If `node_modules/` is missing, run `npm install`.
2. Start the dev server in the background: `npm run dev` (port 5173). Wait until it prints the local URL.
3. Write a short Playwright script in the scratchpad (not in the repo) that:
   - opens `http://localhost:5173/`
   - collects `console` messages of type `error` and `pageerror` events
   - selects the source requested by the user (default: **Replay → ECG sample**) and presses Start
   - waits 3 s, then saves a full-page screenshot
   - checks that the plot canvas changed between two screenshots taken 1 s apart (the signal is moving)
4. Run it with `npx playwright test` or `node`, then show the screenshot to the user (Read the PNG).
5. Report:
   - console errors (or "none")
   - whether the trace is moving
   - anything that looks wrong (flat line, wrong scale, axis not in seconds/mV)
6. Stop the dev server when done, unless the user wants to keep it running.

Notes:
- Web Bluetooth cannot be exercised headlessly. For BLE, use the synthetic "packetized" source instead.
- If Playwright browsers are missing: `npx playwright install chromium`.
