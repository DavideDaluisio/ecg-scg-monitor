# ADR 0003 – Each channel has its own sample rate

Date: 2026-10-06 · Status: **accepted**

## Context
The first contract assumed one `fs` for the whole stream: `SampleBlock.fs`, interleaved `[ecg, scg]` samples in
the BLE packet, and one shared sample index. The target was 3 kHz for both signals.

The patch in the reference paper uses two separate front-end chips:
- **MAX30003** (ECG): at most 512 samples/s (128 / 256 / 512 sps with the 32.768 kHz clock).
- **ADXL355** (SCG): output data rate up to 4 kHz.

If the new patch uses similar chips, ECG and SCG will have **different sample rates**. They will also be clocked by
**different oscillators**. We do not know the final hardware yet (see `docs/questions-for-team.md`, Q1, Q8, Q9).

## Options
1. **One fs per channel.** Every channel carries its own `fs` and its own sample index. Channels are aligned in time
   (seconds), not by index.
2. **Common fs, the firmware resamples.** The firmware converts both signals to one rate before sending them.

## Decision
Option 1: **one fs per channel.**

- It is honest about the hardware. Upsampling ECG from 512 Hz to 3 kHz on the MCU adds bandwidth but no information,
  and resampling on a Cortex-M4 is extra firmware work that the app cannot verify.
- It costs less BLE bandwidth (ECG at 512 Hz needs about 1/6 of the bytes of ECG at 3 kHz).
- Raw data stays raw: what is recorded and exported is exactly what the chip produced.
- It still covers the equal-rate case. The current lab files (both 3 kHz) and the synthetic source work the same way.
- No code depends on the old contract yet (we are in M0), so changing it now is cheap. Later it would not be.

Option 2 stays possible: if the firmware ever sends both channels at the same fs, nothing in the app changes.

## Consequences
- `SampleBlock` carries **one channel**: `{ channel, seq, firstSampleIndex, fs, samples }`. See `src/core/CLAUDE.md`.
- Time is still derived from the sample index, never from `Date.now()`: `t = sampleIndex / fs` **of that channel**.
  Index 0 of every channel is the same instant (session start). This is the rule that keeps ECG and SCG aligned.
- Ring buffers, DSP coefficients and decimation are per channel and use that channel's fs.
- Plots share an X axis in **seconds**, not in sample index.
- Markers refer to a reference channel and are converted to other channels with `round(t × fs)`.
- Export: one wide CSV when all fs are equal, one file per channel otherwise (`docs/data-formats.md`).
- BLE: one channel per `DATA` packet, with its own `seq` and `firstSampleIndex` (`docs/ble-protocol.md`).
- **Risk:** with two independent oscillators the channels drift apart (for example 100 ppm ≈ 60 ms after 10 min,
  which is the same size as the R→AO delay we want to measure). The firmware must provide a common time reference.
  This is open question Q9. Until it is answered, sources assume no drift and no start offset.
