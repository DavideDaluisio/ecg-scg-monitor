import { startReplay, startSynthetic, stopSession } from '../state/session.ts'
import { getReplayInputs, useAppStore, type WindowSeconds } from '../state/store.ts'
import { PauseIcon, PlayIcon, StopIcon } from './icons.tsx'

const WINDOW_CHOICES: WindowSeconds[] = [5, 10]

// Playback buttons of the top bar: Start (or Stop while a source runs), Pause / Resume, and the visible window.
// Each button has its full name in aria-label and title, because on a phone only the icon is shown.
export function Controls({ onStart }: { onStart: () => void }) {
  const state = useAppStore((s) => s.status.state)
  const paused = useAppStore((s) => s.paused)
  const windowSeconds = useAppStore((s) => s.windowSeconds)
  const setPaused = useAppStore((s) => s.setPaused)
  const setWindowSeconds = useAppStore((s) => s.setWindowSeconds)
  // Replay needs at least one channel that is not "None".
  const canStart = useAppStore((s) => s.sourceKind === 'synthetic' || getReplayInputs(s).length > 0)

  const isActive = state === 'connecting' || state === 'running'

  function handleStart() {
    const store = useAppStore.getState()
    setPaused(false)
    onStart()
    // Both start functions stop the previous session first, so Start also works after an error or an end.
    if (store.sourceKind === 'synthetic') {
      void startSynthetic(store.syntheticSettings)
      return
    }
    void startReplay(getReplayInputs(store))
  }

  function handleStop() {
    setPaused(false)
    stopSession()
  }

  return (
    <>
      {isActive ? (
        <button
          type="button"
          className="icon-button"
          onClick={handleStop}
          aria-label="Stop"
          title="Stop"
        >
          <StopIcon />
          <span className="btn-text">Stop</span>
        </button>
      ) : (
        <button
          type="button"
          className="icon-button primary"
          onClick={handleStart}
          disabled={!canStart}
          aria-label="Start"
          title="Start"
        >
          <PlayIcon />
          <span className="btn-text">Start</span>
        </button>
      )}
      {/* Pause freezes the display of every panel: the source keeps running. Resume jumps back to live. */}
      {state === 'running' && (
        <button
          type="button"
          // Highlighted while paused, so a frozen plot is never mistaken for a flat signal.
          className={`icon-button${paused ? ' active' : ''}`}
          onClick={() => setPaused(!paused)}
          aria-label={paused ? 'Resume' : 'Pause'}
          title={paused ? 'Resume (back to live)' : 'Pause the display (acquisition goes on)'}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
          <span className="btn-text">{paused ? 'Resume' : 'Pause'}</span>
        </button>
      )}
      <div className="segmented" role="group" aria-label="Window" title="Visible window">
        {WINDOW_CHOICES.map((seconds) => (
          <button
            key={seconds}
            type="button"
            aria-pressed={windowSeconds === seconds}
            onClick={() => setWindowSeconds(seconds)}
          >
            {seconds} s
          </button>
        ))}
      </div>
    </>
  )
}
