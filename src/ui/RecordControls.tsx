import { useEffect, useState } from 'react'
import { getRecordingElapsedSeconds, startRecording, stopRecording } from '../state/session.ts'
import { useAppStore } from '../state/store.ts'
import { formatDuration } from './formatDuration.ts'
import { RecordIcon, StopIcon } from './icons.tsx'

// Record / Stop recording, with the time recorded so far. The markers appear under the bar while recording
// (MarkerBar), so every marker on screen is saved.
export function RecordControls() {
  const state = useAppStore((s) => s.status.state)
  const isRecording = useAppStore((s) => s.recordingName !== null)

  if (isRecording) {
    return (
      <>
        <button
          type="button"
          // Red like Rec: on a phone only the icon shows, and it must not look like the Stop of the source.
          className="icon-button record-button"
          onClick={() => void stopRecording()}
          aria-label="Stop recording"
          title="Stop recording"
        >
          <StopIcon />
          <span className="btn-text">Stop rec</span>
        </button>
        <RecordingTimer />
      </>
    )
  }

  return (
    // Recording keeps running while the display is paused: Pause only freezes the plot.
    <button
      type="button"
      className="icon-button record-button"
      onClick={startRecording}
      disabled={state !== 'running'}
      aria-label="Record"
      title="Record (save the signal in this browser)"
    >
      <RecordIcon />
      <span className="btn-text">Rec</span>
    </button>
  )
}

// Seconds of signal recorded so far, refreshed twice a second (not every frame: it is only text).
function RecordingTimer() {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setSeconds(getRecordingElapsedSeconds()), 500)
    return () => clearInterval(timer)
  }, [])

  return (
    <span className="rec-badge" data-testid="rec-timer" title="Recorded so far">
      <span className="rec-dot" aria-hidden="true" />
      {formatDuration(seconds)}
    </span>
  )
}
