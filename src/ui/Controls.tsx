import { startReplayFromEntry, startReplayFromFile, stopSession } from '../state/session.ts'
import { DISK_FILE, useAppStore, type WindowSeconds } from '../state/store.ts'
import { RecordingPicker } from './RecordingPicker.tsx'

// Recording picker, Start / Pause / Stop and the length of the visible window.
export function Controls() {
  const state = useAppStore((s) => s.status.state)
  const selectedId = useAppStore((s) => s.selectedId)
  const paused = useAppStore((s) => s.paused)
  const windowSeconds = useAppStore((s) => s.windowSeconds)
  const setPaused = useAppStore((s) => s.setPaused)
  const setWindowSeconds = useAppStore((s) => s.setWindowSeconds)

  const isActive = state === 'connecting' || state === 'running'

  function handleStart() {
    const { recordings, diskFile } = useAppStore.getState()
    setPaused(false)
    if (selectedId === DISK_FILE && diskFile !== null) {
      void startReplayFromFile(diskFile.file, diskFile.channel)
      return
    }
    const entry = recordings.find((r) => r.id === selectedId)
    if (entry) void startReplayFromEntry(entry)
  }

  function handleStop() {
    setPaused(false)
    stopSession()
  }

  return (
    <section className="controls" aria-label="Controls">
      <RecordingPicker disabled={isActive} />
      <button type="button" onClick={handleStart} disabled={isActive || selectedId === ''}>
        Start
      </button>
      {/* Pause freezes the display only: the source keeps running. Resume jumps back to live. */}
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
  )
}
