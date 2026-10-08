// UI state (zustand). Samples never go through here: they flow source → ring buffer → plot (src/state/session.ts).
import { create } from 'zustand'
import type { ChannelId, SourceStatus } from '../core/types.ts'
import type { RecordingEntry } from '../io/manifest.ts'

export type WindowSeconds = 5 | 10

/** Where the samples come from: recorded files (one per channel) or the synthetic generator. */
export type SourceKind = 'replay' | 'synthetic'

/** Value of a channel's recording picker when the user opened a file from disk for that channel. */
export const DISK_FILE = 'disk-file'
/** Value of a channel's recording picker when that channel plays nothing. */
export const NO_RECORDING = ''

const CHANNELS: ChannelId[] = ['ecg', 'scg']

/** Settings of the synthetic source, as typed in the form (the delay in ms, like on the plot). */
export interface SyntheticSettings {
  heartRateBpm: number
  rToAoMs: number
  ecgFs: number
  scgFs: number
  noise: boolean
}

/** What one channel replays: a recording listed in a manifest or a file opened from disk. */
export type ReplayInput =
  | { kind: 'entry'; channel: ChannelId; entry: RecordingEntry }
  | { kind: 'file'; channel: ChannelId; file: File }

interface AppState {
  recordings: RecordingEntry[]
  sourceKind: SourceKind
  // Per channel: a RecordingEntry id, DISK_FILE or NO_RECORDING.
  replayChoices: Record<ChannelId, string>
  // The last file opened from disk for each channel (by the "Open ECG/SCG file…" button).
  diskFiles: Record<ChannelId, File | null>
  syntheticSettings: SyntheticSettings
  status: SourceStatus
  sourceInfo: string // e.g. "ecg_subject01 · 3000 Hz · 72,000 samples (24.0 s)"
  // Channels of the current or last session: their panels show a plot. Kept after Stop, so the last frame stays.
  sessionChannels: ChannelId[]
  // True when the session plays an ECG and an SCG file that were not recorded at the same time.
  notSimultaneous: boolean
  paused: boolean // display only: acquisition keeps running
  windowSeconds: WindowSeconds

  setRecordings: (recordings: RecordingEntry[]) => void
  setSourceKind: (kind: SourceKind) => void
  setReplayChoice: (channel: ChannelId, choice: string) => void
  setDiskFile: (channel: ChannelId, file: File) => void
  setSyntheticSettings: (changes: Partial<SyntheticSettings>) => void
  setStatus: (status: SourceStatus) => void
  setSourceInfo: (info: string) => void
  setSessionChannels: (channels: ChannelId[]) => void
  setNotSimultaneous: (notSimultaneous: boolean) => void
  setPaused: (paused: boolean) => void
  setWindowSeconds: (seconds: WindowSeconds) => void
}

export const useAppStore = create<AppState>()((set) => ({
  recordings: [],
  sourceKind: 'replay',
  replayChoices: { ecg: NO_RECORDING, scg: NO_RECORDING },
  diskFiles: { ecg: null, scg: null },
  syntheticSettings: { heartRateBpm: 72, rToAoMs: 80, ecgFs: 3000, scgFs: 3000, noise: false },
  status: { state: 'idle' },
  sourceInfo: '',
  sessionChannels: [],
  notSimultaneous: false,
  paused: false,
  windowSeconds: 10,

  setRecordings: (recordings) =>
    set((state) => ({
      recordings,
      replayChoices: {
        ecg: keepOrDefaultChoice(state.replayChoices.ecg, 'ecg', recordings),
        scg: keepOrDefaultChoice(state.replayChoices.scg, 'scg', recordings),
      },
    })),
  setSourceKind: (sourceKind) => set({ sourceKind }),
  setReplayChoice: (channel, choice) =>
    set((state) => ({ replayChoices: { ...state.replayChoices, [channel]: choice } })),
  setDiskFile: (channel, file) =>
    set((state) => ({
      diskFiles: { ...state.diskFiles, [channel]: file },
      replayChoices: { ...state.replayChoices, [channel]: DISK_FILE },
    })),
  setSyntheticSettings: (changes) =>
    set((state) => ({ syntheticSettings: { ...state.syntheticSettings, ...changes } })),
  setStatus: (status) => set({ status }),
  setSourceInfo: (sourceInfo) => set({ sourceInfo }),
  setSessionChannels: (sessionChannels) => set({ sessionChannels }),
  setNotSimultaneous: (notSimultaneous) => set({ notSimultaneous }),
  setPaused: (paused) => set({ paused }),
  setWindowSeconds: (windowSeconds) => set({ windowSeconds }),
}))

// Keeps a channel's choice if it still exists, otherwise picks the first recording of that channel (or none).
// So by default the first ECG and the first SCG recording play together.
function keepOrDefaultChoice(
  choice: string,
  channel: ChannelId,
  recordings: RecordingEntry[],
): string {
  if (choice === DISK_FILE) return choice
  if (recordings.some((r) => r.id === choice && r.channel === channel)) return choice
  return recordings.find((r) => r.channel === channel)?.id ?? NO_RECORDING
}

/** The channels to replay, from the pickers. Empty when every channel is set to "None". */
export function getReplayInputs(
  state: Pick<AppState, 'recordings' | 'replayChoices' | 'diskFiles'>,
): ReplayInput[] {
  const inputs: ReplayInput[] = []
  for (const channel of CHANNELS) {
    const choice = state.replayChoices[channel]
    const file = state.diskFiles[channel]
    if (choice === DISK_FILE) {
      if (file !== null) inputs.push({ kind: 'file', channel, file })
      continue
    }
    const entry = state.recordings.find((r) => r.id === choice && r.channel === channel)
    if (entry) inputs.push({ kind: 'entry', channel, entry })
  }
  return inputs
}
