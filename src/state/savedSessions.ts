// Actions on the saved sessions (list, export, delete), used by the UI. Errors are shown in the UI, not thrown.
import { buildCsvExport } from '../io/csvExport.ts'
import { downloadFile } from '../io/download.ts'
import {
  deleteSavedSession,
  getAppDb,
  listSavedSessions,
  loadChannelSamples,
} from '../recording/db.ts'
import type { SavedSession } from '../recording/types.ts'
import { useAppStore } from './store.ts'

/** Reads the list of saved sessions from IndexedDB into the store. */
export async function refreshSavedSessions(): Promise<void> {
  try {
    const db = await getAppDb()
    useAppStore.getState().setSavedSessions(await listSavedSessions(db))
  } catch (error) {
    showError('Could not read the saved sessions', error)
  }
}

/** Downloads the session as CSV: one file, or one per channel when their fs differ. */
export async function exportSavedSession(session: SavedSession): Promise<void> {
  try {
    const db = await getAppDb()
    const channels = await Promise.all(
      session.channels.map(async (channel) => ({
        id: channel.id,
        fs: channel.fs,
        firstSampleIndex: channel.firstSampleIndex,
        samples: await loadChannelSamples(db, session.id, channel),
      })),
    )
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

export async function removeSavedSession(session: SavedSession): Promise<void> {
  try {
    await deleteSavedSession(await getAppDb(), session)
  } catch (error) {
    showError(`Could not delete ${session.name}`, error)
  }
  await refreshSavedSessions()
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function showError(what: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  useAppStore.getState().setStorageError(`${what}: ${message}`)
}
