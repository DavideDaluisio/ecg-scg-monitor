// Marker helpers: preset labels, the user's own marker types, the channel a marker is placed on, label cleanup,
// and the time of a marker since the start of its recording.
import type { ChannelInfo, ChannelId } from '../core/types.ts'
import type { Marker } from './types.ts'

// PLACEHOLDER(Q8): generic labels until the lab tells us which events its protocol marks. Free text always works.
export const MARKER_PRESETS = [
  'rest',
  'stand up',
  'sit down',
  'deep breath',
  'hold breath',
  'movement',
]

/**
 * The channel markers are placed on: the one with the highest fs (the finest time resolution), ECG if equal.
 * Returns null when the session has no channel.
 */
export function referenceChannel(channels: readonly ChannelInfo[]): ChannelId | null {
  let best: ChannelInfo | null = null
  for (const channel of channels) {
    if (best === null || channel.fs > best.fs || (channel.fs === best.fs && channel.id === 'ecg')) {
      best = channel
    }
  }
  return best?.id ?? null
}

/** A label fit for one CSV or Excel cell: no line breaks, no spaces around it. */
export function cleanMarkerLabel(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Where a channel's recording starts: enough to compute times since the start of the recording. */
interface RecordedChannelStart {
  id: ChannelId
  fs: number
  firstSampleIndex: number
}

/**
 * Time 0 of a recording, in seconds on the live session clock: the first recorded sample of any channel.
 * Each channel starts recording at its own next sample, so the channels may start a few samples apart.
 */
export function recordingZeroSeconds(channels: readonly RecordedChannelStart[]): number {
  if (channels.length === 0) return 0
  return Math.min(...channels.map((channel) => channel.firstSampleIndex / channel.fs))
}

/**
 * Seconds from the start of the recording to the marker: the same number as the "time_s" / "Time (s)" column of
 * the exports. NaN when the marker's channel is not in the recording (should not happen).
 */
export function markerRecordingTimeS(
  channels: readonly RecordedChannelStart[],
  marker: Marker,
): number {
  const channel = channels.find((c) => c.id === marker.channel)
  if (channel === undefined) return NaN
  return marker.sampleIndex / channel.fs - recordingZeroSeconds(channels)
}

/**
 * The user's marker types with `label` added at the end. The list is unchanged when the label is empty, a preset
 * or already in the list (case-insensitive: "Stand up" is the preset "stand up").
 */
export function addCustomMarkerType(types: readonly string[], label: string): string[] {
  const text = cleanMarkerLabel(label)
  const key = text.toLowerCase()
  const known = [...MARKER_PRESETS, ...types].some((type) => type.toLowerCase() === key)
  return text === '' || known ? [...types] : [...types, text]
}

/** The user's marker types without `label`. */
export function removeCustomMarkerType(types: readonly string[], label: string): string[] {
  return types.filter((type) => type !== label)
}
