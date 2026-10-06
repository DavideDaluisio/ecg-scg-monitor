# ADR 0002 – Source status, sessions and pause semantics

Date: 2026-10-06 · Status: accepted

## Context
The first `DataSource` draft had only `start`, `stop` and `onBlock`. That is enough for file replay,
but a BLE source also needs to report connection loss, reconnection, packet loss and fatal errors,
and a file source needs to say when it has finished. We also had no rule for pause/resume or for what
happens to the sample index when the user switches source. These must be fixed before M1,
because the ring buffers, the recorder and the UI all depend on them.

## Decision
- `DataSource` gets `readonly status` and `onStatus(cb)`. `SourceStatus = { state, error?, linkQuality? }`,
  with `state` one of `idle | connecting | running | reconnecting | ended | error`.
  Full contract and transition diagram: `src/core/CLAUDE.md`.
- **Session = `start()` … `stop()`.** Every channel's sample index starts at 0 on every `start()` and only
  grows within the session (loops and BLE reconnects included). Switching source ends the session:
  ring buffers and DSP state are reset, any open recording is closed.
- **No pause in the source.** "Pause" in the UI freezes the display only. Acquisition and recording continue.
- Reconnects keep the session; missed samples become `NaN`. After 5 failed attempts the state is `error`.
- `linkQuality` is throttled to at most 1 update/s and is used only by the UI.

## Consequences
- Every source (replay, synthetic, BLE) has the same lifecycle, so the UI shows one status badge
  whatever the source is.
- A recording always has exactly one source and one clock per channel, so exported indices are unambiguous.
- Pausing a replay does not stop the file: on resume the display jumps back to live, like a bedside monitor.
  If "pause the file" is ever needed for analysis, it will be a replay-only control, not part of `DataSource`.
- Long BLE gaps produce many `NaN` samples. How the recorder stores very long gaps is decided in M5.
- Filling reconnect gaps assumes the device sample counter keeps running (open question #7).

## Alternatives considered
- `pause()`/`resume()` on `DataSource`: impossible to honor for BLE (the patch keeps streaming), so
  sources would behave differently behind the same interface.
- One index that keeps running across source switches: puts unrelated signals on one timeline and
  in one recording, with no benefit.
- Reporting problems only by rejecting promises or throwing errors: cannot express `reconnecting`,
  `ended` or ongoing packet loss.
