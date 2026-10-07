// UI state (zustand). Samples never go through here: they flow source → ring buffer → plot (src/state/session.ts).
import { create } from 'zustand'
import type { SourceStatus } from '../core/types.ts'
import type { RecordingEntry } from '../io/manifest.ts'

export type WindowSeconds = 5 | 10

/** Value of the recording picker when the user opened a file from disk. */
export const DISK_FILE = 'disk-file'

interface AppState {
  recordings: RecordingEntry[]
  selectedId: string // a RecordingEntry id, DISK_FILE, or '' when nothing is available
  diskFile: File | null
  status: SourceStatus
  sourceInfo: string // e.g. "ecg_subject01 · 3000 Hz · 72,000 samples (24.0 s)"
  paused: boolean // display only: acquisition keeps running
  windowSeconds: WindowSeconds

  setRecordings: (recordings: RecordingEntry[]) => void
  selectRecording: (id: string) => void
  setDiskFile: (file: File) => void
  setStatus: (status: SourceStatus) => void
  setSourceInfo: (info: string) => void
  setPaused: (paused: boolean) => void
  setWindowSeconds: (seconds: WindowSeconds) => void
}

export const useAppStore = create<AppState>()((set) => ({
  recordings: [],
  selectedId: '',
  diskFile: null,
  status: { state: 'idle' },
  sourceInfo: '',
  paused: false,
  windowSeconds: 10,

  // Keeps the current choice if it still exists, otherwise picks the first ECG recording (M1 is ECG only).
  setRecordings: (recordings) =>
    set((state) => ({
      recordings,
      selectedId:
        state.selectedId !== '' &&
        (state.selectedId === DISK_FILE || recordings.some((r) => r.id === state.selectedId))
          ? state.selectedId
          : (recordings.find((r) => r.channel === 'ecg')?.id ?? ''),
    })),
  selectRecording: (id) => set({ selectedId: id }),
  setDiskFile: (file) => set({ diskFile: file, selectedId: DISK_FILE }),
  setStatus: (status) => set({ status }),
  setSourceInfo: (sourceInfo) => set({ sourceInfo }),
  setPaused: (paused) => set({ paused }),
  setWindowSeconds: (windowSeconds) => set({ windowSeconds }),
}))
