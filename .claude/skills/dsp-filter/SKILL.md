---
name: dsp-filter
description: Add or modify a digital filter (biquad high-pass, low-pass, band-pass, notch) or the R-peak/HR detector in src/dsp, validated against scipy reference vectors. Use for any change to signal filtering or heart-rate detection.
---

# Add or change a filter

Read `src/dsp/CLAUDE.md` first.

1. **Reference with scipy.** Create or extend `tests/fixtures/gen_<filter>.py`. It should:
   - design the filter with `scipy.signal` (`butter(..., output='sos')`, `iirnotch`) at the target fs (3000 Hz, plus 512 Hz, the likely ECG rate on the real patch, see ADR 0003)
   - save the SOS coefficients, a test input (e.g. 2 s from `public/samples/ecg_sunny.lvm` plus a synthetic chirp) and the `sosfilt` output as JSON in `tests/fixtures/<filter>.json`
   - be run with `python -I tests/fixtures/gen_<filter>.py` (needs `numpy`, `scipy`; ask before installing)
   Commit both the script and the JSON.
2. **Implement in TypeScript** in `src/dsp/`:
   - coefficients computed from (type, cutoff, Q/order, fs) with bilinear transform (RBJ cookbook formulas are fine)
   - Direct Form II Transposed, `Float64` state, process a `Float32Array` in place or into a provided output
   - no allocations inside `process()`
3. **Test** in `tests/unit/<filter>.test.ts`:
   - coefficients match scipy (tolerance 1e-6)
   - output matches the reference vector (max abs error ≤ 1e-4 × signal range)
   - stable for 60 s of input (no NaN/Infinity), and resets correctly
4. Write the design parameters and the expected -3 dB points in a short comment above the factory function.
5. Ask the `dsp-reviewer` agent to review the change.
6. Explain the change to the user in Italian (what the filter removes, and why).
