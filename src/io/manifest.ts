// Lists of recordings available for replay (format: docs/data-formats.md).
// public/samples/manifest.json is deployed; public/samples/local/manifest.json exists only on a lab computer.
import type { ChannelId } from '../core/types.ts'

export interface RecordingEntry {
  id: string // neutral id, e.g. "ecg_subject01"
  file: string // relative to public/samples/
  channel: ChannelId
  fs: number // informative only: the parser computes fs from the file itself
  samples: number
  durationS: number
  simultaneousWith: string | null // id of a recording made at the same time, if any
  isLocal: boolean // true for public/samples/local/ (real data, never deployed)
}

/** Reads the JSON of a manifest. Malformed entries are skipped with a warning instead of breaking the app. */
export function parseManifest(json: unknown, isLocal: boolean): RecordingEntry[] {
  const recordings = (json as { recordings?: unknown } | null)?.recordings
  if (!Array.isArray(recordings)) return []

  const entries: RecordingEntry[] = []
  for (const item of recordings) {
    const entry = item as Partial<RecordingEntry>
    const isValid =
      typeof entry.id === 'string' &&
      typeof entry.file === 'string' &&
      (entry.channel === 'ecg' || entry.channel === 'scg') &&
      typeof entry.fs === 'number' &&
      typeof entry.samples === 'number' &&
      typeof entry.durationS === 'number'
    if (!isValid) {
      console.warn('Skipping malformed manifest entry', item)
      continue
    }
    entries.push({
      id: entry.id!,
      file: entry.file!,
      channel: entry.channel!,
      fs: entry.fs!,
      samples: entry.samples!,
      durationS: entry.durationS!,
      simultaneousWith: typeof entry.simultaneousWith === 'string' ? entry.simultaneousWith : null,
      isLocal,
    })
  }
  return entries
}

/**
 * Public recordings first, then the local ones (if this computer has them).
 * `includeLocal` is false in production builds: the build deletes samples/local/, so asking for it would only
 * log a 404 error in the browser console.
 */
export async function loadRecordings(
  samplesUrl: string,
  includeLocal: boolean,
): Promise<RecordingEntry[]> {
  const publicEntries = parseManifest(await fetchJson(`${samplesUrl}manifest.json`), false)
  if (!includeLocal) return publicEntries
  const localEntries = parseManifest(await fetchJson(`${samplesUrl}local/manifest.json`), true)
  return [...publicEntries, ...localEntries]
}

// Returns null when the file is missing. The Vite dev server answers a missing file with index.html (status 200),
// so a JSON parse error also means "missing".
async function fetchJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return JSON.parse(await response.text())
  } catch {
    return null
  }
}
