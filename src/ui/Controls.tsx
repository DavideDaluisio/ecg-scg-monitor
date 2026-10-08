import { startReplay, startSynthetic, stopSession } from '../state/session.ts'
import { getReplayInputs, useAppStore, type WindowSeconds } from '../state/store.ts'
import { SourcePicker } from './SourcePicker.tsx'

// Source choice, Start / Pause / Stop and the length of the visible window.
export function Controls() {
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
      <SourcePicker disabled={isActive} />
      <section className="controls" aria-label="Controls">
        <button type="button" onClick={handleStart} disabled={isActive || !canStart}>
          Start
        </button>
        {/* Pause freezes the display of every panel: the source keeps running. Resume jumps back to live. */}
        <button type="button" onClick={() => setPaused(!paused)} disabled={state !== 'running'}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" onClick={handleStop} disabled={state === 'idle'}>
          Stop
        </button>
        <label>
          Window
          <select
            value={windowSeconds}
            onChange={(event) => setWindowSeconds(Number(event.target.value) as WindowSeconds)}
          >
            <option value={5}>5 s</option>
            <option value={10}>10 s</option>
          </select>
        </label>
      </section>
    </>
  )
}
