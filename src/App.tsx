import { useEffect } from 'react'
import { loadRecordings } from './io/manifest.ts'
import { useAppStore } from './state/store.ts'
import { ChannelPanel } from './ui/ChannelPanel.tsx'
import { Controls } from './ui/Controls.tsx'
import { StatusBadge } from './ui/StatusBadge.tsx'

// M1: the ECG replays live. SCG arrives in M2; see docs/roadmap.md.
function App() {
  const status = useAppStore((s) => s.status)
  const sourceInfo = useAppStore((s) => s.sourceInfo)
  const setRecordings = useAppStore((s) => s.setRecordings)

  useEffect(() => {
    void loadRecordings(`${import.meta.env.BASE_URL}samples/`).then(setRecordings)
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
        <ChannelPanel title="ECG" unit="mV" channel="ecg" live />
        <ChannelPanel
          title="SCG"
          unit="mV"
          channel="scg"
          live={false}
          placeholder="SCG arrives in M2"
        />
      </main>
    </div>
  )
}

export default App
