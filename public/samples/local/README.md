# Local recordings (not in git, not deployed)

Real lab recordings are personal health data. They live only on your computer, in this folder.

- Everything in this folder except this README is ignored by git (see `.gitignore`).
- `vite.config.ts` deletes `dist/samples/local/` after every build, so these files never reach GitHub Pages.
- `manifest.json` here lists the local recordings, with the same fields as `../manifest.json`.
- Use neutral names (`ecg_subject01.lvm`), never a person's name.

To set up a new machine, copy the files from the lab's private storage (the `Resources/` folder) using the
`import-recording` skill.
