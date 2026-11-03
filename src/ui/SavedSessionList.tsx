import { Fragment, useEffect, useState } from 'react'
import { markerRecordingTimeS } from '../recording/markers.ts'
import type { SavedSession } from '../recording/types.ts'
import {
  exportSavedSession,
  refreshSavedSessions,
  removeSavedSession,
  renameMarkerOfSavedSession,
  type ExportFormat,
} from '../state/savedSessions.ts'
import { useAppStore, type MarkerRow } from '../state/store.ts'
import { formatDuration } from './formatDuration.ts'
import { MarkerTable } from './MarkerTable.tsx'

const BYTES_PER_SAMPLE = 4 // Float32
const COLUMN_COUNT = 6

// The sessions saved in this browser (IndexedDB): their markers (renamable), Excel or CSV export, and delete.
export function SavedSessionList() {
  const sessions = useAppStore((s) => s.savedSessions)
  const recordingName = useAppStore((s) => s.recordingName)
  // The export in progress: one at a time, so a long export does not run twice.
  const [exporting, setExporting] = useState<{ id: number; format: ExportFormat } | null>(null)
  // The session whose markers are shown under its row.
  const [openMarkersId, setOpenMarkersId] = useState<number | null>(null)

  useEffect(() => {
    void refreshSavedSessions()
  }, [])

  async function handleExport(session: SavedSession, format: ExportFormat) {
    setExporting({ id: session.id, format })
    await exportSavedSession(session, format)
    setExporting(null)
  }

  function exportLabel(session: SavedSession, format: ExportFormat, label: string) {
    return exporting?.id === session.id && exporting.format === format ? 'Exporting…' : label
  }

  function handleDelete(session: SavedSession) {
    const message = `Delete ${session.name}? Its samples and markers will be lost.`
    if (window.confirm(message)) void removeSavedSession(session)
  }

  return (
    <section className="saved-sessions" aria-label="Saved sessions">
      <h2>Saved sessions</h2>
      {sessions.length === 0 ? (
        <p className="placeholder">No saved session yet. Press Record while a source is running.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Session</th>
                <th>Duration</th>
                <th>Channels</th>
                <th>Markers</th>
                <th>Size</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const isActive = session.name === recordingName
                const markersOpen = openMarkersId === session.id && !isActive
                return (
                  <Fragment key={session.id}>
                    <tr data-testid="saved-session">
                      <td title={session.description}>
                        {session.name}
                        {session.status === 'recording' && (
                          // A session left in 'recording' that is not the active one: the tab was closed meanwhile.
                          <span className="session-note">
                            {isActive ? ' · recording…' : ' · interrupted'}
                          </span>
                        )}
                      </td>
                      <td>{formatDuration(durationSeconds(session))}</td>
                      <td>
                        {session.channels
                          .map((c) => `${c.id.toUpperCase()} ${c.fs} Hz`)
                          .join(' · ')}
                      </td>
                      <td>
                        {/* While recording, the markers are listed (and renamed) under the marker buttons. */}
                        <button
                          type="button"
                          className="markers-toggle"
                          onClick={() => setOpenMarkersId(markersOpen ? null : session.id)}
                          disabled={isActive || session.markers.length === 0}
                          aria-expanded={markersOpen}
                          aria-label={`Markers of ${session.name}: ${session.markers.length}`}
                        >
                          {session.markers.length}{' '}
                          <span aria-hidden="true">{markersOpen ? '▴' : '▾'}</span>
                        </button>
                      </td>
                      <td>{sizeMegabytes(session).toFixed(1)} MB</td>
                      <td className="row-actions">
                        <button
                          type="button"
                          onClick={() => void handleExport(session, 'xlsx')}
                          disabled={isActive || exporting !== null}
                          title="Excel file (.xlsx): Info, Markers and data sheets, easy to read"
                        >
                          {exportLabel(session, 'xlsx', 'Export Excel')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleExport(session, 'csv')}
                          disabled={isActive || exporting !== null}
                          title="CSV for Python, MATLAB and scripts/check_export.py"
                        >
                          {exportLabel(session, 'csv', 'Export CSV')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(session)}
                          disabled={isActive}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {markersOpen && (
                      <tr className="session-markers">
                        <td colSpan={COLUMN_COUNT}>
                          <MarkerTable
                            markers={markerRows(session)}
                            onRename={(index, label) =>
                              void renameMarkerOfSavedSession(session, index, label)
                            }
                            label={`Markers of ${session.name}`}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function markerRows(session: SavedSession): MarkerRow[] {
  return session.markers.map((marker) => ({
    label: marker.label,
    sampleIndex: marker.sampleIndex,
    timeS: markerRecordingTimeS(session.channels, marker),
  }))
}

// The longest recorded channel (channels may differ by a few samples).
function durationSeconds(session: SavedSession): number {
  let seconds = 0
  for (const channel of session.channels) {
    seconds = Math.max(seconds, channel.sampleCount / channel.fs)
  }
  return seconds
}

function sizeMegabytes(session: SavedSession): number {
  let samples = 0
  for (const channel of session.channels) samples += channel.sampleCount
  return (samples * BYTES_PER_SAMPLE) / 1e6
}
