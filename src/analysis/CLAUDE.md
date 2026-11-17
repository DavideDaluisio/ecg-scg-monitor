# src/analysis – ECG P, Q, R, S, T and SCG AO detection (display only)

Finds the P, Q, R, S and T waves of each heartbeat so the ECG panel can mark them, and the AO (aortic opening) peak
of each beat so the SCG panel can mark it. Details and limits: `docs/architecture.md` ("ECG PQRST markers",
"SCG AO markers").

## Rules

- **Display only.** Nothing here is recorded or exported, and the raw samples are never changed. The band-pass filter
  (`biquad.ts`) is used only inside `QrsDetector` to find the beats; the waves and the AO are located on the raw
  samples.
- Not a diagnostic tool: no heart rate, intervals or PEP/LVET here unless asked (see the root `CLAUDE.md`).
- Pure, testable code: no DOM, no React, no uPlot. `qrsDetector.ts`, `pqrstTracker.ts` and `aoTracker.ts` keep
  state; `pqrstPoints.ts`, `aoPoint.ts` and `biquad.ts` coefficients are pure.
- The AO is searched only after an R peak of an ECG recorded at the same time as the SCG (`session.ts` creates the
  `AoTracker` only then). ECG and SCG may have different fs: convert through seconds, never index to index.
- **Per sample: no allocations** (`QrsDetector.process` runs on every ECG sample, inside the source's `onBlock`).
  One small object per beat (~1 per second) is fine.
- Every rule works for any fs from 250 to 3000 Hz: durations are in seconds, converted with `fs`.
- When unsure, leave a wave out (`null`) rather than mark a wrong point.
- Tests use synthetic signals only (`ecgAt` and `scgAt` in `src/sources/syntheticSignals.ts`, whose wave and AO
  positions are known): `tests/unit/biquad.test.ts`, `qrsDetector.test.ts`, `pqrstPoints.test.ts`,
  `pqrstTracker.test.ts`, `aoPoint.test.ts`, `aoTracker.test.ts`.
