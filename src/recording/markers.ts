// Marker helpers: preset labels, the channel a marker is placed on, label cleanup.
import type { ChannelInfo, ChannelId } from '../core/types.ts'

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

/** A label fit for one CSV cell: no line breaks, no spaces around it. */
export function cleanMarkerLabel(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
