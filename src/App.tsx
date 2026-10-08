import { useEffect } from 'react'
import { loadRecordings } from './io/manifest.ts'
import { useAppStore } from './state/store.ts'
import { ChannelPanel } from './ui/ChannelPanel.tsx'
import { Controls } from './ui/Controls.tsx'
import { SavedSessionList } from './ui/SavedSessionList.tsx'
import { StatusBadge } from './ui/StatusBadge.tsx'

// ECG and SCG play together in two stacked panels with the same time axis, like Fig. 1F of the paper
// (docs/roadmap.md). The source is one recording per channel or the synthetic generator. M4: the live session can
// be recorded with markers, and saved sessions are exported as CSV.
function App() {
  const status = useAppStore((s) => s.status)
  const sourceInfo = useAppStore((s) => s.sourceInfo)
  const notSimultaneous = useAppStore((s) => s.notSimultaneous)
  const storageError = useAppStore((s) => s.storageError)
  const setRecordings = useAppStore((s) => s.setRecordings)

  useEffect(() => {
    // Local (real) recordings exist only on the dev server of a lab computer, never in a build.
    void loadRecordings(`${import.meta.env.BASE_URL}samples/`, import.meta.env.DEV).then(
      setRecordings,
    )
  }, [setRecordings])

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>ECG/SCG Monitor</h1>
          <p className="subtitle">NJIT wireless cardiac patch · real-time view</p>
        </div>
        <StatusBadge />
      </header>

      <Controls />
      {status.state === 'error' && (
        <p className="error-message" role="alert">
          {status.error}
        </p>
      )}
      {storageError !== '' && (
        <p className="error-message" role="alert" data-testid="storage-error">
          {storageError}
        </p>
      )}
      {sourceInfo !== '' && <p className="source-info">{sourceInfo}</p>}
      {/* Two files recorded at different times can be shown together, but only as a demo. */}
      {notSimultaneous && (
        <p className="warning-message" role="note" data-testid="not-simultaneous">
          Not simultaneous: these ECG and SCG files were recorded at different times, so the delay
          between them means nothing.
        </p>
      )}

      <main className="panels">
        <ChannelPanel channel="ecg" />
        <ChannelPanel channel="scg" />
      </main>

      <SavedSessionList />
    </div>
  )
}

export default App
