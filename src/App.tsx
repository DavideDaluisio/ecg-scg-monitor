import { useEffect } from 'react'
import { loadRecordings } from './io/manifest.ts'
import { useAppStore } from './state/store.ts'
import { ChannelPanel } from './ui/ChannelPanel.tsx'
import { SavedSessionList } from './ui/SavedSessionList.tsx'
import { TopBar } from './ui/TopBar.tsx'

// ECG and SCG play together in two stacked panels with the same time axis, like Fig. 1F of the paper
// (docs/roadmap.md). The source is one recording per channel or the synthetic generator. M4: the live session can
// be recorded with markers, and saved sessions are exported as Excel (.xlsx) or CSV.
function App() {
  const status = useAppStore((s) => s.status)
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
      <TopBar />

      {/* Errors stay in full under the bar: they tell the user what to do. */}
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

      <main className="panels">
        <ChannelPanel channel="ecg" />
        <ChannelPanel channel="scg" />
      </main>

      <SavedSessionList />
    </div>
  )
}

export default App
