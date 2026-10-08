import { useEffect, useState } from 'react'
import type { SavedSession } from '../recording/types.ts'
import {
  exportSavedSession,
  refreshSavedSessions,
  removeSavedSession,
} from '../state/savedSessions.ts'
import { useAppStore } from '../state/store.ts'
import { formatDuration } from './formatDuration.ts'

const BYTES_PER_SAMPLE = 4 // Float32

// The sessions saved in this browser (IndexedDB), with CSV export and delete.
export function SavedSessionList() {
  const sessions = useAppStore((s) => s.savedSessions)
  const recordingName = useAppStore((s) => s.recordingName)
  const [exportingId, setExportingId] = useState<number | null>(null)

  useEffect(() => {
    void refreshSavedSessions()
  }, [])

  async function handleExport(session: SavedSession) {
    setExportingId(session.id)
    await exportSavedSession(session)
    setExportingId(null)
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
                return (
                  <tr key={session.id} data-testid="saved-session">
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
                      {session.channels.map((c) => `${c.id.toUpperCase()} ${c.fs} Hz`).join(' · ')}
                    </td>
                    <td>{session.markers.length}</td>
                    <td>{sizeMegabytes(session).toFixed(1)} MB</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        onClick={() => void handleExport(session)}
                        disabled={isActive || exportingId !== null}
                      >
                        {exportingId === session.id ? 'Exporting…' : 'Export CSV'}
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
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
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
