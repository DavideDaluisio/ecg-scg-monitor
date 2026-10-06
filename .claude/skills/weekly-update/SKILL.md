---
name: weekly-update
description: Prepare the weekly progress update for the NJIT group meeting (supervisor Sunny, firmware student Arsh). Summarizes completed milestones, screenshots, results and open questions. Use when the user asks for an update, a meeting summary, or material for slides.
---

# Weekly update

1. Collect:
   - `docs/roadmap.md` (milestone status)
   - `git log --since="7 days ago" --oneline`
   - `docs/questions-for-team.md` (unresolved items)
   - the previous update in `docs/updates/` (to avoid repeating it)
2. Take fresh screenshots of the app with the `run-app` skill for each milestone completed this week.
   Save them in `docs/updates/img/YYYY-MM-DD-*.png`.
3. Write `docs/updates/YYYY-MM-DD.md` **in English**, for a research supervisor (not a programmer):
   - **Done this week**: what the app can now do, with screenshots
   - **Results**: numbers (fps, HR accuracy on synthetic data, packet-loss tests…)
   - **Next week**: the next milestone tasks
   - **Questions / blockers**: max 5, the most important first, each with who should answer (Sunny / Arsh)
   - **Live demo link**: GitHub Pages URL
4. Keep it to one page. No code, no jargon without a one-line explanation.
5. Tell the user (in Italian) that slides are made on **Canva**, following `../CLAUDE.md` (outline first, then design).
