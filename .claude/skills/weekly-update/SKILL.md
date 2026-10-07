---
name: weekly-update
description: Write the weekly progress update for the lab meeting (what was done, demo, next steps, open questions) from git history and the roadmap. Use when the user asks for the weekly update, meeting notes or a progress summary.
---

# Weekly update

1. Collect facts (do not invent progress):
   - `git log --since="8 days ago" --oneline`
   - `docs/roadmap.md` (milestone status and checked items)
   - `docs/questions-for-team.md` (open questions, answered ones since last update)
   - the previous file in `docs/updates/` (to avoid repeating it)
2. Write `docs/updates/YYYY-MM-DD.md` in **English** (the lab reads it), max one page:
   - **Done this week** – 3–6 bullets, user-visible results first (e.g. "ECG scrolls live from the lab recording at 3 kHz").
   - **Demo** – link to the GitHub Pages site and what to click; screenshots from `docs/updates/img/` if any.
   - **Next week** – the next 2–4 roadmap items.
   - **Questions for the team** – only the open ones that matter now, with who should answer.
   - **Risks** – only if there is a real one.
3. Plain language: the audience is a research lab, not software engineers. No code in the update.
4. Tell the user in Italian where the file is and give a 3-line summary they can say out loud.
