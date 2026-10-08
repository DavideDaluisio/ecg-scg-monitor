import { useEffect } from 'react'
import { loadRecordings } from './io/manifest.ts'
import { useAppStore } from './state/store.ts'
import { ChannelPanel } from './ui/ChannelPanel.tsx'
import { Controls } from './ui/Controls.tsx'
import { StatusBadge } from './ui/StatusBadge.tsx'

// M2: one ECG or SCG recording replays live in the panel of its channel. Both together arrive in M3
// (docs/roadmap.md).
function App() {
  const status = useAppStore((s) => s.status)
  const sourceInfo = useAppStore((s) => s.sourceInfo)
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
      {sourceInfo !== '' && <p className="source-info">{sourceInfo}</p>}

      <main className="panels">
        <ChannelPanel channel="ecg" />
        <ChannelPanel channel="scg" />
      </main>
    </div>
  )
}

export default App
