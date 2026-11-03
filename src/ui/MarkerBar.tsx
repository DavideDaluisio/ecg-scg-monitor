import { useState } from 'react'
import { MARKER_PRESETS } from '../recording/markers.ts'
import { addMarker, renameLiveMarker } from '../state/session.ts'
import { useAppStore } from '../state/store.ts'
import { MarkerTable } from './MarkerTable.tsx'

// The marker row under the top bar. TopBar shows it only while recording, so every marker placed is saved.
// One button per marker type (one click = a marker at that instant, for precise timing), "+" for any other name,
// and the markers of the recording behind a "Markers (n)" toggle, so a long list does not push the plots down.
export function MarkerBar() {
  const recordingMarkers = useAppStore((s) => s.recordingMarkers)
  const customTypes = useAppStore((s) => s.customMarkerTypes)
  const removeCustomType = useAppStore((s) => s.removeCustomMarkerType)
  const [listOpen, setListOpen] = useState(false)

  return (
    <section className="marker-bar" aria-label="Markers">
      <div className="marker-buttons">
        {MARKER_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="marker-button"
            onClick={() => addMarker(preset)}
          >
            {preset}
          </button>
        ))}
        {customTypes.map((type) => (
          <span key={type} className="custom-marker-type">
            <button type="button" className="marker-button" onClick={() => addMarker(type)}>
              {type}
            </button>
            {/* Removes the button only: markers already placed keep their name. */}
            <button
              type="button"
              className="remove-type-button"
              onClick={() => removeCustomType(type)}
              aria-label={`Remove marker type ${type}`}
              title="Remove this button"
            >
              ×
            </button>
          </span>
        ))}
        <NewMarkerName />
        <button
          type="button"
          className="markers-toggle"
          onClick={() => setListOpen(!listOpen)}
          disabled={recordingMarkers.length === 0}
          aria-expanded={listOpen}
        >
          Markers ({recordingMarkers.length}) <span aria-hidden="true">{listOpen ? '▴' : '▾'}</span>
        </button>
      </div>
      {listOpen && recordingMarkers.length > 0 && (
        <div className="marker-list">
          <MarkerTable
            markers={recordingMarkers}
            onRename={renameLiveMarker}
            label="Markers of this recording"
          />
        </div>
      )}
    </section>
  )
}

// "+" opens a field for a name that has no button yet. Enter places the marker and turns the name into a button,
// so the same event is one click next time (presets and known names are kept once). Esc closes the field.
function NewMarkerName() {
  const addCustomType = useAppStore((s) => s.addCustomMarkerType)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  function close() {
    setName('')
    setOpen(false)
  }

  function addNamedMarker() {
    addMarker(name) // an empty name gives a marker called "marker"
    addCustomType(name)
    close()
  }

  if (!open) {
    return (
      <button
        type="button"
        className="marker-button"
        onClick={() => setOpen(true)}
        aria-label="New marker name"
        title="Marker with another name"
      >
        +
      </button>
    )
  }

  return (
    <input
      type="text"
      className="text-input"
      aria-label="Other name"
      placeholder="Other name, Enter"
      value={name}
      // The user just pressed "+": typing goes straight into the field.
      autoFocus
      onChange={(event) => setName(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') addNamedMarker()
        if (event.key === 'Escape') close()
      }}
      // Tapping elsewhere without Enter (e.g. on a phone) cancels, like Esc.
      onBlur={close}
    />
  )
}
