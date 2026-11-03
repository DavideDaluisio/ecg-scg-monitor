import { useState } from 'react'
import type { MarkerRow } from '../state/store.ts'

type Props = {
  markers: readonly MarkerRow[]
  // Called with the marker's position in the list and its new name. null: the markers cannot be renamed now.
  onRename: ((index: number, label: string) => void) | null
  label: string // what the table lists, for screen readers and tests
}

// The markers of one recording (# · seconds since Record · name), each one renamable in place:
// Rename → type → Enter or Save (Esc or Cancel keeps the old name).
export function MarkerTable({ markers, onRename, label }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState('')

  function startEditing(index: number) {
    setEditingIndex(index)
    setDraft(markers[index].label)
  }

  function save() {
    if (editingIndex !== null && onRename !== null) onRename(editingIndex, draft)
    setEditingIndex(null)
  }

  if (markers.length === 0) return <p className="placeholder">No markers in this recording.</p>

  return (
    <table className="marker-table" aria-label={label}>
      <thead>
        <tr>
          <th>#</th>
          {/* The same number as the "Time (s)" column of the Excel and CSV exports. */}
          <th>Time (s)</th>
          <th>Name</th>
          <th>
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {markers.map((marker, index) => {
          const isEditing = editingIndex === index
          return (
            // Markers are only added at the end and never removed, so the position is a stable key.
            <tr
              key={index}
              data-testid="marker-row"
              data-sample-index={marker.sampleIndex}
              title={`Sample ${marker.sampleIndex}`}
            >
              <td>{index + 1}</td>
              <td>{marker.timeS.toFixed(3)}</td>
              <td>
                {isEditing ? (
                  <input
                    type="text"
                    className="text-input"
                    aria-label={`New name of marker ${index + 1}`}
                    value={draft}
                    // The user just pressed Rename: typing goes straight into the field.
                    autoFocus
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') save()
                      if (event.key === 'Escape') setEditingIndex(null)
                    }}
                  />
                ) : (
                  marker.label
                )}
              </td>
              <td className="row-actions">
                {isEditing ? (
                  <>
                    <button type="button" onClick={save}>
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingIndex(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  onRename !== null && (
                    <button
                      type="button"
                      onClick={() => startEditing(index)}
                      aria-label={`Rename marker ${index + 1}`}
                    >
                      Rename
                    </button>
                  )
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
