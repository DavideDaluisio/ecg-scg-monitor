// Actions on the saved sessions (list, export, rename a marker, delete), used by the UI. Errors are shown in the UI,
// not thrown.
import { buildCsvExport } from '../io/csvExport.ts'
import { downloadFile } from '../io/download.ts'
import type { ExportChannel } from '../io/exportShared.ts'
import { buildXlsxExport, XLSX_MIME_TYPE } from '../io/xlsxExport.ts'
import { zipToBlob } from '../io/zip.ts'
import {
  deleteSavedSession,
  getAppDb,
  listSavedSessions,
  loadChannelSamples,
  renameSavedMarker,
} from '../recording/db.ts'
import { cleanMarkerLabel } from '../recording/markers.ts'
import type { SavedSession } from '../recording/types.ts'
import { useAppStore } from './store.ts'

/** `xlsx`: one Excel file for people. `csv`: for Python, MATLAB and scripts/check_export.py. */
export type ExportFormat = 'xlsx' | 'csv'

/** Reads the list of saved sessions from IndexedDB into the store. */
export async function refreshSavedSessions(): Promise<void> {
  try {
    const db = await getAppDb()
    useAppStore.getState().setSavedSessions(await listSavedSessions(db))
  } catch (error) {
    showError('Could not read the saved sessions', error)
  }
}

/**
 * Downloads the session as an Excel file (Info, Markers and data sheets), or as CSV (one file, or one per channel
 * when their fs differ).
 */
export async function exportSavedSession(
  session: SavedSession,
  format: ExportFormat,
): Promise<void> {
  try {
    const channels = await loadExportChannels(session)
    if (format === 'xlsx') {
      const workbook = buildXlsxExport(session, channels)
      const blob = await zipToBlob(workbook.entries, XLSX_MIME_TYPE, yieldToBrowser)
      downloadFile(workbook.fileName, [blob], XLSX_MIME_TYPE)
      return
    }
    for (const file of buildCsvExport(session, channels)) {
      const blobs: Blob[] = []
      for (const part of file.parts) {
        // In its own Blob, a part leaves JavaScript memory (the browser may even keep it on disk).
        blobs.push(new Blob([part]))
        // Let the browser draw the plots and run the source between two parts: a live session keeps going
        // while a long export is built (principle 7).
        await yieldToBrowser()
      }
      downloadFile(file.fileName, blobs)
    }
  } catch (error) {
    showError(`Could not export ${session.name}`, error)
  }
}

/**
 * Renames one marker of a saved session that is no longer recording. An empty name changes nothing.
 * (While recording, the live session renames it: `renameLiveMarker` in session.ts.)
 */
export async function renameMarkerOfSavedSession(
  session: SavedSession,
  markerIndex: number,
  label: string,
): Promise<void> {
  const text = cleanMarkerLabel(label)
  if (text === '') return
  try {
    await renameSavedMarker(await getAppDb(), session.id, markerIndex, text)
  } catch (error) {
    showError(`Could not rename the marker of ${session.name}`, error)
  }
  await refreshSavedSessions()
}

export async function removeSavedSession(session: SavedSession): Promise<void> {
  try {
    await deleteSavedSession(await getAppDb(), session)
  } catch (error) {
    showError(`Could not delete ${session.name}`, error)
  }
  await refreshSavedSessions()
}

async function loadExportChannels(session: SavedSession): Promise<ExportChannel[]> {
  const db = await getAppDb()
  return Promise.all(
    session.channels.map(async (channel) => ({
      id: channel.id,
      fs: channel.fs,
      firstSampleIndex: channel.firstSampleIndex,
      samples: await loadChannelSamples(db, session.id, channel),
    })),
  )
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function showError(what: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  useAppStore.getState().setStorageError(`${what}: ${message}`)
}
