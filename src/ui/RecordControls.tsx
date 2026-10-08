import { useEffect, useState } from 'react'
import { MARKER_PRESETS } from '../recording/markers.ts'
import {
  addMarker,
  getRecordingElapsedSeconds,
  startRecording,
  stopRecording,
} from '../state/session.ts'
import { useAppStore } from '../state/store.ts'
import { formatDuration } from './formatDuration.ts'

// Record / Stop recording, and markers (only while recording, so every marker on screen is saved).
export function RecordControls() {
  const state = useAppStore((s) => s.status.state)
  const recordingName = useAppStore((s) => s.recordingName)
  const lastMarker = useAppStore((s) => s.lastMarker)
  const [label, setLabel] = useState('')
  const isRecording = recordingName !== null

  return (
    <section className="controls" aria-label="Recording">
      {isRecording ? (
        <button type="button" onClick={() => void stopRecording()}>
          <span aria-hidden="true">■</span> Stop recording
        </button>
      ) : (
        // Recording keeps running while the display is paused: Pause only freezes the plot.
        <button type="button" onClick={startRecording} disabled={state !== 'running'}>
          <span aria-hidden="true" className="record-dot">
            ●
          </span>{' '}
          Record
        </button>
      )}
      {isRecording && <RecordingTimer />}
      <label>
        Marker
        {/* A preset from the list or any text. */}
        <input
          type="text"
          className="text-input"
          list="marker-presets"
          placeholder="label"
          value={label}
          disabled={!isRecording}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addMarker(label)
          }}
        />
      </label>
      <datalist id="marker-presets">
        {MARKER_PRESETS.map((preset) => (
          <option key={preset} value={preset} />
        ))}
      </datalist>
      <button type="button" onClick={() => addMarker(label)} disabled={!isRecording}>
        Add marker
      </button>
      {lastMarker !== null && (
        <span className="marker-feedback" data-testid="last-marker">
          Marker "{lastMarker.label}" at {lastMarker.timeS.toFixed(4)} s (sample{' '}
          {lastMarker.sampleIndex})
        </span>
      )}
    </section>
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
    <span className="rec-badge" data-testid="rec-timer">
      ● REC {formatDuration(seconds)}
    </span>
  )
}
