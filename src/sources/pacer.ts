// Real-time pacing shared by the replay and synthetic sources (rules: src/sources/CLAUDE.md).
// A source asks "how many seconds of signal should exist by now?" on every tick and emits floor(seconds × fs)
// samples per channel. Using elapsed time, not a count of ticks, compensates timer drift.

// At most 1 s of signal per call. Browsers slow down timers in background tabs; when the tab comes back,
// the source continues from where it was instead of emitting a huge burst.
const MAX_CATCH_UP_S = 1

export class Pacer {
  private readonly now: () => number
  private startTimeMs = 0 // wall-clock instant that corresponds to t = 0 (sample index 0)
  private lastElapsedS = 0

  // `now` is a wall clock in milliseconds, used for pacing only (never as a sample timestamp).
  constructor(now: () => number) {
    this.now = now
  }

  /** The current instant becomes t = 0. */
  start(): void {
    this.startTimeMs = this.now()
    this.lastElapsedS = 0
  }

  /** Seconds of signal that should exist by now, never more than MAX_CATCH_UP_S beyond the previous call. */
  elapsedSeconds(): number {
    let elapsedS = (this.now() - this.startTimeMs) / 1000
    if (elapsedS - this.lastElapsedS > MAX_CATCH_UP_S) {
      const skippedS = elapsedS - this.lastElapsedS - MAX_CATCH_UP_S
      console.info(
        `Source fell behind by ${skippedS.toFixed(1)} s (tab in background?), continuing from here`,
      )
      elapsedS = this.lastElapsedS + MAX_CATCH_UP_S
      // Move the start instant so that "now" corresponds to elapsedS: the signal pauses instead of skipping.
      this.startTimeMs = this.now() - elapsedS * 1000
    }
    this.lastElapsedS = elapsedS
    return elapsedS
  }
}
