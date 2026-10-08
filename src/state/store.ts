// UI state (zustand). Samples never go through here: they flow source → ring buffer → plot (src/state/session.ts).
import { create } from 'zustand'
import type { ChannelId, SourceStatus } from '../core/types.ts'
import type { RecordingEntry } from '../io/manifest.ts'

export type WindowSeconds = 5 | 10

/** Value of the recording picker when the user opened a file from disk. */
export const DISK_FILE = 'disk-file'

/** A file opened from disk, with the channel chosen by the button the user pressed. */
export interface DiskFile {
  file: File
  channel: ChannelId
}

interface AppState {
  recordings: RecordingEntry[]
  selectedId: string // a RecordingEntry id, DISK_FILE, or '' when nothing is available
  diskFile: DiskFile | null
  status: SourceStatus
  sourceInfo: string // e.g. "ecg_subject01 · 3000 Hz · 72,000 samples (24.0 s)"
  // Channels of the current or last session: their panels show a plot. Kept after Stop, so the last frame stays.
  sessionChannels: ChannelId[]
  paused: boolean // display only: acquisition keeps running
  windowSeconds: WindowSeconds

  setRecordings: (recordings: RecordingEntry[]) => void
  selectRecording: (id: string) => void
  setDiskFile: (file: File, channel: ChannelId) => void
  setStatus: (status: SourceStatus) => void
  setSourceInfo: (info: string) => void
  setSessionChannels: (channels: ChannelId[]) => void
  setPaused: (paused: boolean) => void
  setWindowSeconds: (seconds: WindowSeconds) => void
}

export const useAppStore = create<AppState>()((set) => ({
  recordings: [],
  selectedId: '',
  diskFile: null,
  status: { state: 'idle' },
  sourceInfo: '',
  sessionChannels: [],
  paused: false,
  windowSeconds: 10,

  // Keeps the current choice if it still exists, otherwise picks the first ECG recording (or the first one).
  setRecordings: (recordings) =>
    set((state) => ({
      recordings,
      selectedId:
        state.selectedId !== '' &&
        (state.selectedId === DISK_FILE || recordings.some((r) => r.id === state.selectedId))
          ? state.selectedId
          : ((recordings.find((r) => r.channel === 'ecg') ?? recordings[0])?.id ?? ''),
    })),
  selectRecording: (id) => set({ selectedId: id }),
  setDiskFile: (file, channel) => set({ diskFile: { file, channel }, selectedId: DISK_FILE }),
  setStatus: (status) => set({ status }),
  setSourceInfo: (sourceInfo) => set({ sourceInfo }),
  setSessionChannels: (sessionChannels) => set({ sessionChannels }),
  setPaused: (paused) => set({ paused }),
  setWindowSeconds: (windowSeconds) => set({ windowSeconds }),
}))
