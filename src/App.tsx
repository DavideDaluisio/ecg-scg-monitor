import { ChannelPanel } from './ui/ChannelPanel.tsx'
import { Controls } from './ui/Controls.tsx'
import { StatusBadge } from './ui/StatusBadge.tsx'

// App shell (M0). The live plots arrive in M1 (ECG) and M2 (SCG); see docs/roadmap.md.
function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>ECG/SCG Monitor</h1>
          <p className="subtitle">NJIT wireless cardiac patch · real-time view</p>
        </div>
        <StatusBadge state="idle" />
      </header>

      <Controls />

      <main className="panels">
        <ChannelPanel title="ECG" unit="mV" />
        <ChannelPanel title="SCG" unit="mV" />
      </main>
    </div>
  )
}

export default App
