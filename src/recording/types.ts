// What a saved session looks like in IndexedDB (rules: src/recording/CLAUDE.md, layout: docs/data-formats.md).
import type { ChannelId } from '../core/types.ts'

/** A label placed on one sample of the reference channel (highest fs, ECG if equal). */
export interface Marker {
  channel: ChannelId
  sampleIndex: number // on the live session's sample clock of `channel`
  label: string
}

/** One recorded channel. Its samples are stored in chunks, the first one starting at firstSampleIndex. */
export interface SavedChannel {
  id: ChannelId
  fs: number
  firstSampleIndex: number // live session index of the first recorded sample (indices are never re-based)
  sampleCount: number // samples stored so far (updated with every chunk)
}

/** Where the samples came from. */
export type SavedSessionSource = 'replay' | 'synthetic'

/**
 * Everything about a saved session except its samples. A saved session is the part of a live session between
 * Record and Stop recording.
 */
export interface SavedSession {
  id: number // assigned by IndexedDB
  name: string // e.g. "session_2026-10-08_15-04-05" (date and time, never a person's name)
  startIso: string // wall-clock time of sample index 0 (when Start was pressed), informative only
  recordedAtIso: string // wall-clock time when Record was pressed, informative only
  source: SavedSessionSource
  description: string // the source info shown under the controls
  settings: Record<string, string | number | boolean> // e.g. the synthetic HR and R→AO delay
  channels: SavedChannel[]
  markers: Marker[]
  // 'recording' after the recording is over means the tab was closed while recording: the data is still usable.
  status: 'recording' | 'complete'
}

/** A piece of one channel's samples (1 s, the last one can be shorter). */
export interface SampleChunk {
  sessionId: number
  channel: ChannelId
  firstSampleIndex: number
  samples: Float32Array // volts, NaN = missing sample
}
