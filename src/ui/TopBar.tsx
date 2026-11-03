import { useState } from 'react'
import { useAppStore } from '../state/store.ts'
import { Controls } from './Controls.tsx'
import { SettingsIcon } from './icons.tsx'
import { MarkerBar } from './MarkerBar.tsx'
import { RecordControls } from './RecordControls.tsx'
import { SourcePicker } from './SourcePicker.tsx'
import { StatusBadge } from './StatusBadge.tsx'

const SOURCE_NAMES = { replay: 'Recordings', synthetic: 'Synthetic' } as const

const NOT_SIMULTANEOUS_HELP =
  'These ECG and SCG files were recorded at different times, so the delay between them means nothing.'

// The only row of controls above the plots: source, playback, window, Rec and the state of the source.
// The source settings open in a panel under the bar only when needed; the marker row appears only while recording.
export function TopBar() {
  const state = useAppStore((s) => s.status.state)
  const sourceKind = useAppStore((s) => s.sourceKind)
  const sourceInfo = useAppStore((s) => s.sourceInfo)
  const notSimultaneous = useAppStore((s) => s.notSimultaneous)
  const isRecording = useAppStore((s) => s.recordingName !== null)
  const [sourceOpen, setSourceOpen] = useState(false)

  const isActive = state === 'connecting' || state === 'running'

  return (
    <header className="top">
      <div className="topbar">
        <h1>ECG/SCG Monitor</h1>
        {/* One group, so that on a phone all the buttons go on the 2nd row, under the title and the state. */}
        <div className="topbar-controls">
          <button
            type="button"
            className={`icon-button${sourceOpen ? ' active' : ''}`}
            onClick={() => setSourceOpen(!sourceOpen)}
            aria-label="Source settings"
            aria-expanded={sourceOpen}
            // What is playing, e.g. "ecg_subject01 · 3000 Hz · …": no longer a line of its own.
            title={sourceInfo === '' ? 'Source settings' : sourceInfo}
          >
            <SettingsIcon />
            <span className="btn-text">{SOURCE_NAMES[sourceKind]}</span>
            <span aria-hidden="true">{sourceOpen ? '▴' : '▾'}</span>
          </button>
          {/* Start closes the panel, so the plots get the space back. */}
          <Controls onStart={() => setSourceOpen(false)} />
          <RecordControls />
        </div>
        <span className="topbar-end">
          {/* Two files recorded at different times can be shown together, but only as a demo. */}
          {notSimultaneous && (
            <span
              className="chip-warning"
              data-testid="not-simultaneous"
              title={NOT_SIMULTANEOUS_HELP}
            >
              ⚠ Not simultaneous
            </span>
          )}
          <StatusBadge />
        </span>
      </div>
      {sourceOpen && <SourcePicker disabled={isActive} />}
      {isRecording && <MarkerBar />}
    </header>
  )
}
